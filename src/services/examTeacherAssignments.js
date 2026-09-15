import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { resolveTeacherProfile } from './subjectTeacherAssignments.js'
import { buildTeacherLoginEmail } from './rosterRecords.js'
import { buildTeacherReassignmentOptions } from '../features/exams/teacherReassignmentOptions.js'

const OBJECTION_WINDOW_MS = 24 * 60 * 60 * 1000
let adminConfirmRpcUnavailable = false

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function ensureSupabaseReady() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Esta operacion requiere Supabase configurado.')
  }
}

function isMissingExamTeacherAssignmentsTable(error) {
  const errorText = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  return error?.code === 'PGRST205' ||
    error?.code === 'PGRST204' ||
    error?.code === '42703' ||
    error?.code === '42P01' ||
    errorText.includes('objection_deadline') ||
    (errorText.includes('exam_teacher_assignments') && (
      errorText.includes('could not find the table') ||
      errorText.includes('schema cache') ||
      errorText.includes('does not exist') ||
      errorText.includes('column')
    ))
}

function isMissingExamTeacherAssignmentsOptionalColumn(error) {
  const errorText = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  return (error?.code === 'PGRST204' || error?.code === '42703') &&
    errorText.includes('objection_deadline')
}

function isMissingExamConfirmationWorkflowFunction(error) {
  const errorText = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  return error?.code === 'PGRST202' ||
    error?.code === '42883' ||
    errorText.includes('could not find the function') ||
    errorText.includes('academic_reconcile_expired_exam_confirmations') ||
    errorText.includes('academic_admin_confirm_exam_assignment')
}

function withoutObjectionDeadline(rows = []) {
  return rows.map((row) => {
    const legacyRow = { ...row }
    delete legacyRow.objection_deadline
    return legacyRow
  })
}

function upsertTeacherAssignmentRows(rows = []) {
  return supabase
    .from('exam_teacher_assignments')
    .upsert(rows, { onConflict: 'institution_id,workspace_key,exam_table_id,teacher_id' })
    .select('id')
}

function buildDocenteIndex(docentes = []) {
  const index = new Map()
  docentes.forEach((docente) => {
    const id = clean(docente?.id)
    if (id && !index.has(id)) index.set(id, docente)
  })
  return index
}

// Mismo orden de prioridad que usa "Accesos docentes" al crear la cuenta
// (TeacherRosterSection.jsx): email real declarado primero, y si no hay,
// el email sintetico basado en DNI que usa el login docente por defecto
// (usuario y contrasena = DNI, ver buildTeacherLoginEmail). Sin este
// fallback, un docente con cuenta creada por DNI pero sin email cargado
// en la planilla nunca se puede resolver, aunque su cuenta exista.
function getDocenteEmail(docente = {}, institutionId = '') {
  const explicitEmail = clean(docente.email || docente.correo || docente.mail || docente.profile?.email)
  if (explicitEmail) return explicitEmail

  return clean(buildTeacherLoginEmail({ dni: docente.dni, institutionId }))
}

