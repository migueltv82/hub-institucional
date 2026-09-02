import { supabase } from '../lib/supabase.js'
import { buildTeacherCourseRosterPreviewModel } from '../features/teacherCourseRoster/teacherCourseRosterPreviewModel.js'

export const TEACHER_COURSE_ROSTER_PREVIEW_RPC = 'academic_get_teacher_course_roster_preview'

function clean(value) {
  return String(value ?? '').trim()
}

async function executePreview({ institutionId, teacherId = null }, { client = supabase } = {}) {
  if (!client || typeof client.rpc !== 'function') {
    throw new Error('TEACHER_COURSE_ROSTER_PREVIEW_SUPABASE_UNAVAILABLE')
  }
  if (!clean(institutionId)) {
    throw new Error('TEACHER_COURSE_ROSTER_PREVIEW_INSTITUTION_REQUIRED')
  }

  const { data, error } = await client.rpc(TEACHER_COURSE_ROSTER_PREVIEW_RPC, {
    p_institution_id: clean(institutionId),
    p_teacher_id: clean(teacherId) || null,
  })

  if (error) {
    const code = clean(error.code) || 'TEACHER_COURSE_ROSTER_PREVIEW_READ_FAILED'
    const message = clean(error.message) || 'No se pudo cargar el padron estructurado.'
    throw new Error(`${code}:${message}`)
  }

  return buildTeacherCourseRosterPreviewModel(data)
}

export function getMyTeacherCourseRosterPreview({ institutionId } = {}, dependencies) {
  return executePreview({ institutionId, teacherId: null }, dependencies)
}

export function getTeacherCourseRosterPreviewForAdmin({ institutionId, teacherId = null } = {}, dependencies) {
  return executePreview({ institutionId, teacherId }, dependencies)
}
