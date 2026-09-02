import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import {
  calculateTeacherAssignmentLimit,
  getTeacherAttendanceDayCount,
  getTeacherTeachingHours,
  inferTeachingHoursFromScheduleRow,
  summarizeTeacherScheduleTeachingHours,
  TEACHER_ASSIGNMENT_RULE_MODES,
  TEACHING_HOURS_SOURCES,
} from '../rules/calculateTeacherAssignmentLimit.js'

const DAYS_MODE = TEACHER_ASSIGNMENT_RULE_MODES.DAYS_BASED_HALF_PLUS_ONE
const HOURS_MODE = TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function anonymousTeacherId(value, index = 0) {
  const text = clean(value) || `teacher-${index + 1}`
  let hash = 2166136261
  for (let position = 0; position < text.length; position += 1) {
    hash ^= text.charCodeAt(position)
    hash = Math.imul(hash, 16777619)
  }
  return `DOC-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 8)}`
}

function getTeacherId(teacher = {}, index = 0) {
  return clean(
    teacher.id ??
    teacher.docenteId ??
    teacher.teacherKey ??
    teacher.dni ??
    teacher.email ??
    teacher.nombre ??
    `teacher-${index + 1}`,
  )
}

function countBy(rows = [], predicate = () => false) {
  return rows.filter(predicate).length
}

function sumBy(rows = [], selector = () => 0) {
  return rows.reduce((total, row) => total + (Number(selector(row)) || 0), 0)
}

function buildSourceDiagnostics(snapshot = {}, adaptedTeachers = []) {
  const scheduleRows = asArray(snapshot.horariosDocentes)
  const teacherRows = asArray(snapshot.docentes)
  const planRows = asArray(snapshot.planesEstudio)
  const scheduleSummary = summarizeTeacherScheduleTeachingHours(scheduleRows)
  const inferableScheduleRows = scheduleRows.filter((row) => (
    inferTeachingHoursFromScheduleRow(row).valid
  )).length
  const explicitTeacherRows = teacherRows.filter((row) => (
    getTeacherTeachingHours(row) !== null
  )).length
  const explicitPlanRows = planRows.filter((row) => (
    getTeacherTeachingHours(row) !== null
  )).length

  return {
    selectedSource: adaptedTeachers.some((teacher) => (
      teacher.horasCatedraSource === TEACHING_HOURS_SOURCES.EXPLICIT
    ))
      ? 'EXPLICIT_OR_SCHEDULE'
      : TEACHING_HOURS_SOURCES.INFERRED_FROM_SCHEDULE,
    horariosDocentes: {
      totalRows: scheduleRows.length,
      inferableRows: inferableScheduleRows,
      invalidRows: scheduleRows.length - inferableScheduleRows,
      duplicateBlocksIgnored: scheduleSummary.duplicateBlocksIgnored,
      sourceCode: scheduleRows.length
        ? 'TEACHING_HOURS_INFERRED_FROM_SCHEDULE'
        : 'MISSING_TEACHING_HOURS_SOURCE',
    },
    docentes: {
      totalRows: teacherRows.length,
      rowsWithExplicitTeachingHours: explicitTeacherRows,
    },
    planesEstudio: {
      totalRows: planRows.length,
      rowsWithExplicitTeachingHours: explicitPlanRows,
      usableAsTeacherLoadSource: false,
    },
    adaptedTeachers: {
      total: adaptedTeachers.length,
      withExplicitTeachingHours: countBy(adaptedTeachers, (teacher) => (
        teacher.horasCatedraSource === TEACHING_HOURS_SOURCES.EXPLICIT
      )),
      withInferredTeachingHours: countBy(adaptedTeachers, (teacher) => (
        teacher.horasCatedraSource === TEACHING_HOURS_SOURCES.INFERRED_FROM_SCHEDULE
      )),
      withoutTeachingHours: countBy(adaptedTeachers, (teacher) => (
        !(Number(teacher.horasCatedra) > 0)
      )),
    },
  }
}

function buildRecommendations(summary = {}, sourceDiagnostics = {}) {
  const recommendations = [
    'Aplicar mitad mas uno solo a vocalias comunes por llamado, manteniendo titularidades fuera de la cuota actual.',
    'Mantener asistencia por dia como condicion obligatoria aunque el docente conserve cupo por horas catedra.',
    'Registrar TEACHING_HOURS_HALF_PLUS_ONE en cada corrida para no mezclar resultados con la regla historica.',
  ]

  if (sourceDiagnostics.docentes?.rowsWithExplicitTeachingHours === 0) {
    recommendations.push(
      'Agregar una columna institucional explicita de horas_catedra por docente; la auditoria actual solo puede inferirla desde horariosDocentes.',
    )
  }
  if (summary.teachersWithoutTeachingHours > 0) {
    recommendations.push(
      'Resolver docentes con MISSING_TEACHING_HOURS_SOURCE antes de usar el resultado como validacion institucional definitiva.',
    )
  }
  if (summary.increasedCapacityTeachers > 0) {
    recommendations.push(
      'Volver a simular tribunales: la nueva base aumenta el cupo de vocalias y puede cambiar el cuello de botella actual.',
    )
  }

  return recommendations
}

