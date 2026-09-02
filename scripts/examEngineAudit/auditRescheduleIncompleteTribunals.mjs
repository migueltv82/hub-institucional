import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditRescheduleIncompleteTribunals } from '../../src/utils/examEngine/audit/auditRescheduleIncompleteTribunals.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'reschedule_incomplete_tribunals_audit.json')
const SUMMARY_PATH = resolve(LOCAL_AUDIT_DIR, 'reschedule_incomplete_tribunals_audit.summary.json')
const CASES_PATH = resolve(LOCAL_AUDIT_DIR, 'reschedule_incomplete_tribunals_cases.csv')

function fail(message) {
  console.error(`[examEngine reschedule audit] ${message}`)
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
    'source',
    'carreraKey',
    'materiaKey',
    'llamado',
    'oldFecha',
    'newFecha',
    'turno',
    'status',
    'selectedCount',
    'changedDate',
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
    fixedRepairSummary: report.fixedRepairSummary,
    rescheduleSummary: report.rescheduleSummary,
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
    const report = auditRescheduleIncompleteTribunals({ snapshot })
    const summary = pickSummary(report)

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    writeCsv(CASES_PATH, report.caseRows ?? [])

    console.log('[examEngine reschedule audit] incompletosIniciales:', report.summary.incompleteTribunalsInitial)
    console.log('[examEngine reschedule audit] completosLuegoReprogramar:', report.summary.rescheduledComplete)
    console.log('[examEngine reschedule audit] minimosRevisablesLuegoReprogramar:', report.summary.rescheduledMinimumReview)
    console.log('[examEngine reschedule audit] soloTitularManual:', report.summary.onlyTitularAfterReschedule)
    console.log('[examEngine reschedule audit] sinFechaAntes:', report.summary.sinFechaBefore)
    console.log('[examEngine reschedule audit] sinFechaDespues:', report.summary.sinFechaAfter)
    console.log('[examEngine reschedule audit] completionAntes:', report.summary.completionBefore)
    console.log('[examEngine reschedule audit] completionDespues:', report.summary.completionAfter)
    console.log('[examEngine reschedule audit] topCausasPendientes:', report.summary.topPendingCauses)
    console.log('[examEngine reschedule audit] recomendacion:', report.summary.recommendation)
    console.log('[examEngine reschedule audit] archivos:', {
      report: 'local-audit/reschedule_incomplete_tribunals_audit.json',
      summary: 'local-audit/reschedule_incomplete_tribunals_audit.summary.json',
      cases: 'local-audit/reschedule_incomplete_tribunals_cases.csv',
    })
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la auditoria de reprogramacion.')
  }
}

main()
