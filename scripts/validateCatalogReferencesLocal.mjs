import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { STUDENT, fixtureSql } from './validateExamEligibilityParityLocal.mjs';

// Punto 1 (21/10): study_plan_subject_id con FK a study_plan_subjects en cursadas, notas, clases y
// asignaciones docentes (final de 07). Que las escrituras reales (RPC de alumno y docente, carga masiva,
// insert directo) completen la referencia; que un valor enviado a mano no gane; que lo que no esta en el
// catalogo no bloquee; que la ambiguedad entre planes se resuelva por el plan del alumno o quede NULL; que la
// FK proteja el catalogo; y que el backfill complete sin tocar updated_at ni las revisiones del gateway.

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
const SCHEMA_07 = 'supabase/schema/07_academic_operations.sql';
const A = STUDENT.institution;
const CATALOG = Object.freeze({
  career: 'a3000000-0000-4000-8000-000000000001',
  plan: 'a4000000-0000-4000-8000-000000000001',
  planSubject: 'a6000000-0000-4000-8000-000000000001',
  subject: 'a5000000-0000-4000-8000-000000000001',
  plan2: 'a4000000-0000-4000-8000-0000000000f2',
  plan2Subject: 'a6000000-0000-4000-8000-0000000000f2',
  lateSubject: 'a5000000-0000-4000-8000-0000000000f3',
  latePlanSubject: 'a6000000-0000-4000-8000-0000000000f3',
  bPlanSubject: 'b6000000-0000-4000-8000-000000000001',
});
const ACTORS = Object.freeze({ adminA: 'a2000000-0000-4000-8000-000000000001', teacherA: 'a2000000-0000-4000-8000-000000000002', studentA: STUDENT.userId });

const quote = value => value === null || value === undefined ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";
export function asActor(actor, statement) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${actor}', true);
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: actor, role: 'authenticated' }))}, true);
do $$ begin
  ${statement};
  perform set_config('ref.result', json_build_object('value', 'ok')::text, true);
exception when others then
  perform set_config('ref.result', json_build_object('error', sqlerrm, 'sqlstate', sqlstate)::text, true);
end $$;
select current_setting('ref.result');
commit;`;
}

export async function main() {
  const run = randomBytes(8).toString('hex');
  const database = disposableDatabase(`gotrue_harness_${run}`);
  const report = { run, staging: 'NONE', production: 'NONE', fixture: FIXTURE_FILE, checks: [] };
  let step = 'preflight', created = false;
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error(`Local operation failed at ${step}; ${String(error.stderr ?? '').match(/ERROR:[^\n]*/)?.[0] ?? 'unavailable'}`); }
  };
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim();
  const as = (actor, statement) => JSON.parse(sql(asActor(ACTORS[actor], statement)).split('\n').filter(Boolean).pop());
  const value = query => sql(query);
  // Como dueno de la base, sin RLS: para probar integridad (FK), no permisos.
  const asOwner = statement => JSON.parse(sql(`do $$ begin
  ${statement};
  perform set_config('ref.result', json_build_object('value', 'ok')::text, false);
exception when others then
  perform set_config('ref.result', json_build_object('error', sqlerrm, 'sqlstate', sqlstate)::text, false);
end $$;
select current_setting('ref.result');`).split('\n').filter(Boolean).pop());
  const check = (name, ok, detail) => { report.checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) }); };
  const refOf = (table, where) => value(`select coalesce(study_plan_subject_id::text, 'NULL') from public.${table} where ${where} order by created_at desc limit 1;`);
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
    // Como en Prod: gateway de Storage (trigger de revisiones en estas tablas) y registro por institucion.
    sql(readFileSync(resolve('supabase/security/source_file_storage_gateway.sql'), 'utf8'));
    sql(readFileSync(resolve('supabase/security/source_file_storage_register_on_institution.sql'), 'utf8'));
    sql(`delete from public.subject_teacher_assignments where institution_id = '${A}';
