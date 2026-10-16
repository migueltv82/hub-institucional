import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { authPassword } from './validateGoTrueLocalHarness.mjs';
import { buildLocalRecoveryEnvironment, LOCAL_RECOVERY_IMAGES } from './localRecoveryConfiguration.mjs';
import { localEndpoint } from './validateLocalDbAuthRecovery.mjs';

// RPC SECURITY DEFINER que escriben profiles/memberships: todas deben exigir Super Admin.
export const PRIVILEGED_RPCS = Object.freeze(['update_membership_role', 'remove_user_membership', 'set_user_access_status', 'delete_institution_user']);

// Un intento denegado por PostgREST puede llegar como error (401/403/400 por RLS o excepcion de la RPC)
// o como 200 sin filas afectadas. Lo que nunca puede pasar es un 2xx con filas.
export function deniedResponse(status, body) {
  if (status >= 400 && status < 500) return true;
  if (status === 200 || status === 201) return Array.isArray(body) && body.length === 0;
  return false;
}

export const ESCALATION_ACTORS = Object.freeze([
  { key: 'alumno', tenant: 0, accountRole: 'alumno', membership: 'viewer' },
  { key: 'docente', tenant: 0, accountRole: 'docente', membership: 'viewer' },
  { key: 'owner', tenant: 0, accountRole: 'admin_instituto', membership: 'owner' },
  { key: 'foreign', tenant: 1, accountRole: 'alumno', membership: 'viewer' },
  { key: 'blocked', tenant: 0, accountRole: 'alumno', membership: 'viewer', blocked: true },
]);

