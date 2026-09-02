import { describe, expect, it, vi } from 'vitest'
import {
  fetchStudentCourseEnrollmentPreview,
  READ_RPC,
} from './studentCourseEnrollmentPreviewService.js'

describe('student course enrollment preview service', () => {
  it('lee exclusivamente mediante la RPC segura', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { relations: [], offerings: [], enrollments: [] },
      error: null,
    })
    const result = await fetchStudentCourseEnrollmentPreview({
      institutionId: 'inst-1',
      studentCareerEnrollmentId: 'relation-1',
    }, { client: { rpc } })
    expect(rpc).toHaveBeenCalledWith(READ_RPC, {
      p_institution_id: 'inst-1',
      p_student_career_enrollment_id: 'relation-1',
    })
    expect(result.source).toBe('local_student_course_enrollment_preview')
  })

  it('falla claramente sin institucion y no intenta ninguna escritura', async () => {
    const rpc = vi.fn()
    await expect(fetchStudentCourseEnrollmentPreview({}, { client: { rpc } }))
      .rejects.toThrow('STUDENT_COURSE_PREVIEW_INSTITUTION_REQUIRED')
    expect(rpc).not.toHaveBeenCalled()
  })
})
