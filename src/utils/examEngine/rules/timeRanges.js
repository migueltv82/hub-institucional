function clean(value) {
  return String(value ?? '').trim()
}

function parseTimeToSeconds(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] ?? 0)
  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return hours * 3600 + minutes * 60 + seconds
}

export function doTimeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const firstStart = parseTimeToSeconds(aStart)
  const firstEnd = parseTimeToSeconds(aEnd)
  const secondStart = parseTimeToSeconds(bStart)
  const secondEnd = parseTimeToSeconds(bEnd)
  if ([firstStart, firstEnd, secondStart, secondEnd].some((value) => value === null)) return false
  if (firstStart >= firstEnd || secondStart >= secondEnd) return false
  return firstStart < secondEnd && secondStart < firstEnd
}
