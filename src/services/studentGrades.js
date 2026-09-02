import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { optionalUuid } from '../utils/uuid.js'
import { mapCanonicalStudentGrade } from './academicCanonicalRows.js'

const TABLE_NAME = 'student_grades'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function firstRpcRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null
}

function mapGradeMutationError(error) {
  const message = String(error?.message ?? '')
  const code = String(error?.code ?? '')

  if (code === 'PGRST202' || code === '42883' || message.toLowerCase().includes('could not find the function')) {
    return 'Falta aplicar la migracion de seguridad del libro docente en Supabase.'
  }

  if (message.includes('ACADEMIC_LOCK_VERSION_CONFLICT')) {
    return 'Otro usuario modifico esta nota. Recarga la pagina.'
  }

  if (message.includes('STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND')) {
    return 'El alumno no tiene una inscripcion activa en esta materia.'
  }

  if (message.includes('ACADEMIC_COMMAND_FORBIDDEN')) {
    return 'No tenes permiso para cargar notas en esta materia.'
  }

  if (message.includes('GRADE_VALUE_OUT_OF_RANGE')) {
    return 'Las notas deben estar entre 0 y 10.'
  }

  return error?.message || 'No se pudo guardar la nota.'
}

function canUseRemoteStudentGrades({ institutionId }) {
  return Boolean(institutionId && isSupabaseConfigured && supabase)
}

export async function fetchStudentGrades({ institutionId, workspaceKey = 'main', subjectId, programId }) {
  if (!canUseRemoteStudentGrades({ institutionId }) || !subjectId) return []

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('id, institution_id, workspace_key, student_id, student_record_id, subject_enrollment_id, exam_enrollment_id, subject_id, program_id, teacher_id, teacher_record_id, grade_type, grade_value, grade_label, grade_scale, academic_status, observations, grading_period, attempt_number, legacy_snapshot_id, lock_version, created_at, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .eq('subject_id', subjectId)
    .eq('program_id', programId ?? '')
    .is('deleted_at', null)

  if (error) {
    console.warn('No se pudieron leer las notas de la materia.', error)
    return []
  }

  return asArray(data).map(mapCanonicalStudentGrade)
}

export async function fetchInstitutionStudentGrades({ institutionId, workspaceKey = 'main' }) {
  if (!canUseRemoteStudentGrades({ institutionId })) return []

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('id, institution_id, workspace_key, student_id, student_record_id, subject_enrollment_id, exam_enrollment_id, subject_id, program_id, teacher_id, teacher_record_id, grade_type, grade_value, grade_label, grade_scale, academic_status, observations, grading_period, attempt_number, legacy_snapshot_id, lock_version, created_at, updated_at')
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(error.message || 'No se pudieron leer las notas institucionales.')
  }

  return asArray(data).map(mapCanonicalStudentGrade)
}

export async function upsertStudentGrade({
  institutionId,
  workspaceKey = 'main',
  studentId,
  studentRecordId,
  subjectEnrollmentId,
  subjectId,
  programId,
  gradeType,
  attemptNumber = 1,
  gradeValue = null,
  academicStatus,
  lockVersion,
}) {
  if (!canUseRemoteStudentGrades({ institutionId })) {
    return { success: false, error: 'Supabase no esta configurado.' }
  }

  const { data, error } = await supabase.rpc('academic_teacher_upsert_student_grade', {
    p_institution_id: institutionId,
    p_workspace_key: workspaceKey,
    p_student_id: studentId,
    p_student_record_id: studentRecordId ?? null,
    // Los snapshots historicos pueden conservar identificadores compuestos
    // (por ejemplo, "student-enrollment-..."). La RPC recibe uuid, por lo
    // que un identificador legacy debe omitirse y resolverse por alumno,
    // materia y carrera dentro de la funcion segura.
    p_subject_enrollment_id: optionalUuid(subjectEnrollmentId),
    p_subject_id: subjectId,
    p_program_id: programId ?? '',
    p_grade_type: gradeType,
    p_attempt_number: attemptNumber,
    p_grade_value: gradeValue,
    p_academic_status: academicStatus ?? null,
    p_expected_lock_version: lockVersion ?? null,
  })

  if (error) {
    return { success: false, error: mapGradeMutationError(error) }
  }

  return { success: true, grade: mapCanonicalStudentGrade(firstRpcRow(data)) }
}
