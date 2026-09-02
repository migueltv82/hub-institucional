import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_THEME_STORAGE_KEY } from '../theme/appTheme.js'
import { useAppTheme } from './useAppTheme.js'

describe('useAppTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    delete globalThis.matchMedia
  })

  it('alterna y persiste el tema seleccionado', () => {
    const { result } = renderHook(() => useAppTheme())

    expect(result.current.theme).toBe('light')
    act(() => result.current.toggleTheme())

    expect(result.current.theme).toBe('dark')
    expect(localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
