import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn() }))
vi.mock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { from: mocks.from } }))
vi.mock('./sourceFileStorageGateway.js', () => ({ invokeSourceFileStorage: mocks.invoke }))
import { clearWorkspaceData } from './workspaceSnapshot.js'
const operationId = 'a6300000-0000-4000-8000-000000000001'

describe('workspace clear Storage gateway preflight', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })
  it('does not empty snapshot or mutate tables when legacy/foreign/busy preflight is denied', async () => {
    localStorage.setItem('existing-workspace', JSON.stringify({ meaningful: true }))
    mocks.invoke.mockRejectedValue(new Error('Archivo legacy o recurso ocupado.'))
    await expect(clearWorkspaceData({ institutionId: 'a1300000-0000-4000-8000-000000000001', workspaceKey: 'main', useRemote: true, operationId })).rejects.toThrow('legacy')
    expect(mocks.invoke).toHaveBeenCalledWith({ action: 'begin_clear', institution_id: 'a1300000-0000-4000-8000-000000000001', workspace_key: 'main', operation_id: operationId })
    expect(mocks.from).not.toHaveBeenCalled()
    expect(localStorage.getItem('existing-workspace')).toBe(JSON.stringify({ meaningful: true }))
    expect(localStorage.length).toBe(1)
  })
  it('loads current post-clear data without any client upsert/delete or empty local snapshot write', async () => {
    mocks.invoke.mockResolvedValue({ success: true, clear_id: 'a6300000-0000-4000-8000-000000000001', cutoff_revision: 8, removed: 1 })
    const write = vi.fn()
    mocks.from.mockImplementation((table) => {
      const data = table === 'workspace_snapshots' ? { payload: { alumnos: [{ id: 'created-after-cutoff' }] }, updated_at: '2026-10-05T03:00:00Z' } : []
      const q = { select: () => q, eq: () => q, in: () => q, order: () => q, upsert: write, delete: write, maybeSingle: async () => ({ data, error: null }), then: (resolve) => Promise.resolve({ data, error: null }).then(resolve) }
      return q
    })
    const result = await clearWorkspaceData({ institutionId: 'a1300000-0000-4000-8000-000000000001', workspaceKey: 'main', useRemote: true, operationId })
    expect(write).not.toHaveBeenCalled()
    expect(result.snapshot.alumnos).toEqual([{ id: 'created-after-cutoff' }])
    expect(result.reloadRequired).toBe(true)
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
  })
})
