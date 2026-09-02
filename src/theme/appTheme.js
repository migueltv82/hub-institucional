export const APP_THEME_STORAGE_KEY = 'institutional-hub.theme'
export const APP_THEMES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
})

function isTheme(value) {
  return value === APP_THEMES.LIGHT || value === APP_THEMES.DARK
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function getDefaultMatchMedia() {
  return typeof globalThis.matchMedia === 'function'
    ? globalThis.matchMedia.bind(globalThis)
    : null
}

export function getStoredAppTheme(storage = getDefaultStorage()) {
  try {
    const value = storage?.getItem(APP_THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export function getSystemAppTheme(matchMedia = getDefaultMatchMedia()) {
  try {
    return matchMedia?.('(prefers-color-scheme: dark)')?.matches
      ? APP_THEMES.DARK
      : APP_THEMES.LIGHT
  } catch {
    return APP_THEMES.LIGHT
  }
}

export function resolveInitialAppTheme({ storage, matchMedia } = {}) {
  return getStoredAppTheme(storage) ?? getSystemAppTheme(matchMedia)
}

export function applyAppTheme(theme, documentRef = globalThis.document) {
  const safeTheme = isTheme(theme) ? theme : APP_THEMES.LIGHT
  const root = documentRef?.documentElement
  if (!root) return safeTheme

  root.dataset.theme = safeTheme
  root.classList.toggle('dark', safeTheme === APP_THEMES.DARK)
  root.style.colorScheme = safeTheme

  const themeColor = documentRef.querySelector?.('meta[name="theme-color"]')
  themeColor?.setAttribute('content', safeTheme === APP_THEMES.DARK ? '#0b1513' : '#0f766e')
  return safeTheme
}

export function persistAppTheme(theme, storage = getDefaultStorage()) {
  const safeTheme = isTheme(theme) ? theme : APP_THEMES.LIGHT
  try {
    storage?.setItem(APP_THEME_STORAGE_KEY, safeTheme)
  } catch {
    // El cambio visual sigue funcionando aunque el navegador bloquee storage.
  }
  return safeTheme
}

export function initializeAppTheme(options = {}) {
  const theme = resolveInitialAppTheme(options)
  return applyAppTheme(theme, options.documentRef)
}
