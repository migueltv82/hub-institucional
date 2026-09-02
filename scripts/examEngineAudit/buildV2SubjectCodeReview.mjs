import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildV2SubjectCodeReview } from '../../src/utils/examEngine/audit/buildV2SubjectCodeReview.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const INPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-identity-workpack-plan-applied')
const OUTPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-code-review')

const WORKPACK_FILE_NAMES = [
  'ING_revision.csv',
  'GEO_revision.csv',
  'QUI_revision.csv',
  'LAB_revision.csv',
  'TUR_revision.csv',
  'TRA_revision.csv',
  'UNKNOWN_revision.csv',
]

const CAREER_OUTPUT_ORDER = ['ING', 'GEO', 'QUI', 'LAB', 'TUR', 'TRA', 'UNKNOWN']

export const SUBJECT_CODE_REVIEW_COLUMNS = [
  'review_id',
  'carrera',
  'carrera_id_final',
  'plan_id_final',
  'anio',
  'materia_nombre',
  'materia_codigo_sugerido',
  'materia_codigo_borrador',
  'materia_codigo_final',
  'estado_revision',
  'riesgo_nombre_duplicado',
  'riesgo_codigo_duplicado',
  'riesgo_homonimia',
  'prioridad_revision',
  'motivo_revision',
  'accion_requerida',
  'observaciones_revision',
]

const SUMMARY_COLUMNS = [
  'grupo',
  'total_materias',
  'con_plan',
  'sin_plan',
  'con_codigo_borrador',
  'con_codigo_final',
  'prioridad_alta',
  'homonimias',
  'duplicados',
  'accion',
]

