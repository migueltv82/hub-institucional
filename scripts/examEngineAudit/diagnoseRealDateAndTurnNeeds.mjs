import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { generateRegularExamPlan } from '../../src/utils/examEngine/planning/generateRegular.js'
import { buildRegularExamPreviewIntegrationContract } from '../../src/utils/examEngine/preview/index.js'
import { buildExamEngineEfficiencySummary } from '../../src/utils/examEngine/audit/efficiencySummary.js'
import {
  buildDateTurnRecommendation,
  buildTeacherDateDiagnostics,
  buildTurnDiagnostics,
  runDateTurnScenarios,
  summarizeAvailableDates,
  summarizeMissingDateNeeds,
} from '../../src/utils/examEngine/audit/dateAndTurnNeedsDiagnosis.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_SNAPSHOT_PATH = resolve(REPO_ROOT, 'local-audit/workspaceSnapshot.real.local.json')

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function fail(message) {
  console.error(`[examEngine date/turn diagnosis] ${message}`)
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

function getInputCounts(input = {}) {
  return {
    materias: asArray(input.materias).length,
    docentes: asArray(input.docentes).length,
    correlatividades: asArray(input.correlatividades).length,
    fechasDisponibles: asArray(input.fechasDisponibles).length,
    cantidadLlamados: input.config?.cantidadLlamados ?? null,
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
    const baseContract = buildRegularExamPreviewIntegrationContract(input, {})
    const basePlan = generateRegularExamPlan(input)
    const currentSummary = buildExamEngineEfficiencySummary({
      contract: baseContract,
      input,
      metadata: {
        source: 'local-audit-date-turn-diagnosis',
        readOnly: true,
      },
    })
    const teacherDiagnostics = buildTeacherDateDiagnostics(input)
    const turnDiagnostics = buildTurnDiagnostics(snapshot, input)
    const scenarioDiagnosis = runDateTurnScenarios({
      input,
      snapshot,
      baseContract,
      teacherDiagnostics,
    })
    const recommendation = buildDateTurnRecommendation({
      teacherDiagnostics,
      turnDiagnostics,
      scenarios: scenarioDiagnosis.escenarios,
    })

    console.log(JSON.stringify({
      source: {
        type: 'local-file',
        path: 'local-audit/workspaceSnapshot.real.local.json',
        snapshotCounts: getPayloadCounts(snapshot),
        inputCounts: getInputCounts(input),
      },
      resultadoActual: {
        totalMaterias: currentSummary.totalMaterias,
        totalDocentes: currentSummary.totalDocentes,
        totalFechasDisponibles: currentSummary.totalFechasDisponibles,
        cantidadLlamados: currentSummary.cantidadLlamados,
        totalMesas: currentSummary.totalMesas,
        totalPlanned: currentSummary.totalPlanned,
        totalUnassigned: currentSummary.totalUnassigned,
        mesasCompletas: currentSummary.mesasCompletas,
        mesasConUnVocal: currentSummary.mesasConUnVocal,
        mesasSinTribunal: currentSummary.mesasSinTribunal,
        mesasSinFecha: currentSummary.mesasSinFecha,
        completionRate: currentSummary.completionRate,
        criticalErrors: currentSummary.totalCriticalErrors,
        warnings: currentSummary.totalWarnings,
        conclusion: currentSummary.conclusion,
      },
      fechasDisponibles: summarizeAvailableDates({ input, plan: basePlan }),
      mesasSinFecha: summarizeMissingDateNeeds({
        unassignedMesas: basePlan.unassignedMesas,
        input,
      }),
      titulares: teacherDiagnostics,
      turnos: turnDiagnostics,
      escenarios: {
        diasSeleccionados: scenarioDiagnosis.diasSeleccionados,
        resultados: scenarioDiagnosis.escenarios,
      },
      recomendacion: recommendation,
    }, null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo diagnosticar necesidades reales de fechas y turnos.')
  }
}

main()
