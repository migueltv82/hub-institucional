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
import { main as buildCatalogSql } from './buildAcademicCatalogSql.mjs'

// CAT.1: el SQL generado por buildAcademicCatalogSql.mjs, corrido sobre una base con el baseline de
// release/v1, hace que el portal alumno (get_student_portal_workspace_snapshot) liste sus materias con la
// misma carrera y codigo que usa el snapshot. Se corre dos veces (idempotente) y con una institucion
// inexistente (aborta sin escribir).
// Uso: node scripts/validateAcademicCatalogLocal.mjs

const SOURCE = 'supabase_db_codex-baseline-local-7725bdda'
const INSTITUTION = 'c1000000-0000-4000-8000-000000000001'
const STUDENT_USER = 'c1000000-0000-4000-8000-000000000002'
const INSTITUTION_NAME = "Instituto O'Higgins Prueba"
// Mayusculas, tilde y espacios a proposito: el portal tiene que devolver el mismo texto que el snapshot.
const CAREER_NAME = 'Profesorado de Inglés'

export async function buildFixtureWorkbook(path) {
  const workbook = new ExcelJS.Workbook()
  const add = (name, rows) => rows.forEach((row) => workbook.getWorksheet(name).addRow(row))
  workbook.addWorksheet('carreras_planes')
  workbook.addWorksheet('plan_estudios')
  workbook.addWorksheet('correlatividades')
  add('carreras_planes', [
    ['carrera_id', 'carrera_nombre', 'duracion_anios', 'plan_id', 'plan_nombre', 'anio_plan', 'estado_plan', 'vigente_desde'],
    ['ING', CAREER_NAME, 4, 'ING-2020', 'Plan 2020', 2020, 'CERRADO', '2020-01-01'],
    ['ING', CAREER_NAME, 4, 'ING-2024', 'Plan 2024', 2024, 'VIGENTE', '2024-01-01'],
  ])
  add('plan_estudios', [
    ['plan_id', 'carrera_id', 'materia_id', 'materia_codigo', 'materia_nombre', 'anio_cursada', 'cuatrimestre', 'regimen', 'requiere_mesa', 'orden_impresion'],
    ['ING-2024', 'ING', 'm-ing01', 'ING01', 'Lengua Inglesa I', 1, '', 'ANUAL', 'SI', 1],
    ['ING-2024', 'ING', 'm-ing02', 'ING02', 'Lengua Inglesa II', 2, '', 'ANUAL', 'SI', 2],
    ['ING-2020', 'ING', 'm-old01', 'OLD01', 'Materia del plan viejo', 1, 1, 'CUATRIMESTRAL', 'NO', 1],
  ])
  add('correlatividades', [
    ['plan_id', 'materia_id', 'materia_codigo', 'correlativa_id', 'correlativa_codigo', 'requisito'],
    ['ING-2024', 'm-ing02', 'ING02', 'm-ing01', 'ING01', 'Aprobada'],
    ['ING-2024', 'm-ing01', 'ING01', '', '', ''],
  ])
  await workbook.xlsx.writeFile(path)
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
      const stderr = String(error.stderr ?? '')
      const failure = new Error(`Local operation failed at ${step}: ${stderr.match(/ERROR:[^\n]*/)?.[0] ?? 'sin detalle'}`)
      failure.stderr = stderr
      throw failure
    }
  }
  const sql = (query, db = database) => docker(['exec', '-i', SOURCE, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query).trim()
  const asStudent = (query) => sql(`begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${STUDENT_USER}', true);
${query}
rollback;`).split('\n').filter(Boolean).pop()
  const counts = () => JSON.parse(sql(`select json_build_object(
    'careers', (select count(*) from public.careers), 'plans', (select count(*) from public.study_plans),
    'subjects', (select count(*) from public.subjects), 'plan_subjects', (select count(*) from public.study_plan_subjects),
    'prerequisites', (select count(*) from public.subject_prerequisites), 'student_plans', (select count(*) from public.student_career_plans),
    'student_records', (select count(*) from public.student_records), 'teacher_records', (select count(*) from public.teacher_records));`))
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
    sql(`insert into public.institutions (id, slug, name, status) values ('${INSTITUTION}', 'cat1-${run}', '${INSTITUTION_NAME.replaceAll("'", "''")}', 'active');
insert into auth.users (id, email) values ('${STUDENT_USER}', 'alumno-cat1@fixture.invalid');
insert into public.profiles (user_id, email, account_role, is_blocked) values ('${STUDENT_USER}', 'alumno-cat1@fixture.invalid', 'alumno', false)
  on conflict (user_id) do update set account_role = 'alumno', is_blocked = false;
insert into public.memberships (institution_id, user_id, role) values ('${INSTITUTION}', '${STUDENT_USER}', 'viewer');
insert into public.student_records (institution_id, workspace_key, first_name, last_name, dni, email, career, academic_year, profile_id)
values ('${INSTITUTION}', 'main', 'Ana', 'Perez', '30111222', 'alumno-cat1@fixture.invalid', '${CAREER_NAME.toUpperCase()}', '1', '${STUDENT_USER}');`)
    report.before = counts()
    step = 'portal before catalog'
    report.portalBefore = Number(asStudent(`select jsonb_array_length(payload->'planesEstudio') from public.get_student_portal_workspace_snapshot('${INSTITUTION}', 'main');`))

    step = 'generate sql'
    const workbookPath = join(workdir, 'academica.xlsx')
    const sqlPath = join(workdir, 'catalogo.sql')
    await buildFixtureWorkbook(workbookPath)
    const log = console.log
    console.log = () => {}
    try { report.generator = await buildCatalogSql(['--academica', workbookPath, '--institucion', INSTITUTION_NAME, '--salida', sqlPath]) }
    finally { console.log = log }
    assert.deepEqual(report.generator.errores, [])
    const catalogSql = readFileSync(sqlPath, 'utf8')

    step = 'wrong institution'
    let rejected = false
    try { sql(catalogSql.replaceAll(`'${INSTITUTION_NAME.replaceAll("'", "''")}'`, "'Instituto Inexistente'")) }
    catch (error) { rejected = /CAT\.1: no hay exactamente una institucion activa/.test(error.stderr ?? error.message) }
    report.wrongInstitutionRejected = rejected
    report.afterWrongInstitution = counts()

    step = 'apply twice'
    sql(catalogSql)
    report.afterFirst = counts()
    sql(catalogSql)
    report.afterSecond = counts()

    step = 'portal after catalog'
    report.portalAfter = JSON.parse(asStudent(`select json_build_object(
      'materias', (select json_agg(json_build_object('materia', item->>'materia', 'carrera', item->>'carrera', 'anio', item->>'anio') order by item->>'materia') from jsonb_array_elements(payload->'planesEstudio') item),
      'correlatividades', jsonb_array_length(coalesce(payload->'correlatividades', '[]'::jsonb)))
      from public.get_student_portal_workspace_snapshot('${INSTITUTION}', 'main');`))
    report.studentPlan = JSON.parse(sql(`select json_build_object('plan', plan.external_code, 'current_year', scp.current_year)
      from public.student_career_plans scp join public.study_plans plan on plan.id = scp.plan_id;`))

    step = 'assertions'
    assert.equal(report.portalBefore, 0, 'sin catalogo el portal no lista materias')
    assert.equal(report.wrongInstitutionRejected, true, 'una institucion inexistente tiene que abortar')
    assert.deepEqual(report.afterWrongInstitution, report.before, 'el aborto no escribe nada')
    assert.deepEqual(report.afterFirst, { careers: 1, plans: 2, subjects: 3, plan_subjects: 3, prerequisites: 1, student_plans: 1, student_records: 1, teacher_records: 0 })
    assert.deepEqual(report.afterSecond, report.afterFirst, 'correrlo dos veces no duplica')
    // El portal filtra por carrera, no por plan: tambien lista materias de planes cerrados (comportamiento previo de 05, no de CAT.1).
    assert.deepEqual(report.portalAfter.materias.map((item) => item.materia), ['ING01', 'ING02', 'OLD01'], 'el alumno ve las materias de su carrera')
    assert.ok(report.portalAfter.materias.every((item) => item.carrera === CAREER_NAME), 'la carrera sale con el mismo texto que la planilla (program_id canonico)')
    assert.deepEqual(report.studentPlan, { plan: 'ING-2024', current_year: 1 })
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
