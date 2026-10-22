import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { STUDENT, fixtureSql } from './validateExamEligibilityParityLocal.mjs';

// I2a: academic_admin_import_student_history. Permisos, rechazos por fila, idempotencia, no pisar notas del
// docente y que la historia importada habilite (o bloquee) la mesa por el mismo RPC del portal.

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
export const ACTORS = Object.freeze({
  adminA: 'a2000000-0000-4000-8000-000000000001',
  adminB: 'b2000000-0000-4000-8000-000000000001',
  teacherA: 'a2000000-0000-4000-8000-000000000002',
  studentA: STUDENT.userId,
});
export const STUDENT_DNI = '30111222';
// Legajo cargado desde la planilla, todavia sin cuenta (sin profile_id).
export const NO_ACCOUNT_DNI = '30222333';
// AUD.I2a P2: legajo con cuenta pero de otra carrera; la historia no se le engancha.
export const OTHER_CAREER_DNI = '30333444';
const ENROLLMENT_ID = 'ae000000-0000-4000-8000-000000000001';

const quote = value => value === null || value === undefined ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";

// Llama a la RPC como `actor` dentro de una transaccion propia y devuelve el reporte o el error.
export function importSql(actor, rows, { institution = STUDENT.institution, commit = true } = {}) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${actor}', true);
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: actor, role: 'authenticated' }))}, true);
do $$ begin
  perform set_config('history.result', public.academic_admin_import_student_history('${institution}', 'main', ${quote(JSON.stringify(rows))}::jsonb)::text, true);
exception when others then
  perform set_config('history.result', json_build_object('error', sqlerrm, 'sqlstate', sqlstate)::text, true);
end $$;
select current_setting('history.result');
${commit ? 'commit;' : 'rollback;'}`;
}

export function enrollSql() {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${STUDENT.userId}', true);
do $$ begin
  perform public.upsert_exam_enrollment_from_portal('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.userId}', '${STUDENT.recordId}', '${STUDENT.examSubject}', '${STUDENT.subjectId}', '${STUDENT.programId}');
  perform set_config('history.enroll', 'registered', true);
exception when others then
  perform set_config('history.enroll', sqlerrm, true);
end $$;
select current_setting('history.enroll');
rollback;`;
}

const row = overrides => ({ fila: '2', dni: STUDENT_DNI, carrera: 'FIX-A', materia: STUDENT.subjectId, condicion: 'Regular', nota: '', fecha: '15/12/2024', libro: '3', folio: '27', ...overrides });

// Cada caso: filas, actor y lo que se espera del reporte (o del error).
export const CASES = Object.freeze([
  { name: 'anon/alumno no puede importar', actor: ACTORS.studentA, rows: [row()], expectError: '42501' },
  { name: 'docente no puede importar', actor: ACTORS.teacherA, rows: [row()], expectError: '42501' },
  { name: 'admin de otra institucion no puede importar en A', actor: ACTORS.adminB, rows: [row()], expectError: '42501' },
  { name: 'payload que no es lista', actor: ACTORS.adminA, rows: { dni: STUDENT_DNI }, expectError: '22023' },
  {
    name: 'rechazos por fila con motivo',
    actor: ACTORS.adminA,
    rows: [
      row({ fila: '3', dni: '' }),
      row({ fila: '4', condicion: 'cursando' }),
      row({ fila: '5', nota: '11' }),
      row({ fila: '6', fecha: '31/02/2024' }),
      row({ fila: '7', carrera: 'Carrera inexistente' }),
      row({ fila: '8', materia: 'FIX-B-01' }),
      row({ fila: '9', dni: '99999999' }),
      row({ fila: '10', fecha: '01/01/2999' }),
      row({ fila: '11', dni: NO_ACCOUNT_DNI }),
      row({ fila: '12', dni: OTHER_CAREER_DNI }),
    ],
    expect: { importadas: 0, actualizadas: 0, omitidas: 0, rechazadas: 10, motivos: ['FALTAN_DATOS', 'CONDICION_INVALIDA', 'NOTA_INVALIDA', 'FECHA_INVALIDA', 'CARRERA_NO_ENCONTRADA', 'MATERIA_NO_ESTA_EN_EL_PLAN', 'ALUMNO_NO_ENCONTRADO', 'FECHA_INVALIDA', 'ALUMNO_SIN_CUENTA', 'ALUMNO_DE_OTRA_CARRERA'] },
    grades: [],
  },
  {
    name: 'regular importada habilita la mesa',
    actor: ACTORS.adminA,
    rows: [row({ carrera: 'Fixture Career A' })],
    expect: { importadas: 1, actualizadas: 0, omitidas: 0, rechazadas: 0, motivos: [] },
    grades: [{ type: 'historia', status: 'regular', record: STUDENT.recordId, program: STUDENT.programId, observations: 'Libro 3 Folio 27', period: '2024-12-15' }],
    enroll: 'registered',
  },
  {
    name: 're-importar es idempotente y actualiza',
    actor: ACTORS.adminA,
    rows: [row({ condicion: 'aprobada', nota: '8,50', fecha: '2025-03-01' })],
    expect: { importadas: 0, actualizadas: 1, omitidas: 0, rechazadas: 0, motivos: [] },
    grades: [{ type: 'historia', status: 'approved', value: '8.5', period: '2025-03-01' }],
    enroll: 'EXAM_REGULARITY_REQUIRED',
  },
  {
    name: 'nunca pisa una nota cargada por el docente',
    actor: ACTORS.adminA,
    seedTeacherGrade: 'libre',
    rows: [row({ condicion: 'regular' })],
    expect: { importadas: 0, actualizadas: 0, omitidas: 1, rechazadas: 0, motivos: ['YA_TIENE_NOTAS_DEL_SISTEMA'] },
    grades: [{ type: 'final', status: 'libre' }, { type: 'historia', status: 'approved' }],
    enroll: 'EXAM_REGULARITY_REQUIRED',
  },
]);

