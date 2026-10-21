import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './validateGoTrueLocalHarness.mjs';
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs';
import { STUDENT, fixtureSql } from './validateExamEligibilityParityLocal.mjs';

// Punto 3 (21/10): modelo de asignacion docente en subject_teacher_assignments. Motivo de fin, vigencia y
// "a quien reemplaza" con FK; baja por RPC (academic_end_teacher_assignment) en vez de update directo.
// Permisos, rechazos sin cambio de estado, licencia y su cierre, fin con motivo, perdida de acceso al padron,
// backfill desde metadata y re-ejecucion idempotente de 06.

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda';
const FIXTURE_FILE = 'supabase/baseline/local_ab_rls_rpc_validation.sql';
const SCHEMA_06 = 'supabase/schema/06_subject_teacher_assignments.sql';
const INSTITUTION = STUDENT.institution;
export const ACTORS = Object.freeze({
  adminA: 'a2000000-0000-4000-8000-000000000001',
  adminB: 'b2000000-0000-4000-8000-000000000001',
  teacherA: 'a2000000-0000-4000-8000-000000000002',
  replacementA: 'a2000000-0000-4000-8000-000000000006',
  studentA: STUDENT.userId,
});
const RECORDS = Object.freeze({ teacherA: 'a7000000-0000-4000-8000-000000000001', replacementA: 'a7000000-0000-4000-8000-000000000002' });
export const IDS = Object.freeze({
  titular: 'af000000-0000-4000-8000-000000000001',
  titular2: 'af000000-0000-4000-8000-000000000002',
  otherSubject: 'af000000-0000-4000-8000-000000000003',
  legacyParent: 'af000000-0000-4000-8000-000000000004',
  legacyReplacement: 'af000000-0000-4000-8000-000000000005',
  legacyEnded: 'af000000-0000-4000-8000-000000000006',
  malformedDates: 'af000000-0000-4000-8000-000000000007',
  malformedParent: 'af000000-0000-4000-8000-000000000008',
});

const quote = value => value === null || value === undefined ? 'null' : "'" + String(value).replaceAll("'", "''") + "'";

