import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  BookOpenCheck,
  CalendarX2,
  Clock3,
  KeyRound,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import {
  getCareerValues,
  resolveCareerDisplayName,
} from '../../services/careerCatalog.js'
import { buildTeacherLoginEmail } from '../../services/rosterRecords.js'
import { getTeachersFromProfiles } from '../../services/teacherAccess.js'
import {
  createTeacherSubjectLeave,
  createSubjectTeacherAssignment,
  deactivateSubjectTeacherAssignment,
  fetchSubjectTeacherAssignmentsForTeacher,
  resolveTeacherProfile,
  SUBJECT_TEACHER_ROLES,
  updateTeacherAssignmentCondition,
} from '../../services/subjectTeacherAssignments.js'
import {
  buildTeacherAcademicSummary,
  createEmptyAvailabilityDraft,
  createEmptyLoadDraft,
  getTeacherDisplayName,
  getTeacherOptionKey,
  readScheduleCatedraHours,
  validateAvailabilityDraft,
  validateLoadDraft,
} from './teacherAcademicAdmin.js'
import {
  createEmptyTeacherBlockedDateDraft,
  TEACHER_BLOCK_SCOPE,
  validateTeacherBlockedDateDraft,
} from '../../utils/examEngine/teacherBlockedDates.js'
import { buildTeacherBaseDataDiagnostics } from '../../utils/examEngine/teacherBaseDataDiagnostics.js'

const SUBJECT_ROLE_LABELS = {
  titular: 'Titular',
  suplente: 'Reemplazo',
  licencia: 'Licencia',
}

const DAY_OPTIONS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']
const TURN_OPTIONS = ['MANANA', 'TARDE', 'NOCHE']
const LOAD_ROLE_OPTIONS = ['TITULAR', 'CO_DOCENTE', 'AUXILIAR', 'SUPLENTE', 'REEMPLAZO']
const LOAD_STATUS_OPTIONS = ['ACTIVO', 'LICENCIA', 'RENUNCIA', 'BAJA', 'REEMPLAZADO']
const TEACHER_ADMIN_TABS = [
  { key: 'roster', label: 'Padron' },
  { key: 'diagnostics', label: 'Control de datos' },
  { key: 'availability', label: 'Disponibilidad' },
  { key: 'blocked-dates', label: 'Bloqueos' },
  { key: 'loads', label: 'Carga horaria' },
]

function buildTeacherRosterCareerOptions(careerOptions = [], teachers = []) {
  const optionsByKey = new Map()

  ;[
    ...careerOptions,
    ...teachers.flatMap(getTeacherCareers),
  ].forEach((career) => {
    const label = resolveCareerDisplayName(career) || clean(career)
    const key = normalize(label)
    if (label && key && !optionsByKey.has(key)) optionsByKey.set(key, label)
  })

  return Array.from(optionsByKey.values())
    .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}
const TEACHER_ADMIN_TAB_HEADERS = {
  roster: {
    title: 'Padron docente',
    description: 'Datos personales, contacto y resumen academico de cada docente.',
  },
  diagnostics: {
    title: 'Control de datos docentes',
    description: 'Validacion de fuentes, titularidades, disponibilidad y materias del alcance.',
  },
  availability: {
    title: 'Disponibilidad docente',
    description: 'Dias y franjas declaradas para asistencia al instituto.',
  },
  'blocked-dates': {
    title: 'Bloqueos docentes',
    description: 'Fechas o franjas donde un docente no puede ser asignado.',
  },
  loads: {
    title: 'Carga horaria docente',
    description: 'Horas catedra declaradas por carrera y materia.',
  },
}
const ROSTER_VISIBLE_LIMIT_OPTIONS = [
  { value: '0', label: 'Ninguno' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: 'all', label: 'Todos' },
]
const ROSTER_STAT_STYLES = {
  teal: 'border-l-teal-600 text-teal-700',
  sky: 'border-l-sky-500 text-sky-700',
  lime: 'border-l-lime-500 text-lime-700',
  indigo: 'border-l-indigo-500 text-indigo-700',
  orange: 'border-l-orange-500 text-orange-700',
}
const SUPABASE_VALIDATION_SOURCE = 'codex_teacher_academic_validation'
const SUPABASE_VALIDATION_DNI = '99945001'
const SUPABASE_VALIDATION_NAME = 'Docente Validacion Supabase'
const SUPABASE_VALIDATION_CAREER = 'Validacion Carrera'
const SUPABASE_VALIDATION_SUBJECT_ID = 'VAL-SUPA-1'
const SUPABASE_VALIDATION_SUBJECT_NAME = 'Validacion Supabase I'

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function matchesField(value, filter) {
  return normalize(value).includes(normalize(filter))
}

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function sameText(left, right) {
  return normalize(left) === normalize(right)
}

function isSupabaseValidationCareer(value) {
  return sameText(value, SUPABASE_VALIDATION_CAREER)
}

function isSupabaseValidationArtifact(row = {}) {
  const rawPayload = row?.raw_payload && typeof row.raw_payload === 'object'
    ? row.raw_payload
    : row?.raw && typeof row.raw === 'object'
      ? row.raw
      : {}
  const profileRawPayload = row?.profile?.raw_payload && typeof row.profile.raw_payload === 'object'
    ? row.profile.raw_payload
    : row?.profile?.raw && typeof row.profile.raw === 'object'
      ? row.profile.raw
      : {}
  const source = clean(row.source || row.fuente || rawPayload.source || profileRawPayload.source)
  const dni = clean(row.dni_docente || row.dniDocente || row.teacher_dni || row.dni || row.documento || rawPayload.dni || profileRawPayload.dni)
  const name = clean(
    row.full_name ||
    row.nombre_completo ||
    row.docente ||
    row.profesor ||
    row.teacher_display_name ||
    row.teacher_name ||
    [row.apellido, row.nombre].map(clean).filter(Boolean).join(' ') ||
    rawPayload.full_name ||
    rawPayload.docente ||
    profileRawPayload.full_name ||
    profileRawPayload.docente,
  )
  const career = clean(row.carrera || row.carrera_nombre || row.career_name || row.program_id || rawPayload.carrera || rawPayload.career_name)
  const subject = clean(
    row.materia_nombre ||
    row.subject_name ||
    row.materia ||
    row.materia_codigo ||
    row.subject_id ||
    rawPayload.materia_nombre ||
    rawPayload.subject_name ||
    rawPayload.subject_id,
  )

  return (
    sameText(source, SUPABASE_VALIDATION_SOURCE) ||
    sameText(dni, SUPABASE_VALIDATION_DNI) ||
    sameText(name, SUPABASE_VALIDATION_NAME) ||
    sameText(subject, SUPABASE_VALIDATION_SUBJECT_ID) ||
    sameText(subject, SUPABASE_VALIDATION_SUBJECT_NAME) ||
    isSupabaseValidationCareer(career)
  )
}

function getTeacherFullName(teacher) {
  return String(teacher?.full_name || teacher?.nombre || '').trim()
}

function getTeacherEmail(teacher) {
  return String(
    teacher?.email ||
    teacher?.correo ||
    teacher?.mail ||
    teacher?.profile?.email ||
    teacher?.profile?.correo ||
    teacher?.profile?.mail ||
    '',
  ).trim()
}

function getTeacherFirstName(teacher) {
  const explicitFirstName = String(
    teacher?.profile?.nombre || teacher?.first_name || teacher?.nombrePropio || '',
  ).trim()

  if (explicitFirstName) return explicitFirstName

  return getTeacherFullName(teacher).split(/\s+/).filter(Boolean)[0] ?? ''
}

function getTeacherLastName(teacher) {
  const explicitLastName = String(
    teacher?.profile?.apellido || teacher?.last_name || teacher?.apellido || '',
  ).trim()

  if (explicitLastName) return explicitLastName

  const [, ...lastNameParts] = getTeacherFullName(teacher).split(/\s+/).filter(Boolean)
  return lastNameParts.join(' ')
}

function scheduleMatchesTeacher(schedule, teacher) {
  const scheduleDni = clean(schedule?.dni || schedule?.documento)
  const teacherDni = clean(teacher?.dni || teacher?.documento)
  const scheduleTeacher = clean(schedule?.profesor || schedule?.docente || schedule?.nombre)
  const teacherName = getTeacherFullName(teacher) || [getTeacherFirstName(teacher), getTeacherLastName(teacher)].filter(Boolean).join(' ')

  return (
    (scheduleDni && teacherDni && sameText(scheduleDni, teacherDni)) ||
    (scheduleTeacher && teacherName && sameText(scheduleTeacher, teacherName))
  )
}

function searchTeachers(teachers, query) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return teachers

  return teachers.filter((teacher) => {
    const fullName = getTeacherFullName(teacher)

    return (
      matchesField(fullName, normalizedQuery) ||
      matchesField(teacher.dni, normalizedQuery) ||
      matchesField(teacher.telefono, normalizedQuery) ||
      teacher.materias.some((materia) => matchesField(materia, normalizedQuery))
    )
  })
}

function getAcademicRowTeacherName(row = {}) {
  return clean(
    row.docenteNombre ||
    row.docente ||
    row.profesor ||
    row.teacher_display_name ||
    row.teacher_name ||
    row.nombre_docente ||
    row.nombre,
  )
}

function getAcademicRowTeacherDni(row = {}) {
  return clean(row.dni_docente || row.dniDocente || row.teacher_dni || row.dni || row.documento)
}

function getAcademicRowTeacherKey(row = {}) {
  return normalize(
    row.docenteId ||
    row.docente_id ||
    row.teacher_record_id ||
    row.teacherRecordId ||
    row.id_docente ||
    row.teacher_id ||
    row.teacherId ||
    getAcademicRowTeacherDni(row) ||
    getAcademicRowTeacherName(row),
  )
}

function rowMatchesFilteredTeacher(row = {}, teacherFilterIndex = {}) {
  const rowKey = getAcademicRowTeacherKey(row)
  const rowDni = normalize(getAcademicRowTeacherDni(row))
  const rowName = normalize(getAcademicRowTeacherName(row))

  return Boolean(
    (rowKey && teacherFilterIndex.keys?.has(rowKey)) ||
    (rowDni && teacherFilterIndex.keys?.has(rowDni)) ||
    (rowName && teacherFilterIndex.names?.has(rowName)),
  )
}

function rowMatchesTeacherSectionFilters(row = {}, filters = {}) {
  const {
    careerFilter = '',
    hasFilter = false,
    planOptions = [],
    searchQuery = '',
    teacherFilterIndex = {},
  } = filters

  if (!hasFilter) return true

  const teacherMatchesFilter = rowMatchesFilteredTeacher(row, teacherFilterIndex)
  const career = getScheduleCareerName(row, planOptions)
  const subject = getScheduleSubjectName(row, planOptions)
  const day = getScheduleDay(row)
  const start = getScheduleStart(row)
  const end = getScheduleEnd(row)
  const timeRange = [start, end].filter(Boolean).join(' - ')
  const normalizedSearch = normalize(searchQuery)
  const matchesSearch = !normalizedSearch || teacherMatchesFilter || [
    getAcademicRowTeacherName(row),
    getAcademicRowTeacherDni(row),
    row.telefono,
    row.email,
    row.correo,
    row.mail,
    career,
    subject,
    row.materia_nombre,
    row.materia,
    row.materia_codigo,
    day,
    timeRange,
    row.date,
    row.fecha,
    row.reason,
    row.motivo,
    row.observaciones,
  ].some((value) => normalize(value).includes(normalizedSearch))

  if (!matchesSearch) return false

  if (!careerFilter) return true
  if (career && career !== '-') return sameText(career, careerFilter)

  return teacherMatchesFilter
}

function applyDisplayLimit(rows = [], limitValue = 'all') {
  if (limitValue === '0') return []
  if (limitValue === 'all') return rows

  const limit = Number(limitValue)
  return Number.isFinite(limit) ? rows.slice(0, limit) : rows
}

function getTeacherCareers(teacher) {
  return getCareerValues(teacher)
}

function getTeacherStatus(teacher) {
  return clean(teacher?.profile?.estado || teacher?.estado || 'activo')
}