// AUD.I2a P1: carrera entre la carga docente ("libre") y la importacion ("regular") de la misma materia.
// Gana siempre el docente: o la historia se omite (el docente escribio antes) o la nota docente queda
// despues (escribio despues, con reloj real). En ningun orden el alumno puede inscribirse a la mesa.
export const RACES = Object.freeze([
  { name: 'docente escribe y mantiene la transaccion; la importacion espera y se omite', teacher: 'write-then-sleep', expectImport: { importadas: 0, omitidas: 1 } },
  { name: 'docente abre la transaccion antes y escribe despues de la importacion', teacher: 'sleep-then-write', expectImport: { importadas: 1, omitidas: 0 } },
]);

export function teacherRaceSql(order) {
  const write = `select public.academic_teacher_upsert_student_grade('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', '${ENROLLMENT_ID}', '${STUDENT.subjectId}', '${STUDENT.programId}', 'final', 1, null, 'libre', null);`;
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${ACTORS.teacherA}', true);
${order === 'write-then-sleep' ? `${write}\nselect pg_sleep(1.5);` : `select pg_sleep(1.5);\n${write}`}
commit;`;
}

export function evaluateCase(testCase, output) {
  const failures = [];
  if (testCase.expectError) {
    if (output.result?.sqlstate !== testCase.expectError) failures.push(`expected ${testCase.expectError}, got ${JSON.stringify(output.result)}`);
    if (output.gradesChanged) failures.push('rejected call changed student_grades');
    return failures;
  }
  const result = output.result ?? {};
  for (const key of ['importadas', 'actualizadas', 'omitidas', 'rechazadas']) {
    if (result[key] !== testCase.expect[key]) failures.push(`${key}: expected ${testCase.expect[key]}, got ${result[key]}`);
  }
  const reasons = (result.problemas ?? []).map(item => item.motivo);
  if (JSON.stringify(reasons) !== JSON.stringify(testCase.expect.motivos)) failures.push(`motivos: ${JSON.stringify(reasons)}`);
  const grades = output.grades ?? [];
  if (grades.length !== testCase.grades.length) failures.push(`grades: expected ${testCase.grades.length}, got ${JSON.stringify(grades)}`);
  testCase.grades.forEach((expected, index) => {
    const actual = grades[index] ?? {};
    for (const [key, value] of Object.entries(expected)) if (String(actual[key]) !== String(value)) failures.push(`grade ${index}.${key}: expected ${value}, got ${actual[key]}`);
  });
  if (testCase.enroll && output.enroll !== testCase.enroll) failures.push(`enroll: expected ${testCase.enroll}, got ${output.enroll}`);
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
  const gradesJson = () => JSON.parse(sql(`select coalesce(json_agg(json_build_object('type', g.grade_type, 'status', g.academic_status, 'value', g.grade_value, 'record', g.student_record_id, 'program', g.program_id, 'observations', g.observations, 'period', g.grading_period) order by g.grade_type), '[]') from public.student_grades g where g.student_id = '${STUDENT.userId}' and g.deleted_at is null;`));
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
    // El fixture deja una nota del docente; la historia arranca sin notas y con el DNI cargado en el legajo.
    sql(`delete from public.exam_enrollments where student_id='${STUDENT.userId}';
delete from public.student_grades where student_id='${STUDENT.userId}';
update public.student_records set dni='${STUDENT_DNI}' where id='${STUDENT.recordId}';
insert into public.student_records (institution_id, external_code, first_name, last_name, workspace_key, career, dni)
values ('${STUDENT.institution}', 'STUD-A-NO-ACCOUNT', 'Sin', 'Cuenta', 'main', '${STUDENT.programId}', '${NO_ACCOUNT_DNI}');
insert into public.student_records (institution_id, external_code, first_name, last_name, workspace_key, career, dni, profile_id)
values ('${STUDENT.institution}', 'STUD-A-OTHER-CAREER', 'Otra', 'Carrera', 'main', 'OTRA CARRERA', '${OTHER_CAREER_DNI}', '${ACTORS.teacherA}');
insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, role)
values ('${STUDENT.institution}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${ACTORS.teacherA}', 'titular');
insert into public.subject_enrollments (id, institution_id, workspace_key, subject_id, program_id, student_id, student_record_id)
values ('${ENROLLMENT_ID}', '${STUDENT.institution}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${STUDENT.userId}', '${STUDENT.recordId}');`);
    step = 'function contract';
    report.function = JSON.parse(sql(`select json_build_object('secdef', p.prosecdef, 'config', p.proconfig, 'anon', has_function_privilege('anon', p.oid, 'execute'), 'authenticated', has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p where p.oid = 'public.academic_admin_import_student_history(uuid,text,jsonb)'::regprocedure;`));
    assert.deepEqual(report.function, { secdef: true, config: ['search_path=""'], anon: false, authenticated: true });
    report.cases = [];
    for (const testCase of CASES) {
      step = 'case ' + testCase.name;
      if (testCase.seedTeacherGrade) {
        sql(`insert into public.student_grades (institution_id, workspace_key, student_id, student_record_id, subject_enrollment_id, subject_id, program_id, grade_type, academic_status, teacher_id)
values ('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', '${ENROLLMENT_ID}', '${STUDENT.subjectId}', '${STUDENT.programId}', 'final', '${testCase.seedTeacherGrade}', '${ACTORS.teacherA}');`);
      }
      const before = JSON.stringify(gradesJson());
      const result = JSON.parse(sql(importSql(testCase.actor, testCase.rows)).split('\n').filter(Boolean).pop());
      const grades = gradesJson();
      const output = { result, grades, gradesChanged: JSON.stringify(grades) !== before };
      if (testCase.enroll) output.enroll = sql(enrollSql()).split('\n').filter(Boolean).pop();
      report.cases.push({ name: testCase.name, result: testCase.expectError ? result : { ...result, problemas: (result.problemas ?? []).map(item => item.motivo) }, enroll: output.enroll, failures: evaluateCase(testCase, output) });
    }
    report.races = [];
    const psqlAsync = query => new Promise((done, fail) => {
      const child = spawn('docker', ['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', database, '-At'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = '';
      child.stdout.on('data', chunk => { out += chunk; });
      child.stderr.on('data', chunk => { err += chunk; });
      child.on('close', code => (code === 0 ? done(out.trim()) : fail(new Error(err.match(/ERROR:[^\n]*/)?.[0] ?? 'psql failed'))));
      child.stdin.end(query);
    });
    for (const race of RACES) {
      step = 'race ' + race.name;
      sql(`delete from public.exam_enrollments where student_id='${STUDENT.userId}'; delete from public.student_grades where student_id='${STUDENT.userId}';`);
      const teacher = psqlAsync(teacherRaceSql(race.teacher));
      await new Promise(done => setTimeout(done, 400));
      const imported = JSON.parse((await psqlAsync(importSql(ACTORS.adminA, [row({ condicion: 'regular' })]))).split('\n').filter(Boolean).pop());
      await teacher;
      const latest = sql(`select g.grade_type || ':' || g.academic_status from public.student_grades g where g.student_id='${STUDENT.userId}' and g.subject_id='${STUDENT.subjectId}' and g.program_id='${STUDENT.programId}' and g.deleted_at is null and g.academic_status <> 'pending' order by g.updated_at desc, g.created_at desc limit 1;`);
      const enroll = sql(enrollSql()).split('\n').filter(Boolean).pop();
      const failures = [];
      for (const [key, value] of Object.entries(race.expectImport)) if (imported[key] !== value) failures.push(`${key}: expected ${value}, got ${imported[key]}`);
      if (latest !== 'final:libre') failures.push(`latest: expected final:libre, got ${latest}`);
      if (enroll !== 'EXAM_REGULARITY_REQUIRED') failures.push(`enroll: expected EXAM_REGULARITY_REQUIRED, got ${enroll}`);
      report.races.push({ name: race.name, imported: { importadas: imported.importadas, omitidas: imported.omitidas }, latest, enroll, failures });
    }
    report.failed = report.cases.filter(item => item.failures.length).map(item => item.name)
      .concat(report.races.filter(item => item.failures.length).map(item => item.name));
    step = 'assertions';
    assert.deepEqual(report.failed, [], 'Student history import cases failed');
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
