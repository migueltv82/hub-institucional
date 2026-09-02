import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { buildRegularExamPreviewIntegrationContract } from '../../src/utils/examEngine/preview/index.js'
import { buildExamEngineEfficiencySummary } from '../../src/utils/examEngine/audit/efficiencySummary.js'
import {
  chooseFinalRecommendation,
  getPayloadCounts,
  groupFailureCauses,
  pickEfficiencyMetrics,
} from '../../src/utils/examEngine/supabaseAudit/confirmedWorkspaceEfficiency.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_SNAPSHOT_PATH = resolve(REPO_ROOT, 'local-audit/workspaceSnapshot.real.local.json')

const SAFE_SUMMARY_FIELDS = [
  'totalMaterias',
  'totalDocentes',
  'totalFechasDisponibles',
  'phase',
  'status',
  'totalPlanned',
  'totalUnassigned',
  'totalMesas',
  'totalCriticalErrors',
  'totalWarnings',
  'totalPendingManualReview',
  'totalCompactadas',
  'cantidadLlamados',
  'tipoPeriodo',
  'compactMode',
  'mesasCompletas',
  'mesasConUnVocal',
  'mesasSinTribunal',
  'mesasSinFecha',
  'docentesEnLimite',
  'docentesExcedidos',
  'completionRate',
  'conclusion',
  'recommendations',
]

function fail(message) {
  console.error(`[examEngine local] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
}

function isEmptySnapshot(value) {
  if (!value || typeof value !== 'object') return true
  if (Object.keys(value).length === 0) return true

  const usefulArrays = [
    value.horariosDocentes,
    value.docentes,
    value.planesEstudio,
    value.correlatividades,
    value.alumnos,
  ]

  return usefulArrays.every((entry) => !Array.isArray(entry) || entry.length === 0)
}

function pickSafeSummary(summary = {}) {
  return SAFE_SUMMARY_FIELDS.reduce((result, field) => {
    result[field] = summary[field]
    return result
  }, {})
}

function buildLocalAuditReport({ snapshot, input, contract, summary }) {
  const safeSummary = pickSafeSummary(summary)
  const metrics = pickEfficiencyMetrics(summary)

  return {
    source: {
      type: 'local-file',
      path: 'local-audit/workspaceSnapshot.real.local.json',
      counts: getPayloadCounts(snapshot),
    },
    metrics: {
      ...safeSummary,
      ...metrics,
    },
    failureCauses: groupFailureCauses({ contract, input }),
    finalRecommendation: chooseFinalRecommendation(metrics),
  }
}

function main() {
  if (!existsSync(LOCAL_SNAPSHOT_PATH)) {
    fail(
      'No existe local-audit/workspaceSnapshot.real.local.json. ' +
      'Crea ese archivo local con el snapshot viejo exportado manualmente.',
    )
    return
  }

  try {
    const snapshot = readJsonFile(LOCAL_SNAPSHOT_PATH)

    if (isEmptySnapshot(snapshot)) {
      fail('El snapshot local existe, pero no contiene datos utiles para simular.')
      return
    }

    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const contract = buildRegularExamPreviewIntegrationContract(input, {})
    const summary = buildExamEngineEfficiencySummary({
      contract,
      input,
      metadata: {
        source: 'local-file',
        readOnly: true,
      },
    })

    console.log(JSON.stringify(buildLocalAuditReport({
      snapshot,
      input,
      contract,
      summary,
    }), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la simulacion local.')
  }
}

main()