// Ejecuta una expresion SQL como el actor (rol authenticated) y devuelve { value } o { error, sqlstate }.
export function callSql(actor, expression, { statement = false } = {}) {
  const body = statement
    ? `${expression};\n  perform set_config('model.result', json_build_object('value', 'ok')::text, true);`
    : `perform set_config('model.result', json_build_object('value', (${expression}))::text, true);`;
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${actor}', true);
select set_config('request.jwt.claims', ${quote(JSON.stringify({ sub: actor, role: 'authenticated' }))}, true);
do $$ begin
  ${body}
exception when others then
  perform set_config('model.result', json_build_object('error', sqlerrm, 'sqlstate', sqlstate)::text, true);
end $$;
select current_setting('model.result');
commit;`;
}

const endCall = (id, reason, endsOn = null) => `public.academic_end_teacher_assignment('${id}', ${quote(reason)}, ${endsOn ? `${endsOn}` : 'null'}, 'harness')`;
const leaveCall = (ids, startsOn = 'current_date', endsOn = 'current_date + 7', replacement = ACTORS.replacementA) => `public.academic_create_teacher_subject_leave('${INSTITUTION}', 'main', array[${ids.map(id => `'${id}'::uuid`).join(',')}], '${replacement}', '${RECORDS.replacementA}', ${startsOn}, ${endsOn}, 'harness')`;
const conditionCall = (id, role) => `public.academic_update_teacher_assignment_condition('${id}', '${role}')`;
const rosterCall = `(select count(*) from public.academic_get_teacher_subject_rosters('${INSTITUTION}', 'main'))`;
const noticesCall = `(select json_agg(n) from public.academic_get_student_subject_teacher_notices('${INSTITUTION}', 'main') n)`;

export const REJECTIONS = Object.freeze([
  { name: 'el alumno no termina asignaciones', actor: 'studentA', expression: endCall(IDS.titular, 'renuncia'), sqlstate: '42501' },
  { name: 'el docente no termina su propia asignacion', actor: 'teacherA', expression: endCall(IDS.titular, 'renuncia'), sqlstate: '42501' },
  { name: 'gestion de otra institucion no termina', actor: 'adminB', expression: endCall(IDS.titular, 'renuncia'), sqlstate: '42501' },
  { name: 'motivo invalido', actor: 'adminA', expression: endCall(IDS.titular, 'vacaciones'), sqlstate: '22023' },
  { name: 'sin motivo', actor: 'adminA', expression: endCall(IDS.titular, null), sqlstate: '22023' },
  { name: 'fecha de fin futura', actor: 'adminA', expression: endCall(IDS.titular, 'renuncia', 'current_date + 1'), sqlstate: '22023' },
  { name: 'licencia que termina antes de empezar', actor: 'adminA', expression: leaveCall([IDS.titular], 'current_date', 'current_date - 1'), sqlstate: '22023' },
  { name: 'un docente no se reemplaza a si mismo', actor: 'adminA', expression: leaveCall([IDS.titular], 'current_date', 'null', ACTORS.teacherA), sqlstate: '22023' },
]);

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
  const call = (actor, expression, options) => JSON.parse(sql(callSql(ACTORS[actor], expression, options)).split('\n').filter(Boolean).pop());
  const update = (actor, setClause, id) => call(actor, `update public.subject_teacher_assignments set ${setClause} where id = '${id}'`, { statement: true });
  const row = id => JSON.parse(sql(`select coalesce(row_to_json(a)::text, 'null') from (select id, teacher_id, role, status, deleted_at is not null as deleted, end_reason, starts_on, ends_on, replaces_assignment_id, metadata from public.subject_teacher_assignments where id = '${id}') a;`) || 'null');
  const assignmentsState = () => sql(`select coalesce(json_agg(a order by a.id)::text, '[]') from (select id, role, status, end_reason, ends_on, replaces_assignment_id from public.subject_teacher_assignments where institution_id = '${INSTITUTION}') a;`);
  const check = (name, ok, detail) => { report.checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) }); };
  const expectState = (name, actual, sqlstate) => check(name, actual?.sqlstate === sqlstate, actual);
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
    sql(`delete from public.subject_teacher_assignments where institution_id = '${INSTITUTION}';
insert into public.subject_teacher_assignments (id, institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, role, status)
values ('${IDS.titular}', '${INSTITUTION}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${ACTORS.teacherA}', '${RECORDS.teacherA}', 'titular', 'active'),
       ('${IDS.otherSubject}', '${INSTITUTION}', 'main', 'FIX-A-OTHER', '${STUDENT.programId}', '${ACTORS.replacementA}', '${RECORDS.replacementA}', 'titular', 'active');
insert into public.subject_enrollments (institution_id, workspace_key, subject_id, program_id, student_id, student_record_id)
select '${INSTITUTION}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${STUDENT.userId}', '${STUDENT.recordId}'
where not exists (select 1 from public.subject_enrollments where institution_id = '${INSTITUTION}' and student_id = '${STUDENT.userId}' and subject_id = '${STUDENT.subjectId}' and deleted_at is null);`);

    step = 'schema contract';
    report.columns = JSON.parse(sql(`select json_agg(column_name order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'subject_teacher_assignments' and column_name in ('starts_on', 'ends_on', 'end_reason', 'replaces_assignment_id');`));
    check('columnas nuevas', JSON.stringify(report.columns) === JSON.stringify(['end_reason', 'ends_on', 'replaces_assignment_id', 'starts_on']), report.columns);
    report.functions = JSON.parse(sql(`select json_agg(json_build_object('name', p.proname, 'secdef', p.prosecdef, 'anon', has_function_privilege('anon', p.oid, 'execute'), 'authenticated', has_function_privilege('authenticated', p.oid, 'execute')) order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('academic_end_teacher_assignment', 'academic_create_teacher_subject_leave', 'academic_update_teacher_assignment_condition');`));
    check('contrato de funciones', JSON.stringify(report.functions.map(item => [item.name, item.secdef, item.anon, item.authenticated])) === JSON.stringify([
      ['academic_create_teacher_subject_leave', true, false, true],
      ['academic_end_teacher_assignment', true, false, true],
      ['academic_update_teacher_assignment_condition', true, false, true],
    ]), report.functions);

    step = 'rejections';
    for (const rejection of REJECTIONS) {
      const before = assignmentsState();
      const result = call(rejection.actor, rejection.expression);
      expectState(`rechazo: ${rejection.name}`, result, rejection.sqlstate);
      check(`sin cambios: ${rejection.name}`, assignmentsState() === before, 'state changed');
    }

    step = 'constraints';
    // La baja directa del panel viejo (status inactive sin motivo) ya no pasa.
    expectState('baja directa sin motivo rechazada', update('adminA', `status = 'inactive', deleted_at = now()`, IDS.titular), '23514');
    check('control: el admin si puede actualizar la fila por RLS', update('adminA', `metadata = metadata`, IDS.titular).value === 'ok', 'control');
    expectState('reemplazo de otra materia rechazado por FK', update('adminA', `replaces_assignment_id = '${IDS.otherSubject}'`, IDS.titular), '23503');
    expectState('reemplazarse a si mismo rechazado', update('adminA', `replaces_assignment_id = '${IDS.titular}'`, IDS.titular), '23514');
    expectState('fin antes del inicio rechazado', update('adminA', `starts_on = current_date, ends_on = current_date - 1`, IDS.titular), '23514');

    step = 'leave';
    const leave = call('adminA', leaveCall([IDS.titular]));
    check('licencia registrada', leave.value?.affectedSubjects === 1, leave);
    const replacementId = sql(`select id from public.subject_teacher_assignments where replaces_assignment_id = '${IDS.titular}' and status = 'active';`);
    const titular = row(IDS.titular), replacement = row(replacementId);
    check('titular en licencia con nombre del reemplazante', titular?.role === 'licencia' && titular?.metadata?.replacement_teacher_name === 'Teacher A Replacement', titular);
    check('suplencia con vinculo y vigencia reales', replacement?.role === 'suplente' && replacement?.teacher_id === ACTORS.replacementA && replacement?.starts_on && replacement?.ends_on && replacement?.metadata?.teacher_on_leave_name === 'Teacher A', replacement);
    const notices = call('studentA', noticesCall);
    check('el alumno sigue viendo el aviso de licencia', notices.value?.[0]?.teacherOnLeave === 'Teacher A' && notices.value?.[0]?.replacementTeacher === 'Teacher A Replacement', notices);
    check('el suplente accede al padron', call('replacementA', rosterCall).value === 1, 'roster');

    step = 'leave closed by condition';
    const condition = call('adminA', conditionCall(IDS.titular, 'titular'));
    const closed = row(replacementId), back = row(IDS.titular);
    check('volver a titular cierra la suplencia', condition.value?.closedReplacements === 1 && closed?.status === 'inactive' && closed?.end_reason === 'fin_suplencia' && closed?.ends_on, { condition, closed });
    check('el titular vuelve sin motivo de fin', back?.status === 'active' && back?.role === 'titular' && back?.end_reason === null, back);
    check('el suplente pierde el padron', call('replacementA', rosterCall).value === 0, 'roster');

    step = 'future leave cancelled';
    call('adminA', leaveCall([IDS.titular], 'current_date + 3', 'current_date + 10'));
    const futureId = sql(`select id from public.subject_teacher_assignments where replaces_assignment_id = '${IDS.titular}' and status = 'active';`);
    call('adminA', conditionCall(IDS.titular, 'titular'));
    const future = row(futureId);
    check('una suplencia futura cancelada respeta fin >= inicio', future?.status === 'inactive' && future?.ends_on === future?.starts_on, future);

    step = 'end with reason';
    check('el titular accede al padron antes de la baja', call('teacherA', rosterCall).value === 1, 'roster');
    const ended = call('adminA', endCall(IDS.titular, 'renuncia', 'current_date - 1'));
    const after = row(IDS.titular);
    check('renuncia registrada con motivo y fecha', ended.value?.endReason === 'renuncia' && after?.status === 'inactive' && after?.deleted && after?.end_reason === 'renuncia' && after?.ends_on && after?.metadata?.ended_by === ACTORS.adminA, { ended, after });
    check('el docente que renuncio pierde el padron', call('teacherA', rosterCall).value === 0, 'roster');
    expectState('no se termina dos veces', call('adminA', endCall(IDS.titular, 'baja')), '22023');
    expectState('cambiar la condicion no revive una asignacion terminada', call('adminA', conditionCall(IDS.titular, 'titular')), '22023');
    check('sigue terminada', row(IDS.titular)?.status === 'inactive', row(IDS.titular));

    step = 'end while on leave';
    sql(`insert into public.subject_teacher_assignments (id, institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, role, status) values ('${IDS.titular2}', '${INSTITUTION}', 'main', '${STUDENT.subjectId}', '${STUDENT.programId}', '${ACTORS.teacherA}', '${RECORDS.teacherA}', 'titular', 'active');`);
    call('adminA', leaveCall([IDS.titular2]));
    const retired = call('adminA', endCall(IDS.titular2, 'jubilacion'));
    check('jubilacion durante la licencia: la suplencia sigue', retired.value?.remainingReplacements === 1 && call('replacementA', rosterCall).value === 1, retired);

    step = 'cancel a future replacement';
    // AUD.16 P2-2: una suplencia programada (inicio futuro) se puede dar de baja: queda cancelada con fin = inicio.
    sql(`insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, role, status) values ('${INSTITUTION}', 'main', 'FIX-A-FUTURE', '${STUDENT.programId}', '${ACTORS.teacherA}', '${RECORDS.teacherA}', 'titular', 'active');`);
    const futureParent = sql(`select id from public.subject_teacher_assignments where subject_id = 'FIX-A-FUTURE' and status = 'active';`);
    call('adminA', leaveCall([futureParent], 'current_date + 5', 'current_date + 20'));
    const futureReplacement = sql(`select id from public.subject_teacher_assignments where replaces_assignment_id = '${futureParent}' and status = 'active';`);
    const cancelled = call('adminA', endCall(futureReplacement, 'fin_suplencia'));
    const cancelledRow = row(futureReplacement);
    check('una suplencia que no empezo se cancela con fin = inicio', cancelled.value?.cancelledBeforeStart === true && cancelledRow?.status === 'inactive' && cancelledRow?.ends_on === cancelledRow?.starts_on && cancelledRow?.metadata?.cancelled_before_start === true, { cancelled, cancelledRow });
    expectState('igual se rechaza una fecha de fin futura enviada a mano', call('adminA', endCall(futureParent, 'renuncia', 'current_date + 1')), '22023');

    step = 'access follows the validity period (Gate Codex P1)';
    // Una sola regla temporal: suplente solo dentro de su periodo; titular en licencia solo fuera del de la licencia.
    const canManage = (actor, subject) => call(actor, `public.academic_can_manage_subject('${INSTITUTION}', 'main', '${subject}', '${STUDENT.programId}')`).value;
    const leaveScenario = (subject, startsOn, endsOn) => {
      sql(`insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, role, status) values ('${INSTITUTION}', 'main', '${subject}', '${STUDENT.programId}', '${ACTORS.teacherA}', '${RECORDS.teacherA}', 'titular', 'active');`);
      const parent = sql(`select id from public.subject_teacher_assignments where subject_id = '${subject}' and teacher_id = '${ACTORS.teacherA}' and status = 'active';`);
      const created = call('adminA', leaveCall([parent], startsOn, endsOn));
      if (!created.value) throw new Error(`leave for ${subject} failed: ${JSON.stringify(created)}`);
      return { titular: canManage('teacherA', subject), replacement: canManage('replacementA', subject) };
    };
    const futureLeave = leaveScenario('FIX-VIG-FUTURE', 'current_date + 3', 'current_date + 10');
    check('licencia futura: el titular sigue, el suplente todavia no', futureLeave.titular === true && futureLeave.replacement === false, futureLeave);
    const current = leaveScenario('FIX-VIG-NOW', 'current_date - 1', 'current_date + 5');
    check('licencia en curso: el suplente si, el titular no', current.titular === false && current.replacement === true, current);
    const past = leaveScenario('FIX-VIG-PAST', 'current_date - 10', 'current_date - 2');
    check('licencia vencida: el titular vuelve, el suplente ya no', past.titular === true && past.replacement === false, past);
    const edges = leaveScenario('FIX-VIG-EDGE', 'current_date', 'current_date');
    check('limites inclusivos: licencia que empieza y termina hoy -> suplente si, titular no', edges.titular === false && edges.replacement === true, edges);
    const openEnded = leaveScenario('FIX-VIG-OPEN', 'current_date - 1', 'null');
    check('licencia sin fecha de fin: el suplente sigue, el titular no', openEnded.titular === false && openEnded.replacement === true, openEnded);
    check('el padron del suplente vencido queda vacio', call('replacementA', `(select count(*) from public.academic_get_teacher_subject_rosters('${INSTITUTION}', 'main') r where r."subjectId" = 'FIX-VIG-PAST')`).value === 0, 'roster');
    const helperApi = JSON.parse(sql(`select json_build_object('anon', has_function_privilege('anon', 'public.academic_teacher_assignment_grants_access(public.subject_teacher_assignments, date)', 'execute'), 'authenticated', has_function_privilege('authenticated', 'public.academic_teacher_assignment_grants_access(public.subject_teacher_assignments, date)', 'execute'))::text;`));
    check('la regla temporal no es invocable desde la API', !helperApi.anon && !helperApi.authenticated, helperApi);

    step = 'backfill and rerun';
    // Datos de antes de las columnas nuevas: suplencia vinculada solo por metadata y una baja sin motivo.
    sql(`alter table public.subject_teacher_assignments drop constraint subject_teacher_assignments_end_reason_check;
insert into public.subject_teacher_assignments (id, institution_id, workspace_key, subject_id, program_id, teacher_id, role, status, metadata) values
  ('${IDS.legacyParent}', '${INSTITUTION}', 'main', 'FIX-A-LEGACY', '${STUDENT.programId}', '${ACTORS.teacherA}', 'licencia', 'active', '{}'),
  ('${IDS.legacyReplacement}', '${INSTITUTION}', 'main', 'FIX-A-LEGACY', '${STUDENT.programId}', '${ACTORS.replacementA}', 'suplente', 'active', '{"leave_parent_assignment_id":"${IDS.legacyParent}","starts_on":"2026-10-01","ends_on":"2026-10-31"}');
insert into public.subject_teacher_assignments (id, institution_id, workspace_key, subject_id, program_id, teacher_id, role, status, deleted_at) values
  ('${IDS.legacyEnded}', '${INSTITUTION}', 'main', 'FIX-A-LEGACY-2', '${STUDENT.programId}', '${ACTORS.teacherA}', 'titular', 'inactive', now());
-- AUD.16 P2-1: metadata vieja con buen formato pero valores inexistentes; antes abortaba el 06 entero.
insert into public.subject_teacher_assignments (id, institution_id, workspace_key, subject_id, program_id, teacher_id, role, status, metadata) values
  ('${IDS.malformedDates}', '${INSTITUTION}', 'main', 'FIX-A-LEGACY', '${STUDENT.programId}', '${ACTORS.studentA}', 'suplente', 'active', '{"leave_parent_assignment_id":"${IDS.legacyParent}","starts_on":"2026-02-31","ends_on":"0000-00-00"}'),
  ('${IDS.malformedParent}', '${INSTITUTION}', 'main', 'FIX-A-LEGACY-3', '${STUDENT.programId}', '${ACTORS.replacementA}', 'suplente', 'active', '{"leave_parent_assignment_id":"------------------------------------","starts_on":"2026-10-01"}');`);
    const beforeRerun = assignmentsState();
    sql(readFileSync(resolve(SCHEMA_06), 'utf8'));
    const legacy = row(IDS.legacyReplacement), legacyEnded = row(IDS.legacyEnded);
    check('backfill del vinculo y la vigencia desde metadata', legacy?.replaces_assignment_id === IDS.legacyParent && legacy?.starts_on === '2026-10-01' && legacy?.ends_on === '2026-10-31', legacy);
    check('backfill del motivo desconocido', legacyEnded?.end_reason === 'otro', legacyEnded);
    const malformedDates = row(IDS.malformedDates), malformedParent = row(IDS.malformedParent);
    check('fechas inexistentes en metadata: vinculo si, fechas NULL, sin abortar', malformedDates?.replaces_assignment_id === IDS.legacyParent && malformedDates?.starts_on === null && malformedDates?.ends_on === null, malformedDates);
    check('uuid de guiones en metadata: sin vinculo, sin abortar', malformedParent?.replaces_assignment_id === null, malformedParent);
    check('constraint restaurado', sql(`select count(*) from pg_constraint where conname = 'subject_teacher_assignments_end_reason_check';`) === '1', 'constraint');
    const touched = [IDS.legacyReplacement, IDS.legacyEnded, IDS.malformedDates];
    const rerunChanges = JSON.parse(beforeRerun).filter(item => !touched.includes(item.id));
    const afterRerun = JSON.parse(assignmentsState()).filter(item => !touched.includes(item.id));
    check('re-ejecutar 06 no toca las demas filas', JSON.stringify(rerunChanges) === JSON.stringify(afterRerun), 'rerun changed rows');
    const beforeThirdRun = assignmentsState();
    sql(readFileSync(resolve(SCHEMA_06), 'utf8'));
    check('06 es idempotente (tercera corrida sin cambios)', assignmentsState() === beforeThirdRun, 'rerun changed rows');

    report.failed = report.checks.filter(item => !item.ok).map(item => item.name);
    step = 'assertions';
    assert.deepEqual(report.failed, [], 'Teacher assignment model checks failed');
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
