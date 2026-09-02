import { beforeEach, describe, expect, it } from 'vitest'
import {
  APP_THEME_STORAGE_KEY,
  applyAppTheme,
  getStoredAppTheme,
  initializeAppTheme,
  persistAppTheme,
  resolveInitialAppTheme,
} from './appTheme.js'

describe('appTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
    document.head.innerHTML = '<meta name="theme-color" content="#0f766e">'
  })

  it('prioriza la preferencia persistida sobre el sistema', () => {
    localStorage.setItem(APP_THEME_STORAGE_KEY, 'light')

    expect(resolveInitialAppTheme({
      storage: localStorage,
      matchMedia: () => ({ matches: true }),
    })).toBe('light')
  })

  it('usa la preferencia oscura del sistema cuando no hay valor guardado', () => {
    expect(resolveInitialAppTheme({
      storage: null,
      matchMedia: () => ({ matches: true }),
    })).toBe('dark')
  })

  it('aplica tema, clase, color-scheme y color del navegador', () => {
    expect(applyAppTheme('dark', document)).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0b1513')

    applyAppTheme('light', document)
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#0f766e')
  })

  it('persiste la seleccion y puede inicializarla al cargar la app', () => {
    persistAppTheme('dark', localStorage)

    expect(getStoredAppTheme(localStorage)).toBe('dark')
    expect(initializeAppTheme({ storage: localStorage, documentRef: document })).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
