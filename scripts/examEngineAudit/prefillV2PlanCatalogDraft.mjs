import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prefillV2PlanCatalogDraft } from '../../src/utils/examEngine/audit/prefillV2PlanCatalogDraft.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SOURCE_CATALOG_PATH = resolve(LOCAL_AUDIT_DIR, 'v2-plan-catalog-review', 'v2_plan_catalog_review.csv')
const OUTPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-plan-catalog-review-prefilled')

const PREFILLED_CSV_OUTPUT_PATH = resolve(OUTPUT_DIR, 'v2_plan_catalog_review.prefilled.csv')
const PREFILLED_JSON_OUTPUT_PATH = resolve(OUTPUT_DIR, 'v2_plan_catalog_review.prefilled.json')
const SUMMARY_OUTPUT_PATH = resolve(OUTPUT_DIR, 'v2_plan_catalog_review.prefilled.summary.json')
const README_OUTPUT_PATH = resolve(OUTPUT_DIR, 'README_confirmacion_planes.md')

const EXTRA_COLUMNS = ['prefill_skip_reason']

function fail(message) {
  console.error(`[v2 plan catalog prefill draft] ${message}`)
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

function uniqueColumns(...groups) {
  const columns = []
  groups.flat().forEach((column) => {
    if (column && !columns.includes(column)) columns.push(column)
  })
  return columns
}

function columnsFromRows(rows = []) {
  return uniqueColumns(...rows.map((row) => Object.keys(row)))
}

function queueRowsByCareerId(rows = []) {
  return rows.reduce((map, row) => {
    const careerId = clean(row.carrera_id).toUpperCase()
    const queue = map.get(careerId) ?? []
    queue.push(row)
    map.set(careerId, queue)
    return map
  }, new Map())
}

function buildOutputRows(originalRows = [], prefilledRows = [], skippedRows = []) {
  const rowsByCareer = queueRowsByCareerId([...prefilledRows, ...skippedRows])

  return originalRows.map((row) => {
    const queue = rowsByCareer.get(clean(row.carrera_id).toUpperCase()) ?? []
    const outputRow = queue.shift()
    return outputRow ?? row
  })
}

function buildReadme(summary = {}) {
  return [
    '# Confirmacion institucional de planes v2',
    '',
    'Este catalogo esta precargado como borrador para acelerar la revision institucional.',
    '',
    '- Las filas precargadas usan `estado_revision = PRECONFIRMAR`.',
    '- `PRECONFIRMAR` no habilita la aplicacion al workpack de materias.',
    '- Una persona debe revisar cada `plan_id_final` antes de usarlo.',
    '- Para aplicar planes al workpack, cambiar `estado_revision` a `CONFIRMADO` solo cuando el plan sea correcto.',
    '- No usar `PLAN-ACTUAL`, `PENDIENTE`, `SUGERIDO` ni `REVISAR` como `plan_id_final`.',
    '',
    'Despues de confirmar, copiar o usar este CSV como catalogo confirmado y ejecutar `applyV2PlanCatalogToSubjectWorkpack.mjs`.',
    '',
    '## Resumen',
    '',
    `- Filas totales: ${summary.totalRows ?? 0}`,
    `- Planes precargados: ${summary.prefilledRows ?? 0}`,
    `- Filas omitidas: ${summary.skippedRows ?? 0}`,
    `- Filas PRECONFIRMAR: ${summary.preconfirmarRows ?? 0}`,
    `- Filas CONFIRMADO: ${summary.confirmedRows ?? 0}`,
    '',
  ].join('\n')
}

function buildSummaryReport({ outputRows, result }) {
  return {
    source: {
      catalogCsv: 'local-audit/v2-plan-catalog-review/v2_plan_catalog_review.csv',
      readOnly: true,
    },
    outputs: {
      directory: 'local-audit/v2-plan-catalog-review-prefilled/',
      prefilledCsv: 'local-audit/v2-plan-catalog-review-prefilled/v2_plan_catalog_review.prefilled.csv',
      prefilledJson: 'local-audit/v2-plan-catalog-review-prefilled/v2_plan_catalog_review.prefilled.json',
      summaryJson: 'local-audit/v2-plan-catalog-review-prefilled/v2_plan_catalog_review.prefilled.summary.json',
      readme: 'local-audit/v2-plan-catalog-review-prefilled/README_confirmacion_planes.md',
    },
    summary: result.summary,
    rows: {
      totalOutputRows: outputRows.length,
    },
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(summary = {}) {
  return {
    totalRows: summary.totalRows,
    prefilledRows: summary.prefilledRows,
    skippedRows: summary.skippedRows,
    preconfirmarRows: summary.preconfirmarRows,
    confirmedRows: summary.confirmedRows,
    readyForPlanApply: summary.readyForPlanApply,
    safeToReplaceLegacy: summary.safeToReplaceLegacy,
    catalogPath: 'local-audit/v2-plan-catalog-review-prefilled/',
  }
}

function main() {
  if (!existsSync(SOURCE_CATALOG_PATH)) {
    fail('No existe local-audit/v2-plan-catalog-review/v2_plan_catalog_review.csv.')
    return
  }

  try {
    const sourceFile = readCsvFile(SOURCE_CATALOG_PATH)
    const result = prefillV2PlanCatalogDraft({
      planRows: sourceFile.rows,
      options: {
        overwrite: process.argv.includes('--overwrite'),
      },
    })
    const outputRows = buildOutputRows(sourceFile.rows, result.prefilledRows, result.skippedRows)
    const outputColumns = uniqueColumns(sourceFile.headers, EXTRA_COLUMNS, columnsFromRows(outputRows))
    const summaryReport = buildSummaryReport({ outputRows, result })

    mkdirSync(OUTPUT_DIR, { recursive: true })
    writeFileSync(PREFILLED_CSV_OUTPUT_PATH, rowsToCsv(outputRows, outputColumns), 'utf8')
    writeJson(PREFILLED_JSON_OUTPUT_PATH, outputRows)
    writeJson(SUMMARY_OUTPUT_PATH, summaryReport)
    writeFileSync(README_OUTPUT_PATH, buildReadme(result.summary), 'utf8')

    console.log(JSON.stringify(buildConsoleSummary(result.summary), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar la precarga del catalogo de planes v2.')
  }
}

main()
