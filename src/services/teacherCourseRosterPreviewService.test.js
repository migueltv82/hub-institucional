import { describe, expect, it, vi } from 'vitest'
import {
  getMyTeacherCourseRosterPreview,
  getTeacherCourseRosterPreviewForAdmin,
  TEACHER_COURSE_ROSTER_PREVIEW_RPC,
} from './teacherCourseRosterPreviewService.js'

function rawPreview() {
  return {
    status: 'READY',
    teacher: { teacherId: 'teacher-1', displayName: 'Docente Uno', email: 'not-returned@example.invalid' },
    assignments: [{
      teachingAssignmentId: 'assignment-1',
      courseOfferingId: 'offering-1',
      subjectName: 'Materia Uno',
      careerName: 'Carrera Uno',
      roster: [{
        courseEnrollmentId: 'enrollment-1',
        studentId: 'student-1',
        studentRecordId: 'record-1',
        studentDisplayName: 'Alumno Uno',
        dni: 'should-not-leak',
        email: 'should-not-leak@example.invalid',
        phone: 'should-not-leak',
      }],
    }],
  }
}

describe('teacherCourseRosterPreviewService', () => {
  it('consulta el modo docente solo por RPC y no envia teacher libre', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: rawPreview(), error: null }), from: vi.fn() }
    const model = await getMyTeacherCourseRosterPreview({ institutionId: 'institution-1' }, { client })

    expect(client.rpc).toHaveBeenCalledWith(TEACHER_COURSE_ROSTER_PREVIEW_RPC, {
      p_institution_id: 'institution-1',
      p_teacher_id: null,
    })
    expect(client.from).not.toHaveBeenCalled()
    expect(model.assignments[0].roster[0]).toEqual({
      courseEnrollmentId: 'enrollment-1',
      studentCareerEnrollmentId: '',
      studentRecordId: 'record-1',
      studentId: 'student-1',
      studentDisplayName: 'Alumno Uno',
      studentCareerStatus: '',
      courseEnrollmentType: '',
      courseEnrollmentStatus: '',
      enrolledAt: '',
    })
    expect(JSON.stringify(model)).not.toContain('should-not-leak')
  })

  it('permite al servicio admin enviar docente objetivo por la misma RPC', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: rawPreview(), error: null }) }
    await getTeacherCourseRosterPreviewForAdmin({ institutionId: 'institution-1', teacherId: 'teacher-1' }, { client })
    expect(client.rpc).toHaveBeenCalledWith(TEACHER_COURSE_ROSTER_PREVIEW_RPC, {
      p_institution_id: 'institution-1',
      p_teacher_id: 'teacher-1',
    })
  })

  it('normaliza errores sin incorporar payloads ni secretos', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'forbidden' } }) }
    await expect(getMyTeacherCourseRosterPreview({ institutionId: 'institution-1' }, { client })).rejects.toThrow('42501:forbidden')
  })
})
