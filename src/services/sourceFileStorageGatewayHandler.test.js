import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSourceFileStorageHandler } from '../../supabase/functions/source-file-storage/handler.js'
import { buildSourceFileStoragePath } from './sourceFileStoragePath.js'

const ids = { tenant: 'a1300000-0000-4000-8000-000000000001', actor: 'a2300000-0000-4000-8000-000000000001', resource: 'a3300000-0000-4000-8000-000000000001', operation: 'a4300000-0000-4000-8000-000000000001' }
const context = { institutionId: ids.tenant, userId: ids.actor, workspaceKey: 'main', datasetKey: 'horarios' }
const key = buildSourceFileStoragePath(context, ids.operation)
let rows, state, mocks, handler
const prepare = { action: 'prepare', institution_id: ids.tenant, workspace_key: 'main', resource_id: ids.resource, filename: 'horarios.xlsx', mime_type: 'text/csv', file_size: 5 }
const operationRequest = (action) => ({ action, institution_id: ids.tenant, workspace_key: 'main', resource_id: ids.resource, ...(action === 'delete' ? {} : { operation_id: ids.operation }) })
async function request(body, headers = { Authorization: 'Bearer synthetic-test-authorization-token' }, method = 'POST') {
  const response = await handler(new Request('https://example.invalid/functions/v1/source-file-storage', { method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }))
  return { status: response.status, body: await response.json(), headers: response.headers }
}
beforeEach(() => {
  rows = {
    profiles: { user_id: ids.actor, is_blocked: false }, memberships: { institution_id: ids.tenant, user_id: ids.actor, role: 'editor' },
    institutions: { id: ids.tenant, status: 'active' },
    source_file_storage_resources: { id: ids.resource, institution_id: ids.tenant, workspace_key: 'main', dataset_key: 'horarios' },
    workspace_snapshots: { institution_id: ids.tenant, workspace_key: 'main' },
    source_file_storage_operations: { id: ids.operation, resource_id: ids.resource, actor_id: ids.actor, kind: 'upload', state: 'pending', storage_path: key, previous_path: null, file_size: 5, expires_at: new Date(Date.now() + 60_000).toISOString() },
  }
  state = { removed: [], calls: [] }
  mocks = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: ids.actor } }, error: null }),
    sign: vi.fn().mockResolvedValue({ data: { token: 'synthetic-signed-token' }, error: null }),
    remove: vi.fn(async (paths) => { state.removed.push(...paths); return { data: paths.map((name) => ({ name })), error: null } }),
    info: vi.fn().mockResolvedValue({ data: { size: 5 }, error: null }), rpc: vi.fn(), log: vi.fn(),
  }
  mocks.rpc.mockImplementation(async (name, args) => {
    state.calls.push(name)
    if (name === 'source_file_storage_cleanup_candidates') {
      const op = rows.source_file_storage_operations
      const live = rows.workspace_source_files?.storage_path === op.storage_path
      return { data: op.state === 'cancelled' && Date.parse(op.expires_at) < Date.now() - 15 * 60_000 && !live ? [{ id: op.id, storage_path: op.storage_path }] : [], error: null }
    }
    if (name === 'source_file_storage_reserve') rows.source_file_storage_operations = { ...rows.source_file_storage_operations, id: args.p_operation_id, storage_path: args.p_key }
    if (name === 'source_file_storage_cancel') rows.source_file_storage_operations.state = 'cancelled'
    if (name === 'source_file_storage_commit') rows.source_file_storage_operations.state = 'committed'
    return { data: name === 'source_file_storage_begin_delete' ? { id: ids.operation, storage_path: key } : null, error: null }
  })
  const db = { from: (table) => {
    const filters = []
    const matches = (row) => row && filters.every((filter) => filter(row))
    const q = { select: () => q, eq: (field, value) => { filters.push((row) => row[field] === value); return q }, in: (field, values) => { filters.push((row) => values.includes(row[field])); return q }, lt: (field, value) => { filters.push((row) => row[field] < value); return q }, maybeSingle: async () => ({ data: matches(rows[table]) ? rows[table] : null, error: null }), then: (resolve) => Promise.resolve({ data: matches(rows[table]) ? [rows[table]] : [], error: null }).then(resolve) }
    return q
  }, rpc: mocks.rpc, storage: { from: () => ({ createSignedUploadUrl: mocks.sign, remove: mocks.remove, info: mocks.info }) } }
  handler = createSourceFileStorageHandler({ createClient: (_url, token) => token === 'synthetic-service-only' ? db : { auth: { getUser: mocks.getUser } }, env: (name) => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-only' })[name], log: mocks.log })
})

