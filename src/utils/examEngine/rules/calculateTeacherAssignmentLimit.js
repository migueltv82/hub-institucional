import { normalizeText } from '../normalize/subjects.js'

export const TEACHER_ASSIGNMENT_RULE_MODES = Object.freeze({
  DAYS_BASED_HALF_PLUS_ONE: 'DAYS_BASED_HALF_PLUS_ONE',
  TEACHING_HOURS_HALF_PLUS_ONE: 'TEACHING_HOURS_HALF_PLUS_ONE',
})

export const TEACHING_HOURS_SOURCES = Object.freeze({
  EXPLICIT: 'TEACHING_HOURS_EXPLICIT',
  INFERRED_FROM_SCHEDULE: 'TEACHING_HOURS_INFERRED_FROM_SCHEDULE',
  MISSING: 'MISSING_TEACHING_HOURS_SOURCE',
})

const DEFAULT_TEACHING_HOUR_MINUTES = 40
const TEACHING_HOURS_FIELDS = [
  'horasCatedra',
  'horas_catedra',
  'teachingHours',
  'teaching_hours',
  'cargaHoraria',
  'carga_horaria',
]
const START_FIELDS = ['inicio', 'horaInicio', 'hora_inicio', 'desde', 'start', 'startTime']
const END_FIELDS = ['fin', 'horaFin', 'hora_fin', 'hasta', 'end', 'endTime']

function clean(value) {
  return String(value ?? '').trim()
}

function readField(row = {}, fields = []) {
  for (const field of fields) {
    if (row[field] !== undefined && row[field] !== null && clean(row[field]) !== '') {
      return row[field]
    }
  }
  return undefined
}

function normalizePositiveNumber(value) {
  if (value === undefined || value === null || clean(value) === '') return null
  const numberValue = Number(String(value).replace(',', '.'))
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null
}

function uniqueCount(value) {
  if (Array.isArray(value)) {
    return new Set(value.map(clean).filter(Boolean).map(normalizeText)).size
  }
  if (value instanceof Set) return uniqueCount([...value])

  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0
}

function scheduleBlockKey(row = {}) {
  return [
    row.docente ?? row.profesor ?? row.teacher ?? row.dni_docente ?? row.dni,
    row.carrera ?? row.carreraId ?? row.carrera_id,
    row.materia ?? row.materiaNombre ?? row.materia_nombre ?? row.nombreMateria,
    row.dia ?? row.day,
    readField(row, START_FIELDS),
    readField(row, END_FIELDS),
  ].map((value) => normalizeText(value)).join('::')
}

export function parseScheduleTimeToMinutes(value) {
  const text = clean(value)
  const match = text.match(/^(\d{1,2})(?::|\.|h)?\s*(\d{2})?$/)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export function readExplicitTeachingHours(row = {}) {
  const rawValue = readField(row, TEACHING_HOURS_FIELDS)
  if (rawValue === undefined) {
    return {
      present: false,
      valid: false,
      value: null,
    }
  }

  const value = normalizePositiveNumber(rawValue)
  return {
    present: true,
    valid: value !== null,
    value,
  }
}

export function inferTeachingHoursFromScheduleRow(row = {}, options = {}) {
  const explicit = readExplicitTeachingHours(row)
  if (explicit.present) {
    return {
      teachingHours: explicit.valid ? explicit.value : 0,
      source: explicit.valid ? TEACHING_HOURS_SOURCES.EXPLICIT : TEACHING_HOURS_SOURCES.MISSING,
      valid: explicit.valid,
      durationMinutes: null,
      warningCode: explicit.valid ? '' : 'INVALID_EXPLICIT_TEACHING_HOURS',
    }
  }

  const start = parseScheduleTimeToMinutes(readField(row, START_FIELDS))
  const end = parseScheduleTimeToMinutes(readField(row, END_FIELDS))
  if (start === null || end === null || end <= start) {
    return {
      teachingHours: 0,
      source: TEACHING_HOURS_SOURCES.MISSING,
      valid: false,
      durationMinutes: null,
      warningCode: 'INVALID_SCHEDULE_TIME',
    }
  }

  const minutesPerTeachingHour = normalizePositiveNumber(options.minutesPerTeachingHour) ||
    DEFAULT_TEACHING_HOUR_MINUTES
  const durationMinutes = end - start
  const teachingHours = Math.max(1, Math.round(durationMinutes / minutesPerTeachingHour))

  return {
    teachingHours,
    source: TEACHING_HOURS_SOURCES.INFERRED_FROM_SCHEDULE,
    valid: true,
    durationMinutes,
    warningCode: durationMinutes % minutesPerTeachingHour === 0
      ? ''
      : 'SCHEDULE_INCLUDES_NON_TEACHING_MINUTES',
  }
}

export function summarizeTeacherScheduleTeachingHours(rows = [], options = {}) {
  const seenBlocks = new Set()
  const warnings = []
  let teachingHours = 0
  let duplicateBlocksIgnored = 0
  let validBlocks = 0
  let invalidBlocks = 0
  let explicitBlocks = 0
  let inferredBlocks = 0

  ;(Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
    const key = scheduleBlockKey(row)
    if (key && seenBlocks.has(key)) {
      duplicateBlocksIgnored += 1
      return
    }
    if (key) seenBlocks.add(key)

    const result = inferTeachingHoursFromScheduleRow(row, options)
    if (!result.valid) {
      invalidBlocks += 1
      warnings.push({
        code: result.warningCode || 'MISSING_TEACHING_HOURS_SOURCE',
        rowIndex,
      })
      return
    }

    validBlocks += 1
    teachingHours += result.teachingHours
    if (result.source === TEACHING_HOURS_SOURCES.EXPLICIT) explicitBlocks += 1
    if (result.source === TEACHING_HOURS_SOURCES.INFERRED_FROM_SCHEDULE) inferredBlocks += 1
    if (result.warningCode) {
      warnings.push({
        code: result.warningCode,
        rowIndex,
      })
    }
  })

  const source = explicitBlocks > 0 && inferredBlocks === 0
    ? TEACHING_HOURS_SOURCES.EXPLICIT
    : inferredBlocks > 0
      ? TEACHING_HOURS_SOURCES.INFERRED_FROM_SCHEDULE
      : TEACHING_HOURS_SOURCES.MISSING

  return {
    teachingHours,
    source,
    valid: validBlocks > 0,
    validBlocks,
    invalidBlocks,
    explicitBlocks,
    inferredBlocks,
    duplicateBlocksIgnored,
    warnings,
  }
}

