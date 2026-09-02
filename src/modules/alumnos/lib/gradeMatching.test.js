import { describe, expect, it } from 'vitest'
import { findEnrollmentForGrade, getEnrollmentGrades, gradeMatchesEnrollment } from './gradeMatching.js'

describe('gradeMatching', () => {
  it('asocia notas relacionales por materia y carrera aunque no coincida enrollment_id', () => {
    const enrollment = {
      id: 'snapshot-enrollment-ing06',
      student_id: 'student-1',
      subject_id: 'ING06',
      program_id: 'PROFESORADO DE INGLES',
    }
    const grade = {
      id: 'grade-1',
      student_id: 'student-1',
      subject_enrollment_id: 'rel-enrollment-ing06',
      subject_id: 'ING06',
      program_id: 'profesorado de ingles',
      grade_type: 'final',
      grade_value: 8,
    }

    expect(gradeMatchesEnrollment(grade, enrollment)).toBe(true)
    expect(getEnrollmentGrades(enrollment, [grade])).toEqual([grade])
  })

  it('asocia notas por subject_enrollment_id contra el id relacional de la inscripcion', () => {
    const enrollment = {
      id: 'legacy-enrollment-ing06',
      relational_id: 'rel-enrollment-ing06',
      subject_id: 'ING06',
      program_id: 'PROFESORADO DE INGLES',
    }
    const grade = {
      id: 'grade-1',
      subject_enrollment_id: 'rel-enrollment-ing06',
      grade_type: 'partial',
      grade_value: 8,
    }

    expect(findEnrollmentForGrade(grade, [enrollment])).toBe(enrollment)
  })

  it('no cruza notas de otro alumno si ambos registros tienen student_id', () => {
    const enrollment = {
      id: 'snapshot-enrollment-ing06',
      student_id: 'student-1',
      subject_id: 'ING06',
      program_id: 'PROFESORADO DE INGLES',
    }
    const grade = {
      id: 'grade-1',
      student_id: 'student-2',
      subject_id: 'ING06',
      program_id: 'PROFESORADO DE INGLES',
      grade_type: 'final',
      grade_value: 8,
    }

    expect(gradeMatchesEnrollment(grade, enrollment)).toBe(false)
  })
})
