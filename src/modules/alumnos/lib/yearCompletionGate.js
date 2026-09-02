import { getLatestAcademicStatusForSubject } from './academicStatus.js'

const DEFAULT_GATE_OFFSET = 2
const GATE_STARTS_AT_YEAR = 3

function getSubjectId(subject) {
  return subject?.canonical_subject_id || subject?.subject_id || subject?.id || null
}

function getSubjectProgramId(subject) {
  return subject?.canonical_program_id || subject?.program_id || subject?.carrera || ''
}

function getSubjectYearLevel(subject) {
  const value = Number(subject?.semester ?? subject?.year_level ?? subject?.anio)
  return Number.isFinite(value) ? value : null
}

// Espejo del gate de "anio completo" de la migracion 15
// (upsert_subject_enrollment_from_portal): para cursar el anio N (N>=3) de
// una carrera, deben estar aprobadas todas las materias de los anios
// 1..(N - gateOffset). gateOffset es 2 salvo que se pase un override
// puntual por carrera (equivalente a legacy_career_year_gate_overrides).
export function getYearCompletionGateCheck({
  subject,
  subjects = [],
  grades = [],
  gateOffset = DEFAULT_GATE_OFFSET,
}) {
  const targetYear = getSubjectYearLevel(subject)
  const programId = getSubjectProgramId(subject)

  if (targetYear === null || targetYear < GATE_STARTS_AT_YEAR) {
    return { applies: false, missing: [], canEnroll: true }
  }

  const missing = subjects.filter((candidate) => {
    if (getSubjectProgramId(candidate) !== programId) return false
    const year = getSubjectYearLevel(candidate)
    if (year === null || year < 1 || year > targetYear - gateOffset) return false

    const status = getLatestAcademicStatusForSubject({
      subjectId: getSubjectId(candidate),
      programId,
      grades,
    })

    return !['promocionado', 'approved'].includes(status)
  })

  return {
    applies: true,
    missing,
    canEnroll: missing.length === 0,
  }
}
