import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { STUDENT, fixtureSql } from './validateExamEligibilityParityLocal.mjs';
import { getAbsencePenaltyForExam } from '../src/modules/alumnos/lib/examEligibility.js';
import { mapExamAbsenceRow } from '../src/modules/alumnos/lib/examAbsences.js';

// F1a: acta de examen final. Permisos (solo titular o gestion), dia del examen, validaciones, aprobado ->
// student_grades, desaprobado/ausente -> el alumno sigue regular, cierre, correccion solo de gestion con motivo.

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
export const EXAM_KEY = 'mesa-legacy-a';
export const ACTORS = Object.freeze({
  adminA: 'a2000000-0000-4000-8000-000000000001',
  adminB: 'b2000000-0000-4000-8000-000000000001',
  titular: 'a2000000-0000-4000-8000-000000000002',
  otherTeacher: 'a2000000-0000-4000-8000-000000000006',
  student: STUDENT.userId,
});
export const TITULAR_DNI = '20111222';

const quote = value => value === null || value === undefined ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";

function asActor(actor, body) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${actor}', true);
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: actor, role: 'authenticated' }))}, true);
${body}
commit;`;
}

// Guarda resultados como `actor`; devuelve el json de la RPC o { error, sqlstate }.
export function saveSql(actor, results, { close = false, reason = null, institution = STUDENT.institution } = {}) {
  return asActor(actor, `do $$ begin
  perform set_config('acta.result', public.exam_save_acta_results('${institution}', 'main', '${EXAM_KEY}', ${quote(JSON.stringify(results))}::jsonb, ${close}, ${quote(reason)})::text, true);
exception when others then
  perform set_config('acta.result', json_build_object('error', sqlerrm, 'sqlstate', sqlstate)::text, true);
end $$;
select current_setting('acta.result');`);
}

export function rosterSql(actor) {
  return asActor(actor, `do $$ begin
  perform set_config('acta.roster', public.get_exam_table_roster('${STUDENT.institution}', 'main', '${EXAM_KEY}')::text, true);
exception when others then
  perform set_config('acta.roster', json_build_object('error', sqlerrm, 'sqlstate', sqlstate)::text, true);
