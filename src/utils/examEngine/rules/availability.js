import { getDayName } from '../normalize/dates.js'
import { normalizeTeacherName } from '../normalize/teachers.js'
import { normalizeText } from '../normalize/subjects.js'

// Availability rules decide whether a teacher can work on a date.

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function clean(value) {
  return String(value ?? '').trim()
}

// An availability entry can identify a date either by weekday name
// ("lunes") or by an explicit ISO date ("2026-08-10"). Both forms must be
// checked: relying on weekday alone silently ignores fechasDisponibles
// entries, which are always explicit dates.
function entryMatchesDate(entry, fechaIso, examDay) {
  if (entry && typeof entry === 'object') {
    const entryFecha = clean(entry.fecha ?? entry.fechaIso ?? entry.date)
    if (entryFecha) return entryFecha === fechaIso
    const entryDay = normalizeText(entry.diaSemana ?? entry.dia ?? entry.day)
    return Boolean(entryDay && examDay && entryDay === examDay)
  }

  const text = clean(entry)
  if (!text) return false
  if (ISO_DATE_PATTERN.test(text)) return text === fechaIso
  return Boolean(examDay && normalizeText(text) === examDay)
}

export function teacherHasAttendanceOnDate(teacherRow = {}, fechaIso = '') {
  const examDay = getDayName(fechaIso)
  const cleanFechaIso = clean(fechaIso)
  const rawDays = [
    teacherRow.dia,
    teacherRow.day,
    teacherRow.diasAsistencia,
    teacherRow.diasDisponibles,
    teacherRow.diasLaborales,
    teacherRow.disponibilidad,
    teacherRow.fechasDisponibles,
    teacherRow.availability,
  ].flat()

  return rawDays.some((entry) => entryMatchesDate(entry, cleanFechaIso, examDay))
}

export function teacherIsBlockedOnDate(teacherRow = {}, fechaIso = '') {
  const bloqueos = Array.isArray(teacherRow.bloqueos) ? teacherRow.bloqueos : []
  return bloqueos.map(String).includes(fechaIso)
}

export function teacherIsAvailableOnDate(teacherRow = {}, fechaIso = '') {
  return teacherHasAttendanceOnDate(teacherRow, fechaIso) && !teacherIsBlockedOnDate(teacherRow, fechaIso)
}

export function buildAvailabilityIndex(teacherRows = []) {
  return teacherRows.reduce((map, row) => {
    const key = normalizeTeacherName(row)
    if (!key) return map

    const rows = map.get(key) ?? []
    rows.push(row)
    map.set(key, rows)
    return map
  }, new Map())
}
