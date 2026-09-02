import { afterEach, describe, expect, it, vi } from 'vitest'

const DEFAULT_APP_STATUS = {
  maintenanceEnabled: false,
  maintenanceMessage: 'La plataforma esta en mantenimiento. Intenta nuevamente en unos minutos.',
  updatedAt: null,
}

async function loadAppConfigService({
  isSupabaseConfigured = true,
  rpcResult = { data: null, error: null },
  rpcReject = null,
} = {}) {
  vi.resetModules()

  const rpc = vi.fn()
  if (rpcReject) rpc.mockRejectedValue(rpcReject)
  else rpc.mockResolvedValue(rpcResult)

  vi.doMock('../lib/supabase.js', () => ({
    isSupabaseConfigured,
    supabase: isSupabaseConfigured ? { rpc } : null,
  }))

  const module = await import('./appConfig.js')

  return {
    ...module,
    rpc,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

describe('appConfig service', () => {
  it('usa el estado por defecto cuando Supabase no esta configurado', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchPublicAppStatus } = await loadAppConfigService({
      isSupabaseConfigured: false,
    })

    await expect(fetchPublicAppStatus()).resolves.toEqual(DEFAULT_APP_STATUS)
  })

  it('mapea el estado publico recibido desde Supabase', async () => {
    const { fetchPublicAppStatus, rpc } = await loadAppConfigService({
      rpcResult: {
        data: {
          maintenance_enabled: true,
          maintenance_message: 'Mantenimiento programado',
          updated_at: '2026-05-14T03:00:00.000Z',
        },
        error: null,
      },
    })

    await expect(fetchPublicAppStatus()).resolves.toEqual({
      maintenanceEnabled: true,
      maintenanceMessage: 'Mantenimiento programado',
      updatedAt: '2026-05-14T03:00:00.000Z',
    })

    expect(rpc).toHaveBeenCalledWith('get_public_app_status')
  })

  it('degrada a fallback cuando el RPC publico todavia no existe', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchPublicAppStatus } = await loadAppConfigService({
      rpcResult: {
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.get_public_app_status() in the schema cache',
        },
      },
    })

    await expect(fetchPublicAppStatus()).resolves.toEqual(DEFAULT_APP_STATUS)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('degrada a fallback ante errores de conectividad de Supabase', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchPublicAppStatus } = await loadAppConfigService({
      rpcResult: {
        data: null,
        error: {
          code: '',
          message: 'TypeError: fetch failed',
          details: 'Caused by: Error: getaddrinfo ENOTFOUND project.supabase.co',
        },
      },
    })

    await expect(fetchPublicAppStatus()).resolves.toEqual(DEFAULT_APP_STATUS)
  })

  it('separa errores de permisos/RLS', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchPublicAppStatus } = await loadAppConfigService({
      rpcResult: {
        data: null,
        error: {
          code: '42501',
          status: 403,
          message: 'permission denied for function get_public_app_status',
        },
      },
    })

    await expect(fetchPublicAppStatus()).rejects.toThrow(
      'No tenes permisos para verificar el estado operativo de la plataforma.',
    )
  })

  it('separa errores de sesion no disponible', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchPublicAppStatus } = await loadAppConfigService({
      rpcResult: {
        data: null,
        error: {
          status: 401,
          message: 'JWT expired',
        },
      },
    })

    await expect(fetchPublicAppStatus()).rejects.toThrow(
      'No hay una sesion disponible para verificar el estado operativo. Inicia sesion e intenta nuevamente.',
    )
  })

  it('degrada a fallback ante timeout', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchPublicAppStatus } = await loadAppConfigService({
      rpcReject: {
        name: 'AbortError',
        message: 'request timed out',
      },
    })

    await expect(fetchPublicAppStatus()).resolves.toEqual(DEFAULT_APP_STATUS)
  })

  it('falla de forma controlada ante errores inesperados de Supabase', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchPublicAppStatus } = await loadAppConfigService({
      rpcResult: {
        data: null,
        error: {
          code: 'XX000',
          message: 'unexpected failure',
        },
      },
    })

    await expect(fetchPublicAppStatus()).rejects.toThrow(
      'No se pudo verificar el estado operativo de la plataforma. Intenta nuevamente en unos minutos.',
    )
  })

  it('clasifica errores sin exponer secretos', async () => {
    const { classifyPublicAppStatusError } = await loadAppConfigService()

    expect(classifyPublicAppStatusError({
      code: 'PGRST202',
      message: 'Could not find the function public.get_public_app_status() in the schema cache',
    })).toBe('missing_remote_object')
    expect(classifyPublicAppStatusError({ status: 403, message: 'RLS denied' })).toBe('permission_denied')
    expect(classifyPublicAppStatusError({ message: 'TypeError: fetch failed ENOTFOUND' })).toBe('connectivity')
  })
})
