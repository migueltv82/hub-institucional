import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../../../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: mocks.invoke } },
}))

import { resetStudentSubjectAcademicRecords } from './teacherStudentAcademicReset.js'

describe('resetStudentSubjectAcademicRecords', () => {
  beforeEach(() => mocks.invoke.mockReset())

  it('envia la contrasena y el alcance exacto a la funcion protegida', async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null })

    await resetStudentSubjectAcademicRecords({
      institutionId: 'inst-1',
      studentId: 'student-1',
      subjectId: 'ING06',
      programId: 'Profesorado de Ingles',
      currentPassword: 'clave-segura',
    })

    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', {
      body: expect.objectContaining({
        action: 'teacher_reset_student_subject_academic_records',
        institution_id: 'inst-1',
        workspace_key: 'main',
        student_id: 'student-1',
        subject_id: 'ING06',
        program_id: 'Profesorado de Ingles',
        current_password: 'clave-segura',
      }),
    })
  })

  it('no invoca el servidor sin contrasena', async () => {
    await expect(resetStudentSubjectAcademicRecords({
      institutionId: 'inst-1',
      studentId: 'student-1',
      subjectId: 'ING06',
      currentPassword: '',
    })).rejects.toThrow(/contrasena/i)

    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
