import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ExcelJS from 'exceljs'
import { parseTemplateV2MasterWorkbook } from '../src/utils/examEngine/templatesV2/importTemplateV2Workbook.js'
import { ACCENTED, PLAIN, buildCatalog, clean, dateText, normalizeIdentity, sheetRows } from '../src/utils/academicCatalog.js'

export { buildCatalog, dateText, normalizeIdentity, sheetRows }

// CAT.1: genera el SQL que carga el catalogo relacional (carreras, planes, materias y, a pedido,
// correlativas) desde la planilla academica, y vincula a cada alumno ya existente con su plan.
// El portal alumno lee las materias de ese catalogo; subir la planilla en la app no lo llena.
// El SQL corre en el SQL Editor en una sola transaccion: no borra nada ni crea legajos, y aborta
// si la corrida cambiaria el nombre de una carrera existente o moveria un plan de carrera.
// Uso: node scripts/buildAcademicCatalogSql.mjs --academica <planilla.xlsx> --institucion "<nombre exacto>"
//        [--alumnos <planilla-alumnos.xlsx>] [--con-correlativas] [--salida catalogo.sql]

// Literal SQL con standard_conforming_strings = on (el SQL lo fija al empezar).
export function sqlText(value) {
  const text = clean(value)
  return text ? `'${text.replaceAll("'", "''")}'` : 'null'
}

// Mismo criterio que normalizePortalIdentity de la Edge admin-users.
export const NORMALIZE = (expression) => `regexp_replace(translate(lower(coalesce(${expression}, '')), '${ACCENTED}', '${PLAIN}'), '[^a-z0-9]', '', 'g')`

function sqlInt(value, min, max) {
  const text = clean(value)
  if (!/^\d+$/.test(text)) return 'null'
  const number = Number(text)
  return number >= min && number <= max ? String(number) : 'null'
}

function sqlDate(text) {
  return text ? `'${text}'::date` : 'null'
}

function sqlBool(value) {
  return ['si', 'sí', 'true', '1', 'yes', 'x'].includes(clean(value).toLowerCase()) ? 'true' : 'false'
}

function values(rows) {
  return rows.map((row) => `  (${row.join(', ')})`).join(',\n')
}

export function validateInstitutionName(name) {
  const text = clean(name)
  if (!text) return 'Falta el nombre de la institucion.'
  if (text.length > 200 || /[\u0000-\u001f\u007f$\\]/.test(text)) return 'El nombre de la institucion tiene caracteres no permitidos.'
  return ''
}

function tempTable(name, columns, rows) {
  const header = `create temporary table ${name} (${columns}) on commit drop;`
  return rows.length ? `${header}\ninsert into ${name} values\n${values(rows)};` : header
}

