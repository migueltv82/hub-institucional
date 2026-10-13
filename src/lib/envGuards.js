const forbiddenPublicEnvKeyPattern = /^VITE_(?:.*_)?SERVICE_ROLE/i
const publicEnvKeyPattern = /^VITE_/i
const serviceRoleValuePattern = /\bservice[_-]?role\b/i
const supabaseSecretKeyPattern = /^sb_secret_/i

function hasEnvValue(value) {
  if (typeof value === 'string') return value.trim().length > 0
  return value !== undefined && value !== null && value !== false
}

function cleanEnvValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function decodeBase64UrlJson(value) {
  try {
    const normalized = value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=')
    const decoded = atob(normalized)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

function getJwtPayload(value) {
  const parts = cleanEnvValue(value).split('.')

  if (parts.length !== 3 || !parts[1]) return null

  return decodeBase64UrlJson(parts[1])
}

function looksLikeServiceRoleSecretValue(value) {
  const cleanValue = cleanEnvValue(value)

  if (!cleanValue) return false
  if (serviceRoleValuePattern.test(cleanValue)) return true
  if (supabaseSecretKeyPattern.test(cleanValue)) return true

  const payload = getJwtPayload(cleanValue)
  return cleanEnvValue(payload?.role).toLowerCase() === 'service_role'
}

function getUnsafePublicValueKeys(env) {
  return Object.entries(env)
    .filter(([key, value]) => publicEnvKeyPattern.test(key) && looksLikeServiceRoleSecretValue(value))
    .map(([key]) => key)
}

function isValidProductionSupabaseUrl(value) {
  const cleanValue = cleanEnvValue(value)

  try {
    const url = new URL(cleanValue)
    return url.protocol === 'https:'
      && url.hostname.endsWith('.supabase.co')
      && !url.username
      && !url.password
      && ['', '/'].includes(url.pathname)
  } catch {
    return false
  }
}

export function getPublicRuntimeEnvironmentIssues(env = import.meta.env) {
  const issues = []

  if (env.PROD && env.VITE_DISABLE_AUTH === 'true') {
    issues.push('VITE_DISABLE_AUTH=true no esta permitido en produccion.')
  }

  if (env.PROD && !hasEnvValue(env.VITE_SUPABASE_URL)) {
    issues.push('Falta VITE_SUPABASE_URL para produccion.')
  } else if (env.PROD && !isValidProductionSupabaseUrl(env.VITE_SUPABASE_URL)) {
    issues.push('VITE_SUPABASE_URL debe ser una URL HTTPS de Supabase para produccion.')
  }

  if (env.PROD && !hasEnvValue(env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    issues.push('Falta VITE_SUPABASE_PUBLISHABLE_KEY para produccion.')
  }

  const leakedSecretKeys = Object.keys(env).filter((key) => (
    forbiddenPublicEnvKeyPattern.test(key) && hasEnvValue(env[key])
  ))
  if (leakedSecretKeys.length > 0) {
    issues.push(
      `Variables privadas expuestas al frontend: ${leakedSecretKeys.join(', ')}. ` +
      'La service_role key solo puede vivir en Supabase Function secrets.',
    )
  }

  const unsafePublicValueKeys = getUnsafePublicValueKeys(env)
    .filter((key) => !leakedSecretKeys.includes(key))
  if (unsafePublicValueKeys.length > 0) {
    issues.push(
      `Valores privados expuestos al frontend: ${unsafePublicValueKeys.join(', ')}. ` +
      'El valor parece service_role/secret y no puede publicarse en variables VITE_.',
    )
  }

  return issues
}

export function validatePublicRuntimeEnvironment(env = import.meta.env) {
  const issues = getPublicRuntimeEnvironmentIssues(env)

  if (issues.length > 0) {
    throw new Error(issues.join(' '))
  }
}
