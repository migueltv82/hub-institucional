export function isExamAdminReviewWorkflowEnabled(env = import.meta.env) {
  return env?.VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW === 'true'
}

export default isExamAdminReviewWorkflowEnabled
