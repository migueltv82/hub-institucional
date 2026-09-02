export const SUPABASE_AUTH_STORAGE_KEY = 'institutionalhub.supabase.auth.session'

export const LEGACY_SUPABASE_AUTH_STORAGE_KEYS = [
  'mesaflow.supabase.auth',
]

// Nombre del query param que identifica una "sesion" (slot) independiente
// dentro de la misma sesion de navegador. Ver resolveSessionSlot().
export const SESSION_SLOT_QUERY_PARAM = 'sesion'

// sessionStorage es por pestana/ventana (no se comparte como localStorage),
// asi que aca guardamos a que slot quedo atada esta pestana en particular.
const SESSION_SLOT_TAB_STORAGE_KEY = 'institutionalhub.session-slot'

const DEFAULT_SESSION_SLOT = 'primaria'
const MAX_SESSION_SLOT_LENGTH = 40

function getBrowserStorage(storageName) {
  if (typeof globalThis === 'undefined') return null

  try {
    const storage = globalThis[storageName]
    if (
      storage &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function' &&
      typeof storage.removeItem === 'function'
    ) {
      return storage
    }
  } catch {
    return null
  }

  return null
}

export function getSupabaseAuthStorage() {
  // localStorage is intentionally used here so every tab/window of the same
  // browser shares the authenticated Supabase session. Supabase Auth keeps
  // those clients synchronized through its cross-tab channel and sign-out
  // still removes the persisted session.
  return getBrowserStorage('localStorage')
}

export function clearLegacySupabaseAuthStorage(storage = getBrowserStorage('localStorage')) {
  if (!storage) return

  for (const key of LEGACY_SUPABASE_AUTH_STORAGE_KEYS) {
    try {
      storage.removeItem(key)
    } catch {
      // Browsers can block storage access; auth must still fail closed.
    }
  }
}

// Normaliza un nombre de sesion arbitrario ("Docente 2", "Alumno Perez") a un
// slug seguro para usar como query param y como sufijo de storageKey.
export function sanitizeSessionSlot(rawSlot) {
  if (!rawSlot) return ''

  return String(rawSlot)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SESSION_SLOT_LENGTH)
}

function getLocation() {
  if (typeof globalThis === 'undefined') return null
  try {
    return globalThis.location ?? null
  } catch {
    return null
  }
}

// Determina a que slot de sesion pertenece esta pestana/ventana.
//
// Prioridad: query param ?sesion=X en la URL actual (y lo recordamos en
// sessionStorage, que es por pestana, para sobrevivir a reloads aunque el
// router interno pise la URL) > lo que ya estaba recordado para esta pestana.
// Sin slot (o slot "primaria") equivale al comportamiento historico: la
// sesion principal, compartida via localStorage como siempre.
export function resolveSessionSlot() {
  const sessionStorage = getBrowserStorage('sessionStorage')
  const location = getLocation()

  if (location) {
    try {
      const fromUrl = sanitizeSessionSlot(new URLSearchParams(location.search).get(SESSION_SLOT_QUERY_PARAM))
      if (fromUrl) {
        try {
          sessionStorage?.setItem(SESSION_SLOT_TAB_STORAGE_KEY, fromUrl)
        } catch {
          // Si no se puede persistir igual devolvemos el slot de esta carga de pagina.
        }
        return fromUrl
      }
    } catch {
      // location.search invalido: seguimos con lo recordado en sessionStorage.
    }
  }

  try {
    return sanitizeSessionSlot(sessionStorage?.getItem(SESSION_SLOT_TAB_STORAGE_KEY))
  } catch {
    return ''
  }
}

// Clave de storage efectiva para el cliente de Supabase Auth de esta pestana.
// Sin slot (uso normal, la inmensa mayoria de las pestanas) es identica a
// SUPABASE_AUTH_STORAGE_KEY: cero cambio de comportamiento. Con slot, cada
// pestana persiste su propia sesion en localStorage bajo una clave distinta,
// asi que conviven varias sesiones logueadas a la vez en el mismo navegador.
export function getEffectiveAuthStorageKey() {
  const slot = resolveSessionSlot()
  if (!slot || slot === DEFAULT_SESSION_SLOT) return SUPABASE_AUTH_STORAGE_KEY
  return `${SUPABASE_AUTH_STORAGE_KEY}::${slot}`
}
