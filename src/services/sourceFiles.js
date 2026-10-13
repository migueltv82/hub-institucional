import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { SOURCE_FILES_BUCKET, assertSourceFileStoragePath, assertLegacySourceFileReadPath, getSourceFileStorageUserId, sanitizeSourceFileName, canonicalStorageUuid, canonicalStorageSegment, SOURCE_FILE_DATASETS } from './sourceFileStoragePath.js'
import { getSourceFileResource, invokeSourceFileStorage, removeSourceFileViaGateway } from './sourceFileStorageGateway.js'

function assertRemoteFileContext({ institutionId, useRemote }) {
  if (!useRemote) return
  if (!institutionId) throw new Error('No hay una institucion activa. Selecciona una institucion antes de cargar archivos.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase no esta configurado. No se puede guardar el archivo fuente de forma remota.')
}

export async function saveSourceFile({ institutionId, workspaceKey, datasetKey, file, useRemote }) {
  assertRemoteFileContext({ institutionId, useRemote })
  if (!useRemote) return { source: 'local' }
  const filename = sanitizeSourceFileName(file.name)
  const resource = await getSourceFileResource({ institutionId, workspaceKey, datasetKey })
  const userId = await getSourceFileStorageUserId(supabase)
  await invokeSourceFileStorage({ action: 'recover', ...resource })
  const prepared = await invokeSourceFileStorage({ action: 'prepare', ...resource, filename, mime_type: file.type || 'application/octet-stream', file_size: file.size })
  let uploaded = false
  try {
    canonicalStorageUuid(prepared.operation_id)
    assertSourceFileStoragePath({ institutionId, userId, workspaceKey, datasetKey, storageBucket: SOURCE_FILES_BUCKET, storagePath: prepared.path })
    if (prepared.path.split('/').at(-1) !== prepared.operation_id) throw new Error('Respuesta de carga invalida.')
    if (typeof prepared.token !== 'string' || !prepared.token) throw new Error('Respuesta de carga invalida.')
    const { error } = await supabase.storage.from(SOURCE_FILES_BUCKET).uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type || 'application/octet-stream', cacheControl: '31536000' })
    if (error) throw new Error('No se pudo cargar el archivo fuente.')
    uploaded = true
  } catch (error) {
    try {
      await invokeSourceFileStorage({ action: 'cancel', ...resource, operation_id: prepared.operation_id })
    } catch {
      throw new Error('La carga fallo y su limpieza requiere reintento desde el gateway.')
    }
    throw error
  }
  // A commit timeout is ambiguous: never cancel an upload that may be live.
  const committed = await invokeSourceFileStorage({ action: 'commit', ...resource, operation_id: prepared.operation_id })
  if (!uploaded || committed.success !== true) throw new Error('La confirmacion de la carga requiere reintento.')
  return { source: 'supabase', ...(committed.cleanup_pending ? { cleanupPending: true } : {}) }
}

export async function deleteSourceFile({ institutionId, workspaceKey, datasetKey, useRemote }) {
  assertRemoteFileContext({ institutionId, useRemote })
  if (!useRemote) return { source: 'local' }
  const result = await removeSourceFileViaGateway({ institutionId, workspaceKey, datasetKey })
  if (result.success !== true) throw new Error('No se pudo eliminar el archivo fuente.')
  return { source: 'supabase' }
}

function assertReadableManifest(file, { institutionId, workspaceKey, userId }) {
  if (!SOURCE_FILE_DATASETS.includes(file.dataset_key) || file.storage_bucket !== SOURCE_FILES_BUCKET || typeof file.storage_path !== 'string') throw new Error('Ruta de Storage no autorizada.')
  const segments = file.storage_path.split('/')
  if (segments.length === 5) {
    assertSourceFileStoragePath({ institutionId, workspaceKey, datasetKey: file.dataset_key, userId, storageBucket: file.storage_bucket, storagePath: file.storage_path })
    return
  }
  // Read-only legacy format tenant/workspace/dataset/timestamp-basename.
  assertLegacySourceFileReadPath({ institutionId, workspaceKey, datasetKey: file.dataset_key, storageBucket: file.storage_bucket, storagePath: file.storage_path })
}

export async function downloadSourceFiles({ institutionId, workspaceKey, useRemote }) {
  assertRemoteFileContext({ institutionId, useRemote })
  if (!useRemote) throw new Error('Los archivos originales solo estan disponibles cuando el workspace esta sincronizado con Supabase.')
  canonicalStorageUuid(institutionId)
  canonicalStorageSegment(workspaceKey)
  const userId = await getSourceFileStorageUserId(supabase)
  const { data, error } = await supabase.from('workspace_source_files').select('dataset_key, file_name, storage_bucket, storage_path, updated_at').eq('institution_id', institutionId).eq('workspace_key', workspaceKey).order('updated_at', { ascending: true })
  if (error) throw error
  const files = Array.isArray(data) ? data : []
  if (!files.length) throw new Error('No hay archivos originales almacenados para esta institucion.')
  for (const file of files) assertReadableManifest(file, { institutionId, workspaceKey, userId })
  return Promise.all(files.map(async (file) => {
    const { data: blob, error: downloadError } = await supabase.storage.from(SOURCE_FILES_BUCKET).download(file.storage_path)
    if (downloadError) throw new Error('No se pudo descargar el archivo fuente.')
    return { blob, datasetKey: file.dataset_key, fileName: file.file_name || `${file.dataset_key}.xlsx` }
  }))
}
