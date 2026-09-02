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

function addSubjectAlias(aliases, value) {
  const identity = normalizeIdentity(value)
  if (!identity) return

  aliases.add(identity)

  const withoutLeadingZero = identity.match(/^([a-z]+)0+(\d+)$/)
  if (withoutLeadingZero) {
    aliases.add(`${withoutLeadingZero[1]}${Number(withoutLeadingZero[2])}`)
  }
}

function subjectAliases(value) {
  const aliases = new Set()
  const raw = clean(value)

  addSubjectAlias(aliases, raw)
  normalizeText(raw)
    .split(/[:|/\\]+/)
    .forEach((part) => addSubjectAlias(aliases, part))

  return aliases
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

function sameSubject(left, right) {
  const leftAliases = subjectAliases(left)
  const rightAliases = subjectAliases(right)

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

function getGradeEnrollmentIds(grade) {
  return [
    grade?.enrollment_id,
    grade?.subject_enrollment_id,
    grade?.legacy_snapshot_id,
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

function getGradeSubjectId(grade) {
  return clean(
    grade?.canonical_subject_id ||
    grade?.subject_id ||
    grade?.subject?.canonical_subject_id ||
    grade?.subject?.subject_id ||
    grade?.subject?.code ||
    grade?.subject?.id,
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

function getGradeProgramId(grade) {
  return clean(
    grade?.canonical_program_id ||
    grade?.program_id ||
    grade?.program ||
    grade?.carrera ||
    grade?.subject?.canonical_program_id ||
    grade?.subject?.program_id ||
    grade?.subject?.carrera,
  )
}

function getEnrollmentStudentId(enrollment) {
  return clean(enrollment?.student_id || enrollment?.profile_id || enrollment?.user_id)
}

function getGradeStudentId(grade) {
  return clean(grade?.student_id || grade?.profile_id || grade?.user_id)
}

export function gradeMatchesEnrollment(grade, enrollment) {
  if (!grade || !enrollment) return false

  const gradeStudentId = getGradeStudentId(grade)
  const enrollmentStudentId = getEnrollmentStudentId(enrollment)
  if (gradeStudentId && enrollmentStudentId && !sameIdentity(gradeStudentId, enrollmentStudentId)) return false

  const enrollmentIds = new Set(getEnrollmentIds(enrollment))
  if (getGradeEnrollmentIds(grade).some((id) => enrollmentIds.has(id))) {
    return true
  }

  const gradeSubjectId = getGradeSubjectId(grade)
  const enrollmentSubjectId = getEnrollmentSubjectId(enrollment)
  if (!sameSubject(gradeSubjectId, enrollmentSubjectId)) return false

  const gradeProgramId = getGradeProgramId(grade)
  const enrollmentProgramId = getEnrollmentProgramId(enrollment)
  if (gradeProgramId && enrollmentProgramId && !sameIdentity(gradeProgramId, enrollmentProgramId)) return false

  return true
}

export function getEnrollmentGrades(enrollment, grades = EMPTY_ARRAY) {
  const embedded = Array.isArray(enrollment?.grades) ? enrollment.grades : []
  const external = grades.filter((grade) => gradeMatchesEnrollment(grade, enrollment))
  const seen = new Set()

  return [...embedded, ...external].filter((grade, index) => {
    const key = clean(grade?.id) ||
      [
        getGradeSubjectId(grade),
        getGradeProgramId(grade),
        clean(grade?.grade_type || grade?.type),
        clean(grade?.attempt_number || index),
      ].join('::')

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function findEnrollmentForGrade(grade, enrollments = EMPTY_ARRAY) {
  return enrollments.find((enrollment) => gradeMatchesEnrollment(grade, enrollment)) ?? null
}
