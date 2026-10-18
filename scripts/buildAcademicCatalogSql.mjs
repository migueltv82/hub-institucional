import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ExcelJS from 'exceljs'
import { parseTemplateV2MasterWorkbook } from '../src/utils/examEngine/templatesV2/importTemplateV2Workbook.js'

// CAT.1: genera el SQL que carga el catalogo relacional (carreras, planes, materias, correlativas)
// desde la planilla academica, y vincula a cada alumno ya existente con su carrera y plan.
// El portal alumno lee las materias de ese catalogo; subir la planilla en la app no lo llena.
// El SQL corre en el SQL Editor en una sola transaccion: no borra nada ni crea legajos.
// Uso: node scripts/buildAcademicCatalogSql.mjs --academica <planilla.xlsx> --institucion "<nombre exacto>" [--salida catalogo.sql]

const PLAN_STATUS = { vigente: 'active', conviviente: 'active', activo: 'active', activa: 'active', cerrado: 'closed', cerrada: 'closed', borrador: 'draft' }
const REQUIRED_CONDITION = { regular: 'regular', aprobada: 'approved', aprobado: 'approved', approved: 'approved', cursada: 'enrolled', cursando: 'enrolled' }
const DATE = /^\d{4}-\d{2}-\d{2}$/

function clean(value) {
  return String(value ?? '').trim()
}

function cellText(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (value && typeof value === 'object') {
    if ('result' in value) return cellText(value.result)
    if ('text' in value) return clean(value.text)
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
    return ''
  }
  return clean(value)
}

export function sheetRows(worksheet) {
  if (!worksheet) return []
  const headers = worksheet.getRow(1).values.map(cellText)
  const rows = []
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const record = { _fila: rowNumber }
    headers.forEach((header, column) => { if (header) record[header] = cellText(row.getCell(column).value) })
    if (Object.entries(record).some(([key, value]) => key !== '_fila' && value)) rows.push(record)
  }
  return rows
}

export function sqlText(value) {
  const text = clean(value)
  return text ? `'${text.replaceAll("'", "''")}'` : 'null'
}