export function getTeacherAttendanceDayCount(teacher = {}) {
  if (typeof teacher === 'number') return uniqueCount(teacher)

  return uniqueCount(
    teacher.diasAsistencia ??
    teacher.diasDisponibles ??
    teacher.disponibilidad ??
    teacher.diasLaborales ??
    teacher.cantidadDiasAsistencia ??
    teacher.cantidadDiasDisponibles,
  )
}

export function getTeacherTeachingHours(teacher = {}) {
  if (typeof teacher === 'number') return normalizePositiveNumber(teacher)

  const explicit = readExplicitTeachingHours(teacher)
  return explicit.valid ? explicit.value : null
}

function resolveRuleMode(teacher = {}, requestedMode = '') {
  const candidate = clean(
    requestedMode ||
    teacher.halfPlusOneRuleMode ||
    teacher.assignmentLimitRuleMode,
  ).toUpperCase()

  if (Object.values(TEACHER_ASSIGNMENT_RULE_MODES).includes(candidate)) return candidate
  return TEACHER_ASSIGNMENT_RULE_MODES.DAYS_BASED_HALF_PLUS_ONE
}

export function calculateTeacherAssignmentLimit({
  teacher = {},
  ruleMode = '',
  attendanceDays,
  teachingHours,
  fallbackRuleMode = '',
} = {}) {
  const resolvedRuleMode = resolveRuleMode(teacher, ruleMode)
  const baseValue = resolvedRuleMode === TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE
    ? normalizePositiveNumber(teachingHours) ?? getTeacherTeachingHours(teacher)
    : attendanceDays === undefined
      ? getTeacherAttendanceDayCount(teacher)
      : uniqueCount(attendanceDays)

  if (baseValue === null) {
    const explicitFallback = clean(fallbackRuleMode).toUpperCase()
    if (
      resolvedRuleMode === TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE &&
      explicitFallback === TEACHER_ASSIGNMENT_RULE_MODES.DAYS_BASED_HALF_PLUS_ONE
    ) {
      const fallback = calculateTeacherAssignmentLimit({
        teacher,
        ruleMode: explicitFallback,
        attendanceDays,
      })
      return {
        ...fallback,
        requestedRuleMode: resolvedRuleMode,
        usedFallback: true,
        warningCode: 'MISSING_TEACHING_HOURS_USING_EXPLICIT_DAYS_FALLBACK',
      }
    }

    // baseValue is only null for the teaching-hours base (missing horasCatedra);
    // the days-based base always resolves via uniqueCount, which never returns null.
    return {
      limit: 0,
      ruleMode: resolvedRuleMode,
      requestedRuleMode: resolvedRuleMode,
      baseValue: null,
      valid: false,
      usedFallback: false,
      warningCode: 'MISSING_TEACHING_HOURS_SOURCE',
    }
  }

  return {
    limit: baseValue > 0 ? Math.floor(baseValue / 2) + 1 : 0,
    ruleMode: resolvedRuleMode,
    requestedRuleMode: resolvedRuleMode,
    baseValue,
    valid: baseValue > 0,
    usedFallback: false,
    warningCode: baseValue > 0
      ? ''
      : resolvedRuleMode === TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE
        ? 'ZERO_TEACHING_HOURS'
        : 'ZERO_ATTENDANCE_DAYS',
  }
}

export function teacherCanBeAssignedOnDate({
  attendsInstitutionOnDate = false,
  underTeachingHoursBasedLimit = false,
} = {}) {
  return Boolean(attendsInstitutionOnDate && underTeachingHoursBasedLimit)
}
