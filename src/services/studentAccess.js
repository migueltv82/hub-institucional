import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

function normalizeStudentForAccess(student) {
  return {
    email: student.email,
    nombre: student.nombre,
    apellido: student.apellido,
    full_name: student.full_name,
    carrera: student.carrera,
    dni: student.dni,
    legajo: student.legajo,
  }
}

export async function provisionStudentAccess({ institutionId, students, useRemote }) {
  if (!institutionId) {
    throw new Error('No hay una institucion activa para crear accesos de alumnos.')
  }

  if (!Array.isArray(students) || students.length === 0) {
    throw new Error('Carga primero el padron de alumnos antes de crear accesos.')
  }

  if (!useRemote || !isSupabaseConfigured || !supabase) {
    throw new Error('La creacion de accesos requiere una sesion remota con Supabase configurado.')
  }

  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action: 'bulk_create_students',
      institution_id: institutionId,
      students: students.map(normalizeStudentForAccess),
    },
  })

  if (error) {
    let detail = error.message

    try {
      if (error.context && typeof error.context.json === 'function') {
        const errorBody = await error.context.json()
        detail = errorBody?.error ?? errorBody?.message ?? detail
      }
    } catch {
      // Supabase puede no permitir leer el body dos veces.
    }

    throw new Error(`No se pudieron crear los accesos de alumnos. ${detail}`)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}
