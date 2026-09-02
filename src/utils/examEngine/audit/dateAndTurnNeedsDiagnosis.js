import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { buildExamEngineEfficiencySummary } from './efficiencySummary.js'
import {
  classifyDateFailure,
  createExtendedDatesInput,
} from './planningFailureDiagnosis.js'

const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
]

const WEEK_DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']

const DAY_ALIASES = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
  dom: 'domingo',
  domingo: 'domingo',
  sun: 'domingo',
  sunday: 'domingo',
  lun: 'lunes',
  lunes: 'lunes',
  mon: 'lunes',
  monday: 'lunes',
  mar: 'martes',
  martes: 'martes',
  tue: 'martes',
  tuesday: 'martes',
  mie: 'miercoles',
  miercoles: 'miercoles',
  miercoles2: 'miercoles',
  wed: 'miercoles',
  wednesday: 'miercoles',
  jue: 'jueves',
  jueves: 'jueves',
  thu: 'jueves',
  thursday: 'jueves',
  vie: 'viernes',
  viernes: 'viernes',
  fri: 'viernes',
  friday: 'viernes',
  sab: 'sabado',
  sabado: 'sabado',
  sat: 'sabado',
  saturday: 'sabado',
}

const TURN_FIELDS = ['turno', 'shift', 'turnoDisponible', 'turnoDisponibilidad']
const DAY_FIELDS = ['dia', 'diaSemana', 'day', 'weekday', 'diaDisponible', 'diaAsistencia']
const START_FIELDS = ['inicio', 'horaInicio', 'desde', 'start', 'startTime']
const END_FIELDS = ['fin', 'horaFin', 'hasta', 'end', 'endTime']
const TEACHER_NAME_FIELDS = [
  'profesor',
  'docente',
  'docenteNombre',
  'nombreDocente',
  'teacherName',
  'teacher_name',
  'full_name',
  'fullName',
  'display_name',
  'displayName',
  'nombreCompleto',
  'apellidoNombre',
  'nombre',
  'name',
]
const SUBJECT_FIELDS = [
  'materia',
  'nombreMateria',
  'materiaNombre',
  'subjectName',
  'subject_name',
  'asignatura',
  'nombreAsignatura',
  'nombre',
  'name',
  'codigo',
  'code',
  'materiaId',
  'materia_id',
  'id',
]
const CAREER_FIELDS = ['carrera', 'programa', 'program', 'career', 'nombreCarrera', 'careerName']

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeKey(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '')
}

