import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value).toLowerCase()
}

function getFullName(student) {
  return clean(student?.full_name)
    || [clean(student?.nombre), clean(student?.apellido)].filter(Boolean).join(' ')
    || clean(student?.name)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function getNestedRaw(row) {
  return row?.raw && typeof row.raw === 'object'
    ? row.raw
    : row?.raw_payload && typeof row.raw_payload === 'object'
      ? row.raw_payload
      : {}
}

export function buildStudentAcademicResetIdentity(student = {}) {
  const raw = getNestedRaw(student)

  return {
    profile_id: clean(student.profile_id ?? student.user_id ?? student.student_id),
    student_record_id: clean(student.student_record_id ?? student.record_id),
    email: normalize(student.email ?? student.student_email ?? raw.email),
    dni: clean(student.dni ?? student.documento ?? raw.dni ?? raw.documento),
    full_name: getFullName(student),
  }
}

export function createStudentAcademicMatcher(student = {}) {
  const identity = buildStudentAcademicResetIdentity(student)
  const profileIds = new Set([
    normalize(identity.profile_id),
    normalize(student.id && clean(student.id).includes('@') ? '' : student.id),
  ].filter(Boolean))
  const recordIds = new Set([
    normalize(identity.student_record_id),
  ].filter(Boolean))
  const emails = new Set([normalize(identity.email)].filter(Boolean))
  const dnis = new Set([normalize(identity.dni)].filter(Boolean))
  const names = new Set([normalize(identity.full_name)].filter(Boolean))

  return (row = {}) => {
    const raw = getNestedRaw(row)
    const rowProfileIds = [
      row.profile_id,
      row.user_id,
      row.student_id,
      row.student?.id,
      raw.profile_id,
      raw.user_id,
      raw.student_id,
    ].map(normalize).filter(Boolean)
    const rowRecordIds = [
      row.student_record_id,
      row.record_id,
      row.student?.record_id,
      raw.student_record_id,
      raw.record_id,
    ].map(normalize).filter(Boolean)
    const rowEmails = [
      row.email,
      row.student_email,
      row.correo,
      row.student?.email,
      raw.email,
      raw.student_email,
    ].map(normalize).filter(Boolean)
    const rowDnis = [
      row.dni,
      row.student_dni,
      row.documento,
      row.student?.dni,
      raw.dni,
      raw.documento,
    ].map(normalize).filter(Boolean)
    const rowNames = [
      row.alumno,
      row.full_name,
      row.nombre_completo,
      row.student_name,
      row.student?.full_name,
      [row.nombre, row.apellido].filter(Boolean).join(' '),
      raw.alumno,
      raw.full_name,
    ].map(normalize).filter(Boolean)

    return (
      rowProfileIds.some((value) => profileIds.has(value)) ||
      rowRecordIds.some((value) => recordIds.has(value)) ||
      rowEmails.some((value) => emails.has(value)) ||
      rowDnis.some((value) => dnis.has(value)) ||
      rowNames.some((value) => names.has(value))
    )
  }
}

export function resetStudentAcademicSnapshotData(current = {}, student = {}) {
  const belongsToStudent = createStudentAcademicMatcher(student)
  const removedSubjectEnrollmentIds = new Set(
    asArray(current.enrollments)
      .filter(belongsToStudent)
      .flatMap((row) => [row.id, row.relational_id, row.legacy_snapshot_id])
      .map(normalize)
      .filter(Boolean),
  )
  const removedExamEnrollmentIds = new Set(
    asArray(current.examEnrollments)
      .filter(belongsToStudent)
      .flatMap((row) => [row.id, row.relational_id, row.legacy_snapshot_id])
      .map(normalize)
      .filter(Boolean),
  )
  const gradeBelongsToStudent = (row = {}) => (
    belongsToStudent(row) ||
    removedSubjectEnrollmentIds.has(normalize(row.enrollment_id)) ||
    removedSubjectEnrollmentIds.has(normalize(row.subject_enrollment_id)) ||
    removedExamEnrollmentIds.has(normalize(row.exam_enrollment_id))
  )
  const attendanceBelongsToStudent = (row = {}) => (
    belongsToStudent(row) ||
    removedSubjectEnrollmentIds.has(normalize(row.subject_enrollment_id))
  )

  return {
    ...current,
    estadoAcademico: asArray(current.estadoAcademico).filter((row) => !belongsToStudent(row)),
    academicStatusRows: asArray(current.academicStatusRows).filter((row) => !belongsToStudent(row)),
    enrollments: asArray(current.enrollments).filter((row) => !belongsToStudent(row)),
    grades: asArray(current.grades).filter((row) => !gradeBelongsToStudent(row)),
    examEnrollments: asArray(current.examEnrollments).filter((row) => !belongsToStudent(row)),
    attendanceRecords: asArray(current.attendanceRecords).filter((row) => !attendanceBelongsToStudent(row)),
    subjectAttendanceRecords: asArray(current.subjectAttendanceRecords).filter((row) => !attendanceBelongsToStudent(row)),
    academicStatus: current.academicStatus && belongsToStudent(current.academicStatus)
      ? null
      : current.academicStatus,
  }
}

async function readFunctionError(error) {
  let detail = error?.message || 'No se pudo resetear el estado academico.'

  try {
    if (error?.context && typeof error.context.json === 'function') {
      const body = await error.context.json()
      detail = body?.error ?? body?.message ?? detail
    }
  } catch {
    // El cuerpo puede haber sido consumido por supabase-js.
  }

  return detail
}

export async function resetStudentAcademicRecords({
  institutionId,
  workspaceKey = 'main',
  student,
  currentPassword,
  useRemote,
}) {
  if (!institutionId) throw new Error('No hay una institucion activa.')
  if (!clean(currentPassword)) throw new Error('Ingresa tu contrasena para confirmar el reset.')
  if (!useRemote || !isSupabaseConfigured || !supabase) {
    throw new Error('El reset con contrasena requiere una sesion remota con Supabase.')
  }

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'reset_student_academic_records',
      institution_id: institutionId,
      workspace_key: workspaceKey,
      student: buildStudentAcademicResetIdentity(student),
      current_password: currentPassword,
    },
  })

  if (error) throw new Error(await readFunctionError(error))
  if (data?.error) throw new Error(data.error)

  return data
}