export async function runEscalationPhase({ docker, sql, auth, service, source, sourceConfig, sourceEnv, database, jwtSecret, network, label, run, register, report }) {
  const restAssignment = sourceConfig.split(/\r?\n/).filter(line => /^(?:\\set pgpass\b|ALTER USER authenticator\b)/i.test(line)).join('\n').replaceAll('authenticator', 'supabase_auth_admin');
  const restPassword = authPassword(restAssignment, sourceEnv);
  const restName = database + '_rest';
  docker(['image', 'inspect', LOCAL_RECOVERY_IMAGES.rest]);
  assert.equal(docker(['ps', '-a', '--filter', `name=^/${restName}$`, '--format', '{{.Names}}']).trim(), '');
  const restEnv = buildLocalRecoveryEnvironment({ kind: 'rest', image: LOCAL_RECOVERY_IMAGES.rest, host: source, database, password: restPassword, jwtSecret });
  register(restName);
  docker(['create', '--pull=never', '--name', restName, '--label', `${label}=${run}`, '--network', network, '-p', '127.0.0.1::3000', ...Object.keys(restEnv).flatMap(key => ['-e', key]), LOCAL_RECOVERY_IMAGES.rest], undefined, { ...process.env, ...restEnv });
  docker(['start', restName]);
  const restPort = JSON.parse(docker(['inspect', restName]))[0].NetworkSettings.Ports['3000/tcp'][0].HostPort;
  const rest = async (path, { token, method = 'GET', body } = {}) => {
    const response = await fetch(localEndpoint(restPort, path), { method, headers: { 'Content-Type': 'application/json', Prefer: 'return=representation', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000), redirect: 'error' });
    report.escalationLastStatus = response.status;
    return { status: response.status, body: await response.json().catch(() => null) };
  };

  // Fixtures como los escribiria admin-users: usuarios por Admin API, perfiles y membresias por el lado servidor.
  const tenants = [randomUUID(), randomUUID()];
  for (const [index, id] of tenants.entries()) sql(`insert into public.institutions(id,name,slug) values ('${id}','Synthetic escalation tenant ${index}','${run}-esc-${index}');`);
  const actors = {};
  for (const actor of ESCALATION_ACTORS) {
    const email = `${run}-esc-${actor.key}@example.invalid`, password = randomBytes(24).toString('hex');
    const created = await auth('/admin/users', { token: service, body: { email, password, email_confirm: true } });
    assert.equal(created.status, 200, 'Escalation fixture creation failed');
    const id = created.body.id;
    sql(`update public.profiles set account_role='${actor.accountRole}', is_blocked=${actor.blocked ? 'true' : 'false'} where user_id='${id}'; insert into public.memberships(institution_id,user_id,role) values ('${tenants[actor.tenant]}','${id}','${actor.membership}');`);
    const login = await auth('/token?grant_type=password', { body: { email, password } });
    assert.equal(login.status, 200, 'Escalation fixture login failed');
    actors[actor.key] = { ...actor, id, token: login.body.access_token };
  }

  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try { ready = (await rest('/institutions?select=id', { token: actors.alumno.token })).status === 200; } catch { ready = false; }
    if (!ready) { assert.equal(JSON.parse(docker(['inspect', restName]))[0].State.Running, true, 'PostgREST exited'); await new Promise(done => setTimeout(done, 250)); }
  }
  assert.ok(ready, 'PostgREST unavailable');

  const protectedRows = () => sql(`select json_build_object(
    'profiles',(select coalesce(json_agg(to_jsonb(p) order by p.user_id),'[]') from public.profiles p),
    'memberships',(select coalesce(json_agg(to_jsonb(m) order by m.user_id,m.institution_id),'[]') from public.memberships m),
    'institutions',(select coalesce(json_agg(to_jsonb(i) order by i.id),'[]') from public.institutions i),
    'audit',(select count(*) from public.admin_audit_logs),
    'appMetadata',(select coalesce(json_agg(raw_app_meta_data order by id),'[]') from auth.users));`);
  const before = protectedRows();
  const attempts = [];
  const attempt = async (name, actor, path, options) => {
    const result = await rest(path, { token: actor.token, ...options });
    assert.ok(deniedResponse(result.status, result.body), `Escalation not denied: ${name}`);
    attempts.push({ name, actor: actor.key, status: result.status });
  };
  for (const actor of Object.values(actors)) {
    const own = `/profiles?user_id=eq.${actor.id}`;
    await attempt('self account_role superadmin', actor, own, { method: 'PATCH', body: { account_role: 'superadmin' } });
    await attempt('self is_global_admin', actor, own, { method: 'PATCH', body: { is_global_admin: true } });
    await attempt('self is_blocked false', actor, own, { method: 'PATCH', body: { is_blocked: false } });
    await attempt('self membership owner', actor, `/memberships?user_id=eq.${actor.id}`, { method: 'PATCH', body: { role: 'owner' } });
    await attempt('insert own owner membership', actor, '/memberships', { method: 'POST', body: { institution_id: tenants[actor.tenant], user_id: actor.id, role: 'owner' } });
    await attempt('insert foreign membership', actor, '/memberships', { method: 'POST', body: { institution_id: tenants[1 - actor.tenant], user_id: actor.id, role: 'viewer' } });
    await attempt('insert profile row', actor, '/profiles', { method: 'POST', body: { user_id: randomUUID(), email: `${run}-ghost-${actor.key}@example.invalid`, account_role: 'superadmin', is_global_admin: true } });
    await attempt('delete own profile', actor, own, { method: 'DELETE' });
    await attempt('update foreign institution', actor, `/institutions?id=eq.${tenants[1 - actor.tenant]}`, { method: 'PATCH', body: { name: 'Hijacked' } });
    for (const rpc of PRIVILEGED_RPCS) {
      const target = rpc === 'set_user_access_status' ? { target_user_id: actors.blocked.id, blocked: false }
        : rpc === 'delete_institution_user' ? { target_user_id: actors.alumno.id }
        : rpc === 'update_membership_role' ? { target_user_id: actor.id, target_institution_id: tenants[actor.tenant], new_role: 'owner' }
        : { target_user_id: actors.owner.id, target_institution_id: tenants[0] };
      await attempt('rpc ' + rpc, actor, `/rpc/${rpc}`, { method: 'POST', body: target });
    }
  }
  // El owner institucional no es Super Admin: no puede tocar membresias ni perfiles de su propia institucion.
  await attempt('owner promotes member', actors.owner, `/memberships?user_id=eq.${actors.alumno.id}`, { method: 'PATCH', body: { role: 'admin' } });
  await attempt('owner adds foreign user', actors.owner, '/memberships', { method: 'POST', body: { institution_id: tenants[0], user_id: actors.foreign.id, role: 'viewer' } });
  await attempt('owner unblocks member', actors.owner, `/profiles?user_id=eq.${actors.blocked.id}`, { method: 'PATCH', body: { is_blocked: false } });
  await attempt('owner promotes member account', actors.owner, `/profiles?user_id=eq.${actors.docente.id}`, { method: 'PATCH', body: { account_role: 'admin_instituto' } });
  assert.equal(protectedRows(), before, 'Escalation attempts changed protected rows');

  const count = async (actor, path) => { const result = await rest(path, { token: actor.token }); assert.equal(result.status, 200, 'Read rejected'); return result.body.length; };
  const reads = {
    alumnoProfiles: await count(actors.alumno, '/profiles?select=user_id'),
    ownerProfiles: await count(actors.owner, '/profiles?select=user_id'),
    alumnoMemberships: await count(actors.alumno, '/memberships?select=user_id'),
    ownerTenantMemberships: await count(actors.owner, `/memberships?select=user_id&institution_id=eq.${tenants[0]}`),
    ownerForeignMemberships: await count(actors.owner, `/memberships?select=user_id&institution_id=eq.${tenants[1]}`),
    foreignTenantMemberships: await count(actors.foreign, `/memberships?select=user_id&institution_id=eq.${tenants[0]}`),
    foreignInstitutions: await count(actors.foreign, `/institutions?select=id&id=eq.${tenants[0]}`),
  };
  assert.deepEqual(reads, { alumnoProfiles: 1, ownerProfiles: 1, alumnoMemberships: 1, ownerTenantMemberships: 4, ownerForeignMemberships: 0, foreignTenantMemberships: 0, foreignInstitutions: 0 }, 'Read isolation mismatch');
  assert.equal(protectedRows(), before, 'Reads changed protected rows');
  // Control positivo: el mismo camino funciona para un Super Admin real, asi que las denegaciones no son vacias.
  const superEmail = `${run}-esc-superadmin@example.invalid`, superPassword = randomBytes(24).toString('hex');
  const superUser = await auth('/admin/users', { token: service, body: { email: superEmail, password: superPassword, email_confirm: true } });
  assert.equal(superUser.status, 200);
  sql(`update public.profiles set account_role='superadmin', is_global_admin=true where user_id='${superUser.body.id}';`);
  const superLogin = await auth('/token?grant_type=password', { body: { email: superEmail, password: superPassword } });
  assert.equal(superLogin.status, 200);
  const promoted = await rest('/rpc/update_membership_role', { token: superLogin.body.access_token, method: 'POST', body: { target_user_id: actors.alumno.id, target_institution_id: tenants[0], new_role: 'editor' } });
  assert.ok(promoted.status === 200 || promoted.status === 204, 'Super Admin control rejected');
  assert.equal(sql(`select role from public.memberships where user_id='${actors.alumno.id}' and institution_id='${tenants[0]}';`), 'editor', 'Super Admin control had no effect');
  const superAudit = sql(`select count(*) from public.admin_audit_logs where actor_user_id='${superUser.body.id}';`);
  const restState = JSON.parse(docker(['inspect', restName]))[0]; assert.equal(restState.State.Running, true); assert.equal(restState.RestartCount, 0);
  return { result: 'PASS', superAdminControl: { status: promoted.status, membershipRole: 'editor', auditRows: Number(superAudit) }, actors: Object.keys(actors).length, attempts: attempts.length, deniedByError: attempts.filter(entry => entry.status >= 400).length, deniedWithoutRows: attempts.filter(entry => entry.status < 400).length, statuses: [...new Set(attempts.map(entry => entry.status))].sort(), reads, protectedRowsUnchanged: true };
}
