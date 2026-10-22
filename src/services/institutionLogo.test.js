import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))

const { fitLogoSize, isStoredLogoDataUrl, saveInstitutionLogo } = await import('./institutionLogo.js')

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('institutionLogo', () => {
  beforeEach(() => rpc.mockReset())

  it('achica logos grandes sin deformarlos y no agranda los chicos', () => {
    expect(fitLogoSize(1800, 600)).toEqual({ width: 900, height: 300 })
    expect(fitLogoSize(441, 135)).toEqual({ width: 441, height: 135 })
    expect(fitLogoSize(600, 1200)).toEqual({ width: 150, height: 300 })
  })

  it('solo acepta data URL PNG o JPEG', () => {
    expect(isStoredLogoDataUrl(PNG)).toBe(true)
    expect(isStoredLogoDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isStoredLogoDataUrl('https://example.invalid/logo.png')).toBe(false)
  })

  it('guarda el logo con la RPC y traduce el rechazo de permisos', async () => {
    rpc.mockResolvedValueOnce({ data: PNG, error: null })
    await expect(saveInstitutionLogo({ institutionId: 'inst-1', logoDataUrl: PNG })).resolves.toBe(PNG)
    expect(rpc).toHaveBeenCalledWith('set_institution_logo', { target_institution_id: 'inst-1', target_logo_url: PNG })

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Acceso denegado' } })
    await expect(saveInstitutionLogo({ institutionId: 'inst-1', logoDataUrl: PNG })).rejects.toThrow('Solo el owner o admin')
  })

  it('quitar el logo manda vacio y no acepta formatos que la base rechazaria', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(saveInstitutionLogo({ institutionId: 'inst-1', logoDataUrl: '' })).resolves.toBe('')
    await expect(saveInstitutionLogo({ institutionId: 'inst-1', logoDataUrl: 'data:image/gif;base64,R0lGOD' })).rejects.toThrow('PNG o JPG')
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
