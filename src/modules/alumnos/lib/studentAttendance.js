const EMPTY_ARRAY = []

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeIdentity(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '')
}

function sameIdentity(left, right) {
  const leftValue = clean(left)
  const rightValue = clean(right)

  return Boolean(
    leftValue &&
    rightValue &&
    (
      leftValue === rightValue ||
      normalizeText(leftValue) === normalizeText(rightValue) ||
      normalizeIdentity(leftValue) === normalizeIdentity(rightValue)
    ),
  )
}

function addSubjectAlias(aliases, value) {
  const identity = normalizeIdentity(value)
  if (!identity) return

  aliases.add(identity)

  const withoutLeadingZero = identity.match(/^([a-z]+)0+(\d+)$/)
  if (withoutLeadingZero) {
    aliases.add(`${withoutLeadingZero[1]}${Number(withoutLeadingZero[2])}`)
  }
}

function sameSubject(left, right) {
  const leftAliases = new Set()
  const rightAliases = new Set()

  addSubjectAlias(leftAliases, left)
  addSubjectAlias(rightAliases, right)

  return Array.from(leftAliases).some((alias) => rightAliases.has(alias))
}

function getEnrollmentIds(enrollment) {
  return [
    enrollment?.id,
    enrollment?.relational_id,
    enrollment?.subject_enrollment_id,
    enrollment?.legacy_snapshot_id,
  ].map(clean).filter(Boolean)
}

function getEnrollmentSubjectId(enrollment) {
  return clean(
    enrollment?.canonical_subject_id ||
    enrollment?.subject_id ||
    enrollment?.subject?.canonical_subject_id ||
    enrollment?.subject?.subject_id ||
    enrollment?.subject?.code ||
    enrollment?.subject?.id,
  )
}

function getEnrollmentProgramId(enrollment) {
  return clean(
    enrollment?.canonical_program_id ||
    enrollment?.program_id ||
    enrollment?.program ||
    enrollment?.carrera ||
    enrollment?.subject?.canonical_program_id ||
    enrollment?.subject?.program_id ||
    enrollment?.subject?.carrera,
  )
}

function getEnrollmentStudentId(enrollment) {
  return clean(enrollment?.student_id || enrollment?.profile_id || enrollment?.user_id)
}

function attendanceMatchesEnrollment(record, enrollment) {
  if (!record || !enrollment) return false

  const recordStudentId = clean(record.student_id || record.profile_id || record.user_id)
  const enrollmentStudentId = getEnrollmentStudentId(enrollment)
  if (recordStudentId && enrollmentStudentId && !sameIdentity(recordStudentId, enrollmentStudentId)) return false

  const enrollmentIds = new Set(getEnrollmentIds(enrollment))
  const recordEnrollmentId = clean(record.subject_enrollment_id || record.enrollment_id)
  if (recordEnrollmentId && enrollmentIds.has(recordEnrollmentId)) return true

  const recordSubjectId = clean(record.subject_id || record.session?.subject_id)
  const enrollmentSubjectId = getEnrollmentSubjectId(enrollment)
  if (!sameSubject(recordSubjectId, enrollmentSubjectId)) return false

  const recordProgramId = clean(record.program_id || record.session?.program_id)
  const enrollmentProgramId = getEnrollmentProgramId(enrollment)
  if (recordProgramId && enrollmentProgramId && !sameIdentity(recordProgramId, enrollmentProgramId)) return false

  return true
}

function normalizeAttendanceStatus(status) {
  return clean(status).toLowerCase() || 'present'
}

export function getAttendanceSummaryForEnrollment(enrollment, attendanceRecords = EMPTY_ARRAY) {
  const records = attendanceRecords.filter((record) => attendanceMatchesEnrollment(record, enrollment))
  const present = records.filter((record) => normalizeAttendanceStatus(record.status) === 'present').length
  const absent = records.filter((record) => normalizeAttendanceStatus(record.status) === 'absent').length
  const total = records.length
  const percentage = total > 0 ? Math.round((present / total) * 100) : null

  return {
    total,
    present,
    absent,
    percentage,
    label: percentage === null ? 'Sin registros' : `${percentage}%`,
    records,
  }
}
