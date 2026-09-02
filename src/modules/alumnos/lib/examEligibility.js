import {
  ACADEMIC_STATUS_LABELS,
  getAcademicStatusLabel,
  getLatestAcademicStatusForSubject,
  getProgramId,
  getSubjectId,
  matchesSubjectAndProgram,
  normalizeAcademicStatus,
} from './academicStatus.js'
import { getFinalExamPrerequisiteCheck } from './prerequisites.js'

export {
  ACADEMIC_STATUS_LABELS,
  getAcademicStatusLabel,
  getLatestAcademicStatusForSubject,
  normalizeAcademicStatus,
}

export const EXAM_ELIGIBLE_ACADEMIC_STATUSES = new Set(['regular'])

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function parseAcademicDate(value) {
  const raw = clean(value)
  const manualDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const normalized = manualDate ? `${manualDate[3]}-${manualDate[2]}-${manualDate[1]}T00:00:00` : raw
  const timestamp = Date.parse(normalized)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function isAbsentRecord(row) {
  const value = row?.ausente ?? row?.absent
  if (typeof value === 'boolean') return value
  return ['1', 'si', 'sí', 'true', 'x'].includes(normalizeText(value))
}

function getExamCallKey(exam) {
  return clean(exam?.exam_call || exam?.call_label || exam?.llamado || exam?.llamadoNumero || exam?.call_number)
}

function getExamDateTimestamp(exam) {
  return parseAcademicDate(exam?.exam_date || exam?.exam_session?.exam_date || exam?.date)
}

export function getAbsencePenaltyForExam({ exam, exams = [], grades = [] }) {
  const subjectId = getSubjectId(exam)
  const programId = getProgramId(exam)
  const examTimestamp = getExamDateTimestamp(exam)
  const latestAbsence = grades
    .filter((grade) => isAbsentRecord(grade) && matchesSubjectAndProgram(grade, subjectId, programId))
    .map((grade) => ({
      grade,
      timestamp: parseAcademicDate(grade.fecha_ausencia || grade.absence_date || grade.absent_at),
    }))
    .filter((entry) => entry.timestamp && entry.timestamp < examTimestamp)
    .sort((left, right) => right.timestamp - left.timestamp)[0]

  if (!latestAbsence) return { blocked: false, absenceDate: '', reason: '' }

  const followingExams = exams
    .filter((candidate) => (
      matchesSubjectAndProgram(candidate, subjectId, programId) &&
      getExamDateTimestamp(candidate) > latestAbsence.timestamp
    ))
    .sort((left, right) => getExamDateTimestamp(left) - getExamDateTimestamp(right))
  const nextExam = followingExams[0]
  if (!nextExam) return { blocked: false, absenceDate: '', reason: '' }

  const nextCallKey = getExamCallKey(nextExam)
  const currentCallKey = getExamCallKey(exam)
  const blocked = nextCallKey
    ? currentCallKey === nextCallKey
    : getExamDateTimestamp(exam) === getExamDateTimestamp(nextExam)
  const absenceDate = clean(latestAbsence.grade.fecha_ausencia || latestAbsence.grade.absence_date || latestAbsence.grade.absent_at)

  return {
    blocked,
    absenceDate,
    reason: blocked
      ? `Inscripcion bloqueada por ausencia del ${absenceDate}. Corresponde cumplir la mesa castigo en este llamado.`
      : '',
  }
}

function getBlockedReason(status) {
  const label = getAcademicStatusLabel(status)

  if (status === 'pending') {
    return 'Todavia no hay condicion regular cargada para esta materia.'
  }

  if (status === 'promocionado' || status === 'approved') {
    return `La materia figura como ${label.toLowerCase()}; no requiere inscripcion a esta mesa.`
  }

  if (status === 'libre') {
    return 'La condicion cargada es libre; esta mesa requiere regularidad.'
  }

  return `La condicion cargada es ${label.toLowerCase()}; esta mesa requiere regularidad.`
}

// Mismo texto que la migracion 14 (upsert_exam_enrollment_from_portal): si
// cambia uno, hay que cambiar el otro. Ver CLAUDE.md sobre por que el
// espejo cliente nunca puede ser mas permisivo que la RPC.
function getMissingPrerequisitesReason(missingSubjects) {
  const names = missingSubjects.map((subject) => subject?.name || subject?.code || subject?.id).filter(Boolean)
  return `Correlativas pendientes para rendir esta mesa: ${names.join(', ')}. Deben figurar aprobadas.`
}

const ADEUDA_CUOTA_REASON = 'No podes inscribirte a mesas: el registro indica que adeudas el pago de la cuota.'

export function getExamEnrollmentEligibility({
  exam,
  exams = [],
  enrollments = [],
  grades = [],
  prerequisites = [],
  subjects = [],
  adeudaCuota = false,
}) {
  const subjectId = getSubjectId(exam)
  const programId = getProgramId(exam)
  const academicStatus = getLatestAcademicStatusForSubject({
    subjectId,
    programId,
    enrollments,
    grades,
  })
  const hasRegularCondition = EXAM_ELIGIBLE_ACADEMIC_STATUSES.has(academicStatus)
  const absencePenalty = getAbsencePenaltyForExam({ exam, exams, grades })
  const prerequisiteCheck = hasRegularCondition
    ? getFinalExamPrerequisiteCheck({ subjectId, prerequisites, grades, subjects })
    : null
  const missingPrerequisiteSubjects = (prerequisiteCheck?.missing ?? []).map((entry) => entry.subject)

  let reason = ''
  if (!hasRegularCondition) {
    reason = getBlockedReason(academicStatus)
  } else if (missingPrerequisiteSubjects.length > 0) {
    reason = getMissingPrerequisitesReason(missingPrerequisiteSubjects)
  } else if (absencePenalty.blocked) {
    reason = absencePenalty.reason
  } else if (adeudaCuota) {
    reason = ADEUDA_CUOTA_REASON
  }

  const canRegister = Boolean(
    hasRegularCondition &&
    missingPrerequisiteSubjects.length === 0 &&
    !absencePenalty.blocked &&
    !adeudaCuota,
  )

  return {
    canRegister,
    subjectId,
    programId,
    academicStatus,
    label: getAcademicStatusLabel(academicStatus),
    absencePenalty,
    missingPrerequisites: missingPrerequisiteSubjects,
    adeudaCuota: Boolean(adeudaCuota),
    reason,
  }
}
