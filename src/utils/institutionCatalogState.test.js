import { describe, expect, it } from 'vitest'
import { canCreateUserForCatalog, institutionCatalogState } from './institutionCatalogState.js'

describe('institutionCatalogState (D1b)', () => {
  it('no dice "vacio" mientras carga ni cuando fallo', () => {
    expect(institutionCatalogState({ isPending: true, institutions: [] })).toBe('loading')
    expect(institutionCatalogState({ isError: true, institutions: [] })).toBe('error')
    expect(institutionCatalogState({ isPending: true, isError: true })).toBe('error')
  })

  it('vacio solo con la consulta terminada y sin filas', () => {
    expect(institutionCatalogState({ institutions: [] })).toBe('empty')
    expect(institutionCatalogState({ institutions: [{ id: 'i1' }] })).toBe('ready')
    expect(institutionCatalogState({ institutions: null })).toBe('empty')
  })

  it('solo habilita "Nuevo usuario" con instituciones cargadas', () => {
    expect(['loading', 'error', 'empty', 'ready'].map(canCreateUserForCatalog)).toEqual([false, false, false, true])
  })
})
