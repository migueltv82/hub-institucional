import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { fixtureSql } from './validateExamEligibilityParityLocal.mjs';

// SEC.3: matriz rol x tabla de la RLS de lectura dentro de una institucion.
// El personal (admin/owner/editor y docentes) lee todo lo de su institucion; un alumno solo lee lo propio en las tablas
// con datos personales y todo el catalogo academico. Uso: node scripts/validateTenantReadScopeLocal.mjs [--control]
// --control recrea las policies anteriores (membresia simple) despues del baseline: el harness tiene que FALLAR.

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
const A = 'a1000000-0000-4000-8000-000000000001';
const STUDENT = { user: 'a2000000-0000-4000-8000-000000000003', record: 'a8000000-0000-4000-8000-000000000001' };
const OTHER_STUDENT = { user: 'a2000000-0000-4000-8000-000000000007', record: 'a8000000-0000-4000-8000-000000000002' };
const TEACHER = 'a2000000-0000-4000-8000-000000000002';

export const ACTORS = Object.freeze({
  adminA: { id: 'a2000000-0000-4000-8000-000000000001', scope: 'staff' },
  teacherA: { id: TEACHER, scope: 'staff' },
  studentA: { id: STUDENT.user, scope: 'own' },
});

// Por tabla: `own` = condicion (como admin) de las filas propias del alumno A; `catalog` = la ve cualquier miembro.
export const TABLES = Object.freeze({
  student_records: { own: `profile_id = '${STUDENT.user}'` },
  teacher_records: { own: `profile_id = '${STUDENT.user}'` },
  student_career_plans: { own: `student_id = '${STUDENT.record}'` },
  student_academic_statuses: { own: `student_career_plan_id in (select id from public.student_career_plans where student_id = '${STUDENT.record}')` },
  subject_enrollments: { own: `student_id = '${STUDENT.user}'` },
  student_grades: { own: `student_id = '${STUDENT.user}'` },
  subject_class_sessions: { own: `subject_id = 'FIX-A-01'` },
  subject_attendance_records: { own: `student_id = '${STUDENT.user}'` },
  student_financial_status: { own: `student_record_id = '${STUDENT.record}'` },
  workspace_snapshots: { own: 'false' },
  exam_engine_v21_states: { own: 'false' },
  deleted_person_records: { own: 'false' },
  workspace_source_files: { own: 'false' },
  teacher_availability_records: { own: 'false' },
  teacher_workload_records: { own: 'false' },
  teacher_exam_date_exclusions: { own: 'false' },
  careers: { catalog: true },
  subjects: { catalog: true },
  study_plans: { catalog: true },
});

// Datos extra para que ninguna sonda quede vacia: otro alumno de A con sus filas, una clase de cada materia, etc.
export const SEED_SQL = `
insert into auth.users (id, email, raw_app_meta_data) values ('${OTHER_STUDENT.user}', 'student-a2@fixture.invalid', '{"account_role":"alumno"}');
insert into public.memberships (institution_id, user_id, role) values ('${A}', '${OTHER_STUDENT.user}', 'viewer');
insert into public.student_records (id, institution_id, external_code, first_name, last_name, profile_id, workspace_key, career, email, dni)
  values ('${OTHER_STUDENT.record}', '${A}', 'STUD-A2', 'Otra', 'Alumna', '${OTHER_STUDENT.user}', 'main', 'Fixture Career A', 'student-a2@fixture.invalid', '30111222');
insert into public.student_career_plans (id, institution_id, student_id, career_id, plan_id)
  values ('a9000000-0000-4000-8000-000000000002', '${A}', '${OTHER_STUDENT.record}', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001');
insert into public.student_academic_statuses (institution_id, student_career_plan_id, plan_subject_id, condition)
  values ('${A}', 'a9000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000001', 'regular');
insert into public.subject_enrollments (institution_id, workspace_key, subject_id, program_id, student_id, student_record_id) values
  ('${A}', 'main', 'FIX-A-01', 'Fixture Career A', '${STUDENT.user}', '${STUDENT.record}'),
  ('${A}', 'main', 'FIX-A-01', 'Fixture Career A', '${OTHER_STUDENT.user}', '${OTHER_STUDENT.record}'),
  ('${A}', 'main', 'FIX-A-99', 'Fixture Career A', '${OTHER_STUDENT.user}', '${OTHER_STUDENT.record}');
insert into public.student_grades (institution_id, workspace_key, student_id, student_record_id, subject_id, program_id, academic_status, grade_type, attempt_number)
  values ('${A}', 'main', '${OTHER_STUDENT.user}', '${OTHER_STUDENT.record}', 'FIX-A-01', 'Fixture Career A', 'regular', 'final', 1);
insert into public.subject_class_sessions (id, institution_id, workspace_key, subject_id, program_id, teacher_id, session_date) values
  ('ad000000-0000-4000-8000-000000000001', '${A}', 'main', 'FIX-A-01', 'Fixture Career A', '${TEACHER}', '2026-10-01'),
  ('ad000000-0000-4000-8000-000000000002', '${A}', 'main', 'FIX-A-99', 'Fixture Career A', '${TEACHER}', '2026-10-01');
insert into public.subject_attendance_records (institution_id, workspace_key, session_id, student_id, status) values
  ('${A}', 'main', 'ad000000-0000-4000-8000-000000000001', '${STUDENT.user}', 'present'),
  ('${A}', 'main', 'ad000000-0000-4000-8000-000000000001', '${OTHER_STUDENT.user}', 'present'),
  ('${A}', 'main', 'ad000000-0000-4000-8000-000000000002', '${OTHER_STUDENT.user}', 'absent');
insert into public.student_financial_status (institution_id, workspace_key, student_record_id, adeuda_cuota) values
  ('${A}', 'main', '${STUDENT.record}', false), ('${A}', 'main', '${OTHER_STUDENT.record}', true);
insert into public.exam_engine_v21_states (institution_id, workspace_key, state) values ('${A}', 'main', '{}'::jsonb);
insert into public.deleted_person_records (institution_id, workspace_key, person_type, deletion_source, dni, email)
  values ('${A}', 'main', 'student', 'harness', '30999888', 'baja@fixture.invalid');
insert into public.workspace_source_files (institution_id, workspace_key, dataset_key, file_name) values ('${A}', 'main', 'alumnos', 'alumnos.xlsx');
insert into public.teacher_availability_records (institution_id, workspace_key, teacher_identity, teacher_display_name, day_of_week, start_time, end_time)
  values ('${A}', 'main', 'TEACH-A', 'Teacher A', 'lunes', '08:00', '10:00');
insert into public.teacher_workload_records (institution_id, workspace_key, teacher_identity, teacher_display_name, program_id, career_name, subject_id, subject_name, teaching_hours)
  values ('${A}', 'main', 'TEACH-A', 'Teacher A', 'Fixture Career A', 'Fixture Career A', 'FIX-A-01', 'Fixture Subject A', 4);
insert into public.teacher_exam_date_exclusions (institution_id, teacher_id, excluded_date)
  values ('${A}', 'a7000000-0000-4000-8000-000000000001', '2026-12-01');
`;

