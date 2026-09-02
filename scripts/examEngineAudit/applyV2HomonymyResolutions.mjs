import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { applyV2HomonymyResolutions } from '../../src/utils/examEngine/audit/applyV2HomonymyResolutions.js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../..')
const LOCAL_AUDIT_DIR = resolve(REPO_ROOT, 'local-audit')
const INPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-code-review-low-risk-confirmed')
const OUTPUT_DIR = resolve(LOCAL_AUDIT_DIR, 'v2-subject-code-review-homonymies-applied')
const HOMONYMY_RESOLUTIONS_PATH = resolve(INPUT_DIR, '02_homonimias_pendientes.csv')

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

const HOMONYMY_OUTPUT_COLUMNS = [
  ...CODE_REVIEW_COLUMNS,
  'homonymy_resolution_status',
  'homonymy_resolution_reason',
]

const REJECTED_COLUMNS = [
  ...CODE_REVIEW_COLUMNS,
  'rejection_reason',
  'duplicateKey',
]

function fail(message) {
  console.error(`[v2 homonymy resolutions] ${message}`)
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

function readBaseFiles(inputDir = INPUT_DIR) {
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

function buildReadme(summary = {}) {
  return [
    '# Homonimias v2 aplicadas',
    '',
    'Esta carpeta es una salida local de auditoria. No reemplaza el paquete original.',
    '',
    'El integrador tomo las resoluciones de `02_homonimias_pendientes.csv` y las copio a los CSV por carrera cuando eran validas.',
    '',
    '## Garantias de esta salida',
    '',
    '- Las 100 materias simples ya confirmadas se preservaron.',
    '- Solo se modificaron filas cuyos `review_id` aparecen en el archivo de homonimias.',
    '- No se escribio en Supabase ni se modificaron datos productivos.',
    '- Si quedan filas en `01_homonimias_no_resueltas.csv`, deben completarse en el archivo de homonimias y volver a ejecutar.',
    '',
    '## Resumen',
    '',
    `- Homonimias aplicadas: ${summary.appliedResolutions ?? 0}`,
    `- Homonimias no resueltas: ${summary.unresolvedRows ?? 0}`,
    `- Rechazadas: ${summary.rejectedRows ?? 0}`,
    `- No encontradas: ${summary.unmatchedRows ?? 0}`,
    '',
    '## Validacion',
    '',
    'Ejecutar:',
    '',
    '`node scripts/examEngineAudit/applyV2SubjectCodeReview.mjs --review-dir local-audit/v2-subject-code-review-homonymies-applied --out-prefix local-audit/v2_subject_code.homonymies_applied`',
    '',
    'Aunque `readyForIdentityV2` llegue a `true`, no se reemplaza legacy hasta correr la comparacion final compactada.',
    '',
  ].join('\n')
}

function buildSummaryReport(result = {}, files = []) {
  return {
    ...(result.summary ?? {}),
    source: {
      directory: 'local-audit/v2-subject-code-review-low-risk-confirmed/',
      homonymyResolutionCsv: 'local-audit/v2-subject-code-review-low-risk-confirmed/02_homonimias_pendientes.csv',
      editableFiles: files.map((file) => file.fileName),
      readOnly: true,
    },
    outputs: {
      directory: 'local-audit/v2-subject-code-review-homonymies-applied/',
      unresolvedCsv: 'local-audit/v2-subject-code-review-homonymies-applied/01_homonimias_no_resueltas.csv',
      rejectedCsv: 'local-audit/v2-subject-code-review-homonymies-applied/02_homonimias_rechazadas.csv',
      unmatchedCsv: 'local-audit/v2-subject-code-review-homonymies-applied/03_homonimias_no_encontradas.csv',
      summaryJson: 'local-audit/v2-subject-code-review-homonymies-applied/homonymy_apply_summary.json',
      readme: 'local-audit/v2-subject-code-review-homonymies-applied/README_homonymies_applied.md',
    },
    summary: result.summary,
    duplicateResolutionRows: result.summary?.duplicateResolutionRows ?? 0,
    duplicateResolutionItems: result.duplicateResolutionRows,
    warnings: result.warnings,
    errors: result.errors,
  }
}

function buildConsoleSummary(summary = {}) {
  return {
    totalBaseRows: summary.totalBaseRows,
    totalHomonymyResolutionRows: summary.totalHomonymyResolutionRows,
    appliedResolutions: summary.appliedResolutions,
    unresolvedRows: summary.unresolvedRows,
    rejectedRows: summary.rejectedRows,
    unmatchedRows: summary.unmatchedRows,
    duplicateResolutionRows: summary.duplicateResolutionRows,
    duplicateFinalKeys: summary.duplicateFinalKeys,
    readyForValidation: summary.readyForValidation,
    readyForIdentityV2: summary.readyForIdentityV2,
    readyForCompactFinalTableComparison: summary.readyForCompactFinalTableComparison,
    safeToReplaceLegacy: summary.safeToReplaceLegacy,
    packagePath: 'local-audit/v2-subject-code-review-homonymies-applied/',
  }
}

export function runApplyV2HomonymyResolutions({
  inputDir = INPUT_DIR,
  outputDir = OUTPUT_DIR,
  homonymyResolutionsPath = HOMONYMY_RESOLUTIONS_PATH,
} = {}) {
  if (!existsSync(inputDir)) {
    throw new Error('No existe local-audit/v2-subject-code-review-low-risk-confirmed/.')
  }
  if (!existsSync(homonymyResolutionsPath)) {
    throw new Error('No existe 02_homonimias_pendientes.csv en el paquete low-risk-confirmed.')
  }

  const files = readBaseFiles(inputDir)
  const baseRows = files.flatMap((file) => file.rows)
  const homonymyResolutionRows = readCsvFile(homonymyResolutionsPath).rows
  const result = applyV2HomonymyResolutions({
    baseRows,
    homonymyResolutionRows,
  })
  const groupedRows = rowsBySourceFile(result.updatedRows)
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

  writeFileSync(resolve(outputDir, '01_homonimias_no_resueltas.csv'), rowsToCsv(result.unresolvedRows, HOMONYMY_OUTPUT_COLUMNS), 'utf8')
  writeFileSync(resolve(outputDir, '02_homonimias_rechazadas.csv'), rowsToCsv(result.rejectedRows, REJECTED_COLUMNS), 'utf8')
  writeFileSync(resolve(outputDir, '03_homonimias_no_encontradas.csv'), rowsToCsv(result.unmatchedRows, HOMONYMY_OUTPUT_COLUMNS), 'utf8')
  writeJson(resolve(outputDir, 'homonymy_apply_summary.json'), report)
  writeFileSync(resolve(outputDir, 'README_homonymies_applied.md'), buildReadme(result.summary), 'utf8')

  return report
}

function main() {
  try {
    const report = runApplyV2HomonymyResolutions()
    console.log(JSON.stringify(buildConsoleSummary(report), null, 2))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'No se pudieron integrar homonimias v2.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
