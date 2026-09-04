import fs from 'node:fs'
import path from 'node:path'
import Papa from 'papaparse'
import { createClient } from '@supabase/supabase-js'

const dataDir = path.resolve('public/plantillas/base-datos')
const applyMode = process.argv.includes('--apply')
const confirmed = process.argv.includes('--confirm')

function clean(value) {
  return String(value ?? '').trim()
}

function numberOrNull(value) {
  const text = clean(value)
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function booleanOrNull(value) {
  const text = clean(value).toLowerCase()
  if (!text) return null
  if (['true', 'si', 'sí', '1', 'yes'].includes(text)) return true
  if (['false', 'no', '0'].includes(text)) return false
  return null
}

function readCsv(name) {
  const filepath = path.join(dataDir, `${name}.csv`)
  if (!fs.existsSync(filepath)) throw new Error(`No existe ${name}.csv.`)
  const result = Papa.parse(fs.readFileSync(filepath, 'utf8'), { header: true, skipEmptyLines: true })
  if (result.errors.length) throw new Error(`${name}.csv: ${result.errors[0].message}`)
  return result.data
}

function key(...values) {
  return values.map(clean).join('|')
}

function requireValue(value, label) {
  const text = clean(value)
  if (!text) throw new Error(`Falta ${label}.`)
  return text
}

function timeValue(value, label) {
  const text = requireValue(value, label).replace(',', ':').replace('.', ':')
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text)
  if (!match) throw new Error(`${label} invalida "${value}". Usa HH:MM.`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] ?? 0)
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error(`${label} invalida "${value}". Usa una hora valida.`)
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const data = {
  careers: readCsv('carreras'),
  plans: readCsv('planes_estudio'),
  subjects: readCsv('materias_plan'),
  prerequisites: readCsv('correlatividades'),
  equivalences: readCsv('equivalencias_planes'),
  teachers: readCsv('docentes'),
  assignments: readCsv('docente_materias'),
  schedules: readCsv('horarios_cursada'),
  students: readCsv('alumnos'),
  studentPlans: readCsv('alumno_carrera_plan'),
  academicStatuses: readCsv('estado_academico_alumno'),
}

const summary = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]))

if (!applyMode) {
  console.log(JSON.stringify({ mode: 'dry-run', summary, message: 'No se conecto a Supabase. Use --apply --confirm para cargar datos.' }, null, 2))
  process.exit(0)
}

if (!confirmed) throw new Error('La carga requiere --apply --confirm. No se modifico Supabase.')

const supabaseUrl = clean(process.env.SUPABASE_URL)
const secretKey = clean(process.env.SUPABASE_SECRET_KEY)
const legacyServiceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
const apiKey = secretKey || legacyServiceRoleKey
const institutionId = clean(process.env.SUPABASE_IMPORT_INSTITUTION_ID)
if (!supabaseUrl || !apiKey || !institutionId) {
  throw new Error('Para aplicar la carga se requieren SUPABASE_URL, SUPABASE_SECRET_KEY y SUPABASE_IMPORT_INSTITUTION_ID.')
}

