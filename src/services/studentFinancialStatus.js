import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const TABLE_NAME = 'student_financial_status'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function canUseRemote({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

export async function fetchStudentFinancialStatus({ institutionId, workspaceKey = 'main', useRemote }) {
  if (!canUseRemote({ institutionId, useRemote })) return []

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('id, student_record_id, adeuda_cuota, note, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (error) throw error

  return asArray(data)
}

export async function upsertStudentFinancialStatus({
  institutionId,
  workspaceKey = 'main',
  studentRecordId,
  adeudaCuota,
  note = '',
  useRemote,
}) {
  if (!canUseRemote({ institutionId, useRemote }) || !studentRecordId) return null

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert({
      institution_id: institutionId,
      workspace_key: workspaceKey,
      student_record_id: studentRecordId,
      adeuda_cuota: Boolean(adeudaCuota),
      note,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'institution_id,workspace_key,student_record_id' })
    .select('id, student_record_id, adeuda_cuota, note, updated_at')
    .single()

  if (error) throw error

  return data
}
