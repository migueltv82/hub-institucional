import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

// Panel admin "Mesas y actas": lectura de mesas publicadas, inscriptos para el acta e inscripcion especial.
// Las tres RPC exigen personal de gestion (owner/admin/editor); la base decide.

const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires'

function clean(value) {
  return String(value ?? '').trim()
}

function assertRemote(institutionId) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Las mesas y actas requieren Supabase configurado.')
  if (!clean(institutionId)) throw new Error('No hay una institucion activa.')
}

const ADMIN_ENROLLMENT_ERRORS = {
  EXAM_REGULARITY_REQUIRED: 'El alumno no figura regular en la materia: la ultima condicion cargada por el docente no es regular.',
  EXAM_FINANCIAL_DEBT_BLOCK: 'El alumno adeuda la cuota.',
  BLOCKED_BY_ABSENCE_PENALTY: 'El alumno tiene una mesa castigo por ausencia en esta materia.',
  EXAM_PREREQUISITES_NOT_MET: 'Al alumno le faltan correlativas aprobadas.',
  STUDENT_ACCOUNT_REQUIRED: 'El alumno no tiene cuenta de acceso. Crea su acceso desde Alumnos y volve a intentar.',
  STUDENT_CAREER_PLAN_NOT_FOUND: 'El alumno no esta en el plan de la carrera de esta mesa.',
  EXAM_ENROLLMENT_ALREADY_REGISTERED: 'El alumno ya esta inscripto en esta mesa.',
  EXAM_ADMIN_ENROLLMENT_AFTER_EXAM_DAY: 'La mesa ya paso: no se puede inscribir.',
  EXAM_ADMIN_ENROLLMENT_REASON_REQUIRED: 'Escribi el motivo de la inscripcion especial.',
  EXAM_TABLE_NOT_AVAILABLE: 'La mesa no esta abierta.',
}

function translateError(error, fallback) {
  const message = clean(error?.message)
  const code = Object.keys(ADMIN_ENROLLMENT_ERRORS).find((key) => message.includes(key))
  if (code) return ADMIN_ENROLLMENT_ERRORS[code]
  if (error?.code === '42501') return 'Tu rol no permite gestionar mesas y actas.'
  return fallback
}

export async function fetchExamTablesOverview({ institutionId, workspaceKey = 'main' }) {
  assertRemote(institutionId)
  const { data, error } = await supabase.rpc('get_exam_tables_admin_overview', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
  })
  if (error) throw new Error(translateError(error, 'No se pudieron cargar las mesas publicadas.'))
  return Array.isArray(data) ? data : []
}

export async function fetchExamActaRoster({ institutionId, workspaceKey = 'main', examKey }) {
  assertRemote(institutionId)
  const { data, error } = await supabase.rpc('get_exam_table_roster', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    target_exam_key: clean(examKey),
  })
  if (error) throw new Error(translateError(error, 'No se pudo cargar la lista de inscriptos.'))
  return Array.isArray(data?.alumnos) ? data.alumnos : []
}

export async function enrollStudentAsAdmin({ institutionId, workspaceKey = 'main', examKey, studentRecordId, reason }) {
  assertRemote(institutionId)
  if (!clean(studentRecordId)) throw new Error('Elegi el alumno a inscribir.')
  if (clean(reason).length < 5) throw new Error(ADMIN_ENROLLMENT_ERRORS.EXAM_ADMIN_ENROLLMENT_REASON_REQUIRED)
  const { data, error } = await supabase.rpc('admin_enroll_student_in_exam_table', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    target_exam_key: clean(examKey),
    target_student_record_id: clean(studentRecordId),
    target_reason: clean(reason),
  })
  if (error) throw new Error(translateError(error, 'No se pudo inscribir al alumno.'))
  return data
}

export function getArgentinaDateKey(value) {
  const timestamp = Date.parse(clean(value))
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: ARGENTINA_TIME_ZONE })
}

export function formatArgentinaTime(value) {
  const timestamp = Date.parse(clean(value))
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp).toLocaleTimeString('es-AR', { timeZone: ARGENTINA_TIME_ZONE, hour: '2-digit', minute: '2-digit' })
}

// Solo las mesas con inscriptos generan acta: asi no se imprime papel en blanco.
export function canPrintActa(mesa) {
  return Number(mesa?.inscriptos) > 0
}

// Carrera > anio > mesas por horario, para recorrer el dia mesa por mesa.
export function groupMesasByCareerAndYear(mesas = []) {
  const careers = new Map()
  ;(Array.isArray(mesas) ? mesas : []).forEach((mesa) => {
    const career = clean(mesa?.carrera) || 'Sin carrera'
    const year = Number(mesa?.anio) || 0
    if (!careers.has(career)) careers.set(career, new Map())
    const years = careers.get(career)
    if (!years.has(year)) years.set(year, [])
    years.get(year).push(mesa)
  })

  return [...careers.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .map(([carrera, years]) => ({
      carrera,
      anios: [...years.entries()]
        .sort(([a], [b]) => (a || 99) - (b || 99))
        .map(([anio, items]) => ({
          anio,
          mesas: [...items].sort((left, right) => (
            clean(left.inicio).localeCompare(clean(right.inicio)) || clean(left.materia).localeCompare(clean(right.materia), 'es')
          )),
        })),
    }))
}
