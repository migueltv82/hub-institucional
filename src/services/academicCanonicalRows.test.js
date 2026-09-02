import { describe, expect, it } from 'vitest'
import {
  mapCanonicalExamEnrollment,
  mapCanonicalStudentGrade,
  mapCanonicalSubjectEnrollment,
} from './academicCanonicalRows.js'

describe('academicCanonicalRows', () => {
  it('mantiene el UUID relacional como id de una inscripcion', () => {
    expect(mapCanonicalSubjectEnrollment({
      id: 'enrollment-uuid', student_id: 'profile-uuid', student_record_id: 'record-uuid',
      subject_id: 'ING06', program_id: 'INGLES', legacy_snapshot_id: 'student-enrollment-legacy',
      status: 'enrolled',
    })).toEqual(expect.objectContaining({
      id: 'enrollment-uuid', subject_enrollment_id: 'enrollment-uuid',
      student_id: 'profile-uuid', profile_id: 'profile-uuid', student_record_id: 'record-uuid',
      legacy_snapshot_id: 'student-enrollment-legacy', status: 'active',
    }))
  })

  it('mantiene el UUID relacional como id de una inscripcion a mesa', () => {
    expect(mapCanonicalExamEnrollment({
      id: 'exam-enrollment-uuid', student_id: 'profile-uuid', exam_table_id: 'table-uuid',
      legacy_snapshot_id: 'legacy-exam-id', status: 'cancelled',
    })).toEqual(expect.objectContaining({
      id: 'exam-enrollment-uuid', exam_enrollment_id: 'exam-enrollment-uuid',
      profile_id: 'profile-uuid', exam_session_id: 'table-uuid',
      legacy_snapshot_id: 'legacy-exam-id', status: 'dropped',
    }))
  })

  it('entrega la misma forma de nota a los tres portales', () => {
    expect(mapCanonicalStudentGrade({
      id: 'grade-uuid', student_id: 'profile-uuid', student_record_id: 'record-uuid',
      subject_enrollment_id: 'enrollment-uuid', subject_id: 'ING06', program_id: 'INGLES',
      grade_type: 'final', grade_value: '8.00', academic_status: 'regular',
      updated_at: '2026-08-28T12:00:00Z',
    })).toEqual(expect.objectContaining({
      id: 'grade-uuid', student_id: 'profile-uuid', profile_id: 'profile-uuid',
      student_record_id: 'record-uuid', enrollment_id: 'enrollment-uuid',
      grade_value: 8, score: 8, academic_status: 'regular',
      graded_at: '2026-08-28T12:00:00Z',
    }))
  })
})
