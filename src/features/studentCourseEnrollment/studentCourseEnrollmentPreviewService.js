import { supabase } from '../../lib/supabase.js'
import { buildStudentCourseEnrollmentPreviewModel } from './studentCourseEnrollmentPreviewModel.js'

const READ_RPC = 'academic_get_student_course_enrollment_preview'

function clean(value) {
  return String(value ?? '').trim()
}

export async function fetchStudentCourseEnrollmentPreview({
  institutionId,
  studentCareerEnrollmentId = null,
  legacyInputs,
} = {}, { client = supabase } = {}) {
  if (!client || typeof client.rpc !== 'function') {
    throw new Error('STUDENT_COURSE_PREVIEW_SUPABASE_UNAVAILABLE')
  }
  if (!clean(institutionId)) {
    throw new Error('STUDENT_COURSE_PREVIEW_INSTITUTION_REQUIRED')
  }

  const { data, error } = await client.rpc(READ_RPC, {
    p_institution_id: clean(institutionId),
    p_student_career_enrollment_id: clean(studentCareerEnrollmentId) || null,
  })

  if (error) {
    const safeCode = clean(error.code) || 'STUDENT_COURSE_PREVIEW_READ_FAILED'
    const safeMessage = clean(error.message) || 'No se pudo cargar el preview de inscripcion.'
    throw new Error(`${safeCode}:${safeMessage}`)
  }

  return buildStudentCourseEnrollmentPreviewModel(data, { legacyInputs })
}

export { READ_RPC }