function getTeacherHours(teacher, summary = null) {
  const summaryHours = Number(summary?.totalHoras)
  if (Number.isFinite(summaryHours) && summaryHours > 0) return summaryHours

  const value = teacher?.horasCatedra ?? teacher?.horas_catedra ?? teacher?.profile?.horas_catedra
  if (!clean(value)) return null
  const number = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function formatRosterCount(count, singular, plural = `${singular}s`) {
  const safeCount = Number(count) || 0
  if (safeCount <= 0) return `Sin ${singular.toLowerCase()}`
  return `${safeCount} ${safeCount === 1 ? singular : plural}`
}

function hasTeacherSubjects(teacher) {
  return Array.isArray(teacher?.materias) && teacher.materias.length > 0
}

function hasIncompleteRosterData(teacher) {
  return (
    !clean(teacher?.dni) ||
    getTeacherCareers(teacher).length === 0 ||
    !hasTeacherSubjects(teacher)
  )
}

function getRosterStatCards({ teachers = [] } = {}) {
  const teachersWithDni = teachers.filter((teacher) => clean(teacher.dni)).length
  const teachersWithCareers = teachers.filter((teacher) => getTeacherCareers(teacher).length > 0).length
  const teachersWithSubjects = teachers.filter(hasTeacherSubjects).length
  const teachersWithIncompleteData = teachers.filter(hasIncompleteRosterData).length

  return [
    { label: 'Docentes', value: teachers.length, tone: 'teal' },
    { label: 'Con DNI', value: teachersWithDni, tone: 'sky' },
    { label: 'Con carrera', value: teachersWithCareers, tone: 'lime' },
    { label: 'Con materias', value: teachersWithSubjects, tone: 'indigo' },
    {
      label: 'Incompletos',
      value: teachersWithIncompleteData,
      tone: 'orange',
      description: 'Falta DNI, carrera o materia',
    },
  ]
}

function buildTeacherForm(teacher) {
  return {
    nombre: getTeacherFirstName(teacher),
    apellido: getTeacherLastName(teacher),
    dni: teacher?.dni ?? '',
    telefono: teacher?.telefono ?? '',
    carreras: getCareerValues(teacher),
    estado: teacher?.estado ?? teacher?.profile?.estado ?? 'activo',
  }
}

function getRowId(row, index, prefix) {
  return row?.id ?? `${prefix}-${index}`
}

function buildTeacherOptions(teachers = [], disponibilidadDocente = [], cargaHorariaDocente = []) {
  const options = new Set()

  teachers.forEach((teacher) => {
    const name = getTeacherDisplayName(teacher)
    if (name) options.add(name)
  })
  disponibilidadDocente.forEach((row) => {
    const name = clean(row.docente || row.profesor)
    if (name) options.add(name)
  })
  cargaHorariaDocente.forEach((row) => {
    const name = clean(row.docente || row.profesor)
    if (name) options.add(name)
  })

  return Array.from(options).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))
}

function buildPlanOptions(planesEstudio = []) {
  return planesEstudio
    .map((plan) => ({
      key: [
        clean(plan.carrera),
        clean(plan.materia || plan.codigo),
        clean(plan.nombreMateria || plan.nombre),
      ].join('::'),
      carrera: clean(plan.carrera),
      materia_codigo: clean(plan.materia || plan.codigo),
      materia_nombre: clean(plan.nombreMateria || plan.nombre || plan.materia || plan.codigo),
      anio: clean(plan.anio || plan.ano || plan.year || plan.curso),
      label: [
        clean(plan.carrera),
        clean(plan.materia || plan.codigo),
        clean(plan.nombreMateria || plan.nombre),
      ].filter(Boolean).join(' / '),
    }))
    .filter((plan) => plan.label)
}

function normalizeSubjectRole(role) {
  const normalized = clean(role).toLowerCase()
  return SUBJECT_TEACHER_ROLES.includes(normalized) ? normalized : 'titular'
}

function findPlanBySubject(planOptions = [], subjectId = '', programId = '') {
  return planOptions.find((option) => (
    sameText(option.materia_codigo, subjectId) &&
    sameText(option.carrera, programId)
  ))
}

function findPlanForSchedule(planOptions = [], schedule = {}) {
  const subjectId = clean(schedule.materia_codigo || schedule.codigo || schedule.materia || schedule.subject_id)
  const programId = clean(schedule.carrera || schedule.carrera_nombre || schedule.program_id)
  const exact = findPlanBySubject(planOptions, subjectId, programId)
  if (exact) return exact

  const subjectMatches = planOptions.filter((option) => sameText(option.materia_codigo, subjectId))
  return subjectMatches.length === 1 ? subjectMatches[0] : null
}

function getScheduleSubjectName(schedule = {}, planOptions = []) {
  const plan = findPlanForSchedule(planOptions, schedule)
  return clean(
    schedule.nombreMateria ||
    schedule.materia_nombre ||
    schedule.subject_name ||
    plan?.materia_nombre ||
    schedule.asignatura ||
    schedule.materia ||
    schedule.materia_codigo ||
    schedule.codigo,
  ) || '-'
}

function getScheduleTeacherName(schedule = {}) {
  return clean(
    schedule.docente ||
    schedule.profesor ||
    schedule.teacher_display_name ||
    schedule.teacher_name ||
    [schedule.apellido, schedule.nombre].map(clean).filter(Boolean).join(' ') ||
    schedule.nombre,
  )
}

function getScheduleTeacherKey(schedule = {}) {
  return normalize(
    schedule.docenteId ||
    schedule.docente_id ||
    schedule.teacher_record_id ||
    schedule.record_id ||
    schedule.dni_docente ||
    schedule.dni ||
    schedule.documento ||
    getScheduleTeacherName(schedule),
  )
}

function getScheduleCareerName(schedule = {}, planOptions = []) {
  const plan = findPlanForSchedule(planOptions, schedule)
  const rawCareer = clean(schedule.carrera || schedule.carrera_nombre || schedule.career_name || schedule.program_id)
  return clean(plan?.carrera || rawCareer)
}

function getScheduleDay(schedule = {}) {
  return clean(schedule.dia || schedule.day || schedule.diaSemana)
}

function getScheduleStart(schedule = {}) {
  return clean(schedule.inicio ?? schedule.hora_inicio ?? schedule.horaDesde ?? schedule.hora_desde ?? schedule.desde)
}

function getScheduleEnd(schedule = {}) {
  return clean(schedule.fin ?? schedule.hora_fin ?? schedule.horaHasta ?? schedule.hora_hasta ?? schedule.hasta)
}

function daySortValue(day = '') {
  const index = DAY_OPTIONS.findIndex((option) => sameText(option, day))
  return index >= 0 ? index : DAY_OPTIONS.length
}

function sortDays(days = []) {
  return [...days].sort((left, right) => (
    daySortValue(left) - daySortValue(right) ||
    clean(left).localeCompare(clean(right), 'es', { sensitivity: 'base' })
  ))
}

function buildScheduleDisplayRow(schedule = {}, planOptions = []) {
  const subjectId = clean(schedule.materia_codigo || schedule.codigo || schedule.materia || schedule.subject_id || schedule.nombreMateria)
  const subjectName = getScheduleSubjectName(schedule, planOptions)
  const careerName = getScheduleCareerName(schedule, planOptions)
  const day = getScheduleDay(schedule)
  const start = getScheduleStart(schedule)
  const end = getScheduleEnd(schedule)
  const timeRange = [start, end].filter(Boolean).join(' - ')
  const aula = clean(schedule.aula)

  return {
    key: clean(schedule.id) || [
      getScheduleTeacherKey(schedule),
      getSubjectAssignmentKey(subjectId, careerName, subjectName, careerName),
      normalize(day),
      start,
      end,
      normalize(aula),
    ].join('::'),
    schedule,
    subjectId,
    materia: subjectName || subjectId || '-',
    carrera: careerName || '-',
    dia: day || '-',
    inicio: start,
    fin: end,
    horario: timeRange || '-',
    aula: aula || '-',
    horasCatedra: readScheduleCatedraHours(schedule) ?? 0,
  }
}

function compareScheduleDisplayRows(left, right) {
  return daySortValue(left.dia) - daySortValue(right.dia) ||
    clean(left.inicio).localeCompare(clean(right.inicio), 'es', { sensitivity: 'base' }) ||
    clean(left.carrera).localeCompare(clean(right.carrera), 'es', { sensitivity: 'base' }) ||
    clean(left.materia).localeCompare(clean(right.materia), 'es', { sensitivity: 'base' })
}

function buildAvailabilitySummaryFromSchedules(horariosDocentes = [], planOptions = []) {
  const summaries = new Map()
  const allDays = new Set()

  asArray(horariosDocentes).forEach((schedule) => {
    const teacherName = getScheduleTeacherName(schedule)
    const teacherKey = getScheduleTeacherKey(schedule)
    if (!teacherName || !teacherKey) return

    const detail = buildScheduleDisplayRow(schedule, planOptions)
    const day = detail.dia === '-' ? '' : detail.dia
    const start = detail.inicio
    const end = detail.fin
    const career = detail.carrera === '-' ? '' : detail.carrera
    const subject = detail.materia === '-' ? '' : detail.materia
    const summary = summaries.get(teacherKey) ?? {
      key: teacherKey,
      docente: teacherName,
      dias: new Set(),
      franjas: new Map(),
      detalles: new Map(),
      carreras: new Set(),
      materias: new Set(),
      bloques: new Set(),
      totalHoras: 0,
    }

    if (day) {
      summary.dias.add(day)
      allDays.add(day)
    }
    if (career) summary.carreras.add(career)
    if (subject && subject !== '-') summary.materias.add(subject)

    const timeRange = [start, end].filter(Boolean).join(' - ')
    if (day && timeRange) {
      const rangeLabel = `${day} ${timeRange}`
      const rangeKey = [normalize(day), start, end].join('::')
      if (!summary.franjas.has(rangeKey)) summary.franjas.set(rangeKey, rangeLabel)
      if (!summary.bloques.has(rangeKey)) {
        summary.bloques.add(rangeKey)
        summary.totalHoras += readScheduleCatedraHours(schedule) ?? 0
      }
    }
    if (subject || career || day || detail.horario !== '-') {
      const detailKey = [
        normalize(subject),
        normalize(career),
        normalize(day),
        start,
        end,
        normalize(detail.aula),
      ].join('::')
      if (!summary.detalles.has(detailKey)) summary.detalles.set(detailKey, detail)
    }

    summaries.set(teacherKey, summary)
  })

  const rows = Array.from(summaries.values()).map((summary) => ({
    ...summary,
    dias: sortDays([...summary.dias]),
    franjas: [...summary.franjas.entries()]
      .sort((left, right) => {
        const [, leftLabel] = left
        const [, rightLabel] = right
        const [leftDay] = leftLabel.split(' ')
        const [rightDay] = rightLabel.split(' ')
        return daySortValue(leftDay) - daySortValue(rightDay) ||
          leftLabel.localeCompare(rightLabel, 'es', { sensitivity: 'base' })
      })
      .map(([, label]) => label),
    detalles: [...summary.detalles.values()].sort(compareScheduleDisplayRows),
    carreras: [...summary.carreras].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
    materias: [...summary.materias].sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
    bloques: summary.bloques.size,
  })).sort((left, right) => left.docente.localeCompare(right.docente, 'es', { sensitivity: 'base' }))

  return {
    rows,
    stats: {
      docentes: rows.length,
      dias: allDays.size,
      bloques: rows.reduce((total, row) => total + row.bloques, 0),
      horas: rows.reduce((total, row) => total + row.totalHoras, 0),
    },
  }
}

function filterAvailabilitySummaryRows(rows = [], { search = '', day = '' } = {}) {
  const normalizedSearch = normalize(search)
  const normalizedDay = normalize(day)

  return asArray(rows).filter((row) => {
    const matchesDay = !normalizedDay || row.dias.some((rowDay) => sameText(rowDay, day))
    if (!matchesDay) return false
    if (!normalizedSearch) return true

    return [
      row.docente,
      ...row.dias,
      ...row.franjas,
      ...row.carreras,
      ...row.materias,
      ...asArray(row.detalles).flatMap((detail) => [
        detail.materia,
        detail.carrera,
        detail.dia,
        detail.horario,
      ]),
    ].some((value) => normalize(value).includes(normalizedSearch))
  })
}

function summarizeAvailabilityRows(rows = []) {
  const days = new Set()
  let bloques = 0
  let horas = 0

  asArray(rows).forEach((row) => {
    row.dias.forEach((day) => days.add(normalize(day)))
    bloques += Number(row.bloques) || 0
    horas += Number(row.totalHoras) || 0
  })

  return {
    docentes: rows.length,
    dias: days.size,
    bloques,
    horas,
  }
}

