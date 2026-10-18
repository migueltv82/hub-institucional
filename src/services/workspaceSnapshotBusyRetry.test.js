import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase.js', () => ({ isSupabaseConfigured: false, supabase: null }))

const { isWorkspaceBusyError, retryWhenWorkspaceBusy, WORKSPACE_BUSY_MESSAGE } = await import('./workspaceSnapshot.js')

const busy = { error: { code: '55P03', message: 'SOURCE_FILE_WORKSPACE_BUSY' } }

describe('retryWhenWorkspaceBusy', () => {
  it('reconoce el bloqueo del gateway por codigo o por mensaje', () => {
    expect(isWorkspaceBusyError({ code: '55P03' })).toBe(true)
    expect(isWorkspaceBusyError({ message: 'ERROR: SOURCE_FILE_WORKSPACE_BUSY' })).toBe(true)
    expect(isWorkspaceBusyError({ code: '23505', message: 'duplicate' })).toBe(false)
    expect(isWorkspaceBusyError(null)).toBe(false)
  })

  it('reintenta una vez y devuelve el resultado bueno', async () => {
    const run = vi.fn().mockResolvedValueOnce(busy).mockResolvedValueOnce({ error: null })
    await expect(retryWhenWorkspaceBusy(run, { delayMs: 0 })).resolves.toEqual({ error: null })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('si sigue ocupado explica el problema en lugar de mostrar el codigo', async () => {
    const run = vi.fn().mockResolvedValue(busy)
    const result = await retryWhenWorkspaceBusy(run, { delayMs: 0 })
    expect(run).toHaveBeenCalledTimes(2)
    expect(result.error.message).toBe(WORKSPACE_BUSY_MESSAGE)
    expect(result.error.message).not.toContain('SOURCE_FILE_WORKSPACE_BUSY')
  })

  it('no reintenta otros errores', async () => {
    const run = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'permiso' } })
    await retryWhenWorkspaceBusy(run, { delayMs: 0 })
    expect(run).toHaveBeenCalledTimes(1)
  })
})
