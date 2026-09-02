import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  applyV2PlanCatalogToSubjectWorkpack,
} from '../../src/utils/examEngine/audit/applyV2PlanCatalogToSubjectWorkpack.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')

const DEFAULT_CATALOG_PATH = resolve(
  LOCAL_AUDIT_DIR,
  'v2-plan-catalog-review',
  'v2_plan_catalog_review.csv',
)
const DEFAULT_WORKPACK_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-identity-workpack')
const DEFAULT_OUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-identity-workpack-plan-applied')
const PROTECTED_OUTPUT_DIRS = [
  DEFAULT_WORKPACK_DIR,
  resolve(LOCAL_AUDIT_DIR, 'v2-plan-catalog-review'),
  resolve(LOCAL_AUDIT_DIR, 'v2-plan-catalog-review-prefilled'),
]

const WORKPACK_FILE_NAMES = [
  'ING_revision.csv',
  'GEO_revision.csv',
  'QUI_revision.csv',
  'LAB_revision.csv',
  'TUR_revision.csv',
  'TRA_revision.csv',
  'UNKNOWN_revision.csv',
]

const CONFIRMED_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])

function fail(message) {
  console.error(`[v2 plan catalog apply] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
}

function stripBom(value) {
  return String(value ?? '').replace(/^\uFEFF/, '')
}

function normalizeStatus(value) {
  return clean(value).toUpperCase()
}

function requiredSubjects(row = {}) {
  return Number(row.materias_requeridas ?? row.requiredSubjects ?? 0) || 0
}

function normalizeResolvedPath(filePath) {
  return resolve(filePath).toLowerCase()
}

function isSameOrInside(candidate, protectedDir) {
  const normalizedCandidate = normalizeResolvedPath(candidate)
  const normalizedProtected = normalizeResolvedPath(protectedDir)
  return (
    normalizedCandidate === normalizedProtected ||
    normalizedCandidate.startsWith(`${normalizedProtected}${sep}`)
  )
}

function assertSafeOutDir(outDir) {
  const blockedDir = PROTECTED_OUTPUT_DIRS.find((protectedDir) => isSameOrInside(outDir, protectedDir))
  if (blockedDir) {
    throw new Error(
      `--out-dir no puede apuntar dentro de ${toDisplayPath(blockedDir)} porque es una carpeta fuente protegida.`,
    )
  }
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

export function parseApplyPlanCatalogCliArgs(argv = []) {
  return {
    catalogPath: resolveCliPath(readOption(argv, '--catalog'), DEFAULT_CATALOG_PATH),
    workpackDir: resolveCliPath(readOption(argv, '--workpack-dir'), DEFAULT_WORKPACK_DIR),
    outDir: resolveCliPath(readOption(argv, '--out-dir'), DEFAULT_OUT_DIR),
  }
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

function buildOutputRows(originalRows = [], updatedRows = []) {
  const updatedByReviewId = queueRowsByReviewId(updatedRows)

  return originalRows.map((row) => {
    const queue = updatedByReviewId.get(clean(row.review_id)) ?? []
    const updated = queue.shift()
    return updated ?? row
  })
}

function isPlanConfirmed(row = {}) {
  return Boolean(clean(row.plan_id_final) && CONFIRMED_STATUSES.has(normalizeStatus(row.estado_revision)))
}

function isPlanPreconfirmar(row = {}) {
  return normalizeStatus(row.estado_revision) === 'PRECONFIRMAR'
}

function countCatalogRows(rows = [], predicate) {
  return rows.filter((row) => requiredSubjects(row) > 0 && predicate(row)).length
}

function buildAggregateSummary({ catalogRows, totals }) {
  const plansConfirmed = countCatalogRows(catalogRows, isPlanConfirmed)
  const skippedBecausePreconfirmar = countCatalogRows(catalogRows, isPlanPreconfirmar)
  const planRowsWithSubjects = catalogRows.filter((row) => requiredSubjects(row) > 0)
  const plansPending = planRowsWithSubjects.length - plansConfirmed
  const subjectsWithoutPlan = Math.max(0, totals.totalSubjectRows - totals.subjectsUpdatedWithPlan)
  const readyForSubjectCodeReview = (
    totals.totalSubjectRows > 0 &&
    subjectsWithoutPlan === 0 &&
    plansPending === 0
  )

  return {
    plansConfirmed,
    plansPending,
    subjectsWithoutPlan,
    skippedBecausePreconfirmar,
    readyForSubjectCodeReview,
    readyForCompactFinalTableComparison: false,
    safeToReplaceLegacy: false,
    nextAction: readyForSubjectCodeReview
      ? 'Revisar y confirmar materia_codigo_final para cada materia antes de cualquier comparacion final.'
      : 'Confirmar el catalogo de planes v2 y volver a aplicar antes de revisar codigos de materia.',
  }
}

function buildReadme(summary = {}) {
  return [
    '# Workpack de materias con planes v2 aplicados',
    '',
    'Esta carpeta es una salida local de auditoria. No reemplaza el workpack original.',
    '',
    'Solo se aplican `plan_id_final` desde filas de catalogo con estado confirmado y valores no placeholder.',
    'No se completa `materia_codigo_final` y no se confirma automaticamente ninguna materia.',
    '',
    '## Resumen',
    '',
    `- Materias con plan aplicado: ${summary.subjectsUpdatedWithPlan ?? 0}`,
    `- Materias sin plan aplicado: ${summary.subjectsWithoutPlan ?? 0}`,
    `- Planes confirmados: ${summary.plansConfirmed ?? 0}`,
    `- Planes pendientes: ${summary.plansPending ?? 0}`,
    `- Listo para revisar codigos de materia: ${summary.readyForSubjectCodeReview === true ? 'SI' : 'NO'}`,
    '',
    'Luego de esta salida, revisar codigos finales de materias y confirmar manualmente identidad v2.',
    '',
  ].join('\n')
}

function addSummary(target, source) {
  target.totalSubjectRows += source.totalRows
  target.subjectsUpdatedWithPlan += source.updatedRows
  target.unchangedRows += source.unchangedRows
  target.pendingRows += source.pendingRows
}

function buildSummaryReport({
  catalogPath,
  workpackDir,
  outDir,
  rowsByFile,
  catalogRows,
  totals,
  warnings,
  errors,
}) {
  const aggregate = buildAggregateSummary({ catalogRows, totals })

  return {
    catalogPath: toDisplayPath(catalogPath),
    workpackDir: toDisplayPath(workpackDir),
    outDir: toDisplayPath(outDir),
    totalSubjectRows: totals.totalSubjectRows,
    plansConfirmed: aggregate.plansConfirmed,
    plansPending: aggregate.plansPending,
    subjectsUpdatedWithPlan: totals.subjectsUpdatedWithPlan,
    subjectsWithoutPlan: aggregate.subjectsWithoutPlan,
    skippedBecausePreconfirmar: aggregate.skippedBecausePreconfirmar,
    readyForSubjectCodeReview: aggregate.readyForSubjectCodeReview,
    readyForCompactFinalTableComparison: false,
    safeToReplaceLegacy: false,
    nextAction: aggregate.nextAction,
    rowsByFile,
    warnings,
    errors,
  }
}

function buildConsoleSummary(report = {}) {
  return {
    catalogPath: report.catalogPath,
    workpackDir: report.workpackDir,
    outDir: report.outDir,
    totalSubjectRows: report.totalSubjectRows,
    plansConfirmed: report.plansConfirmed,
    plansPending: report.plansPending,
    subjectsUpdatedWithPlan: report.subjectsUpdatedWithPlan,
    subjectsWithoutPlan: report.subjectsWithoutPlan,
    skippedBecausePreconfirmar: report.skippedBecausePreconfirmar,
    readyForSubjectCodeReview: report.readyForSubjectCodeReview,
  }
}

export function runApplyPlanCatalogToSubjectWorkpack({
  catalogPath = DEFAULT_CATALOG_PATH,
  workpackDir = DEFAULT_WORKPACK_DIR,
  outDir = DEFAULT_OUT_DIR,
} = {}) {
  assertSafeOutDir(outDir)

  if (!existsSync(catalogPath)) {
    throw new Error(`No existe el catalogo indicado: ${toDisplayPath(catalogPath)}.`)
  }
  if (!existsSync(workpackDir)) {
    throw new Error(`No existe la carpeta de workpack indicada: ${toDisplayPath(workpackDir)}.`)
  }

  const planCatalogRows = readCsvFile(catalogPath).rows
  const totals = {
    totalSubjectRows: 0,
    subjectsUpdatedWithPlan: 0,
    unchangedRows: 0,
    pendingRows: 0,
  }
  const rowsByFile = {}
  const warnings = []
  const errors = []

  mkdirSync(outDir, { recursive: true })

  WORKPACK_FILE_NAMES.forEach((fileName) => {
    const inputPath = resolve(workpackDir, fileName)
    if (!existsSync(inputPath)) return

    const inputFile = readCsvFile(inputPath)
    const result = applyV2PlanCatalogToSubjectWorkpack({
      subjectRows: inputFile.rows,
      planCatalogRows,
    })
    const outputRows = buildOutputRows(inputFile.rows, result.updatedRows)
    const outputColumns = uniqueColumns(inputFile.headers, columnsFromRows(outputRows))

    addSummary(totals, result.summary)
    rowsByFile[fileName] = {
      totalRows: inputFile.rows.length,
      updatedRows: result.summary.updatedRows,
      pendingRows: result.summary.pendingRows,
      unchangedRows: result.summary.unchangedRows,
    }
    warnings.push(...result.warnings)
    errors.push(...result.errors)

    writeFileSync(resolve(outDir, fileName), rowsToCsv(outputRows, outputColumns), 'utf8')
  })

  const report = buildSummaryReport({
    catalogPath,
    workpackDir,
    outDir,
    rowsByFile,
    catalogRows: planCatalogRows,
    totals,
    warnings,
    errors,
  })

  writeJson(resolve(outDir, 'plan_apply_summary.json'), report)
  writeFileSync(resolve(outDir, 'README_plan_applied.md'), buildReadme(report), 'utf8')

  return report
}

function main() {
  try {
    const options = parseApplyPlanCatalogCliArgs(process.argv.slice(2))
    const report = runApplyPlanCatalogToSubjectWorkpack(options)
    console.log(JSON.stringify(buildConsoleSummary(report), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo aplicar el catalogo de planes v2.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
