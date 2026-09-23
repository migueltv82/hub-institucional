import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({ auth: {} })) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

describe('validacion antes de inicializar Supabase', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.createClient.mockClear()
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    vi.stubEnv('VITE_DISABLE_AUTH', 'false')
  })

  afterEach(() => vi.unstubAllEnvs())

  it.each([
    ['VITE_DISABLE_AUTH', 'true'],
    ['VITE_SERVICE_ROLE_TOKEN', 'valor-privado-de-prueba'],
  ])('impide crear el cliente con %s insegura', async (key, value) => {
    vi.stubEnv(key, value)
    await expect(import('./supabaseClient.js')).rejects.toThrow()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('inicializa el cliente con configuracion publica segura', async () => {
    const client = await import('./supabaseClient.js')
    expect(client.isSupabaseConfigured).toBe(true)
    expect(mocks.createClient).toHaveBeenCalledOnce()
  })
})
