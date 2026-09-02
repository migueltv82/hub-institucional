const WRITE_METHODS = ['insert', 'upsert', 'update', 'delete', 'rpc']

function clean(value) {
  return String(value ?? '').trim()
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {}
}

function hasValue(value) {
  return clean(value) !== ''
}

function normalizeRoleText(value) {
  return clean(value).toLowerCase().replaceAll(/[\s-]+/g, '_')
}

function decodeBase64Url(value) {
  const text = clean(value)
  if (!text) return null

  const base64 = text.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')

  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(padded, 'base64').toString('utf8')
    }

    if (typeof globalThis.atob === 'function') {
      return globalThis.atob(padded)
    }
  } catch {
    return null
  }

  return null
}

function decodeJwtPayload(value) {
  const parts = clean(value).split('.')
  if (parts.length < 2) return null

  const decoded = decodeBase64Url(parts[1])
  if (!decoded) return null

  try {
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

function getSpyCallCount(value) {
  if (typeof value !== 'function') return 0
  if (Array.isArray(value.mock?.calls)) return value.mock.calls.length
  if (Array.isArray(value.calls)) return value.calls.length
  return 0
}

function collectWriteSpies(value, seen = new WeakSet(), path = 'supabase') {
  if (!value || typeof value !== 'object') return []
  if (seen.has(value)) return []
  seen.add(value)

  return Object.entries(value).flatMap(([key, entry]) => {
    const nextPath = `${path}.${key}`
    const own = WRITE_METHODS.includes(key) && typeof entry === 'function'
      ? [{ method: key, path: nextPath, calls: getSpyCallCount(entry) }]
      : []

    if (!entry || typeof entry !== 'object') return own
    return [...own, ...collectWriteSpies(entry, seen, nextPath)]
  })
}

export function detectServiceRoleKey(value) {
  const text = clean(value)
  if (!text) return false

  const normalized = normalizeRoleText(text)
  if (normalized.includes('service_role')) return true

  const jwtPayload = decodeJwtPayload(text)
  return normalizeRoleText(jwtPayload?.role) === 'service_role'
}

export function validateSupabaseReadOnlyEnv(env = {}) {
  const safeEnv = asObject(env)
  const errors = []
  const warnings = []
  const url = clean(safeEnv.VITE_SUPABASE_URL)
  const publishableKey = clean(safeEnv.VITE_SUPABASE_PUBLISHABLE_KEY)
  const anonKey = clean(safeEnv.VITE_SUPABASE_ANON_KEY)
  const selectedKey = publishableKey || anonKey
  const keyType = publishableKey ? 'publishable' : (anonKey ? 'anon' : 'unknown')
  const forbiddenEnvKeys = Object.entries(safeEnv).filter(([key, value]) => (
    normalizeRoleText(key).includes('service_role') && hasValue(value)
  ))
  const serviceRoleValues = Object.entries(safeEnv).filter(([, value]) => detectServiceRoleKey(value))

  if (!url) errors.push('Falta VITE_SUPABASE_URL.')
  if (!selectedKey) errors.push('Falta VITE_SUPABASE_PUBLISHABLE_KEY o VITE_SUPABASE_ANON_KEY.')
  if (detectServiceRoleKey(selectedKey)) errors.push('La clave Supabase seleccionada parece ser service_role.')
  if (forbiddenEnvKeys.length > 0) {
    errors.push(`Variables service_role no permitidas: ${forbiddenEnvKeys.map(([key]) => key).join(', ')}.`)
  }
  if (serviceRoleValues.length > 0) {
    errors.push('Se detectaron valores de entorno que parecen contener service_role.')
  }
  if (publishableKey && anonKey) {
    warnings.push('Se usara VITE_SUPABASE_PUBLISHABLE_KEY y se ignorara VITE_SUPABASE_ANON_KEY.')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config: {
      url,
      keyType,
      hasKey: Boolean(selectedKey),
    },
  }
}

export function buildSafePreviewSummary(contract = {}, metadata = {}) {
  const summary = contract?.uiDto?.uiSummary ?? contract?.metadata?.uiSummary ?? {}
  const preview = contract?.preview ?? {}

  return {
    snapshotId: metadata?.snapshotId ?? null,
    createdAt: metadata?.createdAt ?? null,
    institutionId: metadata?.institutionId ?? null,
    phase: clean(contract?.phase),
    status: clean(contract?.status),
    totalPlanned: Number(summary.totalPlanned ?? preview.plannedMesas?.length ?? 0) || 0,
    totalUnassigned: Number(summary.totalUnassigned ?? preview.unassignedMesas?.length ?? 0) || 0,
    totalWarnings: Number(summary.totalWarnings ?? contract?.warnings?.length ?? 0) || 0,
    totalCriticalErrors: Number(summary.totalCriticalErrors ?? contract?.errors?.length ?? 0) || 0,
    exportValid: Boolean(summary.exportValid ?? contract?.canExportJson),
    readOnly: metadata?.readOnly === true,
  }
}

export function assertNoWriteOperations(fakeSupabase) {
  const writeSpies = collectWriteSpies(fakeSupabase)
  const calledWrites = writeSpies.filter((spy) => spy.calls > 0)

  return {
    valid: calledWrites.length === 0,
    errors: calledWrites.map((spy) => (
      `Operacion de escritura no permitida llamada: ${spy.method} (${spy.path}).`
    )),
  }
}
