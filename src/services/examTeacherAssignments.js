import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { resolveTeacherProfile } from './subjectTeacherAssignments.js'
import { buildTeacherLoginEmail } from './rosterRecords.js'
import { buildTeacherReassignmentOptions } from '../features/exams/teacherReassignmentOptions.js'

function clean(value) {
  return String(value ?? '').trim()
}

function ensureSupabaseReady() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Esta operacion requiere Supabase configurado.')
  }
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

  const { data, error } = await supabase
    .from('exam_teacher_assignments')
    .upsert(rows, { onConflict: 'institution_id,workspace_key,exam_table_id,teacher_id' })
    .select('id')

  if (error) {
    return { success: false, error: `No se pudo publicar el precronograma. ${error.message}` }
  }

  return {
    success: true,
    published: data?.length ?? rows.length,
    skippedNoEmail,
    skippedNoAccount,
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

  const { data, error } = await supabase
    .from('exam_teacher_assignments')
    .select('exam_table_id, teacher_id, role, confirmation_status, teacher_notes, confirmed_at, requested_exam_table_id, requested_role, requested_date, reassignment_status, metadata')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('status', 'active')
    .in('exam_table_id', examTableIds)

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
      ? ' Ejecuta supabase/setup_multi_tenant/21_exam_process_reset.sql en Supabase y vuelve a intentar.'
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