// Un titular-cruzado (lockedCrossTitular) o un tribunal cruzado formal no
// participa via titularId/vocal1Id/vocal2Id de la mesa combinada, asi que
// publicar solo estos tres roles cubre la generacion automatica y la
// interactiva; tribunales cruzados quedan fuera del MVP.
function buildAssignmentCandidates(mesas = [], docenteIndex, institutionId = '') {
  const candidates = []

  mesas.forEach((mesa) => {
    const examTableId = clean(mesa.draftMesaId ?? mesa.id)
    if (!examTableId) return

    const roles = [
      { role: 'TITULAR', docenteId: clean(mesa.titularId) },
      { role: 'VOCAL_1', docenteId: clean(mesa.vocal1Id) },
      { role: 'VOCAL_2', docenteId: clean(mesa.vocal2Id) },
    ]

    roles.forEach(({ role, docenteId }) => {
      if (!docenteId) return

      const docente = docenteIndex.get(docenteId)
      candidates.push({
        examTableId,
        role,
        docenteId,
        email: getDocenteEmail(docente ?? {}, institutionId),
        metadata: {
          fecha: clean(mesa.fechaSugerida ?? mesa.fecha),
          inicio: clean(mesa.inicio),
          fin: clean(mesa.fin),
          turno: clean(mesa.turno),
          materia: clean(mesa.materiaMesa ?? mesa.materia),
          carrera: clean(mesa.carrera),
          anio: mesa.anio ?? null,
          llamado: clean(mesa.llamado),
          titular: clean(mesa.titular),
          vocal1: clean(mesa.vocal1),
          vocal2: clean(mesa.vocal2),
        },
      })
    })
  })

  return candidates.map((candidate) => {
    const teacher = docenteIndex.get(candidate.docenteId) ?? {}
    const teacherAssignments = candidates
      .filter((row) => row.docenteId === candidate.docenteId)
      .map((row) => ({ exam_table_id: row.examTableId, status: 'active', metadata: row.metadata }))
    const reassignmentOptions = buildTeacherReassignmentOptions({
      objectedAssignment: {
        exam_table_id: candidate.examTableId,
        role: candidate.role,
        metadata: candidate.metadata,
      },
      mesas,
      teacher,
      teacherAssignments,
    })

    return {
      ...candidate,
      metadata: {
        ...candidate.metadata,
        reassignment_options: reassignmentOptions,
      },
    }
  })
}

// Publica el precronograma completo (con tribunal armado) para que cada
// docente lo vea desde el portal y confirme/objete su participacion.
// Solo alcanza a los docentes que ya tengan cuenta de portal con el mismo
// email cargado en la planilla de docentes (ver 13_exam_teacher_assignment_confirmation.sql).
// Cada publicacion resetea confirmation_status a 'pending' para las mesas
// afectadas: es la forma de avisar "esto cambio, confirma de nuevo".
export async function publishExamTeacherAssignmentsForReview({
  institutionId,
  workspaceKey = 'main',
  mesas = [],
  docentes = [],
}) {
  ensureSupabaseReady()

  if (!institutionId) {
    return { success: false, error: 'Falta la institucion activa.' }
  }

  const docenteIndex = buildDocenteIndex(docentes)
  const candidates = buildAssignmentCandidates(mesas, docenteIndex, institutionId)

  if (!candidates.length) {
    return { success: false, error: 'No hay mesas con titular o vocales asignados para publicar.' }
  }

  const uniqueEmails = [...new Set(candidates.map((candidate) => candidate.email).filter(Boolean))]
  const profileByEmail = new Map()

  for (const email of uniqueEmails) {
    const result = await resolveTeacherProfile({ institutionId, workspaceKey, email })
    if (result.success) profileByEmail.set(email, result.profile)
  }

  const rows = []
  const skippedNoEmail = []
  const skippedNoAccount = []
  const objectionDeadline = new Date(Date.now() + OBJECTION_WINDOW_MS).toISOString()

  candidates.forEach((candidate) => {
    if (!candidate.email) {
      skippedNoEmail.push(candidate)
      return
    }

    const profile = profileByEmail.get(candidate.email)
    if (!profile) {
      skippedNoAccount.push(candidate)
      return
    }

    rows.push({
      institution_id: institutionId,
      workspace_key: workspaceKey,
      exam_table_id: candidate.examTableId,
      teacher_id: profile.user_id,
      source: 'precronograma_publish',
      status: 'active',
      role: candidate.role,
      confirmation_status: 'pending',
      objection_deadline: objectionDeadline,
      teacher_notes: '',
      confirmed_at: null,
      deleted_at: null,
      deleted_by: null,
      metadata: candidate.metadata,
    })
  })

  if (!rows.length) {
    return {
      success: false,
      error: 'Ningun docente de estas mesas tiene cuenta de portal con email coincidente todavia.',
      skippedNoEmail,
      skippedNoAccount,
    }
  }

  let { data, error } = await upsertTeacherAssignmentRows(rows)

  if (isMissingExamTeacherAssignmentsOptionalColumn(error)) {
    const legacyResult = await upsertTeacherAssignmentRows(withoutObjectionDeadline(rows))
    data = legacyResult.data
    error = legacyResult.error
  }

  if (error) {
    const migrationHint = isMissingExamTeacherAssignmentsTable(error)
      ? ' Ejecuta supabase/docs/repair_06_exam_teacher_assignments.sql en Supabase y vuelve a intentar.'
      : ''
    return { success: false, error: `No se pudo publicar el precronograma.${migrationHint} ${error.message}` }
  }

  return {
    success: true,
    published: data?.length ?? rows.length,
    skippedNoEmail,
    skippedNoAccount,
  }
}

