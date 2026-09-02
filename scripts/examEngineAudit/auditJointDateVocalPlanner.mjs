import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditJointDateVocalPlanner } from '../../src/utils/examEngine/audit/auditJointDateVocalPlanner.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'joint_date_vocal_planner_audit.json')
const SUMMARY_PATH = resolve(LOCAL_AUDIT_DIR, 'joint_date_vocal_planner_audit.summary.json')
const CASES_PATH = resolve(LOCAL_AUDIT_DIR, 'joint_date_vocal_planner_cases.csv')

function fail(message) {
  console.error(`[examEngine joint planner audit] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (!/[",\n\r]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function writeCsv(filePath, rows = []) {
  const columns = [
    'caseId',
    'mode',
    'carreraKey',
    'materiaKey',
    'llamado',
    'reason',
    'fecha',
    'turno',
    'vocalesAsignados',
    'attemptedSlots',
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
    jointPlannerDiagnostics: report.jointPlannerDiagnostics,
    compactableCasesCount: report.compactableCases?.length ?? 0,
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
    const report = auditJointDateVocalPlanner({ snapshot })
    const summary = pickSummary(report)
    const current = report.modes.find((mode) => mode.name === 'currentOrder') ?? {}
    const joint = report.modes.find((mode) => mode.name === 'jointDateVocalPlanner') ?? {}

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    writeCsv(CASES_PATH, report.caseRows ?? [])

    console.log('[examEngine joint planner audit] currentCompletion:', current.completionRate ?? 0)
    console.log('[examEngine joint planner audit] jointCompletion:', joint.completionRate ?? 0)
    console.log('[examEngine joint planner audit] deltaCompletion:', report.delta.completionRate)
    console.log('[examEngine joint planner audit] currentPlanned:', current.totalPlanned ?? 0)
    console.log('[examEngine joint planner audit] jointPlanned:', joint.totalPlanned ?? 0)
    console.log('[examEngine joint planner audit] deltaPlanned:', report.delta.totalPlanned)
    console.log('[examEngine joint planner audit] currentSinFecha:', current.mesasSinFecha ?? 0)
    console.log('[examEngine joint planner audit] jointSinFecha:', joint.mesasSinFecha ?? 0)
    console.log('[examEngine joint planner audit] deltaSinFecha:', report.delta.mesasSinFecha)
    console.log('[examEngine joint planner audit] compactableCases:', report.compactableCases?.length ?? 0)
    console.log('[examEngine joint planner audit] safeToReplaceLegacy:', report.summary.safeToReplaceLegacy)
    console.log('[examEngine joint planner audit] recommendation:', report.summary.recommendation)
    console.log('[examEngine joint planner audit] archivos:', {
      report: 'local-audit/joint_date_vocal_planner_audit.json',
      summary: 'local-audit/joint_date_vocal_planner_audit.summary.json',
      cases: 'local-audit/joint_date_vocal_planner_cases.csv',
    })
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la auditoria del planner conjunto.')
  }
}

main()
