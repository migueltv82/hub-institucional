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
  CONFLICTO_CONCURRENTE: 'Otra carga cambio esta fila al mismo tiempo: volve a aplicar la planilla.',
  ASIGNACION_NO_VIGENTE: 'La planilla la marca como renuncia, baja o reemplazado: no se asigna. Si ya estaba asignado, darlo de baja desde la ficha del docente.',
  VIGENCIA_VENCIDA: 'La vigencia de la asignacion ya termino: no se asigna.',
  VIGENCIA_FUTURA: 'La vigencia de la asignacion todavia no empezo: se aplica cuando arranque.',
  ESTADO_ASIGNACION_INVALIDO: 'Estado de asignacion no valido. Usar ACTIVO, LICENCIA, RENUNCIA, BAJA o REEMPLAZADO.',
  VIGENCIA_INVALIDA: 'La vigencia no es una fecha valida (o termina antes de empezar): corregila en la planilla.',
})

function clean(value) {
  return String(value ?? '').trim()
}

export function describeBulkRosterReason(reason) {
  return BULK_ROSTER_REASONS[reason] ?? reason
}

// Estado de la asignacion en la hoja docente_materia. Solo ACTIVO y LICENCIA se aplican: RENUNCIA, BAJA y
// REEMPLAZADO se omiten (antes entraban como titularidad activa), igual que una vigencia que ya vencio o
// todavia no empezo. La RPC no recibe estado ni vigencia: el filtro vive aca.
const ASSIGNMENT_NOT_CURRENT_STATES = new Set(['RENUNCIA', 'BAJA', 'REEMPLAZADO'])
const ASSIGNMENT_KNOWN_STATES = new Set(['', 'ACTIVO', 'ACTIVA', 'ACTIVE', 'LICENCIA', ...ASSIGNMENT_NOT_CURRENT_STATES])

const pad2 = (value) => String(value).padStart(2, '0')
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const DAY_MS = 24 * 60 * 60 * 1000

function calendarKey(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day))
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return valid && year >= 1900 && year <= 2200 ? `${year}-${pad2(month)}-${pad2(day)}` : null
}

// Vigencia de una celda de la planilla: '' si esta vacia, 'YYYY-MM-DD' si es una fecha valida y null si
// tiene algo que no es una fecha. AUD.I2b P1: ExcelJS entrega las celdas de fecha como Date (en UTC, porque
// Excel no guarda zona) y antes eso se leia como "sin limite"; un valor invalido tampoco puede pasar como
// vacio. Tambien acepta el numero de serie de Excel, texto ISO (con o sin hora) y DD/MM/AAAA.
export function parseSheetDate(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : calendarKey(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1) return null
    const date = new Date(EXCEL_EPOCH_UTC + Math.floor(value) * DAY_MS)
    return calendarKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }
  const text = clean(value)
  if (!text) return ''
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(text)
  if (iso) return calendarKey(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (local) return calendarKey(Number(local[3]), Number(local[2]), Number(local[1]))
  return null
}

function todayKey(today) {
  const date = today instanceof Date ? today : new Date()
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function assignmentSkipReason(row, state, today) {
  if (!ASSIGNMENT_KNOWN_STATES.has(state)) return 'ESTADO_ASIGNACION_INVALIDO'
  if (ASSIGNMENT_NOT_CURRENT_STATES.has(state)) return 'ASIGNACION_NO_VIGENTE'
  const from = parseSheetDate(row?.vigencia_desde)
  const until = parseSheetDate(row?.vigencia_hasta)
  if (from === null || until === null) return 'VIGENCIA_INVALIDA'
  if (from && until && until < from) return 'VIGENCIA_INVALIDA'
  if (until && until < today) return 'VIGENCIA_VENCIDA'
  if (from && from > today) return 'VIGENCIA_FUTURA'
  return ''
}

export function planTeacherAssignmentRows(docenteMateria = [], { today } = {}) {
  const day = todayKey(today)
  const rows = []
  const skipped = []
  ;(Array.isArray(docenteMateria) ? docenteMateria : []).forEach((row, index) => {
    const item = {
      fila: String(index + 1),
      dni: clean(row?.dni || row?.dni_docente),
      carrera: clean(row?.carrera || row?.carrera_id),
      materia: clean(row?.materia || row?.materia_codigo || row?.materia_id),
      rol: clean(row?.rol_en_materia || row?.rol),
    }
    if (!item.dni && !item.materia) return
    const state = clean(row?.estado_asignacion || row?.estado).toUpperCase()
    const reason = assignmentSkipReason(row, state, day)
    if (reason) {
      skipped.push({ fila: item.fila, estado: ['ESTADO_ASIGNACION_INVALIDO', 'VIGENCIA_INVALIDA'].includes(reason) ? 'rechazada' : 'omitida', motivo: reason, dni: item.dni, materia: item.materia })
      return
    }
    rows.push(state === 'LICENCIA' ? { ...item, rol: 'licencia' } : item)
  })
  return { rows, skipped }
}

export function buildTeacherAssignmentRows(docenteMateria = [], options) {
  return planTeacherAssignmentRows(docenteMateria, options).rows
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

// En Prod el gateway de Storage serializa las escrituras de un workspace con un lock no bloqueante: si otra
// carga (u otro guardado) esta en curso, la RPC falla entera con 55P03 sin escribir nada. Cada lote es atomico
// e idempotente, asi que reintentarlo es seguro (AUD.I2b P2).
export const BULK_ROSTER_BUSY_ATTEMPTS = 6

function isWorkspaceBusy(error) {
  return error?.code === '55P03' || String(error?.message ?? '').includes('SOURCE_FILE_WORKSPACE_BUSY')
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function translateError(error) {
  if (isWorkspaceBusy(error)) return 'Hay otra carga o guardado en curso en esta institucion. Espera unos segundos y volve a aplicar.'
  if (error?.code === '42501') return 'Solo el owner, admin o editor de la institucion puede hacer cargas masivas.'
  if (error?.code === 'PGRST202') return 'Falta actualizar la base de datos para las cargas masivas. Avisale al responsable tecnico.'
  return 'No se pudo completar la carga masiva.'
}

async function runBulk(rpcName, { institutionId, workspaceKey = 'main', rows = [], skipped = [], onProgress, busyRetryDelayMs = 500 }) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Las cargas masivas requieren Supabase configurado.')
  if (!clean(institutionId)) throw new Error('No hay una institucion activa.')
  const report = emptyBulkRosterReport()
  // Filas que se descartaron antes de llamar a la base (estado o vigencia): cuentan y se explican igual.
  for (const problem of skipped) {
    report.procesadas += 1
    report[problem.estado === 'rechazada' ? 'rechazadas' : 'omitidas'] += 1
    report.problemas.push(problem)
  }
  for (let start = 0; start < rows.length; start += BULK_ROSTER_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + BULK_ROSTER_CHUNK_SIZE)
    let { data, error } = await supabase.rpc(rpcName, { p_institution_id: institutionId, p_workspace_key: workspaceKey, p_rows: chunk })
    for (let attempt = 1; isWorkspaceBusy(error) && attempt < BULK_ROSTER_BUSY_ATTEMPTS; attempt += 1) {
      await wait(busyRetryDelayMs * attempt)
      ;({ data, error } = await supabase.rpc(rpcName, { p_institution_id: institutionId, p_workspace_key: workspaceKey, p_rows: chunk }))
    }
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
