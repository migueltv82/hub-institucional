import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localEndpoint } from './validateLocalDbAuthRecovery.mjs';
import { createLocalStack } from './localSupabaseStack.mjs';
import { bundleEdgeFunction, removeOwnedDirectory, edgeEnvironment, edgeCall, EDGE_RUNTIME_IMAGE } from './validateRecoveredEdge.mjs';

// I2f/I2g: create_tenant_with_admin y create_or_assign_institution_user con GoTrue y Edge Runtime reales. Si algo falla despues de crear la institucion,
// no queda nada (ni institucion ni usuario nuevo), y un email existente nunca se degrada, promueve ni desbloquea.

const ORIGIN = 'http://127.0.0.1:4173';

// Fallas inducidas solo en la base descartable: el alta del usuario Auth y la membresia owner.
export const FAILURE_TRIGGERS_SQL = `create or replace function public.i2f_fail_auth() returns trigger language plpgsql as $$
begin
  if new.email like '%-fail-auth@example.invalid' then raise exception 'I2F_INDUCED_AUTH_FAILURE'; end if;
  return new;
end $$;
create trigger i2f_fail_auth before insert on auth.users for each row execute function public.i2f_fail_auth();
create or replace function public.i2f_fail_membership() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.institutions i where i.id = new.institution_id and i.slug like '%-fail-member') then
    raise exception 'I2F_INDUCED_MEMBERSHIP_FAILURE';
  end if;
  return new;
end $$;
create trigger i2f_fail_membership before insert on public.memberships for each row execute function public.i2f_fail_membership();`;

// AUD.I2f: demoras (y una falla demorada) en la membresia, solo para slugs sinteticos de estas pruebas.
export const AUDIT_DELAY_TRIGGERS_SQL = `create or replace function public.i2f_audit_delay() returns trigger language plpgsql as $$
declare v_slug text;
begin
  select i.slug into v_slug from public.institutions i where i.id = new.institution_id;
  if v_slug like '%-slow-fail' then perform pg_sleep(6); raise exception 'AUDIT_I2F_DELAYED_FAILURE'; end if;
  if v_slug like '%-slow-ok' or v_slug like '%-demote' then perform pg_sleep(4); end if;
  return new;
end $$;
create trigger i2f_audit_delay before insert on public.memberships for each row execute function public.i2f_audit_delay();`;

export function tenantPayload(run, label, overrides = {}) {
  assert.match(run, /^[a-f0-9]{16}$/); assert.match(label, /^[a-z0-9-]+$/);
  return {
    action: 'create_tenant_with_admin',
    institution_name: `Synthetic I2f ${label}`,
    institution_slug: `${run}-${label}`,
    admin_email: `${run}-${label}@example.invalid`,
    admin_password: randomBytes(16).toString('hex'),
    ...overrides,
  };
}

