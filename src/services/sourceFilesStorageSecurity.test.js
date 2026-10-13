import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), lookup: vi.fn(), signedUpload: vi.fn(), download: vi.fn(), invoke: vi.fn(), directUpload: vi.fn(), directRemove: vi.fn(), upsert: vi.fn(), deleteRows: vi.fn() }))
vi.mock('../lib/supabase.js', () => {
  const query = { select: () => query, eq: () => query, maybeSingle: mocks.lookup, order: mocks.lookup, upsert: mocks.upsert, delete: mocks.deleteRows }
  return { isSupabaseConfigured: true, supabase: { auth: { getUser: mocks.getUser }, from: () => query, functions: { invoke: mocks.invoke }, storage: { from: () => ({ uploadToSignedUrl: mocks.signedUpload, download: mocks.download, upload: mocks.directUpload, remove: mocks.directRemove }) } } }
})
import { deleteSourceFile, downloadSourceFiles, saveSourceFile } from './sourceFiles.js'
import { SOURCE_FILES_BUCKET, sourceFileStoragePrefix } from './sourceFileStoragePath.js'
const userId = 'a2300000-0000-4000-8000-000000000001', resourceId = 'a3300000-0000-4000-8000-000000000001', operationId = 'a4300000-0000-4000-8000-000000000001'
const context = { institutionId: 'a1300000-0000-4000-8000-000000000001', workspaceKey: 'main', datasetKey: 'horarios', useRemote: true }
const legitimate = sourceFileStoragePrefix({ ...context, userId }) + operationId
const file = { name: 'horarios.xlsx', type: 'text/csv', size: 5 }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  mocks.lookup.mockResolvedValue({ data: { id: resourceId }, error: null })
  mocks.signedUpload.mockResolvedValue({ error: null })
  mocks.download.mockResolvedValue({ data: new Blob(['synthetic']), error: null })
  mocks.invoke.mockImplementation(async (_name, { body }) => ({ data: body.action === 'prepare' ? { operation_id: operationId, path: legitimate, token: 'synthetic-signed-token' } : { success: true }, error: null }))
})
describe('sourceFiles signed gateway authorization', () => {
  it('uses gateway capability and never writes Storage or metadata directly', async () => {
    await expect(saveSourceFile({ ...context, file })).resolves.toEqual({ source: 'supabase' })
    expect(mocks.signedUpload).toHaveBeenCalledWith(legitimate, 'synthetic-signed-token', file, expect.any(Object))
    const bodies = mocks.invoke.mock.calls.map(([, options]) => options.body)
    expect(bodies.map((body) => body.action)).toEqual(['recover', 'prepare', 'commit'])
    expect(bodies[1]).toMatchObject({ resource_id: resourceId, filename: file.name })
    for (const body of bodies) expect(body).not.toHaveProperty('path')
    expect(mocks.directUpload).not.toHaveBeenCalled()
    expect(mocks.directRemove).not.toHaveBeenCalled()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it.each(['../', 'a/../', '..%2F', '%2e%2e', '%2E%2E', '..\\', '', 'a//b'])('rejects invalid resource %j before any upload', async (datasetKey) => {
    await expect(saveSourceFile({ ...context, datasetKey, file })).rejects.toThrow('no autorizado')
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.signedUpload).not.toHaveBeenCalled()
  })
  it.each(['../x.xlsx', 'a/../x', '%2e%2e', '%2E%2E', '%252e%252e', '..\\x', '.', '..'])('rejects filename traversal %j before requesting capability', async (name) => {
    await expect(saveSourceFile({ ...context, file: { ...file, name } })).rejects.toThrow('invalido')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
  it.each([`${context.institutionId}/main/horarios/../victim.csv`, legitimate.replace('a130', 'b130'), legitimate.replace('a230', 'b230'), legitimate.replace('/horarios/', '/otro/'), legitimate.replace('/main/', '/main-other/')])('rejects foreign/traversal response key before signed upload and read: %s', async (storagePath) => {
    mocks.invoke.mockImplementation(async (_name, { body }) => ({ data: body.action === 'prepare' ? { operation_id: operationId, path: storagePath, token: 'synthetic-token' } : { success: true }, error: null }))
    await expect(saveSourceFile({ ...context, file })).rejects.toThrow('no autorizada')
    expect(mocks.invoke.mock.calls.at(-1)[1].body.action).toBe('cancel')
    mocks.lookup.mockResolvedValue({ data: [{ dataset_key: 'horarios', storage_bucket: SOURCE_FILES_BUCKET, storage_path: storagePath }], error: null })
    await expect(downloadSourceFiles(context)).rejects.toThrow('no autorizada')
    expect(mocks.signedUpload).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.directRemove).not.toHaveBeenCalled()
  })
  it('reads and deletes legitimate objects, delete receives IDs only', async () => {
    mocks.lookup.mockResolvedValue({ data: [{ dataset_key: 'horarios', storage_bucket: SOURCE_FILES_BUCKET, storage_path: legitimate }], error: null })
    await expect(downloadSourceFiles(context)).resolves.toHaveLength(1)
    expect(mocks.download).toHaveBeenCalledWith(legitimate)
    mocks.lookup.mockResolvedValue({ data: { id: resourceId }, error: null })
    await expect(deleteSourceFile(context)).resolves.toEqual({ source: 'supabase' })
    expect(mocks.invoke).toHaveBeenCalledWith('source-file-storage', { body: { action: 'delete', institution_id: context.institutionId, workspace_key: 'main', resource_id: resourceId } })
    expect(mocks.directRemove).not.toHaveBeenCalled()
    expect(mocks.deleteRows).not.toHaveBeenCalled()
  })
  it('retains read-only valid legacy metadata and denies malformed legacy names', async () => {
    const row = { dataset_key: 'horarios', storage_bucket: SOURCE_FILES_BUCKET, storage_path: `${context.institutionId}/main/horarios/1700000000000-horarios.xlsx` }
    mocks.lookup.mockResolvedValue({ data: [row], error: null })
    await expect(downloadSourceFiles(context)).resolves.toHaveLength(1)
    for (const name of ['../victim', '170-%2e%2e', '170-a\\b', '170-a//b']) {
      mocks.lookup.mockResolvedValue({ data: [{ ...row, storage_path: `${context.institutionId}/main/horarios/${name}` }], error: null })
      await expect(downloadSourceFiles(context)).rejects.toThrow('no autorizada')
    }
  })
  it('rejects a missing session before signed upload', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(saveSourceFile({ ...context, file })).rejects.toThrow('no autorizada')
    expect(mocks.signedUpload).not.toHaveBeenCalled()
  })
  it('cancels failed uploads but never cancels an ambiguous commit timeout', async () => {
    mocks.signedUpload.mockResolvedValueOnce({ error: new Error('failed') })
    await expect(saveSourceFile({ ...context, file })).rejects.toThrow('cargar')
    expect(mocks.invoke.mock.calls.map(([, { body }]) => body.action)).toEqual(['recover', 'prepare', 'cancel'])
    mocks.invoke.mockClear()
    mocks.invoke.mockImplementation(async (_name, { body }) => body.action === 'prepare' ? { data: { operation_id: operationId, path: legitimate, token: 'synthetic-signed-token' }, error: null } : body.action === 'recover' ? { data: { success: true }, error: null } : { data: null, error: new Error('timeout') })
    await expect(saveSourceFile({ ...context, file })).rejects.toThrow('operacion')
    expect(mocks.invoke.mock.calls.map(([, { body }]) => body.action)).toEqual(['recover', 'prepare', 'commit'])
  })
})
