import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

function clean(value) {
  return String(value ?? '').trim()
}

function ensureSupabaseReady() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Esta operacion requiere Supabase configurado.')
  }
}

function isMissingDeletedAtColumn(error) {
  const message = clean(error?.message).toLowerCase()
  return (
    error?.code === '42703' ||
    (
      message.includes('deleted_at') &&
      (
        message.includes('does not exist') ||
        message.includes('no existe') ||
        message.includes('has no field')
      )
    )
  )
}

function deletedAtMigrationMessage(action) {
  return `${action}. Falta actualizar la base: ejecuta supabase/schema/06_subject_teacher_assignments.sql en Supabase.`
}

function isInvalidTeacherRecordForeignKey(error) {
  return error?.code === '23503'
    && clean(error?.message).includes('subject_teacher_assignments_teacher_record_id_fkey')
}

async function runActiveAssignmentsQuery({
  institutionId,
  workspaceKey = 'main',
  teacherId = '',
  withDeletedAtFilter = true,
} = {}) {
  let query = supabase
    .from('subject_teacher_assignments')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('status', 'active')

  if (teacherId) query = query.eq('teacher_id', teacherId)
  if (withDeletedAtFilter) query = query.is('deleted_at', null)

  return query.order('created_at', { ascending: false })
}

export async function fetchSubjectTeacherAssignments({ institutionId, workspaceKey = 'main' }) {
  ensureSupabaseReady()

  if (!institutionId) {
    throw new Error('Falta la institucion activa para cargar las titularidades.')
  }

  let { data, error } = await runActiveAssignmentsQuery({ institutionId, workspaceKey })

  if (isMissingDeletedAtColumn(error)) {
    ;({ data, error } = await runActiveAssignmentsQuery({ institutionId, workspaceKey, withDeletedAtFilter: false }))
  }

  if (error) {
    throw new Error(`No se pudieron cargar las titularidades de materias. ${error.message}`)
  }

  return data ?? []
}

export async function resolveTeacherProfile({ institutionId, workspaceKey = 'main', email }) {
  ensureSupabaseReady()

  const cleanedEmail = clean(email)
  if (!institutionId || !cleanedEmail) {
    return { success: false, error: 'Falta el email del docente a resolver.' }
  }

  const { data, error } = await supabase.rpc('academic_resolve_member_profile_by_email', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    target_email: cleanedEmail,
    target_account_role: 'docente',
  })

  if (error) {
    return { success: false, error: `No se pudo resolver el docente. ${error.message}` }
  }

  const profile = Array.isArray(data) ? data[0] : data

  if (!profile || !profile.user_id) {
    return {
      success: false,
      error: "No se encontro un usuario docente con ese email. Primero hay que darle acceso desde 'Accesos docentes'.",
    }
  }

  return { success: true, profile }
}

export const SUBJECT_TEACHER_ROLES = ['titular', 'suplente', 'licencia']

export async function createTeacherSubjectLeave({
  institutionId,
  workspaceKey = 'main',
  assignmentIds = [],
  replacementTeacherId,
  replacementTeacherRecordId = null,
  startsOn,
  endsOn = null,
  notes = '',
}) {
  ensureSupabaseReady()

  const ids = Array.from(new Set(assignmentIds.map(clean).filter(Boolean)))
  if (!institutionId || !ids.length || !replacementTeacherId || !startsOn) {
    return { success: false, error: 'Selecciona materias, docente reemplazante y fecha de inicio.' }
  }

  const { data, error } = await supabase.rpc('academic_create_teacher_subject_leave', {
    p_institution_id: institutionId,
    p_workspace_key: workspaceKey,
    p_assignment_ids: ids,
    p_replacement_teacher_id: replacementTeacherId,
    p_replacement_teacher_record_id: replacementTeacherRecordId,
    p_starts_on: startsOn,
    p_ends_on: endsOn || null,
    p_notes: clean(notes),
  })

  if (error) {
    return { success: false, error: `No se pudo registrar la licencia. ${error.message}` }
  }

  return { success: true, data: data ?? {} }
}

