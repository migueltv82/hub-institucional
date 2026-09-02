import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { confirmLowRiskV2SubjectCodes } from '../../src/utils/examEngine/audit/confirmLowRiskV2SubjectCodes.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const INPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-code-review-prefilled')
const OUTPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-code-review-low-risk-confirmed')

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
  'low_risk_skip_reason',
]

const HIGH_RISK_COLUMNS = [
  ...CODE_REVIEW_COLUMNS,
  'motivos_prioridad_alta',
]

function fail(message) {
  console.error(`[v2 subject code low risk confirmation] ${message}`)
  process.exitCode = 1
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function isYes(value) {
  const token = normalizeToken(value)
  return token === 'si' || token === 'true' || token === '1' || token === 'yes'
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
  const text = [
    row.riesgo_homonimia,
    row.riesgo_nombre_duplicado,
    row.motivo_revision,
    row.low_risk_skip_reason,
    row.motivos_prioridad_alta,
  ].map(clean).join('|').toUpperCase()

  return (
    isYes(row.riesgo_homonimia) ||
    isYes(row.riesgo_nombre_duplicado) ||
    text.includes('HOMONIMIA') ||
    text.includes('DUPLICATE_SUBJECT_NAME')
  )
}

function buildReadme(summary = {}) {
  return [
    '# Confirmacion controlada de codigos simples de bajo riesgo',
    '',
    'Esta carpeta es una salida local de auditoria. No reemplaza el paquete original.',
    '',
    'Solo se cambiaron a `CONFIRMADO` las filas con `PRECONFIRMAR_CODIGO` que no tienen riesgo alto detectable.',
    '',
    '## Alcance',
    '',
    `- Total filas evaluadas: ${summary.totalRows ?? 0}`,
    `- Codigos simples confirmados: ${summary.confirmedRows ?? 0}`,
    `- Pendientes: ${summary.pendingRows ?? 0}`,
    `- Homonimias pendientes: ${summary.homonymyRows ?? 0}`,
    '',
    '## Importante',
    '',
    '- Las homonimias quedan pendientes y deben resolverse manualmente.',
    '- La prioridad alta no se confirma automaticamente.',
    '- El paquete original `v2-subject-code-review-prefilled/` no fue modificado.',
    '- Esto no habilita reemplazo del motor viejo.',
    '- El proximo paso es resolver `02_homonimias_pendientes.csv`.',
    '',
    '## Validacion',
    '',
    'Ejecutar:',
    '',
    '`node scripts/examEngineAudit/applyV2SubjectCodeReview.mjs --review-dir local-audit/v2-subject-code-review-low-risk-confirmed --out-prefix local-audit/v2_subject_code.low_risk_confirmed`',
    '',
  ].join('\n')
}

function buildSummaryReport(result = {}, files = []) {
  return {
    ...(result.summary ?? {}),
    source: {
      directory: 'local-audit/v2-subject-code-review-prefilled/',
      editableFiles: files.map((file) => file.fileName),
      auxiliaryFilesIgnored: [
        '01_revisar_prioridad_alta.csv',
        '02_homonimias.csv',
      ],
      readOnly: true,
    },
    outputs: {
      directory: 'local-audit/v2-subject-code-review-low-risk-confirmed/',
      highRiskPendingCsv: 'local-audit/v2-subject-code-review-low-risk-confirmed/01_pendientes_prioridad_alta.csv',
      homonymyPendingCsv: 'local-audit/v2-subject-code-review-low-risk-confirmed/02_homonimias_pendientes.csv',
      summaryJson: 'local-audit/v2-subject-code-review-low-risk-confirmed/low_risk_confirmation_summary.json',
      readme: 'local-audit/v2-subject-code-review-low-risk-confirmed/README_low_risk_confirmation.md',
    },
    summary: result.summary,
    recommendations: [
      'Validar el paquete con applyV2SubjectCodeReview usando el out-prefix low_risk_confirmed.',
      'Resolver manualmente las homonimias pendientes antes de identidad v2 completa.',
      'No reemplazar el motor viejo con esta salida.',
    ],
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(summary = {}) {
  return {
    totalRows: summary.totalRows,
    eligibleLowRiskRows: summary.eligibleLowRiskRows,
    confirmedRows: summary.confirmedRows,
    pendingRows: summary.pendingRows,
    highRiskRows: summary.highRiskRows,
    homonymyRows: summary.homonymyRows,
    skippedRows: summary.skippedRows,
    readyForIdentityV2: summary.readyForIdentityV2,
    readyForCompactFinalTableComparison: summary.readyForCompactFinalTableComparison,
    safeToReplaceLegacy: summary.safeToReplaceLegacy,
    packagePath: 'local-audit/v2-subject-code-review-low-risk-confirmed/',
  }
}

export function runConfirmLowRiskV2SubjectCodes({
  inputDir = INPUT_DIR,
  outputDir = OUTPUT_DIR,
} = {}) {
  if (!existsSync(inputDir)) {
    throw new Error('No existe local-audit/v2-subject-code-review-prefilled/. Ejecuta primero prefillV2SubjectCodeReviewDraft.mjs.')
  }

  const files = readCodeReviewFiles(inputDir)
  const sourceRows = files.flatMap((file) => file.rows)
  const result = confirmLowRiskV2SubjectCodes({
    codeReviewRows: sourceRows,
    options: { expectedLowRiskRows: 100 },
  })
  const outputRows = [
    ...result.confirmedRows,
    ...result.pendingRows,
  ]
  const groupedRows = rowsBySourceFile(outputRows)
  const homonymyRows = result.pendingRows.filter(isHomonymy)
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

  writeFileSync(resolve(outputDir, '01_pendientes_prioridad_alta.csv'), rowsToCsv(result.highRiskRows, HIGH_RISK_COLUMNS), 'utf8')
  writeFileSync(resolve(outputDir, '02_homonimias_pendientes.csv'), rowsToCsv(homonymyRows, HIGH_RISK_COLUMNS), 'utf8')
  writeJson(resolve(outputDir, 'low_risk_confirmation_summary.json'), report)
  writeFileSync(resolve(outputDir, 'README_low_risk_confirmation.md'), buildReadme(result.summary), 'utf8')

  return report
}

function main() {
  try {
    const report = runConfirmLowRiskV2SubjectCodes()
    console.log(JSON.stringify(buildConsoleSummary(report), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudo confirmar codigos simples de bajo riesgo.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
