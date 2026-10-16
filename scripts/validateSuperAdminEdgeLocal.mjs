import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localEndpoint } from './validateLocalDbAuthRecovery.mjs';
import { createLocalStack } from './localSupabaseStack.mjs';
import { bundleEdgeFunction, removeOwnedDirectory, edgeEnvironment, edgeCall, EDGE_RUNTIME_IMAGE } from './validateRecoveredEdge.mjs';

const ORIGIN = 'http://127.0.0.1:4173';

// Actores sobre dos instituciones: Super Admin global, owner y viewer de A, owner de B.
export const SUPERADMIN_ACTORS = Object.freeze([
  { key: 'superadmin', tenant: null, accountRole: 'superadmin', globalAdmin: true },
  { key: 'ownerA', tenant: 0, accountRole: 'admin_instituto', membership: 'owner' },
  { key: 'viewerA', tenant: 0, accountRole: 'alumno', membership: 'viewer' },
  { key: 'ownerB', tenant: 1, accountRole: 'admin_instituto', membership: 'owner' },
]);

export function studentRow(run, label) {
  assert.match(run, /^[a-f0-9]{16}$/); assert.match(label, /^[a-z0-9-]+$/);
  return { email: `${run}-student-${label}@example.invalid`, dni: String(30000000 + Number.parseInt(run.slice(0, 6), 16) % 1000000).slice(0, 8), nombre: 'Synthetic', apellido: `Student ${label}`, carrera: 'Synthetic Career' };
}

