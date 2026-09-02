import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { mapCanonicalSubjectEnrollment } from './academicCanonicalRows.js'

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeUuid(value) {
  const text = clean(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function ensureSupabaseReady() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Esta operacion requiere Supabase configurado.')
  }
}

export async function fetchSubjectEnrollments({ institutionId, workspaceKey = 'main', subjectId, programId }) {
  ensureSupabaseReady()

  if (!institutionId) {
    throw new Error('Falta la institucion activa para cargar las inscripciones.')
  }

  let query = supabase
    .from('subject_enrollments')
    .select('*')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .is('deleted_at', null)
    .in('status', ['active', 'enrolled'])
    .order('created_at', { ascending: false })

  if (subjectId) query = query.eq('subject_id', subjectId)
  if (programId) query = query.eq('program_id', programId)

  const { data, error } = await query

  if (error) {
    throw new Error(`No se pudieron cargar las inscripciones a materias. ${error.message}`)
  }

  return (data ?? []).map(mapCanonicalSubjectEnrollment)
}

export async function resolveStudentProfile({ institutionId, workspaceKey = 'main', email }) {
  ensureSupabaseReady()

  const cleanedEmail = clean(email)
  if (!institutionId || !cleanedEmail) {
    return { success: false, error: 'Falta el email del alumno a resolver.' }
  }

  const { data, error } = await supabase.rpc('academic_resolve_member_profile_by_email', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    target_email: cleanedEmail,
    target_account_role: 'alumno',
  })

  if (error) {
    return { success: false, error: `No se pudo resolver el alumno. ${error.message}` }
  }

  const profile = Array.isArray(data) ? data[0] : data

  if (!profile || !profile.user_id) {
    return {
      success: false,
      error: "No se encontro un usuario alumno con ese email. Primero hay que darle acceso desde 'Accesos alumnos'.",
    }
  }

  return { success: true, profile }
}

export async function resolveStudentRecordId({
  institutionId,
  workspaceKey = 'main',
  email,
  career,
}) {
  ensureSupabaseReady()

  const cleanedEmail = clean(email).toLowerCase()
  if (!institutionId || !cleanedEmail) return null

  const fetchRecords = async ({ exactCareer = false } = {}) => {
    let query = supabase
      .from('student_records')
      .select('id, career')
      .eq('institution_id', institutionId)
      .eq('workspace_key', workspaceKey)
      .eq('email', cleanedEmail)

    if (exactCareer && clean(career)) query = query.eq('career', clean(career))
    return query
  }

  const exactResult = await fetchRecords({ exactCareer: true })
  if (exactResult.error) return null

  const exactUuid = (Array.isArray(exactResult.data) ? exactResult.data : [])
    .map((row) => normalizeUuid(row?.id))
    .find(Boolean)
  if (exactUuid) return exactUuid

  // Los datos legacy suelen guardar la misma carrera con nombre, slug o acentos
  // diferentes. El email dentro de la misma institucion es una identidad mas
  // estable que esa etiqueta y evita crear una inscripcion activa huerfana.
  if (!clean(career)) return null

  const fallbackResult = await fetchRecords()
  if (fallbackResult.error) return null

  const fallbackUuids = Array.from(new Set(
    (Array.isArray(fallbackResult.data) ? fallbackResult.data : [])
      .map((row) => normalizeUuid(row?.id))
      .filter(Boolean),
  ))

  return fallbackUuids.length === 1 ? fallbackUuids[0] : null
}

export async function createSubjectEnrollment({
  institutionId,
  workspaceKey = 'main',
  subjectId,
  programId,
  studentId,
  studentRecordId,
}) {
  ensureSupabaseReady()

  if (!institutionId || !subjectId || !studentId) {
    return { success: false, error: 'Faltan datos para inscribir al alumno.' }
  }

  const normalizedStudentRecordId = normalizeUuid(studentRecordId)

  const { data, error } = await supabase
    .from('subject_enrollments')
    .insert({
      institution_id: institutionId,
      workspace_key: workspaceKey,
      subject_id: subjectId,
      program_id: programId ?? '',
      student_id: studentId,
      student_record_id: normalizedStudentRecordId,
      status: 'active',
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: repairedEnrollment, error: repairError } = await supabase
        .from('subject_enrollments')
        .update({
          status: 'active',
          deleted_at: null,
          dropped_at: null,
          ...(normalizedStudentRecordId ? { student_record_id: normalizedStudentRecordId } : {}),
        })
        .eq('institution_id', institutionId)
        .eq('workspace_key', workspaceKey)
        .eq('subject_id', subjectId)
        .eq('program_id', programId ?? '')
        .eq('student_id', studentId)
        .select('*')
        .single()

      if (!repairError && repairedEnrollment) {
        return { success: true, data: mapCanonicalSubjectEnrollment(repairedEnrollment) }
      }
    }

    if (error.code === '23505') {
      return { success: false, error: 'El alumno ya esta inscripto en esta materia.' }
    }

    return { success: false, error: `No se pudo inscribir al alumno. ${error.message}` }
  }

  return { success: true, data: mapCanonicalSubjectEnrollment(data) }
}

export async function dropSubjectEnrollment(id) {
  ensureSupabaseReady()

  if (!id) {
    return { success: false, error: 'Falta el identificador de la inscripcion a dar de baja.' }
  }

  const droppedAt = new Date().toISOString()

  const { data, error } = await supabase
    .from('subject_enrollments')
    .update({ status: 'dropped', dropped_at: droppedAt, deleted_at: droppedAt })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return { success: false, error: `No se pudo dar de baja la inscripcion. ${error.message}` }
  }

  return { success: true, data: mapCanonicalSubjectEnrollment(data) }
}