end $$;
select current_setting('acta.roster');`);
}

// Pasos en orden: cada uno parte del estado que dejo el anterior.
export const STEPS = Object.freeze([
  { name: 'antes del dia del examen no se carga', actor: 'titular', examInFuture: true, results: [{ nota: '8' }], expectError: 'EXAM_NOT_TAKEN_YET' },
  { name: 'el alumno no carga', actor: 'student', results: [{ nota: '8' }], expectError: '42501' },
  { name: 'un docente que no es titular no carga', actor: 'otherTeacher', results: [{ nota: '8' }], expectError: '42501' },
  { name: 'gestion de otra institucion no carga', actor: 'adminB', results: [{ nota: '8' }], expectError: '42501' },
  { name: 'ausente con nota se rechaza', actor: 'titular', results: [{ ausente: true, nota: '8' }], expectError: 'EXAM_ACTA_ABSENT_WITH_GRADE' },
  { name: 'nota fuera de rango se rechaza', actor: 'titular', results: [{ nota: '11' }], expectError: 'EXAM_ACTA_GRADE_INVALID' },
  { name: 'inscripcion ajena a la mesa se rechaza', actor: 'titular', results: [{ inscripcion_id: 'aa000000-0000-4000-8000-000000000099', nota: '8' }], expectError: 'EXAM_ACTA_ENROLLMENT_NOT_FOUND' },
  { name: 'cerrar sin cargar a todos no se puede', actor: 'titular', results: [], close: true, expectError: 'EXAM_ACTA_INCOMPLETE' },
  { name: 'titular aprueba con 8: pasa a student_grades', actor: 'titular', results: [{ nota: '8' }], expect: { result: 'approved', final: 8, approvedGrades: 1, latestStatus: 'approved' } },
  { name: 'titular corrige a desaprobado (promedio 3,5): la aprobacion se anula y sigue regular', actor: 'titular', results: [{ escrito: '3', oral: '4' }], expect: { result: 'failed', final: 3.5, approvedGrades: 0, latestStatus: 'regular' } },
  { name: 'titular cierra el acta', actor: 'titular', results: [], close: true, expect: { result: 'failed', status: 'completed', closed: true } },
  { name: 'con el acta cerrada el titular no puede cambiar', actor: 'titular', results: [{ nota: '9' }], expectError: 'EXAM_ACTA_CLOSED' },
  { name: 'gestion no corrige sin motivo', actor: 'adminA', results: [{ nota: '9' }], expectError: 'EXAM_ACTA_CORRECTION_REASON_REQUIRED' },
  { name: 'gestion corrige con motivo a aprobado 7', actor: 'adminA', results: [{ nota: '7,00' }], reason: 'Error de transcripcion del acta en papel', expect: { result: 'approved', final: 7, approvedGrades: 1, latestStatus: 'approved', correctionEvents: 1 } },
  { name: 'el roster del titular muestra la nota y el acta cerrada', actor: 'titular', roster: true, expect: { rosterResult: 'approved', rosterGrade: 7, rosterClosed: true } },
  { name: 'gestion corrige a ausente: se anula la aprobacion', actor: 'adminA', results: [{ ausente: true }], reason: 'El alumno no se presento', expect: { result: 'absent', final: null, approvedGrades: 0, latestStatus: 'regular', correctionEvents: 2 } },
]);

// F1b: despues del acta, el alumno quedo ausente. Dos mesas posteriores de la misma materia: el llamado
// siguiente (pierde) y uno mas adelante (puede). Servidor y espejo del portal tienen que coincidir.
export const NEXT_CALLS = Object.freeze([
  { key: 'mesa-f1b-next', id: 'af1b0000-0000-4000-8000-000000000001', subjectRowId: 'af1b0000-0000-4000-8000-0000000000a1', daysAhead: 10, call: 'first', expect: 'BLOCKED_BY_ABSENCE_PENALTY' },
  { key: 'mesa-f1b-later', id: 'af1b0000-0000-4000-8000-000000000002', subjectRowId: 'af1b0000-0000-4000-8000-0000000000a2', daysAhead: 45, call: 'first', expect: 'registered' },
]);

export function nextCallsSetupSql() {
  return NEXT_CALLS.map((call) => `insert into public.exam_tables (id, institution_id, workspace_key, exam_period_key, exam_call_key, exam_call_label, scheduled_starts_at, enrollment_opens_at, enrollment_closes_at, status, legacy_exam_table_id, legacy_snapshot_id)
values ('${call.id}', '${STUDENT.institution}', 'main', to_char(timezone('America/Argentina/Buenos_Aires', now() + interval '${call.daysAhead} days'), 'YYYY-MM'), '${call.call}', 'Llamado', now() + interval '${call.daysAhead} days', now() - interval '1 day', now() + interval '${call.daysAhead - 2} days', 'open', '${call.key}', '${call.key}');
insert into public.exam_table_subjects (id, institution_id, exam_table_id, career_id, study_plan_id, study_plan_subject_id, subject_id, legacy_subject_id, legacy_program_id)
values ('${call.subjectRowId}', '${STUDENT.institution}', '${call.id}', 'a3000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', '${STUDENT.subjectId}', '${STUDENT.programId}');`).join('\n');
}

export function portalEnrollSql(examTableId) {
  return asActor(STUDENT.userId, `do $$ begin
  perform public.upsert_exam_enrollment_from_portal('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.userId}', '${STUDENT.recordId}', '${examTableId}', '${STUDENT.subjectId}', '${STUDENT.programId}');
  perform set_config('acta.next', 'registered', true);
exception when others then
  perform set_config('acta.next', sqlerrm, true);
