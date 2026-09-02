import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const TABLE_NAME = 'workspace_source_files'
const SOURCE_FILES_BUCKET = 'workspace-source-files'
const DEBUG_SOURCE_FILES = import.meta.env.DEV

function logSourceFilesDiagnostic(level, event, details = {}) {
  if (!DEBUG_SOURCE_FILES) return

  const logger = level === 'warn' ? console.warn : console.info
  logger(`[source-files] ${event}`, details)
}

function getFileDiagnostic(file) {
  return {
    extension: file?.name?.split('.').pop()?.toLowerCase() ?? '',
    size: file?.size ?? null,
    type: file?.type || '',
  }
}

function createMemoryResult() {
  return { source: 'local' }
}

function canUseRemoteFiles({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

function assertRemoteFileContext({ institutionId, useRemote }) {
  if (!useRemote) return

  if (!institutionId) {
    throw new Error('No hay una institucion activa. Selecciona una institucion antes de cargar archivos.')
  }

  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase no esta configurado. No se puede guardar el archivo fuente de forma remota.')
  }
}

function sanitizePathSegment(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
}

function buildStoragePath({ institutionId, workspaceKey, datasetKey, fileName }) {
  return [
    institutionId,
    sanitizePathSegment(workspaceKey || 'main'),
    sanitizePathSegment(datasetKey),
    `${Date.now()}-${sanitizePathSegment(fileName)}`,
  ].join('/')
}

function getMimeType(file) {
  return file.type || 'application/octet-stream'
}

export async function saveSourceFile({ institutionId, workspaceKey, datasetKey, file, useRemote }) {
  if (!canUseRemoteFiles({ institutionId, useRemote })) {
    try {
      assertRemoteFileContext({ institutionId, useRemote })
    } catch (error) {
      logSourceFilesDiagnostic('warn', 'save:context-error', {
        datasetKey,
        destination: TABLE_NAME,
        hasInstitutionId: Boolean(institutionId),
        useRemote,
        workspaceKey,
        errorMessage: error.message,
      })
      throw error
    }

    logSourceFilesDiagnostic('info', 'save:local-memory', {
      datasetKey,
      destination: 'memory',
      hasInstitutionId: Boolean(institutionId),
      persisted: false,
      useRemote,
      workspaceKey,
      file: getFileDiagnostic(file),
    })
    return createMemoryResult()
  }

  const { data: existingFile, error: lookupError } = await supabase
    .from(TABLE_NAME)
    .select('storage_bucket, storage_path')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('dataset_key', datasetKey)
    .maybeSingle()

  if (lookupError) {
    logSourceFilesDiagnostic('warn', 'save:lookup-error', {
      datasetKey,
      destination: TABLE_NAME,
      hasInstitutionId: Boolean(institutionId),
      useRemote,
      workspaceKey,
      errorMessage: lookupError.message,
    })
    throw lookupError
  }

  const storagePath = buildStoragePath({
    institutionId,
    workspaceKey,
    datasetKey,
    fileName: file.name,
  })

  const { error: uploadError } = await supabase.storage
    .from(SOURCE_FILES_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '31536000',
      contentType: getMimeType(file),
      upsert: true,
    })

  if (uploadError) {
    logSourceFilesDiagnostic('warn', 'save:storage-upload-error', {
      bucket: SOURCE_FILES_BUCKET,
      datasetKey,
      destination: 'storage',
      hasInstitutionId: Boolean(institutionId),
      useRemote,
      workspaceKey,
      errorMessage: uploadError.message,
      file: getFileDiagnostic(file),
    })
    throw new Error(`No se pudo guardar el archivo fuente en Supabase Storage. Revisa que exista el bucket ${SOURCE_FILES_BUCKET} y sus politicas RLS. Detalle: ${uploadError.message}`)
  }

  if (existingFile?.storage_path && existingFile.storage_path !== storagePath) {
    const bucket = existingFile.storage_bucket || SOURCE_FILES_BUCKET
    const { error: cleanupError } = await supabase.storage
      .from(bucket)
      .remove([existingFile.storage_path])

    if (cleanupError) {
      await supabase.storage.from(SOURCE_FILES_BUCKET).remove([storagePath])
      logSourceFilesDiagnostic('warn', 'save:storage-cleanup-error', {
        bucket,
        datasetKey,
        destination: 'storage',
        hasInstitutionId: Boolean(institutionId),
        useRemote,
        workspaceKey,
        errorMessage: cleanupError.message,
      })
      throw new Error(`No se pudo reemplazar el archivo fuente anterior en Supabase Storage. Detalle: ${cleanupError.message}`)
    }
  }

  const { error } = await supabase.from(TABLE_NAME).upsert({
    institution_id: institutionId,
    workspace_key: workspaceKey,
    dataset_key: datasetKey,
    file_name: file.name,
    mime_type: getMimeType(file),
    file_extension: file.name.split('.').pop()?.toLowerCase() ?? '',
    file_size: file.size ?? null,
    storage_bucket: SOURCE_FILES_BUCKET,
    storage_path: storagePath,
    file_base64: null,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    await supabase.storage.from(SOURCE_FILES_BUCKET).remove([storagePath])
    logSourceFilesDiagnostic('warn', 'save:metadata-error', {
      bucket: SOURCE_FILES_BUCKET,
      datasetKey,
      destination: TABLE_NAME,
      hasInstitutionId: Boolean(institutionId),
      useRemote,
      workspaceKey,
      errorMessage: error.message,
      file: getFileDiagnostic(file),
    })
    throw error
  }

  logSourceFilesDiagnostic('info', 'save:ok', {
    bucket: SOURCE_FILES_BUCKET,
    datasetKey,
    destination: TABLE_NAME,
    hasInstitutionId: Boolean(institutionId),
    source: 'supabase',
    useRemote,
    workspaceKey,
    file: getFileDiagnostic(file),
  })

  return { source: 'supabase' }
}

export async function deleteSourceFile({ institutionId, workspaceKey, datasetKey, useRemote }) {
  if (!canUseRemoteFiles({ institutionId, useRemote })) {
    try {
      assertRemoteFileContext({ institutionId, useRemote })
    } catch (error) {
      logSourceFilesDiagnostic('warn', 'delete:context-error', {
        datasetKey,
        destination: TABLE_NAME,
        hasInstitutionId: Boolean(institutionId),
        useRemote,
        workspaceKey,
        errorMessage: error.message,
      })
      throw error
    }

    logSourceFilesDiagnostic('info', 'delete:local-memory', {
      datasetKey,
      destination: 'memory',
      hasInstitutionId: Boolean(institutionId),
      persisted: false,
      useRemote,
      workspaceKey,
    })
    return createMemoryResult()
  }

  const { data: existingFile, error: lookupError } = await supabase
    .from(TABLE_NAME)
    .select('storage_bucket, storage_path')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('dataset_key', datasetKey)
    .maybeSingle()

  if (lookupError) {
    logSourceFilesDiagnostic('warn', 'delete:lookup-error', {
      datasetKey,
      destination: TABLE_NAME,
      hasInstitutionId: Boolean(institutionId),
      useRemote,
      workspaceKey,
      errorMessage: lookupError.message,
    })
    throw lookupError
  }

  if (existingFile?.storage_path) {
    const bucket = existingFile.storage_bucket || SOURCE_FILES_BUCKET
    const { error: storageError } = await supabase.storage
      .from(bucket)
      .remove([existingFile.storage_path])

    if (storageError) {
      logSourceFilesDiagnostic('warn', 'delete:storage-error', {
        bucket,
        datasetKey,
        destination: 'storage',
        hasInstitutionId: Boolean(institutionId),
        useRemote,
        workspaceKey,
        errorMessage: storageError.message,
      })
      throw storageError
    }
  }

  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('dataset_key', datasetKey)

  if (error) {
    logSourceFilesDiagnostic('warn', 'delete:metadata-error', {
      datasetKey,
      destination: TABLE_NAME,
      hasInstitutionId: Boolean(institutionId),
      useRemote,
      workspaceKey,
      errorMessage: error.message,
    })
    throw error
  }

  logSourceFilesDiagnostic('info', 'delete:ok', {
    datasetKey,
    destination: TABLE_NAME,
    hasInstitutionId: Boolean(institutionId),
    source: 'supabase',
    useRemote,
    workspaceKey,
  })

  return { source: 'supabase' }
}

export async function downloadSourceFiles({ institutionId, workspaceKey, useRemote }) {
  assertRemoteFileContext({ institutionId, useRemote })

  if (!canUseRemoteFiles({ institutionId, useRemote })) {
    throw new Error('Los archivos originales solo estan disponibles cuando el workspace esta sincronizado con Supabase.')
  }

  const { data: files, error: lookupError } = await supabase
    .from(TABLE_NAME)
    .select('dataset_key, file_name, storage_bucket, storage_path, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .order('updated_at', { ascending: true })

  if (lookupError) throw lookupError

  const storedFiles = Array.isArray(files) ? files : []
  if (storedFiles.length === 0) {
    throw new Error('No hay archivos originales almacenados para esta institucion.')
  }

  return Promise.all(storedFiles.map(async (file) => {
    const bucket = file.storage_bucket || SOURCE_FILES_BUCKET
    const { data: blob, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(file.storage_path)

    if (downloadError) {
      throw new Error(`No se pudo descargar ${file.file_name || file.dataset_key}. ${downloadError.message}`)
    }

    return {
      blob,
      datasetKey: file.dataset_key,
      fileName: file.file_name || `${file.dataset_key}.xlsx`,
    }
  }))
}