function normalizeIdentity(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function sqlInt(value, min, max) {
  const text = clean(value)
  if (!/^\d+$/.test(text)) return 'null'
  const number = Number(text)
  return number >= min && number <= max ? String(number) : 'null'
}

function sqlDate(value) {
  const text = clean(value)
  return DATE.test(text) ? `'${text}'::date` : 'null'
}

function sqlBool(value) {
  return ['si', 'sí', 'true', '1', 'yes', 'x'].includes(clean(value).toLowerCase()) ? 'true' : 'false'
}

function values(rows) {
  return rows.map((row) => `  (${row.join(', ')})`).join(',\n')
}

// Arma el catalogo a partir de las filas crudas de carreras_planes y correlatividades, y de los
// planesEstudio que devuelve el mismo lector de planillas que usa la app: asi carrera y materia
// quedan escritas igual que en el snapshot (program_id/subject_id canonicos).
export function buildCatalog({ careersAndPlans = [], planesEstudio = [], correlatividades = [] }) {
  const errors = []
  const warnings = []
  const careers = new Map()
  const plans = new Map()

  careersAndPlans.forEach((row) => {
    const careerCode = clean(row.carrera_id)
    const careerName = clean(row.carrera_nombre)
    const planCode = clean(row.plan_id)
    if (!careerCode || !careerName) {
      errors.push(`carreras_planes fila ${row._fila}: falta carrera_id o carrera_nombre.`)
      return
    }
    const previousName = careers.get(careerCode)?.name
    if (previousName && previousName !== careerName) {
      errors.push(`carreras_planes fila ${row._fila}: la carrera ${careerCode} tiene dos nombres ("${previousName}" y "${careerName}").`)
    }
    if (!careers.has(careerCode)) careers.set(careerCode, { code: careerCode, name: careerName, duration: row.duracion_anios })
    if (!planCode) {
      errors.push(`carreras_planes fila ${row._fila}: falta plan_id.`)
      return
    }
    if (plans.has(planCode) && plans.get(planCode).careerCode !== careerCode) {
      errors.push(`carreras_planes fila ${row._fila}: el plan ${planCode} aparece en dos carreras.`)
    }
    const status = PLAN_STATUS[clean(row.estado_plan).toLowerCase()] ?? 'active'
    plans.set(planCode, {
      code: planCode,
      careerCode,
      name: clean(row.plan_nombre) || (clean(row.anio_plan) ? `Plan ${clean(row.anio_plan)}` : planCode),
      year: row.anio_plan,
      resolution: row.resolucion,
      status,
      validFrom: row.vigente_desde,
      validUntil: row.vigente_hasta,
    })
  })

  const careerNames = new Map()
  careers.forEach((career) => {
    // Mismo criterio que el SQL que vincula alumnos: dos nombres que normalizan igual serian ambiguos.
    const key = normalizeIdentity(career.name)
    if (careerNames.has(key) && careerNames.get(key) !== career.code) {
      errors.push(`carreras_planes: dos carreras con el mismo nombre "${career.name}" (${careerNames.get(key)} y ${career.code}).`)
    }
    careerNames.set(key, career.code)
  })

  const subjects = new Map()
  const planSubjects = new Map()
  planesEstudio.forEach((row) => {
    const planCode = clean(row.plan_id)
    const code = clean(row.materia)
    const plan = plans.get(planCode)
    if (!plan) {
      errors.push(`plan_estudios: la materia ${code} usa el plan "${planCode}", que no esta en carreras_planes.`)
      return
    }
    if (clean(row.carrera) !== careers.get(plan.careerCode)?.name) {
      errors.push(`plan_estudios: la materia ${code} del plan ${planCode} no coincide con la carrera del plan.`)
    }
    const name = clean(row.nombreMateria || row.nombre)
    if (subjects.has(code) && subjects.get(code).name !== name) {
      warnings.push(`La materia ${code} tiene nombres distintos en dos planes; queda "${subjects.get(code).name}".`)
    } else {
      subjects.set(code, { code, name, externalId: clean(row.materia_id) })
    }
    const key = `${planCode}|${code}`
    if (planSubjects.has(key)) errors.push(`plan_estudios: la materia ${code} esta dos veces en el plan ${planCode}.`)
    planSubjects.set(key, { planCode, code, row })
  })

  const subjectIdToCode = new Map(planesEstudio.map((row) => [clean(row.materia_id), clean(row.materia)]))
  const prerequisites = new Map()
  correlatividades.forEach((row) => {
    const target = subjectIdToCode.get(clean(row.materia_id)) || clean(row.materia_codigo)
    const required = subjectIdToCode.get(clean(row.correlativa_id)) || clean(row.correlativa_codigo)
    if (!required) return
    const planCode = clean(row.plan_id) || planesEstudio.find((plan) => clean(plan.materia) === target)?.plan_id
    const label = `correlatividades fila ${row._fila}`
    if (!planSubjects.has(`${clean(planCode)}|${target}`)) errors.push(`${label}: la materia ${target} no esta en el plan ${planCode}.`)
    else if (!planSubjects.has(`${clean(planCode)}|${required}`)) errors.push(`${label}: la correlativa ${required} no esta en el plan ${planCode}.`)
    else if (target === required) errors.push(`${label}: la materia ${target} no puede ser correlativa de si misma.`)
    else prerequisites.set(`${planCode}|${target}|${required}`, { planCode: clean(planCode), target, required, condition: REQUIRED_CONDITION[clean(row.requisito).toLowerCase()] ?? 'regular' })
  })

  if (!careers.size) errors.push('La planilla no tiene carreras en carreras_planes.')
  if (!planSubjects.size) errors.push('La planilla no tiene materias validas en plan_estudios.')

  return {
    errors,
    warnings,
    careers: [...careers.values()],
    plans: [...plans.values()],
    subjects: [...subjects.values()],
    planSubjects: [...planSubjects.values()],
    prerequisites: [...prerequisites.values()],
  }
}

// Mismo criterio que normalizePortalIdentity de la Edge admin-users: minusculas, sin tildes, solo [a-z0-9].
const NORMALIZE = (expression) => `regexp_replace(translate(lower(coalesce(${expression}, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z0-9]', '', 'g')`

export function buildCatalogSql(catalog, institutionName) {
  const institution = sqlText(institutionName)
  const careerValues = catalog.careers.map((career) => [sqlText(career.code), sqlText(career.name), sqlInt(career.duration, 1, 12)])
  const planValues = catalog.plans.map((plan) => [sqlText(plan.code), sqlText(plan.careerCode), sqlText(plan.name), sqlInt(plan.year, 1900, 2200), sqlText(plan.resolution), sqlText(plan.status), sqlDate(plan.validFrom), sqlDate(plan.validUntil)])
  const subjectValues = catalog.subjects.map((subject) => [sqlText(subject.code), sqlText(subject.name), sqlText(subject.externalId)])
  const planSubjectValues = catalog.planSubjects.map(({ planCode, code, row }) => [
    sqlText(planCode), sqlText(code), sqlInt(row.anio_cursada ?? row.anio, 1, 12), sqlInt(row.cuatrimestre, 1, 4), sqlText(row.regimen),
    sqlText(row.campo_formacion), sqlText(row.formato), sqlBool(row.requiere_mesa), sqlText(row.tipo_mesa), sqlText(row.grupo_afin_mesa),
    sqlText(row.codigos_materias_afines), sqlInt(row.orden_impresion, 0, 100000), sqlDate(row.vigente_desde), sqlDate(row.vigente_hasta),
  ])
  const prerequisiteValues = catalog.prerequisites.map((item) => [sqlText(item.planCode), sqlText(item.target), sqlText(item.required), sqlText(item.condition)])

  return `-- CAT.1: catalogo academico para ${clean(institutionName).replaceAll('\n', ' ')}
-- Generado por scripts/buildAcademicCatalogSql.mjs. Corre todo o nada; se puede volver a correr.
-- No borra filas ni crea legajos de alumnos o docentes.
begin;

create temporary table cat1_institucion on commit drop as
select id from public.institutions where name = ${institution} and status = 'active';

do $$
begin
  if (select count(*) from cat1_institucion) <> 1 then
    raise exception 'CAT.1: no hay exactamente una institucion activa llamada %', ${institution};
  end if;
end $$;

insert into public.careers (institution_id, external_code, name, duration_years, status)
select i.id, v.code, v.name, v.duration::smallint, 'active'
from cat1_institucion i cross join (values
${values(careerValues)}
) as v(code, name, duration)
on conflict (institution_id, external_code) do update
set name = excluded.name, duration_years = excluded.duration_years, status = 'active';

insert into public.study_plans (institution_id, career_id, external_code, name, plan_year, resolution, status, valid_from, valid_until)
select i.id, career.id, v.code, v.name, v.plan_year::smallint, v.resolution, v.status, v.valid_from::date, v.valid_until::date
from cat1_institucion i cross join (values
${values(planValues)}
) as v(code, career_code, name, plan_year, resolution, status, valid_from, valid_until)
join public.careers career on career.institution_id = i.id and career.external_code = v.career_code
on conflict (institution_id, external_code) do update
set career_id = excluded.career_id, name = excluded.name, plan_year = excluded.plan_year, resolution = excluded.resolution,
    status = excluded.status, valid_from = excluded.valid_from, valid_until = excluded.valid_until;

insert into public.subjects (institution_id, code, name, external_id)
select i.id, v.code, v.name, v.external_id
from cat1_institucion i cross join (values
${values(subjectValues)}
) as v(code, name, external_id)
on conflict (institution_id, code) do update
set name = excluded.name, external_id = coalesce(excluded.external_id, public.subjects.external_id);

insert into public.study_plan_subjects (institution_id, plan_id, subject_id, year_number, term_number, regime, training_field, format,
  exam_required, exam_type, exam_group, related_subject_codes, print_order, valid_from, valid_until)
select i.id, plan.id, subject.id, v.year_number::smallint, v.term_number::smallint, v.regime, v.training_field, v.format,
  v.exam_required::boolean, v.exam_type, v.exam_group, v.related_codes, v.print_order::integer, v.valid_from::date, v.valid_until::date
from cat1_institucion i cross join (values
${values(planSubjectValues)}
) as v(plan_code, code, year_number, term_number, regime, training_field, format, exam_required, exam_type, exam_group, related_codes, print_order, valid_from, valid_until)
join public.study_plans plan on plan.institution_id = i.id and plan.external_code = v.plan_code
join public.subjects subject on subject.institution_id = i.id and subject.code = v.code
on conflict (institution_id, plan_id, subject_id) do update
set year_number = excluded.year_number, term_number = excluded.term_number, regime = excluded.regime,
    training_field = excluded.training_field, format = excluded.format, exam_required = excluded.exam_required,
    exam_type = excluded.exam_type, exam_group = excluded.exam_group, related_subject_codes = excluded.related_subject_codes,
    print_order = excluded.print_order, valid_from = excluded.valid_from, valid_until = excluded.valid_until;
${prerequisiteValues.length ? `
insert into public.subject_prerequisites (institution_id, target_plan_subject_id, prerequisite_plan_subject_id, prerequisite_type, required_condition, applies_to, status)
select i.id, target.id, required.id, 'subject', v.condition, 'enrollment_and_exam', 'active'
from cat1_institucion i cross join (values
${values(prerequisiteValues)}
) as v(plan_code, target_code, required_code, condition)
join public.study_plans plan on plan.institution_id = i.id and plan.external_code = v.plan_code
join public.subjects target_subject on target_subject.institution_id = i.id and target_subject.code = v.target_code
join public.subjects required_subject on required_subject.institution_id = i.id and required_subject.code = v.required_code
join public.study_plan_subjects target on target.institution_id = i.id and target.plan_id = plan.id and target.subject_id = target_subject.id
join public.study_plan_subjects required on required.institution_id = i.id and required.plan_id = plan.id and required.subject_id = required_subject.id
on conflict (institution_id, target_plan_subject_id, prerequisite_plan_subject_id, prerequisite_type, applies_to) do update
set required_condition = excluded.required_condition, status = 'active';
` : ''}
-- Alumnos que ya existen: carrera por nombre o codigo (mismo criterio que "Crear accesos"), plan activo mas reciente.
insert into public.student_career_plans (institution_id, student_id, career_id, plan_id, current_year, status)
select i.id, student.id, career.id, plan.id,
  case when btrim(coalesce(student.academic_year, '')) ~ '^[0-9]{1,2}$' then btrim(student.academic_year)::smallint end,
  'active'
from cat1_institucion i
join public.student_records student on student.institution_id = i.id
join public.careers career on career.institution_id = i.id and career.status = 'active'
  and ${NORMALIZE('student.career')} <> ''
  and ${NORMALIZE('student.career')} in (${NORMALIZE('career.name')}, ${NORMALIZE('career.external_code')})
join lateral (
  select candidate.id from public.study_plans candidate
  where candidate.institution_id = i.id and candidate.career_id = career.id and candidate.status = 'active'
  order by candidate.plan_year desc nulls last, candidate.created_at desc
  limit 1
) plan on true
where not exists (
  select 1 from public.student_career_plans existing
  where existing.institution_id = i.id and existing.student_id = student.id and existing.status = 'active'
)
on conflict (institution_id, student_id, plan_id) do nothing;

select
  (select count(*) from public.careers c join cat1_institucion i on c.institution_id = i.id) as carreras,
  (select count(*) from public.study_plans p join cat1_institucion i on p.institution_id = i.id) as planes,
  (select count(*) from public.study_plan_subjects s join cat1_institucion i on s.institution_id = i.id) as materias_en_planes,
  (select count(*) from public.subject_prerequisites s join cat1_institucion i on s.institution_id = i.id) as correlativas,
  (select count(*) from public.student_records s join cat1_institucion i on s.institution_id = i.id) as alumnos,
  (select count(distinct sp.student_id) from public.student_career_plans sp join cat1_institucion i on sp.institution_id = i.id where sp.status = 'active') as alumnos_con_plan;

commit;
`
}

export function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === '--academica') options.academica = value
    else if (flag === '--institucion') options.institucion = value
    else if (flag === '--salida') options.salida = value
    else throw new Error(`Argumento desconocido: ${flag}`)
    index += 1
  }
  if (!clean(options.academica)) throw new Error('Falta --academica <planilla.xlsx>.')
  if (!clean(options.institucion)) throw new Error('Falta --institucion "<nombre exacto de la institucion>".')
  options.salida = clean(options.salida) || 'catalogo-academico.sql'
  return options
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const buffer = readFileSync(resolve(options.academica))
  const file = { name: basename(options.academica), arrayBuffer: async () => buffer }
  const parsed = await parseTemplateV2MasterWorkbook(file)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const catalog = buildCatalog({
    careersAndPlans: sheetRows(workbook.getWorksheet('carreras_planes')),
    planesEstudio: parsed.datasets.planesEstudio,
    correlatividades: sheetRows(workbook.getWorksheet('correlatividades')),
  })
  const report = {
    institucion: options.institucion,
    carreras: catalog.careers.length,
    planes: catalog.plans.length,
    materias: catalog.subjects.length,
    materiasEnPlanes: catalog.planSubjects.length,
    correlativas: catalog.prerequisites.length,
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
