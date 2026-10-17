import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { STUDENT, fixtureSql } from './validateExamEligibilityParityLocal.mjs';

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
// Docente titular de FIX-A-01 en el fixture A/B.
export const TEACHER_ID = 'a2000000-0000-4000-8000-000000000002';
const ENROLLMENT_ID = 'ae000000-0000-4000-8000-000000000001';

// Cada escenario son escrituras sucesivas del docente sobre la misma nota final.
// `expect` es el academic_status guardado o el error esperado; `enroll` intenta la mesa como alumno al final.
export const WRITE_SCENARIOS = Object.freeze([
  { name: 'canonico regular', steps: [{ status: 'regular', expect: 'regular' }], enroll: 'registered' },
  { name: 'Regular con mayuscula', steps: [{ status: 'Regular', expect: 'regular' }], enroll: 'registered' },
  { name: 'regular con espacios', steps: [{ status: ' regular ', expect: 'regular' }], enroll: 'registered' },
  { name: 'APROBADO', steps: [{ status: 'APROBADO', expect: 'approved' }] },
  { name: 'ausente', steps: [{ status: 'ausente', expect: 'absent' }] },
  { name: 'Pendiente', steps: [{ status: 'Pendiente', expect: 'pending' }] },
  { name: 'desaprobada', steps: [{ status: 'desaprobada', expect: 'failed' }] },
  { name: 'promoción con tilde', steps: [{ status: 'Promoción', expect: 'promocionado' }] },
  { name: 'null', steps: [{ status: null, expect: 'pending' }] },
  { name: 'vacio', steps: [{ status: '  ', expect: 'pending' }] },
  { name: 'cursando rechazado', steps: [{ status: 'cursando', expect: 'ACADEMIC_STATUS_INVALID' }] },
  { name: 'xyz rechazado', steps: [{ status: 'xyz', expect: 'ACADEMIC_STATUS_INVALID' }] },
  { name: 'rechazo no pisa la fila', steps: [{ status: 'regular', expect: 'regular' }, { status: 'cursando', expect: 'ACADEMIC_STATUS_INVALID' }], enroll: 'registered' },
  { name: 'libre bloquea la mesa', steps: [{ status: 'Libre', expect: 'libre' }], enroll: 'blocked' },
]);

const quote = value => value === null || value === undefined ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";

export function scenarioSql(scenario) {
  const steps = scenario.steps.map((step, index) => `
set local role authenticated;
select set_config('request.jwt.claim.sub', '${TEACHER_ID}', true);
do $$ begin
  perform public.academic_teacher_upsert_student_grade('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', '${ENROLLMENT_ID}', '${STUDENT.subjectId}', '${STUDENT.programId}', 'final', 1, null, ${quote(step.status)}, null);
  perform set_config('write.step${index}', 'saved', true);
exception when others then
  perform set_config('write.step${index}', sqlerrm || '|' || sqlstate, true);
end $$;
reset role;`).join('\n');
  const enroll = scenario.enroll ? `
set local role authenticated;
select set_config('request.jwt.claim.sub', '${STUDENT.userId}', true);
do $$ begin
  perform public.upsert_exam_enrollment_from_portal('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.userId}', '${STUDENT.recordId}', '${STUDENT.examSubject}', '${STUDENT.subjectId}', '${STUDENT.programId}');
  perform set_config('write.enroll', 'registered', true);
exception when others then
  perform set_config('write.enroll', sqlerrm, true);
end $$;
reset role;` : '';
  const outcomes = scenario.steps.map((_, index) => `current_setting('write.step${index}')`).join(',');
  return `begin;
delete from public.exam_enrollments where student_id='${STUDENT.userId}';
delete from public.student_grades where student_id='${STUDENT.userId}';
${steps}
${enroll}
select json_build_object('steps', json_build_array(${outcomes}), 'enroll', current_setting('write.enroll', true), 'rows', (select coalesce(json_agg(json_build_object('status', g.academic_status, 'lock', g.lock_version)), '[]') from public.student_grades g where g.student_id='${STUDENT.userId}' and g.deleted_at is null));
rollback;`;
}

// Traduce la salida cruda de un escenario a la misma forma que `expect`.
export function evaluateScenario(scenario, output) {
  const failures = [];
  let lastSaved = null;
  scenario.steps.forEach((step, index) => {
    const raw = output.steps[index];
    if (step.expect === 'ACADEMIC_STATUS_INVALID') {
      if (raw !== 'ACADEMIC_STATUS_INVALID|22023') failures.push(`step ${index}: expected ACADEMIC_STATUS_INVALID|22023, got ${raw}`);
    } else if (raw !== 'saved') {
      failures.push(`step ${index}: expected saved, got ${raw}`);
    } else {
      lastSaved = step.expect;
    }
  });
  if (lastSaved === null) {
    if (output.rows.length !== 0) failures.push('rejected write created a row');
  } else if (output.rows.length !== 1 || output.rows[0].status !== lastSaved) {
    failures.push(`expected one row with ${lastSaved}, got ${JSON.stringify(output.rows)}`);
  }
  if (scenario.enroll === 'registered' && output.enroll !== 'registered') failures.push(`enrollment expected registered, got ${output.enroll}`);
  if (scenario.enroll === 'blocked' && output.enroll === 'registered') failures.push('enrollment expected blocked');
  return failures;
}

export async function main() {
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const report = { run, staging: 'NONE', production: 'NONE', fixture: FIXTURE_FILE };
  let step = 'preflight', created = false;
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}; SQLSTATE=${String(error.stderr ?? '').match(/\b(?:42501|23505|23503)\b/)?.[0] ?? 'unavailable'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
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
    for (const file of BASELINE) sql(readFileSync(resolve('supabase/schema', file), 'utf8'));
    step = 'A/B fixture';
    sql(fixtureSql(readFileSync(resolve(FIXTURE_FILE), 'utf8')));
    // fixtureSql corta antes del modo focal: la cursada del alumno y la titularidad del docente se agregan aca.
    sql(`insert into public.subject_enrollments (id, institution_id, workspace_key, subject_id, program_id, student_id, student_record_id)
values ('${ENROLLMENT_ID}', '${STUDENT.institution}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${STUDENT.userId}', '${STUDENT.recordId}');
insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, role)
values ('${STUDENT.institution}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${TEACHER_ID}', 'titular');`);
    step = 'function contract';
    report.function = JSON.parse(sql(`select json_build_object('secdef', p.prosecdef, 'config', p.proconfig, 'anon', has_function_privilege('anon', p.oid, 'execute'), 'authenticated', has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p where p.oid = 'public.academic_teacher_upsert_student_grade(uuid,text,uuid,uuid,uuid,text,text,text,integer,numeric,text,integer)'::regprocedure;`));
    assert.equal(report.function.secdef, true);
    assert.equal(report.function.anon, false);
    assert.equal(report.function.authenticated, true);
    report.scenarios = [];
    for (const scenario of WRITE_SCENARIOS) {
      step = 'scenario ' + scenario.name;
      const output = JSON.parse(sql(scenarioSql(scenario)).split('\n').find(line => line.startsWith('{')));
      report.scenarios.push({ name: scenario.name, steps: output.steps, enroll: output.enroll, rows: output.rows, failures: evaluateScenario(scenario, output) });
    }
    report.failed = report.scenarios.filter(item => item.failures.length).map(item => item.name);
    step = 'assertions';
    assert.deepEqual(report.failed, [], 'Write normalization scenarios failed');
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
