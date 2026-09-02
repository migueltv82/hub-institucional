import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { normalizeLlamado } from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { auditSchedulingFeasibilityCapacity } from '../audit/auditSchedulingFeasibilityCapacity.js'
import { planWithJointDateVocalPlanner } from './jointDateVocalPlanner.js'

export const CALENDAR_EXPANSION_SCENARIOS = Object.freeze({
  BASELINE_CURRENT: 'BASELINE_CURRENT',
  ADD_1_DATE: 'ADD_1_DATE',
  ADD_2_DATES: 'ADD_2_DATES',
  ADD_3_DATES: 'ADD_3_DATES',
  SPREAD_BY_CAREER: 'SPREAD_BY_CAREER',
  SPREAD_BY_TEACHER_BOTTLENECK: 'SPREAD_BY_TEACHER_BOTTLENECK',
  SPREAD_BY_CRITICAL_SUBJECTS: 'SPREAD_BY_CRITICAL_SUBJECTS',
  HYBRID_EXPANSION_AND_SPREAD: 'HYBRID_EXPANSION_AND_SPREAD',
})

const WEEKDAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
]

const SCENARIO_CONFIGS = [
  {
    name: CALENDAR_EXPANSION_SCENARIOS.BASELINE_CURRENT,
    extraDates: 0,
    strategy: 'baseline',
  },
  {
    name: CALENDAR_EXPANSION_SCENARIOS.ADD_1_DATE,
    extraDates: 1,
    strategy: 'availability',
  },
  {
    name: CALENDAR_EXPANSION_SCENARIOS.ADD_2_DATES,
    extraDates: 2,
    strategy: 'availability',
  },
  {
    name: CALENDAR_EXPANSION_SCENARIOS.ADD_3_DATES,
    extraDates: 3,
    strategy: 'availability',
  },
  {
    name: CALENDAR_EXPANSION_SCENARIOS.SPREAD_BY_CAREER,
    extraDates: 3,
    strategy: 'career',
  },
  {
    name: CALENDAR_EXPANSION_SCENARIOS.SPREAD_BY_TEACHER_BOTTLENECK,
    extraDates: 3,
    strategy: 'teacherBottleneck',
  },
  {
    name: CALENDAR_EXPANSION_SCENARIOS.SPREAD_BY_CRITICAL_SUBJECTS,
    extraDates: 3,
    strategy: 'criticalSubjects',
  },
  {
    name: CALENDAR_EXPANSION_SCENARIOS.HYBRID_EXPANSION_AND_SPREAD,
    extraDates: 3,
    strategy: 'hybrid',
  },
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
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

function performanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundMs(value) {
  return Math.round(numberOrZero(value) * 100) / 100
}

function normalizeWeekday(value = '') {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function weekdayFromIsoDate(dateText = '') {
  const date = new Date(`${clean(dateText)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return WEEKDAY_NAMES[date.getDay()]
}

function toIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeSlot(slot = {}) {
  const fecha = clean(slot.fecha ?? slot.fechaIso ?? slot.date)
  const day = normalizeWeekday(slot.diaSemana ?? slot.dia ?? slot.day) || weekdayFromIsoDate(fecha)

  return {
    ...cloneJson(slot),
    id: clean(slot.id ?? slot.fechaId ?? slot.dateId),
    fecha,
    fechaIso: fecha,
    diaSemana: day.toUpperCase(),
    day,
    turno: normalizeText(slot.turno ?? slot.shift ?? 'NOCHE').toUpperCase(),
    llamado: normalizeLlamado(slot.llamado ?? slot.exam_call ?? slot.callKey),
    disponible: slot.disponible !== false && slot.available !== false,
    isSimulated: slot.isSimulated === true,
    synthetic: slot.synthetic === true || slot.isSimulated === true,
  }
}

function sortCalendar(calendar = []) {
  return [...calendar].sort((left, right) => (
    clean(left.fecha).localeCompare(clean(right.fecha)) ||
    clean(left.llamado).localeCompare(clean(right.llamado)) ||
    clean(left.turno).localeCompare(clean(right.turno))
  ))
}

function normalizeCalendar(calendar = []) {
  return sortCalendar(asArray(calendar).map(normalizeSlot).filter((slot) => slot.fecha && slot.disponible))
}

function countBy(items = [], getKey = (item) => item) {
  return items.reduce((counts, item) => {
    const key = clean(getKey(item)) || 'otro'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function topEntries(counts = {}, limit = 10) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count: numberOrZero(count) }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function addWeighted(counts, key = '', weight = 1) {
  const normalized = normalizeWeekday(key)
  if (!normalized) return
  counts[normalized] = (counts[normalized] ?? 0) + numberOrZero(weight)
}

function getAttendanceDays(docente = {}) {
  return [
    docente.diasAsistencia,
    docente.diasDisponibles,
    docente.disponibilidad,
    docente.diasLaborales,
    asArray(docente.availability).map((entry) => entry?.dia ?? entry?.diaSemana ?? entry?.day),
  ].flat().map(normalizeWeekday).filter(Boolean)
}

function weekdayRankingFromTeachers(docentes = []) {
  const counts = {}
  asArray(docentes).forEach((docente) => {
    getAttendanceDays(docente).forEach((day) => addWeighted(counts, day, 1))
  })
  const ranking = topEntries(counts, 7).map((entry) => entry.key)
  return ranking.length ? ranking : ['lunes']
}

function weekdayRankingFromBottlenecks(bottlenecks = []) {
  const counts = {}
  asArray(bottlenecks).slice(0, 20).forEach((teacher) => {
    asArray(teacher.diasAsistencia).forEach((day) => (
      addWeighted(counts, day, Math.max(1, numberOrZero(teacher.bottleneckScore)))
    ))
  })
  return topEntries(counts, 7).map((entry) => entry.key)
}

function weekdayRankingFromDateCapacity(dateCapacity = [], calendar = []) {
  const slotByKey = new Map(calendar.map((slot) => [
    [slot.fecha, slot.llamado, slot.turno].map(clean).join('::'),
    slot,
  ]))
  const counts = {}

  asArray(dateCapacity).forEach((dateRow) => {
    const key = [dateRow.fecha, dateRow.llamado, dateRow.turno].map(clean).join('::')
    const day = slotByKey.get(key)?.day ?? weekdayFromIsoDate(dateRow.fecha)
    const weight = numberOrZero(dateRow.brechaVocales) + numberOrZero(dateRow.mesasCandidatas)
    addWeighted(counts, day, Math.max(1, weight))
  })

  return topEntries(counts, 7).map((entry) => entry.key)
}

function weekdayRankingFromBlockedCases(cases = [], calendar = []) {
  const counts = {}
  const calendarDays = [...new Set(calendar.map((slot) => slot.day).filter(Boolean))]
  const blocked = asArray(cases).filter((row) => [
    'BLOCKED_BY_SUPERPOSITION',
    'CALENDAR_TOO_RESTRICTIVE',
    'FEASIBLE_MINIMUM_REVIEW',
    'MANUAL_REQUIRED',
  ].includes(row.classification))
  const weight = Math.max(1, blocked.length)

  calendarDays.forEach((day) => addWeighted(counts, day, weight))
  return topEntries(counts, 7).map((entry) => entry.key)
}

function mergeRankings(...rankings) {
  const seen = new Set()
  const merged = []

  rankings.flat().forEach((day) => {
    const normalized = normalizeWeekday(day)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    merged.push(normalized)
  })

  return merged.length ? merged : ['lunes']
}

function mergeCalls(...rankings) {
  const seen = new Set()
  const merged = []

  rankings.flat().forEach((llamado) => {
    const normalized = normalizeLlamado(llamado)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    merged.push(normalized)
  })

  return merged
}

function buildStrategyWeekdays({ strategy = 'availability', input = {}, baselineAudit = {}, calendar = [] } = {}) {
  const availability = weekdayRankingFromTeachers(input.docentes)
  const bottlenecks = weekdayRankingFromBottlenecks(baselineAudit.teacherBottlenecks)
  const dateCapacity = weekdayRankingFromDateCapacity(baselineAudit.dateCapacity, calendar)
  const critical = weekdayRankingFromBlockedCases(baselineAudit.examFeasibilityCases, calendar)

  if (strategy === 'teacherBottleneck') return mergeRankings(bottlenecks, availability)
  if (strategy === 'career') return mergeRankings(dateCapacity, availability)
  if (strategy === 'criticalSubjects') return mergeRankings(critical, dateCapacity, availability)
  if (strategy === 'hybrid') return mergeRankings(bottlenecks, critical, dateCapacity, availability)
  return availability
}

function rankedCallsFromCases(cases = [], calendar = []) {
  const counts = countBy(
    asArray(cases).filter((row) => [
      'BLOCKED_BY_SUPERPOSITION',
      'CALENDAR_TOO_RESTRICTIVE',
      'MANUAL_REQUIRED',
    ].includes(row.classification)),
    (row) => normalizeLlamado(row.llamado),
  )
  const ranked = topEntries(counts, 4).map((entry) => entry.key)
  const existing = [...new Set(calendar.map((slot) => normalizeLlamado(slot.llamado)).filter(Boolean))]

  return mergeCalls(ranked, existing)
}

function mostCommonTurno(calendar = []) {
  return topEntries(countBy(calendar, (slot) => normalizeText(slot.turno).toUpperCase()), 1)[0]?.key || 'NOCHE'
}

function latestDateForCall(calendar = [], llamado = '') {
  const dates = calendar
    .filter((slot) => !llamado || normalizeLlamado(slot.llamado) === normalizeLlamado(llamado))
    .map((slot) => slot.fecha)
    .filter(Boolean)
    .sort()
  return dates.at(-1) ?? calendar.map((slot) => slot.fecha).filter(Boolean).sort().at(-1) ?? ''
}

function nextDateForWeekday({ afterDate = '', weekday = 'lunes', usedKeys = new Set(), llamado = '', turno = '' } = {}) {
  const targetIndex = WEEKDAY_NAMES.indexOf(normalizeWeekday(weekday))
  const date = new Date(`${afterDate}T00:00:00`)
  if (targetIndex < 0 || Number.isNaN(date.getTime())) return ''

  for (let offset = 1; offset <= 70; offset += 1) {
    const candidate = new Date(date)
    candidate.setDate(date.getDate() + offset)
    const iso = toIsoDate(candidate)
    const candidateKey = [iso, normalizeLlamado(llamado), normalizeText(turno).toUpperCase()].join('::')
    if (candidate.getDay() === targetIndex && !usedKeys.has(candidateKey)) return iso
  }

  return ''
}

function createSimulatedSlots({
  baseCalendar = [],
  count = 0,
  scenarioName = '',
  weekdays = [],
  callRanking = [],
} = {}) {
  if (count <= 0) return []

  const usedKeys = new Set(baseCalendar.map((slot) => [
    slot.fecha,
    normalizeLlamado(slot.llamado),
    normalizeText(slot.turno).toUpperCase(),
  ].join('::')))
  const turno = mostCommonTurno(baseCalendar)
  const calls = callRanking.length ? callRanking : ['PRIMER_LLAMADO']
  const days = weekdays.length ? weekdays : ['lunes']
  const generated = []

  for (let index = 0; index < count; index += 1) {
    const llamado = normalizeLlamado(calls[index % calls.length])
    const weekday = days[index % days.length]
    const afterDate = latestDateForCall([...baseCalendar, ...generated], llamado)
    const fecha = nextDateForWeekday({
      afterDate,
      weekday,
      usedKeys,
      llamado,
      turno,
    })
    if (!fecha) continue

    const simulatedId = `SIM_EXTRA_DATE_${index + 1}`
    const slot = normalizeSlot({
      id: simulatedId,
      fechaId: simulatedId,
      fecha,
      diaSemana: weekday.toUpperCase(),
      day: weekday,
      llamado,
      turno,
      disponible: true,
      available: true,
      isSimulated: true,
      synthetic: true,
      simulationScenario: scenarioName,
      simulationReason: 'calendar_expansion_audit',
    })
    usedKeys.add([slot.fecha, slot.llamado, slot.turno].join('::'))
    generated.push(slot)
  }

  return generated
}

function createScenarioCalendar({ baseCalendar = [], scenario = {}, input = {}, baselineAudit = {} } = {}) {
  const normalizedBase = normalizeCalendar(baseCalendar)
  const weekdays = buildStrategyWeekdays({
    strategy: scenario.strategy,
    input,
    baselineAudit,
    calendar: normalizedBase,
  })
  const callRanking = rankedCallsFromCases(baselineAudit.examFeasibilityCases, normalizedBase)
  const simulatedDates = createSimulatedSlots({
    baseCalendar: normalizedBase,
    count: scenario.extraDates,
    scenarioName: scenario.name,
    weekdays,
    callRanking,
  })

  return {
    calendar: sortCalendar([...normalizedBase, ...simulatedDates]),
    simulatedDates,
    strategyWeekdays: weekdays,
    callRanking,
  }
}

function getMesaDate(mesa = {}) {
  return clean(mesa.fecha ?? mesa.fechaIso)
}

function countPlanSuperpositions(plannedMesas = []) {
  const seen = new Set()
  let duplicates = 0

  asArray(plannedMesas).forEach((mesa) => {
    const fecha = getMesaDate(mesa)
    if (!fecha) return
    ;[mesa.titularId, mesa.vocal1Id, mesa.vocal2Id].filter(clean).forEach((docenteId) => {
      const key = [normalizeText(docenteId), fecha, normalizeText(mesa.turno)].join('::')
      if (seen.has(key)) duplicates += 1
      seen.add(key)
    })
  })

  return duplicates
}

function countTribunalIntegrityIssues(plannedMesas = []) {
  return asArray(plannedMesas).reduce((counts, mesa) => {
    const vocales = [mesa.vocal1Id, mesa.vocal2Id].filter(clean)
    if (vocales.some((vocalId) => normalizeText(vocalId) === normalizeText(mesa.titularId))) {
      counts.titularAsVocal += 1
    }
    if (new Set(vocales.map(normalizeText)).size !== vocales.length) {
      counts.duplicateVocales += 1
    }
    return counts
  }, {
    titularAsVocal: 0,
    duplicateVocales: 0,
  })
}

function summarizePlanIntegrity(plan = {}) {
  const tribunal = countTribunalIntegrityIssues(plan.plannedMesas)

  return {
    superpositionsInPlan: countPlanSuperpositions(plan.plannedMesas),
    titularAsVocal: tribunal.titularAsVocal,
    duplicateVocales: tribunal.duplicateVocales,
  }
}

function summarizeScenario({
  scenario = {},
  calendar = [],
  simulatedDates = [],
  strategyWeekdays = [],
  callRanking = [],
  plan = {},
  audit = {},
  durationMs = 0,
} = {}) {
  const totalMesas = numberOrZero(audit.summary?.totalMesasAnalizadas ?? plan.summary?.totalMesas)
  const full = numberOrZero(audit.summary?.fullFeasible)
  const minimum = numberOrZero(audit.summary?.minimumReviewFeasible)
  const manual = Math.max(0, totalMesas - full - minimum)
  const usedDates = [...new Set(asArray(plan.plannedMesas).map(getMesaDate).filter(Boolean))]
  const simulatedDateKeys = [...new Set(simulatedDates.map((slot) => slot.fecha).filter(Boolean))]
  const quota = plan.summary?.consumoCupo ?? {}

  return {
    scenario: scenario.name,
    strategy: scenario.strategy,
    totalMesas,
    full,
    minimumReview: minimum,
    manual,
    totalPlanned: numberOrZero(plan.summary?.totalPlanned),
    totalUnassigned: numberOrZero(plan.summary?.totalUnassigned),
    completionRate: numberOrZero(plan.summary?.completionRate),
    mesasSinFecha: numberOrZero(plan.summary?.mesasSinFecha ?? plan.summary?.totalUnassigned),
    blockedBySuperposition: numberOrZero(audit.summary?.blockedBySuperposition),
    blockedByCalendar: numberOrZero(audit.summary?.calendarTooRestrictive) + numberOrZero(audit.summary?.noTitleDate),
    blockedByIdoneity: numberOrZero(audit.summary?.noVocalPool),
    docentesExcedidos: numberOrZero(quota.docentesExcedidos ?? plan.summary?.docentesSobreutilizados),
    maxUsoCupo: numberOrZero(quota.maxUsoCupo),
    fechasUsadas: usedDates.length,
    fechasDisponibles: calendar.length,
    fechasSimuladas: simulatedDateKeys.length,
    simulatedDateIds: simulatedDates.map((slot) => slot.id),
    simulatedDates: simulatedDates.map((slot) => ({
      id: slot.id,
      fecha: slot.fecha,
      diaSemana: slot.diaSemana,
      llamado: slot.llamado,
      turno: slot.turno,
      isSimulated: slot.isSimulated,
    })),
    strategyWeekdays,
    callRanking,
    integrity: summarizePlanIntegrity(plan),
    durationMs: roundMs(durationMs),
    safeToReplaceLegacy: false,
    readyForOfficialGeneration: false,
  }
}

function runScenario({ scenario = {}, baseInput = {}, baseCalendar = [], baselineAudit = {}, options = {} } = {}) {
  const startedAt = performanceNow()
  const scenarioCalendar = createScenarioCalendar({
    baseCalendar,
    scenario,
    input: baseInput,
    baselineAudit,
  })
  const scenarioInput = {
    ...cloneJson(baseInput),
    fechasDisponibles: scenarioCalendar.calendar,
    metadata: {
      ...(cloneJson(baseInput.metadata) ?? {}),
      calendarExpansionScenario: scenario.name,
      simulatedDates: scenarioCalendar.simulatedDates.map((slot) => slot.id),
    },
  }
  const plannerOptions = {
    minimumVocalesToPlan: 0,
    ...(options.plannerOptions ?? {}),
  }
  const plan = planWithJointDateVocalPlanner(scenarioInput, plannerOptions)
  const audit = auditSchedulingFeasibilityCapacity({
    snapshot: {},
    options: {
      includeInternalScenarioComparisons: false,
      ...(options.feasibilityOptions ?? {}),
      input: scenarioInput,
      plan,
    },
  })

  return {
    scenario: scenario.name,
    calendar: scenarioCalendar.calendar,
    simulatedDates: scenarioCalendar.simulatedDates,
    planSummary: plan.summary,
    auditSummary: audit.summary,
    result: summarizeScenario({
      scenario,
      calendar: scenarioCalendar.calendar,
      simulatedDates: scenarioCalendar.simulatedDates,
      strategyWeekdays: scenarioCalendar.strategyWeekdays,
      callRanking: scenarioCalendar.callRanking,
      plan,
      audit,
      durationMs: performanceNow() - startedAt,
    }),
    plan,
    audit,
  }
}

export function simulateCalendarExpansion({ snapshot, baseCalendar, options = {} } = {}) {
  const startedAt = performanceNow()
  const baseInput = options.input
    ? cloneJson(options.input)
    : buildRegularExamInputFromWorkspaceSnapshot(cloneJson(snapshot ?? {}))
  const normalizedBaseCalendar = normalizeCalendar(baseCalendar ?? baseInput.fechasDisponibles)
  const safeBaseInput = {
    ...baseInput,
    fechasDisponibles: normalizedBaseCalendar,
  }
  const baselinePlan = options.baselinePlan ?? planWithJointDateVocalPlanner(safeBaseInput, {
    minimumVocalesToPlan: 0,
    ...(options.plannerOptions ?? {}),
  })
  const baselineAudit = options.baselineAudit ?? auditSchedulingFeasibilityCapacity({
    snapshot: {},
    options: {
      includeInternalScenarioComparisons: false,
      ...(options.feasibilityOptions ?? {}),
      input: safeBaseInput,
      plan: baselinePlan,
    },
  })
  const scenarioRuns = SCENARIO_CONFIGS.map((scenario) => {
    if (scenario.name === CALENDAR_EXPANSION_SCENARIOS.BASELINE_CURRENT) {
      return {
        scenario: scenario.name,
        calendar: normalizedBaseCalendar,
        simulatedDates: [],
        planSummary: baselinePlan.summary,
        auditSummary: baselineAudit.summary,
        result: summarizeScenario({
          scenario,
          calendar: normalizedBaseCalendar,
          simulatedDates: [],
          strategyWeekdays: weekdayRankingFromTeachers(safeBaseInput.docentes),
          callRanking: rankedCallsFromCases(baselineAudit.examFeasibilityCases, normalizedBaseCalendar),
          plan: baselinePlan,
          audit: baselineAudit,
          durationMs: 0,
        }),
        plan: baselinePlan,
        audit: baselineAudit,
      }
    }

    return runScenario({
      scenario,
      baseInput: safeBaseInput,
      baseCalendar: normalizedBaseCalendar,
      baselineAudit,
      options,
    })
  })

  return {
    summary: {
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      scenarioCount: scenarioRuns.length,
      baseCalendarDates: normalizedBaseCalendar.length,
      maxSimulatedDatesPerScenario: Math.max(...scenarioRuns.map((run) => run.simulatedDates.length)),
      durationMs: roundMs(performanceNow() - startedAt),
    },
    scenarioResults: scenarioRuns.map((run) => run.result),
    scenarios: scenarioRuns,
    warnings: [
      'Simulacion read-only: las fechas agregadas no son oficiales.',
      'No guarda ni publica cronogramas.',
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
