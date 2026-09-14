function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value).toLowerCase()
}

const ACTIVE_STATUSES = new Set(['active', 'enrolled', 'cursando', 'regular', 'inscripto', 'inscripta'])
const INACTIVE_STATUSES = new Set(['dropped', 'cancelled', 'canceled', 'baja', 'abandonada', 'inactive', 'inactivo'])

function normalizeStatus(value) {
  const status = normalize(value)
  if (INACTIVE_STATUSES.has(status)) return 'inactive'
  if (ACTIVE_STATUSES.has(status)) return 'active'
  return status || 'pending'
}

function isActiveEnrollment(enrollment) {
  return normalizeStatus(enrollment?.status) === 'active'
}

function subjectIdOf(subject) {
  return clean(
    subject?.canonical_subject_id ||
    subject?.subject_id ||
    subject?.code ||
    subject?.codigo ||
    subject?.id,
  )
}

function programIdOf(subject) {
  return clean(subject?.canonical_program_id || subject?.program_id || subject?.carrera || subject?.career)
}

function enrollmentSubjectId(enrollment) {
  return clean(enrollment?.canonical_subject_id || enrollment?.subject_id || enrollment?.subject?.canonical_subject_id || enrollment?.subject?.subject_id || enrollment?.subject?.code)
}

function enrollmentProgramId(enrollment) {
  return clean(enrollment?.canonical_program_id || enrollment?.program_id || enrollment?.subject?.canonical_program_id || enrollment?.subject?.program_id || enrollment?.subject?.carrera)
}

function personIdOf(row) {
  return clean(row?.student_id || row?.profile_id || row?.user_id || row?.student_record_id || row?.record_id || row?.id)
}

function personNameOf(row) {
  const explicit = clean(row?.full_name || row?.display_name || row?.nombre_completo || row?.student_name || row?.name)
  if (explicit) return explicit

  const firstName = clean(row?.first_name || row?.nombre)
  const lastName = clean(row?.last_name || row?.apellido)
  const composed = [firstName, lastName].filter(Boolean).join(' ')
  return composed || clean(row?.email) || 'Alumno sin nombre'
}

function samePerson(left, right) {
  const leftId = normalize(personIdOf(left))
  const rightIds = [right?.id, right?.profile_id, right?.user_id, right?.record_id, right?.student_record_id]
    .map(normalize)
    .filter(Boolean)
  const leftEmail = normalize(left?.email)
  const rightEmail = normalize(right?.email)

  return Boolean(
    (leftId && rightIds.includes(leftId)) ||
    (leftEmail && rightEmail && leftEmail === rightEmail),
  )
}

function groupKey(subjectId, programId) {
  return `${normalize(subjectId)}::${normalize(programId)}`
}

function buildClassmatesFromSecureGroups({ secureGroups = [], subjects = [], enrollments = [] }) {
  const activeKeys = new Set(
    enrollments
      .filter(isActiveEnrollment)
      .map((enrollment) => groupKey(enrollmentSubjectId(enrollment), enrollmentProgramId(enrollment)))
      .filter((key) => key !== '::'),
  )

  return secureGroups
    .filter((group) => activeKeys.has(groupKey(group?.subject_id, group?.program_id)))
    .map((group) => {
      const subject = subjects.find((item) => groupKey(subjectIdOf(item), programIdOf(item)) === groupKey(group?.subject_id, group?.program_id))
      const classmates = Array.isArray(group?.classmates) ? group.classmates : []

      return {
        subject: subject ?? {
          id: clean(group?.subject_id),
          subject_id: clean(group?.subject_id),
          canonical_subject_id: clean(group?.subject_id),
          program_id: clean(group?.program_id),
          canonical_program_id: clean(group?.program_id),
          code: clean(group?.subject_id),
          name: clean(group?.subject_name) || clean(group?.subject_id) || 'Materia sin nombre',
        },
        classmates: dedupeClassmates(classmates),
      }
    })
}

function dedupeClassmates(rows) {
  const byKey = new Map()

  rows.forEach((row) => {
    const name = personNameOf(row)
    const key = normalize(personIdOf(row)) || normalize(row?.email) || normalize(name)
    if (!key || byKey.has(key)) return
    byKey.set(key, {
      id: personIdOf(row) || key,
      full_name: name,
    })
  })

  return Array.from(byKey.values()).sort((left, right) => left.full_name.localeCompare(right.full_name, 'es'))
}

export function buildStudentClassmateGroups({
  currentStudent,
  subjects = [],
  enrollments = [],
  workspaceSnapshot = {},
}) {
  const secureGroups = Array.isArray(workspaceSnapshot?.courseClassmates) ? workspaceSnapshot.courseClassmates : []
  if (secureGroups.length > 0) {
    return buildClassmatesFromSecureGroups({ secureGroups, subjects, enrollments })
  }

  const allEnrollments = Array.isArray(workspaceSnapshot?.enrollments) ? workspaceSnapshot.enrollments : []
  const activeCurrentEnrollments = enrollments.filter(isActiveEnrollment)

  return activeCurrentEnrollments
    .map((enrollment) => {
      const subjectId = enrollmentSubjectId(enrollment)
      const programId = enrollmentProgramId(enrollment)
      const subject = subjects.find((item) => groupKey(subjectIdOf(item), programIdOf(item)) === groupKey(subjectId, programId))
      const classmates = allEnrollments.filter((row) => (
        isActiveEnrollment(row) &&
        groupKey(enrollmentSubjectId(row), enrollmentProgramId(row)) === groupKey(subjectId, programId) &&
        !samePerson(row, currentStudent)
      ))

      return {
        subject: subject ?? enrollment.subject ?? {
          id: subjectId,
          subject_id: subjectId,
          canonical_subject_id: subjectId,
          program_id: programId,
          canonical_program_id: programId,
          code: subjectId,
          name: subjectId || 'Materia sin nombre',
        },
        classmates: dedupeClassmates(classmates),
      }
    })
    .filter((group, index, groups) => {
      const key = groupKey(subjectIdOf(group.subject), programIdOf(group.subject))
      return groups.findIndex((candidate) => groupKey(subjectIdOf(candidate.subject), programIdOf(candidate.subject)) === key) === index
    })
    .sort((left, right) => {
      const leftName = clean(left.subject?.name || left.subject?.code)
      const rightName = clean(right.subject?.name || right.subject?.code)
      return leftName.localeCompare(rightName, 'es')
    })
}
