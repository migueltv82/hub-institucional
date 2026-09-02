import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildV2SubjectIdentityReview } from '../../src/utils/examEngine/audit/buildV2SubjectIdentityReview.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SNAPSHOT_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const EQUIVALENCE_VIEW_PATH = resolve(LOCAL_AUDIT_DIR, 'exam_universe_equivalence_view.json')
const READINESS_REPORT_PATH = resolve(LOCAL_AUDIT_DIR, 'template_v2_readiness.json')
const READINESS_SUMMARY_PATH = resolve(LOCAL_AUDIT_DIR, 'template_v2_readiness.summary.json')
const CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_review.csv')
const JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_review.json')
const SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_review.summary.json')

const CSV_COLUMNS = [
  'review_id',
  'carrera',
  'carrera_id_actual',
  'carrera_id_sugerido',
  'anio',
  'materia_nombre',
  'materia_key_actual',
  'plan_id_actual',
  'plan_id_sugerido',
  'materia_codigo_actual',
  'materia_codigo_sugerido',
  'requiere_mesa',
  'presentInLegacy',
  'presentInExamEngine',
  'legacyCount',
  'examEngineCount',
  'llamados_detectados',
  'keyType',
  'riesgo_clave_debil',
  'riesgo_nombre_duplicado',
  'riesgo_laboratorio_multiplan',
  'requiere_revision',
  'motivo_revision',
  'accion_requerida',
  'observaciones_revision',
]

function fail(message) {
  console.error(`[v2 subject identity review] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function readOptionalJson(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback
  return readJsonFile(filePath)
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (!/[",\n\r;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function rowsToCsv(rows = []) {
  return `${[
    CSV_COLUMNS.join(','),
    ...rows.map((row) => CSV_COLUMNS.map((column) => csvEscape(row[column])).join(',')),
  ].join('\n')}\n`
}

function buildSummaryReport(result = {}) {
  return {
    source: {
      snapshot: 'local-audit/workspaceSnapshot.real.local.json',
      equivalenceView: 'local-audit/exam_universe_equivalence_view.json',
      readinessReport: existsSync(READINESS_REPORT_PATH) ? 'local-audit/template_v2_readiness.json' : null,
      readOnly: true,
    },
    outputs: {
      csv: 'local-audit/v2_subject_identity_review.csv',
      json: 'local-audit/v2_subject_identity_review.json',
      summary: 'local-audit/v2_subject_identity_review.summary.json',
    },
    summary: result.summary,
    groupedByCareer: result.groupedByCareer,
    recommendations: result.recommendations,
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(summaryReport = {}) {
  const summary = summaryReport.summary ?? {}
  return {
    totalRequiredSubjects: summary.totalRequiredSubjects,
    strongKeySubjects: summary.strongKeySubjects,
    missingPlanId: summary.missingPlanId,
    missingMateriaCodigo: summary.missingMateriaCodigo,
    laboratorioMultiPlanSubjects: summary.laboratorioMultiPlanSubjects,
    requiresInstitutionalReview: summary.requiresInstitutionalReview,
    readyForCompactFinalTableComparison: summary.readyForCompactFinalTableComparison,
    safeToReplaceLegacy: summary.safeToReplaceLegacy,
    outputs: summaryReport.outputs,
  }
}

function main() {
  if (!existsSync(SNAPSHOT_INPUT_PATH)) {
    fail('No existe local-audit/workspaceSnapshot.real.local.json.')
    return
  }
  if (!existsSync(EQUIVALENCE_VIEW_PATH)) {
    fail('No existe local-audit/exam_universe_equivalence_view.json.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
    const snapshot = readJsonFile(SNAPSHOT_INPUT_PATH)
    const equivalenceView = readJsonFile(EQUIVALENCE_VIEW_PATH)
    const readinessReport = readOptionalJson(READINESS_REPORT_PATH, readOptionalJson(READINESS_SUMMARY_PATH, {}))
    const result = buildV2SubjectIdentityReview({
      snapshot,
      equivalenceView,
      readinessReport,
    })
    const summaryReport = buildSummaryReport(result)

    writeFileSync(CSV_OUTPUT_PATH, rowsToCsv(result.reviewRows), 'utf8')
    writeJson(JSON_OUTPUT_PATH, result)
    writeJson(SUMMARY_OUTPUT_PATH, summaryReport)

    console.log(JSON.stringify(buildConsoleSummary(summaryReport), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar el paquete de revision de identidad v2.')
  }
}

main()
