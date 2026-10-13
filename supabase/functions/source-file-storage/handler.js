import { SOURCE_FILES_BUCKET, SOURCE_FILE_DATASETS, buildSourceFileStoragePath, canonicalStorageUuid, canonicalStorageSegment, sanitizeSourceFileName, assertSourceFileStoragePath } from '../_shared/sourceFileStoragePath.js'

class GatewayError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
function fail(status, message) { throw new GatewayError(status, message) }
function checked(result) {
  if (result.error) fail(503, 'No se pudo completar la operacion de archivos.')
  return result.data
}
const defaults = ['http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:5173', 'http://localhost:5173']
const fields = {
  prepare: ['action', 'institution_id', 'workspace_key', 'resource_id', 'filename', 'mime_type', 'file_size'],
  commit: ['action', 'institution_id', 'workspace_key', 'resource_id', 'operation_id'],
  cancel: ['action', 'institution_id', 'workspace_key', 'resource_id', 'operation_id'],
  delete: ['action', 'institution_id', 'workspace_key', 'resource_id'],
  recover: ['action', 'institution_id', 'workspace_key', 'resource_id'],
  cleanup: ['action', 'institution_id', 'workspace_key', 'resource_id'],
  begin_clear: ['action', 'institution_id', 'workspace_key', 'operation_id'],
  resume_clear: ['action', 'institution_id', 'workspace_key', 'operation_id'],
  finish_clear: ['action', 'institution_id', 'workspace_key', 'clear_id'],
}

async function recoverResource(db, context, resourceId, clearId = null) {
  const op = checked(await db.from('source_file_storage_operations').select('*').eq('resource_id', resourceId).in('state', ['pending', 'deleting']).maybeSingle())
  if (!op) return
  if (op.actor_id !== context.userId) fail(403, 'Operacion de otro usuario.')
  const rpc = { p_resource_id: resourceId, p_actor_id: context.userId, p_operation_id: op.id }
  if (clearId) rpc.p_clear_id = clearId
  const storage = db.storage.from(SOURCE_FILES_BUCKET)
  assertSourceFileStoragePath({ ...context, storageBucket: SOURCE_FILES_BUCKET, storagePath: op.storage_path })
  if (op.kind === 'upload' && op.state === 'pending') {
    if (op.storage_path !== buildSourceFileStoragePath(context, op.id)) fail(403, 'Operacion no autorizada.')
    checked(await db.rpc('source_file_storage_cancel', rpc))
    checked(await storage.remove([op.storage_path]))
  } else if (op.kind === 'delete' && op.state === 'deleting') {
    checked(await storage.remove([op.storage_path]))
    checked(await db.rpc('source_file_storage_finish_delete', rpc))
  } else fail(409, 'Operacion no recuperable.')
}

async function cleanupResource(db, context, resourceId) {
  // Issued upload capabilities cannot be revoked. Retain the journal and wait
  // beyond Storage's 2-hour capability lifetime, with an extra safety margin.
  const rpc = { p_resource_id: resourceId, p_actor_id: context.userId }
  const operations = checked(await db.rpc('source_file_storage_cleanup_candidates', rpc))
  const paths = new Set()
  for (const op of operations || []) {
    const path = op.storage_path
    if (!path) continue
    assertSourceFileStoragePath({ ...context, storageBucket: SOURCE_FILES_BUCKET, storagePath: path })
    paths.add(path)
  }
  if (paths.size) {
    checked(await db.storage.from(SOURCE_FILES_BUCKET).remove([...paths]))
    checked(await db.rpc('source_file_storage_cleanup_done', { ...rpc, p_operation_ids: operations.map((op) => op.id) }))
  }
  return paths.size
}

