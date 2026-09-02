// Date helpers kept small and deterministic.

export const DAY_NAMES_ES = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
]

export function parseIsoDate(value) {
  const text = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null

  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return parseIsoDate(value) ? String(value).trim() : ''
}

export function getDayName(value) {
  const date = value instanceof Date ? value : parseIsoDate(value)
  if (!date) return ''
  return DAY_NAMES_ES[date.getDay()] ?? ''
}

export function compareIsoDates(left, right) {
  return toIsoDate(left).localeCompare(toIsoDate(right))
}

export function buildDateRange(start, end) {
  const startDate = parseIsoDate(start)
  const endDate = parseIsoDate(end)
  if (!startDate || !endDate || startDate > endDate) return []

  const dates = []
  const current = new Date(startDate)
  while (current <= endDate) {
    dates.push(toIsoDate(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}

