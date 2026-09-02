import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearLegacySupabaseAuthStorage,
  getEffectiveAuthStorageKey,
  getSupabaseAuthStorage,
  LEGACY_SUPABASE_AUTH_STORAGE_KEYS,
  resolveSessionSlot,
  sanitizeSessionSlot,
  SUPABASE_AUTH_STORAGE_KEY,
} from './authStorage.js'

describe('authStorage', () => {
  it('usa una clave de sesion nueva para no restaurar sesiones persistidas viejas', () => {
    expect(SUPABASE_AUTH_STORAGE_KEY).toBe('institutionalhub.supabase.auth.session')
    expect(LEGACY_SUPABASE_AUTH_STORAGE_KEYS).toContain('mesaflow.supabase.auth')
  })

  it('comparte la sesion entre ventanas mediante localStorage', () => {
    expect(getSupabaseAuthStorage()).toBe(localStorage)
  })

  it('limpia las sesiones legacy de localStorage', () => {
    const storage = {
      removeItem: vi.fn(),
    }

    clearLegacySupabaseAuthStorage(storage)

    expect(storage.removeItem).toHaveBeenCalledWith('mesaflow.supabase.auth')
  })

  it('ignora errores del storage del navegador', () => {
    const storage = {
      removeItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }

    expect(() => clearLegacySupabaseAuthStorage(storage)).not.toThrow()
  })
})

describe('sanitizeSessionSlot', () => {
  it('normaliza a un slug seguro, sin tildes ni mayusculas', () => {
    expect(sanitizeSessionSlot('Docente Perez')).toBe('docente-perez')
    expect(sanitizeSessionSlot('Alumno Ñañez 2')).toBe('alumno-nanez-2')
  })

  it('devuelve vacio para valores vacios o invalidos', () => {
    expect(sanitizeSessionSlot('')).toBe('')
    expect(sanitizeSessionSlot(null)).toBe('')
    expect(sanitizeSessionSlot('   ')).toBe('')
  })
})

describe('sesiones por pestana (slots)', () => {
  afterEach(() => {
    sessionStorage.clear()
    window.history.pushState(null, '', '/')
  })

  it('sin query param ni nada recordado, usa la sesion principal', () => {
    expect(resolveSessionSlot()).toBe('')
    expect(getEffectiveAuthStorageKey()).toBe(SUPABASE_AUTH_STORAGE_KEY)
  })

  it('toma el slot del query param ?sesion= y arma una storageKey distinta', () => {
    window.history.pushState(null, '', '/?sesion=docente')

    expect(resolveSessionSlot()).toBe('docente')
    expect(getEffectiveAuthStorageKey()).toBe(`${SUPABASE_AUTH_STORAGE_KEY}::docente`)
  })

  it('recuerda el slot en sessionStorage aunque la URL despues lo pierda', () => {
    window.history.pushState(null, '', '/?sesion=alumno')
    expect(resolveSessionSlot()).toBe('alumno')

    window.history.pushState(null, '', '/')
    expect(resolveSessionSlot()).toBe('alumno')
  })

  it('el slot "primaria" equivale a no tener slot', () => {
    window.history.pushState(null, '', '/?sesion=primaria')

    expect(getEffectiveAuthStorageKey()).toBe(SUPABASE_AUTH_STORAGE_KEY)
  })
})
