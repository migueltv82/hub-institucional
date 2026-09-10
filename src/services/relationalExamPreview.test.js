import { describe, expect, it, vi } from 'vitest'
vi.mock('../lib/supabase.js', () => ({ supabase: null }))
import { fetchRelationalExamPreview, fetchRelationalPreviewSetting, saveRelationalPreviewSetting } from './relationalExamPreview.js'

function clientWith(result) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result),
  }
  return { query, from: vi.fn(() => query) }
}

describe('configuracion persistente de previsualizacion', () => {
  it('una opcion ausente esta deshabilitada y no lee tablas academicas', async () => {
    const client = clientWith({ data: null, error: null })
    expect(await fetchRelationalPreviewSetting({ institutionId: 'a', client })).toBe(false)
    await expect(fetchRelationalExamPreview({ institutionId: 'a', client })).rejects.toThrow('no esta habilitada')
    expect(client.from.mock.calls.every(([table]) => table === 'app_settings')).toBe(true)
    expect(client.query.upsert).not.toHaveBeenCalled()
  })
  it('guarda exclusivamente la opcion publica de la institucion elegida', async () => {
    const client = clientWith({ data: { value: { enabled: true } }, error: null })
    await saveRelationalPreviewSetting({ institutionId: 'a', enabled: true, client })
    expect(client.query.upsert).toHaveBeenCalledWith({ key: 'exam_relational_preview:a', value: { enabled: true }, is_public: true, updated_at: expect.any(String) }, { onConflict: 'key' })
  })
  it('propaga la denegacion RLS y no simula un guardado exitoso', async () => {
    const client = clientWith({ data: null, error: new Error('permission denied') })
    await expect(saveRelationalPreviewSetting({ institutionId: 'a', enabled: false, client })).rejects.toThrow('permission denied')
    await expect(fetchRelationalPreviewSetting({ institutionId: 'a', client })).rejects.toThrow('permission denied')
  })
  it('rechaza habilitaciones ambiguas', async () => {
    const client = clientWith({})
    await expect(saveRelationalPreviewSetting({ institutionId: 'a', enabled: 'true', client })).rejects.toThrow('booleana')
    expect(client.from).not.toHaveBeenCalled()
  })
})
