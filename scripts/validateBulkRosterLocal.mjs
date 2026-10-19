import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { STUDENT, fixtureSql } from './validateExamEligibilityParityLocal.mjs';

// I2b: titularidades (academic_admin_bulk_assign_teachers) y cursadas (academic_admin_bulk_enroll_students)
// desde las planillas. Permisos, rechazos por fila, idempotencia, bajas que no se reactivan solas y, al
// final, que el docente asignado pueda cargarle la nota al alumno inscripto (lo que antes se hacia de a uno).

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
export const ACTORS = Object.freeze({
  adminA: 'a2000000-0000-4000-8000-000000000001',
  adminB: 'b2000000-0000-4000-8000-000000000001',
  teacherA: 'a2000000-0000-4000-8000-000000000002',
  studentA: STUDENT.userId,
});
export const TEACHER_DNI = '20111222';
export const NO_ACCOUNT_TEACHER_DNI = '20333444';
export const STUDENT_DNI = '30111222';
export const NO_ACCOUNT_STUDENT_DNI = '30222333';

const quote = value => value === null || value === undefined ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";

export function bulkSql(fn, actor, rows) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${actor}', true);
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: actor, role: 'authenticated' }))}, true);
do $$ begin
  perform set_config('bulk.result', public.${fn}('${STUDENT.institution}', 'main', ${quote(JSON.stringify(rows))}::jsonb)::text, true);
exception when others then
  perform set_config('bulk.result', json_build_object('error', sqlerrm, 'sqlstate', sqlstate)::text, true);
