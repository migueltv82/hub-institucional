import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ExcelJS from 'exceljs'
import { BASELINE } from './validateGoTrueLocalHarness.mjs'
import { disposableDatabase } from './validateLocalDbAuthRecovery.mjs'
import { main as buildCatalogSql, normalizeIdentity, NORMALIZE } from './buildAcademicCatalogSql.mjs'

// CAT.1: el SQL generado por buildAcademicCatalogSql.mjs, corrido sobre una base con el baseline de
// release/v1, hace que el portal alumno (get_student_portal_workspace_snapshot) liste sus materias con la
// misma carrera y codigo que usa el snapshot, y vincula cada alumno con el plan correcto.
// Casos: institucion inexistente (aborta sin escribir), dos corridas (idempotente), renombre de carrera
// (aborta sin escribir), plan conviviente (sin --alumnos no adivina), paridad de normalizacion SQL/JS.
// Uso: node scripts/validateAcademicCatalogLocal.mjs

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda'
const INSTITUTION = 'c1000000-0000-4000-8000-000000000001'
const STUDENT_OLD_PLAN = 'c1000000-0000-4000-8000-000000000002'
const STUDENT_NO_ROW = 'c1000000-0000-4000-8000-000000000003'
const INSTITUTION_NAME = "Instituto O'Higgins Prueba"
// Mayusculas, tilde y espacios a proposito: el portal tiene que devolver el mismo texto que el snapshot.
const CAREER_NAME = 'Profesorado de Inglés'
const PARITY_SAMPLES = ['Profesorado de Inglés', 'PROFESORADO DE INGLÉS', 'Francés Ç', 'São Paulo Ñandú', 'Técnico en Química Ü', "d'Arte 2°"]

export async function buildFixtureWorkbooks(dir, careerName = CAREER_NAME) {
  const academic = new ExcelJS.Workbook()
  const sheet = (workbook, name, rows) => { const worksheet = workbook.addWorksheet(name); rows.forEach((row) => worksheet.addRow(row)) }
  sheet(academic, 'carreras_planes', [
    ['carrera_id', 'carrera_nombre', 'duracion_anios', 'plan_id', 'plan_nombre', 'anio_plan', 'estado_plan', 'vigente_desde'],
    ['ING', careerName, 4, 'ING-2020', 'Plan 2020', 2020, 'CONVIVIENTE', new Date(Date.UTC(2020, 2, 1))],
    ['ING', careerName, 4, 'ING-2024', 'Plan 2024', 2024, 'VIGENTE', '2024-03-01'],
  ])
  sheet(academic, 'plan_estudios', [
    ['plan_id', 'carrera_id', 'materia_id', 'materia_codigo', 'materia_nombre', 'anio_cursada', 'regimen', 'requiere_mesa', 'orden_impresion', 'vigente_desde'],
    ['ING-2024', 'ING', 'm-ing01', 'ING01', 'Lengua Inglesa I', 1, 'ANUAL', 'SI', 1, new Date(Date.UTC(2024, 2, 1))],
    ['ING-2024', 'ING', 'm-ing02', 'ING02', 'Lengua Inglesa II', 2, 'ANUAL', 'SI', 2, ''],
    ['ING-2020', 'ING', 'm-old01', 'OLD01', "Taller d'Arte", 1, 'CUATRIMESTRAL', 'NO', 1, ''],
  ])
  sheet(academic, 'correlatividades', [
    ['plan_id', 'materia_id', 'materia_codigo', 'correlativa_id', 'correlativa_codigo', 'tipo_correlativa', 'requisito'],
    ['ING-2024', 'm-ing02', 'ING02', 'm-ing01', 'ING01', 'FINAL', 'Aprobada'],
    ['ING-2024', 'm-ing01', 'ING01', '', '', '', ''],
  ])
  const students = new ExcelJS.Workbook()
  sheet(students, 'alumnos_inscripciones', [
    ['alumno_id', 'apellido', 'nombre', 'dni', 'email', 'carrera_id', 'plan_id', 'materia_id'],
    ['a-1', 'Perez', 'Ana', '30.111.222', 'ana@fixture.invalid', 'ING', 'ING-2020', 'm-old01'],
  ])
  await academic.xlsx.writeFile(join(dir, 'academica.xlsx'))
  await students.xlsx.writeFile(join(dir, 'alumnos.xlsx'))
}

