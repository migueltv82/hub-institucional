import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const ACTIVE_INSTITUTION_STORAGE_KEY = 'mesaflow.activeInstitutionId'

const demoInstitutions = [
  {
    id: 'demo-san-miguel',
    name: 'Instituto San Miguel',
    slug: 'instituto-san-miguel',
    logo_url: '',
    plan_type: 'pro',
    status: 'active',
    role: 'owner',
    isDemo: true,
    created_at: '2026-04-15T10:00:00.000Z',
  },
  {
    id: 'demo-rivera',
    name: 'Instituto Rivera',
    slug: 'instituto-rivera',
    logo_url: '',
    plan_type: 'free',
    status: 'active',
    role: 'owner',
    isDemo: true,
    created_at: '2026-04-18T10:00:00.000Z',
  },
  {
    id: 'demo-horizonte',
    name: 'Profesorado Horizonte',
    slug: 'profesorado-horizonte',
    logo_url: '',
    plan_type: 'business',
    status: 'suspended',
    role: 'owner',
    isDemo: true,
    created_at: '2026-04-20T10:00:00.000Z',
  },
]

function cloneDemoInstitutions() {
  return structuredClone(demoInstitutions)
}

const institutionBaseColumns = 'id, name, slug, logo_url, status, created_at, is_demo'
const institutionColumnsWithPlan = `${institutionBaseColumns}, plan_type`
const membershipBaseColumns = `role, institutions(${institutionBaseColumns})`
const membershipColumnsWithPlan = `role, institutions(${institutionColumnsWithPlan})`
const LOGIN_INSTITUTIONS_RPC = 'list_active_login_institutions'

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

function logLoginInstitutionsDiagnostic(reason, details = {}) {
  if (!isDevRuntime()) return
  console.warn('[login-institutions]', reason, details)
}

function isConnectivityError(error) {
  const text = errorText(error)
  return (
    text.includes('failed to fetch') ||
    text.includes('fetch failed') ||
    text.includes('networkerror') ||
    text.includes('network request failed') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('econnreset') ||
    text.includes('dns')
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

function demoActiveInstitutions() {
  return cloneDemoInstitutions().filter((institution) => institution.status === 'active')
}

async function selectWithPlanFallback(primaryQuery, fallbackQuery) {
  const { data, error } = await primaryQuery()
  if (!error) return { data, error }
  if (error.message?.includes('plan_type') || error.details?.includes('plan_type')) {
    return fallbackQuery()
  }
  return { data, error }
}

export function readStoredActiveInstitutionId() {
  try {
    return localStorage.getItem(ACTIVE_INSTITUTION_STORAGE_KEY)
  } catch {
    return null
  }
}

export function persistActiveInstitutionId(institutionId) {
  try {
    if (!institutionId) {
      localStorage.removeItem(ACTIVE_INSTITUTION_STORAGE_KEY)
      return
    }

    localStorage.setItem(ACTIVE_INSTITUTION_STORAGE_KEY, institutionId)
  } catch {
    // No bloqueamos la app si el navegador no permite persistencia local.
  }
}

export async function fetchLoginInstitutions() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      institutions: demoActiveInstitutions(),
      source: 'local-demo',
    }
  }

  let result

  try {
    result = await supabase.rpc(LOGIN_INSTITUTIONS_RPC)
  } catch (error) {
    logLoginInstitutionsDiagnostic('rpc-thrown', {
      rpc: LOGIN_INSTITUTIONS_RPC,
      error: safeErrorDetails(error),
    })
    throw new Error(getLoginInstitutionsErrorMessage(error))
  }

  const { data, error } = result

  if (error) {
    logLoginInstitutionsDiagnostic('rpc-error', {
      rpc: LOGIN_INSTITUTIONS_RPC,
      error: safeErrorDetails(error),
    })
    throw new Error(getLoginInstitutionsErrorMessage(error))
  }

  return {
    institutions: (data ?? []).map((institution) => ({
      id: institution.id,
      name: institution.name,
      slug: institution.slug,
      logo_url: institution.logo_url ?? '',
      plan_type: institution.plan_type ?? 'free',
      status: institution.status ?? 'active',
      created_at: institution.created_at ?? null,
    })),
    source: 'supabase',
  }
}

function getLoginInstitutionsErrorMessage(error) {
  const message = String(error?.message ?? 'Error desconocido.')
  const code = String(error?.code ?? '')
  const lowerMessage = message.toLowerCase()
  const lowerText = errorText(error)

  if (
    lowerMessage.includes('permission denied') ||
    lowerText.includes('row-level security') ||
    lowerText.includes('rls') ||
    code === '42501'
  ) {
    return 'Supabase rechazo la consulta por permisos. Revisa que `supabase/setup_multi_tenant/00_base_schema.sql` haya otorgado execute a `anon` y `authenticated`.'
  }

  if (isConnectivityError(error)) {
    return 'No se pudo conectar con Supabase para cargar tus instituciones. Revisa la conexion o la URL del proyecto e intenta nuevamente.'
  }

  if (isTimeoutError(error)) {
    return 'La carga de instituciones tardo demasiado. Intenta nuevamente en unos minutos.'
  }

  if (code === 'PGRST202' || lowerText.includes(LOGIN_INSTITUTIONS_RPC)) {
    return 'Falta crear la RPC `list_active_login_institutions`. Ejecuta `supabase/setup_multi_tenant/00_base_schema.sql` en Supabase SQL Editor.'
  }

  if (code === '42703' || lowerText.includes('column institutions.')) {
    return 'El esquema remoto de Supabase no coincide con la app. Ejecuta `supabase/setup_multi_tenant/00_base_schema.sql` y luego las migraciones 01-12 del setup multi-tenant.'
  }

  return message
}

export async function fetchAccessibleInstitutions({ isSuperAdmin = false, useRemote }) {
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    return {
      institutions: cloneDemoInstitutions(),
      source: 'local-demo',
    }
  }

  if (isSuperAdmin) {
    const { data, error } = await selectWithPlanFallback(
      () => supabase
        .from('institutions')
        .select(institutionColumnsWithPlan)
        .order('created_at', { ascending: true }),
      () => supabase
        .from('institutions')
        .select(institutionBaseColumns)
        .order('created_at', { ascending: true }),
    )

    if (error) throw error

    return {
      institutions: (data ?? []).map((institution) => ({
        id: institution.id,
        name: institution.name,
        slug: institution.slug,
        logo_url: institution.logo_url ?? '',
        plan_type: institution.plan_type ?? 'free',
        status: institution.status ?? 'active',
        role: 'superadmin',
        isDemo: Boolean(institution.is_demo),
        created_at: institution.created_at,
      })),
      source: 'supabase',
    }
  }

  const { data, error } = await selectWithPlanFallback(
    () => supabase
      .from('memberships')
      .select(membershipColumnsWithPlan)
      .order('created_at', { ascending: true }),
    () => supabase
      .from('memberships')
      .select(membershipBaseColumns)
      .order('created_at', { ascending: true }),
  )

  if (error) throw error

  const institutions = (data ?? [])
    .map((membership) => {
      const institution = membership.institutions
      if (!institution) return null

      return {
        id: institution.id,
        name: institution.name,
        slug: institution.slug,
        logo_url: institution.logo_url ?? '',
        plan_type: institution.plan_type ?? 'free',
        status: institution.status ?? 'active',
        role: membership.role,
        isDemo: Boolean(institution.is_demo),
        created_at: institution.created_at,
      }
    })
    .filter(Boolean)

  return {
    institutions,
    source: 'supabase',
  }
}
