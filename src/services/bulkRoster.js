import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

// I2b: titularidades (hoja docente_materia) y cursadas (alumnos_inscripciones) desde las planillas ya
// cargadas en el workspace. Las RPC staff-only resuelven docente, alumno, carrera y materia en la base y
// devuelven un reporte por fila; nada se borra.

export const BULK_ROSTER_CHUNK_SIZE = 500

const RPC = Object.freeze({
  teachers: 'academic_admin_bulk_assign_teachers',
  students: 'academic_admin_bulk_enroll_students',
})

export const BULK_ROSTER_REASONS = Object.freeze({
  FALTAN_DATOS: 'Faltan el DNI, la carrera o la materia.',
  ROL_INVALIDO: 'Rol no valido. Usar titular, suplente o licencia.',
  CARRERA_NO_ENCONTRADA: 'La carrera no existe en el catalogo de la institucion.',
  CARRERA_AMBIGUA: 'Hay mas de una carrera con ese nombre o codigo.',
  MATERIA_NO_ESTA_EN_EL_PLAN: 'La materia no esta en el plan de esa carrera.',
  DOCENTE_NO_ENCONTRADO: 'No hay un docente con ese DNI en el padron.',
  DOCENTE_AMBIGUO: 'Hay mas de un legajo docente con ese DNI.',
  DOCENTE_SIN_CUENTA: 'El docente todavia no tiene acceso: crealo desde "Crear accesos docentes".',
  ALUMNO_NO_ENCONTRADO: 'No hay un alumno con ese DNI en el padron.',
  ALUMNO_AMBIGUO: 'Hay mas de un legajo con ese DNI.',
  ALUMNO_DE_OTRA_CARRERA: 'El alumno con ese DNI tiene legajo en otra carrera.',
  ALUMNO_SIN_CUENTA: 'El alumno todavia no tiene acceso: crealo desde "Crear accesos".',
  CURSADA_DADA_DE_BAJA: 'La cursada esta dada de baja: no se reactiva desde la planilla.',
})

function clean(value) {
  return String(value ?? '').trim()
}

export function describeBulkRosterReason(reason) {
  return BULK_ROSTER_REASONS[reason] ?? reason
}

export function buildTeacherAssignmentRows(docenteMateria = []) {
  return (Array.isArray(docenteMateria) ? docenteMateria : [])
    .map((row, index) => ({
      fila: String(index + 1),
      dni: clean(row?.dni || row?.dni_docente),
      carrera: clean(row?.carrera || row?.carrera_id),
      materia: clean(row?.materia || row?.materia_codigo || row?.materia_id),
      rol: clean(row?.rol_en_materia || row?.rol),
    }))
    .filter((row) => row.dni || row.materia)
}

export function buildStudentEnrollmentRows(inscripcionesAlumnos = []) {
  return (Array.isArray(inscripcionesAlumnos) ? inscripcionesAlumnos : [])
    .map((row, index) => ({
      fila: String(index + 1),
      dni: clean(row?.dni),
      carrera: clean(row?.carrera || row?.carrera_id),
      materia: clean(row?.materia_codigo || row?.materia || row?.materia_id),
    }))
    .filter((row) => row.dni || row.materia)
}

export function emptyBulkRosterReport() {
  return { procesadas: 0, creadas: 0, actualizadas: 0, sin_cambios: 0, omitidas: 0, rechazadas: 0, problemas: [] }
}

function translateError(error) {
  if (error?.code === '42501') return 'Solo el owner, admin o editor de la institucion puede hacer cargas masivas.'
  if (error?.code === 'PGRST202') return 'Falta actualizar la base de datos para las cargas masivas. Avisale al responsable tecnico.'
  return 'No se pudo completar la carga masiva.'
}

async function runBulk(rpcName, { institutionId, workspaceKey = 'main', rows = [], onProgress }) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Las cargas masivas requieren Supabase configurado.')
  if (!clean(institutionId)) throw new Error('No hay una institucion activa.')
  const report = emptyBulkRosterReport()
  for (let start = 0; start < rows.length; start += BULK_ROSTER_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + BULK_ROSTER_CHUNK_SIZE)
    const { data, error } = await supabase.rpc(rpcName, { p_institution_id: institutionId, p_workspace_key: workspaceKey, p_rows: chunk })
    if (error) {
      const failure = new Error(translateError(error))
      failure.partialReport = report
      throw failure
    }
    for (const key of ['procesadas', 'creadas', 'actualizadas', 'sin_cambios', 'omitidas', 'rechazadas']) report[key] += Number(data?.[key]) || 0
    report.problemas.push(...(Array.isArray(data?.problemas) ? data.problemas : []))
    onProgress?.({ done: Math.min(start + chunk.length, rows.length), total: rows.length })
  }
  return report
}

export function applyTeacherAssignments(options) {
  return runBulk(RPC.teachers, options)
}

export function applyStudentEnrollments(options) {
  return runBulk(RPC.students, options)
}
