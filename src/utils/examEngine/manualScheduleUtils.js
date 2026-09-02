import { sonMateriasAfines } from '../../components/generadorCronograma/examGenerationOptionsRules.js'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']

function clean(value) {
  return String(value ?? '').trim()
}

function normalize(value) {
  return clean(value).toLowerCase().normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '')
}

function parseDate(value) {
  const text = clean(value)
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : text
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const date = new Date(`${iso}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function convertirFechaDisplayAIso(value) {
  const date = parseDate(value)
  return date ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') : ''
}

export function convertirFechaIsoADisplay(value) {
  const date = parseDate(value)
  return date ? [String(date.getDate()).padStart(2, '0'), String(date.getMonth() + 1).padStart(2, '0'), date.getFullYear()].join('/') : ''
}

export function obtenerDiaDesdeFechaIso(value) {
  const date = parseDate(value)
  return date ? DAY_NAMES[date.getDay()] : ''
}

export function calcularLimiteMitadMasUno(value) {
  const days = Number(value)
  return Number.isFinite(days) && days > 0 ? Math.floor(days / 2) + 1 : 0
}

export function tieneConflictoTitularVocalMismoDia(docenteId, fecha, rolSolicitado, asignaciones = []) {
  const incompatibleRole = normalize(rolSolicitado) === 'titular' ? 'vocal' : 'titular'
  return asignaciones.some((assignment) => (
    normalize(assignment.docenteId ?? assignment.profesor) === normalize(docenteId) &&
    clean(assignment.fecha ?? assignment.fechaIso) === clean(fecha) &&
    normalize(assignment.rol) === incompatibleRole
  ))
}

export { sonMateriasAfines }
