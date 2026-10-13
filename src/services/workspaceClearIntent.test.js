import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getWorkspaceClearOperationId, completeWorkspaceClearIntent } from './workspaceClearIntent.js'
const context = { institutionId: 'tenant-a', workspaceKey: 'main', ownerUserId: 'actor-a' }
describe('stable workspace clear intention', () => {
  beforeEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })
  it('persists before HTTP, survives retries/remounts and starts a new explicit clear only after success', () => {
    const first = getWorkspaceClearOperationId(context)
    expect(getWorkspaceClearOperationId({ ...context })).toBe(first)
    expect(getWorkspaceClearOperationId(context)).toBe(first)
    completeWorkspaceClearIntent(context, first)
    expect(getWorkspaceClearOperationId(context)).not.toBe(first)
  })
  it('isolates workspace, institution and actor and does not clear another newer intention', () => {
    const first = getWorkspaceClearOperationId(context)
    const others = [{ ...context, institutionId: 'tenant-b' }, { ...context, workspaceKey: 'other' }, { ...context, ownerUserId: 'actor-b' }].map(getWorkspaceClearOperationId)
    expect(new Set([first, ...others]).size).toBe(4)
    completeWorkspaceClearIntent(context, first)
    const newer = getWorkspaceClearOperationId(context)
    completeWorkspaceClearIntent(context, first)
    expect(getWorkspaceClearOperationId(context)).toBe(newer)
  })
  it('fails closed before HTTP when persistence is unavailable or an intention is corrupt', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked') })
    expect(() => getWorkspaceClearOperationId(context)).toThrow('storage blocked')
    vi.restoreAllMocks()
    sessionStorage.setItem(`mesaflow.storage-clear.v1:${JSON.stringify(['tenant-a','main','actor-a'])}`, '../')
    expect(() => getWorkspaceClearOperationId(context)).toThrow()
  })
})