export async function main() {
  const report = { staging: 'NONE', production: 'NONE', edgeRuntimeImage: EDGE_RUNTIME_IMAGE };
  let stack, bundle, step = 'local stack';
  try {
    stack = await createLocalStack({ label: 'hub.superadmin-edge', report });
    const { sql, run } = stack;
    step = 'Edge Runtime';
    bundle = await bundleEdgeFunction('admin-users');
    const edgePort = stack.startContainer(`${stack.database}_edge`, EDGE_RUNTIME_IMAGE, edgeEnvironment({ gateway: stack.names.gateway, anonKey: stack.anonKey, serviceKey: stack.serviceKey, origin: ORIGIN }), 9000,
      ['--mount', `type=bind,source=${resolve(bundle, 'admin-users')},target=/home/deno/functions/admin-users,readonly`], ['start', '--main-service', '/home/deno/functions/admin-users', '-p', '9000']);
    await stack.waitFor(async () => (await fetch(localEndpoint(edgePort, '/'), { method: 'OPTIONS', headers: { Origin: ORIGIN }, signal: AbortSignal.timeout(1000), redirect: 'error' })).status === 200, `${stack.database}_edge`);

    step = 'fixtures';
    const tenants = [randomUUID(), randomUUID()];
    for (const [index, id] of tenants.entries()) sql(`insert into public.institutions(id,name,slug) values ('${id}','Synthetic superadmin tenant ${index}','${run}-sa-${index}');`);
    const actors = {};
    for (const actor of SUPERADMIN_ACTORS) {
      const email = `${run}-${actor.key.toLowerCase()}@example.invalid`, password = randomBytes(24).toString('hex');
      const created = await stack.authRequest('/admin/users', { token: stack.serviceKey, body: { email, password, email_confirm: true } });
      assert.equal(created.status, 200, 'Fixture creation failed');
      const id = created.body.id;
      sql(`update public.profiles set account_role='${actor.accountRole}', is_global_admin=${actor.globalAdmin ? 'true' : 'false'} where user_id='${id}';`);
      if (actor.membership) sql(`insert into public.memberships(institution_id,user_id,role) values ('${tenants[actor.tenant]}','${id}','${actor.membership}');`);
      const login = await stack.authRequest('/token?grant_type=password', { body: { email, password } });
      assert.equal(login.status, 200, 'Fixture login failed');
      actors[actor.key] = { ...actor, id, token: login.body.access_token };
    }
    const call = async (actor, body) => { const response = await edgeCall(edgePort, { token: actors[actor].token, origin: ORIGIN, body }); report.lastEdgeStatus = response.status; return { status: response.status, body: await response.json().catch(() => null) }; };
    const membershipsOf = userId => JSON.parse(sql(`select coalesce(json_agg(json_build_object('institution',institution_id,'role',role) order by institution_id),'[]') from public.memberships where user_id='${userId}';`));
    const checks = {};

    step = 'create tenant denied for non superadmin';
    const tenantPayload = label => ({ action: 'create_tenant_with_admin', institution_name: `Synthetic created ${label}`, institution_slug: `${run}-created-${label}`, admin_email: `${run}-created-${label}@example.invalid`, admin_password: randomBytes(16).toString('hex') });
    const institutionsBefore = sql('select count(*) from public.institutions;');
    for (const actor of ['ownerA', 'viewerA', 'ownerB']) { const denied = await call(actor, tenantPayload(actor.toLowerCase())); assert.equal(denied.status, 403, `create_tenant_with_admin allowed for ${actor}`); }
    assert.equal(sql('select count(*) from public.institutions;'), institutionsBefore, 'Denied tenant creation left rows');
    checks.createTenantDenied = 3;

    step = 'create tenant by superadmin';
    const createdTenant = await call('superadmin', tenantPayload('ok'));
    assert.equal(createdTenant.status, 200, 'Super Admin could not create tenant');
    const newAdmin = createdTenant.body.admin_user_id, newInstitution = createdTenant.body.institution_id;
    assert.deepEqual(membershipsOf(newAdmin), [{ institution: newInstitution, role: 'owner' }]);
    assert.equal(sql(`select account_role||','||is_global_admin from public.profiles where user_id='${newAdmin}';`), 'admin_instituto,false');
    checks.createTenantBySuperAdmin = { status: 200, adminMemberships: 1, adminProfile: 'admin_instituto' };

    step = 'bulk students';
    const bulk = (actor, tenant, label) => call(actor, { action: 'bulk_create_students', institution_id: tenants[tenant], students: [studentRow(run, label)] });
    for (const [actor, tenant, label] of [['ownerA', 1, 'cross'], ['viewerA', 0, 'viewer'], ['ownerB', 0, 'foreign']]) {
      const denied = await bulk(actor, tenant, label);
      assert.equal(denied.status, 403, `bulk_create_students allowed for ${actor} on tenant ${tenant}`);
      assert.equal(sql(`select count(*) from auth.users where email='${studentRow(run, label).email}';`), '0', 'Denied bulk created an Auth user');
    }
    checks.bulkStudentsDenied = 3;
    const allowed = await bulk('ownerA', 0, 'own');
    assert.equal(allowed.status, 200, 'Owner could not create students in own institution');
    const studentId = sql(`select id from auth.users where email='${studentRow(run, 'own').email}';`);
    assert.match(studentId, /^[0-9a-f-]{36}$/);
    const studentMemberships = membershipsOf(studentId);
    assert.ok(studentMemberships.every(entry => entry.institution === tenants[0]), 'Student linked outside owner institution');
    assert.equal(sql(`select account_role||','||is_global_admin from public.profiles where user_id='${studentId}';`), 'alumno,false');
    checks.bulkStudentsByOwner = { status: 200, memberships: studentMemberships.map(entry => entry.role), outsideOwnInstitution: 0 };

    step = 'superadmin-only actions';
    for (const actor of ['ownerA', 'viewerA']) {
      const denied = await call(actor, { action: 'set_user_password', user_id: actors.viewerA.id, password: randomBytes(16).toString('hex') });
      assert.equal(denied.status, 403, `set_user_password allowed for ${actor}`);
    }
    checks.setPasswordDenied = 2;

    step = 'audit';
    const audit = JSON.parse(sql("select coalesce(json_agg(json_build_object('actor',actor_user_id,'action',action,'status',status)),'[]') from public.admin_audit_logs;"));
    assert.ok(audit.some(row => row.actor === actors.superadmin.id && row.action === 'create_tenant_with_admin' && row.status === 'success'), 'Tenant creation not audited');
    assert.ok(audit.some(row => row.actor === actors.ownerA.id && row.action === 'bulk_create_students' && row.status === 'success'), 'Bulk students not audited');
    assert.ok(audit.every(row => row.status === 'success'), 'Denied calls should fail before auditing');
    checks.auditRows = audit.length;
    report.checks = checks;
    report.result = 'PASS';
  } catch (error) { report.result = 'BLOQUEADO'; report.error = `Failed at ${step}: ${error.name}`; }
  finally {
    if (stack && !stack.tornDown) report.cleanup = await stack.teardown();
    if (bundle) try { await removeOwnedDirectory(bundle); } catch { report.cleanup = { ...report.cleanup, errors: [...(report.cleanup?.errors ?? []), 'Edge bundle cleanup failed'] }; }
    if (report.cleanup?.errors?.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
