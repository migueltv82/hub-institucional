import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { applyV2SubjectCodeReview } from '../../src/utils/examEngine/audit/applyV2SubjectCodeReview.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const DEFAULT_REVIEW_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-code-review')
const DEFAULT_OUT_PREFIX = resolve(LOCAL_AUDIT_DIR, 'v2_subject_code')

const EDITABLE_CODE_REVIEW_FILES = [
  'ING_codigos.csv',
  'GEO_codigos.csv',
  'QUI_codigos.csv',
  'TUR_codigos.csv',
  'TRA_codigos.csv',
  'LAB_codigos.csv',
  'UNKNOWN_codigos.csv',
]

const REVIEW_COLUMNS = [
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

const CORRECTED_COLUMNS = [
  'review_id',
  'carrera',
  'carrera_id_final',
  'plan_id_final',
  'anio',
  'materia_nombre',
  'materia_codigo_final',
  'identity_v2_key',
  'estado_revision',
  'observaciones_revision',
]

const PENDING_COLUMNS = [
  ...REVIEW_COLUMNS,
  'pendiente_motivo',
]

const REJECTED_COLUMNS = [
  ...REVIEW_COLUMNS,
  'rechazo_motivo',
]

function fail(message) {
  console.error(`[v2 subject code apply] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
}

function toDisplayPath(filePath) {
  const relativePath = relative(REPO_ROOT, filePath)
  if (!relativePath || relativePath.startsWith('..')) return filePath.replaceAll('\\', '/')
  return relativePath.replaceAll('\\', '/')
}

function resolveCliPath(value, fallback) {
  if (!clean(value)) return fallback
  return resolve(REPO_ROOT, clean(value))
}

function readOption(argv = [], name) {
  const equalsPrefix = `${name}=`
  const equalsArg = argv.find((arg) => arg.startsWith(equalsPrefix))
  if (equalsArg) return equalsArg.slice(equalsPrefix.length)

  const index = argv.indexOf(name)
  if (index >= 0) return argv[index + 1]
  return ''
}

export function parseApplySubjectCodeReviewCliArgs(argv = []) {
  return {
    reviewDir: resolveCliPath(readOption(argv, '--review-dir'), DEFAULT_REVIEW_DIR),
    outPrefix: resolveCliPath(readOption(argv, '--out-prefix'), DEFAULT_OUT_PREFIX),
  }
}

function outputPathsFor(outPrefix = DEFAULT_OUT_PREFIX) {
  return {
    correctedCsv: `${outPrefix}.corrected.csv`,
    correctedJson: `${outPrefix}.corrected.json`,
    pendingCsv: `${outPrefix}.pending.csv`,
    pendingJson: `${outPrefix}.pending.json`,
    rejectedCsv: `${outPrefix}.rejected.csv`,
    rejectedJson: `${outPrefix}.rejected.json`,
    summary: `${outPrefix}.validation.summary.json`,
  }
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

function readCodeReviewRows(reviewDir = DEFAULT_REVIEW_DIR) {
  return EDITABLE_CODE_REVIEW_FILES.flatMap((fileName) => {
    const filePath = resolve(reviewDir, fileName)
    if (!existsSync(filePath)) return []
    return readCsvRows(filePath).map((row) => ({
      ...row,
      source_file: fileName,
    }))
  })
}

function buildPendingReasonSummary(pendingRows = []) {
  return pendingRows.reduce((counts, row) => {
    String(row.pendiente_motivo ?? '')
      .split('|')
      .map((reason) => reason.trim())
      .filter(Boolean)
      .forEach((reason) => {
        counts[reason] = (counts[reason] ?? 0) + 1
      })
    return counts
  }, {})
}

function buildSummaryReport(result = {}, sourceRows = [], paths = {}) {
  const outputPaths = outputPathsFor(paths.outPrefix)
  return {
    ...(result.summary ?? {}),
    source: {
      directory: toDisplayPath(paths.reviewDir ?? DEFAULT_REVIEW_DIR),
      editableFiles: EDITABLE_CODE_REVIEW_FILES,
      auxiliaryFilesIgnored: [
        '01_prioridad_alta.csv',
        '02_homonimias.csv',
        '03_riesgo_duplicados.csv',
      ],
      readOnly: true,
    },
    outputs: {
      correctedCsv: toDisplayPath(outputPaths.correctedCsv),
      correctedJson: toDisplayPath(outputPaths.correctedJson),
      pendingCsv: toDisplayPath(outputPaths.pendingCsv),
      pendingJson: toDisplayPath(outputPaths.pendingJson),
      rejectedCsv: toDisplayPath(outputPaths.rejectedCsv),
      rejectedJson: toDisplayPath(outputPaths.rejectedJson),
      summary: toDisplayPath(outputPaths.summary),
    },
    sourceRowCount: sourceRows.length,
    summary: result.summary,
    pendingReasonSummary: buildPendingReasonSummary(result.pendingRows),
    duplicateKeys: result.duplicateKeys,
    validationIssues: result.validationIssues,
    recommendations: result.recommendations,
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(summaryReport = {}) {
  return {
    totalReviewRows: summaryReport.totalReviewRows,
    correctedRows: summaryReport.correctedRows,
    pendingRows: summaryReport.pendingRows,
    rejectedRows: summaryReport.rejectedRows,
    duplicateKeyCount: summaryReport.duplicateKeyCount,
    missingFinalCode: summaryReport.missingFinalCode,
    unconfirmedRows: summaryReport.unconfirmedRows,
    placeholderRows: summaryReport.placeholderRows,
    homonymyRiskRows: summaryReport.homonymyRiskRows,
    readyForIdentityV2: summaryReport.readyForIdentityV2,
    readyForCompactFinalTableComparison: summaryReport.readyForCompactFinalTableComparison,
    safeToReplaceLegacy: summaryReport.safeToReplaceLegacy,
  }
}

export function runApplyV2SubjectCodeReview({
  reviewDir = DEFAULT_REVIEW_DIR,
  outPrefix = DEFAULT_OUT_PREFIX,
} = {}) {
  if (!existsSync(reviewDir)) {
    throw new Error(`No existe la carpeta de revision indicada: ${toDisplayPath(reviewDir)}.`)
  }

  const outputPaths = outputPathsFor(outPrefix)
  mkdirSync(dirname(outPrefix), { recursive: true })
  const codeReviewRows = readCodeReviewRows(reviewDir)
  const result = applyV2SubjectCodeReview({ codeReviewRows })
  const summaryReport = buildSummaryReport(result, codeReviewRows, { reviewDir, outPrefix })

  writeFileSync(outputPaths.correctedCsv, rowsToCsv(result.correctedRows, CORRECTED_COLUMNS), 'utf8')
  writeJson(outputPaths.correctedJson, result.correctedRows)
  writeFileSync(outputPaths.pendingCsv, rowsToCsv(result.pendingRows, PENDING_COLUMNS), 'utf8')
  writeJson(outputPaths.pendingJson, result.pendingRows)
  writeFileSync(outputPaths.rejectedCsv, rowsToCsv(result.rejectedRows, REJECTED_COLUMNS), 'utf8')
  writeJson(outputPaths.rejectedJson, result.rejectedRows)
  writeJson(outputPaths.summary, summaryReport)

  return summaryReport
}

function main() {
  try {
    const options = parseApplySubjectCodeReviewCliArgs(process.argv.slice(2))
    const summaryReport = runApplyV2SubjectCodeReview(options)
    console.log(JSON.stringify(buildConsoleSummary(summaryReport), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo aplicar la revision de codigos v2.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
