import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { STUDENT, fixtureSql } from './validateExamEligibilityParityLocal.mjs';
import { TEACHER_ID, WRITE_SCENARIOS, evaluateScenario, scenarioSql } from './validateAcademicStatusWriteLocal.mjs';

// 03.5c: CHECK canonico de student_grades.academic_status. Prueba que el baseline lo deja validado,
// que rechaza escrituras directas no canonicas, que re-aplicar 07 con filas malas aborta sin tocar
// datos, que aplica cuando la tabla esta limpia y que el RPC del docente (03.5b) sigue normalizando.

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
const OPERATIONS_FILE = '07_academic_operations.sql';
const ENROLLMENT_ID = 'ae000000-0000-4000-8000-000000000001';
const BAD_GRADE_ID = 'ae350000-0000-4000-8000-00000000035c';
export const CONSTRAINT = 'student_grades_academic_status_check';
export const CANONICAL_STATUSES = Object.freeze(['pending', 'regular', 'libre', 'promocionado', 'approved', 'failed', 'absent']);
// Subconjunto de 03.5b: normaliza, rechaza y la condicion sigue decidiendo la mesa.
export const RPC_SCENARIOS = Object.freeze(['Regular con mayuscula', 'cursando rechazado', 'rechazo no pisa la fila', 'libre bloquea la mesa']);

export function constraintStateSql() {
  return `select coalesce((select json_build_object('present', true, 'validated', c.convalidated, 'definition', pg_get_constraintdef(c.oid))
from pg_constraint c where c.conrelid = 'public.student_grades'::regclass and c.conname = '${CONSTRAINT}'), json_build_object('present', false));`;
}

// Fila directa (como owner, salteando el RPC) para simular un dato legacy o una escritura no canonica.
export function directGradeSql(status) {
  const value = "'" + String(status).replaceAll("'", "''") + "'";
  return `insert into public.student_grades (id, institution_id, workspace_key, student_id, student_record_id, subject_enrollment_id, subject_id, program_id, grade_type, attempt_number, academic_status)
values ('${BAD_GRADE_ID}', '${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', '${ENROLLMENT_ID}', '${STUDENT.subjectId}', '${STUDENT.programId}', 'final', 35, ${value});`;
}

export function definitionIsCanonical(definition) {
  const values = [...String(definition ?? '').matchAll(/'([^']+)'::text/g)].map(match => match[1]);
  return values.length === CANONICAL_STATUSES.length && CANONICAL_STATUSES.every(status => values.includes(status));
}

export async function main() {
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const report = { run, staging: 'NONE', production: 'NONE', fixture: FIXTURE_FILE, checks: {} };
  let step = 'preflight', created = false;
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) {
      const failure = new Error(`Local operation failed at ${step}; SQLSTATE=${String(error.stderr ?? '').match(/\b(?:42501|23505|23503|23514)\b/)?.[0] ?? 'unavailable'}`);
      failure.stderr = String(error.stderr ?? '');
      throw failure;
    }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  // Devuelve el error de Postgres (solo la primera linea) en vez de cortar el harness.
  const sqlError = query => { try { sql(query); return null; } catch (error) { return (error.stderr.match(/ERROR:\s+([^\n]+)/)?.[1] ?? error.message).trim(); } };
  const constraintState = () => JSON.parse(sql(constraintStateSql()));
  const operations = readFileSync(resolve('supabase/schema', OPERATIONS_FILE), 'utf8');
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
    sql(`insert into public.subject_enrollments (id, institution_id, workspace_key, subject_id, program_id, student_id, student_record_id)
values ('${ENROLLMENT_ID}', '${STUDENT.institution}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${STUDENT.userId}', '${STUDENT.recordId}');
insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, role)
values ('${STUDENT.institution}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${TEACHER_ID}', 'titular');`);

    step = 'baseline constraint';
    const baseline = constraintState();
    report.checks.baseline = { present: baseline.present, validated: baseline.validated, canonical: definitionIsCanonical(baseline.definition) };
    assert.deepEqual(report.checks.baseline, { present: true, validated: true, canonical: true });

    step = 'direct writes';
    report.checks.directWrites = {
      canonicalAccepted: sqlError(`begin; ${directGradeSql('regular')} rollback;`) === null,
      mixedCaseRejected: /student_grades_academic_status_check/.test(sqlError(`begin; ${directGradeSql('Regular')} rollback;`) ?? ''),
      synonymRejected: /student_grades_academic_status_check/.test(sqlError(`begin; ${directGradeSql('aprobado')} rollback;`) ?? ''),
    };
    assert.deepEqual(report.checks.directWrites, { canonicalAccepted: true, mixedCaseRejected: true, synonymRejected: true });

    step = 'abort with noncanonical rows';
    // Simula una base anterior a 03.5c: sin CHECK y con una fila legacy no canonica.
    sql(`alter table public.student_grades drop constraint ${CONSTRAINT}; ${directGradeSql('Regular')}`);
    const abortError = sqlError(operations);
    const afterAbort = constraintState();
    const badRow = sql(`select academic_status from public.student_grades where id = '${BAD_GRADE_ID}';`);
    report.checks.abort = {
      error: abortError,
      clearMessage: /ACADEMIC_STATUS_NONCANONICAL_ROWS: 1 filas/.test(abortError ?? ''),
      constraintPresent: afterAbort.present,
      rowUntouched: badRow === 'Regular',
    };
    assert.equal(report.checks.abort.clearMessage, true, 're-aplicar 07 con filas malas debe abortar con mensaje claro');
    assert.equal(report.checks.abort.constraintPresent, false, 'el abort no debe dejar el CHECK a medias');
    assert.equal(report.checks.abort.rowUntouched, true, 'el abort no debe tocar datos');

    step = 'apply on clean table';
    sql(`delete from public.student_grades where id = '${BAD_GRADE_ID}';`);
    sql(operations);
    const applied = constraintState();
    sql(operations);
    const reapplied = constraintState();
    report.checks.apply = {
      validated: applied.present && applied.validated,
      canonical: definitionIsCanonical(applied.definition),
      idempotent: JSON.stringify(applied) === JSON.stringify(reapplied),
    };
    assert.deepEqual(report.checks.apply, { validated: true, canonical: true, idempotent: true });

    report.scenarios = [];
    for (const name of RPC_SCENARIOS) {
      const scenario = WRITE_SCENARIOS.find(item => item.name === name);
      assert.ok(scenario, `escenario 03.5b inexistente: ${name}`);
      step = 'rpc ' + name;
      const output = JSON.parse(sql(scenarioSql(scenario)).split('\n').find(line => line.startsWith('{')));
      report.scenarios.push({ name, steps: output.steps, enroll: output.enroll, rows: output.rows, failures: evaluateScenario(scenario, output) });
    }
    report.failed = report.scenarios.filter(item => item.failures.length).map(item => item.name);
    step = 'assertions';
    assert.deepEqual(report.failed, [], 'El RPC de 03.5b debe seguir normalizando con el CHECK');
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
