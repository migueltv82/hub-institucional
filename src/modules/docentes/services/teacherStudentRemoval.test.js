import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('../../../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: mocks.invoke } },
}))

import { removeStudentFromTeacherSubject } from './teacherStudentRemoval.js'

describe('removeStudentFromTeacherSubject', () => {
  beforeEach(() => mocks.invoke.mockReset())

  it('envia la contraseña y el alcance exacto a la funcion protegida', async () => {
    mocks.invoke.mockResolvedValue({ data: { success: true }, error: null })

    await removeStudentFromTeacherSubject({
      institutionId: 'inst-1',
      studentId: 'student-1',
      subjectId: 'ING06',
      programId: 'Profesorado de Ingles',
      currentPassword: 'clave-segura',
    })

    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', {
      body: expect.objectContaining({
        action: 'teacher_remove_student_subject_records',
        institution_id: 'inst-1',
        student_id: 'student-1',
        subject_id: 'ING06',
        program_id: 'Profesorado de Ingles',
        current_password: 'clave-segura',
      }),
    })
  })

  it('no invoca el servidor sin contraseña', async () => {
    await expect(removeStudentFromTeacherSubject({
      institutionId: 'inst-1', studentId: 'student-1', subjectId: 'ING06', currentPassword: '',
    })).rejects.toThrow(/contraseña/i)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