export function createSourceFileStorageHandler({ createClient, env, log = (event) => console.warn(event) }) {
  return async (req) => {
    const origins = (env('SOURCE_FILE_STORAGE_ALLOWED_ORIGINS') || env('ADMIN_USERS_ALLOWED_ORIGINS') || env('ALLOWED_ORIGINS') || defaults.join(',')).split(',').map((v) => v.trim())
    const origin = req.headers.get('Origin')
    const allowed = !origin || origins.includes(origin)
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Access-Control-Allow-Origin': allowed && origin ? origin : 'null', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers })
    let action = 'unknown'
    try {
      if (!allowed) fail(403, 'Origen no permitido.')
      if (req.method === 'OPTIONS') return response({ ok: true })
      if (req.method !== 'POST') fail(405, 'Metodo no permitido.')
      const bearer = req.headers.get('Authorization') || ''
      if (!bearer.startsWith('Bearer ') || bearer.slice(7).trim().length < 20) fail(401, 'Sesion invalida.')
      let body
      try { body = await req.json() } catch { fail(400, 'Solicitud invalida.') }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Solicitud invalida.')
      action = body.action
      if (!Object.hasOwn(fields, action) || Object.keys(body).some((key) => !fields[action].includes(key))) fail(400, 'Solicitud invalida.')
      let institutionId, resourceId, workspaceKey, operationId, filename, clearId
      try {
        institutionId = canonicalStorageUuid(body.institution_id)
        if (!['begin_clear', 'resume_clear', 'finish_clear'].includes(action)) resourceId = canonicalStorageUuid(body.resource_id)
        if (action === 'finish_clear') clearId = canonicalStorageUuid(body.clear_id)
        workspaceKey = canonicalStorageSegment(body.workspace_key)
        if (['commit', 'cancel', 'begin_clear', 'resume_clear'].includes(action)) operationId = canonicalStorageUuid(body.operation_id)
        if (action === 'prepare') filename = sanitizeSourceFileName(body.filename)
      } catch { fail(400, 'IDs o metadata invalidos.') }
      if (action === 'prepare' && (!Number.isSafeInteger(body.file_size) || body.file_size < 1 || body.file_size > 25 * 1024 * 1024 || typeof body.mime_type !== 'string' || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(body.mime_type))) fail(400, 'Metadata de archivo invalida.')
      const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY'), secret = env('SUPABASE_SERVICE_ROLE_KEY')
      if (!url || !anon || !secret) fail(503, 'Servicio de archivos no disponible.')
      const options = { auth: { persistSession: false, autoRefreshToken: false } }
      const userClient = createClient(url, anon, { ...options, global: { headers: { Authorization: bearer } } })
      const auth = await userClient.auth.getUser()
      if (auth.error || !auth.data?.user) fail(401, 'Sesion invalida.')
      const userId = canonicalStorageUuid(auth.data.user.id)
      const db = createClient(url, secret, options)
      const profile = checked(await db.from('profiles').select('is_blocked').eq('user_id', userId).maybeSingle())
      if (!profile || profile.is_blocked) fail(403, 'Acceso denegado.')
      const membership = checked(await db.from('memberships').select('role').eq('institution_id', institutionId).eq('user_id', userId).maybeSingle())
      if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) fail(403, 'Acceso denegado.')
      const institution = checked(await db.from('institutions').select('status').eq('id', institutionId).maybeSingle())
      if (!institution || institution.status !== 'active') fail(403, 'Acceso denegado.')
      if (['begin_clear', 'resume_clear', 'finish_clear'].includes(action)) {
        const args = { p_institution_id: institutionId, p_workspace_key: workspaceKey, p_actor_id: userId }
        if (action === 'finish_clear') {
          checked(await db.rpc('source_file_storage_finish_clear', { ...args, p_clear_id: clearId }))
          return response({ success: true })
        }
        clearId = operationId
        const job = checked(await db.rpc('source_file_storage_begin_clear', { ...args, p_clear_id: clearId, p_resume: action === 'resume_clear' }))
        if (!job || job.id !== operationId || job.institution_id !== institutionId || job.workspace_key !== workspaceKey || job.actor_id !== userId || !Array.isArray(job.captured_keys)) fail(503, 'Clear no disponible.')
        clearId = canonicalStorageUuid(job.id)
        const paths = new Set()
        // Never re-query live manifests or list a prefix during delayed cleanup.
        for (const captured of job.captured_keys) {
          if (!SOURCE_FILE_DATASETS.includes(captured.dataset_key)) fail(403, 'Recurso no autorizado.')
          assertSourceFileStoragePath({ institutionId, userId, workspaceKey, datasetKey: captured.dataset_key, storageBucket: SOURCE_FILES_BUCKET, storagePath: captured.storage_path })
          paths.add(captured.storage_path)
        }
        if (!job.cleanup_finished_at) {
          if (paths.size) checked(await db.storage.from(SOURCE_FILES_BUCKET).remove([...paths]))
          checked(await db.rpc('source_file_storage_finish_clear', { ...args, p_clear_id: clearId }))
        }
        return response({ success: true, removed: paths.size, clear_id: clearId, cutoff_revision: job.cutoff_revision, updated_at: job.cleared_at })
      }
      const resource = checked(await db.from('source_file_storage_resources').select('id, institution_id, workspace_key, dataset_key').eq('id', resourceId).eq('institution_id', institutionId).eq('workspace_key', workspaceKey).maybeSingle())
      if (!resource || !SOURCE_FILE_DATASETS.includes(resource.dataset_key)) fail(403, 'Recurso no autorizado.')
      const workspace = checked(await db.from('workspace_snapshots').select('workspace_key').eq('institution_id', institutionId).eq('workspace_key', workspaceKey).maybeSingle())
      if (!workspace) fail(403, 'Workspace no autorizado.')
      const context = { institutionId, userId, workspaceKey, datasetKey: resource.dataset_key }
      const rpcContext = { p_resource_id: resourceId, p_actor_id: userId }
      const storage = db.storage.from(SOURCE_FILES_BUCKET)
      if (action === 'recover') {
        await recoverResource(db, context, resourceId)
        await cleanupResource(db, context, resourceId)
        return response({ success: true })
      }
      if (action === 'cleanup') return response({ success: true, removed: await cleanupResource(db, context, resourceId) })
      if (action === 'prepare') {
        const id = crypto.randomUUID()
        const key = buildSourceFileStoragePath(context, id)
        checked(await db.rpc('source_file_storage_reserve', { ...rpcContext, p_operation_id: id, p_key: key, p_filename: filename, p_mime_type: body.mime_type, p_file_size: body.file_size }))
        const signed = await storage.createSignedUploadUrl(key, { upsert: false })
        if (signed.error || !signed.data?.token) {
          checked(await db.rpc('source_file_storage_cancel', { ...rpcContext, p_operation_id: id }))
          fail(503, 'No se pudo preparar la carga.')
        }
        return response({ operation_id: id, path: key, token: signed.data.token })
      }
      if (action === 'delete') {
        const operation = checked(await db.rpc('source_file_storage_begin_delete', rpcContext))
        if (!operation) return response({ success: true, removed: 0 })
        assertSourceFileStoragePath({ ...context, storageBucket: SOURCE_FILES_BUCKET, storagePath: operation.storage_path })
        checked(await storage.remove([operation.storage_path]))
        checked(await db.rpc('source_file_storage_finish_delete', { ...rpcContext, p_operation_id: operation.id }))
        return response({ success: true, removed: 1 })
      }
      const operation = checked(await db.from('source_file_storage_operations').select('*').eq('id', operationId).eq('resource_id', resourceId).eq('actor_id', userId).maybeSingle())
      if (!operation || operation.kind !== 'upload') fail(403, 'Operacion no autorizada.')
      const key = buildSourceFileStoragePath(context, operation.id)
      if (operation.storage_path !== key) fail(403, 'Operacion no autorizada.')
      if (action === 'cancel') {
        if (operation.state === 'committed') fail(409, 'La carga ya fue confirmada.')
        checked(await db.rpc('source_file_storage_cancel', { ...rpcContext, p_operation_id: operationId }))
        checked(await storage.remove([key]))
        return response({ success: true })
      }
      if (operation.state === 'cancelled' || Date.parse(operation.expires_at) <= Date.now()) fail(409, 'Operacion vencida o cancelada.')
      const info = checked(await storage.info(key))
      if (!info || info.size !== operation.file_size) fail(409, 'La carga no esta completa o tiene un tamano invalido.')
      checked(await db.rpc('source_file_storage_commit', { ...rpcContext, p_operation_id: operationId }))
      if (operation.previous_path) {
        assertSourceFileStoragePath({ ...context, storageBucket: SOURCE_FILES_BUCKET, storagePath: operation.previous_path })
        const removed = await storage.remove([operation.previous_path])
        if (removed.error) return response({ success: true, cleanup_pending: true })
      }
      return response({ success: true })
    } catch (error) {
      const status = error instanceof GatewayError ? error.status : 503
      log({ event: 'source-file-storage:failure', action: Object.hasOwn(fields, action) ? action : 'unknown', status })
      return response({ error: error instanceof GatewayError ? error.message : 'No se pudo completar la operacion de archivos.' }, status)
    }
  }
}
