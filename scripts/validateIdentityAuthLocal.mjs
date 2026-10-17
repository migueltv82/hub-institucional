import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { authPassword, BASELINE } from './validateGoTrueLocalHarness.mjs';
import { buildLocalRecoveryEnvironment, LOCAL_RECOVERY_IMAGES } from './localRecoveryConfiguration.mjs';
import { disposableDatabase, localEndpoint } from './validateLocalDbAuthRecovery.mjs';

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const NETWORK = 'supabase_network_codex-baseline-local-7725bdda';
const LABEL = 'hub.identity-auth';

// Peor caso de configuracion: signup publico abierto y autoconfirmado SOLO en este ensayo descartable.
// supabase/config.toml mantiene enable_signup=false; el trigger no debe depender de eso.
export const OPEN_SIGNUP_OVERRIDES = Object.freeze({ GOTRUE_DISABLE_SIGNUP: 'false', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'true' });

export function serviceRoleToken(jwtSecret) {
  assert.match(jwtSecret, /^[a-f0-9]{96}$/);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')}`;
}

const MINIMAL_PROFILE = Object.freeze({ account_role: 'alumno', is_global_admin: false, is_blocked: false });

// El trigger nunca puede elevar privilegios desde user_metadata (editable por el usuario). Con app_metadata
// (solo escribible por el servidor) puede aplicar ese rol o quedar en el minimo: admin-users escribe el perfil
// explicitamente despues de crear el usuario, asi que el alta legitima no depende del trigger.
export function allowedProfiles({ appMetadata }) {
  if (!appMetadata) return [MINIMAL_PROFILE];
  return [MINIMAL_PROFILE, { account_role: appMetadata.account_role ?? 'alumno', is_global_admin: appMetadata.is_global_admin === true, is_blocked: false }];
}

export const IDENTITY_CASES = Object.freeze([
  { name: 'signup superadmin metadata', via: 'signup', userMetadata: { account_role: 'superadmin', is_global_admin: true, nombre: 'Synthetic Signup' } },
  { name: 'signup admin_instituto metadata', via: 'signup', userMetadata: { account_role: 'admin_instituto' } },
  { name: 'admin API user_metadata only', via: 'admin', userMetadata: { account_role: 'superadmin', is_global_admin: true } },
  { name: 'admin API app_metadata docente', via: 'admin', appMetadata: { account_role: 'docente' } },
  { name: 'admin API app_metadata superadmin', via: 'admin', appMetadata: { account_role: 'superadmin', is_global_admin: true } },
]);

