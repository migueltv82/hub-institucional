import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  V2_SUBJECT_IDENTITY_WORKPACK_CAREERS,
  V2_SUBJECT_IDENTITY_WORKPACK_COLUMNS,
  buildV2SubjectIdentityWorkpack,
} from '../../src/utils/examEngine/audit/buildV2SubjectIdentityWorkpack.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const WORKPACK_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-identity-workpack')

const PENDING_JSON_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.pending.json')
const PENDING_CSV_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.pending.csv')
const REVIEW_CSV_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_review.csv')
const SUMMARY_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.validation.summary.json')

const SUMMARY_CSV_OUTPUT_PATH = resolve(WORKPACK_DIR, '00_resumen_revision.csv')
const PRIORITY_OUTPUT_PATH = resolve(WORKPACK_DIR, '01_prioridad_alta.csv')
const HOMONYMY_OUTPUT_PATH = resolve(WORKPACK_DIR, '02_homonimias.csv')
const README_OUTPUT_PATH = resolve(WORKPACK_DIR, 'README_carga_institucional.md')
const SUMMARY_JSON_OUTPUT_PATH = resolve(WORKPACK_DIR, 'workpack_summary.json')

const SUMMARY_COLUMNS = [
  'grupo',
  'total',
  'prioridad_alta',
  'homonimias',
  'unknown_career',
  'accion',
]

function fail(message) {
  console.error(`[v2 subject identity workpack] ${message}`)
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

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function readPendingRows() {
  const pendingJson = readJson(PENDING_JSON_INPUT_PATH, null)
  if (Array.isArray(pendingJson)) return pendingJson
  if (existsSync(PENDING_CSV_INPUT_PATH)) return readCsvRows(PENDING_CSV_INPUT_PATH)
  return []
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

function countRows(rows = [], predicate) {
  return rows.filter(predicate).length
}

function buildSummaryRows(result = {}) {
  const rowsByCareer = result.rowsByCareer ?? {}
  const summaryRows = V2_SUBJECT_IDENTITY_WORKPACK_CAREERS
    .filter((careerId) => careerId !== 'UNKNOWN' || (rowsByCareer.UNKNOWN ?? []).length > 0)
    .map((careerId) => {
      const rows = rowsByCareer[careerId] ?? []
      return {
        grupo: careerId,
        total: rows.length,
        prioridad_alta: countRows(rows, (row) => row.prioridad === 'ALTA'),
        homonimias: countRows(rows, (row) => row.riesgo_nombre_duplicado === 'SI'),
        unknown_career: careerId === 'UNKNOWN' ? rows.length : 0,
        accion: rows.length ? 'COMPLETAR_CAMPOS_FINALES_OFICIALES' : 'SIN_FILAS',
      }
    })

  return [
    {
      grupo: 'TOTAL',
      total: result.workpackSummary?.totalRows ?? 0,
      prioridad_alta: result.workpackSummary?.highPriorityRows ?? 0,
      homonimias: result.workpackSummary?.homonymyRows ?? 0,
      unknown_career: result.workpackSummary?.unknownCareerRows ?? 0,
      accion: result.workpackSummary?.nextAction ?? '',
    },
    ...summaryRows,
  ]
}

function writeCareerFiles(result = {}) {
  V2_SUBJECT_IDENTITY_WORKPACK_CAREERS.forEach((careerId) => {
    if (careerId === 'UNKNOWN' && !(result.rowsByCareer?.UNKNOWN ?? []).length) return
    const filePath = resolve(WORKPACK_DIR, `${careerId}_revision.csv`)
    writeFileSync(
      filePath,
      rowsToCsv(result.rowsByCareer?.[careerId] ?? [], V2_SUBJECT_IDENTITY_WORKPACK_COLUMNS),
      'utf8',
    )
  })
}

function buildSummaryReport(result = {}) {
  return {
    source: {
      pendingJson: existsSync(PENDING_JSON_INPUT_PATH) ? 'local-audit/v2_subject_identity.pending.json' : null,
      pendingCsv: existsSync(PENDING_CSV_INPUT_PATH) ? 'local-audit/v2_subject_identity.pending.csv' : null,
      reviewCsv: existsSync(REVIEW_CSV_INPUT_PATH) ? 'local-audit/v2_subject_identity_review.csv' : null,
      validationSummary: existsSync(SUMMARY_INPUT_PATH)
        ? 'local-audit/v2_subject_identity.validation.summary.json'
        : null,
      readOnly: true,
    },
    outputs: {
      directory: 'local-audit/v2-subject-identity-workpack/',
      summaryCsv: 'local-audit/v2-subject-identity-workpack/00_resumen_revision.csv',
      highPriorityCsv: 'local-audit/v2-subject-identity-workpack/01_prioridad_alta.csv',
      homonymyCsv: 'local-audit/v2-subject-identity-workpack/02_homonimias.csv',
      instructions: 'local-audit/v2-subject-identity-workpack/README_carga_institucional.md',
      summaryJson: 'local-audit/v2-subject-identity-workpack/workpack_summary.json',
    },
    workpackSummary: result.workpackSummary,
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(result = {}) {
  return {
    totalRows: result.workpackSummary?.totalRows,
    rowsByCareer: result.workpackSummary?.rowsByCareer,
    highPriorityRows: result.workpackSummary?.highPriorityRows,
    homonymyRows: result.workpackSummary?.homonymyRows,
    unknownCareerRows: result.workpackSummary?.unknownCareerRows,
    readyForInstitutionalEditing: result.workpackSummary?.readyForInstitutionalEditing,
    workpackPath: 'local-audit/v2-subject-identity-workpack/',
  }
}

function main() {
  try {
    const pendingRows = readPendingRows()
    if (!pendingRows.length) {
      fail('No hay filas pendientes. Ejecuta primero applyV2SubjectIdentityReview.mjs.')
      return
    }

    const reviewRows = existsSync(REVIEW_CSV_INPUT_PATH) ? readCsvRows(REVIEW_CSV_INPUT_PATH) : []
    const summary = readJson(SUMMARY_INPUT_PATH, {})
    const result = buildV2SubjectIdentityWorkpack({ pendingRows, reviewRows, summary })

    mkdirSync(WORKPACK_DIR, { recursive: true })
    writeFileSync(SUMMARY_CSV_OUTPUT_PATH, rowsToCsv(buildSummaryRows(result), SUMMARY_COLUMNS), 'utf8')
    writeFileSync(PRIORITY_OUTPUT_PATH, rowsToCsv(result.priorityRows, V2_SUBJECT_IDENTITY_WORKPACK_COLUMNS), 'utf8')
    writeFileSync(HOMONYMY_OUTPUT_PATH, rowsToCsv(result.homonymyRows, V2_SUBJECT_IDENTITY_WORKPACK_COLUMNS), 'utf8')
    writeCareerFiles(result)
    writeFileSync(README_OUTPUT_PATH, result.instructions, 'utf8')
    writeJson(SUMMARY_JSON_OUTPUT_PATH, buildSummaryReport(result))

    console.log(JSON.stringify(buildConsoleSummary(result), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo generar el workpack de identidad v2.')
  }
}

main()
