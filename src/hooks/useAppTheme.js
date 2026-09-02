import { useCallback, useEffect, useState } from 'react'
import {
  APP_THEME_STORAGE_KEY,
  APP_THEMES,
  applyAppTheme,
  getStoredAppTheme,
  getSystemAppTheme,
  persistAppTheme,
  resolveInitialAppTheme,
} from '../theme/appTheme.js'

export function useAppTheme() {
  const [theme, setTheme] = useState(resolveInitialAppTheme)

  useEffect(() => {
    applyAppTheme(theme)
  }, [theme])

  useEffect(() => {
    const mediaQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mediaQuery) return undefined

    function handleSystemThemeChange() {
      if (!getStoredAppTheme()) setTheme(getSystemAppTheme())
    }

    mediaQuery.addEventListener?.('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener?.('change', handleSystemThemeChange)
  }, [])

  useEffect(() => {
    function handleStoredThemeChange(event) {
      if (event.key !== APP_THEME_STORAGE_KEY) return
      setTheme(event.newValue === APP_THEMES.DARK ? APP_THEMES.DARK : APP_THEMES.LIGHT)
    }

    globalThis.addEventListener?.('storage', handleStoredThemeChange)
    return () => globalThis.removeEventListener?.('storage', handleStoredThemeChange)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === APP_THEMES.DARK ? APP_THEMES.LIGHT : APP_THEMES.DARK
      persistAppTheme(nextTheme)
      return nextTheme
    })
  }, [])

  return { theme, toggleTheme }
}