export function buildCatalogSql(catalog, institutionName) {
  const nameError = validateInstitutionName(institutionName)
  if (nameError) throw new Error(nameError)
  const institution = sqlText(institutionName)
  const tables = [
    tempTable('cat1_careers', 'code text, name text, duration smallint',
      catalog.careers.map((career) => [sqlText(career.code), sqlText(career.name), sqlInt(career.duration, 1, 12)])),
    tempTable('cat1_plans', 'code text, career_code text, name text, plan_year smallint, resolution text, status text, valid_from date, valid_until date',
      catalog.plans.map((plan) => [sqlText(plan.code), sqlText(plan.careerCode), sqlText(plan.name), sqlInt(plan.year, 1900, 2200), sqlText(plan.resolution), sqlText(plan.status), sqlDate(plan.validFrom), sqlDate(plan.validUntil)])),
    tempTable('cat1_subjects', 'code text, name text, external_id text',
      catalog.subjects.map((subject) => [sqlText(subject.code), sqlText(subject.name), sqlText(subject.externalId)])),
    tempTable('cat1_plan_subjects', 'plan_code text, code text, year_number smallint, term_number smallint, regime text, training_field text, format text, exam_required boolean, exam_type text, exam_group text, related_codes text, print_order integer, valid_from date, valid_until date',
      catalog.planSubjects.map(({ planCode, code, row, validFrom, validUntil }) => [
        sqlText(planCode), sqlText(code), sqlInt(row.anio_cursada ?? row.anio, 1, 12), sqlInt(row.cuatrimestre, 1, 4), sqlText(row.regimen),
        sqlText(row.campo_formacion), sqlText(row.formato), sqlBool(row.requiere_mesa), sqlText(row.tipo_mesa), sqlText(row.grupo_afin_mesa),
        sqlText(row.codigos_materias_afines), sqlInt(row.orden_impresion, 0, 100000), sqlDate(validFrom), sqlDate(validUntil),
      ])),
    tempTable('cat1_prerequisites', 'plan_code text, target_code text, required_code text, applies_to text, condition text',
      catalog.prerequisites.map((item) => [sqlText(item.planCode), sqlText(item.target), sqlText(item.required), sqlText(item.appliesTo), sqlText(item.condition)])),
    tempTable('cat1_student_plans', 'dni text, plan_code text',
      catalog.studentPlans.map((item) => [sqlText(item.dni), sqlText(item.planCode)])),
  ]

  return `-- CAT.1: catalogo academico. Generado por scripts/buildAcademicCatalogSql.mjs.
-- Corre todo o nada y se puede volver a correr. No borra filas ni crea legajos de alumnos o docentes.
begin;
set local standard_conforming_strings = on;

create temporary table cat1_institucion on commit drop as
select id from public.institutions where name = ${institution} and status = 'active';

${tables.join('\n\n')}

do $cat1$
declare
  conflict record;
begin
  if (select count(*) from cat1_institucion) <> 1 then
    raise exception 'CAT.1: no hay exactamente una institucion activa con ese nombre. No se escribio nada.';
  end if;

  select v.code, existing.name as before_name, v.name as after_name into conflict
  from cat1_careers v
  join public.careers existing on existing.institution_id = (select id from cat1_institucion) and existing.external_code = v.code
  where existing.name <> v.name
  limit 1;
  if found then
    raise exception 'CAT.1: la carrera % ya existe como "%" y la planilla la llama "%". Renombrar rompe inscripciones y asignaciones. No se escribio nada.', conflict.code, conflict.before_name, conflict.after_name;
  end if;

  select v.code into conflict
  from cat1_plans v
  join public.study_plans existing on existing.institution_id = (select id from cat1_institucion) and existing.external_code = v.code
  join public.careers existing_career on existing_career.id = existing.career_id
  where existing_career.external_code <> v.career_code
  limit 1;
  if found then
    raise exception 'CAT.1: el plan % ya existe en otra carrera. No se escribio nada.', conflict.code;
  end if;

  select v.code, existing.external_code as other_code into conflict
  from cat1_careers v
  join public.careers existing on existing.institution_id = (select id from cat1_institucion)
    and existing.external_code <> v.code
    and ${NORMALIZE('existing.name')} = ${NORMALIZE('v.name')}
  limit 1;
  if found then
    raise exception 'CAT.1: la carrera % tiene el mismo nombre que la carrera % ya cargada. No se escribio nada.', conflict.code, conflict.other_code;
  end if;
end $cat1$;

insert into public.careers (institution_id, external_code, name, duration_years, status)
select i.id, v.code, v.name, v.duration, 'active'
from cat1_institucion i cross join cat1_careers v
on conflict (institution_id, external_code) do update
set duration_years = coalesce(excluded.duration_years, public.careers.duration_years), status = 'active';

insert into public.study_plans (institution_id, career_id, external_code, name, plan_year, resolution, status, valid_from, valid_until)
select i.id, career.id, v.code, v.name, v.plan_year, v.resolution, v.status, v.valid_from, v.valid_until
from cat1_institucion i cross join cat1_plans v
join public.careers career on career.institution_id = i.id and career.external_code = v.career_code
on conflict (institution_id, external_code) do update
set name = excluded.name, plan_year = excluded.plan_year, resolution = excluded.resolution, status = excluded.status,
    valid_from = coalesce(excluded.valid_from, public.study_plans.valid_from),
    valid_until = coalesce(excluded.valid_until, public.study_plans.valid_until);

insert into public.subjects (institution_id, code, name, external_id)
select i.id, v.code, v.name, v.external_id
from cat1_institucion i cross join cat1_subjects v
on conflict (institution_id, code) do update
set name = excluded.name, external_id = coalesce(excluded.external_id, public.subjects.external_id);

insert into public.study_plan_subjects (institution_id, plan_id, subject_id, year_number, term_number, regime, training_field, format,
  exam_required, exam_type, exam_group, related_subject_codes, print_order, valid_from, valid_until)
select i.id, plan.id, subject.id, v.year_number, v.term_number, v.regime, v.training_field, v.format,
  v.exam_required, v.exam_type, v.exam_group, v.related_codes, v.print_order, v.valid_from, v.valid_until
from cat1_institucion i cross join cat1_plan_subjects v
join public.study_plans plan on plan.institution_id = i.id and plan.external_code = v.plan_code
join public.subjects subject on subject.institution_id = i.id and subject.code = v.code
on conflict (institution_id, plan_id, subject_id) do update
set year_number = excluded.year_number, term_number = excluded.term_number, regime = excluded.regime,
    training_field = excluded.training_field, format = excluded.format, exam_required = excluded.exam_required,
    exam_type = excluded.exam_type, exam_group = excluded.exam_group, related_subject_codes = excluded.related_subject_codes,
    print_order = excluded.print_order,
    valid_from = coalesce(excluded.valid_from, public.study_plan_subjects.valid_from),
    valid_until = coalesce(excluded.valid_until, public.study_plan_subjects.valid_until);

insert into public.subject_prerequisites (institution_id, target_plan_subject_id, prerequisite_plan_subject_id, prerequisite_type, required_condition, applies_to, status)
select i.id, target.id, required.id, 'subject', v.condition, v.applies_to, 'active'
from cat1_institucion i cross join cat1_prerequisites v
join public.study_plans plan on plan.institution_id = i.id and plan.external_code = v.plan_code
join public.subjects target_subject on target_subject.institution_id = i.id and target_subject.code = v.target_code
join public.subjects required_subject on required_subject.institution_id = i.id and required_subject.code = v.required_code
join public.study_plan_subjects target on target.institution_id = i.id and target.plan_id = plan.id and target.subject_id = target_subject.id
join public.study_plan_subjects required on required.institution_id = i.id and required.plan_id = plan.id and required.subject_id = required_subject.id
on conflict (institution_id, target_plan_subject_id, prerequisite_plan_subject_id, prerequisite_type, applies_to) do update
set required_condition = excluded.required_condition, status = 'active';

-- Alumnos activos sin plan activo. 1) El plan que trae la planilla de alumnos, por DNI.
insert into public.student_career_plans (institution_id, student_id, career_id, plan_id, current_year, status)
select distinct on (student.id) i.id, student.id, plan.career_id, plan.id,
  case when btrim(coalesce(student.academic_year, '')) ~ '^[0-9]{1,2}$' then btrim(student.academic_year)::smallint end,
  'active'
from cat1_institucion i
join public.student_records student on student.institution_id = i.id and lower(btrim(student.status)) in ('active', 'activo', 'activa')
join cat1_student_plans v on v.dni = ${NORMALIZE("coalesce(nullif(btrim(student.dni), ''), student.national_id)")}
join public.study_plans plan on plan.institution_id = i.id and plan.external_code = v.plan_code
where not exists (
  select 1 from public.student_career_plans existing
  where existing.institution_id = i.id and existing.student_id = student.id and existing.status = 'active'
)
order by student.id, plan.plan_year desc nulls last
on conflict (institution_id, student_id, plan_id) do nothing;

-- 2) Si no vino en la planilla: solo cuando el legajo coincide con UNA carrera y esa carrera tiene UN plan activo.
insert into public.student_career_plans (institution_id, student_id, career_id, plan_id, current_year, status)
select i.id, student.id, match.career_id, match.plan_id,
  case when btrim(coalesce(student.academic_year, '')) ~ '^[0-9]{1,2}$' then btrim(student.academic_year)::smallint end,
  'active'
from cat1_institucion i
join public.student_records student on student.institution_id = i.id and lower(btrim(student.status)) in ('active', 'activo', 'activa')
join lateral (
  select min(career.id::text)::uuid as career_id, min(plan.id::text)::uuid as plan_id
  from public.careers career
  join public.study_plans plan on plan.institution_id = i.id and plan.career_id = career.id and plan.status = 'active'
  where career.institution_id = i.id and career.status = 'active'
    and ${NORMALIZE('student.career')} <> ''
    and ${NORMALIZE('student.career')} in (${NORMALIZE('career.name')}, ${NORMALIZE('career.external_code')})
  having count(distinct career.id) = 1 and count(distinct plan.id) = 1
) match on true
where not exists (
  select 1 from public.student_career_plans existing
  where existing.institution_id = i.id and existing.student_id = student.id and existing.status = 'active'
)
on conflict (institution_id, student_id, plan_id) do nothing;

commit;

-- Resultado (corre despues del commit, para que el SQL Editor lo muestre).
select
  (select count(*) from public.careers c where c.institution_id = inst.id) as carreras,
  (select count(*) from public.study_plans p where p.institution_id = inst.id) as planes,
  (select count(*) from public.study_plan_subjects s where s.institution_id = inst.id) as materias_en_planes,
  (select count(*) from public.subject_prerequisites s where s.institution_id = inst.id) as correlativas,
  (select count(*) from public.student_records s where s.institution_id = inst.id and lower(btrim(s.status)) in ('active', 'activo', 'activa')) as alumnos_activos,
  (select count(distinct sp.student_id) from public.student_career_plans sp where sp.institution_id = inst.id and sp.status = 'active') as alumnos_con_plan
from public.institutions inst
where inst.name = ${institution} and inst.status = 'active';
`
}