function fail(message) {
  console.error(`[v2 subject code review] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
}

function stripBom(value) {
  return String(value ?? '').replace(/^\uFEFF/, '')
}

function parseCsvLine(line, delimiter) {
  const cells = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === delimiter && !quoted) {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }

  cells.push(current)
  return cells
}

function splitCsvRecords(text) {
  const records = []
  let current = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '""'
      index += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      current += char
      continue
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1
      records.push(current)
      current = ''
      continue
    }
    current += char
  }

  if (current) records.push(current)
  return records
}

function countDelimiter(line, delimiter) {
  return parseCsvLine(line, delimiter).length
}

function detectDelimiter(headerLine) {
  return countDelimiter(headerLine, ';') > countDelimiter(headerLine, ',') ? ';' : ','
}

function readCsvFile(filePath) {
  const text = stripBom(readFileSync(filePath, 'utf8'))
  const records = splitCsvRecords(text).filter((line) => line.trim() !== '')
  if (!records.length) return { headers: [], rows: [] }
  const delimiter = detectDelimiter(records[0])
  const headers = parseCsvLine(records[0], delimiter).map((header) => header.trim())
  const rows = records.slice(1).map((record) => {
    const cells = parseCsvLine(record, delimiter)
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] ?? ''
      return row
    }, {})
  })

  return { headers, rows }
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

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function readSubjectRows() {
  return WORKPACK_FILE_NAMES.flatMap((fileName) => {
    const filePath = resolve(INPUT_DIR, fileName)
    if (!existsSync(filePath)) return []
    return readCsvFile(filePath).rows
  })
}

function countRows(rows = [], predicate) {
  return rows.filter(predicate).length
}

function buildSummaryRows(result = {}) {
  const rowsByCareer = result.rowsByCareer ?? {}
  const duplicateReviewIds = new Set((result.duplicateRiskRows ?? []).map((row) => row.review_id))
  const rowsForCareer = (careerId) => rowsByCareer[careerId] ?? []

  const careerRows = CAREER_OUTPUT_ORDER
    .filter((careerId) => rowsForCareer(careerId).length > 0 || !['LAB', 'UNKNOWN'].includes(careerId))
    .map((careerId) => {
      const rows = rowsForCareer(careerId)
      return {
        grupo: careerId,
        total_materias: rows.length,
        con_plan: countRows(rows, (row) => clean(row.plan_id_final)),
        sin_plan: countRows(rows, (row) => !clean(row.plan_id_final)),
        con_codigo_borrador: countRows(rows, (row) => clean(row.materia_codigo_borrador)),
        con_codigo_final: countRows(rows, (row) => clean(row.materia_codigo_final)),
        prioridad_alta: countRows(rows, (row) => row.prioridad_revision === 'ALTA'),
        homonimias: countRows(rows, (row) => row.riesgo_homonimia === 'SI'),
        duplicados: countRows(rows, (row) => duplicateReviewIds.has(row.review_id)),
        accion: rows.length ? 'COMPLETAR_MATERIA_CODIGO_FINAL' : 'SIN_FILAS',
      }
    })

  return [
    {
      grupo: 'TOTAL',
      total_materias: result.summary?.totalSubjects ?? 0,
      con_plan: result.summary?.subjectsWithPlanId ?? 0,
      sin_plan: result.summary?.subjectsMissingPlanId ?? 0,
      con_codigo_borrador: result.summary?.subjectsWithDraftCode ?? 0,
      con_codigo_final: result.summary?.subjectsWithFinalCode ?? 0,
      prioridad_alta: result.summary?.highPriorityRows ?? 0,
      homonimias: result.summary?.homonymyRows ?? 0,
      duplicados: (result.duplicateRiskRows ?? []).length,
      accion: result.summary?.nextAction ?? '',
    },
    ...careerRows,
  ]
}

function buildReadme() {
  return [
    '# Confirmacion institucional de codigos de materias v2',
    '',
    '`materia_codigo_final` es el codigo oficial y estable que identifica una materia dentro de un `plan_id_final`.',
    '',
    'La identidad v2 de una materia se confirma por `plan_id_final + materia_codigo_final`. No usar el nombre de materia como identidad unica.',
    '',
    '## Reglas de carga',
    '',
    '- `materia_codigo_final` debe ser unico dentro de cada `plan_id_final`.',
    '- No usar `PENDIENTE`, `REVISAR`, `SUGERIDO` ni `SIN_CODIGO` como codigo final.',
    '- `materia_codigo_borrador` es una ayuda generada desde el codigo sugerido; no es oficial.',
    '- Una persona debe completar o corregir `materia_codigo_final`.',
    '- Cambiar `estado_revision` a `CONFIRMADO` solo cuando el codigo sea institucionalmente correcto.',
    '- Revisar primero `01_prioridad_alta.csv` y las 34 homonimias de `02_homonimias.csv`.',
    '',
    '## Luego de confirmar',
    '',
    '1. Completar `materia_codigo_final` en los CSV por carrera.',
    '2. Cambiar `estado_revision` a `CONFIRMADO` solo en filas validadas.',
    '3. Mergear/aplicar la revision de codigos.',
    '4. Ejecutar la validacion de identidad v2 antes de comparar tablas finales.',
    '',
  ].join('\n')
}

function buildSummaryReport(result = {}) {
  return {
    ...(result.summary ?? {}),
    source: {
      workpackDirectory: 'local-audit/v2-subject-identity-workpack-plan-applied/',
      readOnly: true,
    },
    outputs: {
      directory: 'local-audit/v2-subject-code-review/',
      summaryCsv: 'local-audit/v2-subject-code-review/00_resumen_codigos.csv',
      highPriorityCsv: 'local-audit/v2-subject-code-review/01_prioridad_alta.csv',
      homonymyCsv: 'local-audit/v2-subject-code-review/02_homonimias.csv',
      duplicateRiskCsv: 'local-audit/v2-subject-code-review/03_riesgo_duplicados.csv',
      reviewJson: 'local-audit/v2-subject-code-review/v2_subject_code_review.json',
      summaryJson: 'local-audit/v2-subject-code-review/v2_subject_code_review.summary.json',
      readme: 'local-audit/v2-subject-code-review/README_confirmacion_codigos.md',
    },
    summary: result.summary,
    recommendations: result.recommendations,
    duplicateGroups: result.duplicateGroups,
    crossPlanWarnings: result.warnings,
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(result = {}) {
  return {
    totalSubjects: result.summary?.totalSubjects,
    subjectsWithPlanId: result.summary?.subjectsWithPlanId,
    subjectsWithDraftCode: result.summary?.subjectsWithDraftCode,
    subjectsWithFinalCode: result.summary?.subjectsWithFinalCode,
    highPriorityRows: result.summary?.highPriorityRows,
    homonymyRows: result.summary?.homonymyRows,
    duplicateDraftCodeRisks: result.summary?.duplicateDraftCodeRisks,
    duplicateFinalCodeRisks: result.summary?.duplicateFinalCodeRisks,
    readyForCodeApply: result.summary?.readyForCodeApply,
    packagePath: 'local-audit/v2-subject-code-review/',
  }
}

function writeCareerFiles(result = {}) {
  CAREER_OUTPUT_ORDER.forEach((careerId) => {
    const rows = result.rowsByCareer?.[careerId] ?? []
    if (!rows.length && ['LAB', 'UNKNOWN'].includes(careerId)) return
    writeFileSync(
      resolve(OUTPUT_DIR, `${careerId}_codigos.csv`),
      rowsToCsv(rows, SUBJECT_CODE_REVIEW_COLUMNS),
      'utf8',
    )
  })
}

function main() {
  if (!existsSync(INPUT_DIR)) {
    fail('No existe local-audit/v2-subject-identity-workpack-plan-applied/. Ejecuta primero applyV2PlanCatalogToSubjectWorkpack.mjs.')
    return
  }

  try {
    const subjectRows = readSubjectRows()
    const result = buildV2SubjectCodeReview({ subjectRows })

    mkdirSync(OUTPUT_DIR, { recursive: true })
    writeFileSync(resolve(OUTPUT_DIR, '00_resumen_codigos.csv'), rowsToCsv(buildSummaryRows(result), SUMMARY_COLUMNS), 'utf8')
    writeFileSync(resolve(OUTPUT_DIR, '01_prioridad_alta.csv'), rowsToCsv(result.priorityRows, SUBJECT_CODE_REVIEW_COLUMNS), 'utf8')
    writeFileSync(resolve(OUTPUT_DIR, '02_homonimias.csv'), rowsToCsv(result.homonymyRows, SUBJECT_CODE_REVIEW_COLUMNS), 'utf8')
    writeFileSync(resolve(OUTPUT_DIR, '03_riesgo_duplicados.csv'), rowsToCsv(result.duplicateRiskRows, SUBJECT_CODE_REVIEW_COLUMNS), 'utf8')
    writeCareerFiles(result)
    writeJson(resolve(OUTPUT_DIR, 'v2_subject_code_review.json'), {
      reviewRows: result.reviewRows,
      rowsByCareer: result.rowsByCareer,
      rowsByPlan: result.rowsByPlan,
      priorityRows: result.priorityRows,
      duplicateRiskRows: result.duplicateRiskRows,
      homonymyRows: result.homonymyRows,
      duplicateGroups: result.duplicateGroups,
      recommendations: result.recommendations,
    })
    writeJson(resolve(OUTPUT_DIR, 'v2_subject_code_review.summary.json'), buildSummaryReport(result))
    writeFileSync(resolve(OUTPUT_DIR, 'README_confirmacion_codigos.md'), buildReadme(), 'utf8')

    console.log(JSON.stringify(buildConsoleSummary(result), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar el paquete de revision de codigos v2.')
  }
}

main()
