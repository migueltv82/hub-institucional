import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditVocalRepairPass } from '../../src/utils/examEngine/audit/auditVocalRepairPass.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'vocal_repair_pass_audit.json')
const SUMMARY_PATH = resolve(LOCAL_AUDIT_DIR, 'vocal_repair_pass_audit.summary.json')
const CASES_PATH = resolve(LOCAL_AUDIT_DIR, 'vocal_repair_pass_cases.csv')

function fail(message) {
  console.error(`[examEngine vocal repair audit] ${message}`)
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

function writeCsv(filePath, rows = []) {
  const columns = [
    'caseId',
    'mesaId',
    'carreraKey',
    'materiaKey',
    'llamado',
    'fecha',
    'turno',
    'status',
    'selectedCount',
    'rejectedByCause',
  ]
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ]
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
}

function pickSummary(report = {}) {
  return {
    summary: report.summary,
    modes: report.modes,
    delta: report.delta,
    repairSummary: report.repairSummary,
    recommendations: report.recommendations,
    warnings: report.warnings,
    privacy: report.privacy,
  }
}

function main() {
  if (!existsSync(SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
    const snapshot = readJsonFile(SNAPSHOT_PATH)
    const report = auditVocalRepairPass({ snapshot })
    const summary = pickSummary(report)
    const before = report.modes.find((mode) => mode.name === 'jointDateVocalPlannerSupport') ?? {}
    const after = report.modes.find((mode) => mode.name === 'jointDateVocalPlannerSupportPlusVocalRepair') ?? {}

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    writeCsv(CASES_PATH, report.caseRows ?? [])

    console.log('[examEngine vocal repair audit] incompletosIniciales:', report.summary.incompleteTribunalsInitial)
    console.log('[examEngine vocal repair audit] reparadosDosVocales:', report.summary.repairedWithTwoVocales)
    console.log('[examEngine vocal repair audit] reparadosUnVocal:', report.summary.repairedWithOneVocal)
    console.log('[examEngine vocal repair audit] quedanUnVocal:', report.summary.oneVocalAfterRepair)
    console.log('[examEngine vocal repair audit] siguenSoloTitular:', report.summary.onlyTitularAfterRepair)
    console.log('[examEngine vocal repair audit] sinFecha:', report.summary.sinFecha)
    console.log('[examEngine vocal repair audit] completionAntes:', before.completionRate ?? report.summary.completionBefore)
    console.log('[examEngine vocal repair audit] completionDespues:', after.completionRate ?? report.summary.completionAfter)
    console.log('[examEngine vocal repair audit] topCausasPendientes:', report.summary.topPendingCauses)
    console.log('[examEngine vocal repair audit] recomendacion:', report.summary.recommendation)
    console.log('[examEngine vocal repair audit] archivos:', {
      report: 'local-audit/vocal_repair_pass_audit.json',
      summary: 'local-audit/vocal_repair_pass_audit.summary.json',
      cases: 'local-audit/vocal_repair_pass_cases.csv',
    })
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la auditoria de reparacion de vocales.')
  }
}

main()