end $$;
select current_setting('bulk.result');
commit;`;
}

const teacherRow = overrides => ({ fila: '2', dni: TEACHER_DNI, carrera: 'FIX-A', materia: STUDENT.subjectId, rol: '', ...overrides });
const studentRow = overrides => ({ fila: '2', dni: STUDENT_DNI, carrera: 'Fixture Career A', materia: STUDENT.subjectId, ...overrides });

export const CASES = Object.freeze([
  { name: 'el alumno no asigna docentes', fn: 'academic_admin_bulk_assign_teachers', actor: 'studentA', rows: [teacherRow()], expectError: '42501' },
  { name: 'un docente no inscribe cursadas', fn: 'academic_admin_bulk_enroll_students', actor: 'teacherA', rows: [studentRow()], expectError: '42501' },
  { name: 'gestion de otra institucion no asigna', fn: 'academic_admin_bulk_assign_teachers', actor: 'adminB', rows: [teacherRow()], expectError: '42501' },
  { name: 'payload que no es lista', fn: 'academic_admin_bulk_enroll_students', actor: 'adminA', rows: { dni: STUDENT_DNI }, expectError: '22023' },
  {
    name: 'titularidades: rechazos por fila',
    fn: 'academic_admin_bulk_assign_teachers', actor: 'adminA',
    rows: [teacherRow({ fila: '3', dni: '' }), teacherRow({ fila: '4', rol: 'jtp' }), teacherRow({ fila: '5', dni: '29999999' }), teacherRow({ fila: '6', dni: NO_ACCOUNT_TEACHER_DNI }), teacherRow({ fila: '7', materia: 'FIX-B-01' }), teacherRow({ fila: '8', carrera: 'Otra' })],
    expect: { creadas: 0, actualizadas: 0, sin_cambios: 0, rechazadas: 6, motivos: ['FALTAN_DATOS', 'ROL_INVALIDO', 'DOCENTE_NO_ENCONTRADO', 'DOCENTE_SIN_CUENTA', 'MATERIA_NO_ESTA_EN_EL_PLAN', 'CARRERA_NO_ENCONTRADA'] },
    state: { assignments: 0 },
  },
  { name: 'titularidad creada (rol vacio = titular)', fn: 'academic_admin_bulk_assign_teachers', actor: 'adminA', rows: [teacherRow()], expect: { creadas: 1, actualizadas: 0, sin_cambios: 0, rechazadas: 0, motivos: [] }, state: { assignments: 1, role: 'titular' } },
  { name: 'repetir no duplica', fn: 'academic_admin_bulk_assign_teachers', actor: 'adminA', rows: [teacherRow({ rol: 'TITULAR' })], expect: { creadas: 0, actualizadas: 0, sin_cambios: 1, rechazadas: 0, motivos: [] }, state: { assignments: 1, role: 'titular' } },
  { name: 'cambio de rol a suplente', fn: 'academic_admin_bulk_assign_teachers', actor: 'adminA', rows: [teacherRow({ rol: 'Suplente' })], expect: { creadas: 0, actualizadas: 1, sin_cambios: 0, rechazadas: 0, motivos: [] }, state: { assignments: 1, role: 'suplente' } },
  { name: 'vuelve a titular', fn: 'academic_admin_bulk_assign_teachers', actor: 'adminA', rows: [teacherRow({ rol: 'titular' })], expect: { creadas: 0, actualizadas: 1, sin_cambios: 0, rechazadas: 0, motivos: [] }, state: { assignments: 1, role: 'titular' } },
  {
    name: 'cursadas: rechazos por fila',
    fn: 'academic_admin_bulk_enroll_students', actor: 'adminA',
    rows: [studentRow({ fila: '3', materia: '' }), studentRow({ fila: '4', dni: NO_ACCOUNT_STUDENT_DNI }), studentRow({ fila: '5', dni: '39999999' }), studentRow({ fila: '6', materia: 'FIX-B-01' })],
    expect: { creadas: 0, sin_cambios: 0, omitidas: 0, rechazadas: 4, motivos: ['FALTAN_DATOS', 'ALUMNO_SIN_CUENTA', 'ALUMNO_NO_ENCONTRADO', 'MATERIA_NO_ESTA_EN_EL_PLAN'] },
    state: { enrollments: 0 },
  },
  { name: 'cursada creada', fn: 'academic_admin_bulk_enroll_students', actor: 'adminA', rows: [studentRow({ carrera: 'FIX-A' })], expect: { creadas: 1, sin_cambios: 0, omitidas: 0, rechazadas: 0, motivos: [] }, state: { enrollments: 1, enrollmentStatus: 'active' } },
  { name: 'repetir la cursada no duplica', fn: 'academic_admin_bulk_enroll_students', actor: 'adminA', rows: [studentRow()], expect: { creadas: 0, sin_cambios: 1, omitidas: 0, rechazadas: 0, motivos: [] }, state: { enrollments: 1, enrollmentStatus: 'active' } },
  { name: 'una cursada dada de baja no se reactiva sola', fn: 'academic_admin_bulk_enroll_students', actor: 'adminA', dropEnrollment: true, rows: [studentRow()], expect: { creadas: 0, sin_cambios: 0, omitidas: 1, rechazadas: 0, motivos: ['CURSADA_DADA_DE_BAJA'] }, state: { enrollments: 1, enrollmentStatus: 'dropped' } },
]);

export function evaluateCase(testCase, output) {
  const failures = [];
  if (testCase.expectError) {
    if (output.result?.sqlstate !== testCase.expectError) failures.push(`expected ${testCase.expectError}, got ${JSON.stringify(output.result)}`);
    if (output.changed) failures.push('rejected call changed state');
    return failures;
  }
  const result = output.result ?? {};
  for (const [key, value] of Object.entries(testCase.expect)) {
    if (key === 'motivos') continue;
    if (result[key] !== value) failures.push(`${key}: expected ${value}, got ${result[key]}`);
  }
  const reasons = (result.problemas ?? []).map(item => item.motivo);
  if (JSON.stringify(reasons) !== JSON.stringify(testCase.expect.motivos)) failures.push(`motivos: ${JSON.stringify(reasons)}`);
  for (const [key, value] of Object.entries(testCase.state ?? {})) if (output.state?.[key] !== value) failures.push(`state.${key}: expected ${value}, got ${output.state?.[key]}`);
  return failures;
}

export async function main() {
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const report = { run, staging: 'NONE', production: 'NONE', fixture: FIXTURE_FILE };
  let step = 'preflight', created = false;
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}; ${String(error.stderr ?? '').match(/ERROR:[^\n]*/)?.[0] ?? 'unavailable'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  const stateJson = () => JSON.parse(sql(`select json_build_object(
  'assignments', (select count(*) from public.subject_teacher_assignments a where a.institution_id = '${STUDENT.institution}' and a.deleted_at is null and a.status = 'active'),
  'role', (select a.role from public.subject_teacher_assignments a where a.institution_id = '${STUDENT.institution}' and a.teacher_id = '${ACTORS.teacherA}' and a.deleted_at is null and a.status = 'active'),
  'enrollments', (select count(*) from public.subject_enrollments e where e.institution_id = '${STUDENT.institution}' and e.student_id = '${STUDENT.userId}'),
  'enrollmentStatus', (select e.status from public.subject_enrollments e where e.institution_id = '${STUDENT.institution}' and e.student_id = '${STUDENT.userId}' and e.subject_id = '${STUDENT.subjectId}'));`));
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
    sql(`delete from public.student_grades where student_id = '${STUDENT.userId}';
