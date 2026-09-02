import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { optionalUuid } from '../utils/uuid.js'

const SESSIONS_TABLE = 'subject_class_sessions'
const RECORDS_TABLE = 'subject_attendance_records'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function firstRpcRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null
}

function mapAttendanceMutationError(error, fallbackMessage) {
  const message = String(error?.message ?? '')
  const code = String(error?.code ?? '')

  if (code === 'PGRST202' || code === '42883' || message.toLowerCase().includes('could not find the function')) {
    return 'Falta aplicar la migracion de seguridad del libro docente en Supabase.'
  }

  if (message.includes('STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND')) {
    return 'Hay alumnos sin inscripcion activa en esta materia.'
  }

  if (message.includes('SUBJECT_CLASS_SESSION_NOT_FOUND')) {
    return 'No se encontro la clase seleccionada.'
  }

  if (message.includes('ACADEMIC_COMMAND_FORBIDDEN')) {
    return 'No tenes permiso para cargar asistencia en esta materia.'
  }

  return error?.message || fallbackMessage
}

function canUseRemoteAttendance({ institutionId }) {
  return Boolean(institutionId && isSupabaseConfigured && supabase)
}

export async function fetchClassSessions({ institutionId, workspaceKey = 'main', subjectId, programId, teacherId }) {
  if (!canUseRemoteAttendance({ institutionId }) || !subjectId) return []

  let query = supabase
    .from(SESSIONS_TABLE)
    .select('id, institution_id, workspace_key, subject_id, program_id, teacher_id, session_date, topic, notes, created_at, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('subject_id', subjectId)
    .eq('program_id', programId ?? '')

  if (teacherId) {
    query = query.eq('teacher_id', teacherId)
  }

  const { data, error } = await query.order('session_date', { ascending: false })

  if (error) {
    console.warn('No se pudieron leer las clases registradas para la materia.', error)
    return []
  }

  return asArray(data)
}

export async function createClassSession({ institutionId, workspaceKey = 'main', subjectId, programId, sessionDate, topic = '' }) {
  if (!canUseRemoteAttendance({ institutionId })) {
    return { success: false, error: 'Supabase no esta configurado.' }
  }

  const { data, error } = await supabase.rpc('academic_teacher_create_class_session', {
    p_institution_id: institutionId,
    p_workspace_key: workspaceKey,
    p_subject_id: subjectId,
    p_program_id: programId ?? '',
    p_session_date: sessionDate,
    p_topic: topic,
  })

  if (error) {
    return { success: false, error: mapAttendanceMutationError(error, 'No se pudo crear la clase.') }
  }

  return { success: true, session: firstRpcRow(data) }
}

export async function fetchAttendanceForSession(sessionId) {
  if (!isSupabaseConfigured || !supabase || !sessionId) return []

  const { data, error } = await supabase
    .from(RECORDS_TABLE)
    .select('id, session_id, student_id, subject_enrollment_id, status, observations, created_at, updated_at')
    .eq('session_id', sessionId)

  if (error) {
    console.warn('No se pudo leer la asistencia de la clase.', error)
    return []
  }

  return asArray(data)
}

export async function fetchAttendanceForSessions(sessionIds = []) {
  if (!isSupabaseConfigured || !supabase) return []

  const ids = Array.from(new Set(asArray(sessionIds).map((sessionId) => String(sessionId ?? '').trim()).filter(Boolean)))
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from(RECORDS_TABLE)
    .select('id, session_id, student_id, subject_enrollment_id, status, observations, created_at, updated_at')
    .in('session_id', ids)

  if (error) {
    console.warn('No se pudieron leer las asistencias de la materia.', error)
    return []
  }

  return asArray(data)
}

export async function saveAttendanceForSession({ sessionId, institutionId, records = [] }) {
  if (!canUseRemoteAttendance({ institutionId }) || !sessionId) {
    return { success: false, error: 'Supabase no esta configurado.' }
  }

  const rows = asArray(records).map((record) => ({
    student_id: record.studentId,
    subject_enrollment_id: optionalUuid(record.subjectEnrollmentId),
    status: record.status || 'present',
    observations: record.observations ?? '',
  }))

  if (rows.length === 0) return { success: true, records: [] }

  const { data, error } = await supabase.rpc('academic_teacher_upsert_attendance_records', {
    p_session_id: sessionId,
    p_records: rows,
  })

  if (error) {
    return { success: false, error: mapAttendanceMutationError(error, 'No se pudo guardar la asistencia.') }
  }

  return { success: true, records: asArray(data) }
}

export async function fetchStudentAttendanceRecords({
  institutionId,
  workspaceKey = 'main',
  studentId,
}) {
  if (!canUseRemoteAttendance({ institutionId }) || !studentId) return []

  const { data: recordRows, error: recordsError } = await supabase
    .from(RECORDS_TABLE)
    .select('id, institution_id, workspace_key, session_id, student_id, subject_enrollment_id, status, observations, created_at, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('student_id', studentId)

  if (recordsError) {
    console.warn('No se pudo leer la asistencia del alumno.', recordsError)
    return []
  }

  const records = asArray(recordRows)
  const sessionIds = Array.from(new Set(records.map((record) => record.session_id).filter(Boolean)))
  if (sessionIds.length === 0) return records

  const { data: sessionRows, error: sessionsError } = await supabase
    .from(SESSIONS_TABLE)
    .select('id, institution_id, workspace_key, subject_id, program_id, teacher_id, session_date, topic, notes, created_at, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .in('id', sessionIds)

  if (sessionsError) {
    console.warn('No se pudieron leer las clases de asistencia del alumno.', sessionsError)
    return records
  }

  const sessionsById = new Map(asArray(sessionRows).map((session) => [session.id, session]))

  return records.map((record) => {
    const session = sessionsById.get(record.session_id) ?? null

    return {
      ...record,
      subject_id: session?.subject_id ?? '',
      program_id: session?.program_id ?? '',
      session_date: session?.session_date ?? null,
      session,
    }
  })
}