export function parseArgs(argv) {
  const options = { conCorrelativas: false }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--con-correlativas') { options.conCorrelativas = true; continue }
    const value = argv[index + 1]
    if (flag === '--academica') options.academica = value
    else if (flag === '--institucion') options.institucion = value
    else if (flag === '--alumnos') options.alumnos = value
    else if (flag === '--salida') options.salida = value
    else throw new Error(`Argumento desconocido: ${flag}`)
    index += 1
  }
  if (!clean(options.academica)) throw new Error('Falta --academica <planilla.xlsx>.')
  if (!clean(options.institucion)) throw new Error('Falta --institucion "<nombre exacto de la institucion>".')
  const nameError = validateInstitutionName(options.institucion)
  if (nameError) throw new Error(nameError)
  options.salida = clean(options.salida) || 'catalogo-academico.sql'
  return options
}

async function loadWorkbook(path) {
  const buffer = readFileSync(resolve(path))
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return { buffer, workbook }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const academic = await loadWorkbook(options.academica)
  const parsed = await parseTemplateV2MasterWorkbook({ name: basename(options.academica), arrayBuffer: async () => academic.buffer })
  const students = options.alumnos ? await loadWorkbook(options.alumnos) : null
  const catalog = buildCatalog({
    careersAndPlans: sheetRows(academic.workbook.getWorksheet('carreras_planes')),
    planesEstudio: parsed.datasets.planesEstudio,
    correlatividades: sheetRows(academic.workbook.getWorksheet('correlatividades')),
    studentPlans: students ? sheetRows(students.workbook.getWorksheet('alumnos_inscripciones')) : [],
    withPrerequisites: options.conCorrelativas,
  })
  const report = {
    institucion: options.institucion,
    carreras: catalog.careers.length,
    planes: catalog.plans.length,
    materias: catalog.subjects.length,
    materiasEnPlanes: catalog.planSubjects.length,
    correlativas: options.conCorrelativas ? catalog.prerequisites.length : 'no se cargan (usar --con-correlativas)',
    alumnosConPlanEnPlanilla: options.alumnos ? catalog.studentPlans.length : 'sin --alumnos: plan por carrera, solo si tiene un unico plan activo',
    advertencias: catalog.warnings,
    errores: catalog.errors,
  }
  if (catalog.errors.length) {
    console.log(JSON.stringify({ ...report, resultado: 'NO SE GENERO EL SQL: corregir la planilla' }, null, 2))
    process.exitCode = 1
    return report
  }
  writeFileSync(resolve(options.salida), buildCatalogSql(catalog, options.institucion), 'utf8')
  console.log(JSON.stringify({ ...report, resultado: `SQL generado en ${options.salida}` }, null, 2))
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await main() } catch (error) { console.error(`ERROR: ${error.message}`); process.exitCode = 1 }
}