end $$;
select current_setting('acta.next');`).replace(/commit;$/, 'rollback;');
}

export function evaluateStep(step, output) {
  const failures = [];
  if (step.expectError) {
    const actual = output.result?.sqlstate === '42501' ? '42501' : output.result?.error;
    if (actual !== step.expectError) failures.push(`expected ${step.expectError}, got ${JSON.stringify(output.result)}`);
    if (output.changed) failures.push('rejected call changed state');
    return failures;
  }
  if (output.result?.error) failures.push(`unexpected error ${output.result.error}`);
  const expected = step.expect ?? {};
  const state = output.state ?? {};
  const checks = {
    result: state.result,
    final: state.final === null || state.final === undefined ? null : Number(state.final),
    approvedGrades: state.approvedGrades,
    latestStatus: state.latestStatus,
    status: state.status,
    closed: output.result?.acta_cerrada,
    correctionEvents: state.correctionEvents,
    rosterResult: output.roster?.alumnos?.[0]?.resultado,
    rosterGrade: output.roster?.alumnos?.[0]?.nota === undefined ? undefined : Number(output.roster.alumnos[0].nota),
    rosterClosed: output.roster?.acta_cerrada,
  };
  for (const [key, value] of Object.entries(expected)) if (checks[key] !== value) failures.push(`${key}: expected ${value}, got ${checks[key]}`);
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
  const lastJson = text => JSON.parse(text.split('\n').filter(Boolean).pop());
  const stateJson = () => JSON.parse(sql(`select json_build_object(
  'result', (select r.result from public.exam_results r where r.institution_id = '${STUDENT.institution}'),
  'final', (select r.final_grade from public.exam_results r where r.institution_id = '${STUDENT.institution}'),
  'approvedGrades', (select count(*) from public.student_grades g where g.student_id = '${STUDENT.userId}' and g.grade_type = 'final_exam' and g.deleted_at is null),
  'latestStatus', (select g.academic_status from public.student_grades g where g.student_id = '${STUDENT.userId}' and g.subject_id = '${STUDENT.subjectId}' and g.program_id = '${STUDENT.programId}' and g.deleted_at is null and g.academic_status <> 'pending' order by g.updated_at desc, g.created_at desc limit 1),
  'status', (select t.status from public.exam_tables t where t.legacy_exam_table_id = '${EXAM_KEY}'),
  'correctionEvents', (select count(*) from public.exam_table_events e where e.event_type = 'corrected' and e.reason_code = 'acta_correction'));`));
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
    // Titular por DNI publicado en la mesa; el alumno regular se inscribe por el RPC del portal.
    sql(`update public.teacher_records set dni = '${TITULAR_DNI}' where profile_id = '${ACTORS.titular}';
update public.exam_tables set metadata = metadata || jsonb_build_object('titular_dni', '${TITULAR_DNI}') where id = '${STUDENT.examSubject}';
update public.exam_teacher_assignments set confirmation_status = 'confirmed' where exam_table_id = '${STUDENT.examSubject}';`);
    const enroll = lastJson(sql(asActor(ACTORS.student, `do $$ begin
  perform set_config('acta.enroll', (public.upsert_exam_enrollment_from_portal('${STUDENT.institution}', 'main', '${STUDENT.userId}', '${STUDENT.userId}', '${STUDENT.recordId}', '${STUDENT.examSubject}', '${STUDENT.subjectId}', '${STUDENT.programId}'))::text, true);
exception when others then
  perform set_config('acta.enroll', json_build_object('error', sqlerrm)::text, true);
