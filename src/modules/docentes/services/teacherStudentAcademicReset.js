import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'

function clean(value) {
  return String(value ?? '').trim()
}

async function readFunctionError(error) {
  let detail = error?.message || 'No se pudieron reiniciar los registros del alumno.'
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

export async function resetStudentSubjectAcademicRecords({
  institutionId,
  workspaceKey = 'main',
  studentId,
  student = null,
  subjectId,
  programId,
  currentPassword,
}) {
  if (!institutionId || !studentId || !subjectId) {
    throw new Error('Faltan datos para reiniciar los registros del alumno.')
  }
  if (!clean(currentPassword)) {
    throw new Error('Ingresa tu contrasena para confirmar el reinicio.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Esta operacion requiere conexion con Supabase.')
  }

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'teacher_reset_student_subject_academic_records',
      institution_id: institutionId,
      workspace_key: workspaceKey,
      student_id: studentId,
      student,
      subject_id: subjectId,
      program_id: programId ?? '',
      current_password: currentPassword,
    },
  })

  if (error) throw new Error(await readFunctionError(error))
  if (data?.error) throw new Error(data.error)
  return data
}
