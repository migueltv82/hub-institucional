import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BASELINE } from './validateGoTrueLocalHarness.mjs'
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs'

// EX.1: publish_exam_tables_from_schedule crea las mesas publicadas en exam_tables; el portal alumno
// muestra solo las mesas de materias donde el alumno es regular segun student_grades (la misma regla
// que upsert_exam_enrollment_from_portal) y la inscripcion funciona contra la mesa publicada.
// EX.7/EX.8: get_exam_table_roster muestra los inscriptos solo al titular (DNI publicado o asignacion titular de
// la materia) y al personal de gestion; los vocales no. Inscripcion hasta 24 h antes; el admin inscribe fuera
// de plazo con las mismas reglas de elegibilidad; panel admin de mesas y actas.
// Uso: node scripts/validateExamPublicationLocal.mjs

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda'
const INSTITUTION = 'e1000000-0000-4000-8000-000000000001'
const ADMIN = 'e1000000-0000-4000-8000-0000000000a1'
const TEACHER = 'e1000000-0000-4000-8000-0000000000d1'
const REGULAR = 'e1000000-0000-4000-8000-0000000000b1'
const LIBRE = 'e1000000-0000-4000-8000-0000000000b2'
const VOCAL = 'e1000000-0000-4000-8000-0000000000d2'
const OUTSIDER = 'e1000000-0000-4000-8000-0000000000d3'
const ASSIGNED = 'e1000000-0000-4000-8000-0000000000d4'
const CAREER = 'PROFESORADO DE PRUEBA UAT'

export function futureMonday(daysAhead = 14, now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead))
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function mesa(code, draftId, date, extra = {}) {
  return { id: `exam-engine-v21-${draftId}-${date}`, materia: code, codigo: code, carrera: CAREER, fechaIso: date, inicio: '18:00', fin: '20:00', aula: 'A1', estado: 'confirmada', exam_call: 'first', llamado: 'Primer llamado', ...extra }
}

