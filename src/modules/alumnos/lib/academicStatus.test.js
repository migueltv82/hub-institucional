import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXAM_APPROVAL_MIN_GRADE } from '../../../services/examActaResults.js'
import { PASSING_SCORE, getLatestAcademicStatusForSubject } from './academicStatus.js'

const finalGrade = (grade_value) => [{ subject_id: 'ING08', program_id: 'PROFESORADO DE INGLES', grade_type: 'final', grade_value, updated_at: '2026-10-01T10:00:00.000Z' }]
const statusFor = (grade_value) => getLatestAcademicStatusForSubject({ subjectId: 'ING08', programId: 'PROFESORADO DE INGLES', grades: finalGrade(grade_value) })

describe('academicStatus: umbral de aprobacion', () => {
  it('es el mismo del acta: 4, en el front y en el CHECK de exam_results', () => {
    expect(PASSING_SCORE).toBe(4)
    expect(PASSING_SCORE).toBe(EXAM_APPROVAL_MIN_GRADE)
    const examTables = readFileSync(resolve('supabase/schema/08_exam_tables.sql'), 'utf8')
    expect(examTables).toContain("check (result <> 'approved' or final_grade >= 4)")
  })

  it('una nota final sin condicion cargada aprueba desde 4', () => {
    expect(statusFor(4)).toBe('approved')
    expect(statusFor(5.5)).toBe('approved')
    expect(statusFor(3.99)).toBe('failed')
  })

  it('las paginas del portal alumno usan la constante, no un numero suelto', () => {
    for (const page of ['StudentGradesPage', 'StudentAcademicStatusPage', 'StudentDashboardPage']) {
      const source = readFileSync(resolve(`src/modules/alumnos/pages/${page}.jsx`), 'utf8')
      expect(source).toContain('PASSING_SCORE')
      expect(source).not.toMatch(/(score|Score) >= 6\b/)
    }
  })
})
