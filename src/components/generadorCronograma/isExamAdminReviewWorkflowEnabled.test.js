import { describe, expect, it } from 'vitest'
import { isExamAdminReviewWorkflowEnabled } from './isExamAdminReviewWorkflowEnabled.js'

describe('isExamAdminReviewWorkflowEnabled', () => {
  it("devuelve true solo cuando VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW es 'true'", () => {
    expect(isExamAdminReviewWorkflowEnabled({ VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW: 'true' })).toBe(true)
    expect(isExamAdminReviewWorkflowEnabled({ VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW: 'false' })).toBe(false)
    expect(isExamAdminReviewWorkflowEnabled({ VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW: 'TRUE' })).toBe(false)
    expect(isExamAdminReviewWorkflowEnabled({ VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW: true })).toBe(false)
    expect(isExamAdminReviewWorkflowEnabled({})).toBe(false)
  })
})
