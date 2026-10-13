import { supabase } from '../lib/supabase.js'
import { canonicalStorageSegment, canonicalStorageUuid, SOURCE_FILE_DATASETS } from './sourceFileStoragePath.js'

export async function getSourceFileResource({ institutionId, workspaceKey, datasetKey }) {
  canonicalStorageUuid(institutionId)
  canonicalStorageSegment(workspaceKey)
  if (!SOURCE_FILE_DATASETS.includes(datasetKey)) throw new Error('Recurso de archivo no autorizado.')
  const { data, error } = await supabase.from('source_file_storage_resources').select('id')
    .eq('institution_id', institutionId).eq('workspace_key', workspaceKey).eq('dataset_key', datasetKey).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('El recurso de archivo no esta registrado.')
  return { institution_id: institutionId, workspace_key: workspaceKey, resource_id: canonicalStorageUuid(data.id) }
}

export async function invokeSourceFileStorage(body) {
  const { data, error } = await supabase.functions.invoke('source-file-storage', { body })
  // Never include response context: prepare responses can contain a signed token.
  if (error || data?.error || !data) throw new Error('No se pudo completar la operacion de archivos.')
  return data
}

export async function removeSourceFileViaGateway(context) {
  const resource = await getSourceFileResource(context)
  await invokeSourceFileStorage({ action: 'recover', ...resource })
  return invokeSourceFileStorage({ action: 'delete', ...resource })
}
