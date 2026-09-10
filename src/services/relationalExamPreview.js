import { supabase } from '../lib/supabase.js'
import { buildExamEngineSnapshotFromAcademicSchema } from '../utils/examEngine/relationalSource/buildExamEngineSnapshotFromAcademicSchema.js'

// Public feature availability only; data authorization remains in table RLS.
export function previewSettingKey(institutionId) {
  if (!institutionId) throw new Error('Falta la institucion.')
  return `exam_relational_preview:${institutionId}`
}

export async function fetchRelationalPreviewSetting({ institutionId, signal, client = supabase }) {
  if (!client) throw new Error('No hay conexion con Supabase.')
  const { data, error } = await client.from('app_settings').select('value')
    .eq('key', previewSettingKey(institutionId)).abortSignal(signal).maybeSingle()
  if (error) throw error
  return data?.value?.enabled === true
}

export async function saveRelationalPreviewSetting({ institutionId, enabled, client = supabase }) {
  if (!client) throw new Error('No hay conexion con Supabase.')
  if (typeof enabled !== 'boolean') throw new Error('La habilitacion debe ser booleana.')
  const { data, error } = await client.from('app_settings').upsert({
    key: previewSettingKey(institutionId),
    value: { enabled },
    is_public: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' }).select('value').single()
  if (error) throw error
  if (data?.value?.enabled !== enabled) throw new Error('No se pudo confirmar la habilitacion.')
  return enabled
}

export async function fetchRelationalExamSnapshot({ institutionId, signal, client = supabase }) {
  if (!client) throw new Error('No hay conexion con Supabase.')
  return buildExamEngineSnapshotFromAcademicSchema({ supabase: client, institutionId, signal })
}

export async function fetchRelationalExamPreview({ institutionId, signal, client = supabase }) {
  // Recheck availability immediately before reading academic data.
  if (!await fetchRelationalPreviewSetting({ institutionId, signal, client })) {
    throw new Error('La previsualizacion no esta habilitada para esta institucion.')
  }
  return fetchRelationalExamSnapshot({ institutionId, signal, client })
}