function truncate(value, maxLength = 72) {
  const text = clean(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

function safeCareerKey(value) {
  return truncate(normalizeKey(value) || 'sin-carrera')
}

function safeSubjectKey(value) {
  return truncate(normalizeKey(value) || 'sin-materia')
}

function countBy(values = [], keyFn = (value) => value) {
  return values.reduce((counts, value) => {
    const key = clean(keyFn(value)) || 'sin_dato'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function topEntries(counts = {}, limit = 20) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function increment(counts, key, amount = 1) {
  const safeKey = clean(key) || 'sin_dato'
  counts[safeKey] = (counts[safeKey] ?? 0) + amount
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null && clean(value) !== ''
}

function normalizeFieldName(value) {
  return normalizeToken(value)
}

function readField(row = {}, aliases = []) {
  if (!row || typeof row !== 'object') return undefined

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && hasValue(row[alias])) {
      return row[alias]
    }
  }

  const wanted = new Set(aliases.map(normalizeFieldName))
  const entry = Object.entries(row).find(([key, value]) => wanted.has(normalizeFieldName(key)) && hasValue(value))
  return entry?.[1]
}

function firstValue(...values) {
  return values.find(hasValue)
}

function parseIsoDate(value) {
  const text = clean(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function normalizeDay(value) {
  const key = normalizeToken(value)
  return DAY_ALIASES[key] ?? ''
}

function dayFromIsoDate(value) {
  const date = parseIsoDate(value)
  return date ? DAY_NAMES[date.getDay()] : ''
}

function normalizeTurno(value) {
  return normalizeText(value).toUpperCase()
}

function parseTimeToMinutes(value) {
  const text = clean(value)
  const match = text.match(/(\d{1,2})(?::|\.|h)?\s*(\d{2})?/)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export function inferTurnoFromTime(value) {
  const minutes = parseTimeToMinutes(value)
  if (minutes === null) return ''
  if (minutes < 13 * 60) return 'MANANA'
  if (minutes < 18 * 60) return 'TARDE'
  return 'NOCHE'
}

function inferTurnoFromSchedule(row = {}) {
  const explicit = normalizeTurno(readField(row, TURN_FIELDS))
  return explicit || inferTurnoFromTime(readField(row, START_FIELDS))
}

function getScheduleDay(row = {}) {
  return normalizeDay(readField(row, DAY_FIELDS))
}

function getScheduleStart(row = {}) {
  return clean(readField(row, START_FIELDS))
}

function getScheduleEnd(row = {}) {
  return clean(readField(row, END_FIELDS))
}

function uniqueValues(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function addUnique(values = [], nextValue = '') {
  return uniqueValues([...values, nextValue])
}

function normalizeNameAlias(value) {
  const tokens = normalizeText(value)
    .split(' ')
    .map(normalizeToken)
    .filter(Boolean)
    .sort()

  return tokens.length ? `namekey:${tokens.join(':')}` : ''
}

function teacherAliases(row = {}) {
  if (typeof row === 'string') return uniqueValues([row, normalizeNameAlias(row)])

  const joinedName = clean([row.nombre, row.apellido].filter(Boolean).join(' '))
  const values = [
    row.id,
    row.docenteId,
    row.teacherId,
    row.teacherKey,
    row.dni,
    row.email,
    ...TEACHER_NAME_FIELDS.map((field) => readField(row, [field])),
    joinedName,
  ]

  return uniqueValues([
    ...values,
    ...values.map(normalizeNameAlias),
  ])
}

function buildTeacherLookup(input = {}) {
  const lookup = new Map()
  Object.entries(input.metadata?.teacherNameToId ?? {}).forEach(([alias, id]) => {
    const safeId = clean(id)
    if (!safeId) return
    lookup.set(normalizeText(alias), safeId)
    lookup.set(normalizeToken(alias), safeId)
  })

  asArray(input.docentes).forEach((docente) => {
    const id = clean(docente.id ?? docente.docenteId ?? docente.teacherKey)
    if (!id) return
    teacherAliases(docente).forEach((alias) => {
      lookup.set(normalizeText(alias), id)
      lookup.set(normalizeToken(alias), id)
    })
  })

  return lookup
}

function resolveTeacherId(row = {}, input = {}, lookup = null) {
  const teacherLookup = lookup ?? buildTeacherLookup(input)
  for (const alias of teacherAliases(row)) {
    const id = teacherLookup.get(normalizeText(alias)) ?? teacherLookup.get(normalizeToken(alias))
    if (id) return id
  }
  return ''
}

function buildDocenteById(input = {}) {
  return asArray(input.docentes).reduce((map, docente) => {
    const id = clean(docente.id ?? docente.docenteId ?? docente.teacherKey)
    if (id) map.set(id, docente)
    return map
  }, new Map())
}

function availabilityValues(docente = {}) {
  const raw = (
    docente.diasAsistencia ??
    docente.diasDisponibles ??
    docente.disponibilidad ??
    docente.diasLaborales ??
    docente.fechasDisponibles ??
    docente.availability ??
    []
  )

  if (Array.isArray(raw)) return raw
  if (raw instanceof Set) return [...raw]
  if (raw && typeof raw === 'object') {
    const looksLikeEntry = [...DAY_FIELDS, 'fecha', 'fechaIso', 'date'].some((field) => (
      Object.prototype.hasOwnProperty.call(raw, field)
    ))
    if (looksLikeEntry) return [raw]
    return Object.entries(raw).filter(([, available]) => available).map(([key]) => key)
  }
  return [raw].filter(Boolean)
}

function getDocenteDays(docente = {}) {
  const values = [
    ...availabilityValues(docente),
    docente.dia,
    docente.day,
  ]

  return uniqueValues(values.map((entry) => {
    if (entry && typeof entry === 'object') {
      return normalizeDay(firstValue(
        readField(entry, DAY_FIELDS),
        dayFromIsoDate(readField(entry, ['fecha', 'fechaIso', 'date'])),
      ))
    }
    return normalizeDay(entry)
  }))
}

function getDocenteTurnos(docente = {}) {
  return uniqueValues([
    docente.turno,
    docente.turnos,
    docente.turnosDisponibles,
    docente.disponibilidadTurnos,
    docente.shifts,
  ].flat().map(normalizeTurno))
}

function dateSlotDay(slot = {}) {
  return normalizeDay(slot.diaSemana ?? slot.dia ?? slot.day) || dayFromIsoDate(slot.fecha ?? slot.fechaIso)
}

function dateSlotTurn(slot = {}) {
  return normalizeTurno(slot.turno ?? slot.shift)
}

function dateSlotCall(slot = {}) {
  return clean(slot.llamado ?? slot.exam_call ?? slot.callKey) || 'SIN_LLAMADO'
}

function countTeachersByDay(docentes = []) {
  const counts = {}
  asArray(docentes).forEach((docente) => {
    getDocenteDays(docente).forEach((day) => increment(counts, day))
  })
  return counts
}

function getSubjectTitle(row = {}) {
  return clean(firstValue(...SUBJECT_FIELDS.map((field) => readField(row, [field]))))
}

function getCareerTitle(row = {}) {
  return clean(firstValue(...CAREER_FIELDS.map((field) => readField(row, [field]))))
}

function subjectMatchKey(row = {}) {
  return [
    normalizeToken(getCareerTitle(row) || row.carreraId || row.careerId),
    normalizeToken(getSubjectTitle(row)),
  ].join('::')
}

function getMateriaYear(materia = {}) {
  return clean(materia.anio ?? materia.year ?? materia.nivel) || 'sin_anio'
}

function isMesaSubject(materia = {}) {
  return materia.requiereMesa !== false
}

function issueCode(issue = {}) {
  return clean(issue.code ?? issue.type ?? issue.reason)
}

function allMesaIssues(mesa = {}) {
  return [...asArray(mesa.errors), ...asArray(mesa.warnings)]
}

function hasDate(mesa = {}) {
  return Boolean(clean(mesa.fecha ?? mesa.fechaIso ?? mesa.displayDate))
}

function getMesaIssueDates(mesa = {}) {
  return uniqueValues(allMesaIssues(mesa).map((issue) => clean(issue.fecha)))
}

function getMesaTitle(mesa = {}) {
  return clean(mesa.materia ?? mesa.nombreMateria ?? mesa.materiaId ?? mesa.id)
}

function scenarioMetricsFromSummary(summary = {}, input = {}) {
  return {
    totalFechasDisponibles: asArray(input.fechasDisponibles).length,
    totalMesas: summary.totalMesas ?? 0,
    totalPlanned: summary.totalPlanned ?? 0,
    totalUnassigned: summary.totalUnassigned ?? 0,
    mesasCompletas: summary.mesasCompletas ?? 0,
    mesasConUnVocal: summary.mesasConUnVocal ?? 0,
    mesasSinTribunal: summary.mesasSinTribunal ?? 0,
    mesasSinFecha: summary.mesasSinFecha ?? 0,
    completionRate: summary.completionRate ?? 0,
    criticalErrors: summary.totalCriticalErrors ?? 0,
    warnings: summary.totalWarnings ?? 0,
  }
}

function metricDelta(metrics = {}, baseline = {}) {
  return {
    totalFechasDisponibles: (metrics.totalFechasDisponibles ?? 0) - (baseline.totalFechasDisponibles ?? 0),
    totalPlanned: (metrics.totalPlanned ?? 0) - (baseline.totalPlanned ?? 0),
    totalUnassigned: (metrics.totalUnassigned ?? 0) - (baseline.totalUnassigned ?? 0),
    mesasCompletas: (metrics.mesasCompletas ?? 0) - (baseline.mesasCompletas ?? 0),
    mesasSinTribunal: (metrics.mesasSinTribunal ?? 0) - (baseline.mesasSinTribunal ?? 0),
    mesasSinFecha: (metrics.mesasSinFecha ?? 0) - (baseline.mesasSinFecha ?? 0),
    completionRate: Number(((metrics.completionRate ?? 0) - (baseline.completionRate ?? 0)).toFixed(4)),
    criticalErrors: (metrics.criticalErrors ?? 0) - (baseline.criticalErrors ?? 0),
    warnings: (metrics.warnings ?? 0) - (baseline.warnings ?? 0),
  }
}

export function runDateTurnScenario({
  name,
  input,
  contract = null,
  metadata = {},
} = {}) {
  const scenarioContract = contract ?? buildRegularExamPreviewIntegrationContract(input, {})
  const summary = buildExamEngineEfficiencySummary({
    contract: scenarioContract,
    input,
    metadata: {
      source: 'local-audit-date-turn-scenario',
      readOnly: true,
      ...metadata,
    },
  })

  return {
    name,
    mode: metadata.mode ?? 'engine-run',
    metrics: scenarioMetricsFromSummary(summary, input),
  }
}

function nextDatesMatchingDays(fechaIso = '', days = [], count = 5) {
  const start = parseIsoDate(fechaIso)
  if (!start || !days.length) return []

  const wanted = new Set(days.map(normalizeDay).filter(Boolean))
  const dates = []
  const current = new Date(start)
  let guard = 0

  while (dates.length < count && guard < 90) {
    current.setDate(current.getDate() + 1)
    guard += 1
    const day = DAY_NAMES[current.getDay()]
    if (wanted.has(day)) dates.push(new Date(current))
  }

  return dates
}

function sortDateSlots(slots = []) {
  return [...slots].sort((left, right) => (
    dateSlotCall(left).localeCompare(dateSlotCall(right)) ||
    clean(left.fecha).localeCompare(clean(right.fecha)) ||
    dateSlotTurn(left).localeCompare(dateSlotTurn(right))
  ))
}

export function createBestAvailabilityDatesInput(input = {}, {
  days = [],
  extraDatesPerCall = 5,
} = {}) {
  const next = cloneJson(input)
  const fechas = asArray(next.fechasDisponibles)
  const byCall = fechas.reduce((map, slot) => {
    const call = dateSlotCall(slot)
    const current = map.get(call) ?? []
    current.push(slot)
    map.set(call, current)
    return map
  }, new Map())
  const additions = []

  byCall.forEach((items, call) => {
    const sorted = [...items].sort((left, right) => clean(left.fecha).localeCompare(clean(right.fecha)))
    const template = sorted.at(-1) ?? {}
    nextDatesMatchingDays(template.fecha, days, extraDatesPerCall).forEach((date) => {
      additions.push({
        ...template,
        fecha: toIsoDate(date),
        diaSemana: DAY_NAMES[date.getDay()].toUpperCase(),
        llamado: call,
        disponible: true,
      })
    })
  })

  next.fechasDisponibles = sortDateSlots([...fechas, ...additions])
  next.config = {
    ...(next.config ?? {}),
    fechaFin: next.fechasDisponibles.reduce((max, slot) => clean(slot.fecha) > clean(max) ? slot.fecha : max, next.config?.fechaFin ?? ''),
  }
  return next
}

export function createTopAvailabilityOnlyInput(input = {}, { days = [] } = {}) {
  const next = cloneJson(input)
  const wanted = new Set(days.map(normalizeDay).filter(Boolean))
  const filtered = asArray(next.fechasDisponibles).filter((slot) => wanted.has(dateSlotDay(slot)))

  if (filtered.length) {
    next.fechasDisponibles = sortDateSlots(filtered)
    next.config = {
      ...(next.config ?? {}),
      fechaFin: filtered.reduce((max, slot) => clean(slot.fecha) > clean(max) ? slot.fecha : max, ''),
    }
  }

  return next
}

function availabilityEntryMatchesSchedule(entry = {}, schedule = {}) {
  const entryDay = normalizeDay(entry.diaSemana ?? entry.dia ?? entry.day)
  const entryStart = clean(entry.inicio ?? entry.start ?? entry.horaInicio)
  const entryEnd = clean(entry.fin ?? entry.end ?? entry.horaFin)
  const sameDay = entryDay && entryDay === schedule.day
  const sameStart = !entryStart || !schedule.inicio || entryStart === schedule.inicio
  const sameEnd = !entryEnd || !schedule.fin || entryEnd === schedule.fin
  return sameDay && sameStart && sameEnd
}

function addTurnToDocente(docente = {}, schedule = {}) {
  const turno = clean(schedule.turno)
  if (!turno) return docente

  const availability = asArray(docente.availability)
  let matched = false
  const nextAvailability = availability.map((entry) => {
    if (!availabilityEntryMatchesSchedule(entry, schedule)) return entry
    matched = true
    return {
      ...entry,
      turno: entry.turno || turno,
      shift: entry.shift || turno,
    }
  })

  if (!matched) {
    nextAvailability.push({
      dia: schedule.day,
      diaSemana: schedule.day,
      day: schedule.day,
      turno,
      shift: turno,
      inicio: schedule.inicio,
      fin: schedule.fin,
      source: 'audit-inferred-turn',
    })
  }

  return {
    ...docente,
    turnosDisponibles: addUnique(docente.turnosDisponibles, turno),
    availability: nextAvailability,
  }
}

function majorityTurn(counts = {}) {
  return topEntries(counts, 1)[0]?.key ?? ''
}

function collectScheduleTurnIndexes(snapshot = {}, input = {}) {
  const lookup = buildTeacherLookup(input)
  const turnsByTeacher = new Map()
  const turnsBySubject = new Map()
  const turnsByDay = new Map()

  asArray(snapshot.horariosDocentes).forEach((row) => {
    const day = getScheduleDay(row)
    const turno = inferTurnoFromSchedule(row)
    if (!day || !turno) return

    const schedule = {
      day,
      turno,
      inicio: getScheduleStart(row),
      fin: getScheduleEnd(row),
    }
    const docenteId = resolveTeacherId(row, input, lookup)
    if (docenteId) {
      const current = turnsByTeacher.get(docenteId) ?? []
      current.push(schedule)
      turnsByTeacher.set(docenteId, current)
    }

    const subjectKey = subjectMatchKey(row)
    if (subjectKey !== '::') {
      const current = turnsBySubject.get(subjectKey) ?? {}
      increment(current, turno)
      turnsBySubject.set(subjectKey, current)
    }

    const dayTurns = turnsByDay.get(day) ?? new Set()
    dayTurns.add(turno)
    turnsByDay.set(day, dayTurns)
  })

  return { turnsByTeacher, turnsBySubject, turnsByDay }
}

export function createTurnInferredInput(input = {}, snapshot = {}) {
  const next = cloneJson(input)
  const { turnsByTeacher, turnsBySubject, turnsByDay } = collectScheduleTurnIndexes(snapshot, input)

  next.docentes = asArray(next.docentes).map((docente) => {
    const id = clean(docente.id ?? docente.docenteId ?? docente.teacherKey)
    return asArray(turnsByTeacher.get(id)).reduce(addTurnToDocente, docente)
  })

  next.materias = asArray(next.materias).map((materia) => {
    const turno = majorityTurn(turnsBySubject.get(subjectMatchKey(materia)))
    return turno ? { ...materia, turno } : materia
  })

  const seen = new Set()
  next.fechasDisponibles = sortDateSlots(asArray(next.fechasDisponibles).flatMap((slot) => {
    const day = dateSlotDay(slot)
    const inferredTurns = [...(turnsByDay.get(day) ?? new Set())]
    const turns = uniqueValues([dateSlotTurn(slot), ...inferredTurns])

    return turns.map((turno) => {
      const nextSlot = {
        ...slot,
        turno,
        shift: turno,
      }
      const key = [dateSlotCall(nextSlot), clean(nextSlot.fecha), turno].join('::')
      if (seen.has(key)) return null
      seen.add(key)
      return nextSlot
    }).filter(Boolean)
  }))

  next.metadata = {
    ...(next.metadata ?? {}),
    auditScenario: {
      ...(next.metadata?.auditScenario ?? {}),
      inferredTurnsFromHorarioInicio: true,
    },
  }

  return next
}

export function buildTurnDiagnostics(snapshot = {}, input = {}) {
  const rows = asArray(snapshot.horariosDocentes)
  const inferredCounts = {}
  const explicitCounts = {}
  let explicitTurno = 0
  let missingTurno = 0
  let validInicioFin = 0
  let missingTurnoWithValidInicioFin = 0
  let inferableFromInicio = 0

  rows.forEach((row) => {
    const explicit = normalizeTurno(readField(row, TURN_FIELDS))
    const inicio = getScheduleStart(row)
    const fin = getScheduleEnd(row)
    const inferred = inferTurnoFromTime(inicio)
    const hasValidTime = parseTimeToMinutes(inicio) !== null && parseTimeToMinutes(fin) !== null

    if (explicit) {
      explicitTurno += 1
      increment(explicitCounts, explicit)
    } else {
      missingTurno += 1
    }
    if (hasValidTime) validInicioFin += 1
    if (!explicit && hasValidTime) missingTurnoWithValidInicioFin += 1
    if (!explicit && inferred) {
      inferableFromInicio += 1
      increment(inferredCounts, inferred)
    }
  })

  const docentes = asArray(input.docentes)
  const availabilityRows = docentes.flatMap((docente) => asArray(docente.availability))

  return {
    fuenteEsperadaTurno: 'horariosDocentes.turno/shift; si falta, inicio/fin permiten inferir MANANA/TARDE/NOCHE.',
    horariosDocentes: {
      total: rows.length,
      conTurnoExplicito: explicitTurno,
      sinTurnoExplicito: missingTurno,
      conInicioFinValidos: validInicioFin,
      sinTurnoPeroInicioFinValidos: missingTurnoWithValidInicioFin,
      inferiblesDesdeInicio: inferableFromInicio,
      turnosExplicitos: topEntries(explicitCounts, 10),
      turnosInferidosDesdeInicio: topEntries(inferredCounts, 10),
    },
    inputAdaptado: {
      docentesTotal: docentes.length,
      docentesConTurno: docentes.filter((docente) => getDocenteTurnos(docente).length).length,
      docentesSinTurno: docentes.filter((docente) => !getDocenteTurnos(docente).length).length,
      availabilityEntries: availabilityRows.length,
      availabilityEntriesConTurno: availabilityRows.filter((entry) => normalizeTurno(entry.turno ?? entry.shift)).length,
      availabilityEntriesSinTurno: availabilityRows.filter((entry) => !normalizeTurno(entry.turno ?? entry.shift)).length,
    },
    reglaInferenciaPropuesta: {
      antesDe13: 'MANANA',
      desde13Hasta17_59: 'TARDE',
      desde18: 'NOCHE',
      fallbackSiNoHayHora: 'mantener turno de la mesa/rango; si tampoco existe, definir default institucional antes de integrar.',
    },
  }
}

export function buildTeacherDateDiagnostics(input = {}) {
  const docentes = asArray(input.docentes)
  const docenteById = buildDocenteById(input)
  const dateDays = new Set(asArray(input.fechasDisponibles).map(dateSlotDay).filter(Boolean))
  const materiasMesa = asArray(input.materias).filter(isMesaSubject)
  const titularMateriaPairs = materiasMesa
    .map((materia) => ({
      materia,
      titularId: clean(materia.titularId ?? materia.titular_id),
      docente: docenteById.get(clean(materia.titularId ?? materia.titular_id)),
    }))
    .filter((entry) => entry.titularId)
  const titularDocenteIds = new Set(titularMateriaPairs.map((entry) => entry.titularId))
  const titulares = [...titularDocenteIds].map((id) => docenteById.get(id)).filter(Boolean)
  const docentesPorDia = countTeachersByDay(docentes)
  const titularesPorDia = countTeachersByDay(titulares)
  const materiasTitularPorDia = {}
  let materiasTitularSinFechaCompatible = 0
  const titularesSinFechaCompatible = new Set()

  titularMateriaPairs.forEach(({ titularId, docente }) => {
    const days = getDocenteDays(docente)
    days.forEach((day) => increment(materiasTitularPorDia, day))
    if (!days.some((day) => dateDays.has(day))) {
      materiasTitularSinFechaCompatible += 1
      titularesSinFechaCompatible.add(titularId)
    }
  })

  const titularAvailabilityByDate = asArray(input.fechasDisponibles).map((slot) => {
    const day = dateSlotDay(slot)
    return {
      fecha: clean(slot.fecha),
      diaSemana: day || 'sin_dia',
      llamado: dateSlotCall(slot),
      titularesDisponibles: titulares.filter((docente) => getDocenteDays(docente).includes(day)).length,
      materiasConTitularDisponible: titularMateriaPairs.filter(({ docente }) => getDocenteDays(docente).includes(day)).length,
    }
  })

  return {
    titularesUnicos: titularDocenteIds.size,
    titularesDisponiblesPorDiaSemana: Object.fromEntries(topEntries(titularesPorDia, 7).map(({ key, count }) => [key, count])),
    materiasConTitularPorDiaSemana: Object.fromEntries(topEntries(materiasTitularPorDia, 7).map(({ key, count }) => [key, count])),
    docentesDisponiblesPorDiaSemana: Object.fromEntries(topEntries(docentesPorDia, 7).map(({ key, count }) => [key, count])),
    diasConMayorDisponibilidadTitular: topEntries(titularesPorDia, 7),
    diasConMenorDisponibilidadTitular: topEntries(titularesPorDia, 7).slice().reverse(),
    diasConMayorDisponibilidadDocente: topEntries(docentesPorDia, 7),
    diasConMenorDisponibilidadDocente: topEntries(docentesPorDia, 7).slice().reverse(),
    materiasTitularSinFechaCompatible,
    titularesSinFechaCompatible: titularesSinFechaCompatible.size,
    disponibilidadTitularPorFecha: titularAvailabilityByDate,
    diasDelPeriodoConPocaDisponibilidadTitular: titularAvailabilityByDate
      .filter((row) => row.titularesDisponibles <= 2 || row.materiasConTitularDisponible <= 5),
  }
}

export function summarizeAvailableDates({ input = {}, plan = {} } = {}) {
  const dates = sortDateSlots(asArray(input.fechasDisponibles))
  const plannedByDay = countBy(asArray(plan.plannedMesas), (mesa) => dateSlotDay(mesa))
  const failedAttemptsByDay = {}
  const failedAttemptsByDate = {}

  asArray(plan.unassignedMesas).forEach((mesa) => {
    getMesaIssueDates(mesa).forEach((fecha) => {
      const day = dayFromIsoDate(fecha)
      const key = [clean(mesa.id), fecha].join('::')
      if (!failedAttemptsByDate[fecha]) failedAttemptsByDate[fecha] = new Set()
      failedAttemptsByDate[fecha].add(key)
      if (!failedAttemptsByDay[day]) failedAttemptsByDay[day] = new Set()
      failedAttemptsByDay[day].add(key)
    })
  })

  const failedByDayCounts = Object.fromEntries(Object.entries(failedAttemptsByDay).map(([day, values]) => [day, values.size]))
  const failedByDateCounts = Object.fromEntries(Object.entries(failedAttemptsByDate).map(([fecha, values]) => [fecha, values.size]))

  const fechas = dates.map((slot) => ({
    fecha: clean(slot.fecha),
    diaSemana: dateSlotDay(slot) || 'sin_dia',
    llamado: dateSlotCall(slot),
    turno: dateSlotTurn(slot) || 'sin_turno',
    mesasPlanificadas: asArray(plan.plannedMesas).filter((mesa) => clean(mesa.fecha) === clean(slot.fecha)).length,
    intentosFallidos: failedByDateCounts[clean(slot.fecha)] ?? 0,
  }))

  return {
    totalFechasDisponibles: dates.length,
    rango: {
      desde: fechas[0]?.fecha ?? '',
      hasta: fechas.at(-1)?.fecha ?? '',
    },
    porDiaSemana: countBy(dates, dateSlotDay),
    porLlamado: countBy(dates, dateSlotCall),
    porTurno: countBy(dates, dateSlotTurn),
    fechas,
    mesasIntentaUbicarPorDia: topEntries({
      ...plannedByDay,
      ...Object.fromEntries(Object.entries(failedByDayCounts).map(([day, count]) => [
        day,
        (plannedByDay[day] ?? 0) + count,
      ])),
    }, 7),
    planificadasPorDia: topEntries(plannedByDay, 7),
    intentosFallidosPorDia: topEntries(failedByDayCounts, 7),
  }
}

export function summarizeMissingDateNeeds({ unassignedMesas = [], input = {} } = {}) {
  const docenteById = buildDocenteById(input)
  const rows = asArray(unassignedMesas).filter((mesa) => !hasDate(mesa))
  const porDiaTitular = {}
  const porDiaTitularCombo = {}

  rows.forEach((mesa) => {
    const titularId = clean(mesa.titularId ?? mesa.titular_id)
    const days = getDocenteDays(docenteById.get(titularId)).sort()
    if (!days.length) {
      increment(porDiaTitular, 'sin_disponibilidad_titular')
      increment(porDiaTitularCombo, 'sin_disponibilidad_titular')
      return
    }
    days.forEach((day) => increment(porDiaTitular, day))
    increment(porDiaTitularCombo, days.join('+'))
  })

  return {
    total: rows.length,
    porCarrera: topEntries(countBy(rows, (mesa) => safeCareerKey(mesa.carrera)), 20),
    porLlamado: topEntries(countBy(rows, (mesa) => clean(mesa.llamado ?? mesa.exam_call)), 10),
    porAnio: topEntries(countBy(rows, getMateriaYear), 10),
    porDiaDisponibilidadTitular: topEntries(porDiaTitular, 10),
    porComboDiasTitular: topEntries(porDiaTitularCombo, 20),
    porMotivoPrincipal: countBy(rows, classifyDateFailure),
    codigosPrincipales: topEntries(countBy(rows.flatMap(allMesaIssues), issueCode), 20),
    agrupadoCarreraLlamadoAnioMotivo: topEntries(countBy(rows, (mesa) => [
      safeCareerKey(mesa.carrera),
      clean(mesa.llamado ?? mesa.exam_call) || 'sin_llamado',
      getMateriaYear(mesa),
      classifyDateFailure(mesa),
    ].join('::')), 30).map(({ key, count }) => {
      const [carreraKey, llamado, anio, motivo] = key.split('::')
      return { carreraKey, llamado, anio, motivo, count }
    }),
    ejemplosAnonimizados: rows.slice(0, 20).map((mesa) => ({
      carreraKey: safeCareerKey(mesa.carrera),
      materiaKey: safeSubjectKey(getMesaTitle(mesa)),
      llamado: clean(mesa.llamado ?? mesa.exam_call) || 'sin_llamado',
      anio: getMateriaYear(mesa),
      titularDias: getDocenteDays(docenteById.get(clean(mesa.titularId ?? mesa.titular_id))).sort(),
      motivo: classifyDateFailure(mesa),
    })),
  }
}

function selectTopDays(teacherDiagnostics = {}, { source = 'titulares', limit = 3 } = {}) {
  const rows = source === 'docentes'
    ? teacherDiagnostics.diasConMayorDisponibilidadDocente
    : teacherDiagnostics.diasConMayorDisponibilidadTitular
  return asArray(rows)
    .map((entry) => normalizeDay(entry.key))
    .filter((day) => WEEK_DAYS.includes(day))
    .slice(0, limit)
}

function attachDeltas(scenarios = []) {
  const baseline = scenarios[0]?.metrics ?? {}
  return scenarios.map((scenario) => ({
    ...scenario,
    diferenciaContraActual: metricDelta(scenario.metrics, baseline),
  }))
}

export function runDateTurnScenarios({
  input = {},
  snapshot = {},
  baseContract = null,
  teacherDiagnostics = null,
} = {}) {
  const diagnostics = teacherDiagnostics ?? buildTeacherDateDiagnostics(input)
  const topTitularDays = selectTopDays(diagnostics, { source: 'titulares', limit: 3 })
  const topDocenteDays = selectTopDays(diagnostics, { source: 'docentes', limit: 3 })
  const scenarioA = runDateTurnScenario({
    name: 'A. fechas actuales',
    input,
    contract: baseContract,
    metadata: { scenario: 'current-dates' },
  })
  const scenarioBInput = createBestAvailabilityDatesInput(input, {
    days: topTitularDays,
    extraDatesPerCall: 5,
  })
  const scenarioB = runDateTurnScenario({
    name: 'B. agregar fechas en dias de mayor disponibilidad titular',
    input: scenarioBInput,
    metadata: { scenario: 'add-best-titular-days', topTitularDays },
  })
  const scenarioC = runDateTurnScenario({
    name: 'C. ampliar una semana el rango',
    input: createExtendedDatesInput(input, { extraDaysPerCall: 5 }),
    metadata: { scenario: 'extend-one-week' },
  })
  const scenarioD = runDateTurnScenario({
    name: 'D. ampliar dos semanas el rango',
    input: createExtendedDatesInput(input, { extraDaysPerCall: 10 }),
    metadata: { scenario: 'extend-two-weeks' },
  })
  const scenarioE = runDateTurnScenario({
    name: 'E. usar solo fechas de mayor disponibilidad docente',
    input: createTopAvailabilityOnlyInput(input, { days: topDocenteDays }),
    metadata: { scenario: 'only-top-docente-days', topDocenteDays },
  })
  const scenarioF = runDateTurnScenario({
    name: 'F. inferir turnos desde inicio/fin',
    input: createTurnInferredInput(input, snapshot),
    metadata: { scenario: 'infer-turns-from-time' },
  })

  return {
    diasSeleccionados: {
      mayorDisponibilidadTitular: topTitularDays,
      mayorDisponibilidadDocente: topDocenteDays,
    },
    escenarios: attachDeltas([scenarioA, scenarioB, scenarioC, scenarioD, scenarioE, scenarioF]),
  }
}

function chooseBestScenario(scenarios = []) {
  return asArray(scenarios)
    .filter((scenario) => scenario.mode === 'engine-run')
    .sort((left, right) => (
      (right.metrics?.completionRate ?? 0) - (left.metrics?.completionRate ?? 0) ||
      (right.metrics?.totalPlanned ?? 0) - (left.metrics?.totalPlanned ?? 0) ||
      (left.metrics?.criticalErrors ?? 0) - (right.metrics?.criticalErrors ?? 0)
    ))[0] ?? null
}

export function buildDateTurnRecommendation({
  teacherDiagnostics = {},
  turnDiagnostics = {},
  scenarios = [],
} = {}) {
  const best = chooseBestScenario(scenarios)
  const base = scenarios[0]?.metrics ?? {}
  const bestDelta = best ? metricDelta(best.metrics, base) : {}
  const topTitularDays = selectTopDays(teacherDiagnostics, { source: 'titulares', limit: 3 })
  const topDocenteDays = selectTopDays(teacherDiagnostics, { source: 'docentes', limit: 3 })
  const missingTurnos = turnDiagnostics.horariosDocentes?.sinTurnoPeroInicioFinValidos ?? 0
  const inferTurnScenario = scenarios.find((scenario) => scenario.name?.startsWith('F.'))
  const turnImproves = (inferTurnScenario?.diferenciaContraActual?.completionRate ?? 0) > 0
  const currentCompletion = base.completionRate ?? 0
  const bestCompletion = best?.metrics?.completionRate ?? currentCompletion

  return {
    mejorEscenario: best?.name ?? 'sin mejora clara',
    mejoraCompletionRate: bestDelta.completionRate ?? 0,
    fechasConvieneAgregar: {
      diasSemanaPrioritariosTitulares: topTitularDays,
      diasSemanaPrioritariosDocentes: topDocenteDays,
      criterio: 'Agregar fechas por llamado en los dias con mayor disponibilidad de titulares antes de tocar reglas de tribunal.',
    },
    corregirTurnoEnAdaptador: missingTurnos > 0
      ? (turnImproves
          ? 'si, inferir turno desde inicio/fin mejora la simulacion.'
          : 'si, hay horarios sin turno explicito con inicio/fin validos; aunque no sea el mayor cuello, evita TURNO_NO_DEFINIDO.')
      : 'no aparece como prioridad porque los horarios ya traen turno explicito o no son inferibles.',
    rangoActualInsuficiente: bestCompletion > currentCompletion || (base.mesasSinFecha ?? 0) > 0,
    seAcercaAUmbralAceptable: bestCompletion >= 0.75
      ? 'si, con fechas razonables se acerca a un umbral operativo de preview.'
      : 'todavia no; mejora, pero sigue por debajo de un umbral conservador.',
    integrarPreviewInterno: bestCompletion >= 0.6
      ? 'si, como preview interno read-only con advertencias visibles.'
      : 'solo para auditoria tecnica; no como preview operativo aun.',
    reemplazarMotorViejo: 'no conviene reemplazar el motor viejo todavia.',
  }
}
