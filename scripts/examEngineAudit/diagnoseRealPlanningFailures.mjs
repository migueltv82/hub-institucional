import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { generateRegularExamPlan } from '../../src/utils/examEngine/planning/generateRegular.js'
import { buildRegularExamPreviewIntegrationContract } from '../../src/utils/examEngine/preview/index.js'
import {
  buildRuleBottleneckDiagnosis,
  createExtendedDatesInput,
  createInstitutionalAffinityFallbackInput,
  createOneCallInput,
  inferCallDiagnosis,
  summarizeDateFailures,
  summarizeOneVocalMinimumScenario,
  summarizeScenario,
  summarizeTribunalFailures,
} from '../../src/utils/examEngine/audit/planningFailureDiagnosis.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_SNAPSHOT_PATH = resolve(REPO_ROOT, 'local-audit/workspaceSnapshot.real.local.json')

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function fail(message) {
  console.error(`[examEngine planning diagnosis] ${message}`)
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

function buildCallComparison({ currentScenario, oneCallScenario }) {
  const current = currentScenario.metrics
  const oneCall = oneCallScenario.metrics

  return {
    dosLlamados: {
      totalMesas: current.totalMesas,
      completionRate: current.completionRate,
      mesasSinFecha: current.mesasSinFecha,
      mesasSinTribunal: current.mesasSinTribunal,
    },
    unLlamado: {
      totalMesas: oneCall.totalMesas,
      completionRate: oneCall.completionRate,
      mesasSinFecha: oneCall.mesasSinFecha,
      mesasSinTribunal: oneCall.mesasSinTribunal,
    },
  }
}

function chooseBestScenario(scenarios = []) {
  return scenarios
    .filter((scenario) => scenario.mode === 'engine-run')
    .sort((left, right) => (
      (right.metrics?.completionRate ?? 0) - (left.metrics?.completionRate ?? 0) ||
      (left.metrics?.totalCriticalErrors ?? 0) - (right.metrics?.totalCriticalErrors ?? 0)
    ))[0] ?? null
}

function buildRecommendation({ scenarios = [], ruleDiagnosis = {} }) {
  const best = chooseBestScenario(scenarios)

  return {
    ajusteConMayorMejora: best?.name ?? 'sin mejora clara',
    ajusteInstitucionalmenteMasConservador: 'ampliar fechas disponibles antes de relajar reglas academicas.',
    requiereDecisionInstitucional: [
      'reducir de 2 llamados a 1 llamado',
      'aceptar tribunal con 1 vocal',
      'habilitar fallback de idoneidad/afinidad institucional para vocales',
    ],
    cuelloPrincipalDetectado: ruleDiagnosis.cuelloPrincipal,
    integrarPreviewInterno: 'si, como preview/auditoria interna read-only.',
    reemplazarMotorViejo: 'no, todavia no conviene reemplazar el motor viejo.',
  }
}

function getContractRows(contract = {}) {
  const planned = asArray(contract.filteredDto?.uiTables?.planned).length
    ? asArray(contract.filteredDto.uiTables.planned)
    : asArray(contract.uiDto?.uiTables?.planned)
  const unassigned = asArray(contract.filteredDto?.uiTables?.unassigned).length
    ? asArray(contract.filteredDto.uiTables.unassigned)
    : asArray(contract.uiDto?.uiTables?.unassigned)

  return [...planned, ...unassigned]
}

function main() {
  if (!existsSync(LOCAL_SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json. Exporta el snapshot real desde el front dev-only.')
    return
  }

  try {
    const snapshot = readJsonFile(LOCAL_SNAPSHOT_PATH)
    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)

    const baseContract = buildRegularExamPreviewIntegrationContract(input, {})
    const basePlan = generateRegularExamPlan(input)
    const scenarioA = summarizeScenario({
      name: 'A. 2 llamados actual',
      input,
      contract: baseContract,
      metadata: { mode: 'engine-run', scenario: 'current-two-calls' },
    })
    const scenarioB = summarizeScenario({
      name: 'B. 1 llamado',
      input: createOneCallInput(input),
      metadata: { mode: 'engine-run', scenario: 'one-call' },
    })
    const scenarioC = summarizeOneVocalMinimumScenario(scenarioA)
    const scenarioD = summarizeScenario({
      name: 'D. relajar afinidad con fallback institucional',
      input: createInstitutionalAffinityFallbackInput(input),
      metadata: { mode: 'engine-run', scenario: 'institutional-affinity-fallback' },
    })
    const scenarioE = summarizeScenario({
      name: 'E. ampliar fechas disponibles',
      input: createExtendedDatesInput(input, { extraDaysPerCall: 5 }),
      metadata: { mode: 'engine-run', scenario: 'extend-dates' },
    })
    const scenarios = [scenarioA, scenarioB, scenarioC, scenarioD, scenarioE]
    const allFinalMesas = getContractRows(baseContract)
    const dateFailures = summarizeDateFailures(basePlan.unassignedMesas)
    const tribunalFailures = summarizeTribunalFailures({
      rows: allFinalMesas,
      plan: basePlan,
    })
    const ruleDiagnosis = buildRuleBottleneckDiagnosis({
      dateFailures,
      tribunalFailures,
      scenarios,
    })

    console.log(JSON.stringify({
      source: {
        type: 'local-file',
        path: 'local-audit/workspaceSnapshot.real.local.json',
        counts: getPayloadCounts(snapshot),
      },
      llamados: {
        diagnostico: inferCallDiagnosis({ snapshot, input }),
        comparacion: buildCallComparison({
          currentScenario: scenarioA,
          oneCallScenario: scenarioB,
        }),
      },
      fechas: dateFailures,
      tribunales: tribunalFailures,
      reglas: ruleDiagnosis,
      escenarios: scenarios,
      recomendacion: buildRecommendation({ scenarios, ruleDiagnosis }),
    }, null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo diagnosticar fallas reales de planificacion.')
  }
}

main()
