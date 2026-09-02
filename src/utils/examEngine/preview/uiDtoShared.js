export const CRITICAL_SEVERITIES = new Set(['critical', 'error', 'fatal'])

export const UI_ROOT_REQUIRED_FIELDS = [
  'success',
  'status',
  'uiSummary',
  'uiTables',
  'uiAlerts',
  'uiTeacherSummary',
  'uiCareerSummary',
  'uiCallSummary',
  'uiPendingReview',
  'uiRecommendations',
  'audit',
]

export const UI_SUMMARY_REQUIRED_FIELDS = [
  'totalPlanned',
  'totalUnassigned',
  'totalMesas',
  'totalCriticalErrors',
  'totalWarnings',
  'totalPendingManualReview',
  'totalCompactadas',
  'cantidadLlamados',
  'tipoPeriodo',
  'compactMode',
  'compactacionEjecutada',
  'exportValid',
]

export const PLANNED_ROW_REQUIRED_FIELDS = [
  'id',
  'materia',
  'carrera',
  'llamado',
  'estado',
  'displayStatus',
  'titular',
  'vocales',
  'alertLevel',
  'warningsCount',
  'errorsCount',
  'reviewRequired',
]

export const UNASSIGNED_ROW_REQUIRED_FIELDS = [
  'id',
  'materia',
  'carrera',
  'llamado',
  'estado',
  'reason',
  'alertLevel',
  'warningsCount',
  'errorsCount',
  'reviewRequired',
]

export function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function clean(value) {
  return String(value ?? '').trim()
}

export function cloneJson(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value
      .map((entry) => cloneJson(entry, seen))
      .filter((entry) => entry !== undefined)
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'raw')
      .map(([key, entry]) => [key, cloneJson(entry, seen)])
      .filter(([, entry]) => entry !== undefined),
  )
}

export function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function hasOwn(object, key) {
  return Boolean(object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key))
}

export function getSeverity(issue = {}, fallback = 'warning') {
  return clean(issue.severity || fallback).toLowerCase() || fallback
}

export function isCritical(issue = {}) {
  return CRITICAL_SEVERITIES.has(getSeverity(issue))
}

export function getMesaId(value = {}) {
  return clean(value.mesaId ?? value.id ?? value.mesa)
}

export function getMateria(value = {}) {
  return clean(value.materia ?? value.nombreMateria ?? value.subjectName ?? value.materiaId)
}

export function getCarrera(value = {}) {
  return clean(value.carrera ?? value.nombreCarrera ?? value.careerName ?? value.carreraId)
}

export function displayDate(value) {
  const date = clean(value)
  return date || 'Sin fecha'
}

export function displayStatus(value, fallback = 'Pendiente') {
  const status = clean(value) || fallback
  return status
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

export function hasUiFecha(row = {}) {
  return Boolean(clean(row.fecha) || (clean(row.displayDate) && clean(row.displayDate) !== 'Sin fecha'))
}

