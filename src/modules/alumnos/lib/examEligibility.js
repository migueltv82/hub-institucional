import {
  ACADEMIC_STATUS_LABELS,
  getAcademicStatusLabel,
  getLatestAcademicStatusForSubject,
  getProgramId,
  getServerAcademicStatusForSubject,
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

// F1b: espejo de exam_enrollment_assert_eligible. Un llamado es (periodo, llamado): periodo = anio-mes de la
// fecha de la mesa (exam_period_key) y llamado = exam_call de la mesa publicada, 'first' si falta
// (exam_call_key). Mismo criterio que publish_exam_tables_from_schedule.
function getExamCallSlot(exam) {
  const rawDate = clean(exam?.exam_date || exam?.exam_session?.exam_date || exam?.date)
  const period = /^\d{4}-\d{2}/.test(rawDate) ? rawDate.slice(0, 7) : ''
  return `${period}|${clean(exam?.exam_call) || 'first'}`
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

  const blocked = getExamCallSlot(exam) === getExamCallSlot(nextExam)
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

// Espejo de publish_exam_tables_from_schedule: la inscripcion cierra 24 h antes del inicio de la mesa.
// Las fechas del cronograma son hora de Argentina (UTC-3, sin horario de verano), como en la base.
export const EXAM_ENROLLMENT_CLOSE_HOURS = 24
const ARGENTINA_OFFSET = '-03:00'

export function getExamEnrollmentDeadline(exam) {
  const raw = clean(exam?.exam_date || exam?.exam_session?.exam_date || exam?.date)
  if (!raw) return 0
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw) ? `${raw}${ARGENTINA_OFFSET}` : raw
  const startsAt = Date.parse(withZone)
  return Number.isFinite(startsAt) ? startsAt - EXAM_ENROLLMENT_CLOSE_HOURS * 3600 * 1000 : 0
}

const ENROLLMENT_CLOSED_REASON = 'La inscripcion cerro 24 horas antes del examen. Si necesitas inscribirte, consulta en administracion.'

const NON_CANONICAL_CONDITION_REASON = 'La condicion cargada no esta registrada en el formato que valida el sistema para mesas. Pedi a tu docente o a la institucion que la vuelva a cargar.'

const ADEUDA_CUOTA_REASON = 'No podes inscribirte a mesas: el registro indica que adeudas el pago de la cuota.'

export function getExamEnrollmentEligibility({
  exam,
  exams = [],
  enrollments = [],
  grades = [],
  prerequisites = [],
  subjects = [],
  adeudaCuota = false,
  now = Date.now(),
}) {
  const subjectId = getSubjectId(exam)
  const programId = getProgramId(exam)
  const academicStatus = getLatestAcademicStatusForSubject({
    subjectId,
    programId,
    enrollments,
    grades,
  })
  // La habilitacion sale de la misma regla literal que la RPC; academicStatus queda solo para mostrar.
  const serverAcademicStatus = getServerAcademicStatusForSubject({ subjectId, programIds: [programId], grades })
  const hasRegularCondition = EXAM_ELIGIBLE_ACADEMIC_STATUSES.has(serverAcademicStatus)
  const absencePenalty = getAbsencePenaltyForExam({ exam, exams, grades })
  const prerequisiteCheck = hasRegularCondition
    ? getFinalExamPrerequisiteCheck({ subjectId, prerequisites, grades, subjects })
    : null
  const missingPrerequisiteSubjects = (prerequisiteCheck?.missing ?? []).map((entry) => entry.subject)

  const enrollmentDeadline = getExamEnrollmentDeadline(exam)
  const enrollmentClosed = Boolean(enrollmentDeadline && now > enrollmentDeadline)

  let reason = ''
  if (enrollmentClosed) {
    reason = ENROLLMENT_CLOSED_REASON
  } else if (!hasRegularCondition) {
    reason = academicStatus === 'regular' ? NON_CANONICAL_CONDITION_REASON : getBlockedReason(academicStatus)
  } else if (missingPrerequisiteSubjects.length > 0) {
    reason = getMissingPrerequisitesReason(missingPrerequisiteSubjects)
  } else if (absencePenalty.blocked) {
    reason = absencePenalty.reason
  } else if (adeudaCuota) {
    reason = ADEUDA_CUOTA_REASON
  }

  const canRegister = Boolean(
    !enrollmentClosed &&
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
    serverAcademicStatus,
    label: getAcademicStatusLabel(academicStatus),
    absencePenalty,
    missingPrerequisites: missingPrerequisiteSubjects,
    adeudaCuota: Boolean(adeudaCuota),
    enrollmentDeadline,
    enrollmentClosed,
    reason,
  }
}
