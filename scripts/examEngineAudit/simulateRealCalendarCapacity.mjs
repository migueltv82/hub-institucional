import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { buildRegularExamPreviewIntegrationContract } from '../../src/utils/examEngine/preview/index.js'
import { buildExamEngineEfficiencySummary } from '../../src/utils/examEngine/audit/efficiencySummary.js'
import { buildTeacherDateDiagnostics } from '../../src/utils/examEngine/audit/dateAndTurnNeedsDiagnosis.js'
import { createExtendedDatesInput } from '../../src/utils/examEngine/audit/planningFailureDiagnosis.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_SNAPSHOT_PATH = resolve(REPO_ROOT, 'local-audit/workspaceSnapshot.real.local.json')

const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
]

const DAY_ALIASES = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miercoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sabado',
  lunes: 'lunes',
  martes: 'martes',
  miercoles: 'miercoles',
  jueves: 'jueves',
  viernes: 'viernes',
  sabado: 'sabado',
  domingo: 'domingo',
}

const FIXED_PRIORITY_DAYS = ['jueves', 'lunes', 'martes']
const THRESHOLDS = [0.7, 0.75, 0.8, 0.85]

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

function normalizeDay(value) {
  return DAY_ALIASES[normalizeToken(value)] ?? ''
}

function fail(message) {
  console.error(`[examEngine calendar capacity] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
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

function dayFromIsoDate(value) {
  const date = parseIsoDate(value)
  return date ? DAY_NAMES[date.getDay()] : ''
}

function dateSlotDay(slot = {}) {
  return normalizeDay(slot.diaSemana ?? slot.dia ?? slot.day) || dayFromIsoDate(slot.fecha ?? slot.fechaIso)
}

function dateSlotCall(slot = {}) {
  return clean(slot.llamado ?? slot.exam_call ?? slot.callKey) || 'SIN_LLAMADO'
}

function dateSlotTurn(slot = {}) {
  return clean(slot.turno ?? slot.shift) || 'SIN_TURNO'
}

function countBy(values = [], keyFn = (value) => value) {
  return values.reduce((counts, value) => {
    const key = clean(keyFn(value)) || 'sin_dato'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function sortDateSlots(slots = []) {
  return [...slots].sort((left, right) => (
    dateSlotCall(left).localeCompare(dateSlotCall(right)) ||
    clean(left.fecha).localeCompare(clean(right.fecha)) ||
    dateSlotTurn(left).localeCompare(dateSlotTurn(right))
  ))
}

function updateConfigDateRange(input = {}) {
  const dates = sortDateSlots(asArray(input.fechasDisponibles))
  input.fechasDisponibles = dates
  input.config = {
    ...(input.config ?? {}),
    fechaFin: dates.reduce((max, slot) => clean(slot.fecha) > clean(max) ? slot.fecha : max, input.config?.fechaFin ?? ''),
  }
  return input
}

function nextDateForDays(fechaIso = '', days = [], existingKeys = new Set(), call = '', turno = '') {
  const start = parseIsoDate(fechaIso)
  if (!start) return null

  const wanted = new Set(days.map(normalizeDay).filter(Boolean))
  const current = new Date(start)
  let guard = 0

  while (guard < 180) {
    current.setDate(current.getDate() + 1)
    guard += 1
    const day = DAY_NAMES[current.getDay()]
    const iso = toIsoDate(current)
    const key = [call, iso, turno].join('::')
    if (wanted.has(day) && !existingKeys.has(key)) return new Date(current)
  }

  return null
}

function createPriorityCalendarInput(input = {}, {
  targetTotalDates,
  priorityDays = FIXED_PRIORITY_DAYS,
} = {}) {
  const next = cloneJson(input)
  const fechas = sortDateSlots(asArray(next.fechasDisponibles))
  const target = Math.max(Number(targetTotalDates) || fechas.length, fechas.length)
  const byCall = fechas.reduce((map, slot) => {
    const call = dateSlotCall(slot)
    const current = map.get(call) ?? []
    current.push(slot)
    map.set(call, current)
    return map
  }, new Map())
  const calls = [...byCall.keys()].sort()
  const existingKeys = new Set(fechas.map((slot) => [dateSlotCall(slot), clean(slot.fecha), dateSlotTurn(slot)].join('::')))
  const additions = []

  while (fechas.length + additions.length < target && calls.length) {
    const call = calls[additions.length % calls.length]
    const callDates = [...asArray(byCall.get(call)), ...additions.filter((slot) => dateSlotCall(slot) === call)]
      .sort((left, right) => clean(left.fecha).localeCompare(clean(right.fecha)))
    const template = callDates.at(-1)
    if (!template) break

    const nextDate = nextDateForDays(template.fecha, priorityDays, existingKeys, call, dateSlotTurn(template))
    if (!nextDate) break

    const slot = {
      ...template,
      fecha: toIsoDate(nextDate),
      diaSemana: DAY_NAMES[nextDate.getDay()].toUpperCase(),
      disponible: true,
    }
    additions.push(slot)
    existingKeys.add([dateSlotCall(slot), clean(slot.fecha), dateSlotTurn(slot)].join('::'))
  }

  next.fechasDisponibles = [...fechas, ...additions]
  return updateConfigDateRange(next)
}

function getRange(input = {}) {
  const dates = sortDateSlots(asArray(input.fechasDisponibles)).map((slot) => clean(slot.fecha)).filter(Boolean)
  return {
    desde: dates[0] ?? '',
    hasta: dates.at(-1) ?? '',
  }
}

function getMetrics(summary = {}, input = {}) {
  return {
    totalFechasDisponibles: asArray(input.fechasDisponibles).length,
    rangoFechas: getRange(input),
    distribucionPorDiaSemana: countBy(input.fechasDisponibles, dateSlotDay),
    totalMesas: summary.totalMesas,
    totalPlanned: summary.totalPlanned,
    totalUnassigned: summary.totalUnassigned,
    mesasCompletas: summary.mesasCompletas,
    mesasConUnVocal: summary.mesasConUnVocal,
    mesasSinTribunal: summary.mesasSinTribunal,
    mesasSinFecha: summary.mesasSinFecha,
    totalCriticalErrors: summary.totalCriticalErrors,
    totalWarnings: summary.totalWarnings,
    totalPendingManualReview: summary.totalPendingManualReview,
    totalCompactadas: summary.totalCompactadas,
    completionRate: summary.completionRate,
  }
}

function buildDelta(metrics = {}, baseline = {}) {
  return {
    totalFechasDisponibles: (metrics.totalFechasDisponibles ?? 0) - (baseline.totalFechasDisponibles ?? 0),
    totalPlanned: (metrics.totalPlanned ?? 0) - (baseline.totalPlanned ?? 0),
    totalUnassigned: (metrics.totalUnassigned ?? 0) - (baseline.totalUnassigned ?? 0),
    mesasCompletas: (metrics.mesasCompletas ?? 0) - (baseline.mesasCompletas ?? 0),
    mesasSinTribunal: (metrics.mesasSinTribunal ?? 0) - (baseline.mesasSinTribunal ?? 0),
    mesasSinFecha: (metrics.mesasSinFecha ?? 0) - (baseline.mesasSinFecha ?? 0),
    totalCriticalErrors: (metrics.totalCriticalErrors ?? 0) - (baseline.totalCriticalErrors ?? 0),
    totalWarnings: (metrics.totalWarnings ?? 0) - (baseline.totalWarnings ?? 0),
    completionRate: Number(((metrics.completionRate ?? 0) - (baseline.completionRate ?? 0)).toFixed(4)),
  }
}

function runScenario({ name, input, baselineMetrics = null, contract = null, metadata = {} }) {
  const scenarioContract = contract ?? buildRegularExamPreviewIntegrationContract(input, {})
  const summary = buildExamEngineEfficiencySummary({
    contract: scenarioContract,
    input,
    metadata: {
      source: 'local-audit-calendar-capacity',
      readOnly: true,
      ...metadata,
    },
  })
  const metrics = getMetrics(summary, input)

  return {
    name,
    metrics,
    mejoraContraActual: baselineMetrics ? buildDelta(metrics, baselineMetrics) : null,
  }
}

function priorityDaysFromDiagnostics(teacherDiagnostics = {}) {
  const days = asArray(teacherDiagnostics.diasConMayorDisponibilidadTitular)
    .map((entry) => normalizeDay(entry.key))
    .filter(Boolean)

  return days.length ? days : FIXED_PRIORITY_DAYS
}

function findFirstThresholds(scenarios = []) {
  return Object.fromEntries(THRESHOLDS.map((threshold) => {
    const scenario = scenarios.find((entry) => (entry.metrics?.completionRate ?? 0) >= threshold)
    return [
      `${Math.round(threshold * 100)}%`,
      scenario
        ? {
            escenario: scenario.name,
            totalFechasDisponibles: scenario.metrics.totalFechasDisponibles,
            completionRate: scenario.metrics.completionRate,
          }
        : null,
    ]
  }))
}

function findMinimumDatesByThreshold(results = []) {
  return Object.fromEntries(THRESHOLDS.map((threshold) => {
    const scenario = [...results]
      .filter((entry) => (entry.metrics?.completionRate ?? 0) >= threshold)
      .sort((left, right) => (
        left.metrics.totalFechasDisponibles - right.metrics.totalFechasDisponibles ||
        right.metrics.completionRate - left.metrics.completionRate
      ))[0]

    return [
      `${Math.round(threshold * 100)}%`,
      scenario
        ? {
            escenario: scenario.name,
            totalFechasDisponibles: scenario.metrics.totalFechasDisponibles,
            completionRate: scenario.metrics.completionRate,
          }
        : null,
    ]
  }))
}

function chooseAutomaticScenario(autoCandidates = []) {
  return (
    autoCandidates.find((entry) => (entry.metrics?.completionRate ?? 0) >= 0.8) ??
    [...autoCandidates].sort((left, right) => (
      (right.metrics?.completionRate ?? 0) - (left.metrics?.completionRate ?? 0) ||
      (left.metrics?.totalFechasDisponibles ?? 0) - (right.metrics?.totalFechasDisponibles ?? 0)
    ))[0] ??
    null
  )
}

function getPayloadCounts(snapshot = {}) {
  return {
    alumnos: asArray(snapshot.alumnos).length,
    docentes: asArray(snapshot.docentes).length,
    horariosDocentes: asArray(snapshot.horariosDocentes).length,
    planesEstudio: asArray(snapshot.planesEstudio).length,
    correlatividades: asArray(snapshot.correlatividades).length,
  }
}

function main() {
  if (!existsSync(LOCAL_SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json. Exporta el snapshot real desde el front dev-only.')
    return
  }

  try {
    const snapshot = readJsonFile(LOCAL_SNAPSHOT_PATH)
    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const teacherDiagnostics = buildTeacherDateDiagnostics(input)
    const automaticPriorityDays = priorityDaysFromDiagnostics(teacherDiagnostics)
    const baseContract = buildRegularExamPreviewIntegrationContract(input, {})
    const scenarioA = runScenario({
      name: 'A. calendario actual',
      input,
      contract: baseContract,
      metadata: { scenario: 'current-calendar' },
    })
    const baselineMetrics = scenarioA.metrics

    const scenarios = [
      { name: 'B. actual + 1 semana', input: createExtendedDatesInput(input, { extraDaysPerCall: 5 }) },
      { name: 'C. actual + 2 semanas', input: createExtendedDatesInput(input, { extraDaysPerCall: 10 }) },
      { name: 'D. actual + 3 semanas', input: createExtendedDatesInput(input, { extraDaysPerCall: 15 }) },
      { name: 'E. actual + 4 semanas', input: createExtendedDatesInput(input, { extraDaysPerCall: 20 }) },
      { name: 'F. jueves/lunes/martes hasta 15 fechas', input: createPriorityCalendarInput(input, { targetTotalDates: 15, priorityDays: FIXED_PRIORITY_DAYS }) },
      { name: 'G. jueves/lunes/martes hasta 20 fechas', input: createPriorityCalendarInput(input, { targetTotalDates: 20, priorityDays: FIXED_PRIORITY_DAYS }) },
    ].map((scenario) => runScenario({
      ...scenario,
      baselineMetrics,
      metadata: { scenario: scenario.name },
    }))

    const autoCandidates = [25, 30, 35, 40, 45, 50, 55, 60].map((target) => runScenario({
      name: `auto ${target} fechas`,
      input: createPriorityCalendarInput(input, {
        targetTotalDates: target,
        priorityDays: automaticPriorityDays,
      }),
      baselineMetrics,
      metadata: {
        scenario: 'automatic-priority-calendar',
        targetTotalDates: target,
      },
    }))
    const selectedAuto = chooseAutomaticScenario(autoCandidates)
    const scenarioH = selectedAuto
      ? {
          ...selectedAuto,
          name: `H. calendario recomendado automatico (${selectedAuto.metrics.totalFechasDisponibles} fechas)`,
        }
      : null
    const orderedScenarios = [scenarioA, ...scenarios, scenarioH].filter(Boolean).map((scenario) => ({
      ...scenario,
      mejoraContraActual: scenario.mejoraContraActual ?? buildDelta(scenario.metrics, baselineMetrics),
    }))
    const allEvaluated = [...orderedScenarios, ...autoCandidates]
    const minimumDates = findMinimumDatesByThreshold(allEvaluated)
    const threshold85 = minimumDates['85%']
    const best = [...allEvaluated].sort((left, right) => (
      (right.metrics?.completionRate ?? 0) - (left.metrics?.completionRate ?? 0) ||
      (left.metrics?.totalFechasDisponibles ?? 0) - (right.metrics?.totalFechasDisponibles ?? 0)
    ))[0]

    console.log(JSON.stringify({
      source: {
        type: 'local-file',
        path: 'local-audit/workspaceSnapshot.real.local.json',
        snapshotCounts: getPayloadCounts(snapshot),
        inputCounts: {
          materias: asArray(input.materias).length,
          docentes: asArray(input.docentes).length,
          fechasDisponibles: asArray(input.fechasDisponibles).length,
          correlatividades: asArray(input.correlatividades).length,
        },
      },
      disponibilidad: {
        diasPrioritariosFijos: FIXED_PRIORITY_DAYS,
        diasPrioritariosAutomaticos: automaticPriorityDays,
        titularesDisponiblesPorDiaSemana: teacherDiagnostics.titularesDisponiblesPorDiaSemana,
        materiasConTitularPorDiaSemana: teacherDiagnostics.materiasConTitularPorDiaSemana,
      },
      escenarios: orderedScenarios,
      busquedaAutomatica: {
        evaluados: autoCandidates.map((entry) => ({
          name: entry.name,
          totalFechasDisponibles: entry.metrics.totalFechasDisponibles,
          completionRate: entry.metrics.completionRate,
          totalPlanned: entry.metrics.totalPlanned,
          totalUnassigned: entry.metrics.totalUnassigned,
          mesasSinTribunal: entry.metrics.mesasSinTribunal,
          mesasSinFecha: entry.metrics.mesasSinFecha,
        })),
      },
      umbrales: {
        primerEscenarioListadoQueSupera: findFirstThresholds(orderedScenarios),
        minimasFechasEvaluadasParaSuperar: minimumDates,
      },
      diagnosticoFinal: {
        fechasMinimasPara75: minimumDates['75%']?.totalFechasDisponibles ?? null,
        fechasMinimasPara80: minimumDates['80%']?.totalFechasDisponibles ?? null,
        fechasMinimasPara85: threshold85?.totalFechasDisponibles ?? null,
        noLlegaA85: threshold85
          ? false
          : 'En los escenarios evaluados hasta 60 fechas el cuello restante sigue en vocales/tribunales y errores criticos, no solo en calendario.',
        mejorEscenarioEvaluado: best
          ? {
              escenario: best.name,
              totalFechasDisponibles: best.metrics.totalFechasDisponibles,
              completionRate: best.metrics.completionRate,
              totalPlanned: best.metrics.totalPlanned,
              totalUnassigned: best.metrics.totalUnassigned,
              mesasSinTribunal: best.metrics.mesasSinTribunal,
              mesasSinFecha: best.metrics.mesasSinFecha,
            }
          : null,
        problemaRestante: 'Despues de ampliar fechas, el remanente sigue concentrado en tribunales/vocales incompletos y reglas de disponibilidad/afinidad.',
      },
      recomendacionInstitucional: {
        lectura: 'Con el calendario actual no alcanza; conviene ampliar fechas antes de relajar reglas academicas.',
        diasRecomendados: automaticPriorityDays.slice(0, 3),
        decisionTribunalUnVocal: 'requiere decision institucional; podria mejorar la lectura operativa, pero no reemplaza la necesidad de fechas.',
        revisarAfinidades: 'si, despues de fijar calendario objetivo, porque las mesas sin tribunal siguen siendo el segundo cuello.',
        noReemplazarMotorViejo: true,
        noIntegrarUiTodavia: true,
      },
    }, null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo simular capacidad real de calendario.')
  }
}

main()