function AvailabilityStatStrip({ stats }) {
  const items = [
    { label: 'Docentes', value: stats.docentes, tone: 'text-teal-700' },
    { label: 'Dias', value: stats.dias, tone: 'text-sky-700' },
    { label: 'Franjas', value: stats.bloques, tone: 'text-lime-700' },
    { label: 'Horas catedra', value: formatCatedraHours(stats.horas), tone: 'text-orange-700' },
  ]

  return (
    <dl className="grid divide-y divide-slate-200 border-y border-slate-200 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="px-4 py-3">
          <dt className={`text-xs font-extrabold uppercase tracking-[0.14em] ${item.tone}`}>{item.label}</dt>
          <dd className="mt-1 text-2xl font-extrabold text-slate-950">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function AvailabilityDayBadges({ days = [] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sortDays(days).map((day) => (
        <span key={day} className="inline-flex rounded-full bg-teal-50 px-2 py-1 text-xs font-extrabold text-teal-800">
          {day}
        </span>
      ))}
      {days.length === 0 && <span className="text-sm text-slate-500">-</span>}
    </div>
  )
}

function AvailabilityScheduleDetailList({ details = [] }) {
  const visibleDetails = asArray(details)

  if (!visibleDetails.length) return <span className="text-sm text-slate-500">-</span>

  return (
    <div className="grid gap-1.5 sm:grid-cols-2 2xl:grid-cols-3">
      {visibleDetails.map((detail) => (
        <div key={detail.key} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
          <p className="truncate text-xs font-extrabold text-slate-950" title={detail.materia}>{detail.materia}</p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-600" title={detail.carrera}>{detail.carrera}</p>
          <p className="mt-1 inline-flex max-w-full rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-teal-700">
            {[detail.dia, detail.horario].filter((value) => value && value !== '-').join(' ') || '-'}
          </p>
        </div>
      ))}
    </div>
  )
}

function getSubjectAssignmentKey(subjectId = '', programId = '', subjectName = '', careerName = '') {
  const subjectKey = normalize(subjectName || subjectId)
  const programKey = normalize(careerName || programId)
  return subjectKey || programKey ? `${subjectKey}::${programKey}` : ''
}

function buildScheduleSubjectRows(schedules = [], planOptions = []) {
  const rows = []
  const seen = new Set()

  schedules.forEach((schedule) => {
    const subjectId = clean(schedule.materia || schedule.materia_codigo || schedule.codigo || schedule.nombreMateria)
    const subjectName = getScheduleSubjectName(schedule, planOptions)
    const programId = getScheduleCareerName(schedule, planOptions)
    const key = getSubjectAssignmentKey(subjectId, programId, subjectName, programId)
    if (!key || seen.has(key)) return

    seen.add(key)
    rows.push({
      key: `schedule:${key}`,
      matchKey: key,
      materia: subjectName || subjectId || '-',
      subjectId: subjectId || subjectName,
      carrera: programId || '-',
      programId,
      role: '',
      source: 'schedule',
    })
  })

  return rows.sort((left, right) => (
    clean(left.carrera).localeCompare(clean(right.carrera), 'es', { sensitivity: 'base' }) ||
    clean(left.materia).localeCompare(clean(right.materia), 'es', { sensitivity: 'base' })
  ))
}

function buildModalSubjectCounterRows({ academicSummary = null, scheduleSubjectRows = [], teacher = null } = {}) {
  const rows = []
  const seen = new Set()

  function addRow(materia = '', carrera = '') {
    const key = getSubjectAssignmentKey('', '', materia, carrera)
    if (!key || seen.has(key)) return

    seen.add(key)
    rows.push({ materia: clean(materia), carrera: clean(carrera) })
  }

  asArray(scheduleSubjectRows).forEach((row) => {
    addRow(row.materia || row.subjectId, row.carrera || row.programId)
  })

  if (rows.length === 0) {
    asArray(academicSummary?.materiasDetalle).forEach((detail) => {
      addRow(detail.materia, detail.carrera)
    })
  }

  if (rows.length === 0) {
    asArray(academicSummary?.materias).forEach((materia) => addRow(materia, ''))
  }

  if (rows.length === 0) {
    asArray(teacher?.materias).forEach((materia) => addRow(materia, ''))
  }

  return rows
}

function sumUniqueScheduleCatedraHours(schedules = [], planOptions = []) {
  const seen = new Set()
  let total = 0

  schedules.forEach((schedule) => {
    const subjectId = clean(schedule.materia || schedule.materia_codigo || schedule.codigo || schedule.nombreMateria)
    const subjectName = getScheduleSubjectName(schedule, planOptions)
    const programId = getScheduleCareerName(schedule, planOptions)
    const subjectKey = getSubjectAssignmentKey(subjectId, programId, subjectName, programId)
    if (!subjectKey) return

    const key = [
      subjectKey,
      normalize(schedule.dia || schedule.day || schedule.diaSemana),
      normalize(schedule.inicio ?? schedule.hora_inicio ?? schedule.horaDesde ?? schedule.hora_desde ?? schedule.desde),
      normalize(schedule.fin ?? schedule.hora_fin ?? schedule.horaHasta ?? schedule.hora_hasta ?? schedule.hasta),
    ].join('::')

    if (seen.has(key)) return

    seen.add(key)
    total += readScheduleCatedraHours(schedule) ?? 0
  })

  return total
}

function buildTeacherAcademicOverview({ teacher = null, academicSummary = null, schedules = [], planOptions = [] } = {}) {
  const scheduleSubjectRows = buildScheduleSubjectRows(schedules, planOptions)
  const subjectRows = buildModalSubjectCounterRows({ academicSummary, scheduleSubjectRows, teacher })
  const careerKeys = new Set(subjectRows.map((row) => normalize(row.carrera)).filter(Boolean))
  const fallbackCareers = academicSummary?.carreras?.length ? academicSummary.carreras : getTeacherCareers(teacher)
  const fallbackCareerKeys = new Set(fallbackCareers.map(normalize).filter(Boolean))
  const scheduleHours = sumUniqueScheduleCatedraHours(schedules, planOptions)
  const explicitTeacherHours = getTeacherHours(teacher, academicSummary)
  const totalCatedraHours = academicSummary?.horasSource === 'horarios_docentes'
    ? scheduleHours
    : explicitTeacherHours && explicitTeacherHours > 0
      ? explicitTeacherHours
      : scheduleHours

  return {
    subjectRows,
    subjectCount: subjectRows.length,
    careerCount: careerKeys.size || fallbackCareerKeys.size,
    scheduleSubjectRows,
    totalCatedraHours,
  }
}

function buildAssignmentDisplayRows(assignments = [], scheduleSubjects = [], planOptions = []) {
  const rows = []
  const seen = new Set()

  assignments.forEach((assignment) => {
    const plan = findPlanBySubject(planOptions, assignment.subject_id, assignment.program_id)
    const subjectId = clean(assignment.subject_id)
    const programId = clean(assignment.program_id)
    const subjectName = clean(plan?.materia_nombre || assignment.subject_name || assignment.materia_nombre || subjectId)
    const careerName = clean(plan?.carrera || assignment.carrera || assignment.career_name || programId)
    const key = getSubjectAssignmentKey(subjectId, programId, subjectName, careerName)
    if (!key) return

    seen.add(key)
    rows.push({
      key: `assignment:${assignment.id || key}`,
      matchKey: key,
      id: assignment.id,
      assignment,
      materia: subjectName || '-',
      subjectId,
      carrera: careerName || '-',
      programId,
      role: normalizeSubjectRole(assignment.role),
      source: 'assignment',
    })
  })

  scheduleSubjects.forEach((subject) => {
    if (seen.has(subject.matchKey)) return
    rows.push(subject)
  })

  return rows.sort((left, right) => (
    clean(left.carrera).localeCompare(clean(right.carrera), 'es', { sensitivity: 'base' }) ||
    clean(left.materia).localeCompare(clean(right.materia), 'es', { sensitivity: 'base' })
  ))
}

function findSummaryForTeacher(teacher, summariesByKey = new Map(), summaries = []) {
  const direct = summariesByKey.get(getTeacherOptionKey(teacher))
  if (direct) return direct

  const teacherDni = normalize(teacher?.dni || teacher?.documento || teacher?.dni_docente)
  const teacherName = normalize(getTeacherFullName(teacher) || teacher?.nombre)

  return summaries.find((summary) => (
    (teacherDni && normalize(summary.key) === teacherDni) ||
    (teacherName && (
      normalize(summary.key) === teacherName ||
      normalize(summary.docente) === teacherName
    ))
  )) ?? null
}

function findTeacherForAvailabilityRow(row = {}, teachers = []) {
  const rowKey = normalize(row.key)
  const rowName = normalize(row.docente)

  return asArray(teachers).find((teacher) => {
    const teacherKey = normalize(getTeacherOptionKey(teacher))
    const teacherDni = normalize(teacher?.dni || teacher?.documento || teacher?.dni_docente)
    const teacherName = normalize(getTeacherFullName(teacher) || teacher?.nombre)

    return (
      (rowKey && (teacherKey === rowKey || teacherDni === rowKey)) ||
      (rowName && teacherName === rowName)
    )
  }) ?? null
}

function formatCatedraHours(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return '0'
  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(2).replace(/\.?0+$/, '')
}

function applyPlanToLoadDraft(draft, planOptions, planKey) {
  const plan = planOptions.find((option) => option.key === planKey)
  if (!plan) return { ...draft, plan: planKey }

  return {
    ...draft,
    plan: plan.key,
    carrera: plan.carrera,
    materia_codigo: plan.materia_codigo,
    materia_nombre: plan.materia_nombre,
    anio: plan.anio,
  }
}

function TeacherAdminTabs({ activeTab, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {TEACHER_ADMIN_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-extrabold transition ${
            activeTab === tab.key
              ? 'border-teal-700 bg-teal-700 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-teal-200'
          }`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function TeacherSectionFilterBar({
  careerFilter,
  careerOptions = [],
  displayedCount = 0,
  filteredCount = 0,
  onCareerFilterChange,
  onLimitChange,
  onSearchChange,
  searchQuery,
  totalCount = 0,
  visibleLimit,
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[1fr_minmax(220px,280px)_minmax(150px,180px)]">
        <label className="block">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Search className="h-4 w-4 text-slate-500" />
            Buscar docente
          </span>
          <input
            type="search"
            className="input-base mt-2"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Nombre, apellido, DNI, telefono o materia"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Carrera</span>
          <select
            className="input-base mt-2"
            value={careerFilter}
            onChange={(event) => onCareerFilterChange(event.target.value)}
            disabled={careerOptions.length === 0}
          >
            <option value="">Todas las carreras</option>
            {careerOptions.map((career) => (
              <option key={career} value={career}>{career}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">Mostrar</span>
          <select
            className="input-base mt-2"
            value={visibleLimit}
            onChange={(event) => onLimitChange(event.target.value)}
          >
            {ROSTER_VISIBLE_LIMIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <p className="text-sm font-semibold text-slate-700">
          {displayedCount} de {filteredCount} docentes en filtro
        </p>
        <p className="text-sm text-slate-500">Total padron: {totalCount}</p>
      </div>
    </div>
  )
}

function TeacherBaseDataDiagnosticPanel({
  diagnostics,
}) {
  const missingEffective = diagnostics.missingEffectiveTitularSubjects
  const manualExamSubjects = diagnostics.manualExamSubjects ?? []
  const hasUsableTeacherSource = diagnostics.source !== 'missing'
  const sourceLabel = diagnostics.hasStructuredTeacherSource
    ? 'Datos organizados por carga horaria y disponibilidad'
    : diagnostics.hasLegacyTeacherScheduleSource
      ? 'Datos tomados de horarios docentes'
      : 'Falta fuente docente'
  const sourceDescription = diagnostics.hasStructuredTeacherSource
    ? 'La app usa las secciones de carga horaria y disponibilidad.'
    : diagnostics.hasLegacyTeacherScheduleSource
      ? 'La app usa los dias, materias y docentes cargados en horarios docentes.'
      : 'Carga horarios docentes o completa carga horaria y disponibilidad.'

  return (
    <section className="space-y-4" aria-label="Diagnostico de datos base docentes">
      <div className={`rounded-md border p-4 ${
        hasUsableTeacherSource
          ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
          : 'border-amber-200 bg-amber-50 text-amber-950'
      }`}>
        <p className="text-xs font-extrabold uppercase tracking-[0.14em]">Fuente docente activa</p>
        <p className="mt-1 text-lg font-extrabold">{sourceLabel}</p>
        <p className="mt-1 text-sm">{sourceDescription}</p>
      </div>

      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
        Carrera analizada: {diagnostics.career || 'Todas las carreras'}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="border-l-2 border-l-teal-500 pl-3">
          <p className="text-xs font-bold uppercase text-slate-500">Horarios docentes</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-950">{diagnostics.counts.scheduleRecords}</p>
          <p className="text-xs text-slate-600">Filas leidas</p>
        </div>
        <div className="border-l-2 border-l-sky-500 pl-3">
          <p className="text-xs font-bold uppercase text-slate-500">Docentes detectados</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-950">{diagnostics.counts.effectiveTeachers}</p>
          <p className="text-xs text-slate-600">Desde la fuente activa</p>
        </div>
        <div className="border-l-2 border-l-lime-500 pl-3">
          <p className="text-xs font-bold uppercase text-slate-500">Titularidades detectadas</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-950">{diagnostics.counts.effectiveTitularRecords}</p>
          <p className="text-xs text-slate-600">Materia con docente titular</p>
        </div>
        <div className="border-l-2 border-l-amber-500 pl-3">
          <p className="text-xs font-bold uppercase text-slate-500">Materias a revisar</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-950">{diagnostics.counts.missingEffectiveTitularSubjects}</p>
          <p className="text-xs text-slate-600">Sin coincidencia plan/docente</p>
        </div>
        <div className="border-l-2 border-l-rose-500 pl-3">
          <p className="text-xs font-bold uppercase text-slate-500">Docentes sin dia/franja</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-950">{diagnostics.counts.teachersWithoutAvailability}</p>
        </div>
        <div className="border-l-2 border-l-violet-500 pl-3">
          <p className="text-xs font-bold uppercase text-slate-500">Fechas bloqueadas</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-950">{diagnostics.counts.blockedDates}</p>
        </div>
        <div className="border-l-2 border-l-slate-400 pl-3">
          <p className="text-xs font-bold uppercase text-slate-500">Materias del alcance</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-950">{diagnostics.counts.plansInScope}</p>
        </div>
      </div>

      {manualExamSubjects.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-extrabold text-slate-950">Fuera del analisis automatico: Geografia 1, 2 y 3</p>
          <p className="mt-1">
            Esas materias pertenecen a una carrera cerrada y quedan para mesas manuales. No se cuentan en el alcance ni en el cruce de titularidades.
          </p>
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-extrabold text-slate-950">
          Materias del plan a revisar ({missingEffective.length})
        </h4>
        {missingEffective.length > 0 && (
          <p className="mt-2 text-sm text-slate-600">
            Son materias del plan que no encontraron una coincidencia por codigo o nombre en docentes_materias ni en horarios docentes. No significa que no tengan titular: puede faltar el codigo, estar escrito distinto o venir con otra carrera.
          </p>
        )}
        {missingEffective.length ? (
          <ul className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            {missingEffective.map((subject) => (
              <li key={`${subject.carrera}-${subject.materia}-${subject.nombre}`} className="border-l-2 border-l-amber-400 pl-3">
                <strong>{subject.materia || subject.nombre}</strong>
                {subject.nombre && subject.nombre !== subject.materia ? ` - ${subject.nombre}` : ''}
                {subject.anio ? ` (${subject.anio} ano)` : ''}
                {subject.carrera ? <span className="block text-xs text-slate-500">{subject.carrera}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-emerald-700">Todas las materias del alcance cruzan con docentes_materias u horarios.</p>
        )}
      </div>

    </section>
  )
}

function AvailabilityAdminPanel({
  canEditWorkspace,
  displayLimit = 'all',
  disponibilidadDocente = [],
  horariosDocentes = [],
  manualTotalCount = disponibilidadDocente.length,
  onSelectTeacher,
  onCreateAvailability,
  onDeleteAvailability,
  onUpdateAvailability,
  planOptions = [],
  teachers = [],
  teacherOptions = [],
}) {
  const [draft, setDraft] = useState(createEmptyAvailabilityDraft())
  const [editingId, setEditingId] = useState('')
  const [summaryDay, setSummaryDay] = useState('')
  const scheduleAvailability = useMemo(
    () => buildAvailabilitySummaryFromSchedules(horariosDocentes, planOptions),
    [horariosDocentes, planOptions],
  )
  const summaryDayOptions = useMemo(
    () => sortDays([...new Set(scheduleAvailability.rows.flatMap((row) => row.dias))]),
    [scheduleAvailability.rows],
  )
  const visibleScheduleAvailabilityRows = useMemo(
    () => filterAvailabilitySummaryRows(scheduleAvailability.rows, {
      day: summaryDay,
    }),
    [scheduleAvailability.rows, summaryDay],
  )
  const scheduleAvailabilityRowsToDisplay = useMemo(
    () => applyDisplayLimit(visibleScheduleAvailabilityRows, displayLimit),
    [visibleScheduleAvailabilityRows, displayLimit],
  )
  const visibleScheduleAvailabilityStats = useMemo(
    () => summarizeAvailabilityRows(scheduleAvailabilityRowsToDisplay),
    [scheduleAvailabilityRowsToDisplay],
  )

  const updateDraft = (field) => (event) => {
    const value = field === 'disponible_mesa' ? event.target.checked : event.target.value
    setDraft((current) => ({ ...current, [field]: value }))
  }
  const validation = validateAvailabilityDraft(draft)

  function resetForm() {
    setDraft(createEmptyAvailabilityDraft())
    setEditingId('')
  }

  function submit() {
    const saved = editingId
      ? onUpdateAvailability?.(editingId, draft)
      : onCreateAvailability?.(draft)

    if (saved !== false) resetForm()
  }

  function startEdit(row, index) {
    setEditingId(getRowId(row, index, 'availability'))
    setDraft({
      ...createEmptyAvailabilityDraft(),
      ...row,
      docente: clean(row.docente || row.profesor),
      hora_desde: clean(row.hora_desde || row.horaDesde || row.inicio || row.desde),
      hora_hasta: clean(row.hora_hasta || row.horaHasta || row.fin || row.hasta),
      disponible_mesa: row.disponible_mesa !== false,
      observaciones: clean(row.observaciones || row.motivo_no_disponible),
    })
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_minmax(180px,220px)] lg:items-end">
          <div>
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-teal-700" />
              <h4 className="font-extrabold text-slate-950">Resumen desde horarios docentes</h4>
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Dia</span>
            <select
              className="input-base mt-2"
              value={summaryDay}
              onChange={(event) => setSummaryDay(event.target.value)}
              disabled={summaryDayOptions.length === 0}
            >
              <option value="">Todos los dias</option>
              {summaryDayOptions.map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4">
          <AvailabilityStatStrip stats={visibleScheduleAvailabilityStats} />
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[1040px] table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Docente</th>
                <th className="px-4 py-3">Dias en instituto</th>
                <th className="px-4 py-3">Horarios por materia</th>
                <th className="px-4 py-3">Horas catedra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {scheduleAvailabilityRowsToDisplay.map((row) => {
                const teacherForDetail = findTeacherForAvailabilityRow(row, teachers)

                return (
                  <tr key={row.key}>
                    <td className="break-words px-4 py-3 align-top">
                      {teacherForDetail && onSelectTeacher ? (
                        <button
                          type="button"
                          className="text-left font-extrabold text-slate-950 underline-offset-4 hover:text-teal-700 hover:underline"
                          onClick={() => onSelectTeacher(teacherForDetail)}
                          aria-label={`Ver detalle de ${row.docente}`}
                        >
                          {row.docente}
                        </button>
                      ) : (
                        <p className="font-extrabold text-slate-950">{row.docente}</p>
                      )}
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {row.materias.length} materias / {row.carreras.length} carreras
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <AvailabilityDayBadges days={row.dias} />
                    </td>
                    <td className="break-words px-4 py-3 align-top text-slate-700">
                      <AvailabilityScheduleDetailList details={row.detalles} />
                    </td>
                    <td className="px-4 py-3 align-top font-semibold text-slate-700">{formatCatedraHours(row.totalHoras)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {scheduleAvailability.rows.length === 0 && (
            <div className="p-6 text-sm text-slate-500">No hay horarios docentes cargados para resumir disponibilidad.</div>
          )}
          {scheduleAvailability.rows.length > 0 && visibleScheduleAvailabilityRows.length === 0 && (
            <div className="p-6 text-sm text-slate-500">No se encontraron horarios docentes con esos filtros.</div>
          )}
          {visibleScheduleAvailabilityRows.length > 0 && scheduleAvailabilityRowsToDisplay.length === 0 && (
            <div className="p-6 text-sm font-semibold text-slate-500">
              La grilla esta oculta. Elegi 5, 10, 20 o todos para mostrar docentes.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-teal-700" />
          <h4 className="font-extrabold text-slate-950">Disponibilidad manual</h4>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Docente</span>
            <input className="input-base mt-2" list="teacher-options" value={draft.docente} onChange={updateDraft('docente')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Dia</span>
            <select className="input-base mt-2" value={draft.dia} onChange={updateDraft('dia')} disabled={!canEditWorkspace}>
              <option value="">Seleccionar</option>
              {DAY_OPTIONS.map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Turno</span>
            <select className="input-base mt-2" value={draft.turno} onChange={updateDraft('turno')} disabled={!canEditWorkspace}>
              {TURN_OPTIONS.map((turn) => <option key={turn} value={turn}>{turn}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Estado</span>
            <select className="input-base mt-2" value={draft.estado} onChange={updateDraft('estado')} disabled={!canEditWorkspace}>
              <option value="activo">Activo</option>
              <option value="licencia">Licencia</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Hora desde</span>
            <input className="input-base mt-2" type="time" value={draft.hora_desde} onChange={updateDraft('hora_desde')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Hora hasta</span>
            <input className="input-base mt-2" type="time" value={draft.hora_hasta} onChange={updateDraft('hora_hasta')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Vigencia desde</span>
            <input className="input-base mt-2" type="date" value={draft.vigencia_desde} onChange={updateDraft('vigencia_desde')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Vigencia hasta</span>
            <input className="input-base mt-2" type="date" value={draft.vigencia_hasta} onChange={updateDraft('vigencia_hasta')} disabled={!canEditWorkspace} />
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={draft.disponible_mesa} onChange={updateDraft('disponible_mesa')} disabled={!canEditWorkspace} />
            Disponible para mesa
          </label>
          <label className="block xl:col-span-3">
            <span className="text-sm font-semibold text-slate-700">Motivo u observacion</span>
            <input className="input-base mt-2" value={draft.observaciones} onChange={updateDraft('observaciones')} disabled={!canEditWorkspace} />
          </label>
        </div>
        {!validation.ok && <p className="mt-3 text-sm font-semibold text-amber-700">{validation.error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {editingId && <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar</button>}
          <button type="button" className="btn-primary" onClick={submit} disabled={!canEditWorkspace || !validation.ok}>
            {editingId ? 'Actualizar disponibilidad' : 'Agregar disponibilidad'}
          </button>
        </div>
      </section>

      <datalist id="teacher-options">
        {teacherOptions.map((teacher) => <option key={teacher} value={teacher} />)}
      </datalist>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[900px] table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Docente</th>
              <th className="px-4 py-3">Dia</th>
              <th className="px-4 py-3">Turno</th>
              <th className="px-4 py-3">Franja</th>
              <th className="px-4 py-3">Disponible</th>
              <th className="px-4 py-3">Observacion</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {disponibilidadDocente.map((row, index) => (
              <tr key={getRowId(row, index, 'availability')}>
                <td className="break-words px-4 py-3 font-semibold text-slate-950">{row.docente || row.profesor || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{row.dia || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{row.turno || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{[row.hora_desde || row.inicio, row.hora_hasta || row.fin].filter(Boolean).join(' - ') || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{row.disponible_mesa === false ? 'No' : 'Si'}</td>
                <td className="break-words px-4 py-3 text-slate-700">{row.observaciones || row.motivo_no_disponible || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn-secondary px-3 py-2" onClick={() => startEdit(row, index)} disabled={!canEditWorkspace} title="Editar disponibilidad">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="btn-secondary px-3 py-2 text-red-700" onClick={() => onDeleteAvailability?.(getRowId(row, index, 'availability'))} disabled={!canEditWorkspace} title="Borrar disponibilidad">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {disponibilidadDocente.length === 0 && (
          <div className="p-6 text-sm text-slate-500">
            {manualTotalCount > 0
              ? 'La grilla esta oculta. Elegi 5, 10, 20 o todos para mostrar disponibilidad.'
              : 'No hay disponibilidad docente cargada.'}
          </div>
        )}
      </div>
    </div>
  )
}

function TeacherBlockedDatesAdminPanel({
  canEditWorkspace,
  fechasBloqueadasDocente = [],
  totalRowsCount = fechasBloqueadasDocente.length,
  onCreateBlockedDate,
  onDeleteBlockedDate,
  onUpdateBlockedDate,
  teacherOptions = [],
}) {
  const [draft, setDraft] = useState(createEmptyTeacherBlockedDateDraft())
  const [editingId, setEditingId] = useState('')
  const validation = validateTeacherBlockedDateDraft(draft)

  function updateDraft(field) {
    return (event) => setDraft((current) => ({ ...current, [field]: event.target.value }))
  }

  function resetForm() {
    setDraft(createEmptyTeacherBlockedDateDraft())
    setEditingId('')
  }

  function submit() {
    const saved = editingId
      ? onUpdateBlockedDate?.(editingId, draft)
      : onCreateBlockedDate?.(draft)
    if (saved !== false) resetForm()
  }

  function startEdit(row, index) {
    setEditingId(getRowId(row, index, 'teacher-block'))
    setDraft({
      ...createEmptyTeacherBlockedDateDraft(),
      ...row,
      docenteNombre: clean(row.docenteNombre || row.docente || row.profesor),
      date: clean(row.date || row.fecha),
      startTime: clean(row.startTime || row.horaDesde || row.hora_desde),
      endTime: clean(row.endTime || row.horaHasta || row.hora_hasta),
      scope: clean(row.scope).toUpperCase() || TEACHER_BLOCK_SCOPE.FULL_DAY,
      reason: clean(row.reason || row.motivo || row.observaciones),
      status: clean(row.status || row.estado).toUpperCase() || 'ACTIVE',
    })
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <CalendarX2 className="h-4 w-4 text-red-700" />
          <h4 className="font-extrabold text-slate-950">Fechas bloqueadas de docentes</h4>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Docente</span>
            <input className="input-base mt-2" list="blocked-teacher-options" value={draft.docenteNombre} onChange={updateDraft('docenteNombre')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Fecha</span>
            <input className="input-base mt-2" type="date" value={draft.date} onChange={updateDraft('date')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Alcance</span>
            <select className="input-base mt-2" value={draft.scope} onChange={updateDraft('scope')} disabled={!canEditWorkspace}>
              <option value="FULL_DAY">Dia completo</option>
              <option value="TIME_RANGE">Franja horaria</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Estado</span>
            <select className="input-base mt-2" value={draft.status} onChange={updateDraft('status')} disabled={!canEditWorkspace}>
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
          </label>
          {draft.scope === TEACHER_BLOCK_SCOPE.TIME_RANGE && (
            <>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Hora desde</span>
                <input className="input-base mt-2" type="time" value={draft.startTime} onChange={updateDraft('startTime')} disabled={!canEditWorkspace} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Hora hasta</span>
                <input className="input-base mt-2" type="time" value={draft.endTime} onChange={updateDraft('endTime')} disabled={!canEditWorkspace} />
              </label>
            </>
          )}
          <label className="block xl:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Motivo</span>
            <input className="input-base mt-2" value={draft.reason} onChange={updateDraft('reason')} disabled={!canEditWorkspace} />
          </label>
        </div>
        {!validation.ok && <p className="mt-3 text-sm font-semibold text-amber-700">{validation.error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {editingId && <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar</button>}
          <button type="button" className="btn-primary" onClick={submit} disabled={!canEditWorkspace || !validation.ok}>
            {editingId ? 'Actualizar bloqueo' : 'Agregar bloqueo'}
          </button>
        </div>
      </section>

      <datalist id="blocked-teacher-options">
        {teacherOptions.map((teacher) => <option key={teacher} value={teacher} />)}
      </datalist>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[900px] table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Docente</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Alcance</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {fechasBloqueadasDocente.map((row, index) => (
              <tr key={getRowId(row, index, 'teacher-block')}>
                <td className="break-words px-4 py-3 font-semibold text-slate-950">{row.docenteNombre || row.docente || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{row.date || row.fecha || '-'}</td>
                <td className="px-4 py-3 text-slate-700">
                  {row.scope === 'TIME_RANGE' ? `${row.startTime || '-'} - ${row.endTime || '-'}` : 'Dia completo'}
                </td>
                <td className="break-words px-4 py-3 text-slate-700">{row.reason || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{row.status || 'ACTIVE'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn-secondary px-3 py-2" onClick={() => startEdit(row, index)} disabled={!canEditWorkspace} title="Editar bloqueo">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="btn-secondary px-3 py-2 text-red-700" onClick={() => onDeleteBlockedDate?.(getRowId(row, index, 'teacher-block'))} disabled={!canEditWorkspace} title="Borrar bloqueo">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fechasBloqueadasDocente.length === 0 && (
          <div className="p-6 text-sm text-slate-500">
            {totalRowsCount > 0
              ? 'La grilla esta oculta. Elegi 5, 10, 20 o todos para mostrar bloqueos.'
              : 'No hay fechas bloqueadas cargadas.'}
          </div>
        )}
      </div>
    </div>
  )
}

function LoadAdminPanel({
  canEditWorkspace,
  cargaHorariaDocente = [],
  careerOptions = [],
  onCreateLoad,
  onDeleteLoad,
  onGenerateLoadsFromSchedules,
  onUpdateLoad,
  planOptions = [],
  scheduleCount = 0,
  teacherOptions = [],
  totalRowsCount = cargaHorariaDocente.length,
}) {
  const [draft, setDraft] = useState(createEmptyLoadDraft())
  const [editingId, setEditingId] = useState('')

  const updateDraft = (field) => (event) => {
    const value = event.target.value
    setDraft((current) => (
      field === 'plan'
        ? applyPlanToLoadDraft(current, planOptions, value)
        : { ...current, [field]: value }
    ))
  }
  const validation = validateLoadDraft(draft)

  function resetForm() {
    setDraft(createEmptyLoadDraft())
    setEditingId('')
  }

  function submit() {
    const saved = editingId
      ? onUpdateLoad?.(editingId, draft)
      : onCreateLoad?.(draft)

    if (saved !== false) resetForm()
  }

  function startEdit(row, index) {
    setEditingId(getRowId(row, index, 'load'))
    setDraft({
      ...createEmptyLoadDraft(),
      ...row,
      docente: clean(row.docente || row.profesor),
      materia_codigo: clean(row.materia_codigo || row.materiaCodigo || row.materia || row.codigo),
      materia_nombre: clean(row.materia_nombre || row.materiaNombre || row.nombreMateria || row.nombre),
      horasCatedra: clean(row.horasCatedra || row.horas_catedra || row.teachingHours),
    })
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-teal-700" />
            <h4 className="font-extrabold text-slate-950">Carga horaria por carrera y materia</h4>
          </div>
          <button
            type="button"
            className="btn-secondary border-teal-200 text-teal-800 hover:bg-teal-50"
            onClick={onGenerateLoadsFromSchedules}
            disabled={!canEditWorkspace || !scheduleCount || !onGenerateLoadsFromSchedules}
          >
            <Clock3 className="h-4 w-4" />
            Generar desde horarios
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Las horas se calculan como horas catedra de 40 minutos y se agrupan por docente, carrera y materia.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Docente</span>
            <input className="input-base mt-2" list="teacher-options" value={draft.docente} onChange={updateDraft('docente')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Plan / materia</span>
            <select className="input-base mt-2" value={draft.plan} onChange={updateDraft('plan')} disabled={!canEditWorkspace || planOptions.length === 0}>
              <option value="">Carga manual</option>
              {planOptions.map((plan) => <option key={plan.key} value={plan.key}>{plan.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Carrera</span>
            <input className="input-base mt-2" list="career-options" value={draft.carrera} onChange={updateDraft('carrera')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Anio/curso</span>
            <input className="input-base mt-2" value={draft.anio} onChange={updateDraft('anio')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Codigo materia</span>
            <input className="input-base mt-2" value={draft.materia_codigo} onChange={updateDraft('materia_codigo')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Materia</span>
            <input className="input-base mt-2" value={draft.materia_nombre} onChange={updateDraft('materia_nombre')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Horas catedra</span>
            <input className="input-base mt-2" type="number" min="0" step="0.5" value={draft.horasCatedra} onChange={updateDraft('horasCatedra')} disabled={!canEditWorkspace} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Rol</span>
            <select className="input-base mt-2" value={draft.rol_en_materia} onChange={updateDraft('rol_en_materia')} disabled={!canEditWorkspace}>
              {LOAD_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Estado</span>
            <select className="input-base mt-2" value={draft.estado_asignacion} onChange={updateDraft('estado_asignacion')} disabled={!canEditWorkspace}>
              {LOAD_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="block xl:col-span-3">
            <span className="text-sm font-semibold text-slate-700">Observaciones</span>
            <input className="input-base mt-2" value={draft.observaciones} onChange={updateDraft('observaciones')} disabled={!canEditWorkspace} />
          </label>
        </div>
        {!validation.ok && <p className="mt-3 text-sm font-semibold text-amber-700">{validation.error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {editingId && <button type="button" className="btn-secondary" onClick={resetForm}>Cancelar</button>}
          <button type="button" className="btn-primary" onClick={submit} disabled={!canEditWorkspace || !validation.ok}>
            {editingId ? 'Actualizar carga horaria' : 'Agregar carga horaria'}
          </button>
        </div>
      </section>

      <datalist id="teacher-options">
        {teacherOptions.map((teacher) => <option key={teacher} value={teacher} />)}
      </datalist>

      <datalist id="career-options">
        {careerOptions.map((career) => <option key={career} value={career} />)}
      </datalist>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[980px] table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Docente</th>
              <th className="px-4 py-3">Carrera</th>
              <th className="px-4 py-3">Materia</th>
              <th className="px-4 py-3">Anio</th>
              <th className="px-4 py-3">Horas catedra</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {cargaHorariaDocente.map((row, index) => (
              <tr key={getRowId(row, index, 'load')}>
                <td className="break-words px-4 py-3 font-semibold text-slate-950">{row.docente || row.profesor || '-'}</td>
                <td className="break-words px-4 py-3 text-slate-700">{row.carrera || '-'}</td>
                <td className="break-words px-4 py-3 text-slate-700">{row.materia_nombre || row.materia || row.materia_codigo || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{row.anio || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{row.horasCatedra ?? row.horas_catedra ?? '-'}</td>
                <td className="px-4 py-3 text-slate-700">{row.rol_en_materia || '-'}</td>
                <td className="px-4 py-3 text-slate-700">{row.estado_asignacion || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn-secondary px-3 py-2" onClick={() => startEdit(row, index)} disabled={!canEditWorkspace} title="Editar carga horaria">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" className="btn-secondary px-3 py-2 text-red-700" onClick={() => onDeleteLoad?.(getRowId(row, index, 'load'))} disabled={!canEditWorkspace} title="Borrar carga horaria">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cargaHorariaDocente.length === 0 && (
          <div className="p-6 text-sm text-slate-500">
            {totalRowsCount > 0
              ? 'La grilla esta oculta. Elegi 5, 10, 20 o todos para mostrar cargas horarias.'
              : 'No hay carga horaria docente cargada.'}
          </div>
        )}
      </div>
    </div>
  )
}

function TeacherEditModal({
  careerOptions = [],
  form,
  isOpen,
  mode = 'edit',
  onChange,
  onClose,
  onSubmit,
}) {
  if (!isOpen) return null
  const isCreating = mode === 'create'
  const availableCareerOptions = Array.from(new Set([
    ...careerOptions,
    ...getCareerValues(form),
  ]))
    .sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' }))

  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
      <section className="modal-surface w-full max-w-2xl border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase text-teal-700">
              {isCreating ? 'Nuevo docente' : 'Editar docente'}
            </p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-950">Datos personales</h3>
            <p className="mt-2 text-sm text-slate-600">Las materias se toman de las planillas; las horas son catedra declaradas, no horas reloj.</p>
          </div>
          <button type="button" className="btn-secondary px-3 py-2" onClick={onClose} title="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Nombre</span>
            <input className="input-base mt-2" value={form.nombre} onChange={onChange('nombre')} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Apellido</span>
            <input className="input-base mt-2" value={form.apellido} onChange={onChange('apellido')} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">DNI</span>
            <input className="input-base mt-2" value={form.dni} onChange={onChange('dni')} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Telefono</span>
            <input className="input-base mt-2" value={form.telefono} onChange={onChange('telefono')} />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Carreras</span>
            <div className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
              {availableCareerOptions.map((career) => (
                <label key={career} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.carreras.includes(career)}
                    onChange={onChange('carreras', career)}
                  />
                  <span>{career}</span>
                </label>
              ))}
              {availableCareerOptions.length === 0 && (
                <p className="text-xs text-amber-700">
                  Carga primero una planilla con carreras para habilitar el alta consistente.
                </p>
              )}
            </div>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">Estado</span>
            <select className="input-base mt-2" value={form.estado} onChange={onChange('estado')}>
              <option value="activo">Activo</option>
              <option value="licencia">Licencia</option>
              <option value="renuncia">Renuncia</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={onSubmit}>
            {isCreating ? 'Crear docente' : 'Guardar cambios'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function TeacherSubjectAssignmentsPanel({
  activeInstitution,
  canEditWorkspace = false,
  planesEstudio = [],
  scheduleSubjects = [],
  teacher,
  teachers = [],
  workspaceKey = 'main',
}) {
  const [teacherId, setTeacherId] = useState('')
  const [resolveError, setResolveError] = useState('')
  const [assignments, setAssignments] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [draft, setDraft] = useState({ plan: '', role: 'titular' })
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [leaveDraft, setLeaveDraft] = useState(null)

  const institutionId = activeInstitution?.id ?? null
  const teacherEmail = getTeacherEmail(teacher) || buildTeacherLoginEmail({ dni: teacher?.dni, institutionId }) || ''
  const planOptions = useMemo(() => buildPlanOptions(planesEstudio), [planesEstudio])
  const displayRows = useMemo(
    () => buildAssignmentDisplayRows(assignments, scheduleSubjects, planOptions),
    [assignments, scheduleSubjects, planOptions],
  )

  useEffect(() => {
    let cancelled = false

    async function resolveAndLoad() {
      setResolveError('')
      setAssignments([])
      setTeacherId('')

      if (!institutionId || !teacherEmail) return

      setIsLoading(true)
      try {
        const resolved = await resolveTeacherProfile({ institutionId, workspaceKey, email: teacherEmail })
        if (cancelled) return

        if (!resolved.success) {
          setResolveError(resolved.error)
          return
        }

        setTeacherId(resolved.profile.user_id)
        const rows = await fetchSubjectTeacherAssignmentsForTeacher({
          institutionId,
          workspaceKey,
          teacherId: resolved.profile.user_id,
        })
        if (!cancelled) setAssignments(rows)
      } catch (loadError) {
        if (!cancelled) setResolveError(loadError.message)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    resolveAndLoad()

    return () => {
      cancelled = true
    }
  }, [institutionId, workspaceKey, teacherEmail])

  const selectedPlan = planOptions.find((option) => option.key === draft.plan)
  const canSubmit = Boolean(teacherId && selectedPlan)

  async function addAssignment() {
    setError('')

    if (!teacherId) {
      setError('No se pudo identificar el usuario del docente. Verifica que tenga acceso al portal.')
      return
    }
    if (!selectedPlan) {
      setError('Selecciona una materia.')
      return
    }

    setIsSaving(true)
    try {
      const selectedRole = draft.role
      const created = await createSubjectTeacherAssignment({
        institutionId,
        workspaceKey,
        subjectId: selectedPlan.materia_codigo,
        programId: selectedPlan.carrera,
        teacherId,
        teacherRecordId: teacher.record_id ?? teacher.profile?.record_id ?? null,
        role: selectedRole === 'licencia' ? 'titular' : selectedRole,
      })

      if (!created.success) {
        setError(created.error)
        return
      }

      setAssignments((current) => [created.data, ...current])
      setDraft({ plan: '', role: 'titular' })
      if (selectedRole === 'licencia') openLeave([created.data.id])
    } finally {
      setIsSaving(false)
    }
  }

  function openLeave(assignmentIds) {
    setError('')
    setLeaveDraft({
      assignmentIds,
      replacementKey: '',
      startsOn: new Date().toISOString().slice(0, 10),
      endsOn: '',
      notes: '',
    })
  }

  async function changeRole(assignmentId, role) {
    if (role === 'licencia') {
      openLeave([assignmentId])
      return
    }
    const result = await updateTeacherAssignmentCondition(assignmentId, role)
    if (!result.success) {
      setError(result.error)
      return
    }
    setAssignments((current) => current.map((assignment) => (
      assignment.id === assignmentId ? { ...assignment, role } : assignment
    )))
  }

  async function defineScheduleRole(row, role) {
    if (!role) return
    if (!teacherId) {
      setError('No se pudo identificar el usuario del docente. Verifica que tenga acceso al portal.')
      return
    }

    setError('')
    setIsSaving(true)
    try {
      const created = await createSubjectTeacherAssignment({
        institutionId,
        workspaceKey,
        subjectId: row.subjectId,
        programId: row.programId === '-' ? '' : row.programId,
        teacherId,
        teacherRecordId: teacher.record_id ?? teacher.profile?.record_id ?? null,
        role: role === 'licencia' ? 'titular' : role,
      })
      if (!created.success) {
        setError(created.error)
        return
      }

      setAssignments((current) => [created.data, ...current])
      if (role === 'licencia') openLeave([created.data.id])
    } finally {
      setIsSaving(false)
    }
  }

  const replacementOptions = teachers
    .filter((candidate) => candidate !== teacher && clean(candidate?.dni) !== clean(teacher?.dni))
    .map((candidate) => ({
      key: clean(candidate?.id || candidate?.record_id || candidate?.dni || getTeacherFullName(candidate)),
      teacher: candidate,
      label: getTeacherFullName(candidate) || candidate?.nombre || candidate?.dni,
    }))
    .filter((option) => option.key)
    .sort((left, right) => left.label.localeCompare(right.label, 'es', { sensitivity: 'base' }))

  async function submitLeave() {
    const replacement = replacementOptions.find((option) => option.key === leaveDraft?.replacementKey)?.teacher
    if (!replacement) {
      setError('Selecciona el docente que tomara el reemplazo.')
      return
    }

    const replacementEmail = getTeacherEmail(replacement)
      || buildTeacherLoginEmail({ dni: replacement?.dni, institutionId })
      || ''
    setIsSaving(true)
    try {
      const resolved = await resolveTeacherProfile({ institutionId, workspaceKey, email: replacementEmail })
      if (!resolved.success) {
        setError(resolved.error)
        return
      }

      const result = await createTeacherSubjectLeave({
        institutionId,
        workspaceKey,
        assignmentIds: leaveDraft.assignmentIds,
        replacementTeacherId: resolved.profile.user_id,
        replacementTeacherRecordId: replacement.record_id ?? replacement.profile?.record_id ?? null,
        startsOn: leaveDraft.startsOn,
        endsOn: leaveDraft.endsOn,
        notes: leaveDraft.notes,
      })
      if (!result.success) {
        setError(result.error)
        return
      }

      const refreshedAssignments = await fetchSubjectTeacherAssignmentsForTeacher({
        institutionId,
        workspaceKey,
        teacherId,
      })
      setAssignments(refreshedAssignments)
      setLeaveDraft(null)
    } finally {
      setIsSaving(false)
    }
  }

  async function removeAssignment(assignmentId) {
    const result = await deactivateSubjectTeacherAssignment(assignmentId)
    if (!result.success) {
      setError(result.error)
      return
    }
    setAssignments((current) => current.filter((assignment) => assignment.id !== assignmentId))
  }

  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <BookOpenCheck className="h-4 w-4 text-teal-700" />
        <h4 className="font-extrabold text-slate-950">Materias asignadas</h4>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Elegi las materias del docente y su condicion. Habilita al docente a cargar asistencia y notas desde su portal.
      </p>

      {!teacherEmail && (
        <p className="mt-3 text-sm font-semibold text-amber-700">
          Este docente no tiene DNI cargado, asi que no se le puede resolver el acceso para asignarle materias.
        </p>
      )}
      {resolveError && <p className="mt-3 text-sm font-semibold text-amber-700">{resolveError}</p>}

      {teacherEmail && !resolveError && (
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <select className="input-base" value={draft.plan} onChange={(event) => setDraft((current) => ({ ...current, plan: event.target.value }))} disabled={!canEditWorkspace || planOptions.length === 0}>
              <option value="">Seleccionar materia</option>
              {planOptions.map((plan) => <option key={plan.key} value={plan.key}>{plan.label}</option>)}
            </select>
            <select className="input-base" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} disabled={!canEditWorkspace}>
              {SUBJECT_TEACHER_ROLES.map((role) => <option key={role} value={role}>{SUBJECT_ROLE_LABELS[role]}</option>)}
            </select>
            <button type="button" className="btn-primary" onClick={addAssignment} disabled={!canEditWorkspace || !canSubmit || isSaving}>
              {isSaving ? 'Agregando...' : 'Agregar materia'}
            </button>
          </div>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-amber-700">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-[680px] table-fixed divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Materia</th>
              <th className="px-4 py-3">Carrera</th>
              <th className="px-4 py-3">Condicion</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {displayRows.map((row) => (
                    <tr key={row.key}>
                      <td className="break-words px-4 py-3 font-semibold text-slate-950">{row.materia}</td>
                      <td className="break-words px-4 py-3 text-slate-700">{row.carrera || '-'}</td>
                      <td className="px-4 py-3">
                        <select
                          className="input-base"
                          aria-label={`Condicion de ${row.materia}`}
                          value={row.source === 'assignment' ? row.role : ''}
                          onChange={(event) => (
                            row.source === 'assignment'
                              ? changeRole(row.id, event.target.value)
                              : defineScheduleRole(row, event.target.value)
                          )}
                          disabled={!canEditWorkspace || isSaving || !teacherId}
                        >
                          {row.source !== 'assignment' && <option value="">Definir condicion</option>}
                          {SUBJECT_TEACHER_ROLES.map((role) => <option key={role} value={role}>{SUBJECT_ROLE_LABELS[role]}</option>)}
                        </select>
                        {row.source === 'assignment' && row.role === 'licencia' && (
                          <p className="mt-1 text-xs font-bold text-amber-700">
                            En licencia · reemplaza {row.assignment?.metadata?.replacement_teacher_name || 'docente designado'}
                            {row.assignment?.metadata?.leave_ends_on ? ` hasta ${row.assignment.metadata.leave_ends_on}` : ''}
                          </p>
                        )}
                        {row.source === 'assignment' && row.assignment?.source === 'teacher_leave_replacement' && (
                          <p className="mt-1 text-xs font-bold text-sky-700">
                            Reemplaza a {row.assignment?.metadata?.teacher_on_leave_name || 'docente de licencia'}
                            {row.assignment?.metadata?.leave_ends_on ? ` hasta ${row.assignment.metadata.leave_ends_on}` : ''}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {row.source === 'assignment' ? (
                          <button type="button" className="btn-secondary px-3 py-2 text-red-700" onClick={() => removeAssignment(row.id)} disabled={!canEditWorkspace} title="Quitar materia">
                            <Trash2 className="h-4 w-4" />
                          </button>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && displayRows.length === 0 && (
          <div className="p-6 text-sm text-slate-500">Todavia no tiene materias asignadas.</div>
        )}
        {isLoading && displayRows.length === 0 && (
          <div className="p-6 text-sm text-slate-500">Cargando materias...</div>
        )}
      </div>

      {leaveDraft && createPortal(
        <div className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4">
          <section className="modal-surface max-h-[90vh] w-full max-w-2xl overflow-y-auto border p-5" aria-label="Configurar licencia docente">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase text-amber-700">Licencia por materia</p>
                <h3 className="mt-2 text-xl font-extrabold text-slate-950">Definir reemplazo de {getTeacherFullName(teacher)}</h3>
                <p className="mt-2 text-sm text-slate-600">El reemplazante recibira inmediatamente acceso al padron, notas y asistencias de las materias elegidas.</p>
              </div>
              <button type="button" className="btn-secondary px-3 py-2" onClick={() => setLeaveDraft(null)} title="Cerrar"><X className="h-4 w-4" /></button>
            </div>

            <fieldset className="mt-5 space-y-2">
              <legend className="text-sm font-bold text-slate-800">Materias alcanzadas</legend>
              {displayRows.filter((row) => row.source === 'assignment' && row.role !== 'licencia').map((row) => (
                <label key={row.id} className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={leaveDraft.assignmentIds.includes(row.id)}
                    onChange={(event) => setLeaveDraft((current) => ({
                      ...current,
                      assignmentIds: event.target.checked
                        ? [...current.assignmentIds, row.id]
                        : current.assignmentIds.filter((id) => id !== row.id),
                    }))}
                  />
                  <span><strong>{row.materia}</strong><span className="block text-slate-500">{row.carrera || 'Sin carrera'}</span></span>
                </label>
              ))}
            </fieldset>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="text-sm font-bold text-slate-800">Docente reemplazante</span>
                <select className="input-base mt-2" value={leaveDraft.replacementKey} onChange={(event) => setLeaveDraft((current) => ({ ...current, replacementKey: event.target.value }))}>
                  <option value="">Seleccionar docente</option>
                  {replacementOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>
              <label><span className="text-sm font-bold text-slate-800">Desde</span><input className="input-base mt-2" type="date" value={leaveDraft.startsOn} onChange={(event) => setLeaveDraft((current) => ({ ...current, startsOn: event.target.value }))} /></label>
              <label><span className="text-sm font-bold text-slate-800">Hasta (opcional)</span><input className="input-base mt-2" type="date" min={leaveDraft.startsOn} value={leaveDraft.endsOn} onChange={(event) => setLeaveDraft((current) => ({ ...current, endsOn: event.target.value }))} /></label>
              <label className="sm:col-span-2"><span className="text-sm font-bold text-slate-800">Observaciones (opcional)</span><textarea className="input-base mt-2 min-h-20" value={leaveDraft.notes} onChange={(event) => setLeaveDraft((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setLeaveDraft(null)}>Cancelar</button>
              <button type="button" className="btn-primary" disabled={isSaving || !leaveDraft.assignmentIds.length || !leaveDraft.replacementKey || !leaveDraft.startsOn} onClick={submitLeave}>{isSaving ? 'Aplicando...' : 'Confirmar licencia y reemplazo'}</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}

function TeacherScheduleDetailModal({
  activeInstitution,
  academicSummary = null,
  canEditWorkspace = false,
  horariosDocentes = [],
  onClose,
  planesEstudio = [],
  teacher,
  teachers = [],
  workspaceKey = 'main',
}) {
  if (!teacher) return null

  const planOptions = buildPlanOptions(planesEstudio)
  const schedules = horariosDocentes
    .filter((schedule) => scheduleMatchesTeacher(schedule, teacher))
    .sort((left, right) => (
      compareScheduleDisplayRows(
        buildScheduleDisplayRow(left, planOptions),
        buildScheduleDisplayRow(right, planOptions),
      )
    ))
  const scheduleDisplayRows = schedules.map((schedule) => buildScheduleDisplayRow(schedule, planOptions))
  const teacherOverview = buildTeacherAcademicOverview({ teacher, academicSummary, schedules, planOptions })

  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
      <section className="modal-surface max-h-[90vh] w-full max-w-5xl overflow-y-auto border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase text-teal-700">Detalle docente</p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-950">{getTeacherFullName(teacher) || teacher.nombre}</h3>
            <p className="mt-2 text-sm text-slate-600">DNI {teacher.dni || 'sin DNI'} - {teacher.telefono || 'sin telefono'}</p>
          </div>
          <button type="button" className="btn-secondary px-3 py-2" onClick={onClose} title="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="soft-card border-l-4 border-l-teal-600 bg-white">
            <p className="text-xs font-bold uppercase text-teal-700">Materias</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{teacherOverview.subjectCount}</p>
          </div>
          <div className="soft-card border-l-4 border-l-sky-500 bg-white">
            <p className="text-xs font-bold uppercase text-sky-700">Carreras</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{teacherOverview.careerCount}</p>
          </div>
          <div className="soft-card border-l-4 border-l-orange-500 bg-white">
            <p className="text-xs font-bold uppercase text-orange-700">Horas catedra</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{formatCatedraHours(teacherOverview.totalCatedraHours)}</p>
          </div>
        </div>

        <TeacherSubjectAssignmentsPanel
          activeInstitution={activeInstitution}
          canEditWorkspace={canEditWorkspace}
          planesEstudio={planesEstudio}
          scheduleSubjects={teacherOverview.scheduleSubjectRows}
          teacher={teacher}
          teachers={teachers}
          workspaceKey={workspaceKey}
        />

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[820px] table-fixed divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Materia</th>
                <th className="px-4 py-3">Carrera</th>
                <th className="px-4 py-3">Dia</th>
                <th className="px-4 py-3">Horario</th>
                <th className="px-4 py-3">Aula</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {scheduleDisplayRows.map((scheduleRow, index) => (
                <tr key={scheduleRow.key || index}>
                  <td className="break-words px-4 py-3 font-semibold text-slate-900">{scheduleRow.materia}</td>
                  <td className="break-words px-4 py-3 text-slate-700">{scheduleRow.carrera}</td>
                  <td className="break-words px-4 py-3 text-slate-700">{scheduleRow.dia}</td>
                  <td className="break-words px-4 py-3 text-slate-700">{scheduleRow.horario}</td>
                  <td className="break-words px-4 py-3 text-slate-700">{scheduleRow.aula}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {schedules.length === 0 && (
            <div className="p-6 text-sm text-slate-500">
              No hay horarios cargados para este docente.
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  )
}

function TeacherRosterSection({
  activeInstitution,
  cargaHorariaDocente = [],
  canEditWorkspace = false,
  careerOptions = [],
  docenteMateria = [],
  docentes = [],
  disponibilidadDocente = [],
  fechasBloqueadasDocente = [],
  embedded = false,
  horariosDocentes = [],
  isProvisioningTeachers = false,
  lastAccessResult = null,
  onCreateAvailability,
  onCreateBlockedDate,
  onCreateLoad,
  onCreateTeacher,
  onDeleteAvailability,
  onDeleteBlockedDate,
  onDeleteLoad,
  onDeleteTeacher,
  onGenerateLoadsFromSchedules,
  onProvisionTeachers,
  onUpdateAvailability,
  onUpdateBlockedDate,
  onUpdateLoad,
  planesEstudio = [],
  sectionId = 'teacher-roster',
  onUpdateTeacher,
  useRemoteWorkspace = false,
  workspaceKey = 'main',
}) {
  const [activeTab, setActiveTab] = useState('roster')
  const [careerFilter, setCareerFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingTeacher, setEditingTeacher] = useState(null)
  const [modalMode, setModalMode] = useState('edit')
  const [form, setForm] = useState(buildTeacherForm(null))
  const [selectedTeacher, setSelectedTeacher] = useState(null)
  const [visibleRosterLimit, setVisibleRosterLimit] = useState('10')
  const effectiveActiveTab = TEACHER_ADMIN_TABS.some((tab) => tab.key === activeTab) ? activeTab : 'roster'
  const visibleCareerOptions = useMemo(
    () => careerOptions.map(clean).filter(Boolean).filter((career) => !isSupabaseValidationCareer(career)),
    [careerOptions],
  )
  const visiblePlanesEstudio = useMemo(
    () => planesEstudio.filter((row) => !isSupabaseValidationArtifact(row)),
    [planesEstudio],
  )
  const visibleDocentes = useMemo(
    () => docentes.filter((row) => !isSupabaseValidationArtifact(row)),
    [docentes],
  )
  const visibleDocenteMateria = useMemo(
    () => docenteMateria.filter((row) => !isSupabaseValidationArtifact(row)),
    [docenteMateria],
  )
  const visibleCargaHorariaDocente = useMemo(
    () => cargaHorariaDocente.filter((row) => !isSupabaseValidationArtifact(row)),
    [cargaHorariaDocente],
  )
  const visibleDisponibilidadDocente = useMemo(
    () => disponibilidadDocente.filter((row) => !isSupabaseValidationArtifact(row)),
    [disponibilidadDocente],
  )
  const visibleFechasBloqueadasDocente = useMemo(
    () => fechasBloqueadasDocente.filter((row) => !isSupabaseValidationArtifact(row)),
    [fechasBloqueadasDocente],
  )
  const visibleHorariosDocentes = useMemo(
    () => horariosDocentes.filter((row) => !isSupabaseValidationArtifact(row)),
    [horariosDocentes],
  )
  const teacherAcademicRows = useMemo(
    () => [
      ...visibleDocenteMateria,
      ...visibleCargaHorariaDocente,
      ...visibleHorariosDocentes,
    ],
    [visibleDocenteMateria, visibleCargaHorariaDocente, visibleHorariosDocentes],
  )
  const teachers = useMemo(
    () => getTeachersFromProfiles(visibleDocentes, teacherAcademicRows),
    [visibleDocentes, teacherAcademicRows],
  )
  const planOptions = useMemo(() => buildPlanOptions(visiblePlanesEstudio), [visiblePlanesEstudio])
  const filteredTeachers = useMemo(() => {
    const matchesSearch = searchTeachers(teachers, searchQuery)
    if (!careerFilter) return matchesSearch

    return matchesSearch.filter((teacher) => (
      getTeacherCareers(teacher).some((career) => {
        const resolvedCareer = resolveCareerDisplayName(career) || career
        return sameText(resolvedCareer, careerFilter)
      })
    ))
  }, [teachers, searchQuery, careerFilter])
  const teacherFilterIndex = useMemo(() => ({
    keys: new Set(filteredTeachers.map(getTeacherOptionKey).filter(Boolean)),
    names: new Set(filteredTeachers.map((teacher) => normalize(getTeacherFullName(teacher) || teacher.nombre)).filter(Boolean)),
  }), [filteredTeachers])
  const teacherSectionFilters = useMemo(() => ({
    careerFilter,
    hasFilter: Boolean(searchQuery || careerFilter),
    planOptions,
    searchQuery,
    teacherFilterIndex,
  }), [careerFilter, planOptions, searchQuery, teacherFilterIndex])
  const filteredPlanesEstudio = useMemo(
    () => (
      careerFilter
        ? visiblePlanesEstudio.filter((row) => sameText(row.carrera, careerFilter))
        : visiblePlanesEstudio
    ),
    [visiblePlanesEstudio, careerFilter],
  )
  const filteredPlanOptions = useMemo(() => buildPlanOptions(filteredPlanesEstudio), [filteredPlanesEstudio])
  const filteredDocenteMateria = useMemo(
    () => visibleDocenteMateria.filter((row) => rowMatchesTeacherSectionFilters(row, teacherSectionFilters)),
    [visibleDocenteMateria, teacherSectionFilters],
  )
  const filteredCargaHorariaDocente = useMemo(
    () => visibleCargaHorariaDocente.filter((row) => rowMatchesTeacherSectionFilters(row, teacherSectionFilters)),
    [visibleCargaHorariaDocente, teacherSectionFilters],
  )
  const filteredDisponibilidadDocente = useMemo(
    () => visibleDisponibilidadDocente.filter((row) => rowMatchesTeacherSectionFilters(row, teacherSectionFilters)),
    [visibleDisponibilidadDocente, teacherSectionFilters],
  )
  const filteredFechasBloqueadasDocente = useMemo(
    () => visibleFechasBloqueadasDocente.filter((row) => rowMatchesTeacherSectionFilters(row, teacherSectionFilters)),
    [visibleFechasBloqueadasDocente, teacherSectionFilters],
  )
  const filteredHorariosDocentes = useMemo(
    () => visibleHorariosDocentes.filter((row) => rowMatchesTeacherSectionFilters(row, teacherSectionFilters)),
    [visibleHorariosDocentes, teacherSectionFilters],
  )
  const rosterTeachersToDisplay = useMemo(
    () => applyDisplayLimit(filteredTeachers, visibleRosterLimit),
    [filteredTeachers, visibleRosterLimit],
  )
  const disponibilidadDocenteToDisplay = useMemo(
    () => applyDisplayLimit(filteredDisponibilidadDocente, visibleRosterLimit),
    [filteredDisponibilidadDocente, visibleRosterLimit],
  )
  const cargaHorariaDocenteToDisplay = useMemo(
    () => applyDisplayLimit(filteredCargaHorariaDocente, visibleRosterLimit),
    [filteredCargaHorariaDocente, visibleRosterLimit],
  )
  const fechasBloqueadasDocenteToDisplay = useMemo(
    () => applyDisplayLimit(filteredFechasBloqueadasDocente, visibleRosterLimit),
    [filteredFechasBloqueadasDocente, visibleRosterLimit],
  )
  const filteredTeacherOptions = useMemo(
    () => buildTeacherOptions(filteredTeachers, filteredDisponibilidadDocente, filteredCargaHorariaDocente),
    [filteredTeachers, filteredDisponibilidadDocente, filteredCargaHorariaDocente],
  )
  const rosterCareerOptions = useMemo(
    () => buildTeacherRosterCareerOptions(visibleCareerOptions, teachers),
    [visibleCareerOptions, teachers],
  )
  const teacherSummaries = useMemo(
    () => buildTeacherAcademicSummary({
      teachers,
      docenteMateria: visibleDocenteMateria,
      disponibilidadDocente: visibleDisponibilidadDocente,
      cargaHorariaDocente: visibleCargaHorariaDocente,
      horariosDocentes: visibleHorariosDocentes,
    }),
    [teachers, visibleDocenteMateria, visibleDisponibilidadDocente, visibleCargaHorariaDocente, visibleHorariosDocentes],
  )
  const teacherSummaryKeys = useMemo(
    () => new Set(teachers.map(getTeacherOptionKey).filter(Boolean)),
    [teachers],
  )
  const visibleTeacherSummaries = useMemo(
    () => teacherSummaries.filter((summary) => teacherSummaryKeys.has(summary.key)),
    [teacherSummaries, teacherSummaryKeys],
  )
  const teacherSummaryByKey = useMemo(
    () => new Map(visibleTeacherSummaries.map((summary) => [summary.key, summary])),
    [visibleTeacherSummaries],
  )
  const baseDataDiagnostics = useMemo(
    () => buildTeacherBaseDataDiagnostics({
      teachers: filteredTeachers,
      disponibilidadDocente: filteredDisponibilidadDocente,
      cargaHorariaDocente: filteredCargaHorariaDocente,
      docenteMateria: filteredDocenteMateria,
      horariosDocentes: filteredHorariosDocentes,
      fechasBloqueadasDocente: filteredFechasBloqueadasDocente,
      planesEstudio: filteredPlanesEstudio,
      career: careerFilter,
    }),
    [
      filteredTeachers,
      filteredDisponibilidadDocente,
      filteredCargaHorariaDocente,
      filteredDocenteMateria,
      filteredHorariosDocentes,
      filteredFechasBloqueadasDocente,
      filteredPlanesEstudio,
      careerFilter,
    ],
  )
  const sectionClassName = embedded
    ? 'space-y-4'
    : 'rise-in soft-card soft-card--tint-teal border-l-4 border-l-teal-600'
  const rosterStatCards = useMemo(
    () => getRosterStatCards({ teachers }),
    [teachers],
  )
  const selectedTeacherSummary = useMemo(
    () => (
      selectedTeacher
        ? findSummaryForTeacher(selectedTeacher, teacherSummaryByKey, visibleTeacherSummaries)
        : null
    ),
    [selectedTeacher, teacherSummaryByKey, visibleTeacherSummaries],
  )
  const activeTabHeader = TEACHER_ADMIN_TAB_HEADERS[effectiveActiveTab] ?? TEACHER_ADMIN_TAB_HEADERS.roster
  const canProvisionTeacherAccess = Boolean(
    useRemoteWorkspace && teachers.length > 0 && !isProvisioningTeachers && onProvisionTeachers,
  )

  const handleFormChange = (field) => (event) => {
    setForm((current) => ({
      ...current,
      [field]: event.target.value,
    }))
  }

  const handleCareerToggle = (career) => (event) => {
    setForm((current) => {
      const nextCareers = new Set(current.carreras ?? [])

      if (event.target.checked) {
        nextCareers.add(career)
      } else {
        nextCareers.delete(career)
      }

      return {
        ...current,
        carreras: Array.from(nextCareers).sort((left, right) => left.localeCompare(right, 'es', { sensitivity: 'base' })),
      }
    })
  }

  const handleModalChange = (field, career = null) => (
    career ? handleCareerToggle(career) : handleFormChange(field)
  )

  const startEditing = (teacher) => {
    setModalMode('edit')
    setEditingTeacher(teacher)
    setForm(buildTeacherForm(teacher))
  }

  const startCreating = () => {
    setModalMode('create')
    setEditingTeacher(null)
    setForm(buildTeacherForm(null))
  }

  const cancelEditing = () => {
    setEditingTeacher(null)
    setModalMode('edit')
    setForm(buildTeacherForm(null))
  }

  const submitEdit = async () => {
    if (modalMode === 'create') {
      const created = await onCreateTeacher?.(form)

      if (created !== false) {
        cancelEditing()
      }

      return
    }

    if (!editingTeacher) return

    const teacherIdentity = editingTeacher.dni || editingTeacher.nombre
    const updated = await onUpdateTeacher?.(teacherIdentity, form)

    if (updated !== false) {
      cancelEditing()
    }
  }

  return (
    <section id={sectionId} className={sectionClassName}>
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
          <div>
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-teal-700">
              <UsersRound className="h-4 w-4" />
              Gestion de docentes
            </p>
            <h3 className="mt-2 text-xl font-extrabold text-slate-950">{activeTabHeader.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {activeTabHeader.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={onProvisionTeachers}
              disabled={!canProvisionTeacherAccess}
              title={!useRemoteWorkspace ? 'Requiere sesion remota con Supabase' : 'Crear accesos docentes'}
            >
              <KeyRound className="h-4 w-4" />
              {isProvisioningTeachers ? 'Creando...' : 'Crear accesos'}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={startCreating}
              disabled={!canEditWorkspace || visibleCareerOptions.length === 0}
            >
              <UserPlus className="h-4 w-4" />
              Nuevo docente
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {rosterStatCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-lg border border-slate-200 border-l-4 bg-white p-4 ${ROSTER_STAT_STYLES[card.tone] ?? ROSTER_STAT_STYLES.teal}`}
              title={card.description || card.label}
            >
              <p className="text-xs font-bold uppercase tracking-[0.14em]">{card.label}</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-950">{card.value}</p>
              {card.description && (
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{card.description}</p>
              )}
            </div>
          ))}
        </div>

        {lastAccessResult && (
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            Accesos docentes: {lastAccessResult.created} creados, {lastAccessResult.updated} actualizados, {lastAccessResult.failed} con error.
          </div>
        )}

        {!useRemoteWorkspace && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            La creacion de accesos docentes requiere una sesion remota con Supabase.
          </div>
        )}

        <TeacherAdminTabs activeTab={effectiveActiveTab} onChange={setActiveTab} />

        <TeacherSectionFilterBar
          careerFilter={careerFilter}
          careerOptions={rosterCareerOptions}
          displayedCount={rosterTeachersToDisplay.length}
          filteredCount={filteredTeachers.length}
          onCareerFilterChange={setCareerFilter}
          onLimitChange={setVisibleRosterLimit}
          onSearchChange={setSearchQuery}
          searchQuery={searchQuery}
          totalCount={teachers.length}
          visibleLimit={visibleRosterLimit}
        />

        {effectiveActiveTab === 'roster' && (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {rosterTeachersToDisplay.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-[1120px] table-fixed divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Docente</th>
                      <th className="px-4 py-3">DNI</th>
                      <th className="px-4 py-3">Telefono</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Carreras</th>
                      <th className="px-4 py-3">Materias</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Horas catedra</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {rosterTeachersToDisplay.map((teacher) => {
                      const summary = findSummaryForTeacher(teacher, teacherSummaryByKey, visibleTeacherSummaries)
                      const teacherSchedules = visibleHorariosDocentes.filter((schedule) => scheduleMatchesTeacher(schedule, teacher))
                      const overview = buildTeacherAcademicOverview({
                        teacher,
                        academicSummary: summary,
                        schedules: teacherSchedules,
                        planOptions,
                      })
                      const teacherEmail = getTeacherEmail(teacher)
                      const teacherHours = overview.totalCatedraHours

                      return (
                        <tr key={teacher.dni || teacher.nombre} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedTeacher(teacher)}>
                          <td className="break-words px-4 py-3">
                            <p className="font-semibold text-slate-950">{getTeacherFullName(teacher) || teacher.nombre}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {getTeacherStatus(teacher)}
                            </p>
                          </td>
                          <td className="break-words px-4 py-3 text-slate-700">{teacher.dni || '-'}</td>
                          <td className="break-words px-4 py-3 text-slate-700">{teacher.telefono || '-'}</td>
                          <td className="break-words px-4 py-3 text-slate-700">{teacherEmail || '-'}</td>
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {formatRosterCount(overview.careerCount, 'carrera')}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {formatRosterCount(overview.subjectCount, 'materia')}
                          </td>
                          <td className="break-words px-4 py-3 text-slate-700">
                            <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
                              {getTeacherStatus(teacher)}
                            </span>
                          </td>
                          <td className="break-words px-4 py-3 font-semibold text-slate-700">
                            {teacherHours > 0 ? formatCatedraHours(teacherHours) : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button type="button" className="btn-secondary px-3 py-2" onClick={(event) => { event.stopPropagation(); startEditing(teacher) }} disabled={!canEditWorkspace} title="Editar docente">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button type="button" className="btn-secondary px-3 py-2 text-red-700" onClick={(event) => { event.stopPropagation(); onDeleteTeacher?.(teacher.dni || teacher.nombre) }} disabled={!canEditWorkspace} title="Borrar docente">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {filteredTeachers.length === 0 && (
              <div className="p-6 text-sm text-slate-500">
                {teachers.length === 0
                  ? 'No hay docentes cargados en el padron.'
                  : 'No se encontraron docentes con esos criterios.'}
              </div>
            )}
            {filteredTeachers.length > 0 && rosterTeachersToDisplay.length === 0 && (
              <div className="p-6 text-sm font-semibold text-slate-500">
                La grilla esta oculta. Elegi 5, 10, 20 o todos para mostrar docentes.
              </div>
            )}
          </div>
        )}

        {effectiveActiveTab === 'diagnostics' && (
          <TeacherBaseDataDiagnosticPanel
            diagnostics={baseDataDiagnostics}
          />
        )}

        {effectiveActiveTab === 'availability' && (
          <AvailabilityAdminPanel
            canEditWorkspace={canEditWorkspace}
            displayLimit={visibleRosterLimit}
            disponibilidadDocente={disponibilidadDocenteToDisplay}
            horariosDocentes={filteredHorariosDocentes}
            manualTotalCount={filteredDisponibilidadDocente.length}
            onSelectTeacher={setSelectedTeacher}
            onCreateAvailability={onCreateAvailability}
            onDeleteAvailability={onDeleteAvailability}
            onUpdateAvailability={onUpdateAvailability}
            planOptions={filteredPlanOptions}
            teachers={filteredTeachers}
            teacherOptions={filteredTeacherOptions}
          />
        )}

        {effectiveActiveTab === 'loads' && (
          <LoadAdminPanel
            canEditWorkspace={canEditWorkspace}
            cargaHorariaDocente={cargaHorariaDocenteToDisplay}
            careerOptions={visibleCareerOptions}
            onCreateLoad={onCreateLoad}
            onDeleteLoad={onDeleteLoad}
            onGenerateLoadsFromSchedules={onGenerateLoadsFromSchedules}
            onUpdateLoad={onUpdateLoad}
            planOptions={filteredPlanOptions}
            scheduleCount={filteredHorariosDocentes.length}
            teacherOptions={filteredTeacherOptions}
            totalRowsCount={filteredCargaHorariaDocente.length}
          />
        )}

        {effectiveActiveTab === 'blocked-dates' && (
          <TeacherBlockedDatesAdminPanel
            canEditWorkspace={canEditWorkspace}
            fechasBloqueadasDocente={fechasBloqueadasDocenteToDisplay}
            onCreateBlockedDate={onCreateBlockedDate}
            onDeleteBlockedDate={onDeleteBlockedDate}
            onUpdateBlockedDate={onUpdateBlockedDate}
            teacherOptions={filteredTeacherOptions}
            totalRowsCount={filteredFechasBloqueadasDocente.length}
          />
        )}
      </div>

      <TeacherEditModal
        careerOptions={visibleCareerOptions}
        form={form}
        isOpen={modalMode === 'create' || Boolean(editingTeacher)}
        mode={modalMode}
        onChange={handleModalChange}
        onClose={cancelEditing}
        onSubmit={submitEdit}
      />
      <TeacherScheduleDetailModal
        activeInstitution={activeInstitution}
        academicSummary={selectedTeacherSummary}
        canEditWorkspace={canEditWorkspace}
        horariosDocentes={visibleHorariosDocentes}
        planesEstudio={visiblePlanesEstudio}
        teacher={selectedTeacher}
        teachers={teachers}
        workspaceKey={workspaceKey}
        onClose={() => setSelectedTeacher(null)}
      />
    </section>
  )
}

export default TeacherRosterSection
