import { describe, expect, it, vi } from 'vitest'
import {
  canonicalizeStudent,
  fetchInstitutionAcademicCanonicalData,
} from './academicCanonicalData.js'

const mocks = vi.hoisted(() => ({ fetchStudentRecords: vi.fn(), fetchGrades: vi.fn() }))

vi.mock('./rosterRecords.js', () => ({ fetchStudentRecords: mocks.fetchStudentRecords }))
vi.mock('./studentGrades.js', () => ({ fetchInstitutionStudentGrades: mocks.fetchGrades }))

describe('academicCanonicalData', () => {
  it('convierte una fila legacy al contrato de identidad relacional', () => {
    const student = canonicalizeStudent(
      { id: 'legacy-10', email: 'ana@example.com', carrera: 'INGLES' },
      [{ id: 'record-1', profile_id: 'profile-1', email: 'ana@example.com', career: 'INGLES', dni: '30111222' }],
    )

    expect(student).toEqual(expect.objectContaining({
      id: 'legacy-10',
      student_record_id: 'record-1',
      record_id: 'record-1',
      student_id: 'profile-1',
      profile_id: 'profile-1',
      user_id: 'profile-1',
      academic_identity_source: 'student_records',
    }))
  })

  it('no adivina por email cuando existen dos registros ambiguos', () => {
    const legacy = { id: 'legacy-10', email: 'ana@example.com' }
    expect(canonicalizeStudent(legacy, [
      { id: 'record-1', profile_id: 'profile-1', email: 'ana@example.com' },
      { id: 'record-2', profile_id: 'profile-1', email: 'ana@example.com' },
    ])).toBe(legacy)
  })

  it('carga padron y notas institucionales como una sola unidad', async () => {
    mocks.fetchStudentRecords.mockResolvedValue([{ id: 'record-1' }])
    mocks.fetchGrades.mockResolvedValue([{ id: 'grade-1' }])

    await expect(fetchInstitutionAcademicCanonicalData({
      institutionId: 'institution-1', workspaceKey: 'main', useRemote: true,
    })).resolves.toEqual({
      studentRecords: [{ id: 'record-1' }], grades: [{ id: 'grade-1' }],
    })
  })
})
