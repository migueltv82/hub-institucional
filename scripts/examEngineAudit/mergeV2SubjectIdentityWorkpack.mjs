import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyV2SubjectIdentityReview } from '../../src/utils/examEngine/audit/applyV2SubjectIdentityReview.js'
import { mergeV2SubjectIdentityWorkpack } from '../../src/utils/examEngine/audit/mergeV2SubjectIdentityWorkpack.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const WORKPACK_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-identity-workpack')

const ORIGINAL_REVIEW_CSV_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_review.csv')
const SNAPSHOT_INPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'workspaceSnapshot.real.local.json')

const MERGED_CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_review.merged.csv')
const MERGED_JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_review.merged.json')
const MERGE_SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity_workpack_merge.summary.json')

const MERGED_CORRECTED_CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.merged.corrected.csv')
const MERGED_CORRECTED_JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.merged.corrected.json')
const MERGED_PENDING_CSV_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.merged.pending.csv')
const MERGED_PENDING_JSON_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.merged.pending.json')
const MERGED_VALIDATION_SUMMARY_OUTPUT_PATH = resolve(LOCAL_AUDIT_DIR, 'v2_subject_identity.merged.validation.summary.json')

const WORKPACK_FILE_NAMES = [
  'ING_revision.csv',
  'GEO_revision.csv',
  'QUI_revision.csv',
  'LAB_revision.csv',
  'TUR_revision.csv',
  'TRA_revision.csv',
  'UNKNOWN_revision.csv',
]

const FINAL_COLUMNS = [
  'carrera_id_final',
  'plan_id_final',
  'materia_codigo_final',
  'estado_revision',
  'observaciones_revision',
]

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
  'carrera_id_sugerido',
  'carrera_id_final',
  'anio',
  'materia_nombre',
  'materia_key_actual',
  'plan_id_sugerido',
  'plan_id_final',
  'materia_codigo_sugerido',
  'materia_codigo_final',
  'estado_revision',
  'pendiente_motivo',
  'accion_requerida',
  'observaciones_revision',
]