export async function main() {
  const run = randomBytes(8).toString('hex')
  const database = disposableDatabase(`gotrue_harness_${run}`)
  const report = { task: 'EX.1+EX.7+EX.8', run, staging: 'NONE', production: 'NONE' }
  let step = 'preflight', created = false
  const docker = (args, input) => {
    try { return execFileSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }) }
    catch (error) {
      const failure = new Error(`Local operation failed at ${step}: ${String(error.stderr ?? '').match(/ERROR:[^\n]*/)?.[0] ?? 'sin detalle'}`)
      failure.stderr = String(error.stderr ?? '')
      throw failure
    }
  }
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim()
  const as = (user, query, commit = false) => sql(`begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${user}', true);
${query}
${commit ? 'commit' : 'rollback'};`).split('\n').filter(Boolean).pop()
  const sqlState = (user, query) => {
    try { as(user, query); return 'OK' } catch (error) { return (error.stderr ?? '').match(/ERROR:\s+([^\n]+)/)?.[1]?.trim() ?? 'ERROR' }
  }
  const publish = (user, mesas) => JSON.parse(as(user, `select public.publish_exam_tables_from_schedule('${INSTITUTION}', 'main', '${JSON.stringify(mesas).replaceAll("'", "''")}'::jsonb);`, true))
  const setSnapshot = (mesas) => sql(`insert into public.workspace_snapshots (institution_id, workspace_key, payload, updated_at)
values ('${INSTITUTION}', 'main', jsonb_build_object('cronograma', '${JSON.stringify(mesas).replaceAll("'", "''")}'::jsonb), now())
on conflict (institution_id, workspace_key) do update set payload = excluded.payload, updated_at = excluded.updated_at;`)
  const visible = (user) => JSON.parse(as(user, `select coalesce((select json_agg(m->>'id' order by m->>'id') from jsonb_array_elements(payload->'cronograma') m), '[]'::json)
from public.get_student_portal_workspace_snapshot('${INSTITUTION}', 'main');`))
  const roster = (user, examId) => {
    try { return JSON.parse(as(user, `select public.get_exam_table_roster('${INSTITUTION}', 'main', '${examId}');`)) }
    catch (error) { return (error.stderr ?? '').match(/ERROR:\s+([^\n]+)/)?.[1]?.trim() ?? 'ERROR' }
  }
  const enroll = (user, recordId, examId, code) => sqlState(user, `select id from public.upsert_exam_enrollment_from_portal('${INSTITUTION}', 'main', '${user}', '${user}', '${recordId}', '${examId}', '${code}', '${CAREER}', 'registered', now(), null, null, null, '{}'::jsonb);`)
  const enrollCommit = (user, recordId, examId, code) => as(user, `select status from public.upsert_exam_enrollment_from_portal('${INSTITUTION}', 'main', '${user}', '${user}', '${recordId}', '${examId}', '${code}', '${CAREER}', 'registered', now(), null, null, null, '{}'::jsonb);`, true)
  try {
    const source = JSON.parse(docker(['inspect', SOURCE]))[0]
    assert.equal(source.State.Health.Status, 'healthy')
    step = 'schema preparation'
    const schema = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--schema-only', '--no-comments'])
    const migrations = docker(['exec', SOURCE, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres', '--data-only', '--table=auth.schema_migrations'])
    assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0')
    created = true
    sql(`create database ${database} template template0; comment on database ${database} is '${run}';`, 'postgres')
    sql(schema); sql(migrations)
    for (const file of BASELINE) sql(readFileSync(resolve('supabase/schema', file), 'utf8'))

    step = 'fixture'
    const user = (id, email, role, membership) => `insert into auth.users (id, email) values ('${id}', '${email}');
insert into public.profiles (user_id, email, account_role, is_blocked) values ('${id}', '${email}', '${role}', false)
  on conflict (user_id) do update set account_role = excluded.account_role, is_blocked = false;
insert into public.memberships (institution_id, user_id, role) values ('${INSTITUTION}', '${id}', '${membership}');`
    sql(`insert into public.institutions (id, slug, name, status) values ('${INSTITUTION}', 'ex1-${run}', 'Instituto EX1', 'active');
${user(ADMIN, 'admin@ex1.invalid', 'admin_instituto', 'admin')}
${user(TEACHER, 'docente@ex1.invalid', 'docente', 'viewer')}
${user(REGULAR, 'regular@ex1.invalid', 'alumno', 'viewer')}
${user(LIBRE, 'libre@ex1.invalid', 'alumno', 'viewer')}
${user(VOCAL, 'vocal@ex1.invalid', 'docente', 'viewer')}
${user(OUTSIDER, 'ajeno@ex1.invalid', 'docente', 'viewer')}
${user(ASSIGNED, 'asignado@ex1.invalid', 'docente', 'viewer')}
insert into public.teacher_records (institution_id, workspace_key, first_name, last_name, dni, profile_id) values
  ('${INSTITUTION}', 'main', 'Titular', 'Publicado', '55.555.555', '${TEACHER}'),
  ('${INSTITUTION}', 'main', 'Titular', 'Asignado', '66666666', '${ASSIGNED}'),
  ('${INSTITUTION}', 'main', 'Vocal', 'Tribunal', '33.333.333', '${VOCAL}'),
  ('${INSTITUTION}', 'main', 'Docente', 'Ajeno', '44444444', '${OUTSIDER}');
insert into public.careers (institution_id, external_code, name) values ('${INSTITUTION}', 'UAT', '${CAREER}');
insert into public.study_plans (institution_id, career_id, external_code, name, plan_year)
  select '${INSTITUTION}', id, 'UAT-PLAN', 'Plan UAT', 2026 from public.careers where institution_id = '${INSTITUTION}';
insert into public.subjects (institution_id, code, name) values ('${INSTITUTION}', 'UAT01', 'Materia uno'), ('${INSTITUTION}', 'UAT02', 'Materia dos');
insert into public.study_plan_subjects (institution_id, plan_id, subject_id, year_number, exam_required)
  select '${INSTITUTION}', plan.id, subject.id, 1, true from public.study_plans plan cross join public.subjects subject where plan.institution_id = '${INSTITUTION}' and subject.institution_id = '${INSTITUTION}';
insert into public.student_records (institution_id, workspace_key, first_name, last_name, dni, email, career, academic_year, profile_id) values
  ('${INSTITUTION}', 'main', 'Ana', 'Regular', '11111111', 'regular@ex1.invalid', '${CAREER}', '1', '${REGULAR}'),
  ('${INSTITUTION}', 'main', 'Beto', 'Libre', '22222222', 'libre@ex1.invalid', '${CAREER}', '1', '${LIBRE}');
insert into public.student_career_plans (institution_id, student_id, career_id, plan_id, status)
  select '${INSTITUTION}', student.id, plan.career_id, plan.id, 'active' from public.student_records student cross join public.study_plans plan where student.institution_id = '${INSTITUTION}';
insert into public.student_grades (institution_id, workspace_key, student_id, student_record_id, subject_id, program_id, grade_type, grade_value, academic_status, updated_at)
  select '${INSTITUTION}', 'main', student.profile_id, student.id, v.code, '${CAREER}', v.kind, v.grade, v.status, v.at
  from public.student_records student
  join (values ('${REGULAR}'::uuid, 'UAT01', 'final', 7, 'regular', now() - interval '1 day'),
               ('${REGULAR}'::uuid, 'UAT01', 'partial', 5, 'pending', now()),
               ('${REGULAR}'::uuid, 'UAT02', 'final', 6, 'regular', now() - interval '2 day'),
               ('${LIBRE}'::uuid, 'UAT01', 'partial', 3, 'regular', now() - interval '3 day'),
               ('${LIBRE}'::uuid, 'UAT01', 'final', 2, 'libre', now() - interval '1 day')) as v(profile, code, kind, grade, status, at)
    on v.profile = student.profile_id;`)
    sql(`insert into public.subject_teacher_assignments (institution_id, workspace_key, subject_id, program_id, teacher_id, role, status)
values ('${INSTITUTION}', 'main', 'UAT01', '${CAREER}', '${ASSIGNED}', 'titular', 'active'),
  ('${INSTITUTION}', 'main', 'UAT01', '${CAREER}', '${VOCAL}', 'suplente', 'active');`)
    const recordOf = (profile) => sql(`select id from public.student_records where profile_id = '${profile}';`)
    const regularRecord = recordOf(REGULAR)
    const libreRecord = recordOf(LIBRE)
    const date = futureMonday()
    const m1 = mesa('UAT01', 'm1', date, { tribunal_dnis: '55555555,33333333', titular_dni: '55555555', profesorTitular: 'Publicado Titular', vocal1: 'Tribunal Vocal' })
    const m2 = mesa('UAT02', 'm2', date, { inicio: '19:00' })
    const unknown = mesa('ZZZ99', 'm3', date)
    setSnapshot([m1, m2])

    step = 'permissions'
    report.teacherPublish = sqlState(TEACHER, `select public.publish_exam_tables_from_schedule('${INSTITUTION}', 'main', '[]'::jsonb);`)
    report.studentPublish = sqlState(REGULAR, `select public.publish_exam_tables_from_schedule('${INSTITUTION}', 'main', '[]'::jsonb);`)
    report.beforePublish = { regularSees: visible(REGULAR), regularEnroll: enroll(REGULAR, regularRecord, m1.id, 'UAT01') }

    step = 'publish'
    report.firstPublish = publish(ADMIN, [m1, m2, unknown])
    report.tables = JSON.parse(sql(`select json_agg(json_build_object('legacy', legacy_exam_table_id, 'snapshot', legacy_snapshot_id, 'status', status, 'subjects', (select count(*) from public.exam_table_subjects s where s.exam_table_id = t.id), 'window_ok', enrollment_opens_at < enrollment_closes_at and enrollment_closes_at <= scheduled_starts_at) order by legacy_exam_table_id) from public.exam_tables t;`))

    step = 'student portal'
    report.regularSees = visible(REGULAR)
    report.libreSees = visible(LIBRE)

    step = 'enrollment'
    report.regularEnroll = enrollCommit(REGULAR, regularRecord, m1.id, 'UAT01')
    report.libreEnroll = enroll(LIBRE, libreRecord, m1.id, 'UAT01')

    step = 'roster'
    report.roster = {
      admin: roster(ADMIN, m1.id),
      titularPublicado: roster(TEACHER, m1.id),
      titularAsignado: roster(ASSIGNED, m1.id),
      vocalTribunal: roster(VOCAL, m1.id),
      docenteAjeno: roster(OUTSIDER, m1.id),
      alumno: roster(REGULAR, m1.id),
      vocalOtraMesa: roster(VOCAL, m2.id),
      ajenoMesaInexistente: roster(OUTSIDER, 'exam-engine-v21-no-existe'),
      adminMesaInexistente: roster(ADMIN, 'exam-engine-v21-no-existe'),
      anonPuedeEjecutar: sql(`select has_function_privilege('anon', 'public.get_exam_table_roster(uuid,text,text)', 'execute');`),
      tribunalGuardado: JSON.parse(sql(`select jsonb_build_object('dnis', metadata->'tribunal_dnis', 'titular', metadata->'titular_dni', 'nombres', metadata->'tribunal') from public.exam_tables where legacy_exam_table_id = lower('${m1.id}');`)),
    }

    step = 'republish'
    report.secondPublish = publish(ADMIN, [m1, m2])
    report.tableCountAfterSecond = Number(sql('select count(*) from public.exam_tables;'))
    report.emptyPublish = publish(ADMIN, [])
    report.statusesAfterEmpty = JSON.parse(sql(`select json_object_agg(legacy_exam_table_id, status) from public.exam_tables;`))

    step = 'audit cases'
    // P1: el turno siguiente reusa el id del motor; con otra fecha es otra mesa y no toca la de diciembre.
    sql(`update public.exam_tables set status = 'completed' where legacy_exam_table_id = lower('${m1.id}');`)
    const nextDate = futureMonday(42)
    const m1Next = mesa('UAT01', 'm1', nextDate)
    report.nextTermPublish = publish(ADMIN, [m1, m1Next])
    report.afterNextTerm = JSON.parse(sql(`select json_agg(json_build_object('id', legacy_snapshot_id, 'status', status, 'inscriptos', (select count(*) from public.exam_enrollments e where e.exam_table_id = t.id and e.status = 'registered')) order by scheduled_starts_at) from public.exam_tables t where legacy_exam_table_id like '%-m1-%';`))
    // P2: mesa repetida, fecha invalida y mesa a menos de 48 h se omiten sin abortar la publicacion.
    // A 12 h: dentro de las 24 h previas, no se abre inscripcion.
    const soonAt = new Date(Date.now() + 12 * 3600 * 1000)
    const soon = soonAt.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    const soonTime = soonAt.toLocaleTimeString('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' })
    report.oddPublish = publish(ADMIN, [m1Next, m1Next, mesa('UAT02', 'm4', '2026-02-30'), mesa('UAT02', 'm5', nextDate, { inicio: '25:00' }), mesa('UAT02', 'm6', soon, { inicio: soonTime, fin: '' })])
    // P2: una nota guardada con el codigo de carrera no habilita la mesa en el portal (la RPC exige el nombre).
    setSnapshot([m1Next, m2])
    sql(`update public.exam_tables set status = 'open' where legacy_exam_table_id = lower('${m2.id}');
update public.student_grades set program_id = 'UAT' where student_id = '${REGULAR}' and subject_id = 'UAT02';`)
    report.regularSeesWithCodeGrade = visible(REGULAR)
    report.enrollWithCodeGrade = enroll(REGULAR, regularRecord, m2.id, 'UAT02')

    step = 'admin overview'
    report.overview = {
      admin: JSON.parse(as(ADMIN, `select public.get_exam_tables_admin_overview('${INSTITUTION}', 'main');`)),
      docente: sqlState(TEACHER, `select public.get_exam_tables_admin_overview('${INSTITUTION}', 'main');`),
    }

    step = 'admin special enrollment'
    // Plazo vencido: el portal rechaza; el admin inscribe con motivo y quedan auditados quien y por que.
    sql(`update public.exam_tables set enrollment_opens_at = now() - interval '3 day', enrollment_closes_at = now() - interval '1 hour' where legacy_exam_table_id = lower('${m1Next.id}');`)
    const adminEnroll = (actor, examId, recordId, reason) => {
      try { return JSON.parse(as(actor, `select public.admin_enroll_student_in_exam_table('${INSTITUTION}', 'main', '${examId}', '${recordId}', '${reason}');`, true)) }
      catch (error) { return (error.stderr ?? '').match(/ERROR:\s+([^\n]+)/)?.[1]?.trim() ?? 'ERROR' }
    }
    report.special = {
      portalFueraDePlazo: enroll(REGULAR, regularRecord, m1Next.id, 'UAT01'),
      docenteIntenta: adminEnroll(TEACHER, m1Next.id, regularRecord, 'Pedido de la secretaria'),
      sinMotivo: adminEnroll(ADMIN, m1Next.id, regularRecord, 'ok'),
      libre: adminEnroll(ADMIN, m1Next.id, libreRecord, 'Pedido de la secretaria'),
      admin: adminEnroll(ADMIN, m1Next.id, regularRecord, 'Pedido de la secretaria'),
      repetida: adminEnroll(ADMIN, m1Next.id, regularRecord, 'Pedido de la secretaria'),
      auditoria: JSON.parse(sql(`select json_build_object('creado_por_admin', e.created_by = '${ADMIN}', 'motivo', e.metadata->>'admin_enrollment_reason', 'evento', (select reason_code from public.exam_enrollment_events ev where ev.exam_enrollment_id = e.id)) from public.exam_enrollments e join public.exam_tables t on t.id = e.exam_table_id where t.legacy_exam_table_id = lower('${m1Next.id}') and e.status = 'registered';`)),
    }
    sql(`update public.exam_tables set scheduled_starts_at = now() - interval '2 day', enrollment_opens_at = now() - interval '5 day', enrollment_closes_at = now() - interval '3 day' where legacy_exam_table_id = lower('${m1Next.id}');`)
    report.special.despuesDelDia = adminEnroll(ADMIN, m1Next.id, libreRecord, 'Pedido de la secretaria')

    step = 'window 24h'
    const in30h = new Date(Date.now() + 30 * 3600 * 1000)
    const in20h = new Date(Date.now() + 20 * 3600 * 1000)
    const hhmm = (d) => d.toLocaleTimeString('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' })
    const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
    report.window24 = publish(ADMIN, [m1Next, mesa('UAT02', 'w30', ymd(in30h), { inicio: hhmm(in30h), fin: '' }), mesa('UAT02', 'w20', ymd(in20h), { inicio: hhmm(in20h), fin: '' })])

    step = 'assertions'
    assert.equal(report.teacherPublish, 'Acceso denegado: solo el personal de gestion de la institucion publica mesas.')
    assert.equal(report.studentPublish, report.teacherPublish)
    assert.deepEqual(report.beforePublish, { regularSees: [], regularEnroll: 'EXAM_TABLE_NOT_AVAILABLE' }, 'sin publicar no hay mesa visible ni inscripcion')
    assert.equal(report.firstPublish.nuevas, 2)
    assert.equal(report.firstPublish.omitidas.length, 1)
    assert.match(report.firstPublish.omitidas[0].motivo, /ZZZ99 no esta en el catalogo/)
    assert.deepEqual(report.tables, [
      { legacy: m1.id.toLowerCase(), snapshot: m1.id, status: 'open', subjects: 1, window_ok: true },
      { legacy: m2.id.toLowerCase(), snapshot: m2.id, status: 'open', subjects: 1, window_ok: true },
    ])
    assert.deepEqual(report.regularSees, [m1.id, m2.id], 'el regular ve las mesas de sus materias regulares (la nota pending posterior no cuenta)')
    assert.deepEqual(report.libreSees, [], 'el que quedo libre no ve la mesa: mismo criterio que la RPC')
    assert.equal(report.regularEnroll, 'registered')
    assert.equal(report.libreEnroll, 'EXAM_REGULARITY_REQUIRED')
    const denied = 'Acceso denegado: solo el titular de la mesa puede ver los inscriptos.'
    assert.deepEqual(report.roster.tribunalGuardado, { dnis: ['33333333', '55555555'], titular: '55555555', nombres: { titular: 'Publicado Titular', vocal1: 'Tribunal Vocal' } })
    assert.deepEqual(report.roster.admin.alumnos.map((alumno) => [alumno.nombre, alumno.apellido, alumno.nombres, alumno.dni, alumno.materia, alumno.carrera]), [['Ana Regular', 'Regular', 'Ana', '11111111', 'UAT01', CAREER]], 'solo el inscripto: el libre no aparece')
    assert.deepEqual(report.roster.titularPublicado, report.roster.admin, 'el titular publicado ve la lista (DNI con puntos en su legajo)')
    assert.deepEqual(report.roster.titularAsignado, report.roster.admin, 'el titular asignado a la materia ve la lista')
    assert.deepEqual([report.roster.vocalTribunal, report.roster.docenteAjeno, report.roster.alumno, report.roster.vocalOtraMesa, report.roster.ajenoMesaInexistente], [denied, denied, denied, denied, denied], 'el vocal (aunque tenga asignacion suplente) y nadie mas, sin revelar que mesas existen')
    assert.equal(report.overview.docente, 'Acceso denegado: solo el personal de gestion ve las mesas y actas.')
    const overviewM1 = report.overview.admin.find((row) => row.mesa_id === m1.id)
    assert.deepEqual([overviewM1.carrera, overviewM1.materia_codigo, overviewM1.anio, overviewM1.plan, overviewM1.inscriptos, overviewM1.tribunal.titular], [CAREER, 'UAT01', 1, 'Plan UAT', 1, 'Publicado Titular'])
    assert.equal(report.overview.admin.find((row) => row.mesa_id === m2.id).inscriptos, 0)
    assert.equal(report.special.portalFueraDePlazo, 'EXAM_ENROLLMENT_WINDOW_CLOSED')
    assert.equal(report.special.docenteIntenta, 'Acceso denegado: solo el personal de gestion hace inscripciones especiales.')
    assert.equal(report.special.sinMotivo, 'EXAM_ADMIN_ENROLLMENT_REASON_REQUIRED')
    assert.equal(report.special.libre, 'EXAM_REGULARITY_REQUIRED', 'el admin se saltea solo el plazo, no la regularidad')
    assert.deepEqual([report.special.admin.estado, report.special.admin.materia], ['registered', 'UAT01'])
    assert.equal(report.special.repetida, 'EXAM_ENROLLMENT_ALREADY_REGISTERED')
    assert.deepEqual(report.special.auditoria, { creado_por_admin: true, motivo: 'Pedido de la secretaria', evento: 'admin_special_enrollment' })
    assert.equal(report.special.despuesDelDia, 'EXAM_ADMIN_ENROLLMENT_AFTER_EXAM_DAY')
    assert.deepEqual(report.window24.omitidas.map((item) => item.motivo), ['Faltan menos de 24 horas para la mesa: no se abre inscripcion.'], 'cierre por defecto 24 h antes: a 30 h se publica, a 20 h no')
    assert.equal(report.roster.adminMesaInexistente, 'EXAM_TABLE_NOT_FOUND')
    assert.equal(report.roster.anonPuedeEjecutar, 'f')
    assert.deepEqual([report.secondPublish.nuevas, report.secondPublish.actualizadas, report.tableCountAfterSecond], [0, 2, 2], 'republicar actualiza sin duplicar')
    assert.equal(report.emptyPublish.canceladas, 1)
    assert.equal(report.emptyPublish.conservadas_con_inscriptos.length, 1)
    assert.deepEqual(report.statusesAfterEmpty, { [m1.id.toLowerCase()]: 'open', [m2.id.toLowerCase()]: 'cancelled' }, 'la mesa con inscriptos se conserva; la otra se cancela')
    assert.deepEqual(report.afterNextTerm, [
      { id: m1.id, status: 'completed', inscriptos: 1 },
      { id: m1Next.id, status: 'open', inscriptos: 0 },
    ], 'el turno nuevo es otra mesa; la cerrada no se reabre ni pierde inscriptos')
    assert.equal(report.nextTermPublish.nuevas, 1)
    assert.match(JSON.stringify(report.nextTermPublish.omitidas), /ya fue cerrada/)
    assert.deepEqual(report.oddPublish.omitidas.map((item) => item.motivo.split(':')[0].split(' ').slice(0, 3).join(' ')), ['La mesa esta', 'Fecha u hora', 'Fecha u hora', 'Faltan menos de'])
    assert.equal(report.oddPublish.actualizadas, 1, 'lo valido se publica igual')
    assert.deepEqual(report.regularSeesWithCodeGrade, [m1Next.id], 'nota con codigo de carrera: el portal no la muestra, igual que la RPC')
    assert.equal(report.enrollWithCodeGrade, 'EXAM_REGULARITY_REQUIRED')
    report.result = 'PASS'
  } catch (error) {
    report.result = 'FAIL'
    report.error = `Failed at ${step}: ${error.message.split('\n')[0]}`
  } finally {
    const errors = []
    if (created) {
      try {
        if (sql(`select count(*) from pg_database where datname='${database}';`, 'postgres') === '1') {
          assert.equal(sql(`select shobj_description(oid,'pg_database') from pg_database where datname='${database}';`, 'postgres'), run)
          sql(`drop database ${database} with (force);`, 'postgres')
        }
        assert.equal(sql(`select count(*) from pg_database where datname='${database}';`, 'postgres'), '0')
      } catch { errors.push('Database cleanup failed') }
    }
    report.cleanup = { databases: errors.length ? 'unverified' : 0, errors }
    if (errors.length) report.result = 'BLOQUEADO'
  }
  console.log(JSON.stringify(report, null, 2))
  if (report.result !== 'PASS') process.exitCode = 1
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
