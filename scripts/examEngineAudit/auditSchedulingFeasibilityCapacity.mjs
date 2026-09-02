import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditSchedulingFeasibilityCapacity } from '../../src/utils/examEngine/audit/auditSchedulingFeasibilityCapacity.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'scheduling_feasibility_capacity_audit.json')
const SUMMARY_PATH = resolve(LOCAL_AUDIT_DIR, 'scheduling_feasibility_capacity_audit.summary.json')
const CASES_PATH = resolve(LOCAL_AUDIT_DIR, 'scheduling_feasibility_capacity_cases.csv')
const DATE_PATH = resolve(LOCAL_AUDIT_DIR, 'scheduling_feasibility_capacity_by_date.csv')
const TEACHERS_PATH = resolve(LOCAL_AUDIT_DIR, 'scheduling_feasibility_teacher_bottlenecks.csv')

function fail(message) {
  console.error(`[examEngine feasibility audit] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function csvEscape(value) {
  const text = typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : String(value ?? '')
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function writeCsv(filePath, rows = [], columns = []) {
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ]
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
}

function pickSummary(report = {}) {
  return {
    summary: report.summary,
    scenarioComparisons: report.scenarioComparisons,
    recommendations: report.recommendations,
    warnings: report.warnings,
    privacy: report.privacy,
  }
}

function writeOutputs(report = {}) {
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(pickSummary(report), null, 2)}\n`, 'utf8')
  writeCsv(CASES_PATH, report.examFeasibilityCases ?? [], [
    'caseId',
    'mesaId',
    'source',
    'carreraKey',
    'materiaKey',
    'anio',
    'llamado',
    'classification',
    'fechasCandidatasTotales',
    'fechasTitularAsiste',
    'vocalesIdoneosTotales',
    'fechasBrutasConUnVocal',
    'fechasBrutasConDosVocales',
    'fechasRealesTitularSinSuperposicion',
    'fechasRealesConUnVocal',
    'fechasRealesConDosVocales',
    'blockedBy',
  ])
  writeCsv(DATE_PATH, report.dateCapacity ?? [], [
    'fecha',
    'llamado',
    'turno',
    'mesasCandidatas',
    'titularesDisponibles',
    'vocalesDisponibles',
    'docentesUnicosDisponibles',
    'docentesYaOcupados',
    'capacidadVocalPotencial',
    'demandaVocales',
    'brechaVocales',
    'carrerasConcentradas',
    'aniosConcentrados',
    'materiasCriticas',
  ])
  writeCsv(TEACHERS_PATH, report.teacherBottlenecks ?? [], [
    'docenteAnonId',
    'docenteId',
    'diasAsistencia',
    'horasCatedra',
    'cupoVocaliasHorasCatedra',
    'usoActualCupo',
    'requeridoComoTitular',
    'requeridoComoVocalPosible',
    'bloqueosPorNoAsistir',
    'bloqueosPorSuperposicion',
    'bloqueosPorIdoneidad',
    'cuelloDeBotella',
    'bottleneckScore',
  ])
}

function main() {
  if (!existsSync(SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
    const snapshot = readJsonFile(SNAPSHOT_PATH)
    const report = auditSchedulingFeasibilityCapacity({ snapshot })
    const bestScenario = report.scenarioComparisons.find((scenario) => scenario.scenario === report.summary.bestScenario)

    writeOutputs(report)

    console.log('[examEngine feasibility audit] totalMesasAnalizadas:', report.summary.totalMesasAnalizadas)
    console.log('[examEngine feasibility audit] fullFeasible:', report.summary.fullFeasible)
    console.log('[examEngine feasibility audit] minimumReviewFeasible:', report.summary.minimumReviewFeasible)
    console.log('[examEngine feasibility audit] titleOnly:', report.summary.titleOnly)
    console.log('[examEngine feasibility audit] noTitleDate:', report.summary.noTitleDate)
    console.log('[examEngine feasibility audit] noVocalPool:', report.summary.noVocalPool)
    console.log('[examEngine feasibility audit] calendarTooRestrictive:', report.summary.calendarTooRestrictive)
    console.log('[examEngine feasibility audit] blockedBySuperposition:', report.summary.blockedBySuperposition)
    console.log('[examEngine feasibility audit] topCuello:', report.summary.topCuello)
    console.log('[examEngine feasibility audit] mejorEscenario:', bestScenario ?? report.summary.bestScenario)
    console.log('[examEngine feasibility audit] recomendacionAgosto:', report.summary.recommendationForAugust)
    console.log('[examEngine feasibility audit] archivos:', {
      report: 'local-audit/scheduling_feasibility_capacity_audit.json',
      summary: 'local-audit/scheduling_feasibility_capacity_audit.summary.json',
      cases: 'local-audit/scheduling_feasibility_capacity_cases.csv',
      byDate: 'local-audit/scheduling_feasibility_capacity_by_date.csv',
      teachers: 'local-audit/scheduling_feasibility_teacher_bottlenecks.csv',
    })
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la auditoria de factibilidad.')
  }
}

main()
