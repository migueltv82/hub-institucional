import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import {
  createAutomaticCalendarInput,
  FALLBACK_MODES,
  runVocalAuditPlan,
  runVocalScenario,
  runVocalScenarios,
  summarizeVocalBottlenecks,
} from '../../src/utils/examEngine/audit/vocalBottleneckDiagnosis.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_SNAPSHOT_PATH = resolve(REPO_ROOT, 'local-audit/workspaceSnapshot.real.local.json')
const KEY_SCENARIOS_ONLY = process.argv.includes('--key-scenarios')

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function fail(message) {
  console.error(`[examEngine vocal bottlenecks] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
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

function safeScenario(scenario = {}) {
  const metrics = scenario.metrics ?? {}
  return {
    name: scenario.name,
    totalFechasDisponibles: metrics.totalFechasDisponibles,
    totalMesas: metrics.totalMesas,
    totalPlanned: metrics.totalPlanned,
    totalUnassigned: metrics.totalUnassigned,
    mesasCompletas: metrics.mesasCompletas,
    mesasConUnVocal: metrics.mesasConUnVocal,
    mesasSinTribunal: metrics.mesasSinTribunal,
    mesasSinFecha: metrics.mesasSinFecha,
    completionRate: metrics.completionRate,
    totalCriticalErrors: metrics.criticalErrors,
    totalWarnings: metrics.warnings,
    vocalesAsignadosPorFallback: metrics.vocalesAsignadosPorFallback,
    casosRequierenRevisionManual: metrics.requierenRevisionManual,
    docentesEnLimite: metrics.docentesEnLimite,
    docentesExcedidos: metrics.docentesExcedidos,
    reparacionesExitosas: metrics.reparacionesExitosas,
    reparacionesFallidas: metrics.reparacionesFallidas,
    reparacionesGlobales: metrics.reparacionesGlobales,
    reparacionesGlobalesFallidas: metrics.reparacionesGlobalesFallidas,
    mejoraContraActual: scenario.mejoraContraActual,
    fallbackSummary: scenario.metadata?.fallbackSummary,
  }
}

function findThresholds(scenarios = []) {
  return Object.fromEntries([0.8, 0.85].map((threshold) => {
    const match = scenarios.find((scenario) => (scenario.metrics?.completionRate ?? 0) >= threshold)
    return [
      `${Math.round(threshold * 100)}%`,
      match
        ? {
            escenario: match.name,
            completionRate: match.metrics.completionRate,
            totalFechasDisponibles: match.metrics.totalFechasDisponibles,
          }
        : null,
    ]
  }))
}

function runKeyVocalScenarios(input = {}) {
  const scenarioA = runVocalScenario({ name: 'A. reglas actuales', input })
  const baseline = scenarioA.metrics
  const scenarioH = runVocalScenario({
    name: 'H. combinacion segura + 35 fechas automaticas',
    input: createAutomaticCalendarInput(input, { targetTotalDates: 35 }),
    fallbackMode: FALLBACK_MODES.SAFE_COMBO,
    baselineMetrics: baseline,
  })
  const scenarioI = runVocalScenario({
    name: 'I. combinacion segura + 55 fechas automaticas',
    input: createAutomaticCalendarInput(input, { targetTotalDates: 55 }),
    fallbackMode: FALLBACK_MODES.SAFE_COMBO,
    baselineMetrics: baseline,
  })

  return [scenarioA, scenarioH, scenarioI]
}

function buildRecommendation({ scenarios = [], diagnostics = {} } = {}) {
  const best = [...scenarios].sort((left, right) => (
    (right.metrics?.completionRate ?? 0) - (left.metrics?.completionRate ?? 0) ||
    (right.metrics?.mesasCompletas ?? 0) - (left.metrics?.mesasCompletas ?? 0)
  ))[0]
  const current = scenarios[0]
  const rejectionCauses = diagnostics.general?.rechazosPorCausa ?? {}
  const affinityDominates = (rejectionCauses.afinidad ?? 0) > (rejectionCauses.mitad_mas_uno ?? 0)

  return {
    mejorEscenario: best
      ? {
          name: best.name,
          completionRate: best.metrics.completionRate,
          totalFechasDisponibles: best.metrics.totalFechasDisponibles,
          totalPlanned: best.metrics.totalPlanned,
          mesasSinTribunal: best.metrics.mesasSinTribunal,
          vocalesAsignadosPorFallback: best.metrics.vocalesAsignadosPorFallback,
        }
      : null,
    lectura: [
      'El cuello principal ya no es titularidad ni turno; es conformacion de vocales/tribunales.',
      affinityDominates
        ? 'La afinidad es la causa dominante de rechazo de candidatos vocales.'
        : 'La cuota/limite de vocalias pesa tanto como afinidad o mas en los rechazos.',
      current?.metrics?.mesasSinTribunal > 0
        ? 'Aceptar un vocal como minimo ayuda institucionalmente, pero no crea mas candidatos ni resuelve fechas por si solo.'
        : 'No se observa cuello de tribunales en el escenario actual.',
    ],
    decisionInstitucional: [
      'Definir si se acepta mesa con 1 vocal en preview como valida con revision.',
      'Aprobar o rechazar familias transversales para Ingles, Informatica/TIC, pedagogicas y tecnicas.',
      'Revisar manualmente las carreras con promedio bajo de candidatos validos.',
    ],
    recomendacion: best?.metrics?.completionRate >= 0.8
      ? 'Integrar preview interno read-only con las reglas de fallback marcadas para revision manual.'
      : 'Mantener como auditoria/preview interno; antes de reemplazar el motor viejo hay que resolver afinidades o ampliar docentes habilitados.',
    reemplazarMotorViejo: 'no conviene todavia.',
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
    const basePlan = runVocalAuditPlan(input)
    const diagnostics = summarizeVocalBottlenecks(basePlan, input)
    const scenarios = KEY_SCENARIOS_ONLY ? runKeyVocalScenarios(input) : runVocalScenarios(input)
    const thresholds = findThresholds(scenarios)

    console.log(JSON.stringify({
      source: {
        type: 'local-file',
        path: 'local-audit/workspaceSnapshot.real.local.json',
        mode: KEY_SCENARIOS_ONLY ? 'key-scenarios' : 'full-scenarios',
        snapshotCounts: getPayloadCounts(snapshot),
        inputCounts: {
          materias: asArray(input.materias).length,
          docentes: asArray(input.docentes).length,
          fechasDisponibles: asArray(input.fechasDisponibles).length,
          correlatividades: asArray(input.correlatividades).length,
        },
      },
      diagnosticoVocales: diagnostics,
      escenarios: scenarios.map(safeScenario),
      umbrales: thresholds,
      recomendacion: buildRecommendation({ scenarios, diagnostics }),
    }, null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo diagnosticar cuellos reales de vocales.')
  }
}

main()
