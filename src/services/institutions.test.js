import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadInstitutionsService({
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

  const module = await import('./institutions.js')

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

describe('institutions service', () => {
  it('usa instituciones demo si Supabase no esta configurado', async () => {
    const { fetchLoginInstitutions } = await loadInstitutionsService({
      isSupabaseConfigured: false,
    })

    const result = await fetchLoginInstitutions()

    expect(result.source).toBe('local-demo')
    expect(result.institutions).toHaveLength(2)
    expect(result.institutions.every((institution) => institution.status === 'active')).toBe(true)
  })

  it('carga instituciones activas desde la RPC remota', async () => {
    const { fetchLoginInstitutions, rpc } = await loadInstitutionsService({
      rpcResult: {
        data: [{
          id: 'inst-1',
          name: 'Instituto Uno',
          slug: 'instituto-uno',
          logo_url: null,
          plan_type: null,
          status: 'active',
          created_at: '2026-06-18T00:00:00.000Z',
        }],
        error: null,
      },
    })

    await expect(fetchLoginInstitutions()).resolves.toEqual({
      institutions: [{
        id: 'inst-1',
        name: 'Instituto Uno',
        slug: 'instituto-uno',
        logo_url: '',
        plan_type: 'free',
        status: 'active',
        created_at: '2026-06-18T00:00:00.000Z',
      }],
      source: 'supabase',
    })
    expect(rpc).toHaveBeenCalledWith('list_active_login_institutions')
  })

  it('no muestra instituciones demo si Supabase configurado falla con Failed to fetch', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchLoginInstitutions } = await loadInstitutionsService({
      rpcReject: new TypeError('Failed to fetch'),
    })

    await expect(fetchLoginInstitutions()).rejects.toThrow(
      'No se pudo conectar con Supabase para cargar tus instituciones.',
    )
  })

  it('no muestra instituciones demo ante errores DNS devueltos por Supabase configurado', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchLoginInstitutions } = await loadInstitutionsService({
      rpcResult: {
        data: null,
        error: {
          message: 'TypeError: fetch failed',
          details: 'Caused by: Error: getaddrinfo ENOTFOUND project.supabase.co',
        },
      },
    })

    await expect(fetchLoginInstitutions()).rejects.toThrow(
      'No se pudo conectar con Supabase para cargar tus instituciones.',
    )
  })

  it('mantiene error claro si falta la RPC', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchLoginInstitutions } = await loadInstitutionsService({
      rpcResult: {
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.list_active_login_institutions() in the schema cache',
        },
      },
    })

    await expect(fetchLoginInstitutions()).rejects.toThrow(
      'Falta crear la RPC `list_active_login_institutions`.',
    )
  })

  it('mantiene error claro ante permisos/RLS', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { fetchLoginInstitutions } = await loadInstitutionsService({
      rpcResult: {
        data: null,
        error: {
          code: '42501',
          message: 'permission denied for function list_active_login_institutions',
        },
      },
    })

    await expect(fetchLoginInstitutions()).rejects.toThrow(
      'Supabase rechazo la consulta por permisos.',
    )
  })
})