export async function main() {
  const report = { staging: 'NONE', production: 'NONE', edgeRuntimeImage: EDGE_RUNTIME_IMAGE };
  let stack, bundle, step = 'local stack';
  try {
    stack = await createLocalStack({ label: 'hub.tenant-creation', report });
    const { sql, run } = stack;
    step = 'Edge Runtime';
    bundle = await bundleEdgeFunction('admin-users');
    const edgePort = stack.startContainer(`${stack.database}_edge`, EDGE_RUNTIME_IMAGE, edgeEnvironment({ gateway: stack.names.gateway, anonKey: stack.anonKey, serviceKey: stack.serviceKey, origin: ORIGIN }), 9000,
      ['--mount', `type=bind,source=${resolve(bundle, 'admin-users')},target=/home/deno/functions/admin-users,readonly`], ['start', '--main-service', '/home/deno/functions/admin-users', '-p', '9000']);
    await stack.waitFor(async () => (await fetch(localEndpoint(edgePort, '/'), { method: 'OPTIONS', headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(1000), redirect: 'error' })).status === 200, `${stack.database}_edge`);

    step = 'storage gateway like Production';
    // Produccion tiene el gateway de Storage y el registro de recursos al crear la institucion (D1).
    sql(readFileSync(resolve('supabase/security/source_file_storage_gateway.sql'), 'utf8'));
    sql(readFileSync(resolve('supabase/security/source_file_storage_register_on_institution.sql'), 'utf8'));

    step = 'fixtures';
    const login = (email, password) => stack.authRequest('/token?grant_type=password', { body: { email, password } });
    const people = {};
    for (const [key, role, globalAdmin, blocked] of [['superadmin', 'superadmin', true, false], ['alumno', 'alumno', false, false], ['admin', 'admin_instituto', false, false], ['blocked', 'admin_instituto', false, true]]) {
      const email = `${run}-${key}@example.invalid`, password = randomBytes(24).toString('hex');
      const created = await stack.authRequest('/admin/users', { token: stack.serviceKey, body: { email, password, email_confirm: true } });
      assert.equal(created.status, 200, 'Fixture creation failed');
      sql(`update public.profiles set account_role='${role}', is_global_admin=${globalAdmin}, is_blocked=${blocked} where user_id='${created.body.id}';`);
      people[key] = { id: created.body.id, email, password };
    }
    const superToken = (await login(people.superadmin.email, people.superadmin.password)).body.access_token;
    const call = async (body) => { const response = await edgeCall(edgePort, { token: superToken, origin: ORIGIN, body }); return { status: response.status, body: await response.json().catch(() => null) }; };
    const count = (table, where) => sql(`select count(*) from ${table} where ${where};`);
    const profileOf = (id) => sql(`select account_role||','||is_global_admin||','||is_blocked from public.profiles where user_id='${id}';`);
    const checks = {};

    step = 'new tenant with new admin';
    const ok = tenantPayload(run, 'ok');
    const created = await call(ok);
    assert.equal(created.status, 200, `Create failed: ${JSON.stringify(created.body)}`);
    assert.equal(created.body.admin_reused, false);
    assert.equal(profileOf(created.body.admin_user_id), 'admin_instituto,false,false');
    assert.equal(sql(`select role from public.memberships where user_id='${created.body.admin_user_id}' and institution_id='${created.body.institution_id}';`), 'owner');
    assert.equal((await login(ok.admin_email, ok.admin_password)).status, 200, 'New admin cannot log in');
    assert.equal(count('public.source_file_storage_resources', `institution_id='${created.body.institution_id}' and workspace_key='main'`), '9', 'New institution without file resources');
    // D2: sin snapshot el gateway rechaza la primera carga de planillas (403 "Workspace no autorizado").
    assert.equal(count('public.workspace_snapshots', `institution_id='${created.body.institution_id}' and workspace_key='main'`), '1', 'New institution without workspace snapshot');
    checks.created = { status: 200, profile: 'admin_instituto', membership: 'owner', login: 200, fileResources: 9, workspaceSnapshot: 1 };

    step = 'duplicate slug writes nothing';
    const usersBefore = count('auth.users', 'true');
    const duplicate = await call({ ...tenantPayload(run, 'dup'), institution_slug: ok.institution_slug });
    assert.equal(duplicate.status, 409, `Duplicate slug: ${duplicate.status}`);
    assert.equal(count('auth.users', 'true'), usersBefore, 'Duplicate slug created an Auth user');
    assert.equal(count('public.institutions', `slug='${ok.institution_slug}'`), '1');
    checks.duplicateSlug = 409;

    step = 'short password for a new admin writes nothing';
    const short = await call(tenantPayload(run, 'short', { admin_password: 'corta' }));
    assert.equal(short.status, 400);
    assert.equal(count('public.institutions', `slug='${run}-short'`), '0', 'Short password left an institution');
    checks.shortPassword = 400;

    step = 'existing identities with another role are rejected untouched';
    checks.rejectedIdentities = {};
    for (const key of ['superadmin', 'alumno', 'blocked']) {
      const before = profileOf(people[key].id);
      const rejected = await call(tenantPayload(run, `as-${key}`, { admin_email: people[key].email }));
      assert.equal(rejected.status, 409, `${key}: ${rejected.status}`);
      assert.equal(profileOf(people[key].id), before, `${key} profile changed`);
      assert.equal(count('public.institutions', `slug='${run}-as-${key}'`), '0', `${key} left an institution`);
      assert.equal((await login(people[key].email, people[key].password)).status, 200, `${key} password changed`);
      checks.rejectedIdentities[key] = 409;
    }

    step = 'existing admin keeps password and gets the new institution';
    const reuse = tenantPayload(run, 'reuse', { admin_email: people.admin.email });
    const reused = await call(reuse);
    assert.equal(reused.status, 200, `Reuse failed: ${JSON.stringify(reused.body)}`);
    assert.equal(reused.body.admin_reused, true);
    assert.equal(reused.body.admin_user_id, people.admin.id);
    assert.equal(profileOf(people.admin.id), 'admin_instituto,false,false');
    assert.equal((await login(people.admin.email, people.admin.password)).status, 200, 'Reuse changed the password');
    assert.equal((await login(people.admin.email, reuse.admin_password)).status, 400, 'Reuse applied the new password');
    checks.reusedAdmin = { status: 200, passwordKept: true, membership: 'owner' };

    // I2g: "Asignar usuario a institucion" (create_or_assign_institution_user) con el mismo criterio.
    step = 'assign user: new admin, validations and existing identities';
    const assign = (label, overrides = {}) => ({ action: 'create_or_assign_institution_user', user_email: `${run}-assign-${label}@example.invalid`, user_password: randomBytes(16).toString('hex'), user_display_name: `Synthetic assign ${label}`, institution_ids: [created.body.institution_id], membership_role: 'admin', ...overrides });
    const assignedNew = assign('new');
    const assignedNewResult = await call(assignedNew);
    assert.equal(assignedNewResult.status, 200, `Assign new failed: ${JSON.stringify(assignedNewResult.body)}`);
    assert.equal(assignedNewResult.body.user_reused, false);
    assert.equal(profileOf(assignedNewResult.body.user_id), 'admin_instituto,false,false');
    assert.equal((await login(assignedNew.user_email, assignedNew.user_password)).status, 200);
    checks.assign = { newAdmin: 200 };
    for (const [label, overrides, status] of [
      ['bad-role', { membership_role: 'dueno' }, 400],
      ['no-institution', { institution_ids: [] }, 400],
      ['missing-institution', { institution_ids: ['00000000-0000-4000-8000-00000000dead'] }, 400],
      ['short', { user_password: 'corta' }, 400],
    ]) {
      const usersBeforeAssign = count('auth.users', 'true');
      const rejected = await call(assign(label, overrides));
      assert.equal(rejected.status, status, `assign ${label}: ${rejected.status}`);
      assert.equal(count('auth.users', 'true'), usersBeforeAssign, `assign ${label} created an Auth user`);
      checks.assign[label] = rejected.status;
    }
    for (const key of ['superadmin', 'alumno', 'blocked']) {
      const before = profileOf(people[key].id);
      const membershipsBefore = count('public.memberships', `user_id='${people[key].id}'`);
      const rejected = await call(assign(`as-${key}`, { user_email: people[key].email }));
      assert.equal(rejected.status, 409, `assign ${key}: ${rejected.status}`);
      assert.equal(profileOf(people[key].id), before, `assign ${key} profile changed`);
      assert.equal(count('public.memberships', `user_id='${people[key].id}'`), membershipsBefore, `assign ${key} memberships changed`);
      assert.equal((await login(people[key].email, people[key].password)).status, 200, `assign ${key} password changed`);
      checks.assign[key] = 409;
    }
    const reuseAssign = assign('reuse', { user_email: people.admin.email });
    const reusedAssign = await call(reuseAssign);
    assert.equal(reusedAssign.status, 200, `Assign reuse failed: ${JSON.stringify(reusedAssign.body)}`);
    assert.equal(reusedAssign.body.user_reused, true);
    assert.equal((await login(people.admin.email, people.admin.password)).status, 200, 'Assign changed the password');
    assert.equal((await login(people.admin.email, reuseAssign.user_password)).status, 400, 'Assign applied the new password');
    assert.equal(sql(`select role from public.memberships where user_id='${people.admin.id}' and institution_id='${created.body.institution_id}';`), 'admin');
    checks.assign.reusedAdmin = { status: 200, passwordKept: true };

    step = 'induced failures roll everything back';
    sql(FAILURE_TRIGGERS_SQL);
    const authFail = tenantPayload(run, 'fail-auth', { admin_email: `${run}-fail-auth@example.invalid` });
    const authFailed = await call(authFail);
    assert.ok(authFailed.status >= 400, `Auth failure accepted: ${authFailed.status}`);
    assert.match(String(authFailed.body?.error), /no quedo nada creado/);
    assert.equal(count('public.institutions', `slug='${authFail.institution_slug}'`), '0', 'Auth failure left an orphan institution');

    const memberFail = tenantPayload(run, 'fail-member');
    const usersBeforeMember = count('auth.users', 'true');
    const memberFailed = await call(memberFail);
    assert.ok(memberFailed.status >= 400, `Membership failure accepted: ${memberFailed.status}`);
    assert.match(String(memberFailed.body?.error), /no quedo nada creado/);
    assert.equal(count('public.institutions', `slug='${memberFail.institution_slug}'`), '0', 'Membership failure left an orphan institution');
    assert.equal(count('public.source_file_storage_resources r', 'not exists (select 1 from public.institutions i where i.id = r.institution_id)'), '0', 'Rollback left orphan file resources');
    assert.equal(count('public.workspace_snapshots', `institution_id not in (select id from public.institutions)`), '0', 'Rollback left an orphan workspace snapshot');
    assert.equal(count('auth.users', `email='${memberFail.admin_email}'`), '0', 'Membership failure left an orphan Auth user');
    assert.equal(count('public.profiles', `email='${memberFail.admin_email}'`), '0', 'Membership failure left an orphan profile');
    assert.equal(count('auth.users', 'true'), usersBeforeMember);

    const reuseFail = tenantPayload(run, 'fail-member-reuse', { admin_email: people.admin.email, institution_slug: `${run}-reuse-fail-member` });
    const reuseFailed = await call(reuseFail);
    assert.ok(reuseFailed.status >= 400, `Reuse failure accepted: ${reuseFailed.status}`);
    assert.equal(count('public.institutions', `slug='${reuseFail.institution_slug}'`), '0', 'Reuse failure left an orphan institution');
    assert.equal(count('auth.users', `id='${people.admin.id}'`), '1', 'Rollback deleted a pre-existing user');
    assert.equal((await login(people.admin.email, people.admin.password)).status, 200, 'Rollback broke the existing admin');
    const failInstitution = '00000000-0000-4000-8000-0000000f0a11';
    sql(`insert into public.institutions(id,name,slug) values ('${failInstitution}','Synthetic I2g fail','${run}-assign-fail-member');`);
    const assignFail = assign('fail', { institution_ids: [failInstitution] });
    const assignFailed = await call(assignFail);
    assert.ok(assignFailed.status >= 400, `Assign failure accepted: ${assignFailed.status}`);
    assert.equal(count('auth.users', `email='${assignFail.user_email}'`), '0', 'Assign failure left an orphan Auth user');
    assert.equal(count('public.profiles', `email='${assignFail.user_email}'`), '0', 'Assign failure left an orphan profile');
    const assignReuseFailed = await call(assign('fail-reuse', { user_email: people.admin.email, institution_ids: [failInstitution] }));
    assert.ok(assignReuseFailed.status >= 400, `Assign reuse failure accepted: ${assignReuseFailed.status}`);
    assert.equal(count('auth.users', `id='${people.admin.id}'`), '1', 'Assign rollback deleted a pre-existing user');
    checks.assign.rollback = { newUserFailure: assignFailed.status, reuseFailure: assignReuseFailed.status, orphans: 0 };
    checks.rollback = { authFailure: authFailed.status, membershipFailure: memberFailed.status, reuseFailure: reuseFailed.status, orphans: 0, existingUserKept: true };

    step = 'slug is free again after the rollback';
    sql('drop trigger i2f_fail_auth on auth.users; drop trigger i2f_fail_membership on public.memberships;');
    const retry = await call(authFail);
    assert.equal(retry.status, 200, `Retry after rollback failed: ${JSON.stringify(retry.body)}`);
    checks.retryAfterRollback = 200;

    // AUD.I2f P1 y P2, reproducidos como en la auditoria de Codex: ahora tienen que terminar bien.
    step = 'audit P1: an admin still being provisioned is never reused nor lost';
    sql(AUDIT_DELAY_TRIGGERS_SQL);
    const waitUntil = async (probe, what) => {
      for (let i = 0; i < 80; i++) { if (probe()) return; await new Promise((done) => setTimeout(done, 100)); }
      throw new Error(`Timeout waiting for ${what}`);
    };
    const sleeping = () => sql("select count(*) from pg_stat_activity where wait_event = 'PgSleep';") !== '0';
    checks.audit = {};
    const slowFail = tenantPayload(run, 'p1-slow-fail');
    const slowFailCall = call(slowFail);
    await waitUntil(sleeping, 'A to reach the membership');
    assert.equal(count('public.profiles', `email='${slowFail.admin_email}'`), '1', 'A profile is not visible yet');
    const racing = await call(tenantPayload(run, 'p1-racer', { admin_email: slowFail.admin_email }));
    assert.equal(racing.status, 409, `B reused an admin still being provisioned: ${JSON.stringify(racing.body)}`);
    assert.equal(count('public.institutions', `slug='${run}-p1-racer'`), '0', 'B left an institution');
    const slowFailed = await slowFailCall;
    assert.ok(slowFailed.status >= 400, `A delayed failure accepted: ${slowFailed.status}`);
    assert.equal(count('auth.users', `email='${slowFail.admin_email}'`), '0', 'A rollback left its provisional user');
    const afterRace = tenantPayload(run, 'p1-after', { admin_email: slowFail.admin_email });
    const afterRaceResult = await call(afterRace);
    assert.equal(afterRaceResult.status, 200, `B retry failed: ${JSON.stringify(afterRaceResult.body)}`);
    assert.equal((await login(afterRace.admin_email, afterRace.admin_password)).status, 200, 'B admin cannot log in');
    checks.audit.p1DelayedFailure = { racerDuringProvisioning: 409, provisionalUserDeleted: true, racerRetry: 200 };

    const slowOk = tenantPayload(run, 'p1-slow-ok');
    const slowOkCall = call(slowOk);
    await waitUntil(sleeping, 'A to reach the membership');
    const racingOk = await call(tenantPayload(run, 'p1-racer-ok', { admin_email: slowOk.admin_email }));
    assert.equal(racingOk.status, 409, `B reused an admin still being provisioned: ${racingOk.status}`);
    const slowOkResult = await slowOkCall;
    assert.equal(slowOkResult.status, 200, `A slow success failed: ${JSON.stringify(slowOkResult.body)}`);
    const reusedAfter = await call(tenantPayload(run, 'p1-reuse-after', { admin_email: slowOk.admin_email }));
    assert.equal(reusedAfter.status, 200, `Reuse after provisioning failed: ${JSON.stringify(reusedAfter.body)}`);
    assert.equal(reusedAfter.body.admin_reused, true);
    assert.equal(count('public.memberships', `user_id='${slowOkResult.body.admin_user_id}' and role='owner'`), '2');
    assert.equal((await login(slowOk.admin_email, slowOk.admin_password)).status, 200, 'Provisioned admin cannot log in');
    checks.audit.p1SlowSuccess = { racerDuringProvisioning: 409, provisioned: 200, reusedAfterwards: 200 };

    step = 'audit P2: an account without profile is not reused as admin';
    const noProfileEmail = `${run}-no-profile@example.invalid`;
    const noProfile = await stack.authRequest('/admin/users', { token: stack.serviceKey, body: { email: noProfileEmail, password: randomBytes(24).toString('hex'), email_confirm: true } });
    assert.equal(noProfile.status, 200, 'No-profile fixture failed');
    sql(`delete from public.profiles where user_id='${noProfile.body.id}';`);
    const noProfileResult = await call(tenantPayload(run, 'p2-no-profile', { admin_email: noProfileEmail }));
    assert.equal(noProfileResult.status, 409, `Account without profile reused: ${noProfileResult.status}`);
    assert.equal(count('public.profiles', `user_id='${noProfile.body.id}'`), '0', 'A profile was invented');
    assert.equal(count('public.institutions', `slug='${run}-p2-no-profile'`), '0');
    checks.audit.p2NoProfile = 409;

    step = 'audit P2: a concurrent demotion is not overwritten';
    const demoteAdmin = async (key) => {
      const email = `${run}-${key}@example.invalid`;
      const created = await stack.authRequest('/admin/users', { token: stack.serviceKey, body: { email, password: randomBytes(24).toString('hex'), email_confirm: true } });
      assert.equal(created.status, 200);
      sql(`update public.profiles set account_role='admin_instituto' where user_id='${created.body.id}';`);
      return { id: created.body.id, email };
    };
    const demoted = await demoteAdmin('demoted');
    const demoteCall = call(tenantPayload(run, 'p2-demote', { admin_email: demoted.email }));
    await waitUntil(sleeping, 'the reuse to reach the membership');
    sql(`update public.profiles set account_role='alumno' where user_id='${demoted.id}';`);
    const demoteResult = await demoteCall;
    assert.equal(demoteResult.status, 409, `Demotion overwritten: ${JSON.stringify(demoteResult.body)}`);
    assert.equal(profileOf(demoted.id), 'alumno,false,false', 'Demotion was overwritten');
    assert.equal(count('public.institutions', `slug='${run}-p2-demote'`), '0', 'Institution kept for a demoted admin');
    assert.equal(count('public.memberships', `user_id='${demoted.id}'`), '0', 'Demoted user kept the owner membership');

    const demotedAssign = await demoteAdmin('demoted-assign');
    const demoteInstitution = '00000000-0000-4000-8000-0000000de307';
    sql(`insert into public.institutions(id,name,slug) values ('${demoteInstitution}','Synthetic I2f demote','${run}-assign-demote');
      insert into public.memberships(institution_id,user_id,role) values ('${created.body.institution_id}','${demotedAssign.id}','viewer');`);
    const demoteAssignCall = call(assign('demote', { user_email: demotedAssign.email, institution_ids: [created.body.institution_id, demoteInstitution] }));
    await waitUntil(sleeping, 'the assignment to reach the membership');
    sql(`update public.profiles set account_role='alumno' where user_id='${demotedAssign.id}';`);
    const demoteAssignResult = await demoteAssignCall;
    assert.equal(demoteAssignResult.status, 409, `Assign demotion overwritten: ${JSON.stringify(demoteAssignResult.body)}`);
    assert.equal(profileOf(demotedAssign.id), 'alumno,false,false');
    assert.equal(sql(`select string_agg(institution_id||':'||role, ',') from public.memberships where user_id='${demotedAssign.id}';`), `${created.body.institution_id}:viewer`, 'Previous memberships not restored');
    checks.audit.p2ConcurrentDemotion = { tenant: 409, assign: 409, demotionKept: true, membershipsRestored: true };
    sql('drop trigger i2f_audit_delay on public.memberships;');

    report.checks = checks;
    report.result = 'PASS';
  } catch (error) { report.result = 'BLOQUEADO'; report.error = `Failed at ${step}: ${error.message}`; }
  finally {
    if (stack && !stack.tornDown) report.cleanup = await stack.teardown();
    if (bundle) try { await removeOwnedDirectory(bundle); } catch { report.cleanup = { ...report.cleanup, errors: [...(report.cleanup?.errors ?? []), 'Edge bundle cleanup failed'] }; }
    if (report.cleanup?.errors?.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
