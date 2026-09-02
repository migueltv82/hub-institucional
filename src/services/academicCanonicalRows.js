function clean(value) {
  return String(value ?? '').trim()
}

export function mapCanonicalEnrollmentStatus(status) {
  const normalized = clean(status).toLowerCase()
  if (['cancelled', 'canceled'].includes(normalized)) return 'dropped'
  if (normalized === 'enrolled') return 'active'
  return normalized || 'pending'
}

export function mapCanonicalSubjectEnrollment(row) {
  return {
    ...row,
    id: clean(row?.id),
    relational_id: clean(row?.id),
    legacy_snapshot_id: clean(row?.legacy_snapshot_id) || null,
    student_id: clean(row?.student_id),
    profile_id: clean(row?.student_id),
    user_id: clean(row?.student_id),
    student_record_id: clean(row?.student_record_id) || null,
    subject_enrollment_id: clean(row?.id),
    institution_id: clean(row?.institution_id),
    workspace_key: clean(row?.workspace_key) || 'main',
    subject_id: clean(row?.subject_id),
    program_id: clean(row?.program_id),
    status: mapCanonicalEnrollmentStatus(row?.status),
    source: 'relational',
  }
}

export function mapCanonicalExamEnrollment(row) {
  const examTableId = clean(row?.exam_table_id)

  return {
    ...row,
    id: clean(row?.id),
    relational_id: clean(row?.id),
    legacy_snapshot_id: clean(row?.legacy_snapshot_id) || null,
    student_id: clean(row?.student_id),
    profile_id: clean(row?.student_id),
    user_id: clean(row?.student_id),
    student_record_id: clean(row?.student_record_id) || null,
    exam_enrollment_id: clean(row?.id),
    institution_id: clean(row?.institution_id),
    workspace_key: clean(row?.workspace_key) || 'main',
    program_id: clean(row?.program_id),
    exam_table_id: examTableId,
    exam_session_id: examTableId,
    subject_id: clean(row?.subject_id),
    status: mapCanonicalEnrollmentStatus(row?.status),
    dropped_at: row?.cancelled_at ?? row?.dropped_at ?? null,
    source: 'relational',
  }
}

function getMaxScore(gradeScale) {
  return clean(gradeScale) === 'numeric_0_100' ? 100 : 10
}

export function mapCanonicalStudentGrade(row) {
  const gradeValue = row?.grade_value === null || row?.grade_value === undefined
    ? null
    : Number(row.grade_value)

  return {
    ...row,
    id: clean(row?.id),
    relational_id: clean(row?.id),
    legacy_snapshot_id: clean(row?.legacy_snapshot_id) || null,
    student_id: clean(row?.student_id),
    profile_id: clean(row?.student_id),
    user_id: clean(row?.student_id),
    student_record_id: clean(row?.student_record_id) || null,
    subject_enrollment_id: clean(row?.subject_enrollment_id) || null,
    enrollment_id: clean(row?.subject_enrollment_id) || null,
    exam_enrollment_id: clean(row?.exam_enrollment_id) || null,
    institution_id: clean(row?.institution_id),
    workspace_key: clean(row?.workspace_key) || 'main',
    subject_id: clean(row?.subject_id),
    program_id: clean(row?.program_id),
    grade_type: clean(row?.grade_type) || 'final',
    attempt_number: Number(row?.attempt_number) || 1,
    grade_value: gradeValue,
    score: gradeValue,
    max_score: getMaxScore(row?.grade_scale),
    academic_status: clean(row?.academic_status) || 'pending',
    observations: clean(row?.observations),
    graded_at: row?.updated_at ?? row?.created_at ?? null,
    source: 'relational',
  }
}
