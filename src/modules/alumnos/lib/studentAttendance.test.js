import { describe, expect, it } from 'vitest'
import { getAttendanceSummaryForEnrollment } from './studentAttendance.js'

describe('studentAttendance', () => {
  it('calcula porcentaje por materia usando subject_enrollment_id', () => {
    const enrollment = {
      id: 'legacy-enrollment-ing06',
      relational_id: 'rel-enrollment-ing06',
      student_id: 'student-1',
      subject_id: 'ING06',
      program_id: 'PROFESORADO DE INGLES',
    }
    const summary = getAttendanceSummaryForEnrollment(enrollment, [
      { id: 'att-1', student_id: 'student-1', subject_enrollment_id: 'rel-enrollment-ing06', status: 'present' },
      { id: 'att-2', student_id: 'student-1', subject_enrollment_id: 'rel-enrollment-ing06', status: 'absent' },
      { id: 'att-3', student_id: 'student-1', subject_enrollment_id: 'other-enrollment', status: 'present' },
    ])

    expect(summary).toEqual(expect.objectContaining({
      total: 2,
      present: 1,
      absent: 1,
      percentage: 50,
      label: '50%',
    }))
  })

  it('calcula porcentaje por materia usando datos de la clase', () => {
    const enrollment = {
      id: 'snapshot-enrollment-ing06',
      student_id: 'student-1',
      subject_id: 'ING06',
      program_id: 'PROFESORADO DE INGLES',
    }
    const summary = getAttendanceSummaryForEnrollment(enrollment, [
      { id: 'att-1', student_id: 'student-1', subject_id: 'ING06', program_id: 'profesorado de ingles', status: 'present' },
      { id: 'att-2', student_id: 'student-1', session: { subject_id: 'ING06', program_id: 'PROFESORADO DE INGLES' }, status: 'present' },
      { id: 'att-3', student_id: 'student-2', subject_id: 'ING06', program_id: 'PROFESORADO DE INGLES', status: 'absent' },
    ])

    expect(summary).toEqual(expect.objectContaining({
      total: 2,
      present: 2,
      absent: 0,
      percentage: 100,
    }))
  })
})