delete from public.student_grades where institution_id = '${A}';
delete from public.subject_enrollments where institution_id = '${A}';
update public.teacher_records set dni = '20111222' where profile_id = '${ACTORS.teacherA}';`);

    step = 'contract';
    report.contract = JSON.parse(value(`select json_build_object(
  'columns', (select json_agg(table_name order by table_name) from information_schema.columns where table_schema = 'public' and column_name = 'study_plan_subject_id' and table_name in ('subject_enrollments', 'student_grades', 'subject_class_sessions', 'subject_teacher_assignments')),
  'fks', (select json_agg(conname order by conname) from pg_constraint where conname like '%_plan_subject_fkey' and conrelid::regclass::text in ('subject_enrollments', 'student_grades', 'subject_class_sessions', 'subject_teacher_assignments')),
  'triggers', (select json_agg(tgrelid::regclass::text order by tgrelid::regclass::text) from pg_trigger where tgname = 'set_plan_subject_reference'),
  'resolver_api', (select json_build_object('secdef', prosecdef, 'config', proconfig, 'anon', has_function_privilege('anon', oid, 'execute'), 'authenticated', has_function_privilege('authenticated', oid, 'execute')) from pg_proc where proname = 'academic_resolve_plan_subject_id'),
  'trigger_api', (select json_build_object('anon', has_function_privilege('anon', oid, 'execute'), 'authenticated', has_function_privilege('authenticated', oid, 'execute')) from pg_proc where proname = 'academic_set_plan_subject_reference'));`));
    const tables = ['student_grades', 'subject_class_sessions', 'subject_enrollments', 'subject_teacher_assignments'];
    check('columna en las 4 tablas', JSON.stringify(report.contract.columns) === JSON.stringify(tables), report.contract.columns);
    check('FK en las 4 tablas', report.contract.fks?.length === 4, report.contract.fks);
    check('trigger en las 4 tablas', JSON.stringify(report.contract.triggers) === JSON.stringify(tables), report.contract.triggers);
    check('resolver: security definer, search_path vacio, sin EXECUTE para la API', report.contract.resolver_api?.secdef && JSON.stringify(report.contract.resolver_api?.config) === JSON.stringify(['search_path=""']) && !report.contract.resolver_api.anon && !report.contract.resolver_api.authenticated, report.contract.resolver_api);
    check('trigger: sin EXECUTE para la API', !report.contract.trigger_api?.anon && !report.contract.trigger_api?.authenticated, report.contract.trigger_api);
    const direct = as('studentA', `perform public.academic_resolve_plan_subject_id('${A}', 'FIX-A', 'FIX-A-01', null)`);
    check('el alumno no llama al resolver directo (42501)', direct.sqlstate === '42501', direct);

    step = 'real writers';
    const enrolled = as('studentA', `perform public.upsert_subject_enrollment_from_portal('${A}', 'main', '${STUDENT.userId}', '${STUDENT.userId}', 'FIX-A-01', 'Fixture Career A', '${STUDENT.recordId}')`);
    check('cursada desde el portal alumno con referencia', enrolled.value === 'ok' && refOf('subject_enrollments', `institution_id = '${A}' and subject_id = 'FIX-A-01'`) === CATALOG.planSubject, { enrolled, ref: refOf('subject_enrollments', `institution_id = '${A}'`) });
    sql(`insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, role) values ('${A}', 'main', 'FIX-A-01', 'Fixture Career A', '${ACTORS.teacherA}', 'titular');`);
    check('asignacion docente (insert directo) con referencia', refOf('subject_teacher_assignments', `institution_id = '${A}'`) === CATALOG.planSubject, refOf('subject_teacher_assignments', `institution_id = '${A}'`));
    const session = as('teacherA', `perform public.academic_teacher_create_class_session('${A}', 'main', 'FIX-A-01', 'Fixture Career A', current_date, 'tema')`);
    check('clase desde el portal docente con referencia', session.value === 'ok' && refOf('subject_class_sessions', `institution_id = '${A}' and topic = 'tema'`) === CATALOG.planSubject, session);
    const grade = as('teacherA', `perform public.academic_teacher_upsert_student_grade('${A}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', null, 'FIX-A-01', 'Fixture Career A', 'final', 1, 8, 'regular', null)`);
    check('nota desde el portal docente con referencia', grade.value === 'ok' && refOf('student_grades', `institution_id = '${A}'`) === CATALOG.planSubject, grade);
    const bulk = as('adminA', `perform public.academic_admin_bulk_assign_teachers('${A}', 'main', '[{"fila":"1","dni":"20111222","carrera":"FIX-A","materia":"fix-a-01","rol":"suplente"}]'::jsonb)`);
    check('carga masiva (carrera por codigo, materia en minuscula) con referencia', bulk.value === 'ok' && refOf('subject_teacher_assignments', `institution_id = '${A}'`) === CATALOG.planSubject, bulk);

    step = 'manual value does not win';
    const forged = as('adminA', `update public.subject_teacher_assignments set study_plan_subject_id = '${CATALOG.planSubject}', subject_id = 'NO-EXISTE' where institution_id = '${A}'`);
    check('un valor enviado a mano se recalcula desde el texto', forged.value === 'ok' && refOf('subject_teacher_assignments', `institution_id = '${A}'`) === 'NULL', forged);
    const crossTenant = as('adminA', `update public.subject_teacher_assignments set subject_id = 'FIX-A-01', study_plan_subject_id = '${CATALOG.bPlanSubject}' where institution_id = '${A}'`);
    check('no se puede apuntar al catalogo de otra institucion', crossTenant.value === 'ok' && refOf('subject_teacher_assignments', `institution_id = '${A}'`) === CATALOG.planSubject, crossTenant);

    step = 'not in catalog';
    const orphan = as('studentA', `perform public.upsert_subject_enrollment_from_portal('${A}', 'main', '${STUDENT.userId}', '${STUDENT.userId}', 'FUERA-01', 'Fixture Career A', '${STUDENT.recordId}')`);
    check('una materia fuera del catalogo no bloquea y queda NULL', orphan.value === 'ok' && refOf('subject_enrollments', `institution_id = '${A}' and subject_id = 'FUERA-01'`) === 'NULL', orphan);

    step = 'ambiguity between plans';
    // Segundo plan activo de la misma carrera con la misma materia (plan conviviente).
    sql(`insert into public.study_plans (id, institution_id, career_id, external_code, name) values ('${CATALOG.plan2}', '${A}', '${CATALOG.career}', 'PLAN-A2', 'Plan conviviente');