update public.teacher_records set dni = '${TEACHER_DNI}' where profile_id = '${ACTORS.teacherA}';
insert into public.teacher_records (institution_id, external_code, first_name, last_name, dni) values ('${STUDENT.institution}', 'TEACH-A-NO-ACCOUNT', 'Sin', 'Cuenta', '${NO_ACCOUNT_TEACHER_DNI}');
update public.student_records set dni = '${STUDENT_DNI}' where id = '${STUDENT.recordId}';
insert into public.student_records (institution_id, external_code, first_name, last_name, workspace_key, career, dni) values ('${STUDENT.institution}', 'STUD-A-NO-ACCOUNT', 'Sin', 'Cuenta', 'main', '${STUDENT.programId}', '${NO_ACCOUNT_STUDENT_DNI}');`);
    step = 'function contract';
    report.functions = JSON.parse(sql(`select json_agg(json_build_object('name', p.proname, 'secdef', p.prosecdef, 'config', p.proconfig, 'anon', has_function_privilege('anon', p.oid, 'execute'), 'authenticated', has_function_privilege('authenticated', p.oid, 'execute')) order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('academic_admin_bulk_assign_teachers', 'academic_admin_bulk_enroll_students', 'academic_resolve_catalog_subject', 'academic_resolve_student_record_by_dni');`));
    assert.deepEqual(report.functions.map(item => [item.name, item.secdef, item.anon, item.authenticated]), [
      ['academic_admin_bulk_assign_teachers', true, false, true],
      ['academic_admin_bulk_enroll_students', true, false, true],
      ['academic_resolve_catalog_subject', true, false, false],
      ['academic_resolve_student_record_by_dni', true, false, false],
    ]);
    report.cases = [];
    for (const testCase of CASES) {
      step = 'case ' + testCase.name;
      if (testCase.dropEnrollment) sql(`update public.subject_enrollments set status = 'dropped', dropped_at = now() where student_id = '${STUDENT.userId}';`);
      const before = JSON.stringify(stateJson());
      const result = JSON.parse(sql(bulkSql(testCase.fn, ACTORS[testCase.actor], testCase.rows)).split('\n').filter(Boolean).pop());
      const state = stateJson();
      const output = { result, state, changed: JSON.stringify(state) !== before };
      report.cases.push({ name: testCase.name, result: testCase.expectError ? result : { ...result, problemas: (result.problemas ?? []).map(item => item.motivo) }, state, failures: evaluateCase(testCase, output) });
    }
    step = 'end to end: teacher grades the bulk-enrolled student';
    // Reactiva la cursada (decision de gestion) y el docente asignado por planilla carga la nota por su RPC.
    sql(`update public.subject_enrollments set status = 'active', dropped_at = null where student_id = '${STUDENT.userId}';`);
    report.endToEnd = sql(`begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${ACTORS.teacherA}', true);
do $$ begin
  perform public.academic_teacher_upsert_student_grade('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', null, '${STUDENT.subjectId}', '${STUDENT.programId}', 'final', 1, 8, 'regular', null);
  perform set_config('bulk.e2e', 'saved', true);
exception when others then
  perform set_config('bulk.e2e', sqlerrm, true);
end $$;
select current_setting('bulk.e2e');
rollback;`).split('\n').filter(Boolean).pop();
    report.failed = report.cases.filter(item => item.failures.length).map(item => item.name);
    if (report.endToEnd !== 'saved') report.failed.push('end to end');
    step = 'assertions';
    assert.deepEqual(report.failed, [], 'Bulk roster cases failed');
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