export async function main({ escalation = false } = {}) {
  assert.equal(typeof escalation, 'boolean');
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const container = `${database}_auth`;
  const report = { run, staging: 'NONE', production: 'NONE', image: LOCAL_RECOVERY_IMAGES.auth, openSignupOnlyInRehearsal: true, escalationRequested: escalation };
  const extraContainers = new Set();
  let step = 'preflight', created = false, containerCreated = false;
  const docker = (args, input, env = process.env) => {
    try { return execFileSync('docker', args, { input, env, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}; SQLSTATE=${String(error.stderr ?? '').match(/\b(?:42501|28P01)\b/)?.[0] ?? 'unavailable'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  try {
    const source = JSON.parse(docker(['inspect', SOURCE]))[0];
    assert.equal(source.Config.Image, 'public.ecr.aws/supabase/postgres:17.6.1.165');
    assert.equal(source.State.Health.Status, 'healthy');
    assert.deepEqual(Object.keys(source.NetworkSettings.Networks), [NETWORK]);
    docker(['image', 'inspect', LOCAL_RECOVERY_IMAGES.auth]);
    const env = Object.fromEntries(source.Config.Env.map(entry => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
    const sourceConfig = docker(['exec', SOURCE, 'cat', '/etc/postgresql.schema.sql']);
    const password = authPassword(sourceConfig, env);
    step = 'schema preparation';
    const schema = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments']);
    const migrations = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations']);
    assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
    created = true;
    sql(`create database ${database} template template0; comment on database ${database} is '${run}';`, 'postgres');
    sql(schema); sql(migrations);
    assert.equal(sql('select count(*) from auth.schema_migrations;'), '77');
    for (const file of BASELINE) sql(readFileSync(resolve('supabase/schema', file), 'utf8'));
    assert.equal(sql('select count(*) from auth.users;'), '0');
    step = 'trigger privileges';
    report.handleNewUserExecute = JSON.parse(sql("select json_object_agg(r, has_function_privilege(r, 'public.handle_new_user()', 'execute')) from unnest(array['anon','authenticated']) r;"));
    report.handleNewUserExecute.public = sql("select exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = 'public.handle_new_user()'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE');") === 't';
    assert.deepEqual(report.handleNewUserExecute, { anon: false, authenticated: false, public: false }, 'handle_new_user EXECUTE not revoked');
    assert.equal(sql("select count(*) from pg_trigger where tgname='on_auth_user_created' and tgrelid='auth.users'::regclass and tgenabled='O';"), '1', 'Auth trigger missing');
    step = 'GoTrue start';
    const jwtSecret = randomBytes(48).toString('hex');
    const settings = { ...buildLocalRecoveryEnvironment({ kind: 'auth', image: LOCAL_RECOVERY_IMAGES.auth, host: SOURCE, database, password, jwtSecret }), ...OPEN_SIGNUP_OVERRIDES };
    assert.equal(docker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}']).trim(), '');
    containerCreated = true;
    docker(['create', '--pull=never', '--name', container, '--label', `${LABEL}=${run}`, '--network', NETWORK, '-p', '127.0.0.1::9999', ...Object.keys(settings).flatMap(key => ['-e', key]), LOCAL_RECOVERY_IMAGES.auth], undefined, { ...process.env, ...settings });
    docker(['start', container]);
    const port = JSON.parse(docker(['inspect', container]))[0].NetworkSettings.Ports['9999/tcp'][0].HostPort;
    let healthy = false;
    for (let i = 0; i < 60 && !healthy; i++) {
      try { healthy = (await fetch(localEndpoint(port, '/health'), { signal: AbortSignal.timeout(1000), redirect: 'error' })).ok; } catch { healthy = false; }
      if (!healthy) { assert.equal(JSON.parse(docker(['inspect', container]))[0].State.Running, true, 'GoTrue exited'); await new Promise(done => setTimeout(done, 250)); }
    }
    assert.ok(healthy, 'GoTrue unavailable');
    const service = serviceRoleToken(jwtSecret);
    const auth = async (path, { method = 'POST', body, token } = {}) => {
      const response = await fetch(localEndpoint(port, path), { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000), redirect: 'error' });
      report.lastAuthStatus = response.status;
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    const profile = id => JSON.parse(sql(`select coalesce((select json_build_object('account_role',account_role,'is_global_admin',is_global_admin,'is_blocked',is_blocked) from public.profiles where user_id='${id}'),'null');`));
    report.cases = [];
    const users = [];
    for (const item of IDENTITY_CASES) {
      step = 'identity case ' + item.name;
      const email = `${run}-${report.cases.length}@example.invalid`, userPassword = randomBytes(24).toString('hex');
      const result = item.via === 'signup'
        ? await auth('/signup', { body: { email, password: userPassword, data: item.userMetadata } })
        : await auth('/admin/users', { token: service, body: { email, password: userPassword, email_confirm: true, user_metadata: item.userMetadata, app_metadata: item.appMetadata } });
      assert.equal(result.status, 200, 'Account creation failed');
      const id = result.body?.user?.id ?? result.body?.id;
      assert.match(id, /^[a-f0-9-]{36}$/);
      const observed = profile(id);
      assert.ok(allowedProfiles(item).some(allowed => JSON.stringify(allowed) === JSON.stringify(observed)), 'Profile privileges derived from untrusted metadata');
      assert.equal(sql(`select count(*) from public.memberships where user_id='${id}';`), '0', 'Trigger created memberships');
      report.cases.push({ name: item.name, via: item.via, profile: observed, memberships: 0, ...(item.appMetadata ? { appMetadataAppliedByTrigger: observed.account_role !== 'alumno' } : {}) });
      users.push({ id, email, password: userPassword, item });
    }
    if (users[0].item.userMetadata?.nombre) report.displayNameFromUserMetadata = sql(`select display_name from public.profiles where user_id='${users[0].id}';`) === users[0].item.userMetadata.nombre;
    assert.equal(report.displayNameFromUserMetadata, true, 'Presentation name not taken from user metadata');
    step = 'self-service metadata update';
    const target = users[2];
    const login = await auth('/token?grant_type=password', { body: { email: target.email, password: target.password } });
    assert.equal(login.status, 200, 'Login failed');
    const claims = JSON.parse(Buffer.from(login.body.access_token.split('.')[1], 'base64url').toString());
    assert.equal(claims.role, 'authenticated'); assert.equal(claims.app_metadata?.account_role, undefined, 'Untrusted role reached app_metadata claims');
    const appBefore = sql(`select raw_app_meta_data::text from auth.users where id='${target.id}';`), profileBefore = profile(target.id);
    const userMetadataUpdate = await auth('/user', { method: 'PUT', token: login.body.access_token, body: { data: { account_role: 'superadmin', is_global_admin: true } } });
    report.selfUserMetadataUpdateStatus = userMetadataUpdate.status;
    assert.equal(userMetadataUpdate.status, 200, 'User metadata self update rejected');
    const appMetadataUpdate = await auth('/user', { method: 'PUT', token: login.body.access_token, body: { app_metadata: { account_role: 'superadmin', is_global_admin: true } } });
    report.selfAppMetadataUpdateStatus = appMetadataUpdate.status;
    assert.ok(appMetadataUpdate.status === 403 || appMetadataUpdate.status === 200, 'Unexpected app_metadata self update response');
    assert.equal(sql(`select raw_app_meta_data::text from auth.users where id='${target.id}';`), appBefore, 'User changed own app_metadata');
    assert.deepEqual(profile(target.id), profileBefore, 'Self metadata update changed profile privileges');
    const relogin = await auth('/token?grant_type=password', { body: { email: target.email, password: target.password } });
    assert.equal(relogin.status, 200);
    report.claimsAfterSelfUpdate = JSON.parse(Buffer.from(relogin.body.access_token.split('.')[1], 'base64url').toString()).app_metadata?.account_role ?? null;
    assert.equal(report.claimsAfterSelfUpdate, null, 'Self update reached app_metadata claims');
    step = 'final privilege census';
    const serverIds = users.filter(user => user.item.appMetadata).map(user => user.id);
    const privileged = JSON.parse(sql("select coalesce(json_agg(user_id),'[]') from public.profiles where is_global_admin or account_role <> 'alumno';"));
    report.privilegedProfiles = privileged.length;
    assert.ok(privileged.every(id => serverIds.includes(id)), 'Privileged profile created from untrusted metadata');
    assert.equal(sql('select count(*) from public.memberships;'), '0');
    if (escalation) {
      step = 'Data API escalation';
      const { runEscalationPhase } = await import('./validateIdentityEscalation.mjs');
      report.escalation = await runEscalationPhase({ docker, sql, auth, service, source: SOURCE, sourceConfig, sourceEnv: env, database, jwtSecret, network: NETWORK, label: LABEL, run, register: name => extraContainers.add(name), report });
    }
    const state = JSON.parse(docker(['inspect', container]))[0]; assert.equal(state.State.Running, true); assert.equal(state.RestartCount, 0);
    report.result = 'PASS';
  } catch (error) { report.result = 'BLOQUEADO'; report.error = `Failed at ${step}: ${error.name}`; }
  finally {
    step = 'cleanup'; const errors = [];
    for (const name of extraContainers) try { if (docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']).trim()) { assert.equal(JSON.parse(docker(['inspect', name]))[0].Config.Labels[LABEL], run); docker(['rm', '-f', name]); } } catch { errors.push('Extra container cleanup failed'); }
    if (containerCreated) try { if (docker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}']).trim()) { assert.equal(JSON.parse(docker(['inspect', container]))[0].Config.Labels[LABEL], run); docker(['rm', '-f', container]); } } catch { errors.push('Container cleanup failed'); }
    if (created) try { if (sql(`select count(*) from pg_database where datname='${database}';`, 'postgres') === '1') { const owner = JSON.parse(sql(`select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='${database}';`, 'postgres')); assert.equal(owner.owner, 'supabase_admin'); assert.equal(owner.marker, run); sql(`drop database ${database} with (force);`, 'postgres'); } } catch { errors.push('Database cleanup failed'); }
    try { assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0'); assert.equal(docker(['ps', '-a', '--filter', `label=${LABEL}=${run}`, '--format', '{{.Names}}']).trim(), ''); } catch { errors.push('Cleanup verification failed'); }
    report.cleanup = { databases: errors.length ? 'unverified' : 0, containers: errors.length ? 'unverified' : 0, errors };
    if (errors.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
