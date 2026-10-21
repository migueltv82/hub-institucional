import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const SUBJECT_TEACHER_ASSIGNMENT_SELECT = 'id, institution_id, workspace_key, subject_id, program_id, teacher_id, teacher_record_id, status, role, source, metadata, created_at, updated_at, deleted_at'
// Punto 3 (21/10): vigencia, motivo de fin y vinculo de reemplazo. Si la base todavia no corrio el 06 nuevo,
// la lectura sigue con las columnas de antes.
const ASSIGNMENT_MODEL_COLUMNS = ['starts_on', 'ends_on', 'end_reason', 'replaces_assignment_id']
const SUBJECT_TEACHER_ASSIGNMENT_MODEL_SELECT = `${SUBJECT_TEACHER_ASSIGNMENT_SELECT}, ${ASSIGNMENT_MODEL_COLUMNS.join(', ')}`

export const TEACHER_ASSIGNMENT_END_REASONS = Object.freeze({
  renuncia: 'Renuncia',
  baja: 'Baja',
  jubilacion: 'Jubilacion',
  reemplazado: 'Reemplazado por otro docente',
  fin_suplencia: 'Fin de la suplencia',
  error_de_carga: 'Error de carga',
  otro: 'Otro motivo',
})

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

function isMissingModelColumn(error) {
  const message = clean(error?.message).toLowerCase()
  return error?.code === '42703' && ASSIGNMENT_MODEL_COLUMNS.some((column) => message.includes(column))
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
  withModelColumns = true,
} = {}) {
  let query = supabase
    .from('subject_teacher_assignments')
    .select(withModelColumns ? SUBJECT_TEACHER_ASSIGNMENT_MODEL_SELECT : SUBJECT_TEACHER_ASSIGNMENT_SELECT)
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('status', 'active')

  if (teacherId) query = query.eq('teacher_id', teacherId)
  if (withDeletedAtFilter) query = query.is('deleted_at', null)

  return query.order('created_at', { ascending: false })
}

async function queryActiveAssignments(options) {
  let result = await runActiveAssignmentsQuery(options)
  if (isMissingModelColumn(result.error)) result = await runActiveAssignmentsQuery({ ...options, withModelColumns: false })
  if (isMissingDeletedAtColumn(result.error)) {
    result = await runActiveAssignmentsQuery({ ...options, withModelColumns: false, withDeletedAtFilter: false })
  }
  return result
}

export async function fetchSubjectTeacherAssignments({ institutionId, workspaceKey = 'main' }) {
  ensureSupabaseReady()

  if (!institutionId) {
    throw new Error('Falta la institucion activa para cargar las titularidades.')
  }

  const { data, error } = await queryActiveAssignments({ institutionId, workspaceKey })

  if (error) {
    throw new Error(`No se pudieron cargar las titularidades de materias. ${error.message}`)
  }

  return attachTeacherRecordIdentity(institutionId, data ?? [])
}

// D1: la titularidad relacional identifica al docente por ids (perfil y legajo) que el padron de la planilla no
// conoce. Sin el DNI, el motor de mesas lo trataba como otro docente (un "fantasma" sin nombre ni DNI). Se suma
// el DNI y el nombre del legajo docente para que se vincule con el padron. Si la lectura falla, sigue sin ellos.
async function attachTeacherRecordIdentity(institutionId, rows) {
  const recordIds = [...new Set(rows.map((row) => clean(row?.teacher_record_id)).filter(Boolean))]
  if (!recordIds.length) return rows

  const { data: records, error } = await supabase
    .from('teacher_records')
    .select('id, dni, full_name')
    .eq('institution_id', institutionId)
    .in('id', recordIds)
  if (error || !Array.isArray(records)) return rows

  const byId = new Map(records.map((record) => [clean(record.id), record]))
  return rows.map((row) => {
    const record = byId.get(clean(row?.teacher_record_id))
    if (!record) return row
    return {
      ...row,
      dni_docente: clean(row.dni_docente) || clean(record.dni),
      teacher_display_name: clean(row.teacher_display_name) || clean(record.full_name),
    }
  })
}

// La cuenta del docente puede estar con el email tecnico (DNI@docentes.<institucion>.local, el que crea
// "Crear accesos") o con el email de contacto de la planilla: se prueba cada candidato en orden.
export async function resolveTeacherProfile({ institutionId, workspaceKey = 'main', email, emails = [] }) {
  ensureSupabaseReady()

  const candidates = [...new Set([...emails, email].map(clean).filter(Boolean).map((value) => value.toLowerCase()))]
  if (!institutionId || candidates.length === 0) {
    return { success: false, error: 'Falta el email del docente a resolver.' }
  }

  for (const candidate of candidates) {
    const { data, error } = await supabase.rpc('academic_resolve_member_profile_by_email', {
      target_institution_id: institutionId,
      target_workspace_key: workspaceKey,
      target_email: candidate,
      target_account_role: 'docente',
    })

    if (error) {
      return { success: false, error: `No se pudo resolver el docente. ${error.message}` }
    }

    const profile = Array.isArray(data) ? data[0] : data
    if (profile?.user_id) return { success: true, profile }
  }

  return {
    success: false,
    error: "No se encontro un usuario docente con ese email. Primero hay que darle acceso desde 'Accesos docentes'.",
  }
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

  const { data, error } = await queryActiveAssignments({ institutionId, workspaceKey, teacherId })

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
    .select(SUBJECT_TEACHER_ASSIGNMENT_SELECT)
    .single()

  if (isMissingDeletedAtColumn(error)) {
    const { deleted_at: _deletedAt, ...legacyPayload } = payload
    ;({ data, error } = await supabase
      .from('subject_teacher_assignments')
      .insert(legacyPayload)
      .select(SUBJECT_TEACHER_ASSIGNMENT_SELECT)
      .single())
  }

  if (isInvalidTeacherRecordForeignKey(error)) {
    const { teacher_record_id: _teacherRecordId, ...payloadWithoutTeacherRecord } = payload
    ;({ data, error } = await supabase
      .from('subject_teacher_assignments')
      .insert(payloadWithoutTeacherRecord)
      .select(SUBJECT_TEACHER_ASSIGNMENT_SELECT)
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
    .select(SUBJECT_TEACHER_ASSIGNMENT_SELECT)
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

// Fin de una asignacion con motivo y fecha efectiva (RPC staff-only). Reemplaza la baja por update directo:
// la base ya no acepta una asignacion inactiva sin motivo.
export async function endSubjectTeacherAssignment({ id, reason, endsOn = null, notes = '' }) {
  ensureSupabaseReady()

  if (!id) {
    return { success: false, error: 'Falta el identificador de la asignacion a terminar.' }
  }
  if (!Object.hasOwn(TEACHER_ASSIGNMENT_END_REASONS, reason)) {
    return { success: false, error: 'Elegi el motivo por el que termina la asignacion.' }
  }

  const { data, error } = await supabase.rpc('academic_end_teacher_assignment', {
    p_assignment_id: id,
    p_reason: reason,
    p_ends_on: clean(endsOn) || null,
    p_notes: clean(notes),
  })

  if (error) {
    if (error.code === 'PGRST202') {
      return { success: false, error: deletedAtMigrationMessage('No se pudo dar de baja la asignacion') }
    }
    return { success: false, error: `No se pudo dar de baja la asignacion. ${error.message}` }
  }

  return { success: true, data: data ?? {} }
}
