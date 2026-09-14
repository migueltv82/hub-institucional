import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'

function clean(value) {
  return String(value ?? '').trim()
}

async function readFunctionError(error) {
  let detail = error?.message || 'No se pudo eliminar al alumno de la materia.'
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

export async function removeStudentFromTeacherSubject({
  institutionId,
  workspaceKey = 'main',
  studentId,
  student = null,
  subjectId,
  programId,
  currentPassword,
}) {
  if (!institutionId || !studentId || !subjectId) {
    throw new Error('Faltan datos para eliminar al alumno de la materia.')
  }
  if (!clean(currentPassword)) {
    throw new Error('Ingresá tu contraseña para confirmar la eliminación.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Esta operación requiere conexión con Supabase.')
  }

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'teacher_remove_student_subject_records',
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
