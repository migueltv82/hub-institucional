import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localEndpoint } from './validateLocalDbAuthRecovery.mjs';
import { createLocalStack } from './localSupabaseStack.mjs';
import { bundleEdgeFunction, removeOwnedDirectory, edgeEnvironment, edgeCall, EDGE_RUNTIME_IMAGE } from './validateRecoveredEdge.mjs';

// I2f: create_tenant_with_admin con GoTrue y Edge Runtime reales. Si algo falla despues de crear la institucion,
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
    checks.created = { status: 200, profile: 'admin_instituto', membership: 'owner', login: 200 };

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
    assert.equal(count('auth.users', `email='${memberFail.admin_email}'`), '0', 'Membership failure left an orphan Auth user');
    assert.equal(count('public.profiles', `email='${memberFail.admin_email}'`), '0', 'Membership failure left an orphan profile');
    assert.equal(count('auth.users', 'true'), usersBeforeMember);

    const reuseFail = tenantPayload(run, 'fail-member-reuse', { admin_email: people.admin.email, institution_slug: `${run}-reuse-fail-member` });
    const reuseFailed = await call(reuseFail);
    assert.ok(reuseFailed.status >= 400, `Reuse failure accepted: ${reuseFailed.status}`);
    assert.equal(count('public.institutions', `slug='${reuseFail.institution_slug}'`), '0', 'Reuse failure left an orphan institution');
    assert.equal(count('auth.users', `id='${people.admin.id}'`), '1', 'Rollback deleted a pre-existing user');
    assert.equal((await login(people.admin.email, people.admin.password)).status, 200, 'Rollback broke the existing admin');
    checks.rollback = { authFailure: authFailed.status, membershipFailure: memberFailed.status, reuseFailure: reuseFailed.status, orphans: 0, existingUserKept: true };

    step = 'slug is free again after the rollback';
    sql('drop trigger i2f_fail_auth on auth.users; drop trigger i2f_fail_membership on public.memberships;');
    const retry = await call(authFail);
    assert.equal(retry.status, 200, `Retry after rollback failed: ${JSON.stringify(retry.body)}`);
    checks.retryAfterRollback = 200;

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