insert into public.study_plan_subjects (id, institution_id, plan_id, subject_id) values ('${CATALOG.plan2Subject}', '${A}', '${CATALOG.plan2}', '${CATALOG.subject}');`);
    sql(`insert into public.subject_class_sessions (institution_id, workspace_key, subject_id, program_id, teacher_id, session_date, topic) values ('${A}', 'main', 'FIX-A-01', 'Fixture Career A', '${ACTORS.teacherA}', current_date - 1, 'ambigua');`);
    check('sin alumno y dos planes activos: NULL', refOf('subject_class_sessions', `topic = 'ambigua'`) === 'NULL', refOf('subject_class_sessions', `topic = 'ambigua'`));
    as('teacherA', `perform public.academic_teacher_upsert_student_grade('${A}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', null, 'FIX-A-01', 'Fixture Career A', 'final', 2, 9, 'regular', null)`);
    check('con alumno: el plan del alumno', value(`select study_plan_subject_id from public.student_grades where institution_id = '${A}' and attempt_number = 2;`) === CATALOG.planSubject, value(`select study_plan_subject_id from public.student_grades where institution_id = '${A}' and attempt_number = 2;`));
    sql(`update public.study_plans set status = 'closed' where id = '${CATALOG.plan}';
insert into public.subject_class_sessions (institution_id, workspace_key, subject_id, program_id, teacher_id, session_date, topic) values ('${A}', 'main', 'FIX-A-01', 'Fixture Career A', '${ACTORS.teacherA}', current_date - 2, 'un-activo');`);
    check('sin alumno y un solo plan activo: ese', refOf('subject_class_sessions', `topic = 'un-activo'`) === CATALOG.plan2Subject, refOf('subject_class_sessions', `topic = 'un-activo'`));
    sql(`update public.study_plans set status = 'active' where id = '${CATALOG.plan}';`);

    step = 'catalog protection';
    const del = asOwner(`delete from public.study_plan_subjects where id = '${CATALOG.planSubject}'`);
    check('no se borra del catalogo una materia con cursadas o notas (23503)', del.sqlstate === '23503', del);
    check('la materia sigue en el catalogo', value(`select count(*) from public.study_plan_subjects where id = '${CATALOG.planSubject}';`) === '1', 'deleted');
    const unused = asOwner(`delete from public.study_plan_subjects where id = '${CATALOG.plan2Subject}' and false`);
    check('control: el borrado como dueno corre (sin RLS)', unused.value === 'ok', unused);

    step = 'backfill';
    // Materia que se publica en el catalogo despues de usarse: queda NULL hasta re-correr 07.
    sql(`insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, role) values ('${A}', 'main', 'LATE-01', 'Fixture Career A', '${ACTORS.teacherA}', 'titular');
