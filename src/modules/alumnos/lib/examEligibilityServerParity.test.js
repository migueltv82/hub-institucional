import { describe, expect, it } from 'vitest'
import { getServerAcademicStatusForSubject } from './academicStatus.js'
import { getExamEnrollmentEligibility } from './examEligibility.js'
import { getFinalExamPrerequisiteCheck } from './prerequisites.js'

// Casos tomados de la prueba diferencial contra upsert_exam_enrollment_from_portal
// (scripts/validateExamEligibilityParityLocal.mjs). El espejo nunca puede habilitar
// algo que la RPC rechaza.
const exam = { subject_id: 'FIX-A-01', program_id: 'Fixture Career A' }
const grade = (academic_status, minutes, extra = {}) => ({
  subject_id: 'FIX-A-01',
  program_id: 'Fixture Career A',
  academic_status,
  updated_at: new Date(Date.UTC(2026, 9, 1, 0, minutes)).toISOString(),
  created_at: new Date(Date.UTC(2026, 9, 1, 0, minutes)).toISOString(),
  ...extra,
})
const canRegister = (grades) => getExamEnrollmentEligibility({ exam, grades }).canRegister

describe('espejo de elegibilidad identico a la RPC de mesa', () => {
  it('no habilita estados no canonicos que la RPC rechaza', () => {
    expect(canRegister([grade('Regular', 10)])).toBe(false)
    expect(canRegister([grade('regular ', 10)])).toBe(false)
    expect(canRegister([grade('regular', 10), grade('Pendiente', 20)])).toBe(false)
    expect(canRegister([grade('regular', 10), grade('cursando', 20)])).toBe(false)
  })

  it('explica cuando la condicion se ve regular pero no esta en formato canonico', () => {
    const result = getExamEnrollmentEligibility({ exam, grades: [grade('Regular', 10)] })
    expect(result.academicStatus).toBe('regular')
    expect(result.serverAcademicStatus).toBe('Regular')
    expect(result.reason).toContain('formato que valida el sistema')
  })

  it('ignora solo pending exacto y desempata por created_at como la RPC', () => {
    expect(canRegister([grade('regular', 10), grade('pending', 20, { grade_value: 8, grade_type: 'final' })])).toBe(true)
    expect(canRegister([
      grade('libre', 10, { created_at: '2026-10-01T00:01:00.000Z' }),
      grade('regular', 10, { created_at: '2026-10-01T00:05:00.000Z' }),
    ])).toBe(true)
    expect(canRegister([grade('regular', 10), grade('libre', 20)])).toBe(false)
    expect(canRegister([grade('libre', 10), grade('regular', 20)])).toBe(true)
  })

  it('excluye notas borradas y exige identificadores exactos', () => {
    expect(canRegister([grade('libre', 10), grade('regular', 20, { deleted_at: '2026-10-02T00:00:00.000Z' })])).toBe(false)
    expect(canRegister([grade('regular', 10, { subject_id: 'fix-a-01' })])).toBe(false)
    expect(canRegister([grade('regular', 10, { program_id: 'Other Career' })])).toBe(false)
  })

  it('trata la carrera vacia como valor exacto y nunca como comodin', () => {
    expect(getServerAcademicStatusForSubject({ subjectId: 'X1', programIds: [''], grades: [{ subject_id: 'X1', program_id: '', academic_status: 'regular' }] })).toBe('regular')
    expect(getServerAcademicStatusForSubject({ subjectId: 'X1', programIds: [''], grades: [{ subject_id: 'X1', program_id: 'Career', academic_status: 'regular' }] })).toBeNull()
    expect(getServerAcademicStatusForSubject({ subjectId: '', programIds: ['Career'], grades: [{ subject_id: '', program_id: 'Career', academic_status: 'regular' }] })).toBeNull()
  })

  it('exige correlativas aprobadas con valor exacto, como la RPC', () => {
    const prerequisites = [{ subject_id: 'FIX-A-02', prerequisite_subject: { code: 'FIX-A-01', program_id: 'Fixture Career A' } }]
    const check = (status) => getFinalExamPrerequisiteCheck({ subjectId: 'FIX-A-02', prerequisites, grades: [grade(status, 10)] }).canTakeFinalExam
    expect(check('approved')).toBe(true)
    expect(check('promocionado')).toBe(true)
    expect(check('Aprobada')).toBe(false)
    expect(check('aprobado')).toBe(false)
    expect(check('regular')).toBe(false)
  })
})
