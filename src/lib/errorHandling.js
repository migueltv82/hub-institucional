export const ERROR_CODES = Object.freeze({
  SCHEDULE_CONFLICT: 'SCHEDULE_CONFLICT',
  INVALID_PREREQUISITES: 'INVALID_PREREQUISITES',
  SAVE_FAILED: 'SAVE_FAILED',
  LOAD_FAILED: 'LOAD_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
})

const KNOWN_ERROR_CODES = new Set(Object.values(ERROR_CODES))
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'ENETDOWN',
  'ENETUNREACH',
  'ETIMEDOUT',
  'NETWORK_ERROR',
  'PGRST000',
  'PGRST001',
  'PGRST002',
])
const SENSITIVE_KEY_PATTERN = /authorization|cookie|credential|jwt|password|secret|session|token/i

function cleanCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

function getStatus(error) {
  const status = Number(error?.status ?? error?.statusCode)
  return Number.isFinite(status) ? status : null
}

function looksLikeNetworkError(error) {
  const code = cleanCode(error?.code)
  const status = getStatus(error)
  const message = String(error?.message ?? error ?? '').toLowerCase()

  return TRANSIENT_ERROR_CODES.has(code)
    || status === 408
    || status === 429
    || (status !== null && status >= 500)
    || /failed to fetch|network(?: request)? (?:error|failed|unavailable)|connection (?:reset|refused)|socket|timed? out/.test(message)
}

function inferErrorCode(error, fallbackCode) {
  const code = cleanCode(error?.code)
  if (KNOWN_ERROR_CODES.has(code)) return code

  const status = getStatus(error)
  if (status === 401 || status === 403 || code === 'PGRST301' || code === 'PGRST302') {
    return ERROR_CODES.UNAUTHORIZED
  }
  if (looksLikeNetworkError(error)) return ERROR_CODES.NETWORK_ERROR
  return fallbackCode
}

function redactText(value) {
  return String(value)
    .replace(/(bearer\s+)[a-z0-9._~-]+/gi, '$1[REDACTED]')
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, '[REDACTED_JWT]')
    .replace(/([?&](?:api[_-]?key|key|password|secret|token)=)[^&\s]+/gi, '$1[REDACTED]')
}

function isSensitiveKey(key) {
  const normalized = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()

  return SENSITIVE_KEY_PATTERN.test(normalized)
    || /^(?:anon|api|private|publishable|service_role)_?key$/.test(normalized)
}

function sanitizeForLog(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactText(value)
  if (typeof value !== 'object') return value
  if (seen.has(value)) return '[CIRCULAR]'

  seen.add(value)
  const sanitized = Array.isArray(value) ? [] : {}
  Object.entries(value).forEach(([key, entry]) => {
    sanitized[key] = isSensitiveKey(key)
      ? '[REDACTED]'
      : sanitizeForLog(entry, seen)
  })
  seen.delete(value)
  return sanitized
}

export class ApplicationError extends Error {
  constructor(code, message, { cause, metadata = {} } = {}) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ApplicationError'
    this.code = KNOWN_ERROR_CODES.has(cleanCode(code)) ? cleanCode(code) : ERROR_CODES.UNKNOWN_ERROR
    this.metadata = metadata && typeof metadata === 'object' ? metadata : {}

    if (cause?.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`
    }
  }
}

export function normalizeError(error, {
  code = ERROR_CODES.UNKNOWN_ERROR,
  message,
  metadata = {},
} = {}) {
  if (error instanceof ApplicationError) return error

  const originalError = error instanceof Error
    ? error
    : new Error(typeof error === 'string' && error ? error : 'Error desconocido')
  const fallbackCode = KNOWN_ERROR_CODES.has(cleanCode(code)) ? cleanCode(code) : ERROR_CODES.UNKNOWN_ERROR

  return new ApplicationError(
    inferErrorCode(originalError, fallbackCode),
    message || originalError.message || 'Ocurrio un error inesperado.',
    { cause: originalError, metadata },
  )
}

export function isRetryable(error) {
  const normalized = error instanceof ApplicationError ? error : normalizeError(error)

  if (
    normalized.code === ERROR_CODES.SCHEDULE_CONFLICT
    || normalized.code === ERROR_CODES.INVALID_PREREQUISITES
    || normalized.code === ERROR_CODES.UNAUTHORIZED
  ) {
    return false
  }

  return normalized.code === ERROR_CODES.NETWORK_ERROR || looksLikeNetworkError(normalized.cause)
}

export function logError(error, {
  context = {},
  logger = console.error,
} = {}) {
  const normalized = normalizeError(error)
  const entry = sanitizeForLog({
    code: normalized.code,
    name: normalized.name,
    message: normalized.message,
    metadata: normalized.metadata,
    context,
    cause: normalized.cause
      ? {
          code: normalized.cause.code ?? null,
          message: normalized.cause.message ?? String(normalized.cause),
          name: normalized.cause.name ?? 'Error',
          status: getStatus(normalized.cause),
        }
      : null,
  })

  logger('[application-error]', entry)
  return entry
}
