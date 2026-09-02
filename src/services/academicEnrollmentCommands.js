import { supabase } from '../lib/supabase.js'

const RPC = Object.freeze({
  firstYear: 'academic_enroll_first_year_student',
  individual: 'academic_enroll_student_in_course_offering',
})

function clean(value) {
  return String(value ?? '').trim()
}

function resolveRequestId(requestId) {
  const explicit = clean(requestId)
  if (explicit) return explicit
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  throw new Error('ACADEMIC_ENROLLMENT_REQUEST_ID_REQUIRED')
}

function safeError(error) {
  return {
    code: clean(error?.code) || 'ACADEMIC_ENROLLMENT_RPC_FAILED',
    message: clean(error?.message) || 'No se pudo completar la inscripcion academica.',
    details: clean(error?.details) || null,
  }
}

async function callEnrollmentRpc(client, rpcName, parameters, requestId) {
  if (!client || typeof client.rpc !== 'function') {
    return { ok: false, requestId, data: null, error: { code: 'SUPABASE_CLIENT_UNAVAILABLE', message: 'Supabase no esta disponible.', details: null } }
  }
  const { data, error } = await client.rpc(rpcName, parameters)
  if (error) return { ok: false, requestId, data: null, error: safeError(error) }
  return { ok: true, requestId, data, error: null }
}

export async function enrollFirstYearStudent({
  studentCareerEnrollmentId,
  academicYearId,
  requestId,
} = {}, { client = supabase } = {}) {
  const resolvedRequestId = resolveRequestId(requestId)
  return callEnrollmentRpc(client, RPC.firstYear, {
    p_student_career_enrollment_id: clean(studentCareerEnrollmentId),
    p_academic_year_id: clean(academicYearId),
    p_request_id: resolvedRequestId,
  }, resolvedRequestId)
}

export async function enrollStudentInCourseOffering({
  studentCareerEnrollmentId,
  courseOfferingId,
  requestId,
} = {}, { client = supabase } = {}) {
  const resolvedRequestId = resolveRequestId(requestId)
  return callEnrollmentRpc(client, RPC.individual, {
    p_student_career_enrollment_id: clean(studentCareerEnrollmentId),
    p_course_offering_id: clean(courseOfferingId),
    p_request_id: resolvedRequestId,
  }, resolvedRequestId)
}

