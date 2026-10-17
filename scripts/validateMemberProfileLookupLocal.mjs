import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { fixtureSql } from './validateExamEligibilityParityLocal.mjs';

// SEC.2: academic_resolve_member_profile_by_email solo responde al panel admin (owner/admin/editor) y al superadmin.
// Un alumno o docente (membership viewer) no puede enumerar perfiles de su institucion por email.
// Uso: node scripts/validateMemberProfileLookupLocal.mjs [--control]  (--control quita el filtro de rol: tiene que FALLAR)

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
const INSTITUTION_A = 'a1000000-0000-4000-8000-000000000001';
export const SUPER_ADMIN_ID = 'c2000000-0000-4000-8000-000000000002';

export const SEC2_BLOCK = Object.freeze({
  file: '06_subject_teacher_assignments.sql',
  secured: "      or public.is_member_of_institution(target_institution_id, array['owner', 'admin', 'editor'])\n",
  legacy: '      or public.is_member_of_institution(target_institution_id)\n',
});

// Cada sonda busca un miembro de A por email. `expect` = filas que debe devolver.
export const PROBES = Object.freeze([
  { name: 'admin A busca docente A', caller: 'a2000000-0000-4000-8000-000000000001', email: 'teacher-a@fixture.invalid', role: 'docente', expect: 1 },
  { name: 'admin A busca alumno A', caller: 'a2000000-0000-4000-8000-000000000001', email: 'student-a@fixture.invalid', role: 'alumno', expect: 1 },
  { name: 'superadmin busca alumno A', caller: SUPER_ADMIN_ID, email: 'student-a@fixture.invalid', role: 'alumno', expect: 1 },
  { name: 'alumno A busca docente A', caller: 'a2000000-0000-4000-8000-000000000003', email: 'teacher-a@fixture.invalid', role: 'docente', expect: 0 },
  { name: 'alumno A busca admin A sin rol', caller: 'a2000000-0000-4000-8000-000000000003', email: 'admin-a@fixture.invalid', role: null, expect: 0 },
  { name: 'docente A busca alumno A', caller: 'a2000000-0000-4000-8000-000000000002', email: 'student-a@fixture.invalid', role: 'alumno', expect: 0 },
  { name: 'admin B busca alumno A (cross-tenant)', caller: 'b2000000-0000-4000-8000-000000000001', email: 'student-a@fixture.invalid', role: 'alumno', expect: 0 },
]);

export function applySec2Control(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  assert.equal(normalized.split(SEC2_BLOCK.secured).length - 1, 1, 'Bloque SEC.2 no encontrado una sola vez');
  return normalized.replace(SEC2_BLOCK.secured, SEC2_BLOCK.legacy);
}

export function probeSql(probe) {
  const role = probe.role === null ? 'null' : `'${probe.role}'`;
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${probe.caller}', true);
select count(*) from public.academic_resolve_member_profile_by_email('${INSTITUTION_A}', 'main', '${probe.email}', ${role});
rollback;`;
}

export async function main(argv = process.argv.slice(2)) {
  const control = argv.includes('--control');
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const report = { task: 'SEC.2', run, mode: control ? 'control_without_role_filter' : 'release_v1', staging: 'NONE', production: 'NONE', fixture: FIXTURE_FILE };
  let step = 'preflight', created = false;
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}; SQLSTATE=${String(error.stderr ?? '').match(/\b(?:42501|23505|23503|42883)\b/)?.[0] ?? 'unavailable'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  try {
    const source = JSON.parse(docker(['inspect', SOURCE]))[0];
    assert.equal(source.Config.Image, 'public.ecr.aws/supabase/postgres:17.6.1.165');
    assert.equal(source.State.Health.Status, 'healthy');
    step = 'schema preparation';
    const schema = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments']);
    const migrations = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations']);
    assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0');
    created = true;
    sql(`create database ${database} template template0; comment on database ${database} is '${run}';`, 'postgres');
    sql(schema); sql(migrations);
    for (const file of BASELINE) {
      const text = readFileSync(resolve('supabase/schema', file), 'utf8');
      sql(control && file === SEC2_BLOCK.file ? applySec2Control(text) : text);
    }
    step = 'A/B fixture';
    sql(fixtureSql(readFileSync(resolve(FIXTURE_FILE), 'utf8')));
    sql(`insert into auth.users (id, email, raw_app_meta_data) values ('${SUPER_ADMIN_ID}', 'superadmin-sec2@fixture.invalid', '{"is_global_admin":true}');`);
    step = 'function contract';
    report.function = JSON.parse(sql(`select json_build_object('secdef', p.prosecdef, 'config', p.proconfig, 'anon', has_function_privilege('anon', p.oid, 'execute'), 'authenticated', has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p where p.oid = 'public.academic_resolve_member_profile_by_email(uuid,text,text,text)'::regprocedure;`));
    assert.equal(report.function.secdef, true);
    assert.equal(report.function.anon, false);
    assert.equal(report.function.authenticated, true);
    step = 'probes';
    const results = PROBES.map(probe => Number(sql(probeSql(probe)).split('\n').filter(Boolean).pop()));
    report.probes = PROBES.map((probe, index) => ({ name: probe.name, expect: probe.expect, rows: results[index] }));
    report.failed = report.probes.filter(probe => probe.rows !== probe.expect).map(probe => probe.name);
    step = 'assertions';
    assert.deepEqual(report.failed, [], 'Member profile lookup probes failed');
    report.result = 'PASS';
  } catch (error) { report.result = 'FAIL'; report.error = `Failed at ${step}: ${error.message.split('\n')[0]}`; }
  finally {
    const errors = [];
    if (created) try { if (sql(`select count(*) from pg_database where datname='${database}';`, 'postgres') === '1') { const owner = JSON.parse(sql(`select json_build_object('owner',pg_get_userbyid(datdba),'marker',shobj_description(oid,'pg_database')) from pg_database where datname='${database}';`, 'postgres')); assert.equal(owner.owner, 'supabase_admin'); assert.equal(owner.marker, run); sql(`drop database ${database} with (force);`, 'postgres'); } assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0'); } catch { errors.push('Database cleanup failed'); }
    report.cleanup = { databases: errors.length ? 'unverified' : 0, errors };
    if (errors.length) report.result = 'BLOQUEADO';
  }
  console.log(JSON.stringify(report, null, 2)); if (report.result !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
