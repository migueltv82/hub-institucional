import { describe, expect, it, vi } from 'vitest'
import {
  correctStudentCareerEnrollment,
  createStudentCareerEnrollment,
  getStudentCareerEnrollmentHistory,
  invalidateStudentCareerEnrollment,
  STUDENT_CAREER_ADMIN_RPC,
} from './studentCareerEnrollmentAdminCommands.js'

function clientWith(data = { status: 'OK' }) {
  return { rpc: vi.fn().mockResolvedValue({ data, error: null }) }
}

describe('studentCareerEnrollmentAdminCommands', () => {
  it('crea exclusivamente mediante la RPC administrativa', async () => {
    const client = clientWith({ status: 'CREATED' })
    const result = await createStudentCareerEnrollment({
      studentId: 'student-1', studentRecordId: 'record-1', careerId: 'career-1',
      studyPlanId: 'plan-1', admissionAcademicYearId: 'year-1',
      currentAcademicYearId: 'year-1', entryYear: 2026,
      isFirstYearEntrant: true, requestId: 'request-1', reason: 'Alta administrativa',
    }, { client })
    expect(client.rpc).toHaveBeenCalledWith(STUDENT_CAREER_ADMIN_RPC.create, {
      p_student_id: 'student-1', p_student_record_id: 'record-1', p_career_id: 'career-1',
      p_study_plan_id: 'plan-1', p_admission_academic_year_id: 'year-1',
      p_current_academic_year_id: 'year-1', p_entry_year: 2026,
      p_is_first_year_entrant: true, p_request_id: 'request-1', p_reason: 'Alta administrativa',
    })
    expect(result).toEqual(expect.objectContaining({ ok: true, requestId: 'request-1' }))
  })

  it('corrige, invalida y consulta historial solo mediante RPC', async () => {
    const client = clientWith()
    await correctStudentCareerEnrollment({
      existingStudentCareerEnrollmentId: 'link-1', newCareerId: 'career-1',
      newStudyPlanId: 'plan-2', newAdmissionAcademicYearId: 'year-1',
      newCurrentAcademicYearId: 'year-2', newEntryYear: 2026,
      newIsFirstYearEntrant: false, requestId: 'request-2', reason: 'Correccion',
    }, { client })
    await invalidateStudentCareerEnrollment({
      studentCareerEnrollmentId: 'link-2', requestId: 'request-3', reason: 'Invalidacion',
    }, { client })
    await getStudentCareerEnrollmentHistory({ careerId: 'career-1', studentId: 'student-1' }, { client })
    expect(client.rpc.mock.calls.map(([name]) => name)).toEqual([
      STUDENT_CAREER_ADMIN_RPC.correct,
      STUDENT_CAREER_ADMIN_RPC.invalidate,
      STUDENT_CAREER_ADMIN_RPC.history,
    ])
  })

  it('normaliza errores y no ofrece writes alternativos', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'forbidden' } }) }
    const result = await invalidateStudentCareerEnrollment({
      studentCareerEnrollmentId: 'link-1', requestId: 'request-4', reason: 'Motivo',
    }, { client })
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.objectContaining({ code: '42501' }) }))
    expect(Object.keys(client)).toEqual(['rpc'])
  })
})
