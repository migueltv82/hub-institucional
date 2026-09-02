import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import {
  createParticipacionTribunal,
  isParticipacionVocalia,
  normalizeLlamado,
} from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { planWithJointDateVocalPlanner } from '../experimental/jointDateVocalPlanner.js'
import { buildTeacherSlotKey } from '../planning/dateAwareVocalSelection.js'
import { teacherIsAvailableOnDate } from '../rules/availability.js'
import {
  getNivelAfinidadDocenteMesa,
  NIVELES_AFINIDAD,
} from '../rules/affinities.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'

export const SCHEDULING_FEASIBILITY_CLASSIFICATIONS = Object.freeze({
  FEASIBLE_FULL: 'FEASIBLE_FULL',
  FEASIBLE_MINIMUM_REVIEW: 'FEASIBLE_MINIMUM_REVIEW',
  TITLE_ONLY_REVIEW: 'TITLE_ONLY_REVIEW',
  NO_TITLE_DATE: 'NO_TITLE_DATE',
  NO_VOCAL_POOL: 'NO_VOCAL_POOL',
  CALENDAR_TOO_RESTRICTIVE: 'CALENDAR_TOO_RESTRICTIVE',
  BLOCKED_BY_SUPERPOSITION: 'BLOCKED_BY_SUPERPOSITION',
  BLOCKED_BY_IDENTITY_V2_PENDING: 'BLOCKED_BY_IDENTITY_V2_PENDING',
  MANUAL_REQUIRED: 'MANUAL_REQUIRED',
})

const SCENARIO_NAMES = Object.freeze({
  STRICT_CURRENT: 'STRICT_CURRENT',
  IGNORE_GLOBAL_SUPERPOSITION: 'IGNORE_GLOBAL_SUPERPOSITION',
  IGNORE_IDONEITY_SOFT: 'IGNORE_IDONEITY_SOFT',
  ADD_ONE_EXTRA_DATE: 'ADD_ONE_EXTRA_DATE',
  MINIMUM_ONE_VOCAL_REVIEW: 'MINIMUM_ONE_VOCAL_REVIEW',
})

const AFFINITY_SCORE = {
  [NIVELES_AFINIDAD.MISMA_CARRERA]: 100,
  [NIVELES_AFINIDAD.MATERIA_HOMONIMA]: 96,
  [NIVELES_AFINIDAD.PRACTICA_TECNICA_MISMA_CARRERA]: 94,
  [NIVELES_AFINIDAD.FAMILIA_INGLES]: 90,
  [NIVELES_AFINIDAD.FAMILIA_INFORMATICA_TIC]: 88,
  [NIVELES_AFINIDAD.PRACTICA_PEDAGOGICA_TRANSVERSAL]: 84,
  [NIVELES_AFINIDAD.MATERIA_SIMILAR]: 78,
  [NIVELES_AFINIDAD.ESPECIALIDAD_DECLARADA]: 70,
  [NIVELES_AFINIDAD.IDONEIDAD_EXPLICITA]: 60,
  [NIVELES_AFINIDAD.SIN_AFINIDAD]: 0,
}

