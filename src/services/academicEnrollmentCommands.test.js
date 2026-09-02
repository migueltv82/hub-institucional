import { describe, expect, it, vi } from 'vitest'
import {
  enrollFirstYearStudent,
  enrollStudentInCourseOffering,
} from './academicEnrollmentCommands.js'

describe('academicEnrollmentCommands', () => {
  it('inscribe primer anio usando solamente RPC y requestId explicito', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { status: 'COMPLETED' }, error: null }) }
    const result = await enrollFirstYearStudent({
      studentCareerEnrollmentId: 'relation-1',
      academicYearId: 'year-1',
      requestId: 'request-1',
    }, { client })
    expect(client.rpc).toHaveBeenCalledWith('academic_enroll_first_year_student', {
      p_student_career_enrollment_id: 'relation-1',
      p_academic_year_id: 'year-1',
      p_request_id: 'request-1',
    })
    expect(result).toEqual({ ok: true, requestId: 'request-1', data: { status: 'COMPLETED' }, error: null })
  })

  it('inscribe una oferta individual usando solamente RPC', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { status: 'COMPLETED' }, error: null }) }
    await enrollStudentInCourseOffering({
      studentCareerEnrollmentId: 'relation-1',
      courseOfferingId: 'offering-1',
      requestId: 'request-2',
    }, { client })
    expect(client.rpc).toHaveBeenCalledWith('academic_enroll_student_in_course_offering', {
      p_student_career_enrollment_id: 'relation-1',
      p_course_offering_id: 'offering-1',
      p_request_id: 'request-2',
    })
  })

  it('normaliza errores sin realizar writes alternativos', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'forbidden', details: 'RLS' } }) }
    const result = await enrollStudentInCourseOffering({
      studentCareerEnrollmentId: 'relation-1',
      courseOfferingId: 'offering-1',
      requestId: 'request-3',
    }, { client })
    expect(result).toEqual({
      ok: false,
      requestId: 'request-3',
      data: null,
      error: { code: '42501', message: 'forbidden', details: 'RLS' },
    })
    expect(Object.keys(client)).toEqual(['rpc'])
  })
})