export async function fetchSubjectTeacherAssignmentsForTeacher({ institutionId, workspaceKey = 'main', teacherId }) {
  ensureSupabaseReady()

  if (!institutionId || !teacherId) return []

  let { data, error } = await runActiveAssignmentsQuery({ institutionId, workspaceKey, teacherId })

  if (isMissingDeletedAtColumn(error)) {
    ;({ data, error } = await runActiveAssignmentsQuery({
      institutionId,
      workspaceKey,
      teacherId,
      withDeletedAtFilter: false,
    }))
  }

  if (error) {
    throw new Error(`No se pudieron cargar las materias del docente. ${error.message}`)
  }

  return data ?? []
}

export async function createSubjectTeacherAssignment({
  institutionId,
  workspaceKey = 'main',
  subjectId,
  programId,
  teacherId,
  teacherRecordId,
  role = 'titular',
}) {
  ensureSupabaseReady()

  if (!institutionId || !subjectId || !teacherId) {
    return { success: false, error: 'Faltan datos para asignar la materia.' }
  }

  if (!SUBJECT_TEACHER_ROLES.includes(role)) {
    return { success: false, error: 'La condicion debe ser titular, suplente o licencia.' }
  }

  const payload = {
    institution_id: institutionId,
    workspace_key: workspaceKey,
    subject_id: subjectId,
    program_id: programId ?? '',
    teacher_id: teacherId,
    teacher_record_id: teacherRecordId ?? null,
    source: 'manual',
    status: 'active',
    deleted_at: null,
    role,
  }

  let { data, error } = await supabase
    .from('subject_teacher_assignments')
    .insert(payload)
    .select('*')
    .single()

  if (isMissingDeletedAtColumn(error)) {
    const { deleted_at: _deletedAt, ...legacyPayload } = payload
    ;({ data, error } = await supabase
      .from('subject_teacher_assignments')
      .insert(legacyPayload)
      .select('*')
      .single())
  }

  if (isInvalidTeacherRecordForeignKey(error)) {
    const { teacher_record_id: _teacherRecordId, ...payloadWithoutTeacherRecord } = payload
    ;({ data, error } = await supabase
      .from('subject_teacher_assignments')
      .insert(payloadWithoutTeacherRecord)
      .select('*')
      .single())
  }

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Este docente ya tiene esta materia asignada.' }
    }

    return { success: false, error: `No se pudo asignar la materia. ${error.message}` }
  }

  return { success: true, data }
}

export async function updateSubjectTeacherAssignmentRole(id, role) {
  ensureSupabaseReady()

  if (!id) {
    return { success: false, error: 'Falta el identificador de la asignacion.' }
  }

  if (!SUBJECT_TEACHER_ROLES.includes(role)) {
    return { success: false, error: 'La condicion debe ser titular, suplente o licencia.' }
  }

  const { data, error } = await supabase
    .from('subject_teacher_assignments')
    .update({ role })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    if (isMissingDeletedAtColumn(error)) {
      return { success: false, error: deletedAtMigrationMessage('No se pudo actualizar la condicion') }
    }

    return { success: false, error: `No se pudo actualizar la condicion. ${error.message}` }
  }

  return { success: true, data }
}

export async function updateTeacherAssignmentCondition(id, role) {
  ensureSupabaseReady()
  if (!id || !SUBJECT_TEACHER_ROLES.includes(role) || role === 'licencia') {
    return { success: false, error: 'Selecciona una asignacion y una condicion valida.' }
  }

  const { data, error } = await supabase.rpc('academic_update_teacher_assignment_condition', {
    p_assignment_id: id,
    p_role: role,
  })
  if (error) {
    return { success: false, error: `No se pudo actualizar la condicion. ${error.message}` }
  }
  return { success: true, data }
}

export async function deactivateSubjectTeacherAssignment(id) {
  ensureSupabaseReady()

  if (!id) {
    return { success: false, error: 'Falta el identificador de la titularidad a dar de baja.' }
  }

  const deletedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('subject_teacher_assignments')
    .update({ status: 'inactive', deleted_at: deletedAt })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    if (isMissingDeletedAtColumn(error)) {
      return { success: false, error: deletedAtMigrationMessage('No se pudo dar de baja la titularidad') }
    }

    return { success: false, error: `No se pudo dar de baja la titularidad. ${error.message}` }
  }

  return { success: true, data }
}