const SPANISH_WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
]

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function countBy(items = [], getKey = (item) => item) {
  return items.reduce((counts, item) => {
    const key = clean(getKey(item)) || 'otro'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function topEntries(counts = {}, limit = 12) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)
  return clean(docente.id ?? docente.docenteId ?? docente.teacherKey ?? docente.dni ?? docente.email ?? docente.nombre)
}

function getDocenteKeys(docente = {}) {
  return [
    docente.id,
    docente.docenteId,
    docente.teacherKey,
    docente.dni,
    docente.email,
    docente.nombre,
    docente.full_name,
    docente.profesor,
  ].map(normalizeText).filter(Boolean)
}

function buildDocenteMap(docentes = []) {
  return asArray(docentes).reduce((map, docente) => {
    getDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
}

function getTeacherById(docenteMap = new Map(), docenteId = '') {
  return docenteMap.get(normalizeText(docenteId)) ?? null
}

function getTeacherTurnos(docente = {}) {
  return [
    docente.turno,
    docente.turnos,
    docente.turnosDisponibles,
    docente.disponibilidadTurnos,
    docente.shifts,
  ].flat().map(normalizeText).filter(Boolean)
}

function teacherMatchesTurno(docente = {}, turno = '') {
  const turnoKey = normalizeText(turno)
  if (!turnoKey) return true
  const turnos = getTeacherTurnos(docente)
  if (!turnos.length) return true
  return turnos.includes(turnoKey)
}

function teacherIsActive(docente = {}) {
  if (!('activo' in docente) && !('active' in docente) && !('isActive' in docente)) return true
  return docente.activo !== false && docente.active !== false && docente.isActive !== false
}

function getAttendanceDays(docente = {}) {
  return [
    docente.diasAsistencia,
    docente.diasDisponibles,
    docente.disponibilidad,
    docente.diasLaborales,
  ].flat().map(normalizeText).filter(Boolean)
}

function getTeachingHours(docente = {}) {
  return numberOrZero(
    docente.horasCatedra ??
    docente.horas_catedra ??
    docente.teachingHours ??
    docente.teaching_hours ??
    docente.cargaHoraria ??
    docente.carga_horaria,
  )
}

function normalizeSlot(row = {}, mesa = {}) {
  return {
    fecha: clean(row.fecha ?? row.fechaIso ?? row.date),
    diaSemana: normalizeText(row.diaSemana ?? row.dia ?? row.day),
    turno: normalizeText(row.turno ?? row.shift ?? mesa.turno),
    llamado: normalizeLlamado(row.llamado ?? row.exam_call ?? row.callKey ?? mesa.llamado),
    disponible: row.disponible !== false && row.available !== false,
    synthetic: row.synthetic === true,
  }
}

function normalizeCalendar(calendar = []) {
  return asArray(calendar)
    .map((slot) => normalizeSlot(slot))
    .filter((slot) => slot.fecha && slot.disponible)
    .sort((left, right) => (
      left.fecha.localeCompare(right.fecha) ||
      left.llamado.localeCompare(right.llamado) ||
      left.turno.localeCompare(right.turno)
    ))
}

function getMesaDate(mesa = {}) {
  return clean(mesa.fecha ?? mesa.fechaIso)
}

function hasDate(mesa = {}) {
  return Boolean(getMesaDate(mesa))
}

function normalizeCaseKey(value = '') {
  return normalizeText(value || 'sin_dato').replaceAll(/[^a-z0-9]+/g, '_')
}

function getCandidateSlots(mesa = {}, calendar = []) {
  const llamado = normalizeLlamado(mesa.llamado)
  const turno = normalizeText(mesa.turno)
  return asArray(calendar)
    .filter((slot) => !llamado || slot.llamado === llamado)
    .filter((slot) => !turno || slot.turno === turno)
}

function createParticipation(mesa = {}, docenteId = '', rol = '') {
  return createParticipacionTribunal({
    docenteId,
    mesaId: mesa.id,
    materiaId: mesa.materiaId,
    carreraId: mesa.carreraId,
    rol,
    llamado: mesa.llamado,
    fecha: mesa.fecha,
    turno: mesa.turno,
  })
}

function getMesaRoleEntries(mesa = {}) {
  return [
    { rol: 'TITULAR', docenteId: clean(mesa.titularId) },
    { rol: 'VOCAL_1', docenteId: clean(mesa.vocal1Id) },
    { rol: 'VOCAL_2', docenteId: clean(mesa.vocal2Id) },
  ].filter((entry) => entry.docenteId)
}

function buildTeacherSchedule(items = [], excludeMesaId = '') {
  const schedule = new Set()
  asArray(items)
    .filter((mesa) => clean(mesa.id) !== clean(excludeMesaId))
    .forEach((mesa) => {
      if (!hasDate(mesa)) return
      getMesaRoleEntries(mesa).forEach((entry) => {
        schedule.add(buildTeacherSlotKey(entry.docenteId, getMesaDate(mesa), mesa.turno))
      })
    })
  return schedule
}

function buildParticipacionesFromItems(items = [], excludeMesaId = '') {
  return asArray(items)
    .filter((mesa) => clean(mesa.id) !== clean(excludeMesaId))
    .flatMap((mesa) => (
      getMesaRoleEntries(mesa)
        .filter((entry) => isParticipacionVocalia({ rol: entry.rol }))
        .map((entry) => createParticipation(mesa, entry.docenteId, entry.rol))
    ))
}

function teacherHasScheduleConflict(schedule = new Set(), docenteId = '', slot = {}) {
  return schedule.has(buildTeacherSlotKey(docenteId, slot.fecha, slot.turno))
}

function docenteHasAffinity(docente = {}, mesa = {}, ignoreIdoneity = false) {
  if (ignoreIdoneity) {
    return {
      afinidadValida: true,
      nivelAfinidad: 'IGNORED_FOR_DIAGNOSTIC',
      motivo: 'Escenario diagnostico sin idoneidad estricta.',
    }
  }
  return getNivelAfinidadDocenteMesa(docente, mesa)
}

function getVocalPool({ mesa = {}, teachers = [], ignoreIdoneity = false } = {}) {
  return asArray(teachers)
    .map((docente) => {
      const docenteId = getDocenteId(docente)
      const affinity = docenteHasAffinity(docente, mesa, ignoreIdoneity)
      return {
        docente,
        docenteId,
        affinity,
        score: AFFINITY_SCORE[affinity.nivelAfinidad] ?? (ignoreIdoneity ? 40 : 0),
      }
    })
    .filter((entry) => entry.docenteId)
    .filter((entry) => teacherIsActive(entry.docente))
    .filter((entry) => normalizeText(entry.docenteId) !== normalizeText(mesa.titularId))
    .filter((entry) => entry.affinity.afinidadValida)
}

function getTeacherUsage(docente = {}, docenteId = '', participaciones = [], llamado = '') {
  const limite = calcularLimiteVocaliasPorLlamado(docente)
  const usadas = contarVocaliasPorDocente(participaciones, docenteId, llamado)
  return {
    limite,
    usadas,
    available: limite > 0 && usadas < limite,
    ratio: limite > 0 ? usadas / limite : 999,
  }
}

function evaluateVocalOnSlot({
  poolEntry = {},
  slot = {},
  participaciones = [],
  teacherSchedule = new Set(),
  ignoreSuperposition = false,
  ignoreCupo = false,
} = {}) {
  const reasons = []
  const docente = poolEntry.docente
  const docenteId = poolEntry.docenteId

  if (!teacherIsAvailableOnDate(docente, slot.fecha)) reasons.push('NO_ASISTE_EN_FECHA')
  if (!teacherMatchesTurno(docente, slot.turno)) reasons.push('TURNO_INCOMPATIBLE')
  if (!ignoreSuperposition && teacherHasScheduleConflict(teacherSchedule, docenteId, slot)) reasons.push('DOCENTE_SUPERPUESTO')

  const usage = getTeacherUsage(docente, docenteId, participaciones, slot.llamado)
  if (!ignoreCupo && !usage.available) reasons.push('SUPERA_CUPO_HORAS_CATEDRA')

  return {
    docenteId,
    valid: reasons.length === 0,
    reasons,
    score: poolEntry.score * 1000 - usage.ratio * 200 - usage.usadas * 20,
    usage,
  }
}

function summarizeSlotEvaluation({
  mesa = {},
  slot = {},
  titular = null,
  vocalPool = [],
  participaciones = [],
  teacherSchedule = new Set(),
  ignoreSuperposition = false,
  ignoreCupo = false,
} = {}) {
  const titularReasons = []
  if (!titular) titularReasons.push('SIN_TITULAR')
  if (titular && !teacherIsAvailableOnDate(titular, slot.fecha)) titularReasons.push('TITULAR_NO_ASISTE_EN_FECHA')
  if (titular && !teacherMatchesTurno(titular, slot.turno)) titularReasons.push('TITULAR_TURNO_INCOMPATIBLE')
  if (titular && !ignoreSuperposition && teacherHasScheduleConflict(teacherSchedule, mesa.titularId, slot)) {
    titularReasons.push('TITULAR_SUPERPUESTO')
  }

  const vocalEvaluations = vocalPool
    .map((entry) => evaluateVocalOnSlot({
      poolEntry: entry,
      mesa,
      slot,
      participaciones,
      teacherSchedule,
      ignoreSuperposition,
      ignoreCupo,
    }))
    .sort((left, right) => (
      Number(right.valid) - Number(left.valid) ||
      right.score - left.score ||
      left.docenteId.localeCompare(right.docenteId)
    ))

  const validVocales = vocalEvaluations.filter((entry) => entry.valid)
  const rejectionReasons = [
    ...titularReasons,
    ...vocalEvaluations.flatMap((entry) => entry.reasons),
  ]

  return {
    slot,
    titularOk: titularReasons.length === 0,
    titularReasons,
    validVocales: validVocales.length,
    hasOneVocal: validVocales.length >= 1,
    hasTwoVocales: validVocales.length >= 2,
    rejectionReasons,
  }
}

function reasonToCause(reason = '') {
  if (reason === 'NO_ASISTE_EN_FECHA') return 'vocales_rechazados_por_no_asistir'
  if (reason === 'DOCENTE_SUPERPUESTO') return 'vocales_rechazados_por_superposicion'
  if (reason === 'SUPERA_CUPO_HORAS_CATEDRA') return 'vocales_rechazados_por_cupo'
  if (reason === 'TITULAR_NO_ASISTE_EN_FECHA') return 'titulares_rechazados_por_no_asistir'
  if (reason === 'TITULAR_SUPERPUESTO') return 'titulares_rechazados_por_superposicion'
  if (reason === 'SIN_TITULAR') return 'sin_titular'
  return 'otros'
}

function classifyCase({
  raw,
  constrained,
  noSuperposition,
  identityBlocked = false,
} = {}) {
  if (identityBlocked) return SCHEDULING_FEASIBILITY_CLASSIFICATIONS.BLOCKED_BY_IDENTITY_V2_PENDING
  if (constrained.fechasConDosVocales > 0) return SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_FULL
  if (constrained.fechasConUnVocal > 0) return SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_MINIMUM_REVIEW
  if (raw.fechasTitularOk === 0) return SCHEDULING_FEASIBILITY_CLASSIFICATIONS.NO_TITLE_DATE
  if (raw.vocalesIdoneosTotales === 0) return SCHEDULING_FEASIBILITY_CLASSIFICATIONS.NO_VOCAL_POOL
  if (noSuperposition.fechasConUnVocal > 0 || noSuperposition.fechasConDosVocales > 0) {
    return SCHEDULING_FEASIBILITY_CLASSIFICATIONS.BLOCKED_BY_SUPERPOSITION
  }
  if (raw.fechasConUnVocal === 0 && raw.vocalesIdoneosTotales > 0) {
    return SCHEDULING_FEASIBILITY_CLASSIFICATIONS.CALENDAR_TOO_RESTRICTIVE
  }
  if (constrained.fechasTitularOk > 0) return SCHEDULING_FEASIBILITY_CLASSIFICATIONS.TITLE_ONLY_REVIEW
  return SCHEDULING_FEASIBILITY_CLASSIFICATIONS.MANUAL_REQUIRED
}

function buildFeasibilityMetrics({ slotEvaluations = [], vocalPoolSize = 0 } = {}) {
  return {
    fechasCandidatasTotales: slotEvaluations.length,
    fechasTitularOk: slotEvaluations.filter((slot) => slot.titularOk).length,
    vocalesIdoneosTotales: vocalPoolSize,
    vocalesQueAsistenPorFecha: slotEvaluations.reduce((max, slot) => Math.max(max, slot.validVocales), 0),
    fechasConUnVocal: slotEvaluations.filter((slot) => slot.titularOk && slot.hasOneVocal).length,
    fechasConDosVocales: slotEvaluations.filter((slot) => slot.titularOk && slot.hasTwoVocales).length,
    rejectionCounts: countBy(slotEvaluations.flatMap((slot) => slot.rejectionReasons), reasonToCause),
  }
}

function evaluateMesaFeasibility({
  mesa = {},
  teachers = [],
  docenteMap = new Map(),
  calendar = [],
  plannedItems = [],
  ignoreSuperposition = false,
  ignoreIdoneity = false,
  ignoreCupo = false,
} = {}) {
  const candidateSlots = getCandidateSlots(mesa, calendar)
  const titular = getTeacherById(docenteMap, mesa.titularId)
  const vocalPool = getVocalPool({ mesa, teachers, ignoreIdoneity })
  const participaciones = buildParticipacionesFromItems(plannedItems, mesa.id)
  const teacherSchedule = buildTeacherSchedule(plannedItems, mesa.id)
  const slotEvaluations = candidateSlots.map((slot) => summarizeSlotEvaluation({
    mesa,
    slot,
    titular,
    vocalPool,
    participaciones,
    teacherSchedule,
    ignoreSuperposition,
    ignoreCupo,
  }))

  return {
    slotEvaluations,
    metrics: buildFeasibilityMetrics({
      slotEvaluations,
      vocalPoolSize: vocalPool.length,
    }),
  }
}

function shouldIdentityBlock(mesa = {}, options = {}) {
  if (options.forceIdentityBlocking !== true && options.identityV2Pending !== true) return false
  return !clean(mesa.plan_id ?? mesa.planId) || !clean(mesa.materia_codigo ?? mesa.materiaCodigo ?? mesa.codigoFinal)
}

function createCaseRow({
  mesa = {},
  index = 0,
  source = '',
  raw = {},
  constrained = {},
  noSuperposition = {},
  classification = '',
  identityBlocked = false,
} = {}) {
  return {
    caseId: `FEASIBILITY-${String(index + 1).padStart(4, '0')}`,
    mesaId: clean(mesa.id),
    source,
    carreraKey: normalizeCaseKey(mesa.carrera || mesa.carreraId),
    materiaKey: normalizeCaseKey(mesa.materia || mesa.nombreMateria || mesa.materiaId),
    anio: numberOrZero(mesa.anio),
    llamado: normalizeLlamado(mesa.llamado),
    classification,
    identityBlocked,
    fechasCandidatasTotales: raw.fechasCandidatasTotales,
    fechasTitularAsiste: raw.fechasTitularOk,
    vocalesIdoneosTotales: raw.vocalesIdoneosTotales,
    fechasBrutasConUnVocal: raw.fechasConUnVocal,
    fechasBrutasConDosVocales: raw.fechasConDosVocales,
    fechasRealesTitularSinSuperposicion: constrained.fechasTitularOk,
    fechasRealesConUnVocal: constrained.fechasConUnVocal,
    fechasRealesConDosVocales: constrained.fechasConDosVocales,
    fechasSinSuperposicionConUnVocal: noSuperposition.fechasConUnVocal,
    fechasSinSuperposicionConDosVocales: noSuperposition.fechasConDosVocales,
    blockedBy: constrained.rejectionCounts,
  }
}

function compareScenarioCases(cases = [], scenarioName = '') {
  const counts = countBy(cases, (item) => item.classification)
  const full = numberOrZero(counts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_FULL])
  const minimum = numberOrZero(counts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_MINIMUM_REVIEW])
  const manual = cases.length - full - minimum

  return {
    scenario: scenarioName,
    totalMesas: cases.length,
    fullFeasible: full,
    minimumReviewFeasible: minimum,
    manualRequired: manual,
    classificationCounts: counts,
    cuelloReducido: topEntries(counts, 3).map((entry) => entry.key).join(', '),
    normative: ![
      SCENARIO_NAMES.IGNORE_GLOBAL_SUPERPOSITION,
      SCENARIO_NAMES.IGNORE_IDONEITY_SOFT,
    ].includes(scenarioName),
    diagnosticOnly: [
      SCENARIO_NAMES.IGNORE_GLOBAL_SUPERPOSITION,
      SCENARIO_NAMES.IGNORE_IDONEITY_SOFT,
    ].includes(scenarioName),
  }
}

function nextDateForWeekday(afterDate = '', weekdayKey = 'lunes') {
  const targetIndex = Math.max(0, SPANISH_WEEKDAYS.indexOf(normalizeText(weekdayKey)))
  const date = new Date(`${afterDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = new Date(date)
    candidate.setDate(date.getDate() + offset)
    if (candidate.getDay() === targetIndex) return candidate.toISOString().slice(0, 10)
  }
  return ''
}

function mostAvailableWeekday(teachers = []) {
  const counts = {}
  asArray(teachers).forEach((docente) => {
    getAttendanceDays(docente).forEach((day) => {
      counts[day] = (counts[day] ?? 0) + 1
    })
  })
  return topEntries(counts, 1)[0]?.key ?? 'lunes'
}

function addOneExtraDate(calendar = [], teachers = []) {
  const normalized = normalizeCalendar(calendar)
  const maxDate = normalized.map((slot) => slot.fecha).sort().at(-1)
  const weekday = mostAvailableWeekday(teachers)
  const nextDate = nextDateForWeekday(maxDate, weekday)
  if (!nextDate) return normalized

  const firstSlot = normalized[0] ?? {}
  return [
    ...normalized,
    {
      fecha: nextDate,
      diaSemana: weekday,
      turno: firstSlot.turno || 'noche',
      llamado: firstSlot.llamado || 'PRIMER_LLAMADO',
      disponible: true,
      synthetic: true,
    },
  ]
}

function evaluateAllCases({ allMesas = [], context = {}, scenario = {}, options = {} } = {}) {
  return allMesas.map((entry, index) => {
    const raw = evaluateMesaFeasibility({
      mesa: entry.mesa,
      teachers: context.teachers,
      docenteMap: context.docenteMap,
      calendar: scenario.calendar ?? context.calendar,
      plannedItems: context.plannedItems,
      ignoreSuperposition: true,
      ignoreIdoneity: scenario.ignoreIdoneity === true,
      ignoreCupo: true,
    }).metrics
    const constrained = evaluateMesaFeasibility({
      mesa: entry.mesa,
      teachers: context.teachers,
      docenteMap: context.docenteMap,
      calendar: scenario.calendar ?? context.calendar,
      plannedItems: context.plannedItems,
      ignoreSuperposition: scenario.ignoreSuperposition === true,
      ignoreIdoneity: scenario.ignoreIdoneity === true,
    }).metrics
    const noSuperposition = scenario.ignoreSuperposition
      ? constrained
      : evaluateMesaFeasibility({
          mesa: entry.mesa,
          teachers: context.teachers,
          docenteMap: context.docenteMap,
          calendar: scenario.calendar ?? context.calendar,
          plannedItems: context.plannedItems,
          ignoreSuperposition: true,
          ignoreIdoneity: scenario.ignoreIdoneity === true,
        }).metrics
    const identityBlocked = shouldIdentityBlock(entry.mesa, options)
    const classification = classifyCase({
      raw,
      constrained,
      noSuperposition,
      identityBlocked,
    })

    return createCaseRow({
      mesa: entry.mesa,
      index,
      source: entry.source,
      raw,
      constrained,
      noSuperposition,
      classification,
      identityBlocked,
    })
  })
}

function buildDateCapacity({ allMesas = [], context = {} } = {}) {
  return context.calendar.map((slot) => {
    const candidateMesas = allMesas.filter((entry) => getCandidateSlots(entry.mesa, [slot]).length > 0)
    const titularesDisponibles = new Set()
    const vocalesDisponibles = new Set()
    const docentesDisponibles = new Set()
    const docentesOcupados = new Set()
    const carreras = {}
    const anios = {}

    asArray(context.plannedItems).forEach((mesa) => {
      if (getMesaDate(mesa) !== slot.fecha || normalizeText(mesa.turno) !== normalizeText(slot.turno)) return
      getMesaRoleEntries(mesa).forEach((entry) => docentesOcupados.add(normalizeText(entry.docenteId)))
    })

    context.teachers.forEach((docente) => {
      const docenteId = getDocenteId(docente)
      if (!docenteId || !teacherIsAvailableOnDate(docente, slot.fecha) || !teacherMatchesTurno(docente, slot.turno)) return
      docentesDisponibles.add(normalizeText(docenteId))
      const usage = getTeacherUsage(docente, docenteId, context.participaciones, slot.llamado)
      if (usage.available) vocalesDisponibles.add(normalizeText(docenteId))
    })

    candidateMesas.forEach((entry) => {
      const titular = getTeacherById(context.docenteMap, entry.mesa.titularId)
      if (titular && teacherIsAvailableOnDate(titular, slot.fecha)) titularesDisponibles.add(normalizeText(entry.mesa.titularId))
      const carrera = normalizeCaseKey(entry.mesa.carrera || entry.mesa.carreraId)
      const anio = String(numberOrZero(entry.mesa.anio))
      carreras[carrera] = (carreras[carrera] ?? 0) + 1
      anios[anio] = (anios[anio] ?? 0) + 1
    })

    const demandaVocales = candidateMesas.length * 2
    const capacidadVocalPotencial = [...vocalesDisponibles].filter((docenteId) => !docentesOcupados.has(docenteId)).length

    return {
      fecha: slot.fecha,
      llamado: slot.llamado,
      turno: slot.turno,
      mesasCandidatas: candidateMesas.length,
      titularesDisponibles: titularesDisponibles.size,
      vocalesDisponibles: vocalesDisponibles.size,
      docentesUnicosDisponibles: docentesDisponibles.size,
      docentesYaOcupados: docentesOcupados.size,
      capacidadVocalPotencial,
      demandaVocales,
      brechaVocales: Math.max(0, demandaVocales - capacidadVocalPotencial),
      carrerasConcentradas: topEntries(carreras, 5),
      aniosConcentrados: topEntries(anios, 5),
      materiasCriticas: candidateMesas.slice(0, 10).map((entry) => normalizeCaseKey(entry.mesa.materia || entry.mesa.materiaId)),
    }
  })
}

function buildTeacherBottlenecks({ cases = [], context = {} } = {}) {
  const blocks = {}
  cases.forEach((item) => {
    Object.entries(item.blockedBy ?? {}).forEach(([cause, count]) => {
      blocks[cause] = (blocks[cause] ?? 0) + numberOrZero(count)
    })
  })

  return context.teachers.map((docente, index) => {
    const docenteId = getDocenteId(docente)
    const docenteKey = normalizeText(docenteId)
    const titularCount = context.allMesas.filter((entry) => normalizeText(entry.mesa.titularId) === docenteKey).length
    const possibleVocalCount = context.allMesas.filter((entry) => (
      normalizeText(entry.mesa.titularId) !== docenteKey &&
      getNivelAfinidadDocenteMesa(docente, entry.mesa).afinidadValida
    )).length
    const limite = calcularLimiteVocaliasPorLlamado(docente)
    const usoActual = ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO', 'LLAMADO_ESPECIAL']
      .reduce((total, llamado) => total + contarVocaliasPorDocente(context.participaciones, docenteId, llamado), 0)
    const noAsisteBlocks = context.allMesas.reduce((total, entry) => {
      const slots = getCandidateSlots(entry.mesa, context.calendar)
      return total + slots.filter((slot) => !teacherIsAvailableOnDate(docente, slot.fecha)).length
    }, 0)
    const superpositionBlocks = context.allMesas.reduce((total, entry) => {
      const schedule = buildTeacherSchedule(context.plannedItems, entry.mesa.id)
      const slots = getCandidateSlots(entry.mesa, context.calendar)
      return total + slots.filter((slot) => teacherHasScheduleConflict(schedule, docenteId, slot)).length
    }, 0)
    const idoneityBlocks = context.allMesas.filter((entry) => !getNivelAfinidadDocenteMesa(docente, entry.mesa).afinidadValida).length
    const bottleneckScore = titularCount * 10 + possibleVocalCount + noAsisteBlocks + superpositionBlocks * 2 + Math.max(0, usoActual - limite) * 20

    return {
      docenteAnonId: `DOC-${String(index + 1).padStart(3, '0')}`,
      docenteId,
      diasAsistencia: getAttendanceDays(docente),
      horasCatedra: getTeachingHours(docente),
      cupoVocaliasHorasCatedra: limite,
      usoActualCupo: usoActual,
      requeridoComoTitular: titularCount,
      requeridoComoVocalPosible: possibleVocalCount,
      bloqueosPorNoAsistir: noAsisteBlocks,
      bloqueosPorSuperposicion: superpositionBlocks,
      bloqueosPorIdoneidad: idoneityBlocks,
      cuelloDeBotella: bottleneckScore >= 20 || titularCount >= 4 || superpositionBlocks >= 4,
      bottleneckScore,
    }
  }).sort((left, right) => right.bottleneckScore - left.bottleneckScore)
}

function buildSubjectBottlenecks(cases = []) {
  return cases
    .filter((item) => ![
      SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_FULL,
      SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_MINIMUM_REVIEW,
    ].includes(item.classification))
    .map((item) => ({
      caseId: item.caseId,
      carreraKey: item.carreraKey,
      materiaKey: item.materiaKey,
      anio: item.anio,
      llamado: item.llamado,
      classification: item.classification,
      blockedBy: item.blockedBy,
    }))
}

function chooseBestScenario(scenarios = []) {
  return [...scenarios].sort((left, right) => (
    right.fullFeasible - left.fullFeasible ||
    right.minimumReviewFeasible - left.minimumReviewFeasible ||
    left.manualRequired - right.manualRequired
  ))[0] ?? null
}

function buildRecommendations(summary = {}, bestScenario = null) {
  const recommendations = [
    'Mantener mitad mas uno por horas catedra.',
    'Mantener asistencia por dia como restriccion obligatoria.',
    'Mantener safeToReplaceLegacy en false.',
    'Cerrar identidad v2 antes de una comparacion final compactada.',
  ]

  if (bestScenario?.scenario === SCENARIO_NAMES.IGNORE_GLOBAL_SUPERPOSITION) {
    recommendations.push('El cuello principal parece ser la superposicion global; evaluar mas fechas o redistribucion conjunta.')
  } else if (bestScenario?.scenario === SCENARIO_NAMES.ADD_ONE_EXTRA_DATE) {
    recommendations.push('Agregar fechas puede aliviar el cuello; simular calendario ampliado por llamado antes de agosto.')
  } else if (summary.calendarTooRestrictive > summary.noVocalPool) {
    recommendations.push('El problema parece estructural de calendario/disponibilidad; ampliar fechas o revisar asistencia declarada.')
  } else {
    recommendations.push('Revisar disponibilidad, afinidades y docentes habilitados para vocalias.')
  }

  return recommendations
}

export function auditSchedulingFeasibilityCapacity({ snapshot, options = {} } = {}) {
  const safeInput = options.input ?? buildRegularExamInputFromWorkspaceSnapshot(cloneJson(snapshot ?? {}))
  const basePlan = options.plan ?? planWithJointDateVocalPlanner(safeInput, { minimumVocalesToPlan: 0 })
  const teachers = asArray(safeInput.docentes)
  const calendar = normalizeCalendar(safeInput.fechasDisponibles)
  const docenteMap = buildDocenteMap(teachers)
  const allMesas = [
    ...asArray(basePlan.plannedMesas).map((mesa) => ({ mesa, source: 'planned' })),
    ...asArray(basePlan.unassignedMesas).map((mesa) => ({ mesa, source: 'unplanned' })),
  ]
  const context = {
    teachers,
    docenteMap,
    calendar,
    plannedItems: asArray(basePlan.plannedMesas),
    participaciones: asArray(basePlan.participaciones),
    allMesas,
  }

  const strictCases = evaluateAllCases({
    allMesas,
    context,
    scenario: {},
    options,
  })
  const includeInternalScenarioComparisons = options.includeInternalScenarioComparisons !== false
  const scenarioCases = includeInternalScenarioComparisons
    ? {
        [SCENARIO_NAMES.STRICT_CURRENT]: strictCases,
        [SCENARIO_NAMES.IGNORE_GLOBAL_SUPERPOSITION]: evaluateAllCases({
          allMesas,
          context,
          scenario: { ignoreSuperposition: true },
          options,
        }),
        [SCENARIO_NAMES.IGNORE_IDONEITY_SOFT]: evaluateAllCases({
          allMesas,
          context,
          scenario: { ignoreIdoneity: true },
          options,
        }),
        [SCENARIO_NAMES.ADD_ONE_EXTRA_DATE]: evaluateAllCases({
          allMesas,
          context,
          scenario: { calendar: addOneExtraDate(calendar, teachers) },
          options,
        }),
        [SCENARIO_NAMES.MINIMUM_ONE_VOCAL_REVIEW]: strictCases,
      }
    : {
        [SCENARIO_NAMES.STRICT_CURRENT]: strictCases,
      }
  const scenarioComparisons = Object.entries(scenarioCases).map(([scenarioName, cases]) => (
    compareScenarioCases(cases, scenarioName)
  ))
  const classificationCounts = countBy(strictCases, (item) => item.classification)
  const bestScenario = chooseBestScenario(scenarioComparisons)
  const dateCapacity = buildDateCapacity({ allMesas, context })
  const teacherBottlenecks = buildTeacherBottlenecks({ cases: strictCases, context })
  const subjectBottlenecks = buildSubjectBottlenecks(strictCases)

  const summary = {
    safeToReplaceLegacy: false,
    readyForOfficialGeneration: false,
    totalMesasAnalizadas: strictCases.length,
    fullFeasible: numberOrZero(classificationCounts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_FULL]),
    minimumReviewFeasible: numberOrZero(classificationCounts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_MINIMUM_REVIEW]),
    titleOnly: numberOrZero(classificationCounts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.TITLE_ONLY_REVIEW]),
    noTitleDate: numberOrZero(classificationCounts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.NO_TITLE_DATE]),
    noVocalPool: numberOrZero(classificationCounts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.NO_VOCAL_POOL]),
    calendarTooRestrictive: numberOrZero(classificationCounts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.CALENDAR_TOO_RESTRICTIVE]),
    blockedBySuperposition: numberOrZero(classificationCounts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.BLOCKED_BY_SUPERPOSITION]),
    manualRequired: numberOrZero(classificationCounts[SCHEDULING_FEASIBILITY_CLASSIFICATIONS.MANUAL_REQUIRED]),
    classificationCounts,
    topCuello: topEntries(classificationCounts, 1)[0]?.key ?? '',
    bestScenario: bestScenario?.scenario ?? '',
    recommendationForAugust: 'Usar como preview de apoyo; ampliar calendario/disponibilidad y cerrar identidad v2 antes de un uso operativo.',
    identityV2PendingHomonymies: 34,
    readyForIdentityV2: false,
  }

  return {
    summary,
    examFeasibilityCases: strictCases,
    dateCapacity,
    teacherBottlenecks,
    subjectBottlenecks,
    scenarioComparisons,
    recommendations: buildRecommendations(summary, bestScenario),
    warnings: [
      'Auditoria read-only; no guarda ni publica cronogramas.',
      'Los escenarios IGNORE_* son diagnosticos y no normativos.',
      'safeToReplaceLegacy permanece false.',
    ],
    errors: [],
    privacy: {
      consoleSafe: true,
      noFullTeacherNames: true,
      normalizedCaseKeys: true,
    },
  }
}
