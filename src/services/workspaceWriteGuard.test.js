import { describe, expect, it, vi } from 'vitest'
import {
  retryThrownWorkspaceBusy,
  serializeWorkspaceWrite,
  WORKSPACE_BUSY_MESSAGE,
} from './workspaceWriteGuard.js'

const busyError = () => Object.assign(new Error('SOURCE_FILE_WORKSPACE_BUSY'), { code: '55P03' })

describe('retryThrownWorkspaceBusy', () => {
  it('reintenta un paso que lanzo el bloqueo del workspace', async () => {
    const run = vi.fn().mockRejectedValueOnce(busyError()).mockResolvedValueOnce('ok')
    await expect(retryThrownWorkspaceBusy(run, { delaysMs: [0, 0] })).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('si sigue ocupado explica el problema en lugar de mostrar el codigo', async () => {
    const run = vi.fn().mockRejectedValue(busyError())
    await expect(retryThrownWorkspaceBusy(run, { delaysMs: [0, 0] })).rejects.toThrow(WORKSPACE_BUSY_MESSAGE)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('no reintenta otros errores', async () => {
    const run = vi.fn().mockRejectedValue(new Error('permiso'))
    await expect(retryThrownWorkspaceBusy(run, { delaysMs: [0, 0] })).rejects.toThrow('permiso')
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('serializeWorkspaceWrite', () => {
  it('no deja que dos escrituras del mismo workspace se crucen', async () => {
    const events = []
    let release
    const first = serializeWorkspaceWrite({ institutionId: 'i1', workspaceKey: 'main' }, async () => {
      events.push('first:start')
      await new Promise((resolve) => { release = resolve })
      events.push('first:end')
    })
    const second = serializeWorkspaceWrite({ institutionId: 'i1', workspaceKey: 'main' }, async () => {
      events.push('second:start')
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    release()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('una escritura fallida no bloquea las siguientes', async () => {
    const failed = serializeWorkspaceWrite({ institutionId: 'i2', workspaceKey: 'main' }, async () => {
      throw new Error('fallo')
    })
    const next = serializeWorkspaceWrite({ institutionId: 'i2', workspaceKey: 'main' }, async () => 'ok')
    await expect(failed).rejects.toThrow('fallo')
    await expect(next).resolves.toBe('ok')
  })
})
