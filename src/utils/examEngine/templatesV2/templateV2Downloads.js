import { buildTemplateV2Kit } from '../audit/buildTemplateV2Kit.js'

const CSV_MIME_TYPE = 'text/csv;charset=utf-8'
const JSON_MIME_TYPE = 'application/json;charset=utf-8'
const MARKDOWN_MIME_TYPE = 'text/markdown;charset=utf-8'
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function templateToSheet(template = {}) {
  return {
    name: template.name,
    filename: template.filename,
    description: template.description,
    columns: cloneJson(template.columns ?? []),
    requiredColumns: cloneJson(template.requiredColumns ?? []),
    uniqueKey: cloneJson(template.uniqueKey ?? []),
    allowedValues: cloneJson(template.allowedValues ?? {}),
    criticalForEngine: Boolean(template.criticalForEngine),
    recommendedLoadOrder: template.recommendedLoadOrder,
    rows: cloneJson(template.rows ?? []),
    csv: String(template.csv ?? ''),
  }
}

export function buildTemplateV2WorkbookDefinition(options = {}) {
  const kit = buildTemplateV2Kit(options)
  const requestedSheets = Array.isArray(options.sheetNames) ? new Set(options.sheetNames) : null
  const sheets = Object.values(kit.templates)
    .filter((template) => !requestedSheets || requestedSheets.has(template.name))
    .sort((left, right) => left.recommendedLoadOrder - right.recommendedLoadOrder)
    .map(templateToSheet)

  return {
    workbookName: 'plantillas-exam-engine-v2',
    format: 'logical-workbook-definition',
    sheets,
    manifest: cloneJson(kit.manifest),
    readme: kit.readme,
    summary: cloneJson(kit.summary),
    warnings: cloneJson(kit.warnings),
    errors: cloneJson(kit.errors),
  }
}

export function buildTemplateV2CsvFiles(options = {}) {
  return buildTemplateV2WorkbookDefinition(options).sheets.map((sheet) => ({
    templateName: sheet.name,
    filename: sheet.filename,
    mimeType: CSV_MIME_TYPE,
    content: sheet.csv,
    columns: cloneJson(sheet.columns),
    requiredColumns: cloneJson(sheet.requiredColumns),
    uniqueKey: cloneJson(sheet.uniqueKey),
  }))
}

export function buildTemplateV2ReadmeText(options = {}) {
  return buildTemplateV2WorkbookDefinition(options).readme
}

export function buildTemplateV2Manifest(options = {}) {
  return buildTemplateV2WorkbookDefinition(options).manifest
}

export function buildTemplateV2DownloadFiles(options = {}) {
  const workbook = buildTemplateV2WorkbookDefinition(options)
  const csvFiles = workbook.sheets.map((sheet) => ({
    templateName: sheet.name,
    filename: sheet.filename,
    mimeType: CSV_MIME_TYPE,
    content: sheet.csv,
    columns: cloneJson(sheet.columns),
    requiredColumns: cloneJson(sheet.requiredColumns),
    uniqueKey: cloneJson(sheet.uniqueKey),
  }))

  return [
    ...csvFiles,
    {
      templateName: 'templates_v2_manifest',
      filename: 'templates_v2_manifest.json',
      mimeType: JSON_MIME_TYPE,
      content: JSON.stringify(workbook.manifest, null, 2),
    },
    {
      templateName: 'README',
      filename: 'README.md',
      mimeType: MARKDOWN_MIME_TYPE,
      content: workbook.readme,
    },
  ]
}

export const TEMPLATE_V2_DOWNLOAD_MIME_TYPES = Object.freeze({
  csv: CSV_MIME_TYPE,
  json: JSON_MIME_TYPE,
  markdown: MARKDOWN_MIME_TYPE,
  xlsx: XLSX_MIME_TYPE,
})
