import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { authPassword, BASELINE } from './validateGoTrueLocalHarness.mjs';
import { buildLocalRecoveryEnvironment, LOCAL_RECOVERY_IMAGES } from './localRecoveryConfiguration.mjs';
import { disposableDatabase, localEndpoint } from './validateLocalDbAuthRecovery.mjs';
import { edgeGatewayConfig, EDGE_GATEWAY_IMAGE } from './validateRecoveredEdge.mjs';

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const NETWORK = 'supabase_network_codex-baseline-local-7725bdda';
const LABEL = 'hub.round-trip-local';

export function roleToken(jwtSecret, role) {
  assert.match(jwtSecret, /^[a-f0-9]{96}$/); assert.ok(role === 'anon' || role === 'service_role');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 1800 })).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')}`;
}

// Entorno del validador real: solo loopback, claves efimeras y sin heredar VITE_/SUPABASE_ del proceso.
export function roundTripEnvironment({ baseEnv, gatewayPort, anonKey, serviceKey, institutionId }) {
  const inherited = Object.fromEntries(Object.entries(baseEnv).filter(([key]) => !/^(VITE_|SUPABASE_)/.test(key)));
  assert.match(String(gatewayPort), /^[0-9]{1,5}$/);
  assert.match(institutionId, /^[0-9a-f-]{36}$/);
  return { ...inherited, VITE_SUPABASE_URL: localEndpoint(gatewayPort, '/').slice(0, -1), VITE_SUPABASE_PUBLISHABLE_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_TEST_INSTITUTION_ID: institutionId, SUPABASE_TEST_WORKSPACE_KEY: 'main' };
}

export function lastJsonDocument(output) {
  const start = output.lastIndexOf('\n{');
  return JSON.parse(output.slice(start >= 0 ? start + 1 : output.indexOf('{')));
}

