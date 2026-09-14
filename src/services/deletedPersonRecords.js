import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const TABLE_NAME = 'deleted_person_records'

function clean(value) {
  return String(value ?? '').trim()
}

function firstClean(...values) {
  for (const value of values) {
    const cleaned = clean(value)
    if (cleaned) return cleaned
  }

  return ''
}

function getDisplayName(person = {}) {
  return firstClean(
    person.full_name,
    [person.nombre, person.apellido].filter(Boolean).join(' '),
    person.display_name,
    person.email,
    person.dni,
  )
}

function getPersonId(person = {}) {
  return firstClean(
    person.id,
    person.record_id,
    person.alumno_id,
    person.docente_id,
    person.student_record_id,
    person.teacher_record_id,
    person.profile_id,
    person.user_id,
    person.email,
    person.dni,
  )
}

function getProfileId(person = {}) {
  return firstClean(person.profile_id, person.user_id) || null
}

function buildDeletedPersonPayload({
  institutionId,
  workspaceKey = 'main',
  personType,
  person,
  deletedByEmail = '',
  deletionSource = 'admin_panel',
  deletionReason = '',
}) {
  return {
    institution_id: institutionId,
    workspace_key: workspaceKey || 'main',
    person_type: personType,
    person_id: getPersonId(person) || null,
    profile_id: getProfileId(person),
    email: firstClean(person?.email, person?.correo, person?.mail) || null,
    dni: firstClean(person?.dni, person?.documento, person?.document_number) || null,
    display_name: getDisplayName(person),
    role: firstClean(person?.role, person?.account_role, person?.rol) || null,
    status: firstClean(person?.estado, person?.status) || null,
    deleted_by_email: clean(deletedByEmail) || null,
    deletion_source: deletionSource,
    deletion_reason: clean(deletionReason),
    raw_payload: person ?? {},
  }
}

export async function archiveDeletedPerson({
  institutionId,
  workspaceKey = 'main',
  personType,
  person,
  deletedByEmail = '',
  deletionSource = 'admin_panel',
  deletionReason = '',
  useRemote,
}) {
  if (!institutionId) {
    throw new Error('No hay una institucion activa para registrar la baja.')
  }

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    throw new Error('Para eliminar personas con auditoria necesitas una sesion remota conectada a Supabase.')
  }

  const payload = buildDeletedPersonPayload({
    institutionId,
    workspaceKey,
    personType,
    person,
    deletedByEmail,
    deletionSource,
    deletionReason,
  })

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(payload)
    .select('id')
    .single()

  if (error) throw error

  return {
    id: data?.id ?? null,
    source: 'supabase',
  }
}

export async function fetchDeletedPersonRecords({
  institutionId,
  workspaceKey = 'main',
  personTypes = ['student', 'teacher'],
  useRemote,
}) {
  if (!institutionId || !useRemote || !isSupabaseConfigured || !supabase) return []

  let query = supabase
    .from(TABLE_NAME)
    .select('id, institution_id, workspace_key, person_type, person_id, profile_id, email, dni, display_name, role, status, deleted_by_email, deletion_source, deletion_reason, raw_payload, created_at, restored_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey || 'main')
    .is('restored_at', null)

  if (Array.isArray(personTypes) && personTypes.length > 0) {
    query = query.in('person_type', personTypes)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) throw error
  return Array.isArray(data) ? data : []
}

export async function markDeletedPersonRestored({
  id,
  restoredByEmail = '',
  useRemote,
}) {
  if (!id) throw new Error('La baja a restaurar es obligatoria.')

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    throw new Error('Para restaurar una baja necesitas una sesion remota conectada a Supabase.')
  }

  const { error } = await supabase
    .from(TABLE_NAME)
    .update({
      restored_at: new Date().toISOString(),
      restored_by_email: clean(restoredByEmail) || null,
    })
    .eq('id', id)

  if (error) throw error

  return { success: true, source: 'supabase' }
}
