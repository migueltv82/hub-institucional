import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AUGUST_READINESS_AUDIT_INPUTS,
  buildAugustReadinessReport,
} from '../../src/utils/examEngine/audit/buildAugustReadinessReport.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'august_readiness_report.json')
const SUMMARY_PATH = resolve(LOCAL_AUDIT_DIR, 'august_readiness_report.summary.json')
const MARKDOWN_PATH = resolve(LOCAL_AUDIT_DIR, 'august_readiness_report.md')
const BUCKETS_PATH = resolve(LOCAL_AUDIT_DIR, 'august_readiness_operational_buckets.csv')
const RISK_MATRIX_PATH = resolve(LOCAL_AUDIT_DIR, 'august_readiness_risk_matrix.csv')
const NEXT_ACTIONS_PATH = resolve(LOCAL_AUDIT_DIR, 'august_readiness_next_actions.csv')

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

function readJsonIfExists(relativePath) {
  const absolutePath = resolve(REPO_ROOT, relativePath)
  if (!existsSync(absolutePath)) return null
  return JSON.parse(readFileSync(absolutePath, 'utf8'))
}

function loadAuditFiles() {
  return Object.fromEntries(
    Object.entries(AUGUST_READINESS_AUDIT_INPUTS)
      .map(([key, relativePath]) => [key, readJsonIfExists(relativePath)]),
  )
}

function pickSummary(report = {}) {
  return {
    summary: report.summary,
    readinessScore: report.readinessScore,
    readinessStatus: report.readinessStatus,
    blockers: report.blockers,
    recommendedUse: report.recommendedUse,
    requiredBeforeAugustPreview: report.requiredBeforeAugustPreview,
    requiredBeforeOfficialUse: report.requiredBeforeOfficialUse,
    operationalBuckets: report.operationalBuckets,
    calendarRecommendations: report.calendarRecommendations,
    identityV2Status: report.identityV2Status,
    ruleComplianceStatus: report.ruleComplianceStatus,
    riskMatrix: report.riskMatrix,
    nextActions: report.nextActions,
    missingInputs: report.missingInputs,
    warnings: report.warnings,
    privacy: report.privacy,
  }
}

function buildMarkdown(report = {}) {
  const lines = [
    '# Readiness agosto examEngine v2',
    '',
    'Reporte consolidado local/read-only para evaluar uso del motor v2 como preview interno de apoyo.',
    '',
    '## Estado',
    '',
    `- readinessStatus: ${report.readinessStatus}`,
    `- readinessScore: ${report.readinessScore}`,
    `- recommendedUse: ${report.recommendedUse}`,
    `- safeToReplaceLegacy: ${report.summary.safeToReplaceLegacy}`,
    `- readyForOfficialGeneration: ${report.summary.readyForOfficialGeneration}`,
    '',
    '## Resumen operativo',
    '',
    `- Total mesas: ${report.summary.totalMesas}`,
    `- Mejor escenario calendario: ${report.summary.bestCalendarScenario}`,
    `- Full: ${report.summary.bestScenarioFull}`,
    `- Minimas revisables: ${report.summary.bestScenarioMinimumReview}`,
    `- Manuales: ${report.summary.bestScenarioManual}`,
    `- Bloqueadas por superposicion: ${report.summary.bestScenarioBlockedBySuperposition}`,
    `- Homonimias identidad v2 pendientes: ${report.summary.identityV2PendingHomonymies}`,
    `- Docentes excedidos: ${report.summary.docentesExcedidos}`,
    `- Max uso cupo: ${report.summary.maxUsoCupo}`,
    '',
    '## Blockers principales',
    '',
    ...report.blockers.map((blocker) => `- ${blocker.code} (${blocker.severity}): ${blocker.evidence}`),
    '',
    '## Antes de preview agosto',
    '',
    ...report.requiredBeforeAugustPreview.map((item) => `- ${item}`),
    '',
    '## Antes de uso oficial',
    '',
    ...report.requiredBeforeOfficialUse.map((item) => `- ${item}`),
    '',
    '## Fechas simuladas sugeridas',
    '',
    ...report.calendarRecommendations.suggestedSimulatedDates.map((date) => (
      `- ${date.fecha} ${date.diaSemana} ${date.llamado} ${date.turno}`
    )),
    '',
    '## Proximas acciones',
    '',
    ...report.nextActions.map((item) => `- ${item.order}. ${item.action} (${item.requiredFor})`),
    '',
  ]

  return lines.join('\n')
}

function writeOutputs(report = {}) {
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(pickSummary(report), null, 2)}\n`, 'utf8')
  writeFileSync(MARKDOWN_PATH, buildMarkdown(report), 'utf8')
  writeCsv(BUCKETS_PATH, report.operationalBuckets, [
    'bucket',
    'count',
    'percentage',
    'description',
    'recommendedAction',
  ])
  writeCsv(RISK_MATRIX_PATH, report.riskMatrix, [
    'code',
    'level',
    'evidence',
    'recommendedAction',
  ])
  writeCsv(NEXT_ACTIONS_PATH, report.nextActions, [
    'order',
    'action',
    'owner',
    'requiredFor',
  ])
}

function main() {
  mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
  const auditFiles = loadAuditFiles()
  const report = buildAugustReadinessReport({ auditFiles })

  writeOutputs(report)

  console.log('[examEngine august readiness] readinessStatus:', report.readinessStatus)
  console.log('[examEngine august readiness] recommendedUse:', report.recommendedUse)
  console.log('[examEngine august readiness] topBlockers:', report.blockers.slice(0, 5))
  console.log('[examEngine august readiness] requiredBeforeAugustPreview:', report.requiredBeforeAugustPreview)
  console.log('[examEngine august readiness] requiredBeforeOfficialUse:', report.requiredBeforeOfficialUse)
  console.log('[examEngine august readiness] nextActions:', report.nextActions)
  console.log('[examEngine august readiness] archivos:', {
    report: 'local-audit/august_readiness_report.json',
    summary: 'local-audit/august_readiness_report.summary.json',
    markdown: 'local-audit/august_readiness_report.md',
    buckets: 'local-audit/august_readiness_operational_buckets.csv',
    riskMatrix: 'local-audit/august_readiness_risk_matrix.csv',
    nextActions: 'local-audit/august_readiness_next_actions.csv',
  })
}

main()