function fail(message) {
  console.error(`[v2 subject identity workpack merge] ${message}`)
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

function readWorkpackFiles() {
  return WORKPACK_FILE_NAMES
    .map((fileName) => {
      const filePath = resolve(WORKPACK_DIR, fileName)
      if (!existsSync(filePath)) return null
      return {
        fileName,
        rows: readCsvFile(filePath).rows,
      }
    })
    .filter(Boolean)
}

function buildMergeSummaryReport(mergeResult = {}, applyReport = null) {
  const summary = mergeResult.summary ?? {}
  return {
    source: {
      workpackDirectory: 'local-audit/v2-subject-identity-workpack/',
      originalReviewCsv: 'local-audit/v2_subject_identity_review.csv',
      readOnly: true,
    },
    outputs: {
      mergedCsv: 'local-audit/v2_subject_identity_review.merged.csv',
      mergedJson: 'local-audit/v2_subject_identity_review.merged.json',
      mergeSummary: 'local-audit/v2_subject_identity_workpack_merge.summary.json',
      mergedValidationSummary: applyReport
        ? 'local-audit/v2_subject_identity.merged.validation.summary.json'
        : null,
    },
    totalOriginalRows: summary.totalOriginalRows,
    totalMergedRows: summary.totalMergedRows,
    changedRows: summary.changedRows,
    unchangedRows: summary.unchangedRows,
    changedFinalFieldRows: summary.changedFinalFieldRows,
    changedStatusRows: summary.changedStatusRows,
    changedObservationRows: summary.changedObservationRows,
    duplicateReviewIds: mergeResult.duplicateReviewIds,
    missingReviewIds: mergeResult.missingReviewIds,
    unexpectedReviewIds: mergeResult.unexpectedReviewIds,
    readyForApply: summary.readyForApply,
    readyForCompactFinalTableComparison: applyReport?.summary?.readyForCompactFinalTableComparison ?? null,
    safeToReplaceLegacy: false,
    nextAction: applyReport
      ? applyReport.summary?.nextAction ?? summary.nextAction
      : summary.nextAction,
    validation: applyReport
      ? {
          correctedRows: applyReport.summary?.correctedRows,
          pendingRows: applyReport.summary?.pendingRows,
          rejectedRows: applyReport.summary?.rejectedRows,
          duplicateKeyCount: applyReport.summary?.duplicateKeyCount,
          readyForCompactFinalTableComparison: applyReport.summary?.readyForCompactFinalTableComparison,
          safeToReplaceLegacy: applyReport.summary?.safeToReplaceLegacy,
        }
      : null,
    skippedRows: mergeResult.skippedRows,
    warnings: mergeResult.warnings,
    errors: mergeResult.errors,
  }
}

function buildValidationReport(applyResult = {}) {
  return {
    source: {
      mergedReviewCsv: 'local-audit/v2_subject_identity_review.merged.csv',
      snapshot: existsSync(SNAPSHOT_INPUT_PATH) ? 'local-audit/workspaceSnapshot.real.local.json' : null,
      readOnly: true,
    },
    outputs: {
      correctedCsv: 'local-audit/v2_subject_identity.merged.corrected.csv',
      correctedJson: 'local-audit/v2_subject_identity.merged.corrected.json',
      pendingCsv: 'local-audit/v2_subject_identity.merged.pending.csv',
      pendingJson: 'local-audit/v2_subject_identity.merged.pending.json',
      summary: 'local-audit/v2_subject_identity.merged.validation.summary.json',
    },
    summary: applyResult.summary,
    duplicateKeys: applyResult.duplicateKeys,
    validationIssues: applyResult.validationIssues,
    recommendations: applyResult.recommendations,
    warnings: applyResult.warnings,
    errors: applyResult.errors,
  }
}

function writeApplyOutputs(applyResult = {}) {
  const validationReport = buildValidationReport(applyResult)

  writeFileSync(
    MERGED_CORRECTED_CSV_OUTPUT_PATH,
    rowsToCsv(applyResult.correctedRows, CORRECTED_COLUMNS),
    'utf8',
  )
  writeJson(MERGED_CORRECTED_JSON_OUTPUT_PATH, applyResult.correctedRows)
  writeFileSync(
    MERGED_PENDING_CSV_OUTPUT_PATH,
    rowsToCsv(applyResult.pendingRows, uniqueColumns(PENDING_COLUMNS, columnsFromRows(applyResult.pendingRows))),
    'utf8',
  )
  writeJson(MERGED_PENDING_JSON_OUTPUT_PATH, applyResult.pendingRows)
  writeJson(MERGED_VALIDATION_SUMMARY_OUTPUT_PATH, validationReport)

  return validationReport
}

function buildConsoleSummary(mergeResult = {}, applyReport = null) {
  const summary = mergeResult.summary ?? {}
  return {
    totalOriginalRows: summary.totalOriginalRows,
    totalMergedRows: summary.totalMergedRows,
    changedRows: summary.changedRows,
    unchangedRows: summary.unchangedRows,
    duplicateReviewIds: mergeResult.duplicateReviewIds.length,
    missingReviewIds: mergeResult.missingReviewIds.length,
    unexpectedReviewIds: mergeResult.unexpectedReviewIds.length,
    readyForApply: summary.readyForApply,
    appliedValidation: Boolean(applyReport),
    correctedRows: applyReport?.summary?.correctedRows,
    pendingRows: applyReport?.summary?.pendingRows,
    readyForCompactFinalTableComparison: applyReport?.summary?.readyForCompactFinalTableComparison,
  }
}

function main() {
  const shouldApply = process.argv.includes('--apply')

  if (!existsSync(WORKPACK_DIR)) {
    fail('No existe local-audit/v2-subject-identity-workpack/. Ejecuta primero buildV2SubjectIdentityWorkpack.mjs.')
    return
  }

  if (!existsSync(ORIGINAL_REVIEW_CSV_PATH)) {
    fail('No existe local-audit/v2_subject_identity_review.csv. Ejecuta primero buildV2SubjectIdentityReview.mjs.')
    return
  }

  try {
    const originalReviewFile = readCsvFile(ORIGINAL_REVIEW_CSV_PATH)
    const workpackFiles = readWorkpackFiles()
    const mergeResult = mergeV2SubjectIdentityWorkpack({
      workpackFiles,
      originalReviewRows: originalReviewFile.rows,
    })
    const mergedColumns = uniqueColumns(
      originalReviewFile.headers,
      FINAL_COLUMNS,
      columnsFromRows(mergeResult.mergedRows),
    )

    writeFileSync(MERGED_CSV_OUTPUT_PATH, rowsToCsv(mergeResult.mergedRows, mergedColumns), 'utf8')
    writeJson(MERGED_JSON_OUTPUT_PATH, mergeResult.mergedRows)

    let applyReport = null
    if (shouldApply) {
      const snapshot = readJson(SNAPSHOT_INPUT_PATH, {})
      const applyResult = applyV2SubjectIdentityReview({
        reviewRows: mergeResult.mergedRows,
        snapshot,
      })
      applyReport = writeApplyOutputs(applyResult)
    }

    writeJson(MERGE_SUMMARY_OUTPUT_PATH, buildMergeSummaryReport(mergeResult, applyReport))
    console.log(JSON.stringify(buildConsoleSummary(mergeResult, applyReport?.summary ? applyReport : null), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo consolidar el workpack de identidad v2.')
  }
}

main()
