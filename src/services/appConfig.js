import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const DEFAULT_APP_STATUS = {
  maintenanceEnabled: false,
  maintenanceMessage: 'La plataforma esta en mantenimiento. Intenta nuevamente en unos minutos.',
  updatedAt: null,
}

const PUBLIC_APP_STATUS_RPC = 'get_public_app_status'
const MISSING_RPC_ERROR_CODES = new Set(['42883', '42P01', 'PGRST202', 'PGRST205'])
const PERMISSION_ERROR_CODES = new Set(['42501'])
const AUTH_ERROR_CODES = new Set(['PGRST301', 'PGRST302'])

const APP_STATUS_ERROR_MESSAGES = Object.freeze({
  missing_config: 'Falta configurar Supabase para verificar el estado operativo de la plataforma.',
  missing_session: 'No hay una sesion disponible para verificar el estado operativo. Inicia sesion e intenta nuevamente.',
  permission_denied: 'No tenes permisos para verificar el estado operativo de la plataforma.',
  missing_remote_object: 'La verificacion remota del estado operativo no esta disponible. Falta actualizar la configuracion de Supabase.',
  timeout: 'La verificacion del estado operativo tardo demasiado. Intenta nuevamente en unos minutos.',
  connectivity: 'No se pudo conectar con Supabase para verificar el estado operativo. Revisa tu conexion e intenta nuevamente.',
  unknown: 'No se pudo verificar el estado operativo de la plataforma. Intenta nuevamente en unos minutos.',
})
const NON_BLOCKING_APP_STATUS_REASONS = new Set([
  'missing_config',
  'missing_remote_object',
  'timeout',
  'connectivity',
])

function isDevRuntime() {
  return Boolean(import.meta.env?.DEV)
}

function errorText(error) {
  return `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
}

function safeErrorDetails(error) {
  if (!error || typeof error !== 'object') return { message: String(error ?? '') }
  return {
    code: error.code ?? '',
    status: error.status ?? '',
    name: error.name ?? '',
    message: error.message ?? '',
    details: error.details ?? '',
    hint: error.hint ?? '',
  }
}

function logAppStatusDiagnostic(reason, details = {}) {
  if (!isDevRuntime()) return
  console.warn('[app-status]', reason, details)
}

function isMissingPublicAppStatusRpc(error) {
  const errorCode = String(error?.code ?? '')
  const text = errorText(error)

  if (MISSING_RPC_ERROR_CODES.has(errorCode)) {
    return true
  }

  return (
    (
      text.includes(PUBLIC_APP_STATUS_RPC) ||
      text.includes('function') ||
      text.includes('relation')
    ) &&
    (
      text.includes('could not find') ||
      text.includes('does not exist') ||
      text.includes('not found') ||
      text.includes('schema cache')
    )
  )
}

function isMissingSessionError(error) {
  const status = Number(error?.status)
  const code = String(error?.code ?? '')
  const text = errorText(error)

  return (
    status === 401 ||
    AUTH_ERROR_CODES.has(code) ||
    text.includes('jwt') ||
    text.includes('unauthorized') ||
    text.includes('not authenticated') ||
    text.includes('auth session missing')
  )
}

function isPermissionError(error) {
  const status = Number(error?.status)
  const code = String(error?.code ?? '')
  const text = errorText(error)

  return (
    status === 403 ||
    PERMISSION_ERROR_CODES.has(code) ||
    text.includes('permission denied') ||
    text.includes('insufficient privilege') ||
    text.includes('row-level security') ||
    text.includes('rls') ||
    text.includes('not authorized')
  )
}

function isTimeoutError(error) {
  const text = errorText(error)
  return (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('etimedout') ||
    text.includes('aborterror')
  )
}

function isConnectivityError(error) {
  const text = errorText(error)
  return (
    text.includes('fetch failed') ||
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network request failed') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('econnreset') ||
    text.includes('dns')
  )
}

export function classifyPublicAppStatusError(error) {
  if (error?.reason && APP_STATUS_ERROR_MESSAGES[error.reason]) return error.reason
  if (isMissingPublicAppStatusRpc(error)) return 'missing_remote_object'
  if (isMissingSessionError(error)) return 'missing_session'
  if (isPermissionError(error)) return 'permission_denied'
  if (isTimeoutError(error)) return 'timeout'
  if (isConnectivityError(error)) return 'connectivity'
  return 'unknown'
}

function buildPublicAppStatusError(reason, cause = null) {
  const error = new Error(APP_STATUS_ERROR_MESSAGES[reason] ?? APP_STATUS_ERROR_MESSAGES.unknown)
  error.reason = reason
  if (cause) error.cause = cause
  return error
}

function shouldUseDefaultStatus(reason) {
  return NON_BLOCKING_APP_STATUS_REASONS.has(reason)
}

export async function fetchPublicAppStatus() {
  if (!isSupabaseConfigured || !supabase) {
    logAppStatusDiagnostic('missing-config', {
      hasSupabaseClient: Boolean(supabase),
      isSupabaseConfigured: Boolean(isSupabaseConfigured),
    })
    return DEFAULT_APP_STATUS
  }

  let rpcResult

  try {
    rpcResult = await supabase.rpc(PUBLIC_APP_STATUS_RPC)
  } catch (error) {
    const reason = classifyPublicAppStatusError(error)
    logAppStatusDiagnostic(reason, {
      rpc: PUBLIC_APP_STATUS_RPC,
      error: safeErrorDetails(error),
    })
    if (shouldUseDefaultStatus(reason)) return DEFAULT_APP_STATUS
    throw buildPublicAppStatusError(reason, error)
  }

  const { data, error } = rpcResult

  if (error) {
    const reason = classifyPublicAppStatusError(error)
    logAppStatusDiagnostic(reason, {
      rpc: PUBLIC_APP_STATUS_RPC,
      error: safeErrorDetails(error),
    })
    if (shouldUseDefaultStatus(reason)) return DEFAULT_APP_STATUS
    throw buildPublicAppStatusError(reason, error)
  }

  const status = Array.isArray(data) ? data[0] : data

  return {
    maintenanceEnabled: Boolean(status?.maintenance_enabled),
    maintenanceMessage: status?.maintenance_message || DEFAULT_APP_STATUS.maintenanceMessage,
    updatedAt: status?.updated_at ?? null,
  }
}
