import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'
import { reconcileExpiredExamConfirmations } from '../../../services/examTeacherAssignments.js'

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function canUseRemoteExamAssignments({ institutionId }) {
  return Boolean(institutionId && isSupabaseConfigured && supabase)
}

function isMissingReassignmentColumns(error) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase()
  return error?.code === '42703' || error?.code === 'PGRST204' || (
    message.includes('objection_deadline') ||
    message.includes('requested_exam_table_id') ||
    message.includes('requested_role') ||
    message.includes('requested_date') ||
    message.includes('reassignment_status')
  )
}

function buildTeacherAssignmentsQuery({ institutionId, workspaceKey, teacherUserId, select }) {
  return supabase
    .from('exam_teacher_assignments')
    .select(select)
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('teacher_id', teacherUserId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
}

// Mesas de examen publicadas para revision del docente autenticado (ver
// 13_exam_teacher_assignment_confirmation.sql). Solo trae las suyas: RLS
// filtra por teacher_id = auth.uid() ademas del filtro explicito de acá.
export async function fetchTeacherExamAssignments({ institutionId, workspaceKey = 'main', teacherUserId }) {
  if (!canUseRemoteExamAssignments({ institutionId }) || !clean(teacherUserId)) return []

  const reconciliation = await reconcileExpiredExamConfirmations({ institutionId, workspaceKey })
  if (!reconciliation.success) {
    console.warn('No se pudieron reconciliar vencimientos de mesas docentes.', reconciliation.error)
  }

  let { data, error } = await buildTeacherAssignmentsQuery({
    institutionId,
    workspaceKey,
    teacherUserId,
    select: 'id, exam_table_id, role, confirmation_status, teacher_notes, confirmed_at, objection_deadline, requested_exam_table_id, requested_role, requested_date, reassignment_status, metadata, created_at, updated_at',
  })

  // Compatibilidad durante el intervalo entre desplegar el frontend y aplicar
  // la migracion. Una columna nueva ausente no debe ocultar mesas ya publicadas.
  if (isMissingReassignmentColumns(error)) {
    const legacyResult = await buildTeacherAssignmentsQuery({
      institutionId,
      workspaceKey,
      teacherUserId,
      select: 'id, exam_table_id, role, confirmation_status, teacher_notes, confirmed_at, metadata, created_at, updated_at',
    })
    data = legacyResult.data
    error = legacyResult.error
  }

  if (error) {
    console.warn('No se pudieron leer las mesas asignadas al docente.', error)
    return []
  }

  return asArray(data)
}

export const TEACHER_EXAM_CONFIRMATION_STATES = ['confirmed', 'objected']

// Unica via de escritura del docente: pasa por la RPC
// academic_teacher_confirm_exam_assignment, que solo puede tocar
// confirmation_status/teacher_notes de su propia fila.
export async function confirmTeacherExamAssignment({
  institutionId,
  workspaceKey = 'main',
  examTableId,
  confirmationStatus,
  teacherNotes = '',
  reassignmentOption = null,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Esta operacion requiere Supabase configurado.' }
  }

  if (!institutionId || !clean(examTableId)) {
    return { success: false, error: 'Falta la mesa a confirmar.' }
  }

  if (!TEACHER_EXAM_CONFIRMATION_STATES.includes(confirmationStatus)) {
    return { success: false, error: 'Estado de confirmacion invalido.' }
  }

  const hasReassignment = confirmationStatus === 'objected' && reassignmentOption?.targetExamTableId
  const { data, error } = hasReassignment
    ? await supabase.rpc('academic_teacher_object_exam_assignment', {
        target_institution_id: institutionId,
        target_workspace_key: workspaceKey,
        target_exam_table_id: examTableId,
        target_teacher_notes: teacherNotes,
        target_requested_exam_table_id: reassignmentOption.targetExamTableId,
        target_requested_role: reassignmentOption.targetRole,
        target_requested_date: reassignmentOption.fecha,
      })
    : await supabase.rpc('academic_teacher_confirm_exam_assignment', {
        target_institution_id: institutionId,
        target_workspace_key: workspaceKey,
        target_exam_table_id: examTableId,
        target_confirmation_status: confirmationStatus,
        target_teacher_notes: teacherNotes,
      })

  if (error) {
    return { success: false, error: `No se pudo registrar la confirmacion. ${error.message}` }
  }

  return { success: true, data }
}
