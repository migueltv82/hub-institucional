// Resolucion de estado academico (regular/aprobada/etc.) compartida entre
// examEligibility.js y prerequisites.js. Vive en un modulo propio para que
// ninguno de los dos importe del otro (evita un import circular).
const PASSING_SCORE = 6

export const ACADEMIC_STATUS_LABELS = {
  pending: 'Pendiente',
  regular: 'Regular',
  libre: 'Libre',
  promocionado: 'Promocionado',
  approved: 'Aprobada',
  failed: 'Desaprobada',
  absent: 'Ausente',
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function normalizeAcademicStatus(status) {
  const normalized = normalizeText(status)

  if (!normalized) return 'pending'
  if (['regular'].includes(normalized)) return 'regular'
  if (['libre', 'free'].includes(normalized)) return 'libre'
  if (['promocionado', 'promocionada', 'promoted'].includes(normalized)) return 'promocionado'
  if (['approved', 'passed', 'completed', 'aprobado', 'aprobada', 'finalizado', 'finalizada'].includes(normalized)) return 'approved'
  if (['failed', 'desaprobado', 'desaprobada', 'reprobado', 'reprobada'].includes(normalized)) return 'failed'
  if (['absent', 'ausente'].includes(normalized)) return 'absent'
  if (['pending', 'pendiente', 'sin estado'].includes(normalized)) return 'pending'

  if (['active', 'enrolled', 'cursando', 'inscripto', 'inscripta'].includes(normalized)) {
    return 'pending'
  }

  return normalized
}

export function getAcademicStatusLabel(status) {
  const normalized = normalizeAcademicStatus(status)
  return ACADEMIC_STATUS_LABELS[normalized] || clean(status) || ACADEMIC_STATUS_LABELS.pending
}

export function getSubjectId(row) {
  const subject = row?.subject || row?.exam_session?.subject
  return clean(
    row?.canonical_subject_id ||
    row?.subject_id ||
    row?.subject_code ||
    row?.code ||
    subject?.canonical_subject_id ||
    subject?.subject_id ||
    subject?.code ||
    subject?.id,
  )
}

export function getProgramId(row) {
  const subject = row?.subject || row?.exam_session?.subject
  return clean(
    row?.canonical_program_id ||
    row?.program_id ||
    row?.program ||
    row?.carrera ||
    subject?.canonical_program_id ||
    subject?.program_id ||
    subject?.carrera,
  )
}

function getGradeScore(grade) {
  const score = Number(grade?.score ?? grade?.final_grade ?? grade?.grade_value ?? grade?.value)
  return Number.isFinite(score) ? score : null
}

function getGradeType(grade) {
  return normalizeText(grade?.grade_type || grade?.type || 'final')
}

function getTimestamp(row) {
  const value = row?.updated_at || row?.graded_at || row?.created_at || ''
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

// El criterio autoritativo es la RPC upsert_exam_enrollment_from_portal:
// compara subject_id y program_id exactos contra student_grades. Esto solo
// espeja ese filtro para evitar una habilitacion optimista en la UI.
export function matchesSubjectAndProgram(row, subjectId, programId) {
  const rowSubjectId = getSubjectId(row)
  const rowProgramId = getProgramId(row)
  const targetSubjectId = clean(subjectId)
  const targetProgramId = clean(programId)

  return Boolean(
    rowSubjectId &&
    targetSubjectId &&
    rowSubjectId === targetSubjectId &&
    rowProgramId === targetProgramId,
  )
}

function statusFromGrade(grade) {
  const explicitStatus = clean(grade?.academic_status || grade?.condition || grade?.condicion)
  if (explicitStatus) {
    const academicStatus = normalizeAcademicStatus(explicitStatus)
    if (academicStatus !== 'pending') return academicStatus
  }

  if (getGradeType(grade) !== 'final') return ''

  const score = getGradeScore(grade)
  if (score === null) return ''
  return score >= PASSING_SCORE ? 'approved' : 'failed'
}

export function getLatestAcademicStatusForSubject({
  subjectId,
  programId = '',
  grades = [],
}) {
  const matchingGrades = grades
    .filter((grade) => matchesSubjectAndProgram(grade, subjectId, programId))
    .sort((left, right) => getTimestamp(right) - getTimestamp(left))

  for (const grade of matchingGrades) {
    const gradeStatus = statusFromGrade(grade)
    if (gradeStatus) return gradeStatus
  }

  return 'pending'
}
