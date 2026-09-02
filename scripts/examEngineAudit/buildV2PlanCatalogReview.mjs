import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildV2PlanCatalogReview } from '../../src/utils/examEngine/audit/buildV2PlanCatalogReview.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const OUTPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-plan-catalog-review')

const WORKPACK_SUMMARY_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2-subject-identity-workpack', 'workpack_summary.json')
const SUBJECT_IDENTITY_REVIEW_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_review.json')

const CATALOG_CSV_OUTPUT_PATH = resolve(OUTPUT_DIR, 'v2_plan_catalog_review.csv')
const CATALOG_JSON_OUTPUT_PATH = resolve(OUTPUT_DIR, 'v2_plan_catalog_review.json')
const SUMMARY_OUTPUT_PATH = resolve(OUTPUT_DIR, 'v2_plan_catalog_review.summary.json')
const README_OUTPUT_PATH = resolve(OUTPUT_DIR, 'README_planes_v2.md')

const PLAN_CATALOG_COLUMNS = [
  'carrera_id',
  'carrera_nombre',
  'materias_requeridas',
  'plan_id_sugerido',
  'plan_id_final',
  'plan_nombre_final',
  'anio_plan',
  'resolucion_plan',
  'estado_revision',
  'observaciones_revision',
]

function fail(message) {
  console.error(`[v2 plan catalog review] ${message}`)
  process.exitCode = 1
}

function readJson(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (!/[",\n\r;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function rowsToCsv(rows = [], columns = []) {
  return `${[
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
  ].join('\n')}\n`
}

function buildReadme() {
  return [
    '# Catalogo institucional de planes v2',
    '',
    'Este archivo permite confirmar el `plan_id_final` real por carrera antes de completar codigos finales de materias.',
    '',
    '`plan_id_final` es el identificador estable del plan de estudios que debe usarse para agrupar y validar materias dentro de examEngine v2.',
    '',
    '## Reglas',
    '',
    '- No usar `PLAN-ACTUAL` como `plan_id_final`.',
    '- No usar valores genericos como `SUGERIDO`, `PENDIENTE` o `REVISAR`.',
    '- El identificador debe ser estable y entendible institucionalmente.',
    '- Ejemplos validos: `ING-2026`, `GEO-2026`, `QUI-2026`, `TUR-2026`, `TRA-2026`.',
    '- Si existe una resolucion oficial, puede usarse un identificador mas preciso.',
    '- `estado_revision` debe cambiar a `CONFIRMADO` solo cuando el plan sea institucionalmente correcto.',
    '',
    '## Luego de confirmar',
    '',
    '1. Completar `plan_id_final`, `plan_nombre_final`, `anio_plan` y `resolucion_plan` si corresponde.',
    '2. Cambiar `estado_revision` a `CONFIRMADO` solo para carreras validadas.',
    '3. Aplicar el catalogo al workpack de materias con `applyV2PlanCatalogToSubjectWorkpack.mjs`.',
    '4. Revisar codigos finales de materias y confirmar identidad v2 fila por fila.',
    '',
  ].join('\n')
}

function buildSummaryReport(result = {}) {
  return {
    source: {
      workpackSummary: 'local-audit/v2-subject-identity-workpack/workpack_summary.json',
      subjectIdentityReviewJson: existsSync(SUBJECT_IDENTITY_REVIEW_INPUT_PATH)
        ? 'local-audit/v2_subject_identity_review.json'
        : null,
      readOnly: true,
    },
    outputs: {
      directory: 'local-audit/v2-plan-catalog-review/',
      catalogCsv: 'local-audit/v2-plan-catalog-review/v2_plan_catalog_review.csv',
      catalogJson: 'local-audit/v2-plan-catalog-review/v2_plan_catalog_review.json',
      summaryJson: 'local-audit/v2-plan-catalog-review/v2_plan_catalog_review.summary.json',
      readme: 'local-audit/v2-plan-catalog-review/README_planes_v2.md',
    },
    summary: result.summary,
    recommendations: result.recommendations,
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(result = {}) {
  return {
    totalCareers: result.summary?.totalCareers,
    totalRequiredSubjects: result.summary?.totalRequiredSubjects,
    careersWithPendingPlan: result.summary?.pendingPlans,
    readyForPlanApply: result.summary?.readyForPlanApply,
  }
}

function main() {
  if (!existsSync(WORKPACK_SUMMARY_INPUT_PATH)) {
    fail('No existe local-audit/v2-subject-identity-workpack/workpack_summary.json.')
    return
  }

  try {
    const workpackSummary = readJson(WORKPACK_SUMMARY_INPUT_PATH, {})
    const subjectIdentityRows = readJson(SUBJECT_IDENTITY_REVIEW_INPUT_PATH, {})
    const result = buildV2PlanCatalogReview({ workpackSummary, subjectIdentityRows })

    mkdirSync(OUTPUT_DIR, { recursive: true })
    writeFileSync(CATALOG_CSV_OUTPUT_PATH, rowsToCsv(result.planRows, PLAN_CATALOG_COLUMNS), 'utf8')
    writeJson(CATALOG_JSON_OUTPUT_PATH, result.planRows)
    writeJson(SUMMARY_OUTPUT_PATH, buildSummaryReport(result))
    writeFileSync(README_OUTPUT_PATH, buildReadme(), 'utf8')

    console.log(JSON.stringify(buildConsoleSummary(result), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar el catalogo de planes v2.')
  }
}

main()