function buildReviewAssignmentsQuery({ institutionId, workspaceKey, examTableIds, select }) {
  return supabase
    .from('exam_teacher_assignments')
    .select(select)
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('status', 'active')
    .in('exam_table_id', examTableIds)
}

function updateTeacherAssignmentAsAdminFallback({
  institutionId,
  workspaceKey,
  examTableId,
  teacherId,
}) {
  return updateTeacherAssignmentsAsAdminFallback({
    institutionId,
    workspaceKey,
    targets: [{ examTableId, teacherId }],
  })
}

async function updateTeacherAssignmentsAsAdminFallback({
  institutionId,
  workspaceKey,
  targets = [],
}) {
  const confirmedAt = new Date().toISOString()
  const rows = []

  for (const [examTableId, teacherIds] of groupTeacherTargetsByMesa(targets)) {
    const { data, error } = await supabase
      .from('exam_teacher_assignments')
      .update({
        confirmation_status: 'confirmed',
        confirmed_at: confirmedAt,
        updated_at: confirmedAt,
      })
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .eq('exam_table_id', examTableId)
      .in('teacher_id', teacherIds)
      .eq('status', 'active')
      .select('id, exam_table_id, teacher_id, confirmation_status, confirmed_at')

    if (error) return { data: rows, error }
    rows.push(...asArray(data))
  }

  return { data: rows, error: null }
}

function groupTeacherTargetsByMesa(targets = []) {
  const groups = new Map()

  targets.forEach((target) => {
    const examTableId = clean(target?.examTableId)
    const teacherId = clean(target?.teacherId)
    if (!examTableId || !teacherId) return
    if (!groups.has(examTableId)) groups.set(examTableId, new Set())
    groups.get(examTableId).add(teacherId)
  })

  return [...groups.entries()].map(([examTableId, teacherIds]) => [examTableId, [...teacherIds]])
}

function buildAdminConfirmRpcArgs({ institutionId, workspaceKey, examTableId, teacherId }) {
  return {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    target_exam_table_id: clean(examTableId),
    target_teacher_id: clean(teacherId),
  }
}

async function confirmExamAssignmentWithAdminRpc({
  institutionId,
  workspaceKey,
  examTableId,
  teacherId,
}) {
  const { data, error } = await supabase.rpc('academic_admin_confirm_exam_assignment', buildAdminConfirmRpcArgs({
    institutionId,
    workspaceKey,
    examTableId,
    teacherId,
  }))

  if (error && isMissingExamConfirmationWorkflowFunction(error)) {
    adminConfirmRpcUnavailable = true
  }

  return { data, error }
}

export async function reconcileExpiredExamConfirmations({
  institutionId,
  workspaceKey = 'main',
  examTableId = '',
} = {}) {
  if (!institutionId) {
    return { success: false, error: 'Falta la institucion activa.' }
  }

  if (!isSupabaseConfigured || !supabase) {
    return { success: true, skippedRemote: true, data: null }
  }

  const { data, error } = await supabase.rpc('academic_reconcile_expired_exam_confirmations', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    target_exam_table_id: clean(examTableId),
  })

  if (error) {
    if (isMissingExamConfirmationWorkflowFunction(error)) {
      return { success: true, skippedMissingRpc: true, data: null }
    }

    return {
      success: false,
      error: `No se pudo reconciliar el vencimiento de confirmaciones docentes. ${error.message}`,
      data: null,
    }
  }

  return { success: true, data: data ?? null }
}

