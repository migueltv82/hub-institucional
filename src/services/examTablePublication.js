import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

// EX.1: al publicar el cronograma final, crea o actualiza las mesas en exam_tables para que el
// portal alumno las muestre y la inscripcion (upsert_exam_enrollment_from_portal) las acepte.
// La regla y los permisos viven en la RPC publish_exam_tables_from_schedule (08_exam_tables.sql).
const MESA_FIELDS = ['id', 'materia', 'codigo', 'carrera', 'fechaIso', 'fechaSugerida', 'inicio', 'fin', 'aula', 'exam_call', 'llamado', 'exam_type', 'inscription_mode', 'tribunal_dnis']

export function buildExamPublicationPayload(cronograma = []) {
  return (Array.isArray(cronograma) ? cronograma : [])
    .filter((mesa) => mesa && typeof mesa === 'object')
    .map((mesa) => Object.fromEntries(MESA_FIELDS
      .map((field) => [field, Array.isArray(mesa[field]) ? mesa[field].join(',') : mesa[field]])
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      .map(([field, value]) => [field, String(value).trim()])))
}

export async function publishExamTables({ institutionId, workspaceKey = 'main', cronograma }) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Publicar mesas requiere Supabase configurado.')
  if (!institutionId) throw new Error('No hay una institucion activa para publicar las mesas.')

  const { data, error } = await supabase.rpc('publish_exam_tables_from_schedule', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    target_mesas: buildExamPublicationPayload(cronograma),
  })
  if (error) {
    if (error.code === '42501') throw new Error('Tu rol no permite publicar mesas para los alumnos.')
    throw new Error(`No se pudieron publicar las mesas para los alumnos. ${error.message}`)
  }
  return {
    publicadas: Number(data?.publicadas ?? 0),
    nuevas: Number(data?.nuevas ?? 0),
    actualizadas: Number(data?.actualizadas ?? 0),
    canceladas: Number(data?.canceladas ?? 0),
    omitidas: Array.isArray(data?.omitidas) ? data.omitidas : [],
    conservadas: Array.isArray(data?.conservadas_con_inscriptos) ? data.conservadas_con_inscriptos : [],
  }
}

export function describeExamPublication(result) {
  return [
    `${result.publicadas} mesas abiertas para inscripcion (${result.nuevas} nuevas, ${result.actualizadas} actualizadas).`,
    result.canceladas ? `${result.canceladas} mesas que ya no estan en el cronograma quedaron canceladas.` : '',
    ...result.omitidas.map((item) => `No se publico ${item.id || 'una mesa'}: ${item.motivo}`),
    ...result.conservadas.map((item) => `Se conserva ${item.id}: ${item.motivo}`),
  ].filter(Boolean)
}
