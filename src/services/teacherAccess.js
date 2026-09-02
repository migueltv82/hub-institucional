import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { getCareerValues } from './careerCatalog.js'

function clean(value) {
  return String(value ?? '').trim()
}

function readField(row = {}, fields = []) {
  const field = fields.find((candidate) => clean(row?.[candidate]))
  return clean(field ? row[field] : '')
}

function getTeacherName(teacher) {
  if (!teacher || typeof teacher !== 'object') return ''
  return clean(
    teacher.full_name ||
    teacher.fullName ||
    teacher.teacher_display_name ||
    teacher.teacher_name ||
    teacher.display_name ||
    teacher.displayName ||
    teacher.docenteNombre ||
    teacher.nombreDocente ||
    teacher.docente ||
    teacher.profesor ||
    [teacher.apellido, teacher.nombre].map(clean).filter(Boolean).join(' ') ||
    [teacher.nombre, teacher.apellido].map(clean).filter(Boolean).join(' '),
  )
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function getTeacherDni(teacher) {
  return readField(teacher, ['dni_docente', 'dniDocente', 'dni', 'documento', 'document_number', 'document'])
}

function getTeacherPhone(teacher) {
  return readField(teacher, ['telefono', 'telefono_docente', 'telefonoDocente', 'celular', 'phone', 'tel'])
}

function getTeacherEmail(teacher) {
  return readField(teacher, ['email', 'correo', 'mail', 'correo_electronico', 'email_docente', 'emailDocente']).toLowerCase()
}

function getTeacherStatus(teacher) {
  return readField(teacher, ['estado_docente', 'estadoDocente', 'estado', 'status']) || 'activo'
}

function getTeacherRecordId(teacher) {
  return readField(teacher, [
    'teacher_record_id',
    'teacherRecordId',
    'docente_id',
    'docenteId',
    'teacher_id',
    'teacherId',
    'user_id',
    'userId',
    'id',
    'record_id',
  ])
}

function normalizeNumber(value) {
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function getTeacherHours(teacher) {
  return normalizeNumber(readField(teacher, [
    'horas_catedra',
    'horasCatedra',
    'teachingHours',
    'carga_horaria',
    'cargaHoraria',
  ]))
}

function getScheduleTeacherName(schedule) {
  return getTeacherName(schedule)
}

function getScheduleTeacherDni(schedule) {
  return getTeacherDni(schedule)
}

function getScheduleTeacherPhone(schedule) {
  return getTeacherPhone(schedule)
}

function getScheduleTeacherEmail(schedule) {
  return getTeacherEmail(schedule)
}

function getSubjectName(row = {}) {
  return readField(row, [
    'materia_nombre',
    'materiaNombre',
    'nombreMateria',
    'subject_name',
    'subjectName',
    'nombre_materia',
    'asignatura',
    'materia',
    'materia_codigo',
    'materiaCodigo',
    'subject_id',
    'subjectId',
    'codigo',
  ])
}

function getRowCareerValues(row = {}) {
  const careers = [
    ...getCareerValues(row),
    readField(row, ['carrera_nombre', 'carreraNombre', 'career_name', 'careerName']),
  ].filter(Boolean)

  if (!careers.length) {
    const fallbackCareerId = readField(row, ['carrera_id', 'carreraId', 'program_id', 'programId'])
    if (fallbackCareerId) careers.push(fallbackCareerId)
  }

  return Array.from(new Set(careers))
}

function getTeacherIdentityKey(teacher) {
  return normalize(getTeacherRecordId(teacher) || getTeacherDni(teacher) || getTeacherEmail(teacher) || getTeacherName(teacher))
}

function buildTeacherRows(teacherProfiles = [], schedules = []) {
  const teachers = new Map()
  const profilesById = new Map()
  const profilesByDni = new Map()
  const profilesByEmail = new Map()
  const profilesByName = new Map()

  const validTeacherProfiles = asArray(teacherProfiles)
    .filter((teacher) => teacher && typeof teacher === 'object')

  validTeacherProfiles.forEach((teacher) => {
    const name = getTeacherName(teacher)
    const key = getTeacherIdentityKey(teacher)
    if (!name || !key) return
    const dni = getTeacherDni(teacher)
    const email = getTeacherEmail(teacher)
    const phone = getTeacherPhone(teacher)
    const teacherHours = getTeacherHours(teacher)

    teachers.set(key, {
      id: getTeacherRecordId(teacher) || undefined,
      record_id: readField(teacher, ['record_id', 'teacher_record_id', 'teacherRecordId']) || undefined,
      nombre: name,
      full_name: name,
      dni,
      email,
      telefono: phone,
      carreras: getRowCareerValues(teacher),
      materias: [],
      estado: getTeacherStatus(teacher),
      horasCatedra: teacherHours ?? undefined,
      profile: teacher,
    })

    const id = getTeacherRecordId(teacher)
    if (id) profilesById.set(normalize(id), key)
    if (dni) profilesByDni.set(normalize(dni), key)
    if (email) profilesByEmail.set(normalize(email), key)
    profilesByName.set(normalize(name), key)
  })

  asArray(schedules).forEach((schedule) => {
    const scheduleId = getTeacherRecordId(schedule)
    const scheduleDni = getScheduleTeacherDni(schedule)
    const scheduleEmail = getScheduleTeacherEmail(schedule)
    const scheduleName = getScheduleTeacherName(schedule)
    const teacherKey = (
      (scheduleId && profilesById.get(normalize(scheduleId))) ||
      (scheduleDni && profilesByDni.get(normalize(scheduleDni))) ||
      (scheduleEmail && profilesByEmail.get(normalize(scheduleEmail))) ||
      (scheduleName && profilesByName.get(normalize(scheduleName)))
    )
    if (!teacherKey) return

    const current = teachers.get(teacherKey)
    if (!current) return

    const subject = getSubjectName(schedule)
    const scheduleCareers = getRowCareerValues(schedule)
    const scheduleHours = getTeacherHours(schedule)

    if (subject && !current.materias.includes(subject)) {
      current.materias.push(subject)
    }

    scheduleCareers.forEach((career) => {
      if (career && !current.carreras.includes(career)) current.carreras.push(career)
    })

    if (!current.dni) current.dni = scheduleDni
    if (!current.email) current.email = scheduleEmail
    if (!current.telefono) current.telefono = getScheduleTeacherPhone(schedule)
    if (current.horasCatedra === undefined && scheduleHours !== null) current.horasCatedra = scheduleHours

    teachers.set(teacherKey, current)
  })

  return Array.from(teachers.values()).map((teacher) => ({
    ...teacher,
    carreras: Array.from(new Set(teacher.carreras)).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
    materias: Array.from(new Set(teacher.materias)).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
  }))
}

export function getTeachersFromProfiles(teacherProfiles = [], schedules = []) {
  return buildTeacherRows(teacherProfiles, schedules)
}

export function getTeachersFromSchedules(schedules = [], teacherProfiles = []) {
  return buildTeacherRows(teacherProfiles, schedules)
}

export async function provisionTeacherAccess({ institutionId, schedules, teacherProfiles = [], useRemote }) {
  if (!institutionId) {
    throw new Error('No hay una institucion activa para crear accesos docentes.')
  }

  const teachers = buildTeacherRows(teacherProfiles, schedules)

  if (!Array.isArray(teacherProfiles) || teacherProfiles.length === 0) {
    throw new Error('Carga primero la planilla de docentes.')
  }

  if (teachers.length === 0) {
    throw new Error('Carga primero la planilla de docentes.')
  }

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    throw new Error('La creacion de accesos docentes requiere una sesion remota con Supabase configurado.')
  }

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'bulk_create_teachers',
      institution_id: institutionId,
      teachers,
    },
  })

  if (error) {
    let detail = error.message

    try {
      if (error.context && typeof error.context.json === 'function') {
        const errorBody = await error.context.json()
        detail = errorBody?.error ?? errorBody?.message ?? detail
      }
    } catch {
      // Supabase puede no permitir leer el body dos veces.
    }

    throw new Error(`No se pudieron crear los accesos docentes. ${detail}`)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}