export async function confirmExamAssignmentAsAdmin({
  institutionId,
  workspaceKey = 'main',
  examTableId,
  teacherId,
} = {}) {
  if (!institutionId) {
    return { success: false, error: 'Falta la institucion activa.' }
  }

  if (!clean(examTableId) || !clean(teacherId)) {
    return { success: false, error: 'Falta la mesa o el docente a confirmar.' }
  }

  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Esta operacion requiere Supabase configurado.' }
  }

  let data = null
  let error = null

  if (!adminConfirmRpcUnavailable) {
    ;({ data, error } = await confirmExamAssignmentWithAdminRpc({
      institutionId,
      workspaceKey,
      examTableId,
      teacherId,
    }))
  } else {
    error = { code: 'PGRST202', message: 'academic_admin_confirm_exam_assignment unavailable in this session' }
  }

  if (error) {
    if (isMissingExamConfirmationWorkflowFunction(error)) {
      const fallbackResult = await updateTeacherAssignmentAsAdminFallback({
        institutionId,
        workspaceKey,
        examTableId: clean(examTableId),
        teacherId: clean(teacherId),
      })

      const fallbackRows = asArray(fallbackResult.data)

      if (!fallbackResult.error && fallbackRows.length) {
        return {
          success: true,
          data: {
            updated: fallbackRows.length,
            fallback: 'direct_admin_update',
            rows: fallbackRows,
          },
        }
      }

      const fallbackError = fallbackResult.error?.message
        ? ` Fallback directo: ${fallbackResult.error.message}`
        : ' Fallback directo: no se encontro una asignacion activa para confirmar.'

      return {
        success: false,
        error: `No se pudo confirmar la mesa como admin. Ejecuta supabase/docs/repair_06_exam_teacher_assignments.sql en Supabase y vuelve a intentar.${fallbackError}`,
      }
    }

    return {
      success: false,
      error: `No se pudo confirmar la mesa como admin. ${error.message}`,
    }
  }

  return { success: true, data: data ?? null }
}

export async function confirmExamAssignmentsAsAdmin({
  institutionId,
  workspaceKey = 'main',
  entries = [],
} = {}) {
  if (!institutionId) {
    return { success: false, error: 'Falta la institucion activa.' }
  }

  const targets = entries
    .map((entry) => ({
      examTableId: clean(entry?.examTableId),
      teacherId: clean(entry?.teacherId),
    }))
    .filter((entry) => entry.examTableId && entry.teacherId)

  if (!targets.length) {
    return { success: false, error: 'Falta la mesa o el docente a confirmar.' }
  }

  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Esta operacion requiere Supabase configurado.' }
  }

  if (adminConfirmRpcUnavailable) {
    return confirmExamAssignmentsAsAdminFallback({ institutionId, workspaceKey, targets })
  }

  const firstTarget = targets[0]
  const firstResult = await confirmExamAssignmentWithAdminRpc({
    institutionId,
    workspaceKey,
    ...firstTarget,
  })

  if (firstResult.error && isMissingExamConfirmationWorkflowFunction(firstResult.error)) {
    return confirmExamAssignmentsAsAdminFallback({ institutionId, workspaceKey, targets })
  }

  if (firstResult.error) {
    return { success: false, error: `No se pudo confirmar la mesa como admin. ${firstResult.error.message}` }
  }

  const remainingResults = await Promise.all(targets.slice(1).map(async (target) => {
    const result = await confirmExamAssignmentWithAdminRpc({
      institutionId,
      workspaceKey,
      ...target,
    })

    return { target, ...result }
  }))

  const missingRpcFromRemaining = remainingResults.some((result) => (
    result.error && isMissingExamConfirmationWorkflowFunction(result.error)
  ))
  if (missingRpcFromRemaining) {
    const missingTargets = remainingResults
      .filter((result) => result.error && isMissingExamConfirmationWorkflowFunction(result.error))
      .map((result) => result.target)
    return confirmExamAssignmentsAsAdminFallback({ institutionId, workspaceKey, targets: missingTargets })
  }

  const failed = remainingResults.find((result) => result.error)
  if (failed) {
    return { success: false, error: `No se pudo confirmar la mesa como admin. ${failed.error.message}` }
  }

  return {
    success: true,
    data: {
      updated: targets.length,
      rows: [
        firstResult.data,
        ...remainingResults.map((result) => result.data),
      ].filter(Boolean),
    },
  }
}

