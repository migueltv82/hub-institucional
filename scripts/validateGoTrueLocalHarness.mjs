import { buildLocalRecoveryEnvironment } from './localRecoveryConfiguration.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const IMAGE = 'public.ecr.aws/supabase/gotrue:v2.196.0';
const LABEL = 'hub.gotrue-harness';
export const BASELINE = ['01_foundation.sql', '02_academic_relational_schema.sql',
  '03_workspace_data.sql', '04_teacher_exam_date_exclusions.sql',
  '05_workspace_operational_compat.sql', '06_subject_teacher_assignments.sql',
  '07_academic_operations.sql', '08_exam_tables.sql', '05_student_portal_secure_read.sql'];

// Parse only the standard CLI post-init assignment; never guess or reset a password.
export function authPassword(sql, localEnvironment = {}) {
  const matches = [...sql.matchAll(/ALTER\s+USER\s+supabase_auth_admin\s+WITH\s+PASSWORD\s+'((?:[^']|'')*)'\s*;/gi)];
  const variableAssignments = [...sql.matchAll(/ALTER\s+USER\s+supabase_auth_admin\s+WITH\s+PASSWORD\s+:'pgpass'\s*;/gi)];
  assert.equal(matches.length + variableAssignments.length, 1, 'Expected one standard Auth password assignment');
  let value;
  if (matches.length) value = matches[0][1].replaceAll("''", "'");
  else {
    // CLI v2 emits a psql variable backed by a literal echo. Parse, never execute it.
    const definitions = [...sql.matchAll(/^\\set pgpass\s+`echo "([^"`\\\r\n]+)"`\s*$/gm)];
    assert.equal(definitions.length, 1, 'Unsupported or ambiguous CLI password definition');
    value = definitions[0][1];
    if (value === '$PGPASSWORD') value = localEnvironment.POSTGRES_PASSWORD;
    else assert.ok(!value.includes('$'), 'Unsupported shell interpolation');
  }
  assert.ok(value && !/[\r\n\0]/.test(value), 'Invalid local Auth credential');
  return value;
}

export function authUri(password, host, database) {
  assert.equal(host, SOURCE, 'Only the allowlisted local Docker source is supported');
  assert.match(database, /^gotrue_harness_[a-f0-9]{16}$/);
  return `postgres://supabase_auth_admin:${encodeURIComponent(password)}@${host}:5432/${database}?options=-csearch_path%3Dauth`;
}

export function normalizeAcl(snapshot) {
  // pg_dump may reorder grants; compare grantees, rights and grantors, not order.
  return JSON.stringify(JSON.parse(snapshot, (key, value) =>
    key === 'acl' && typeof value === 'string' ? value.slice(1, -1).split(',').sort() : value));
}

