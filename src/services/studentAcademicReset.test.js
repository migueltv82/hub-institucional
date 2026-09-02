import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

describe('studentAcademicReset', () => {
  it('limpia todas las fuentes academicas del alumno en el snapshot', async () => {
    vi.doMock('../lib/supabase.js', () => ({
      isSupabaseConfigured: false,
      supabase: null,
    }))
    const { resetStudentAcademicSnapshotData } = await import('./studentAcademicReset.js')
    const student = {
      profile_id: 'student-1',
      record_id: 'record-1',
      email: 'yamil@example.com',
      dni: '123',
      full_name: 'Yamil Campos',
    }

    const result = resetStudentAcademicSnapshotData({
      estadoAcademico: [{ dni: '123' }, { dni: '999' }],
      academicStatusRows: [{ email: 'yamil@example.com' }, { email: 'otra@example.com' }],
      enrollments: [
        { id: 'enrollment-1', student_id: 'student-1' },
        { id: 'enrollment-2', student_id: 'student-2' },
      ],
      grades: [
        { id: 'grade-1', student_id: 'student-1' },
        { id: 'grade-2', enrollment_id: 'enrollment-1' },
        { id: 'grade-3', student_id: 'student-2' },
      ],
      examEnrollments: [
        { id: 'exam-1', student_record_id: 'record-1' },
        { id: 'exam-2', student_record_id: 'record-2' },
      ],
      attendanceRecords: [
        { id: 'attendance-1', subject_enrollment_id: 'enrollment-1' },
        { id: 'attendance-2', subject_enrollment_id: 'enrollment-2' },
      ],
      subjectAttendanceRecords: [
        { id: 'subject-attendance-1', student_id: 'student-1' },
        { id: 'subject-attendance-2', student_id: 'student-2' },
      ],
      academicStatus: { student_id: 'student-1', status: 'regular' },
    }, student)

    expect(result.estadoAcademico).toEqual([{ dni: '999' }])
    expect(result.academicStatusRows).toEqual([{ email: 'otra@example.com' }])
    expect(result.enrollments).toEqual([{ id: 'enrollment-2', student_id: 'student-2' }])
    expect(result.grades).toEqual([{ id: 'grade-3', student_id: 'student-2' }])
    expect(result.examEnrollments).toEqual([{ id: 'exam-2', student_record_id: 'record-2' }])
    expect(result.attendanceRecords).toEqual([{ id: 'attendance-2', subject_enrollment_id: 'enrollment-2' }])
    expect(result.subjectAttendanceRecords).toEqual([{ id: 'subject-attendance-2', student_id: 'student-2' }])
    expect(result.academicStatus).toBeNull()
  })

  it('invoca admin-users con doble confirmacion por contrasena', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { success: true },
      error: null,
    })
    vi.doMock('../lib/supabase.js', () => ({
      isSupabaseConfigured: true,
      supabase: { functions: { invoke } },
    }))
    const { resetStudentAcademicRecords } = await import('./studentAcademicReset.js')

    await resetStudentAcademicRecords({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      student: {
        profile_id: 'student-1',
        record_id: 'record-1',
        email: 'YAMIL@EXAMPLE.COM',
        dni: '123',
        full_name: 'Yamil Campos',
      },
      currentPassword: 'clave-segura',
      useRemote: true,
    })

    expect(invoke).toHaveBeenCalledWith('admin-users', {
      body: {
        action: 'reset_student_academic_records',
        institution_id: 'inst-1',
        workspace_key: 'main',
        current_password: 'clave-segura',
        student: {
          profile_id: 'student-1',
          student_record_id: 'record-1',
          email: 'yamil@example.com',
          dni: '123',
          full_name: 'Yamil Campos',
        },
      },
    })
  })
})
