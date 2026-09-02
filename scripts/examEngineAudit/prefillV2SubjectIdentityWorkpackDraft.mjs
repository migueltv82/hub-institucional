import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  prefillV2SubjectIdentityWorkpackDraft,
} from '../../src/utils/examEngine/audit/prefillV2SubjectIdentityWorkpackDraft.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const SOURCE_WORKPACK_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-identity-workpack')
const OUTPUT_WORKPACK_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-identity-workpack-prefilled')

const WORKPACK_FILE_NAMES = [
  'ING_revision.csv',
  'GEO_revision.csv',
  'QUI_revision.csv',
  'LAB_revision.csv',
  'TUR_revision.csv',
  'TRA_revision.csv',
]

const HIGH_PRIORITY_OUTPUT_PATH = resolve(OUTPUT_WORKPACK_DIR, '01_revisar_prioridad_alta.csv')
const SUMMARY_OUTPUT_PATH = resolve(OUTPUT_WORKPACK_DIR, 'prefill_summary.json')
const README_OUTPUT_PATH = resolve(OUTPUT_WORKPACK_DIR, 'README_revision_prefilled.md')

const AUXILIARY_COLUMNS = [
  'motivos_prioridad_alta',
  'prefill_skip_reason',
]

function fail(message) {
  console.error(`[v2 subject identity prefill draft] ${message}`)
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

function queueRowsByReviewId(rows = []) {
  return rows.reduce((map, row) => {
    const reviewId = clean(row.review_id)
    const queue = map.get(reviewId) ?? []
    queue.push(row)
    map.set(reviewId, queue)
    return map
  }, new Map())
}

function buildOutputRows(originalRows = [], prefilledRows = []) {
  const prefilledByReviewId = queueRowsByReviewId(prefilledRows)

  return originalRows.map((row) => {
    const reviewId = clean(row.review_id)
    const queue = prefilledByReviewId.get(reviewId) ?? []
    const prefilledRow = queue.shift()
    return prefilledRow ?? row
  })
}

function addCounts(target, source) {
  target.totalRows += source.summary.totalRows
  target.prefilledRows += source.summary.prefilledRows
  target.skippedRows += source.summary.skippedRows
  target.highRiskRows += source.summary.highRiskRows
  target.homonymyRows += source.summary.homonymyRows
}

function buildReadme(summary = {}) {
  return [
    '# Precarga asistida - identidad v2 de materias',
    '',
    'Esta carpeta es una copia de trabajo local generada desde `local-audit/v2-subject-identity-workpack/`.',
    'Su objetivo es acelerar la revision manual de identidad de materias copiando sugerencias seguras a campos finales como borrador.',
    '',
    '## Estado de esta precarga',
    '',
    '- No es un resultado oficial.',
    '- No guarda cronogramas, no publica datos y no escribe en Supabase.',
    '- Las filas precargadas usan `estado_revision = PRECONFIRMAR`.',
    '- `PRECONFIRMAR` no habilita la comparacion final compactada.',
    '- `readyForCompactFinalTableComparison` permanece en `false`.',
    '- `safeToReplaceLegacy` permanece en `false`.',
    '',
    'Una persona debe revisar cada fila y cambiar `PRECONFIRMAR` a `CONFIRMADO` solo cuando la identidad sea institucionalmente valida.',
    '',
    '## Prioridad alta',
    '',
    '`01_revisar_prioridad_alta.csv` agrupa filas que no se precargaron por riesgo de homonimia, carrera desconocida, alternativas de plan/codigo, codigo sugerido vacio, riesgo Laboratorio/multiplan o motivos criticos de revision.',
    'Revisar esas filas primero antes de validar el resto.',
    '',
    '## Resumen',
    '',
    `- Total de filas: ${summary.totalRows ?? 0}`,
    `- Filas precargadas: ${summary.prefilledRows ?? 0}`,
    `- Filas omitidas: ${summary.skippedRows ?? 0}`,
    `- Filas de prioridad alta: ${summary.highRiskRows ?? 0}`,
    `- Homonimias: ${summary.homonymyRows ?? 0}`,
    '',
    '## Luego de revisar',
    '',
    '1. Completar o corregir los campos finales en los CSV por carrera.',
    '2. Cambiar `estado_revision` a `CONFIRMADO`, `APROBADO`, `VALIDADO` u `OK` solo tras revision institucional.',
    '3. Ejecutar el merge del workpack revisado.',
    '4. Ejecutar el apply de identidad v2 y revisar sus pendientes.',
    '5. Recien despues de una validacion sin pendientes corresponde evaluar la comparacion final compactada.',
    '',
  ].join('\n')
}

function buildSummaryReport({
  summary,
  rowsByCareer,
  warnings,
  errors,
}) {
  return {
    source: {
      workpackDirectory: 'local-audit/v2-subject-identity-workpack/',
      readOnly: true,
    },
    outputs: {
      directory: 'local-audit/v2-subject-identity-workpack-prefilled/',
      highPriorityCsv: 'local-audit/v2-subject-identity-workpack-prefilled/01_revisar_prioridad_alta.csv',
      summaryJson: 'local-audit/v2-subject-identity-workpack-prefilled/prefill_summary.json',
      readme: 'local-audit/v2-subject-identity-workpack-prefilled/README_revision_prefilled.md',
    },
    rowsByCareer,
    summary: {
      ...summary,
      readyForApply: summary.totalRows > 0 && errors.length === 0,
      readyForCompactFinalTableComparison: false,
      safeToReplaceLegacy: false,
      nextAction: (
        'Revisar manualmente la precarga, confirmar institucionalmente las filas validas y luego ejecutar merge/apply.'
      ),
    },
    warnings,
    errors,
  }
}

function buildConsoleSummary(summary = {}) {
  return {
    totalRows: summary.totalRows,
    prefilledRows: summary.prefilledRows,
    skippedRows: summary.skippedRows,
    highRiskRows: summary.highRiskRows,
    homonymyRows: summary.homonymyRows,
    readyForApply: summary.readyForApply,
    readyForCompactFinalTableComparison: summary.readyForCompactFinalTableComparison,
    safeToReplaceLegacy: summary.safeToReplaceLegacy,
    workpackPath: 'local-audit/v2-subject-identity-workpack-prefilled/',
  }
}

function main() {
  if (!existsSync(SOURCE_WORKPACK_DIR)) {
    fail('No existe local-audit/v2-subject-identity-workpack/. Ejecuta primero buildV2SubjectIdentityWorkpack.mjs.')
    return
  }

  const aggregate = {
    totalRows: 0,
    prefilledRows: 0,
    skippedRows: 0,
    highRiskRows: 0,
    homonymyRows: 0,
    readyForApply: false,
    readyForCompactFinalTableComparison: false,
    safeToReplaceLegacy: false,
    nextAction: '',
  }
  const rowsByCareer = {}
  const highRiskRows = []
  const warnings = []
  const errors = []
  const allHeaders = []

  try {
    mkdirSync(OUTPUT_WORKPACK_DIR, { recursive: true })

    WORKPACK_FILE_NAMES.forEach((fileName) => {
      const inputPath = resolve(SOURCE_WORKPACK_DIR, fileName)
      const outputPath = resolve(OUTPUT_WORKPACK_DIR, fileName)
      const careerId = fileName.replace('_revision.csv', '')

      if (!existsSync(inputPath)) {
        rowsByCareer[careerId] = 0
        return
      }

      const file = readCsvFile(inputPath)
      const result = prefillV2SubjectIdentityWorkpackDraft({ workpackRows: file.rows })
      const outputRows = buildOutputRows(file.rows, result.prefilledRows)

      rowsByCareer[careerId] = file.rows.length
      allHeaders.push(file.headers)
      addCounts(aggregate, result)
      highRiskRows.push(...result.highRiskRows)
      warnings.push(...result.warnings)
      errors.push(...result.errors)

      writeFileSync(outputPath, rowsToCsv(outputRows, file.headers), 'utf8')
    })

    const highRiskColumns = uniqueColumns(
      ...allHeaders,
      AUXILIARY_COLUMNS,
      columnsFromRows(highRiskRows),
    )
    const summaryReport = buildSummaryReport({
      summary: aggregate,
      rowsByCareer,
      warnings,
      errors,
    })

    writeFileSync(HIGH_PRIORITY_OUTPUT_PATH, rowsToCsv(highRiskRows, highRiskColumns), 'utf8')
    writeJson(SUMMARY_OUTPUT_PATH, summaryReport)
    writeFileSync(README_OUTPUT_PATH, buildReadme(summaryReport.summary), 'utf8')

    console.log(JSON.stringify(buildConsoleSummary(summaryReport.summary), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar la precarga asistida.')
  }
}

main()
