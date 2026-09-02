const ADMIN_ROLES = new Set([
  'superadmin',
  'owner',
  'admin',
  'admin_instituto',
  'institution_admin',
  'administrador',
])

const TEACHER_ROLES = new Set(['docente', 'profesor', 'teacher'])

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

export function isTeacherCourseRosterInternalPreviewEnabled(env = import.meta.env) {
  return Boolean(
    env?.DEV === true
    && env?.VITE_ENABLE_TEACHER_COURSE_ROSTER_INTERNAL_PREVIEW === 'true'
    && isLocalSupabaseUrl(env?.VITE_SUPABASE_URL),
  )
}

export function getTeacherCourseRosterPreviewAccess({
  env = import.meta.env,
  mode = 'teacher',
  detectedRole,
  isSuperAdmin = false,
  institutionId,
  userId,
  hasAuthenticatedSession = true,
} = {}) {
  const enabled = isTeacherCourseRosterInternalPreviewEnabled(env)
  const role = normalize(detectedRole)
  const roleAuthorized = mode === 'admin'
    ? isSuperAdmin || ADMIN_ROLES.has(role)
    : TEACHER_ROLES.has(role)
  const reasons = []

  if (env?.DEV !== true) reasons.push('DEV_MODE_FALSE')
  if (env?.VITE_ENABLE_TEACHER_COURSE_ROSTER_INTERNAL_PREVIEW !== 'true') reasons.push('FEATURE_FLAG_DISABLED')
  if (!isLocalSupabaseUrl(env?.VITE_SUPABASE_URL)) reasons.push('SUPABASE_NOT_LOCAL')
  if (!hasAuthenticatedSession) reasons.push('AUTHENTICATED_SESSION_REQUIRED')
  if (!userId) reasons.push('USER_ID_MISSING')
  if (!institutionId) reasons.push('INSTITUTION_MISSING')
  if (!roleAuthorized) reasons.push('USER_NOT_AUTHORIZED')

  return {
    enabled,
    allowed: enabled && roleAuthorized && Boolean(hasAuthenticatedSession && userId && institutionId),
    role,
    roleAuthorized,
    reasons,
  }
}

export { ADMIN_ROLES, TEACHER_ROLES }