async function confirmExamAssignmentsAsAdminFallback({
  institutionId,
  workspaceKey,
  targets,
}) {
  const fallbackResult = await updateTeacherAssignmentsAsAdminFallback({
    institutionId,
    workspaceKey,
    targets,
  })
  const fallbackRows = asArray(fallbackResult.data)

  if (!fallbackResult.error && fallbackRows.length) {
    return {
      success: true,
      data: {
        updated: fallbackRows.length,
        fallback: 'direct_admin_update',
        rows: fallbackRows,
      },
    }
  }

  const fallbackError = fallbackResult.error?.message
    ? ` Fallback directo: ${fallbackResult.error.message}`
    : ' Fallback directo: no se encontro una asignacion activa para confirmar.'

  return {
    success: false,
    error: `No se pudo confirmar la mesa como admin. Ejecuta supabase/docs/repair_06_exam_teacher_assignments.sql en Supabase y vuelve a intentar.${fallbackError}`,
  }
}

// Lee el estado real de confirmacion/objecion que cada docente cargo desde
// su portal (via el RPC academic_teacher_confirm_exam_assignment), para
// cerrar el loop de revision sin depender de que el admin exporte/importe
// un archivo aparte. La policy "academic admins manage exam teacher
// assignments" ya permite select a cualquier admin de la institucion.
export async function fetchExamTeacherAssignmentsForReview({
  institutionId,
  workspaceKey = 'main',
  examTableIds = [],
}) {
  ensureSupabaseReady()

  if (!institutionId) {
    return { success: false, error: 'Falta la institucion activa.', rows: [] }
  }

  if (!examTableIds.length) {
    return { success: true, rows: [] }
  }

  const reconciliation = await reconcileExpiredExamConfirmations({
    institutionId,
    workspaceKey,
  })

  if (!reconciliation.success) {
    return { success: false, error: reconciliation.error, rows: [] }
  }

  let { data, error } = await buildReviewAssignmentsQuery({
    institutionId,
    workspaceKey,
    examTableIds,
    select: 'exam_table_id, teacher_id, role, confirmation_status, teacher_notes, confirmed_at, objection_deadline, requested_exam_table_id, requested_role, requested_date, reassignment_status, metadata',
  })

  if (isMissingExamTeacherAssignmentsOptionalColumn(error)) {
    const legacyResult = await buildReviewAssignmentsQuery({
      institutionId,
      workspaceKey,
      examTableIds,
      select: 'exam_table_id, teacher_id, role, confirmation_status, teacher_notes, confirmed_at, requested_exam_table_id, requested_role, requested_date, reassignment_status, metadata',
    })
    data = legacyResult.data
    error = legacyResult.error
  }

  if (error) {
    return { success: false, error: `No se pudieron leer las confirmaciones docentes. ${error.message}`, rows: [] }
  }

  return { success: true, rows: data ?? [] }
}

function isMissingExamProcessResetFunction(error) {
  const errorText = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()
  return error?.code === 'PGRST202' ||
    errorText.includes('academic_admin_reset_exam_process') ||
    errorText.includes('could not find the function')
}

export async function resetExamProcessForWorkspace({
  institutionId,
  workspaceKey = 'main',
} = {}) {
  if (!institutionId) {
    return { success: false, error: 'Falta la institucion activa.' }
  }

  if (!isSupabaseConfigured || !supabase) {
    return {
      success: true,
      skippedRemote: true,
      summary: {
        workspace_cronograma_cleared: 0,
        teacher_assignments_reset: 0,
        exam_enrollments_reset: 0,
        legacy_exam_sessions_deleted: 0,
      },
    }
  }

  const { data, error } = await supabase.rpc('academic_admin_reset_exam_process', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
  })

  if (error) {
    const migrationHint = isMissingExamProcessResetFunction(error)
      ? ' Ejecuta supabase/docs/repair_06_exam_process_reset_rpc.sql en Supabase y vuelve a intentar.'
      : ''
    return {
      success: false,
      error: `No se pudo reiniciar el proceso de mesas.${migrationHint} ${error.message}`,
    }
  }

  return {
    success: true,
    summary: data ?? {},
  }
}
