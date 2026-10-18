import { isSupabaseConfigured, supabase } from '../../../lib/supabase.js'

function clean(value) {
  return String(value ?? '').trim()
}

function getRosterErrorMessage(error) {
  if (error?.code === '42501') return 'Solo el titular de la mesa puede ver los inscriptos.'
  if (error?.code === 'P0002' || clean(error?.message).includes('EXAM_TABLE_NOT_FOUND')) {
    return 'La mesa todavia no esta publicada para inscripcion.'
  }
  if (error?.code === 'PGRST202') return 'La base todavia no tiene habilitada la lista de inscriptos.'
  return 'No se pudo cargar la lista de inscriptos.'
}

// Inscriptos de una mesa publicada. La RPC get_exam_table_roster decide quien puede verlos:
// el titular de la mesa (DNI publicado o asignacion titular de la materia) y el personal de gestion.
export async function fetchExamTableRoster({ institutionId, workspaceKey = 'main', examKey }) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('La lista de inscriptos requiere Supabase configurado.')
  }
  if (!clean(institutionId) || !clean(examKey)) {
    throw new Error('Falta identificar la mesa.')
  }

  const { data, error } = await supabase.rpc('get_exam_table_roster', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    target_exam_key: clean(examKey),
  })

  if (error) throw new Error(getRosterErrorMessage(error))

  return {
    estado: clean(data?.estado),
    alumnos: Array.isArray(data?.alumnos) ? data.alumnos : [],
  }
}
