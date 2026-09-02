import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditDateVocalAssignmentOrder } from '../../src/utils/examEngine/audit/auditDateVocalAssignmentOrder.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'date_vocal_assignment_order_audit.json')
const SUMMARY_PATH = resolve(LOCAL_AUDIT_DIR, 'date_vocal_assignment_order_audit.summary.json')
const CASES_PATH = resolve(LOCAL_AUDIT_DIR, 'date_vocal_assignment_order_cases.csv')

function fail(message) {
  console.error(`[examEngine date-vocal audit] ${message}`)
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
    'detail',
    'fecha',
    'turno',
  ]
  const lines = [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ]
  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
}

function pickSummaryForFile(report = {}) {
  return {
    summary: report.summary,
    modes: (report.modes ?? []).map((mode) => ({
      name: mode.name,
      evidenceType: mode.evidenceType,
      totalMesas: mode.totalMesas,
      totalPlanned: mode.totalPlanned,
      totalUnassigned: mode.totalUnassigned,
      mesasSinFecha: mode.mesasSinFecha,
      completionRate: mode.completionRate,
      vocalesNoDisponibles: mode.vocalesNoDisponibles,
      titularesNoDisponibles: mode.titularesNoDisponibles,
      superposicionesDocentes: mode.superposicionesDocentes,
      tribunalesIncompletos: mode.tribunalesIncompletos,
      docentesQueSuperanCupo: mode.docentesQueSuperanCupo,
      docentesBloqueadosPorAsistencia: mode.docentesBloqueadosPorAsistencia,
      cantidadReparaciones: mode.cantidadReparaciones,
      reparacionesExitosas: mode.reparacionesExitosas,
      reparacionesFallidas: mode.reparacionesFallidas,
      topCausasFallo: mode.topCausasFallo,
    })),
    flowDiagnostics: report.flowDiagnostics,
    recommendations: report.recommendations,
    warnings: report.warnings,
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
    const report = auditDateVocalAssignmentOrder({ snapshot })
    const summary = pickSummaryForFile(report)
    const current = report.modes.find((mode) => mode.name === 'currentOrder') ?? {}
    const bestExperimental = report.modes
      .filter((mode) => mode.evidenceType === 'experimental-simulation')
      .sort((left, right) => Number(right.completionRate ?? 0) - Number(left.completionRate ?? 0))[0] ?? {}

    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    writeCsv(CASES_PATH, report.caseRows ?? [])

    console.log('[examEngine date-vocal audit] modoActual:', report.flowDiagnostics.detectedFlow)
    console.log('[examEngine date-vocal audit] completionActual:', current.completionRate ?? 0)
    console.log('[examEngine date-vocal audit] mejorModoExperimental:', bestExperimental.name ?? 'sin_modo')
    console.log('[examEngine date-vocal audit] completionExperimental:', bestExperimental.completionRate ?? 0)
    console.log('[examEngine date-vocal audit] deltaPlanificadas:', report.summary.plannedDeltaVsCurrent)
    console.log('[examEngine date-vocal audit] deltaSinFecha:', report.summary.sinFechaDeltaVsCurrent)
    console.log('[examEngine date-vocal audit] causaPrincipal:', report.summary.principalRegressionCause)
    console.log('[examEngine date-vocal audit] recomendacion:', report.summary.recommendation)
    console.log('[examEngine date-vocal audit] archivos:', {
      report: 'local-audit/date_vocal_assignment_order_audit.json',
      summary: 'local-audit/date_vocal_assignment_order_audit.summary.json',
      cases: 'local-audit/date_vocal_assignment_order_cases.csv',
    })
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la auditoria.')
  }
}

main()
