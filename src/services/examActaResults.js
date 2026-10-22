import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

// F1a: carga y cierre del acta de examen final por la RPC exam_save_acta_results. La base decide quien
// carga (titular de la mesa o personal de gestion) y valida todo; aca se espeja el calculo para mostrarlo.

export const EXAM_APPROVAL_MIN_GRADE = 4
const GRADE_PATTERN = /^\d{1,2}([.,]\d{1,2})?$/

const ACTA_ERRORS = {
  EXAM_NOT_TAKEN_YET: 'El acta se carga desde el dia del examen.',
  EXAM_ACTA_CLOSED: 'El acta ya esta cerrada. Solo secretaria puede corregirla.',
  EXAM_ACTA_CORRECTION_REASON_REQUIRED: 'Para corregir un acta cerrada hay que escribir el motivo.',
  EXAM_ACTA_INCOMPLETE: 'Para cerrar el acta, todos los inscriptos tienen que tener nota o ausente.',
  EXAM_ACTA_ABSENT_WITH_GRADE: 'Un alumno ausente no puede tener nota.',
  EXAM_ACTA_GRADE_INVALID: 'Las notas tienen que ser numeros de 0 a 10.',
  EXAM_ACTA_ENROLLMENT_NOT_FOUND: 'Un alumno de la lista ya no esta inscripto. Recarga la mesa.',
  EXAM_TABLE_NOT_AVAILABLE: 'La mesa fue cancelada.',
}

function clean(value) {
  return String(value ?? '').trim()
}

function toGrade(value) {
  const text = clean(value).replace(',', '.')
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

export function isValidGradeText(value) {
  const text = clean(value)
  if (!text) return true
  return GRADE_PATTERN.test(text) && Number(text.replace(',', '.')) <= 10
}

// Borrador editable a partir del roster: una fila por inscripto.
export function buildActaDraft(alumnos = []) {
  return (Array.isArray(alumnos) ? alumnos : []).map((alumno) => ({
    inscripcion_id: clean(alumno.inscripcion_id),
    ausente: alumno.resultado === 'absent',
    escrito: alumno.escrito === null || alumno.escrito === undefined ? '' : String(alumno.escrito),
    oral: alumno.oral === null || alumno.oral === undefined ? '' : String(alumno.oral),
    nota: alumno.nota === null || alumno.nota === undefined ? '' : String(alumno.nota),
  }))
}

// Mismo calculo que la RPC: ausente; nota final o promedio de escrito y oral; aprobado con 4 o mas.
export function previewActaRow(row = {}) {
  if (row.ausente) return { final: null, result: 'absent' }
  const written = toGrade(row.escrito)
  const oral = toGrade(row.oral)
  let final = toGrade(row.nota)
  if (final === null && (written !== null || oral !== null)) {
    const values = [written, oral].filter((value) => value !== null)
    final = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
  }
  if (final === null) return { final: null, result: '' }
  return { final, result: final >= EXAM_APPROVAL_MIN_GRADE ? 'approved' : 'failed' }
}

export function validateActaRow(row = {}) {
  if (row.ausente && (clean(row.escrito) || clean(row.oral) || clean(row.nota))) return EXAM_ACTA_MESSAGES.absentWithGrade
  if (![row.escrito, row.oral, row.nota].every(isValidGradeText)) return EXAM_ACTA_MESSAGES.invalidGrade
  return ''
}

export const EXAM_ACTA_MESSAGES = Object.freeze({
  absentWithGrade: ACTA_ERRORS.EXAM_ACTA_ABSENT_WITH_GRADE,
  invalidGrade: ACTA_ERRORS.EXAM_ACTA_GRADE_INVALID,
})

export function summarizeActa(rows = []) {
  const summary = { total: 0, aprobados: 0, desaprobados: 0, ausentes: 0, sinCargar: 0 }
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    summary.total += 1
    const { result } = previewActaRow(row)
    if (result === 'approved') summary.aprobados += 1
    else if (result === 'failed') summary.desaprobados += 1
    else if (result === 'absent') summary.ausentes += 1
    else summary.sinCargar += 1
  })
  return summary
}

export const EXAM_RESULT_LABELS = Object.freeze({ approved: 'Aprobado', failed: 'Desaprobado', absent: 'Ausente' })

function translateError(error) {
  const message = clean(error?.message)
  const code = Object.keys(ACTA_ERRORS).find((key) => message.includes(key))
  if (code) return ACTA_ERRORS[code]
  if (error?.code === '42501') return 'Solo el titular de la mesa o secretaria pueden cargar el acta.'
  if (error?.code === 'PGRST202') return 'Falta actualizar la base de datos para cargar actas. Avisale al responsable tecnico.'
  return 'No se pudo guardar el acta.'
}

export async function saveExamActaResults({ institutionId, workspaceKey = 'main', examKey, rows = [], close = false, reason = '' }) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Cargar el acta requiere Supabase configurado.')
  if (!clean(institutionId) || !clean(examKey)) throw new Error('Falta identificar la mesa.')
  const invalid = (Array.isArray(rows) ? rows : []).map(validateActaRow).find(Boolean)
  if (invalid) throw new Error(invalid)
  const payload = (Array.isArray(rows) ? rows : [])
    .filter((row) => row.ausente || clean(row.escrito) || clean(row.oral) || clean(row.nota))
    .map((row) => ({
      inscripcion_id: clean(row.inscripcion_id),
      ausente: Boolean(row.ausente),
      escrito: clean(row.escrito),
      oral: clean(row.oral),
      nota: clean(row.nota),
    }))
  const { data, error } = await supabase.rpc('exam_save_acta_results', {
    target_institution_id: institutionId,
    target_workspace_key: workspaceKey,
    target_exam_key: clean(examKey),
    target_results: payload,
    target_close: Boolean(close),
    target_reason: clean(reason) || null,
  })
  if (error) throw new Error(translateError(error))
  return { guardados: Number(data?.guardados) || 0, actaCerrada: Boolean(data?.acta_cerrada) }
}
