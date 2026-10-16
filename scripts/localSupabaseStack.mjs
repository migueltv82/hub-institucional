import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { authPassword, BASELINE } from './validateGoTrueLocalHarness.mjs';
import { buildLocalRecoveryEnvironment, LOCAL_RECOVERY_IMAGES } from './localRecoveryConfiguration.mjs';
import { disposableDatabase, localEndpoint } from './validateLocalDbAuthRecovery.mjs';
import { edgeGatewayConfig, EDGE_GATEWAY_IMAGE } from './validateRecoveredEdge.mjs';

export const STACK_SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
export const STACK_NETWORK = 'supabase_network_codex-baseline-local-7725bdda';

export function roleToken(jwtSecret, role) {
  assert.match(jwtSecret, /^[a-f0-9]{96}$/); assert.ok(role === 'anon' || role === 'service_role');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 1800 })).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')}`;
}

// Stack descartable sobre el contenedor fuente: base con baseline canonico, GoTrue, PostgREST y gateway
// nginx publicado solo en loopback. Todo lleva label `${label}=${run}`; teardown verifica cleanup 0.
export async function createLocalStack({ label, report }) {
  assert.match(label, /^hub\.[a-z-]+$/);
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const names = { auth: `${database}_auth`, rest: `${database}_rest`, gateway: `${database}_gateway` };
  const containers = new Set();
  const state = { step: 'preflight', created: false, directory: null };
  const docker = (args, input, env = process.env) => {
    try { return execFileSync('docker', args, { input, env, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${state.step}; SQLSTATE=${String(error.stderr ?? '').match(/\b(?:42501|28P01)\b/)?.[0] ?? 'unavailable'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', STACK_SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  const startContainer = (name, image, env, port, extra = [], command = []) => {
    assert.equal(docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']).trim(), '');
    containers.add(name);
    docker(['create', '--pull=never', '--name', name, '--label', `${label}=${run}`, '--network', STACK_NETWORK, ...(port ? ['-p', `127.0.0.1::${port}`] : []), ...extra, ...Object.keys(env).flatMap(key => ['-e', key]), image, ...command], undefined, { ...process.env, ...env });
    docker(['start', name]);
    return port ? JSON.parse(docker(['inspect', name]))[0].NetworkSettings.Ports[`${port}/tcp`][0].HostPort : null;
  };
  const waitFor = async (probe, name) => {
    for (let i = 0; i < 120; i++) {
      try { if (await probe()) return; } catch { /* reintento */ }
      assert.equal(JSON.parse(docker(['inspect', name]))[0].State.Running, true, `${name} exited`);
      await new Promise(done => setTimeout(done, 250));
    }
    throw new Error(`${name} unavailable`);
  };
  const teardown = async () => {
    const errors = [];
    for (const name of containers) try { if (docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']).trim()) { assert.equal(JSON.parse(docker(['inspect', name]))[0].Config.Labels[label], run); docker(['rm', '-f', name]); } } catch { errors.push('Container cleanup failed'); }
    if (state.created) try { if (sql(`select count(*) from pg_database where datname='${database}';`, 'postgres') === '1') { const owner = JSON.parse(sql(`select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='${database}';`, 'postgres')); assert.equal(owner.owner, 'supabase_admin'); assert.equal(owner.marker, run); sql(`drop database ${database} with (force);`, 'postgres'); } } catch { errors.push('Database cleanup failed'); }
    if (state.directory) try { assert.equal(dirname(resolve(state.directory)), resolve(tmpdir())); assert.ok(basename(state.directory).startsWith('hub-recovery-edge-')); await rm(state.directory, { recursive: true, force: true }); } catch { errors.push('Temporary directory cleanup failed'); }
    try { assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0'); assert.equal(docker(['ps', '-a', '--filter', `label=${label}=${run}`, '--format', '{{.Names}}']).trim(), ''); } catch { errors.push('Cleanup verification failed'); }
    return { databases: errors.length ? 'unverified' : 0, containers: errors.length ? 'unverified' : 0, temporaryFiles: errors.length ? 'unverified' : 0, errors };
  };
  const stack = { run, database, names, docker, sql, startContainer, waitFor, teardown, state, register: name => containers.add(name) };
  if (report) report.run = run;
  try {
    await setupStack(stack);
  } catch (error) {
    if (report) report.cleanup = await teardown();
    stack.tornDown = true;
    throw error;
  }
  return stack;
}

async function setupStack(stack) {
  const { docker, sql, startContainer, waitFor, state, names, database, run } = stack;
  const source = JSON.parse(docker(['inspect', STACK_SOURCE]))[0];
  assert.equal(source.Config.Image, 'public.ecr.aws/supabase/postgres:17.6.1.165');
  assert.equal(source.State.Health.Status, 'healthy');
  for (const image of [LOCAL_RECOVERY_IMAGES.auth, LOCAL_RECOVERY_IMAGES.rest, EDGE_GATEWAY_IMAGE]) docker(['image', 'inspect', image]);
  const env = Object.fromEntries(source.Config.Env.map(entry => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
  const config = docker(['exec', STACK_SOURCE, 'cat', '/etc/postgresql.schema.sql']);
  const authCredential = authPassword(config, env);
  const restCredential = authPassword(config.split(/\r?\n/).filter(line => /^(?:\\set pgpass\b|ALTER USER authenticator\b)/i.test(line)).join('\n').replaceAll('authenticator', 'supabase_auth_admin'), env);
  state.step = 'schema preparation';
  const schema = docker(['exec', STACK_SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments']);
  const migrations = docker(['exec', STACK_SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations']);
  assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
  state.created = true;
  sql(`create database ${database} template template0; comment on database ${database} is '${run}';`, 'postgres');
  sql(schema); sql(migrations);
  for (const file of BASELINE) sql(readFileSync(resolve('supabase/schema', file), 'utf8'));
  state.step = 'local services';
  const jwtSecret = randomBytes(48).toString('hex');
  stack.jwtSecret = jwtSecret;
  stack.ports = { auth: startContainer(names.auth, LOCAL_RECOVERY_IMAGES.auth, buildLocalRecoveryEnvironment({ kind: 'auth', image: LOCAL_RECOVERY_IMAGES.auth, host: STACK_SOURCE, database, password: authCredential, jwtSecret }), 9999) };
  await waitFor(async () => (await fetch(localEndpoint(stack.ports.auth, '/health'), { signal: AbortSignal.timeout(1000), redirect: 'error' })).ok, names.auth);
  stack.anonKey = roleToken(jwtSecret, 'anon'); stack.serviceKey = roleToken(jwtSecret, 'service_role');
  startContainer(names.rest, LOCAL_RECOVERY_IMAGES.rest, buildLocalRecoveryEnvironment({ kind: 'rest', image: LOCAL_RECOVERY_IMAGES.rest, host: STACK_SOURCE, database, password: restCredential, jwtSecret }), null);
  state.directory = await mkdtemp(resolve(tmpdir(), 'hub-recovery-edge-'));
  const gatewayConfig = resolve(state.directory, 'nginx.conf');
  await writeFile(gatewayConfig, edgeGatewayConfig({ auth: names.auth, rest: names.rest }), { mode: 0o644 });
  stack.ports.gateway = startContainer(names.gateway, EDGE_GATEWAY_IMAGE, {}, 8000, ['--mount', `type=bind,source=${gatewayConfig},target=/etc/nginx/nginx.conf,readonly`]);
  await waitFor(async () => (await fetch(localEndpoint(stack.ports.gateway, '/rest/v1/institutions?select=id'), { headers: { apikey: stack.serviceKey, Authorization: 'Bearer ' + stack.serviceKey }, signal: AbortSignal.timeout(1000), redirect: 'error' })).ok, names.rest);
  stack.authRequest = async (path, { method = 'POST', body, token } = {}) => {
    const response = await fetch(localEndpoint(stack.ports.auth, path), { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000), redirect: 'error' });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
}
