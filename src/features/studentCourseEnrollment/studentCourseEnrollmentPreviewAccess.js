const ADMIN_ROLES = new Set([
  'superadmin',
  'owner',
  'admin',
  'admin_instituto',
  'institution_admin',
  'administrador',
])

const STUDENT_ROLES = new Set(['alumno', 'student'])

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function isLocalSupabaseUrl(value) {
  try {
    const url = new URL(String(value ?? ''))
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

export function isStudentCourseEnrollmentInternalPreviewEnabled(env = import.meta.env) {
  return Boolean(
    env?.DEV === true
    && env?.VITE_ENABLE_STUDENT_COURSE_ENROLLMENT_INTERNAL_PREVIEW === 'true'
    && isLocalSupabaseUrl(env?.VITE_SUPABASE_URL),
  )
}

export function getStudentCourseEnrollmentPreviewAccess({
  env = import.meta.env,
  mode,
  detectedRole,
  isSuperAdmin = false,
  institutionId,
  userId,
  hasAuthenticatedSession = true,
} = {}) {
  const enabled = isStudentCourseEnrollmentInternalPreviewEnabled(env)
  const role = normalize(detectedRole)
  const roleAuthorized = mode === 'admin'
    ? isSuperAdmin || ADMIN_ROLES.has(role)
    : STUDENT_ROLES.has(role)

  const reasons = []
  if (env?.DEV !== true) reasons.push('DEV_MODE_FALSE')
  if (env?.VITE_ENABLE_STUDENT_COURSE_ENROLLMENT_INTERNAL_PREVIEW !== 'true') reasons.push('FEATURE_FLAG_DISABLED')
  if (!isLocalSupabaseUrl(env?.VITE_SUPABASE_URL)) reasons.push('SUPABASE_NOT_LOCAL')
  if (!roleAuthorized) reasons.push('USER_NOT_AUTHORIZED')
  if (!institutionId) reasons.push('INSTITUTION_MISSING')
  if (!userId) reasons.push('USER_ID_MISSING')
  if (!hasAuthenticatedSession) reasons.push('AUTHENTICATED_SESSION_REQUIRED')

  return {
    enabled,
    allowed: enabled && roleAuthorized && Boolean(institutionId && userId && hasAuthenticatedSession),
    role,
    roleAuthorized,
    reasons,
  }
}

export { ADMIN_ROLES, STUDENT_ROLES }