describe('source-file-storage gateway HTTP contract', () => {
  it('clears only the immutable server journal and finishes without querying current resources', async () => {
    const clearId = 'a6300000-0000-4000-8000-000000000001'
    const job = { id: clearId, institution_id: ids.tenant, workspace_key: 'main', actor_id: ids.actor, cutoff_revision: 7, cleared_at: '2026-10-05T00:00:00Z', captured_keys: [{ dataset_key: 'horarios', storage_path: key }] }
    mocks.rpc.mockImplementation(async (name) => ({ data: name === 'source_file_storage_begin_clear' ? job : null, error: null }))
    for (const action of ['begin_clear', 'resume_clear']) {
      const result = await request({ action, institution_id: ids.tenant, workspace_key: 'main', operation_id: clearId })
      expect(result.status).toBe(200)
      expect(result.body).toEqual({ success: true, removed: 1, clear_id: clearId, cutoff_revision: 7, updated_at: job.cleared_at })
    }
    expect(mocks.remove).toHaveBeenNthCalledWith(1, [key])
    expect(mocks.remove).toHaveBeenNthCalledWith(2, [key])
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['source_file_storage_begin_clear', 'source_file_storage_finish_clear', 'source_file_storage_begin_clear', 'source_file_storage_finish_clear'])
  })
  it('does not recapture or finish a clear when its immutable Storage cleanup fails', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: ids.operation, institution_id: ids.tenant, workspace_key: 'main', actor_id: ids.actor, captured_keys: [{ dataset_key: 'horarios', storage_path: key }] }, error: null })
    mocks.remove.mockResolvedValue({ error: new Error('synthetic storage failure') })
    expect((await request({ action: 'resume_clear', institution_id: ids.tenant, workspace_key: 'main', operation_id: ids.operation })).status).toBe(503)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('requires a canonical caller operation ID before any clear RPC', async () => {
    for (const operation_id of [undefined, '../', '%2e%2e', 'not-a-uuid']) {
      expect((await request({ action: 'begin_clear', institution_id: ids.tenant, workspace_key: 'main', operation_id })).status).toBe(400)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('repeats the terminal response without another cleanup or finish', async () => {
    const job = { id: ids.operation, institution_id: ids.tenant, workspace_key: 'main', actor_id: ids.actor, cutoff_revision: 7, cleared_at: '2026-10-05T00:00:00Z', cleanup_finished_at: '2026-10-05T00:00:01Z', captured_keys: [{ dataset_key: 'horarios', storage_path: key }] }
    mocks.rpc.mockResolvedValue({ data: job, error: null })
    const body = { action: 'begin_clear', institution_id: ids.tenant, workspace_key: 'main', operation_id: ids.operation }
    const first = await request(body), second = await request(body)
    expect(first.status).toBe(200)
    expect(second.body).toEqual(first.body)
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.every(([name,args]) => name === 'source_file_storage_begin_clear' && args.p_clear_id === ids.operation)).toBe(true)
  })
  it('constructs the key from DB resource and caller and returns only scoped upload capability', async () => {
    const result = await request(prepare)
    expect(result.status).toBe(200)
    expect(result.body.path).toBe(buildSourceFileStoragePath(context, result.body.operation_id))
    expect(mocks.sign).toHaveBeenCalledWith(result.body.path, { upsert: false })
    expect(result.body).toEqual({ path: result.body.path, operation_id: result.body.operation_id, token: 'synthetic-signed-token' })
    expect(JSON.stringify(result)).not.toContain('synthetic-service-only')
    expect(result.headers.get('Cache-Control')).toBe('no-store')
  })
  it.each(['../', 'a/../', '..%2F', '%2e%2e', '%2E%2E', '..\\', '%5C', '%252e%252e', '.', '..', ''])('denies filename traversal %j before issuing a capability', async (filename) => {
    expect((await request({ ...prepare, filename })).status).toBe(400)
    expect(mocks.sign).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['path', 'storage_path', 'resource_kind', 'dataset_key', 'user_id', 'bucket', 'token'])('rejects caller-controlled routing field %s', async (field) => {
    expect((await request({ ...prepare, [field]: 'free-input' })).status).toBe(400)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it('denies cross-tenant, workspace mismatch and unknown resource IDs', async () => {
    for (const overrides of [{ institution_id: ids.tenant.replace('a130', 'b130') }, { workspace_key: 'foreign' }, { resource_id: ids.resource.replace('a330', 'b330') }]) expect((await request({ ...prepare, ...overrides })).status).toBe(403)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it('denies missing membership, viewer, blocked caller, inactive institution and absent workspace', async () => {
    const original = structuredClone(rows)
    for (const [table, value] of [['memberships', null], ['memberships', { ...original.memberships, role: 'viewer' }], ['profiles', { ...original.profiles, is_blocked: true }], ['institutions', { ...original.institutions, status: 'suspended' }], ['workspace_snapshots', null]]) {
      rows = { ...structuredClone(original), [table]: value }
      expect((await request(prepare)).status).toBe(403)
    }
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it('denies absent/invalid JWT and disallowed CORS, permits preflight', async () => {
    expect((await request(prepare, {})).status).toBe(401)
    mocks.getUser.mockResolvedValue({ error: new Error('bad jwt'), data: {} })
    expect((await request(prepare)).status).toBe(401)
    expect((await request(prepare, { Origin: 'https://untrusted.invalid' })).status).toBe(403)
    expect((await request(null, { Origin: 'http://localhost:4173' }, 'OPTIONS')).status).toBe(200)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
  it('commits the uploaded object before replacing the old one', async () => {
    rows.source_file_storage_operations.previous_path = buildSourceFileStoragePath(context, 'a5300000-0000-4000-8000-000000000001')
    const result = await request(operationRequest('commit'))
    expect(result.body.success).toBe(true)
    expect(mocks.info).toHaveBeenCalledWith(key)
    expect(mocks.rpc).toHaveBeenCalledWith('source_file_storage_commit', { p_resource_id: ids.resource, p_actor_id: ids.actor, p_operation_id: ids.operation })
    expect(mocks.rpc.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.remove.mock.invocationCallOrder[0])
  })
  it('rejects incomplete uploads and resource/actor operation swaps', async () => {
    mocks.info.mockResolvedValue({ data: { size: 2 }, error: null })
    expect((await request(operationRequest('commit'))).status).toBe(409)
    rows.source_file_storage_operations.resource_id = ids.resource.replace('a330', 'b330')
    expect((await request(operationRequest('commit'))).status).toBe(403)
    rows.source_file_storage_operations.resource_id = ids.resource
    rows.source_file_storage_operations.actor_id = ids.actor.replace('a230', 'b230')
    expect((await request(operationRequest('cancel'))).status).toBe(403)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('deletes only the key returned by the authorized DB operation', async () => {
    expect((await request(operationRequest('delete'))).body).toEqual({ success: true, removed: 1 })
    expect(mocks.remove).toHaveBeenCalledWith([key])
    expect(state.calls).toEqual(['source_file_storage_begin_delete', 'source_file_storage_finish_delete'])
  })
  it('fails closed on foreign delete path and does not delete', async () => {
    mocks.rpc.mockResolvedValue({ data: { id: ids.operation, storage_path: key.replace('a230', 'b230') }, error: null })
    expect((await request(operationRequest('delete'))).status).toBe(503)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('recovers an abandoned upload by resource after the operation ID is lost', async () => {
    rows.source_file_storage_operations.expires_at = new Date(Date.now() - 60_000).toISOString()
    const result = await request({ ...operationRequest('delete'), action: 'recover' })
    expect(result.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('source_file_storage_cancel', { p_resource_id: ids.resource, p_actor_id: ids.actor, p_operation_id: ids.operation })
    expect(mocks.remove).toHaveBeenCalledWith([key])
  })
  it('denies recovery of another actor operation', async () => {
    rows.source_file_storage_operations.actor_id = ids.actor.replace('a230', 'b230')
    expect((await request({ ...operationRequest('delete'), action: 'recover' })).status).toBe(403)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('sweeps cancelled late uploads after capability expiry without deleting live manifests', async () => {
    rows.source_file_storage_operations.state = 'cancelled'
    rows.source_file_storage_operations.expires_at = new Date(Date.now() - 60 * 60_000).toISOString()
    expect((await request({ ...operationRequest('delete'), action: 'cleanup' })).body.removed).toBe(1)
    expect(mocks.remove).toHaveBeenCalledWith([key])
    mocks.remove.mockClear()
    rows.workspace_source_files = { storage_bucket: 'workspace-source-files', storage_path: key }
    expect((await request({ ...operationRequest('delete'), action: 'cleanup' })).body.removed).toBe(0)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
  it('keeps manifest and deletion journal recoverable when Storage remove fails', async () => {
    mocks.remove.mockResolvedValue({ error: new Error('Storage offline'), data: null })
    expect((await request(operationRequest('delete'))).status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalledWith('source_file_storage_finish_delete', expect.anything())
  })
  it('returns cleanup_pending after successful commit if old object remove fails', async () => {
    rows.source_file_storage_operations.previous_path = buildSourceFileStoragePath(context, 'a5300000-0000-4000-8000-000000000001')
    mocks.remove.mockResolvedValue({ error: new Error('Storage offline') })
    const result = await request(operationRequest('commit'))
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ success: true, cleanup_pending: true })
    expect(rows.source_file_storage_operations.state).toBe('committed')
  })
  it('preserves old manifest on failed upload or commit, and reports cleanup failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error('DB failure with sensitive internal detail') })
    const result = await request(operationRequest('commit'))
    expect(result.status).toBe(503)
    expect(JSON.stringify(result.body)).not.toContain('sensitive')
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('synthetic-signed-token')
  })
})