export async function main() {
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const names = { auth: `${database}_auth`, rest: `${database}_rest`, gateway: `${database}_gateway` };
  const report = { run, staging: 'NONE', production: 'NONE', validator: 'scripts/validateStudentTeacherRoundTrip.mjs' };
  let step = 'preflight', created = false, directory;
  const containers = new Set();
  const docker = (args, input, env = process.env) => {
    try { return execFileSync('docker', args, { input, env, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}; SQLSTATE=${String(error.stderr ?? '').match(/\b(?:42501|28P01)\b/)?.[0] ?? 'unavailable'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  const startContainer = (name, image, env, port, extra = []) => {
    assert.equal(docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']).trim(), '');
    containers.add(name);
    docker(['create', '--pull=never', '--name', name, '--label', `${LABEL}=${run}`, '--network', NETWORK, ...(port ? ['-p', `127.0.0.1::${port}`] : []), ...extra, ...Object.keys(env).flatMap(key => ['-e', key]), image], undefined, { ...process.env, ...env });
    docker(['start', name]);
    return port ? JSON.parse(docker(['inspect', name]))[0].NetworkSettings.Ports[`${port}/tcp`][0].HostPort : null;
  };
  const waitFor = async (probe, name) => {
    for (let i = 0; i < 80; i++) {
      try { if (await probe()) return; } catch { /* reintento */ }
      assert.equal(JSON.parse(docker(['inspect', name]))[0].State.Running, true, `${name} exited`);
      await new Promise(done => setTimeout(done, 250));
    }
    throw new Error(`${name} unavailable`);
  };
  try {
    const source = JSON.parse(docker(['inspect', SOURCE]))[0];
    assert.equal(source.Config.Image, 'public.ecr.aws/supabase/postgres:17.6.1.165');
    assert.equal(source.State.Health.Status, 'healthy');
    for (const image of [LOCAL_RECOVERY_IMAGES.auth, LOCAL_RECOVERY_IMAGES.rest, EDGE_GATEWAY_IMAGE]) docker(['image', 'inspect', image]);
    const env = Object.fromEntries(source.Config.Env.map(entry => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
    const config = docker(['exec', SOURCE, 'cat', '/etc/postgresql.schema.sql']);
    const authCredential = authPassword(config, env);
    const restCredential = authPassword(config.split(/\r?\n/).filter(line => /^(?:\\set pgpass\b|ALTER USER authenticator\b)/i.test(line)).join('\n').replaceAll('authenticator', 'supabase_auth_admin'), env);
    step = 'schema preparation';
    const schema = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments']);
    const migrations = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations']);
    assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
    created = true;
    sql(`create database ${database} template template0; comment on database ${database} is '${run}';`, 'postgres');
    sql(schema); sql(migrations);
    for (const file of BASELINE) sql(readFileSync(resolve('supabase/schema', file), 'utf8'));
    const institutionId = randomUUID();
    sql(`insert into public.institutions(id,name,slug) values ('${institutionId}','Synthetic round trip institution','${run}-round-trip');`);
    step = 'local services';
    const jwtSecret = randomBytes(48).toString('hex');
    const authPort = startContainer(names.auth, LOCAL_RECOVERY_IMAGES.auth, buildLocalRecoveryEnvironment({ kind: 'auth', image: LOCAL_RECOVERY_IMAGES.auth, host: SOURCE, database, password: authCredential, jwtSecret }), 9999);
    await waitFor(async () => (await fetch(localEndpoint(authPort, '/health'), { signal: AbortSignal.timeout(1000), redirect: 'error' })).ok, names.auth);
    const anonKey = roleToken(jwtSecret, 'anon'), serviceKey = roleToken(jwtSecret, 'service_role');
    startContainer(names.rest, LOCAL_RECOVERY_IMAGES.rest, buildLocalRecoveryEnvironment({ kind: 'rest', image: LOCAL_RECOVERY_IMAGES.rest, host: SOURCE, database, password: restCredential, jwtSecret }), null);
    directory = await mkdtemp(resolve(tmpdir(), 'hub-recovery-edge-'));
    const gatewayConfig = resolve(directory, 'nginx.conf');
    await writeFile(gatewayConfig, edgeGatewayConfig({ auth: names.auth, rest: names.rest }), { mode: 0o644 });
    const gatewayPort = startContainer(names.gateway, EDGE_GATEWAY_IMAGE, {}, 8000, ['--mount', `type=bind,source=${gatewayConfig},target=/etc/nginx/nginx.conf,readonly`]);
    await waitFor(async () => (await fetch(localEndpoint(gatewayPort, '/rest/v1/institutions?select=id'), { headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }, signal: AbortSignal.timeout(1000), redirect: 'error' })).ok, names.rest);
    step = 'round trip validator';
    const child = spawn(process.execPath, ['scripts/validateStudentTeacherRoundTrip.mjs'], { env: roundTripEnvironment({ baseEnv: process.env, gatewayPort, anonKey, serviceKey, institutionId }), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const exitCode = await new Promise(done => child.on('close', done));
    const summary = lastJsonDocument(stdout);
    report.validatorExitCode = exitCode;
    report.validator = { ...summary, stderrLines: stderr.split('\n').filter(Boolean).length };
    assert.equal(exitCode, 0, 'Round trip validator failed');
    step = 'post-run residue';
    report.residue = JSON.parse(sql(`select json_build_object('authUsers',(select count(*) from auth.users),'studentRecords',(select count(*) from public.student_records),'teacherRecords',(select count(*) from public.teacher_records),'enrollments',(select count(*) from public.subject_enrollments),'grades',(select count(*) from public.student_grades),'sessions',(select count(*) from public.subject_class_sessions),'attendance',(select count(*) from public.subject_attendance_records),'memberships',(select count(*) from public.memberships));`));
    for (const container of containers) { const state = JSON.parse(docker(['inspect', container]))[0]; assert.equal(state.State.Running, true); assert.equal(state.RestartCount, 0); }
    report.result = 'PASS';
  } catch (error) { report.result = 'BLOQUEADO'; report.error = `Failed at ${step}: ${error.name}`; }
  finally {
    const errors = [];
    for (const name of containers) try { if (docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']).trim()) { assert.equal(JSON.parse(docker(['inspect', name]))[0].Config.Labels[LABEL], run); docker(['rm', '-f', name]); } } catch { errors.push('Container cleanup failed'); }
    if (created) try { if (sql(`select count(*) from pg_database where datname='${database}';`, 'postgres') === '1') { const owner = JSON.parse(sql(`select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='${database}';`, 'postgres')); assert.equal(owner.owner, 'supabase_admin'); assert.equal(owner.marker, run); sql(`drop database ${database} with (force);`, 'postgres'); } } catch { errors.push('Database cleanup failed'); }
    if (directory) try { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith('hub-recovery-edge-')); await rm(directory, { recursive: true, force: true }); } catch { errors.push('Temporary directory cleanup failed'); }
    try { assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0'); assert.equal(docker(['ps', '-a', '--filter', `label=${LABEL}=${run}`, '--format', '{{.Names}}']).trim(), ''); } catch { errors.push('Cleanup verification failed'); }
    report.cleanup = { databases: errors.length ? 'unverified' : 0, containers: errors.length ? 'unverified' : 0, temporaryFiles: errors.length ? 'unverified' : 0, errors };
    if (errors.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
