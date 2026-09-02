import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DOCENTE_MATERIA_CANDIDATE_COLUMNS,
} from '../../src/utils/examEngine/audit/buildDocenteMateriaCandidateTemplate.js'
import { applyDocenteMateriaReview } from '../../src/utils/examEngine/audit/applyDocenteMateriaReview.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const CANDIDATE_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.candidate.json')
const REVIEW_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.review.csv')
const CORRECTED_CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.corrected.csv')
const CORRECTED_JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.corrected.json')
const CORRECTED_SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.corrected.summary.json')
const PENDING_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'docente_materia.corrected.pending.json')

function fail(message) {
  console.error(`[docente_materia apply] ${message}`)
  process.exitCode = 1
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`No se pudo leer JSON local: ${error instanceof Error ? error.message : error}`)
  }
}

function readJsonArray(filePath, label) {
  const value = readJsonFile(filePath)
  if (!Array.isArray(value)) {
    throw new Error(`${label} debe ser un array JSON.`)
  }
  return value
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

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (!/[",\r\n;]/.test(text)) return text
  return `"${text.replaceAll('"', '""')}"`
}

function rowsToCsv(rows = []) {
  const header = DOCENTE_MATERIA_CANDIDATE_COLUMNS.join(',')
  const body = rows.map((row) => (
    DOCENTE_MATERIA_CANDIDATE_COLUMNS
      .map((column) => escapeCsvCell(row[column]))
      .join(',')
  ))
  return [header, ...body].join('\n')
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function buildSafeConsoleSummary(result = {}, generated = {}) {
  const summary = result.summary ?? {}

  return {
    source: {
      candidateRows: 'local-audit/docente_materia.candidate.json',
      reviewRows: 'local-audit/docente_materia.review.csv',
      readOnly: true,
    },
    generated,
    counts: {
      candidateRows: summary.candidateRows ?? 0,
      reviewRows: summary.reviewRows ?? 0,
      correctedRows: summary.correctedRows ?? 0,
      appliedReviewItems: summary.appliedReviewItems ?? 0,
      pendingReviewItems: summary.pendingReviewItems ?? 0,
      titularesConfirmados: summary.titularesConfirmados ?? 0,
      coDocentesAsignados: summary.coDocentesAsignados ?? 0,
      auxiliaresAsignados: summary.auxiliaresAsignados ?? 0,
      horariosHuerfanosPendientes: summary.horariosHuerfanosPendientes ?? 0,
      parserErrors: summary.parserErrors ?? 0,
      parserWarnings: summary.parserWarnings ?? 0,
      assignmentErrors: summary.assignmentErrors ?? 0,
      errors: summary.errors ?? 0,
      warnings: summary.warnings ?? 0,
    },
    readyForImpactComparison: summary.readyForImpactComparison === true,
  }
}

function main() {
  if (!existsSync(CANDIDATE_INPUT_PATH)) {
    fail('No existe local-audit/docente_materia.candidate.json. Ejecuta primero buildDocenteMateriaCandidateTemplate.mjs.')
    return
  }

  if (!existsSync(REVIEW_INPUT_PATH)) {
    fail('No existe local-audit/docente_materia.review.csv. Ejecuta primero buildDocenteMateriaReviewPack.mjs y completa la revision.')
    return
  }

  try {
    mkdirSync(LOCAL_AUDIT_DIR, { recursive: true })

    const candidateRows = readJsonArray(CANDIDATE_INPUT_PATH, 'docente_materia.candidate.json')
    const reviewRows = readCsvRows(REVIEW_INPUT_PATH)
    const result = applyDocenteMateriaReview({
      candidateRows,
      reviewRows,
    })

    if (result.summary.readyForImpactComparison) {
      writeFileSync(CORRECTED_CSV_OUTPUT_PATH, `${rowsToCsv(result.correctedRows)}\n`, 'utf8')
      writeJson(CORRECTED_JSON_OUTPUT_PATH, result.correctedRows)
      writeJson(CORRECTED_SUMMARY_OUTPUT_PATH, {
        summary: result.summary,
        appliedReviewItems: result.appliedReviewItems,
        warnings: result.warnings,
        errors: result.errors,
      })

      console.log(JSON.stringify(buildSafeConsoleSummary(result, {
        correctedCsv: 'local-audit/docente_materia.corrected.csv',
        correctedJson: 'local-audit/docente_materia.corrected.json',
        correctedSummary: 'local-audit/docente_materia.corrected.summary.json',
        pending: null,
      }), null, 2))
      return
    }

    writeJson(PENDING_OUTPUT_PATH, {
      summary: result.summary,
      pendingReviewItems: result.pendingReviewItems,
      appliedReviewItems: result.appliedReviewItems,
      warnings: result.warnings,
      errors: result.errors,
    })

    console.log(JSON.stringify(buildSafeConsoleSummary(result, {
      correctedCsv: null,
      correctedJson: null,
      correctedSummary: null,
      pending: 'local-audit/docente_materia.corrected.pending.json',
    }), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo aplicar la revision docente_materia.')
  }
}

main()
