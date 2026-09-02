import { supabase } from '../lib/supabase.js'

const RPC = Object.freeze({
  create: 'academic_admin_create_student_career_enrollment',
  correct: 'academic_admin_correct_student_career_enrollment',
  invalidate: 'academic_admin_invalidate_student_career_enrollment',
  history: 'academic_admin_get_student_career_enrollment_history',
})

function clean(value) {
  return String(value ?? '').trim()
}

function resolveRequestId(requestId) {
  const explicit = clean(requestId)
  if (explicit) return explicit
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  throw new Error('STUDENT_CAREER_ADMIN_REQUEST_ID_REQUIRED')
}

function safeError(error) {
  return {
    code: clean(error?.code) || 'STUDENT_CAREER_ADMIN_RPC_FAILED',
    message: clean(error?.message) || 'No se pudo completar la gestion del vinculo academico.',
    details: clean(error?.details) || null,
  }
}

async function callRpc(client, rpcName, parameters, requestId = null) {
  if (!client || typeof client.rpc !== 'function') {
    return {
      ok: false,
      requestId,
      data: null,
      error: { code: 'SUPABASE_CLIENT_UNAVAILABLE', message: 'Supabase no esta disponible.', details: null },
    }
  }
  const { data, error } = await client.rpc(rpcName, parameters)
  if (error) return { ok: false, requestId, data: null, error: safeError(error) }
  return { ok: true, requestId, data, error: null }
}

export async function createStudentCareerEnrollment({
  studentId,
  studentRecordId,
  careerId,
  studyPlanId,
  admissionAcademicYearId,
  currentAcademicYearId,
  entryYear,
  isFirstYearEntrant,
  requestId,
  reason,
} = {}, { client = supabase } = {}) {
  const resolvedRequestId = resolveRequestId(requestId)
  return callRpc(client, RPC.create, {
    p_student_id: clean(studentId),
    p_student_record_id: clean(studentRecordId),
    p_career_id: clean(careerId),
    p_study_plan_id: clean(studyPlanId),
    p_admission_academic_year_id: clean(admissionAcademicYearId),
    p_current_academic_year_id: clean(currentAcademicYearId),
    p_entry_year: Number(entryYear),
    p_is_first_year_entrant: Boolean(isFirstYearEntrant),
    p_request_id: resolvedRequestId,
    p_reason: clean(reason),
  }, resolvedRequestId)
}

export async function correctStudentCareerEnrollment({
  existingStudentCareerEnrollmentId,
  newCareerId,
  newStudyPlanId,
  newAdmissionAcademicYearId,
  newCurrentAcademicYearId,
  newEntryYear,
  newIsFirstYearEntrant,
  requestId,
  reason,
} = {}, { client = supabase } = {}) {
  const resolvedRequestId = resolveRequestId(requestId)
  return callRpc(client, RPC.correct, {
    p_existing_student_career_enrollment_id: clean(existingStudentCareerEnrollmentId),
    p_new_career_id: clean(newCareerId),
    p_new_study_plan_id: clean(newStudyPlanId),
    p_new_admission_academic_year_id: clean(newAdmissionAcademicYearId),
    p_new_current_academic_year_id: clean(newCurrentAcademicYearId),
    p_new_entry_year: Number(newEntryYear),
    p_new_is_first_year_entrant: Boolean(newIsFirstYearEntrant),
    p_request_id: resolvedRequestId,
    p_reason: clean(reason),
  }, resolvedRequestId)
}

export async function invalidateStudentCareerEnrollment({
  studentCareerEnrollmentId,
  requestId,
  reason,
} = {}, { client = supabase } = {}) {
  const resolvedRequestId = resolveRequestId(requestId)
  return callRpc(client, RPC.invalidate, {
    p_student_career_enrollment_id: clean(studentCareerEnrollmentId),
    p_request_id: resolvedRequestId,
    p_reason: clean(reason),
  }, resolvedRequestId)
}

export async function getStudentCareerEnrollmentHistory({
  careerId,
  studentId = null,
} = {}, { client = supabase } = {}) {
  return callRpc(client, RPC.history, {
    p_career_id: clean(careerId),
    p_student_id: clean(studentId) || null,
  })
}

export { RPC as STUDENT_CAREER_ADMIN_RPC }
