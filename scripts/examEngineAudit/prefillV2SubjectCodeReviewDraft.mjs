import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  V2_SUBJECT_CODE_DRAFT_STATUS,
  prefillV2SubjectCodeReviewDraft,
} from '../../src/utils/examEngine/audit/prefillV2SubjectCodeReviewDraft.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const INPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-code-review')
const OUTPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-code-review-prefilled')

const EDITABLE_CODE_REVIEW_FILES = [
  'ING_codigos.csv',
  'GEO_codigos.csv',
  'QUI_codigos.csv',
  'TUR_codigos.csv',
  'TRA_codigos.csv',
  'LAB_codigos.csv',
  'UNKNOWN_codigos.csv',
]

const CODE_REVIEW_COLUMNS = [
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
  'prefill_skip_reason',
]

const HIGH_RISK_COLUMNS = [
  ...CODE_REVIEW_COLUMNS,
  'motivos_prioridad_alta',
]

function fail(message) {
  console.error(`[v2 subject code prefill] ${message}`)
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

function readCodeReviewFiles(inputDir = INPUT_DIR) {
  return EDITABLE_CODE_REVIEW_FILES.flatMap((fileName) => {
    const filePath = resolve(inputDir, fileName)
    if (!existsSync(filePath)) return []
    const csvFile = readCsvFile(filePath)
    return [{
      fileName,
      headers: csvFile.headers,
      rows: csvFile.rows.map((row) => ({
        ...row,
        source_file: fileName,
      })),
    }]
  })
}

function rowsBySourceFile(rows = []) {
  return rows.reduce((groups, row) => {
    const fileName = clean(row.source_file)
    if (!fileName) return groups
    const group = groups[fileName] ?? []
    group.push(row)
    groups[fileName] = group
    return groups
  }, {})
}

function isHomonymy(row = {}) {
  return clean(row.riesgo_homonimia).toUpperCase() === 'SI' ||
    clean(row.riesgo_nombre_duplicado).toUpperCase() === 'SI' ||
    clean(row.motivos_prioridad_alta).includes('RIESGO_HOMONIMIA')
}

function buildReadme(summary = {}) {
  return [
    '# Precarga asistida de codigos de materias v2',
    '',
    'Esta carpeta es una salida local de auditoria. No reemplaza el paquete original.',
    '',
    '`materia_codigo_final` fue precargado desde `materia_codigo_borrador` solo en filas sin riesgo alto detectable.',
    '',
    '## Importante',
    '',
    `- Las filas precargadas quedan con estado \`${V2_SUBJECT_CODE_DRAFT_STATUS}\`.`,
    '- `PRECONFIRMAR_CODIGO` no habilita identidad v2.',
    '- Ningun codigo queda confirmado automaticamente.',
    '- Una persona debe revisar cada codigo precargado.',
    '- Para validar, cambiar `estado_revision` a `CONFIRMADO` solo cuando el codigo sea correcto.',
    '- Revisar primero `01_revisar_prioridad_alta.csv` y `02_homonimias.csv`.',
    '',
    '## Resumen',
    '',
    `- Total filas: ${summary.totalRows ?? 0}`,
    `- Filas precargadas: ${summary.prefilledRows ?? 0}`,
    `- Filas de riesgo alto: ${summary.highRiskRows ?? 0}`,
    `- Homonimias: ${summary.homonymyRows ?? 0}`,
    '',
    '## Validacion',
    '',
    'Luego de revisar, ejecutar:',
    '',
    '`node scripts/examEngineAudit/applyV2SubjectCodeReview.mjs --review-dir local-audit/v2-subject-code-review-prefilled --out-prefix local-audit/v2_subject_code.prefilled`',
    '',
  ].join('\n')
}

function buildSummaryReport(result = {}, files = []) {
  return {
    ...(result.summary ?? {}),
    source: {
      directory: 'local-audit/v2-subject-code-review/',
      editableFiles: files.map((file) => file.fileName),
      auxiliaryFilesIgnored: [
        '01_prioridad_alta.csv',
        '02_homonimias.csv',
        '03_riesgo_duplicados.csv',
      ],
      readOnly: true,
    },
    outputs: {
      directory: 'local-audit/v2-subject-code-review-prefilled/',
      highRiskCsv: 'local-audit/v2-subject-code-review-prefilled/01_revisar_prioridad_alta.csv',
      homonymyCsv: 'local-audit/v2-subject-code-review-prefilled/02_homonimias.csv',
      summaryJson: 'local-audit/v2-subject-code-review-prefilled/prefill_code_summary.json',
      readme: 'local-audit/v2-subject-code-review-prefilled/README_revision_codigos_prefilled.md',
    },
    summary: result.summary,
    recommendations: [
      'Revisar manualmente las filas PRECONFIRMAR_CODIGO antes de confirmar.',
      'Resolver primero homonimias y prioridad alta.',
      'Ejecutar el validador con --review-dir sobre esta carpeta prefilled.',
    ],
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(summary = {}) {
  return {
    totalRows: summary.totalRows,
    prefilledRows: summary.prefilledRows,
    skippedRows: summary.skippedRows,
    highRiskRows: summary.highRiskRows,
    homonymyRows: summary.homonymyRows,
    preconfirmarRows: summary.preconfirmarRows,
    confirmedRows: summary.confirmedRows,
    readyForIdentityV2: summary.readyForIdentityV2,
    readyForCompactFinalTableComparison: summary.readyForCompactFinalTableComparison,
    safeToReplaceLegacy: summary.safeToReplaceLegacy,
    packagePath: 'local-audit/v2-subject-code-review-prefilled/',
  }
}

export function runPrefillV2SubjectCodeReviewDraft({
  inputDir = INPUT_DIR,
  outputDir = OUTPUT_DIR,
} = {}) {
  if (!existsSync(inputDir)) {
    throw new Error('No existe local-audit/v2-subject-code-review/. Ejecuta primero buildV2SubjectCodeReview.mjs.')
  }

  const files = readCodeReviewFiles(inputDir)
  const sourceRows = files.flatMap((file) => file.rows)
  const result = prefillV2SubjectCodeReviewDraft({ codeReviewRows: sourceRows })
  const groupedRows = rowsBySourceFile(result.outputRows)
  const homonymyRows = result.outputRows.filter(isHomonymy)
  const report = buildSummaryReport(result, files)

  mkdirSync(outputDir, { recursive: true })

  EDITABLE_CODE_REVIEW_FILES.forEach((fileName) => {
    const inputFile = files.find((file) => file.fileName === fileName)
    if (!inputFile) return
    writeFileSync(
      resolve(outputDir, fileName),
      rowsToCsv(groupedRows[fileName] ?? [], CODE_REVIEW_COLUMNS),
      'utf8',
    )
  })

  writeFileSync(resolve(outputDir, '01_revisar_prioridad_alta.csv'), rowsToCsv(result.highRiskRows, HIGH_RISK_COLUMNS), 'utf8')
  writeFileSync(resolve(outputDir, '02_homonimias.csv'), rowsToCsv(homonymyRows, HIGH_RISK_COLUMNS), 'utf8')
  writeJson(resolve(outputDir, 'prefill_code_summary.json'), report)
  writeFileSync(resolve(outputDir, 'README_revision_codigos_prefilled.md'), buildReadme(result.summary), 'utf8')

  return report
}

function main() {
  try {
    const report = runPrefillV2SubjectCodeReviewDraft()
    console.log(JSON.stringify(buildConsoleSummary(report), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo precargar la revision de codigos v2.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