end $$;
select to_json(current_setting('acta.enroll'));`)));
    assert.ok(!String(enroll).includes('"error"'), `Enrollment failed: ${enroll}`);
    const enrollmentId = sql(`select id from public.exam_enrollments where student_id = '${STUDENT.userId}' and status = 'registered';`);
    assert.match(enrollmentId, /^[0-9a-f-]{36}$/);
    step = 'function contract';
    report.functions = JSON.parse(sql(`select json_agg(json_build_object('name', p.proname, 'secdef', p.prosecdef, 'config', p.proconfig, 'anon', has_function_privilege('anon', p.oid, 'execute'), 'authenticated', has_function_privilege('authenticated', p.oid, 'execute')) order by p.proname) from pg_proc p where p.proname in ('exam_save_acta_results', 'exam_table_caller_is_titular') and p.pronamespace = 'public'::regnamespace;`));
    assert.deepEqual(report.functions, [
      { name: 'exam_save_acta_results', secdef: true, config: ['search_path=""'], anon: false, authenticated: true },
      { name: 'exam_table_caller_is_titular', secdef: true, config: ['search_path=""'], anon: false, authenticated: false },
    ]);
    report.tableGrants = JSON.parse(sql(`select json_build_object('rls', relrowsecurity, 'authenticatedSelect', has_table_privilege('authenticated', 'public.exam_results', 'select'), 'anonSelect', has_table_privilege('anon', 'public.exam_results', 'select')) from pg_class where oid = 'public.exam_results'::regclass;`));
    assert.deepEqual(report.tableGrants, { rls: true, authenticatedSelect: false, anonSelect: false });

    report.steps = [];
    for (const item of STEPS) {
      step = 'step ' + item.name;
      sql(`update public.exam_tables set scheduled_starts_at = now() ${item.examInFuture ? "+ interval '2 days'" : "- interval '2 hours'"}, enrollment_opens_at = now() - interval '10 days', enrollment_closes_at = now() - interval '1 day' where id = '${STUDENT.examSubject}';`);
      const before = JSON.stringify(stateJson());
      const output = {};
      if (item.roster) {
        output.roster = lastJson(sql(rosterSql(ACTORS[item.actor])));
      } else {
        const results = item.results.map(row => ({ inscripcion_id: enrollmentId, ...row }));
        output.result = lastJson(sql(saveSql(ACTORS[item.actor], results, { close: Boolean(item.close), reason: item.reason ?? null })));
      }
      output.state = stateJson();
      output.changed = JSON.stringify(output.state) !== before;
      report.steps.push({ name: item.name, result: output.result ?? { roster: output.roster?.alumnos?.[0] }, state: output.state, failures: evaluateStep(item, output) });
    }
    step = 'F1b next call';
    sql(nextCallsSetupSql());
    const absences = JSON.parse(lastJson(sql(asActor(ACTORS.student, `select to_json(public.get_student_exam_absences('${STUDENT.institution}', 'main')::text);`))));
    const foreignAbsences = JSON.parse(lastJson(sql(asActor(ACTORS.titular, `select to_json(public.get_student_exam_absences('${STUDENT.institution}', 'main')::text);`))));
    const mirrorGrades = absences.map(mapExamAbsenceRow);
    const examRows = JSON.parse(sql(`select json_agg(json_build_object('id', t.id, 'subject_id', '${STUDENT.subjectId}', 'program_id', '${STUDENT.programId}', 'exam_call', t.exam_call_key, 'exam_date', to_char(timezone('America/Argentina/Buenos_Aires', t.scheduled_starts_at), 'YYYY-MM-DD"T"HH24:MI:SS')) order by t.scheduled_starts_at) from public.exam_tables t where t.legacy_exam_table_id like 'mesa-f1b-%';`));
    report.nextCalls = NEXT_CALLS.map((call) => {
      const server = sql(portalEnrollSql(call.id)).split('\n').filter(Boolean).pop();
      const mirror = getAbsencePenaltyForExam({ exam: examRows.find((row) => row.id === call.id), exams: examRows, grades: mirrorGrades });
      const failures = [];
      if (server !== call.expect) failures.push(`server: expected ${call.expect}, got ${server}`);
      if (mirror.blocked !== (call.expect === 'BLOCKED_BY_ABSENCE_PENALTY')) failures.push(`mirror blocked=${mirror.blocked} vs server ${server}`);
      return { name: call.key, server, mirrorBlocked: mirror.blocked, failures };
    });
    report.absences = { own: absences.length, otherUser: foreignAbsences.length };
    if (absences.length !== 1 || foreignAbsences.length !== 0) report.nextCalls.push({ name: 'absences visibility', failures: [`own=${absences.length} other=${foreignAbsences.length}`] });
    report.failed = report.steps.filter(item => item.failures.length).map(item => item.name)
      .concat(report.nextCalls.filter(item => item.failures.length).map(item => item.name));
    step = 'assertions';
    assert.deepEqual(report.failed, [], 'Exam acta steps failed');
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