export async function main() {
  const run = randomBytes(8).toString('hex');
  const database = `gotrue_harness_${run}`;
  const container = `${database}_auth`;
  const report = { run, source: SOURCE, image: IMAGE, staging: 'NONE', production: 'NONE', fixtures: 0, backupRestore: false };
  let created = false;
  let containerCreated = false;
  let step = 'preflight';
  const docker = (args, input) => {
    try {
      return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true,
        timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      // Child-process errors embed arguments/input and may contain credentials.
      const states = [...new Set(String(error.stderr ?? '').match(/\b(?:42501|28P01)\b/g) ?? [])];
      throw new Error(`Local operation failed at ${step}; SQLSTATE=${states.join(',') || 'unavailable'}`);
    }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  const history = db => sql('select coalesce(json_agg(version order by version),\'[]\') from auth.schema_migrations;', db);
  const acl = db => sql(`select json_build_object('schemas',(select json_agg(row_to_json(x) order by x.nspname) from (select nspname,pg_get_userbyid(nspowner) owner,nspacl::text acl from pg_namespace where nspname='auth') x),'objects',(select json_agg(row_to_json(x) order by x.relname) from (select relname,relkind,pg_get_userbyid(relowner) owner,relacl::text acl from pg_class where relnamespace='auth'::regnamespace) x),'functions',(select json_agg(row_to_json(x) order by x.name) from (select oid::regprocedure::text name,pg_get_userbyid(proowner) owner,proacl::text acl from pg_proc where pronamespace='auth'::regnamespace) x));`, db);
  try {
    const source = JSON.parse(docker(['inspect', SOURCE]))[0];
    assert.equal(source.Config.Image, 'public.ecr.aws/supabase/postgres:17.6.1.165');
    assert.equal(source.State.Health.Status, 'healthy');
    const networks = Object.keys(source.NetworkSettings.Networks);
    assert.equal(networks.length, 1, 'Ambiguous source network');
    assert.equal(networks[0], 'supabase_network_codex-baseline-local-7725bdda');
    docker(['image', 'inspect', IMAGE]); // Cached only: no pulls.
    step = 'standard credential parsing';
    const localEnvironment = Object.fromEntries(source.Config.Env.map(entry => {
      const offset = entry.indexOf('=');
      return [entry.slice(0, offset), entry.slice(offset + 1)];
    }));
    const password = authPassword(docker(['exec', SOURCE, 'cat', '/etc/postgresql.schema.sql']), localEnvironment);
    step = 'source history verification';
    const sourceHistory = history('postgres');
    const sourceAcl = normalizeAcl(acl('postgres'));
    report.sourceMigrations = JSON.parse(sourceHistory).length;
    assert.equal(report.sourceMigrations, 77, 'Source Auth version differs from audited contract');
    step = 'schema preparation';
    // Schema only preserves cross-schema Auth trigger dependencies. No user rows.
    // Reapply all nine canonical files to certify the baseline in the disposable DB.
    const schema = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments']);
    const migrations = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations']);
    assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
    created = true;
    sql(`create database ${database};`, 'postgres');
    sql(schema);
    sql(migrations);
    assert.equal(history(database), sourceHistory, 'Migration versions differ');
    const destinationAcl = normalizeAcl(acl(database));
    assert.equal(destinationAcl, sourceAcl, 'Auth owners/ACL differ before baseline');
    step = 'canonical baseline';
    for (const file of BASELINE) sql(readFileSync(resolve('supabase/schema', file), 'utf8'));
    assert.equal(normalizeAcl(acl(database)), sourceAcl, 'Baseline changed Auth owners/ACL');
    assert.equal(sql('select count(*) from auth.users;'), '0', 'No users/fixtures allowed');
    report.baselineFiles = BASELINE;
    // Verify the real credential over TCP without putting it in arguments or files.
    step = 'Auth TCP credential verification';
    report.effectiveRole = docker(['exec', '-i', SOURCE, 'sh', '-c',
      'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -X -h 127.0.0.1 -U supabase_auth_admin -d "$1" -At -v ON_ERROR_STOP=1 -c "select current_user;"', 'sh', database], password + '\n').trim();
    assert.equal(report.effectiveRole, 'supabase_auth_admin');
    const environment=buildLocalRecoveryEnvironment({kind:'auth',image:IMAGE,host:SOURCE,database,password,jwtSecret:randomBytes(48).toString('hex')});
    step = 'GoTrue container creation';
    assert.equal(docker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}']).trim(), '');
    containerCreated = true; // Cleanup also covers a successful create whose CLI response is lost.
    // Docker CLI reads environment values from this child process, never command arguments.
    try {
      execFileSync('docker', ['create', '--pull=never', '--name', container, '--label', `${LABEL}=${run}`,
        '--network', networks[0], '-p', '127.0.0.1::9999', ...Object.keys(environment).flatMap(key => ['-e', key]), IMAGE],
      { env: { ...process.env, ...environment }, windowsHide: true, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      throw new Error('GoTrue creation failed; details withheld to protect credentials');
    }
    docker(['start', container]);
    const port = JSON.parse(docker(['inspect', container]))[0].NetworkSettings.Ports['9999/tcp'][0].HostPort;
    const url = `http://127.0.0.1:${port}/health`;
    step = 'GoTrue health';
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000), redirect: 'error' });
        if (response.ok) break;
      } catch (error) {
        if (attempt === 39) throw new Error(`Health unavailable: ${error.name}`);
      }
      assert.equal(JSON.parse(docker(['inspect', container]))[0].State.Running, true, 'GoTrue exited');
      await new Promise(resolveWait => setTimeout(resolveWait, 250));
    }
    for (let sample = 0; sample < 5; sample++) {
      await new Promise(resolveWait => setTimeout(resolveWait, 1000));
      assert.equal((await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' })).status, 200);
      const state = JSON.parse(docker(['inspect', container]))[0];
      assert.equal(state.State.Running, true);
      assert.equal(state.RestartCount, 0);
    }
    const logResult = spawnSync('docker', ['logs', container], { encoding: 'utf8', windowsHide: true,
      timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(logResult.status, 0, 'Could not inspect Auth logs');
    const logs = logResult.stdout + logResult.stderr;
    assert.ok(!/42501|28P01/.test(logs), 'Auth SQLSTATE failure');
    assert.equal(history(database), sourceHistory, 'GoTrue changed history unexpectedly: incompatible version');
    assert.equal(normalizeAcl(acl(database)), sourceAcl, 'GoTrue changed Auth owners/ACL');
    assert.equal(sql('select count(*) from auth.users;'), '0');
    report.destinationMigrations = JSON.parse(history(database)).length;
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
    const token = `${header}.${payload}.${createHmac('sha256', environment.GOTRUE_JWT_SECRET).update(`${header}.${payload}`).digest('base64url')}`;
    const users = await fetch(`http://127.0.0.1:${port}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(2000), redirect: 'error' });
    assert.equal(users.status, 200, 'Read-only Auth database query failed');
    assert.deepEqual((await users.json()).users, [], 'Disposable Auth contains users');
    report.databaseRoleSessions = sql(`select count(*) from pg_stat_activity where datname='${database}' and usename='supabase_auth_admin';`);
    // The pool can close idle connections immediately. Recorded statement counters
    // prove the real role/database even after the connection has closed.
    report.databaseRoleStatements = Number(sql(`select count(*) from extensions.pg_stat_statements s join pg_roles r on r.oid=s.userid join pg_database d on d.oid=s.dbid where d.datname='${database}' and r.rolname='supabase_auth_admin';`));
    assert.ok(report.databaseRoleStatements > 0, 'No Auth role statements observed');
    report.healthy = true;
    report.healthSamples = 5;
    report.authAclUnchanged = true;
    report.sqlstateErrors = [];
    report.result = 'PASS';
  } catch (error) {
    report.result = 'BLOQUEADO';
    // Assertion diagnostics can contain SQL/schema values: publish only the step.
    report.error = `Failed at ${step}: ${error.name}`;
  } finally {
    step = 'cleanup';
    const errors = [];
    if (containerCreated) {
      try {
        const exists = docker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}']).trim();
        if (exists) {
          const owned = JSON.parse(docker(['inspect', container]))[0];
          assert.equal(owned.Config.Labels[LABEL], run);
          docker(['rm', '-f', container]);
        }
      } catch { errors.push('Auth container cleanup failed'); }
    }
    if (created) {
      try {
        assert.match(database, /^gotrue_harness_[a-f0-9]{16}$/);
        sql(`drop database if exists ${database} with (force);`, 'postgres');
      } catch { errors.push('Isolated database cleanup failed'); }
    }
    try {
      assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
      assert.equal(docker(['ps', '-a', '--filter', `label=${LABEL}=${run}`, '--format', '{{.Names}}']).trim(), '');
    } catch { errors.push('Cleanup verification failed'); }
    report.cleanup = { databases: errors.length ? 'unverified' : 0, containers: errors.length ? 'unverified' : 0, temporaryFiles: 0, errors };
    if (errors.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.result !== 'PASS') process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