export function auditHalfPlusOneRuleChange({ snapshot, options = {} } = {}) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {}
  const warnings = []
  const errors = []
  let input

  try {
    input = buildRegularExamInputFromWorkspaceSnapshot(safeSnapshot)
  } catch {
    return {
      summary: {
        totalTeachers: 0,
        recommendation: 'No se pudo adaptar el snapshot para auditar la regla.',
      },
      teacherComparisons: [],
      affectedTeachers: [],
      riskCases: [],
      recommendations: ['Revisar la estructura del snapshot local antes de repetir la auditoria.'],
      warnings,
      errors: [{ code: 'SNAPSHOT_ADAPTER_ERROR' }],
    }
  }

  const teachers = asArray(input.docentes)
  const teacherComparisons = teachers.map((teacher, index) => {
    const attendanceDays = getTeacherAttendanceDayCount(teacher)
    const teachingHours = getTeacherTeachingHours(teacher)
    const legacyLimit = calculateTeacherAssignmentLimit({
      teacher,
      ruleMode: DAYS_MODE,
    })
    const teachingHoursLimit = calculateTeacherAssignmentLimit({
      teacher,
      ruleMode: HOURS_MODE,
    })
    const difference = teachingHoursLimit.limit - legacyLimit.limit
    const missingTeachingHours = teachingHours === null || teachingHours <= 0
    const missingAttendanceDays = attendanceDays <= 0

    return {
      teacherAnonId: anonymousTeacherId(getTeacherId(teacher, index), index),
      teachingHours: teachingHours ?? 0,
      teachingHoursSource: teacher.horasCatedraSource ?? TEACHING_HOURS_SOURCES.MISSING,
      attendanceDays,
      legacyDaysBasedLimit: legacyLimit.limit,
      teachingHoursBasedLimit: teachingHoursLimit.limit,
      difference,
      capacityChange: difference > 0 ? 'INCREASED' : difference < 0 ? 'DECREASED' : 'UNCHANGED',
      missingTeachingHours,
      missingAttendanceDays,
      blockedByAttendance: teachingHoursLimit.limit > 0 && missingAttendanceDays,
      dailyAttendanceStillRequired: true,
    }
  })

  const sourceDiagnostics = buildSourceDiagnostics(safeSnapshot, teachers)
  const summary = {
    totalTeachers: teacherComparisons.length,
    increasedCapacityTeachers: countBy(teacherComparisons, (row) => row.difference > 0),
    decreasedCapacityTeachers: countBy(teacherComparisons, (row) => row.difference < 0),
    unchangedCapacityTeachers: countBy(teacherComparisons, (row) => row.difference === 0),
    teachersWithoutTeachingHours: countBy(teacherComparisons, (row) => row.missingTeachingHours),
    teachersWithoutAttendanceDays: countBy(teacherComparisons, (row) => row.missingAttendanceDays),
    teachersBlockedByAttendance: countBy(teacherComparisons, (row) => row.blockedByAttendance),
    totalDetectedTeachingHours: sumBy(teacherComparisons, (row) => row.teachingHours),
    legacyTotalCapacityPerCall: sumBy(teacherComparisons, (row) => row.legacyDaysBasedLimit),
    teachingHoursTotalCapacityPerCall: sumBy(teacherComparisons, (row) => row.teachingHoursBasedLimit),
    capacityDeltaPerCall: sumBy(teacherComparisons, (row) => row.difference),
    ruleScope: 'COMMON_VOCALIAS_PER_CALL',
    attendanceEligibilityMaintained: true,
    legacyRuleMode: DAYS_MODE,
    currentRuleMode: HOURS_MODE,
    teachingHourMinutes: Number(options.minutesPerTeachingHour) || 40,
    teachingHoursSource: sourceDiagnostics.selectedSource,
  }

  if (summary.teachersWithoutTeachingHours > 0) {
    warnings.push({
      code: 'MISSING_TEACHING_HOURS_SOURCE',
      count: summary.teachersWithoutTeachingHours,
    })
  }
  if (sourceDiagnostics.horariosDocentes.duplicateBlocksIgnored > 0) {
    warnings.push({
      code: 'DUPLICATE_SCHEDULE_BLOCKS_IGNORED',
      count: sourceDiagnostics.horariosDocentes.duplicateBlocksIgnored,
    })
  }
  if (!sourceDiagnostics.horariosDocentes.totalRows && !sourceDiagnostics.docentes.rowsWithExplicitTeachingHours) {
    errors.push({
      code: 'NO_RELIABLE_TEACHING_HOURS_SOURCE',
    })
  }

  const riskCases = teacherComparisons
    .filter((row) => row.missingTeachingHours || row.missingAttendanceDays || row.blockedByAttendance)
    .map((row) => ({
      teacherAnonId: row.teacherAnonId,
      missingTeachingHours: row.missingTeachingHours,
      missingAttendanceDays: row.missingAttendanceDays,
      blockedByAttendance: row.blockedByAttendance,
      codes: [
        row.missingTeachingHours ? 'MISSING_TEACHING_HOURS_SOURCE' : '',
        row.missingAttendanceDays ? 'MISSING_ATTENDANCE_DAYS' : '',
        row.blockedByAttendance ? 'ATTENDANCE_ELIGIBILITY_BLOCK' : '',
      ].filter(Boolean),
    }))
  const recommendations = buildRecommendations(summary, sourceDiagnostics)

  return {
    summary: {
      ...summary,
      recommendation: recommendations.at(-1) ?? '',
    },
    templateDiagnostics: sourceDiagnostics,
    teacherComparisons,
    affectedTeachers: teacherComparisons.filter((row) => row.difference !== 0),
    riskCases,
    recommendations,
    warnings,
    errors,
  }
}