// Politica previa a SEC.3, para el control negativo.
export function legacyPoliciesSql() {
  const statements = Object.entries(TABLES).filter(([, spec]) => !spec.catalog).map(([table]) => `drop policy if exists "${table} members read" on public.${table};
create policy "${table} members read" on public.${table} for select to authenticated using (public.is_super_admin() or public.is_member_of_institution(institution_id));`);
  return statements.join('\n');
}

export function expectedRows(scope, table, totals) {
  if (scope === 'staff' || TABLES[table].catalog) return totals[table].all;
  return totals[table].own;
}

export function totalsSql() {
  return `select json_object_agg(t.name, t.counts) from (${Object.entries(TABLES).map(([table, spec]) => `select '${table}' as name, json_build_object('all', (select count(*) from public.${table} where institution_id = '${A}'), 'own', (select count(*) from public.${table} where institution_id = '${A}' and ${spec.catalog ? 'true' : spec.own})) as counts`).join(' union all ')}) t;`;
}

export function probeSql(actor) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${actor.id}', true);
select json_object_agg(t.name, t.c) from (${Object.keys(TABLES).map(table => `select '${table}' as name, (select count(*) from public.${table} where institution_id = '${A}') as c`).join(' union all ')}) t;
rollback;`;
}

export function evaluate(results, totals) {
  const failures = [];
  for (const [name, actor] of Object.entries(ACTORS)) {
    for (const table of Object.keys(TABLES)) {
      const expected = expectedRows(actor.scope, table, totals);
      if (results[name][table] !== expected) failures.push(`${name}.${table}: esperaba ${expected}, ve ${results[name][table]}`);
    }
  }
  // Una sonda donde el alumno veria lo mismo que el personal no prueba nada: cada tabla con PII necesita filas ajenas.
  for (const [table, spec] of Object.entries(TABLES)) {
    if (!spec.catalog && totals[table].all <= totals[table].own) failures.push(`fixture debil: ${table} no tiene filas ajenas al alumno`);
  }
  return failures;
}

export async function main(argv = process.argv.slice(2)) {
  const control = argv.includes('--control');
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const report = { task: 'SEC.3', run, mode: control ? 'control_legacy_member_read' : 'release_v1', staging: 'NONE', production: 'NONE', fixture: FIXTURE_FILE };
  let step = 'preflight', created = false;
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}; ${String(error.stderr ?? '').split('\n').find(line => line.startsWith('ERROR')) ?? 'no detail'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  const json = query => JSON.parse(sql(query).split('\n').filter(line => line.startsWith('{')).pop());
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
    if (control) sql(legacyPoliciesSql());
    step = 'fixture';
    sql(fixtureSql(readFileSync(resolve(FIXTURE_FILE), 'utf8')));
    sql(SEED_SQL);
    report.totals = json(totalsSql());
    step = 'probes';
    report.results = Object.fromEntries(Object.entries(ACTORS).map(([name, actor]) => [name, json(probeSql(actor))]));
    report.failures = evaluate(report.results, report.totals);
    step = 'assertions';
    assert.deepEqual(report.failures, [], 'Tenant read scope failed');
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