insert into public.subjects (id, institution_id, code, name) values ('${CATALOG.lateSubject}', '${A}', 'LATE-01', 'Publicada tarde');
insert into public.study_plan_subjects (id, institution_id, plan_id, subject_id) values ('${CATALOG.latePlanSubject}', '${A}', '${CATALOG.plan}', '${CATALOG.lateSubject}');`);
    check('antes del backfill: NULL', refOf('subject_teacher_assignments', `subject_id = 'LATE-01'`) === 'NULL', 'late');
    const fingerprint = () => value(`select json_build_object(
  'updated', (select json_agg(x order by x) from (select id::text || '@' || updated_at::text x from public.subject_enrollments union all select id::text || '@' || updated_at::text from public.student_grades union all select id::text || '@' || updated_at::text from public.subject_class_sessions union all select id::text || '@' || updated_at::text from public.subject_teacher_assignments) t),
  'revisions', (select json_agg(r order by r) from (select institution_id::text || '/' || workspace_key || '=' || revision r from public.source_file_workspace_revisions) t))::text;`);
    const before = fingerprint();
    sql(readFileSync(resolve(SCHEMA_07), 'utf8'));
    check('re-correr 07 completa la referencia', refOf('subject_teacher_assignments', `subject_id = 'LATE-01'`) === CATALOG.latePlanSubject, refOf('subject_teacher_assignments', `subject_id = 'LATE-01'`));
    check('el backfill no toca updated_at ni las revisiones del gateway', fingerprint() === before, 'fingerprint changed');
    check('los triggers quedan encendidos despues del backfill', value(`select count(*) from pg_trigger where tgname in ('set_plan_subject_reference', 'touch_academic_operations_updated_at', 'source_file_workspace_mutation') and tgenabled = 'D';`) === '0', 'disabled triggers');
    const refs = () => value(`select json_agg(x order by x)::text from (select id::text || '=' || coalesce(study_plan_subject_id::text, 'NULL') x from public.subject_enrollments union all select id::text || '=' || coalesce(study_plan_subject_id::text, 'NULL') from public.student_grades union all select id::text || '=' || coalesce(study_plan_subject_id::text, 'NULL') from public.subject_class_sessions union all select id::text || '=' || coalesce(study_plan_subject_id::text, 'NULL') from public.subject_teacher_assignments) t;`);
    const afterSecond = refs();
    sql(readFileSync(resolve(SCHEMA_07), 'utf8'));
    check('tercera corrida sin cambios', refs() === afterSecond && fingerprint() === before, 'rerun changed');
    // La sesion ambigua se resuelve sola en el backfill si el catalogo deja de ser ambiguo... y la que ya
    // tenia referencia no se pisa mientras siga siendo valida.
    check('la clase ambigua sigue NULL (dos planes activos)', refOf('subject_class_sessions', `topic = 'ambigua'`) === 'NULL', 'ambigua');

    step = 'normalization trims (AUD.17 P2-1)';
    // El update de normalizacion anterior recortaba espacios; los where nuevos tienen que seguir viendolos.
    sql(`insert into public.student_grades (institution_id, workspace_key, student_id, student_record_id, subject_id, program_id, grade_type, grade_scale, academic_status, attempt_number)
values ('${A}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', 'FIX-A-01', 'Fixture Career A', ' final ', ' numeric_0_10 ', 'regular', 7);`);
    const untouchedBefore = value(`select json_agg(id::text || '@' || updated_at::text order by id)::text from public.student_grades where attempt_number <> 7;`);
    sql(readFileSync(resolve(SCHEMA_07), 'utf8'));
    const trimmed = JSON.parse(value(`select row_to_json(g)::text from (select grade_type, grade_scale from public.student_grades where attempt_number = 7) g;`));
    check('re-correr 07 recorta espacios en grade_type y grade_scale', trimmed.grade_type === 'final' && trimmed.grade_scale === 'numeric_0_10', trimmed);
    check('y no toca las demas notas', value(`select json_agg(id::text || '@' || updated_at::text order by id)::text from public.student_grades where attempt_number <> 7;`) === untouchedBefore, 'updated_at changed');

    step = 'class session ON CONFLICT fills the reference (AUD.17 P3-1)';
    sql(`insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, role) values ('${A}', 'main', 'LATE2-01', 'Fixture Career A', '${ACTORS.teacherA}', 'titular');`);
    const firstSession = as('teacherA', `perform public.academic_teacher_create_class_session('${A}', 'main', 'LATE2-01', 'Fixture Career A', current_date - 5, 'antes')`);
    check('clase de una materia todavia fuera del catalogo: NULL', firstSession.value === 'ok' && refOf('subject_class_sessions', `subject_id = 'LATE2-01'`) === 'NULL', firstSession);
    sql(`insert into public.subjects (id, institution_id, code, name) values ('a5000000-0000-4000-8000-0000000000f4', '${A}', 'LATE2-01', 'Publicada despues');
