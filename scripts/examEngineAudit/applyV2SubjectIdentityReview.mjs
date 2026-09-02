import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyV2SubjectIdentityReview } from '../../src/utils/examEngine/audit/applyV2SubjectIdentityReview.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const REVIEW_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_review.csv')
const SNAPSHOT_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')
const CORRECTED_CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.corrected.csv')
const CORRECTED_JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.corrected.json')
const PENDING_CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.pending.csv')
const PENDING_JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.pending.json')
const SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.validation.summary.json')

const CORRECTED_COLUMNS = [
  'review_id',
  'carrera',
  'carrera_id',
  'plan_id',
  'materia_codigo',
  'materia_nombre',
  'materia_key_anterior',
  'estado_revision',
  'observaciones_revision',
]

const PENDING_COLUMNS = [
  'review_id',
  'carrera',
  'anio',
  'materia_nombre',
  'materia_key_actual',
  'plan_id_sugerido',
  'materia_codigo_sugerido',
  'estado_revision',
  'pendiente_motivo',
  'accion_requerida',
  'observaciones_revision',
]

function fail(message) {
  console.error(`[v2 subject identity apply] ${message}`)
  process.exitCode = 1
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

function readCsvRows(filePath) {
  const text = stripBom(readFileSync(filePath, 'utf8'))
  const records = splitCsvRecords(text).filter((line) => line.trim() !== '')
  if (!records.length) return []
  const delimiter = detectDelimiter(records[0])
  const headers = parseCsvLine(records[0], delimiter).map((header) => header.trim())

  return records.slice(1).map((record) => {
    const cells = parseCsvLine(record, delimiter)
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] ?? ''
      return row
    }, {})
  })
}

function readOptionalJson(filePath, fallback = {}) {
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

function buildSummaryReport(result = {}) {
  return {
    source: {
      reviewCsv: 'local-audit/v2_subject_identity_review.csv',
      snapshot: existsSync(SNAPSHOT_INPUT_PATH) ? 'local-audit/workspaceSnapshot.real.local.json' : null,
      readOnly: true,
    },
    outputs: {
      correctedCsv: 'local-audit/v2_subject_identity.corrected.csv',
      correctedJson: 'local-audit/v2_subject_identity.corrected.json',
      pendingCsv: 'local-audit/v2_subject_identity.pending.csv',
      pendingJson: 'local-audit/v2_subject_identity.pending.json',
      summary: 'local-audit/v2_subject_identity.validation.summary.json',
    },
    summary: result.summary,
    duplicateKeys: result.duplicateKeys,
    validationIssues: result.validationIssues,
    recommendations: result.recommendations,
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(summaryReport = {}) {
  const summary = summaryReport.summary ?? {}
  return {
    totalReviewRows: summary.totalReviewRows,
    correctedRows: summary.correctedRows,
    pendingRows: summary.pendingRows,
    rejectedRows: summary.rejectedRows,
    duplicateKeyCount: summary.duplicateKeyCount,
    readyForCompactFinalTableComparison: summary.readyForCompactFinalTableComparison,
    safeToReplaceLegacy: summary.safeToReplaceLegacy,
  }
}

function main() {
  if (!existsSync(REVIEW_INPUT_PATH)) {
    fail('No existe local-audit/v2_subject_identity_review.csv. Ejecuta primero buildV2SubjectIdentityReview.mjs.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })
    const reviewRows = readCsvRows(REVIEW_INPUT_PATH)
    const snapshot = readOptionalJson(SNAPSHOT_INPUT_PATH, {})
    const result = applyV2SubjectIdentityReview({ reviewRows, snapshot })
    const summaryReport = buildSummaryReport(result)

    writeFileSync(CORRECTED_CSV_OUTPUT_PATH, rowsToCsv(result.correctedRows, CORRECTED_COLUMNS), 'utf8')
    writeJson(CORRECTED_JSON_OUTPUT_PATH, result.correctedRows)
    writeFileSync(PENDING_CSV_OUTPUT_PATH, rowsToCsv(result.pendingRows, PENDING_COLUMNS), 'utf8')
    writeJson(PENDING_JSON_OUTPUT_PATH, result.pendingRows)
    writeJson(SUMMARY_OUTPUT_PATH, summaryReport)

    console.log(JSON.stringify(buildConsoleSummary(summaryReport), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo aplicar la revision de identidad v2.')
  }
}

main()
