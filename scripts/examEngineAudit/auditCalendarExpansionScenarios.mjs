import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditCalendarExpansionScenarios } from '../../src/utils/examEngine/audit/auditCalendarExpansionScenarios.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'calendar_expansion_scenarios_audit.json')
const SUMMARY_PATH = resolve(LOCAL_AUDIT_DIR, 'calendar_expansion_scenarios_audit.summary.json')
const CASES_PATH = resolve(LOCAL_AUDIT_DIR, 'calendar_expansion_scenarios_cases.csv')
const BY_DATE_PATH = resolve(LOCAL_AUDIT_DIR, 'calendar_expansion_scenarios_by_date.csv')
const RECOMMENDATIONS_PATH = resolve(LOCAL_AUDIT_DIR, 'calendar_expansion_scenarios_recommendations.md')

function fail(message) {
  console.error(`[examEngine calendar expansion audit] ${message}`)
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
    scenarioResults: report.scenarioResults,
    bestScenario: report.bestScenario,
    recommendations: report.recommendations,
    warnings: report.warnings,
    privacy: report.privacy,
  }
}

function buildRecommendationsMarkdown(report = {}) {
  const lines = [
    '# Auditoria de expansion de calendario v2',
    '',
    'Auditoria local/read-only. No guarda ni publica cronogramas.',
    '',
    '## Resumen',
    '',
    `- Escenario base: ${report.summary?.baselineScenario ?? ''}`,
    `- Mejor escenario: ${report.summary?.bestScenario ?? ''}`,
    `- Total mesas: ${report.summary?.totalMesas ?? 0}`,
    `- Mejora full: ${report.summary?.fullDelta ?? 0}`,
    `- Mejora minimas revisables: ${report.summary?.minimumReviewDelta ?? 0}`,
    `- Delta bloqueo por superposicion: ${report.summary?.blockedBySuperpositionDelta ?? 0}`,
    `- Fechas extra minimas estimadas: ${report.summary?.minimumExtraDatesForFirstImprovement ?? 'sin mejora incremental clara'}`,
    `- Preview de apoyo agosto: ${report.summary?.readyForAugustSupportPreview ? 'si' : 'no'}`,
    `- safeToReplaceLegacy: ${report.summary?.safeToReplaceLegacy}`,
    '',
    '## Escenarios',
    '',
    '| escenario | full | minimas | manuales | sin fecha | superposicion | fechas simuladas | cupo excedido | superposiciones plan |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...report.scenarioResults.map((scenario) => (
      `| ${scenario.scenario} | ${scenario.full} | ${scenario.minimumReview} | ${scenario.manual} | ${scenario.mesasSinFecha} | ${scenario.blockedBySuperposition} | ${scenario.fechasSimuladas} | ${scenario.docentesExcedidos} | ${scenario.superpositionsInPlan} |`
    )),
    '',
    '## Recomendaciones',
    '',
    ...report.recommendations.map((recommendation) => `- ${recommendation}`),
    '',
  ]

  return lines.join('\n')
}

function writeOutputs(report = {}) {
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(pickSummary(report), null, 2)}\n`, 'utf8')
  writeCsv(CASES_PATH, report.cases ?? [], [
    'scenario',
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
    'fechasRealesConUnVocal',
    'fechasRealesConDosVocales',
    'blockedBy',
  ])
  writeCsv(BY_DATE_PATH, report.byDate ?? [], [
    'scenario',
    'fecha',
    'llamado',
    'turno',
    'isSimulated',
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
  ])
  writeFileSync(RECOMMENDATIONS_PATH, buildRecommendationsMarkdown(report), 'utf8')
}

function main() {
  if (!existsSync(SNAPSHOT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
    const snapshot = readJsonFile(SNAPSHOT_PATH)
    const report = auditCalendarExpansionScenarios({ snapshot })

    writeOutputs(report)

    console.log('[examEngine calendar expansion audit] baseline:', {
      totalMesas: report.summary.totalMesas,
      full: report.summary.baselineFull,
      minimas: report.summary.baselineMinimumReview,
      manuales: report.summary.baselineManual,
      blockedBySuperposition: report.summary.baselineBlockedBySuperposition,
    })
    console.log('[examEngine calendar expansion audit] escenarios:')
    report.scenarioResults.forEach((scenario) => {
      console.log(`- ${scenario.scenario}: full=${scenario.full}, minimas=${scenario.minimumReview}, manuales=${scenario.manual}, sinFecha=${scenario.mesasSinFecha}, blockedSuperposition=${scenario.blockedBySuperposition}, fechasSimuladas=${scenario.fechasSimuladas}, docentesExcedidos=${scenario.docentesExcedidos}, superposicionesPlan=${scenario.superpositionsInPlan}`)
    })
    console.log('[examEngine calendar expansion audit] mejorEscenario:', report.bestScenario)
    console.log(
      '[examEngine calendar expansion audit] fechasExtraMinimasEstimadas:',
      report.summary.minimumExtraDatesForFirstImprovement ?? 'sin mejora incremental clara',
    )
    console.log(
      '[examEngine calendar expansion audit] puedeServirPreviewAgosto:',
      report.summary.readyForAugustSupportPreview,
    )
    console.log('[examEngine calendar expansion audit] recomendacionInstitucional:', report.recommendations)
    console.log('[examEngine calendar expansion audit] archivos:', {
      report: 'local-audit/calendar_expansion_scenarios_audit.json',
      summary: 'local-audit/calendar_expansion_scenarios_audit.summary.json',
      cases: 'local-audit/calendar_expansion_scenarios_cases.csv',
      byDate: 'local-audit/calendar_expansion_scenarios_by_date.csv',
      recommendations: 'local-audit/calendar_expansion_scenarios_recommendations.md',
    })
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo ejecutar la auditoria de expansion de calendario.')
  }
}

main()
