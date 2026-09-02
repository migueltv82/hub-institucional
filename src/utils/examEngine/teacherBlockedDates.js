import { doTimeRangesOverlap } from './rules/timeRanges.js'

export const TEACHER_BLOCK_SCOPE = Object.freeze({
  FULL_DAY: 'FULL_DAY',
  TIME_RANGE: 'TIME_RANGE',
})

export const TEACHER_BLOCK_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
})

export function createEmptyTeacherBlockedDateDraft() {
  return {
    docenteNombre: '',
    date: '',
    scope: TEACHER_BLOCK_SCOPE.FULL_DAY,
    startTime: '',
    endTime: '',
    reason: '',
    status: TEACHER_BLOCK_STATUS.ACTIVE,
  }
}

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeToken(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '')
}

export function normalizeTeacherExamIdentity(value) {
  const raw = clean(value)
  if (raw.startsWith('teacher-')) return raw
  const token = normalizeToken(raw)
  return token ? `teacher-${token}` : ''
}

export function normalizeTeacherBlockedDate(value) {
  const raw = clean(value)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  const localMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!localMatch) return ''
  return `${localMatch[3]}-${localMatch[2].padStart(2, '0')}-${localMatch[1].padStart(2, '0')}`
}

export function validateTeacherBlockedDateDraft(draft = {}) {
  const docenteNombre = readTeacherName(draft)
  const docenteId = normalizeTeacherExamIdentity(readTeacherId(draft))
  const date = normalizeTeacherBlockedDate(draft.date || draft.fecha)
  const requestedScope = clean(draft.scope).toUpperCase()
  const startTime = clean(draft.startTime || draft.horaDesde || draft.hora_desde)
  const endTime = clean(draft.endTime || draft.horaHasta || draft.hora_hasta)
  const scope = requestedScope === TEACHER_BLOCK_SCOPE.TIME_RANGE
    ? TEACHER_BLOCK_SCOPE.TIME_RANGE
    : TEACHER_BLOCK_SCOPE.FULL_DAY

  if (!docenteId || !docenteNombre) return { ok: false, error: 'Selecciona un docente.' }
  if (!date) return { ok: false, error: 'Selecciona una fecha valida.' }
  if (scope === TEACHER_BLOCK_SCOPE.TIME_RANGE && !doTimeRangesOverlap(startTime, endTime, startTime, endTime)) {
    return { ok: false, error: 'La franja bloqueada debe tener hora desde y hasta validas.' }
  }

  return {
    ok: true,
    value: {
      docenteId,
      docenteNombre,
      date,
      startTime: scope === TEACHER_BLOCK_SCOPE.TIME_RANGE ? startTime : '',
      endTime: scope === TEACHER_BLOCK_SCOPE.TIME_RANGE ? endTime : '',
      scope,
      reason: clean(draft.reason || draft.motivo || draft.observaciones),
      source: 'manual_admin',
      status: clean(draft.status || TEACHER_BLOCK_STATUS.ACTIVE).toUpperCase() === TEACHER_BLOCK_STATUS.INACTIVE
        ? TEACHER_BLOCK_STATUS.INACTIVE
        : TEACHER_BLOCK_STATUS.ACTIVE,
    },
  }
}

function readTeacherName(record = {}) {
  return clean(
    record.docenteNombre || record.docente || record.profesor || record.teacherName
    || record.teacher_display_name || record.displayName || record.nombre,
  )
}

function readTeacherId(record = {}) {
  return clean(
    record.docenteId || record.docente_id || record.teacherId || record.teacher_id
    || record.teacher_record_id || record.dni || readTeacherName(record),
  )
}

function normalizeRecord(record = {}, index = 0) {
  const startTime = clean(record.startTime || record.horaDesde || record.hora_desde || record.inicio)
  const endTime = clean(record.endTime || record.horaHasta || record.hora_hasta || record.fin)
  const requestedScope = clean(record.scope).toUpperCase()
  const scope = requestedScope === TEACHER_BLOCK_SCOPE.TIME_RANGE && startTime && endTime
    ? TEACHER_BLOCK_SCOPE.TIME_RANGE
    : TEACHER_BLOCK_SCOPE.FULL_DAY

  return {
    id: clean(record.id) || `teacher-block-${index}`,
    docenteId: normalizeTeacherExamIdentity(readTeacherId(record)),
    docenteNombre: readTeacherName(record),
    date: normalizeTeacherBlockedDate(record.date || record.fecha),
    startTime: scope === TEACHER_BLOCK_SCOPE.TIME_RANGE ? startTime : '',
    endTime: scope === TEACHER_BLOCK_SCOPE.TIME_RANGE ? endTime : '',
    scope,
    status: clean(record.status || record.estado || TEACHER_BLOCK_STATUS.ACTIVE).toUpperCase(),
  }
}

export function buildTeacherBlockedDatesByTeacher({ records = [], docentes = [] } = {}) {
  const canonicalByAlias = new Map()
  asArray(docentes).forEach((docente) => {
    const canonicalId = normalizeTeacherExamIdentity(docente?.id || docente?.docenteId || docente?.nombre)
    if (!canonicalId) return
    canonicalByAlias.set(canonicalId, canonicalId)
    const nameAlias = normalizeTeacherExamIdentity(docente?.nombre || docente?.docenteNombre)
    if (nameAlias) canonicalByAlias.set(nameAlias, canonicalId)
  })

  return asArray(records).reduce((index, record, recordIndex) => {
    const normalized = normalizeRecord(record, recordIndex)
    if (
      normalized.status !== TEACHER_BLOCK_STATUS.ACTIVE
      || !normalized.docenteId
      || !normalized.date
    ) return index

    const nameAlias = normalizeTeacherExamIdentity(normalized.docenteNombre)
    const canonicalId = canonicalByAlias.get(normalized.docenteId)
      || canonicalByAlias.get(nameAlias)
      || normalized.docenteId
    const rows = index[canonicalId] ?? []
    index[canonicalId] = [...rows, { ...normalized, docenteId: canonicalId }]
    return index
  }, {})
}

export function isTeacherBlockedOnDate({
  blockedDatesByTeacher = {},
  teacherId,
  teacherName,
  date,
  startTime,
  endTime,
} = {}) {
  const normalizedDate = normalizeTeacherBlockedDate(date)
  const keys = [...new Set([
    normalizeTeacherExamIdentity(teacherId),
    normalizeTeacherExamIdentity(teacherName),
  ].filter(Boolean))]
  const records = keys.flatMap((key) => asArray(blockedDatesByTeacher?.[key]))
  const match = records.find((record) => {
    if (record.date !== normalizedDate) return false
    if (record.scope === TEACHER_BLOCK_SCOPE.FULL_DAY) return true
    if (!clean(startTime) || !clean(endTime)) return true
    return doTimeRangesOverlap(record.startTime, record.endTime, startTime, endTime)
  })

  return {
    blocked: Boolean(match),
    code: match ? 'TEACHER_BLOCKED_DATE' : '',
    recordId: match?.id ?? '',
    scope: match?.scope ?? '',
  }
}