insert into public.study_plan_subjects (id, institution_id, plan_id, subject_id) values ('a6000000-0000-4000-8000-0000000000f4', '${A}', '${CATALOG.plan}', 'a5000000-0000-4000-8000-0000000000f4');`);
    const secondSession = as('teacherA', `perform public.academic_teacher_create_class_session('${A}', 'main', 'LATE2-01', 'Fixture Career A', current_date - 5, 'despues')`);
    check('el ON CONFLICT que solo cambia el tema completa la referencia', secondSession.value === 'ok' && refOf('subject_class_sessions', `subject_id = 'LATE2-01'`) === 'a6000000-0000-4000-8000-0000000000f4'
      && value(`select count(*) from public.subject_class_sessions where subject_id = 'LATE2-01';`) === '1', { secondSession, ref: refOf('subject_class_sessions', `subject_id = 'LATE2-01'`) });
    const forgedAgain = as('adminA', `update public.subject_class_sessions set study_plan_subject_id = '${CATALOG.planSubject}' where subject_id = 'LATE2-01'`);
    check('y un valor a mano en un update que no toca el texto igual se pisa', forgedAgain.value === 'ok' && refOf('subject_class_sessions', `subject_id = 'LATE2-01'`) === 'a6000000-0000-4000-8000-0000000000f4', forgedAgain);

    step = 'ambiguous career (Gate Codex P2)';
    // Otra carrera cuyo NOMBRE coincide con el CODIGO de la carrera A: el texto 'FIX-A' es ambiguo.
    sql(`insert into public.careers (id, institution_id, external_code, name) values ('a3000000-0000-4000-8000-0000000000f9', '${A}', 'OTHER-CODE', 'FIX-A');`);
    // LATE-01 esta en un solo plan: con el resolver anterior se elegia ese plan aunque la carrera fuera ambigua.
    const ambiguousResolver = sql(`select coalesce(public.academic_resolve_plan_subject_id('${A}', 'FIX-A', 'LATE-01', null)::text, 'NULL');`);
    const catalogResolver = sql(`select outcome from public.academic_resolve_catalog_subject('${A}', 'FIX-A', 'LATE-01');`);
    check('carrera ambigua: el resolver devuelve NULL, igual que la resolucion de la carga masiva', ambiguousResolver === 'NULL' && catalogResolver === 'CARRERA_AMBIGUA', { ambiguousResolver, catalogResolver });
    // LATE-01 esta en un solo plan (FIX-A-01 ya esta en dos planes activos a esta altura del harness).
    check('por nombre sin ambiguedad sigue resolviendo', sql(`select coalesce(public.academic_resolve_plan_subject_id('${A}', 'Fixture Career A', 'LATE-01', null)::text, 'NULL');`) === CATALOG.latePlanSubject, 'name');
    check('una carrera vacia nunca resuelve', sql(`select coalesce(public.academic_resolve_plan_subject_id('${A}', '', 'FIX-A-01', null)::text, 'NULL');`) === 'NULL', 'empty');
    sql(`delete from public.careers where id = 'a3000000-0000-4000-8000-0000000000f9';`);

    step = 'renamed subject code (Gate Codex P3)';
    // Reproduccion de Codex: renombrar el codigo en el catalogo y repetir el ON CONFLICT de clases.
    sql(`update public.subjects set code = 'GATE-RENAMED' where id = 'a5000000-0000-4000-8000-0000000000f4';`);
    const renamedSession = as('teacherA', `perform public.academic_teacher_create_class_session('${A}', 'main', 'LATE2-01', 'Fixture Career A', current_date - 5, 'renombrada')`);
    check('el atajo del trigger no conserva una referencia a un codigo que ya no coincide', renamedSession.value === 'ok' && refOf('subject_class_sessions', `subject_id = 'LATE2-01'`) === 'NULL', { renamedSession, ref: refOf('subject_class_sessions', `subject_id = 'LATE2-01'`) });

    step = 'normal updates keep working';
    const regrade = as('teacherA', `perform public.academic_teacher_upsert_student_grade('${A}', 'main', '${STUDENT.userId}', '${STUDENT.recordId}', null, 'FIX-A-01', 'Fixture Career A', 'final', 1, 9, 'regular', null)`);
    check('corregir una nota sigue andando y conserva la referencia', regrade.value === 'ok' && value(`select study_plan_subject_id from public.student_grades where institution_id = '${A}' and attempt_number = 1;`) === CATALOG.planSubject, regrade);

    report.failed = report.checks.filter(item => !item.ok).map(item => item.name);
    step = 'assertions';
    assert.deepEqual(report.failed, [], 'Catalog reference checks failed');
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