export async function main() {
  const run = randomBytes(8).toString('hex')
  const database = disposableDatabase(`gotrue_harness_${run}`)
  const workdir = mkdtempSync(join(tmpdir(), 'cat1-'))
  const report = { task: 'CAT.1', run, staging: 'NONE', production: 'NONE' }
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
  const asStudent = (user, query) => sql(`begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${user}', true);
${query}
rollback;`).split('\n').filter(Boolean).pop()
  const counts = () => JSON.parse(sql(`select json_build_object(
    'careers', (select count(*) from public.careers), 'plans', (select count(*) from public.study_plans),
    'subjects', (select count(*) from public.subjects), 'plan_subjects', (select count(*) from public.study_plan_subjects),
    'prerequisites', (select count(*) from public.subject_prerequisites), 'student_plans', (select count(*) from public.student_career_plans),
    'student_records', (select count(*) from public.student_records), 'teacher_records', (select count(*) from public.teacher_records));`))
  const generate = async (args) => {
    const log = console.log
    console.log = () => {}
    try { return await buildCatalogSql(args) } finally { console.log = log }
  }
  const expectAbort = (text, pattern) => {
    try { sql(text) } catch (error) { return pattern.test(error.stderr ?? error.message) }
    return false
  }
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

    step = 'normalization parity'
    report.normalizationParity = PARITY_SAMPLES.map((sample) => {
      const literal = `'${sample.replaceAll("'", "''")}'`
      return { sample, js: normalizeIdentity(sample), sql: sql(`select ${NORMALIZE(literal)};`) }
    })

    step = 'fixture'
    const student = (user, email, dni) => `insert into auth.users (id, email) values ('${user}', '${email}');
insert into public.profiles (user_id, email, account_role, is_blocked) values ('${user}', '${email}', 'alumno', false)
  on conflict (user_id) do update set account_role = 'alumno', is_blocked = false;
insert into public.memberships (institution_id, user_id, role) values ('${INSTITUTION}', '${user}', 'viewer');
insert into public.student_records (institution_id, workspace_key, first_name, last_name, dni, email, career, academic_year, profile_id)
values ('${INSTITUTION}', 'main', 'Alumno', '${dni}', '${dni}', '${email}', '${CAREER_NAME.toUpperCase()}', '1', '${user}');`
    sql(`insert into public.institutions (id, slug, name, status) values ('${INSTITUTION}', 'cat1-${run}', '${INSTITUTION_NAME.replaceAll("'", "''")}', 'active');
${student(STUDENT_OLD_PLAN, 'ana@fixture.invalid', '30111222')}
${student(STUDENT_NO_ROW, 'beto@fixture.invalid', '40222333')}`)
    report.before = counts()
    const portal = (user) => JSON.parse(asStudent(user, `select json_build_object(
      'materias', (select coalesce(json_agg(item->>'materia' order by item->>'materia'), '[]'::json) from jsonb_array_elements(payload->'planesEstudio') item),
      'carreras', (select coalesce(json_agg(distinct item->>'carrera'), '[]'::json) from jsonb_array_elements(payload->'planesEstudio') item),
      'correlatividades', jsonb_array_length(coalesce(payload->'correlatividades', '[]'::jsonb)))
      from public.get_student_portal_workspace_snapshot('${INSTITUTION}', 'main');`))
    report.portalBefore = portal(STUDENT_OLD_PLAN)

    step = 'generate sql'
    await buildFixtureWorkbooks(workdir)
    const sqlPath = join(workdir, 'catalogo.sql')
    report.generator = await generate(['--academica', join(workdir, 'academica.xlsx'), '--alumnos', join(workdir, 'alumnos.xlsx'), '--institucion', INSTITUTION_NAME, '--con-correlativas', '--salida', sqlPath])
    assert.deepEqual(report.generator.errores, [])
    const catalogSql = readFileSync(sqlPath, 'utf8')

    step = 'wrong institution'
    report.wrongInstitutionRejected = expectAbort(catalogSql.replaceAll(`'${INSTITUTION_NAME.replaceAll("'", "''")}'`, "'Instituto Inexistente'"), /CAT\.1: no hay exactamente una institucion activa/)
    report.afterWrongInstitution = counts()

    step = 'apply twice'
    report.summaryFirst = sql(catalogSql).split('\n').filter(Boolean).pop()
    report.afterFirst = counts()
    sql(catalogSql)
    report.afterSecond = counts()

    step = 'rename guard'
    await buildFixtureWorkbooks(workdir, 'Profesorado de Lengua Inglesa')
    const renamedPath = join(workdir, 'renombrado.sql')
    await generate(['--academica', join(workdir, 'academica.xlsx'), '--institucion', INSTITUTION_NAME, '--salida', renamedPath])
    report.renameRejected = expectAbort(readFileSync(renamedPath, 'utf8'), /CAT\.1: la carrera ING ya existe como/)
    report.afterRename = counts()

    step = 'portal after catalog'
    report.portalAfter = portal(STUDENT_OLD_PLAN)
    report.studentPlans = JSON.parse(sql(`select coalesce(json_object_agg(student.dni, plan.external_code), '{}'::json)
      from public.student_career_plans scp join public.study_plans plan on plan.id = scp.plan_id join public.student_records student on student.id = scp.student_id;`))
    report.planDates = JSON.parse(sql(`select json_build_object('plan_2020', (select valid_from from public.study_plans where external_code = 'ING-2020'),
      'ing01', (select sps.valid_from from public.study_plan_subjects sps join public.subjects s on s.id = sps.subject_id where s.code = 'ING01'),
      'prerequisite', (select applies_to || ':' || required_condition from public.subject_prerequisites limit 1));`))

    step = 'assertions'
    report.normalizationParity.forEach((item) => assert.equal(item.sql, item.js, `normalizacion SQL = JS para "${item.sample}"`))
    assert.equal(report.portalBefore.materias.length, 0, 'sin catalogo el portal no lista materias')
    assert.equal(report.wrongInstitutionRejected, true, 'una institucion inexistente tiene que abortar')
    assert.deepEqual(report.afterWrongInstitution, report.before, 'el aborto no escribe nada')
    assert.deepEqual(report.afterFirst, { careers: 1, plans: 2, subjects: 3, plan_subjects: 3, prerequisites: 1, student_plans: 1, student_records: 2, teacher_records: 0 })
    assert.equal(report.summaryFirst, '1|2|3|1|2|1', 'el resumen final (despues del commit) muestra los conteos')
    assert.deepEqual(report.afterSecond, report.afterFirst, 'correrlo dos veces no duplica')
    assert.equal(report.renameRejected, true, 'renombrar una carrera existente aborta')
    assert.deepEqual(report.afterRename, report.afterFirst, 'el aborto por renombre no escribe nada')
    // El portal filtra por carrera, no por plan: tambien lista materias de otros planes (comportamiento previo de 05, no de CAT.1).
    assert.deepEqual(report.portalAfter.materias, ['ING01', 'ING02', 'OLD01'])
    assert.deepEqual(report.portalAfter.carreras, [CAREER_NAME], 'la carrera sale con el mismo texto que la planilla (program_id canonico)')
    assert.equal(report.portalAfter.correlatividades, 1)
    assert.deepEqual(report.studentPlans, { 30111222: 'ING-2020' }, 'plan de la planilla de alumnos; sin fila y con dos planes activos no adivina')
    assert.deepEqual(report.planDates, { plan_2020: '2020-03-01', ing01: '2024-03-01', prerequisite: 'exam:approved' })
    report.result = 'PASS'
  } catch (error) {
    report.result = 'FAIL'
    report.error = `Failed at ${step}: ${error.message.split('\n')[0]}`
  } finally {
    const errors = []
    rmSync(workdir, { recursive: true, force: true })
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