const supabase = createClient(supabaseUrl, apiKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function upsert(table, rows, onConflict) {
  if (!rows.length) return []
  const { data: result, error } = await supabase.from(table).upsert(rows, { onConflict }).select()
  if (error) throw new Error(`${table}: ${error.message}`)
  return result ?? []
}

const careerRows = data.careers.map((row) => ({
  institution_id: institutionId,
  external_code: requireValue(row.carrera_codigo, 'carrera_codigo'),
  name: requireValue(row.carrera_nombre, 'carrera_nombre'),
  duration_years: numberOrNull(row.duracion_anios),
  status: clean(row.estado).toLowerCase() === 'inactiva' ? 'inactive' : 'active',
  notes: clean(row.observaciones) || null,
}))
const careers = await upsert('careers', careerRows, 'institution_id,external_code')
const careerByCode = new Map(careers.map((row) => [row.external_code, row]))

const planRows = data.plans.map((row) => ({
  institution_id: institutionId,
  career_id: requireValue(careerByCode.get(clean(row.carrera_codigo))?.id, `carrera ${row.carrera_codigo}`),
  external_code: requireValue(row.plan_codigo, 'plan_codigo'),
  name: requireValue(row.plan_nombre, 'plan_nombre'),
  plan_year: numberOrNull(row.anio_plan),
  resolution: clean(row.resolucion) || null,
  status: ({ vigente: 'active', conviviente: 'active', cerrado: 'closed', borrador: 'draft' })[clean(row.estado_plan).toLowerCase()] ?? 'active',
  valid_from: clean(row.vigente_desde) || null,
  valid_until: clean(row.vigente_hasta) || null,
  notes: clean(row.observaciones) || null,
}))
const plans = await upsert('study_plans', planRows, 'institution_id,external_code')
const planByCode = new Map(plans.map((row) => [row.external_code, row]))

const planUpdates = planRows
  .filter((row) => clean(data.plans.find((source) => source.plan_codigo === row.external_code)?.convive_con_plan_codigo))
  .map((row) => ({
    institution_id: institutionId,
    external_code: row.external_code,
    coexist_with_plan_id: planByCode.get(clean(data.plans.find((source) => source.plan_codigo === row.external_code)?.convive_con_plan_codigo))?.id ?? null,
  }))
for (const update of planUpdates) {
  const { error } = await supabase.from('study_plans').update({ coexist_with_plan_id: update.coexist_with_plan_id }).eq('institution_id', institutionId).eq('external_code', update.external_code)
  if (error) throw new Error(`study_plans convivencia: ${error.message}`)
}

const subjectRows = data.subjects.map((row) => ({
  institution_id: institutionId,
  external_id: clean(row.materia_id) || null,
  code: requireValue(row.materia_codigo, 'materia_codigo'),
  name: requireValue(row.materia_nombre, 'materia_nombre'),
}))
const subjects = await upsert('subjects', subjectRows, 'institution_id,code')
const subjectByCode = new Map(subjects.map((row) => [row.code, row]))

const planSubjectRows = data.subjects.map((row) => ({
  institution_id: institutionId,
  plan_id: requireValue(planByCode.get(clean(row.plan_codigo))?.id, `plan ${row.plan_codigo}`),
  subject_id: requireValue(subjectByCode.get(clean(row.materia_codigo))?.id, `materia ${row.materia_codigo}`),
  year_number: numberOrNull(row.anio_cursada),
  term_number: numberOrNull(row.cuatrimestre),
  regime: clean(row.regimen) || null,
  training_field: clean(row.campo_formacion) || null,
  format: clean(row.formato) || null,
  exam_required: booleanOrNull(row.requiere_mesa) ?? false,
  exam_type: clean(row.tipo_mesa) || null,
  exam_group: clean(row.grupo_afin_mesa) || null,
  related_subject_codes: clean(row.codigos_materias_afines) || null,
  print_order: numberOrNull(row.orden_impresion),
  valid_from: clean(row.vigente_desde) || null,
  valid_until: clean(row.vigente_hasta) || null,
  notes: clean(row.observaciones) || null,
}))
const planSubjects = await upsert('study_plan_subjects', planSubjectRows, 'institution_id,plan_id,subject_id')
const planSubjectByPlanAndSubject = new Map(
  planSubjects.map((row) => [key(row.plan_id, row.subject_id), row]),
)
const planSubjectByCode = new Map(
  data.subjects.map((row) => {
    const planId = planByCode.get(clean(row.plan_codigo))?.id
    const subjectId = subjectByCode.get(clean(row.materia_codigo))?.id
    return [
      key(row.plan_codigo, row.materia_codigo),
      planSubjectByPlanAndSubject.get(key(planId, subjectId)),
    ]
  }).filter(([, row]) => row),
)

const getPlanSubject = (planCode, subjectCode) => planSubjectByCode.get(key(planCode, subjectCode))

const prerequisiteRows = data.prerequisites.map((row) => ({
  institution_id: institutionId,
  target_plan_subject_id: requireValue(getPlanSubject(row.plan_codigo, row.materia_destino_codigo)?.id, `correlativa destino ${row.plan_codigo}/${row.materia_destino_codigo}`),
  prerequisite_plan_subject_id: requireValue(getPlanSubject(row.plan_codigo, row.materia_requerida_codigo)?.id, `correlativa requisito ${row.plan_codigo}/${row.materia_requerida_codigo}`),
  prerequisite_type: 'subject',
  required_condition: ({ regular: 'regular', aprobada: 'approved', aprobado: 'approved', cursada: 'enrolled' })[clean(row.requisito).toLowerCase()] ?? 'regular',
  logic_group: numberOrNull(row.grupo_logico) ?? 1,
  applies_to: ({ cursar: 'enrollment', rendir: 'exam', cursar_y_rendir: 'enrollment_and_exam' })[clean(row.aplica_para).toLowerCase()] ?? 'enrollment_and_exam',
  status: clean(row.estado).toLowerCase() === 'inactiva' ? 'inactive' : 'active',
  notes: clean(row.observaciones) || null,
}))
await upsert('subject_prerequisites', prerequisiteRows, 'institution_id,target_plan_subject_id,prerequisite_plan_subject_id,prerequisite_type,applies_to')

const equivalenceRows = data.equivalences.map((row) => ({
  institution_id: institutionId,
  source_plan_subject_id: requireValue(getPlanSubject(row.plan_origen_codigo, row.materia_origen_codigo)?.id, `equivalencia origen ${row.plan_origen_codigo}/${row.materia_origen_codigo}`),
  target_plan_subject_id: requireValue(getPlanSubject(row.plan_destino_codigo, row.materia_destino_codigo)?.id, `equivalencia destino ${row.plan_destino_codigo}/${row.materia_destino_codigo}`),
  equivalence_type: requireValue(row.tipo_equivalencia, 'tipo_equivalencia'),
  scope: clean(row.alcance) || null,
  resolution_required: booleanOrNull(row.requiere_resolucion) ?? false,
  status: 'active',
  valid_from: clean(row.vigente_desde) || null,
  valid_until: clean(row.vigente_hasta) || null,
  notes: clean(row.observaciones) || null,
}))
await upsert('plan_equivalences', equivalenceRows, 'institution_id,source_plan_subject_id,target_plan_subject_id')

const teacherRows = data.teachers.map((row) => ({
  institution_id: institutionId,
  external_code: requireValue(row.docente_codigo, 'docente_codigo'),
  first_name: requireValue(row.nombre, 'nombre docente'),
  last_name: requireValue(row.apellido, 'apellido docente'),
  national_id: clean(row.dni_docente) || null,
  email: clean(row.email) || null,
  phone: clean(row.telefono) || null,
  status: clean(row.estado_docente).toLowerCase() === 'inactivo' ? 'inactive' : 'active',
  teaching_hours: numberOrNull(row.horas_catedra),
  specialty: clean(row.especialidad) || null,
  suitability_families: clean(row.familias_idoneidad) || null,
  explicit_academic_suitability: booleanOrNull(row.idoneidad_academica_explicita),
  notes: clean(row.observaciones) || null,
}))
const teacherRecords = await upsert('teacher_records', teacherRows, 'institution_id,external_code')
const teacherByCode = new Map(teacherRecords.map((row) => [row.external_code, row]))

const assignmentRows = data.assignments.map((row) => ({
  institution_id: institutionId,
  plan_subject_id: requireValue(getPlanSubject(row.plan_codigo, row.materia_codigo)?.id, `asignacion materia ${row.plan_codigo}/${row.materia_codigo}`),
  teacher_id: requireValue(teacherByCode.get(clean(row.docente_codigo))?.id, `docente ${row.docente_codigo}`),
  role: clean(row.rol_en_materia) || null,
  status: clean(row.estado_asignacion).toLowerCase() === 'inactivo' ? 'inactive' : 'active',
  valid_from: clean(row.vigencia_desde) || null,
  valid_until: clean(row.vigencia_hasta) || null,
  replaced_teacher_id: teacherByCode.get(clean(row.docente_reemplazado_codigo))?.id ?? null,
  exam_required: booleanOrNull(row.requiere_mesa),
  notes: clean(row.observaciones) || null,
}))
await upsert('teacher_subject_assignments', assignmentRows, 'institution_id,plan_subject_id,teacher_id,valid_from')

const weekday = { lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 7 }
const scheduleRows = data.schedules.map((row) => ({
  institution_id: institutionId,
  plan_subject_id: requireValue(getPlanSubject(row.plan_codigo, row.materia_codigo)?.id, `horario materia ${row.plan_codigo}/${row.materia_codigo}`),
  teacher_id: requireValue(teacherByCode.get(clean(row.docente_codigo))?.id, `docente horario ${row.docente_codigo}`),
  weekday: weekday[clean(row.dia).toLowerCase()],
  starts_at: timeValue(row.hora_inicio, 'hora_inicio'),
  ends_at: timeValue(row.hora_fin, 'hora_fin'),
  modality: clean(row.modalidad) || null,
  campus: clean(row.sede) || null,
  commission: clean(row.comision) || null,
  notes: clean(row.observaciones) || null,
}))
await upsert('course_schedules', scheduleRows, 'institution_id,plan_subject_id,teacher_id,weekday,starts_at,ends_at')

const studentRows = data.students.map((row) => ({
  institution_id: institutionId,
  external_code: requireValue(row.alumno_codigo, 'alumno_codigo'),
  first_name: requireValue(row.nombre, 'nombre alumno'),
  last_name: requireValue(row.apellido, 'apellido alumno'),
  national_id: clean(row.dni) || null,
  email: clean(row.email) || null,
  phone: clean(row.telefono) || null,
  status: clean(row.estado).toLowerCase() === 'inactivo' ? 'inactive' : 'active',
  notes: clean(row.observaciones) || null,
}))
const studentRecords = await upsert('student_records', studentRows, 'institution_id,external_code')
const studentByCode = new Map(studentRecords.map((row) => [row.external_code, row]))

const studentPlanRows = data.studentPlans.map((row) => ({
  institution_id: institutionId,
  student_id: requireValue(studentByCode.get(clean(row.alumno_codigo))?.id, `alumno ${row.alumno_codigo}`),
  career_id: requireValue(careerByCode.get(clean(row.carrera_codigo))?.id, `carrera alumno ${row.carrera_codigo}`),
  plan_id: requireValue(planByCode.get(clean(row.plan_codigo))?.id, `plan alumno ${row.plan_codigo}`),
  cohort: clean(row.cohorte) || null,
  entry_year: numberOrNull(row.anio_ingreso),
  current_year: numberOrNull(row.anio_cursada),
  status: 'active',
  valid_from: clean(row.vigente_desde) || null,
  valid_until: clean(row.vigente_hasta) || null,
  notes: clean(row.observaciones) || null,
}))
await upsert('student_career_plans', studentPlanRows, 'institution_id,student_id,plan_id')

console.log(JSON.stringify({ mode: 'apply', institutionId, summary, academicStatusesSkipped: data.academicStatuses.length === 0 }, null, 2))
