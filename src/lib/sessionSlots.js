import { SESSION_SLOT_QUERY_PARAM } from './authStorage.js'

// Registro de slots de sesion guardados para la UI (nombres visibles, no
// credenciales). El token de cada slot vive aparte, en la clave de
// localStorage que arma getEffectiveAuthStorageKey().
const REGISTRY_KEY = 'institutionalhub.session-slots-registry'

function getStorage() {
  if (typeof globalThis === 'undefined') return null
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function listSessionSlots() {
  const storage = getStorage()
  if (!storage) return []

  try {
    const raw = storage.getItem(REGISTRY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.slug === 'string')
      : []
  } catch {
    return []
  }
}

export function saveSessionSlot({ slug, label }) {
  const storage = getStorage()
  if (!storage || !slug) return

  const next = [
    ...listSessionSlots().filter((entry) => entry.slug !== slug),
    { slug, label: label?.trim() || slug },
  ]

  try {
    storage.setItem(REGISTRY_KEY, JSON.stringify(next))
  } catch {
    // Storage lleno o bloqueado: la sesion nueva igual funciona, solo no queda guardado el atajo.
  }
}

export function removeSessionSlot(slug) {
  const storage = getStorage()
  if (!storage) return

  const next = listSessionSlots().filter((entry) => entry.slug !== slug)

  try {
    storage.setItem(REGISTRY_KEY, JSON.stringify(next))
  } catch {
    // Ver comentario en saveSessionSlot.
  }
}

// URL para abrir una pestana nueva atada al slot dado (slug vacio = sesion
// principal, sin parametro).
export function buildSessionSlotUrl(slug) {
  if (typeof globalThis === 'undefined' || !globalThis.location) return ''

  const url = new URL(globalThis.location.href)
  url.search = ''
  url.hash = ''
  if (slug) url.searchParams.set(SESSION_SLOT_QUERY_PARAM, slug)
  return url.toString()
}
