import { teacherIsAvailableOnDate } from '../../rules/availability.js'

// Same raw fields rules/availability.js reads to decide attendance. If none
// of them carry any value, teacherIsAvailableOnDate would always return
// false for lack of data (not because the teacher is actually unavailable),
// so that case must fall back to the blind round-robin instead of dropping
// the subject without a date.
export function teacherHasAnyAvailabilityData(teacherRow = {}) {
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

  return rawDays.some((entry) => entry !== undefined && entry !== null && String(entry).trim() !== '')
}

function buildRoundRobinFallback(callDates, subjectIndex, callIndex) {
  const dateIndex = callDates.length ? (subjectIndex + callIndex) % callDates.length : -1
  return { fecha: callDates[dateIndex], dateIndex }
}

// Picks the draft date for one mesa. Prefers a date the titular actually
// attends, and among those the least loaded one so repeated calls for the
// same titular don't all stack on their first available day. Falls back to
// the historical round-robin index when there is no usable availability
// signal for the titular, so institutions without horarios loaded keep
// getting a date exactly like before.
export function pickDraftDateForSubject({
  callDates = [],
  titular = null,
  dateLoad = new Map(),
  subjectIndex = 0,
  callIndex = 0,
} = {}) {
  const fallback = buildRoundRobinFallback(callDates, subjectIndex, callIndex)
  if (!callDates.length || !titular || !teacherHasAnyAvailabilityData(titular)) return fallback

  const availableDates = callDates
    .map((fecha, index) => ({ fecha, index }))
    .filter(({ fecha }) => teacherIsAvailableOnDate(titular, fecha.fecha))

  if (!availableDates.length) return fallback

  const [chosen] = [...availableDates].sort((left, right) => {
    const loadDiff = (dateLoad.get(left.fecha.fecha) ?? 0) - (dateLoad.get(right.fecha.fecha) ?? 0)
    return loadDiff !== 0 ? loadDiff : left.index - right.index
  })

  return { fecha: chosen.fecha, dateIndex: chosen.index }
}
