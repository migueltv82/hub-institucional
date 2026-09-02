// Stable JSON export for internal institutional audit reports.

const REPORT_EXPORT_VERSION = '1.0.0'
const REQUIRED_ARRAY_SECTIONS = [
  'criticalErrors',
  'warnings',
  'decisions',
  'pendingManualReview',
  'recommendations',
]
const REQUIRED_SUMMARY_SECTIONS = [
  'tablesSummary',
  'teachersSummary',
  'careersSummary',
  'callsSummary',
  'compactationSummary',
  'datePlanningSummary',
]
const EXECUTIVE_NUMERIC_FIELDS = [
  'totalMesasPlanificadas',
  'totalMesasSinFecha',
  'totalErroresCriticos',
  'totalAdvertencias',
  'totalMesasCompletas',
  'totalMesasConUnVocal',
  'totalMesasSinTribunal',
  'totalCompactaciones',
]

function clean(value) {
  return String(value ?? '').trim()
}

function sanitizeJsonValue(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (seen.has(value)) return '[Circular]'

  seen.add(value)

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeJsonValue(entry, seen))
      .filter((entry) => entry !== undefined)
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, sanitizeJsonValue(entry, seen)])
      .filter(([, entry]) => entry !== undefined),
  )
}

function pickReportSection(report = {}, key, fallback) {
  return sanitizeJsonValue(report[key] ?? fallback)
}

function pushIssue(target, code, message, path = '') {
  target.push({
    code,
    message,
    path,
  })
}

function validateSerializableValue(value, errors, path = 'exportedReport', seen = new WeakSet()) {
  if (value === undefined) {
    pushIssue(errors, 'UNDEFINED_VALUE', 'El export contiene un valor undefined.', path)
    return
  }

  if (typeof value === 'function') {
    pushIssue(errors, 'FUNCTION_VALUE', 'El export contiene una funcion.', path)
    return
  }

  if (typeof value === 'symbol') {
    pushIssue(errors, 'SYMBOL_VALUE', 'El export contiene un symbol no serializable.', path)
    return
  }

  if (!value || typeof value !== 'object') return

  if (seen.has(value)) {
    pushIssue(errors, 'CIRCULAR_REFERENCE', 'El export contiene una referencia circular sin sanear.', path)
    return
  }

  seen.add(value)

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      validateSerializableValue(entry, errors, `${path}[${index}]`, seen)
    })
    return
  }

  Object.entries(value).forEach(([key, entry]) => {
    validateSerializableValue(entry, errors, `${path}.${key}`, seen)
  })
}

function validateRequiredSections(exportedReport = {}, errors) {
  if (!exportedReport.metadata || typeof exportedReport.metadata !== 'object') {
    pushIssue(errors, 'MISSING_METADATA', 'El export debe incluir metadata.', 'metadata')
  }

  if (!exportedReport.executiveSummary || typeof exportedReport.executiveSummary !== 'object') {
    pushIssue(errors, 'MISSING_EXECUTIVE_SUMMARY', 'El export debe incluir executiveSummary.', 'executiveSummary')
  }

  REQUIRED_ARRAY_SECTIONS.forEach((key) => {
    if (!Array.isArray(exportedReport[key])) {
      pushIssue(errors, 'MISSING_ARRAY_SECTION', `El export debe incluir ${key} como array.`, key)
    }
  })

  REQUIRED_SUMMARY_SECTIONS.forEach((key) => {
    const value = exportedReport[key]
    const validSummary = key === 'teachersSummary' || key === 'careersSummary' || key === 'callsSummary'
      ? Array.isArray(value)
      : value && typeof value === 'object' && !Array.isArray(value)

    if (!validSummary) {
      pushIssue(errors, 'MISSING_SUMMARY_SECTION', `El export debe incluir ${key} con el tipo esperado.`, key)
    }
  })
}

function validateExecutiveSummary(exportedReport = {}, errors) {
  const executiveSummary = exportedReport.executiveSummary
  if (!executiveSummary || typeof executiveSummary !== 'object') return

  EXECUTIVE_NUMERIC_FIELDS.forEach((key) => {
    if (!Number.isFinite(Number(executiveSummary[key]))) {
      pushIssue(errors, 'INVALID_EXECUTIVE_NUMERIC_FIELD', `executiveSummary.${key} debe ser numerico.`, `executiveSummary.${key}`)
    }
  })
}

function validateMetadata(exportedReport = {}, errors, warnings) {
  const metadata = exportedReport.metadata
  if (!metadata || typeof metadata !== 'object') return

  if (!clean(metadata.exportedAt) && !clean(metadata.generatedAt)) {
    pushIssue(errors, 'MISSING_EXPORT_DATE', 'metadata debe incluir exportedAt o generatedAt.', 'metadata')
  }

  if (!clean(metadata.exportVersion)) {
    pushIssue(warnings, 'MISSING_EXPORT_VERSION', 'metadata no incluye exportVersion.', 'metadata.exportVersion')
  }
}

export function exportPipelineReportToJson(report = {}, options = {}) {
  const {
    includeRaw = false,
    includeGeneratedAt = true,
    institutionName,
    periodLabel,
  } = options

  const metadata = {
    exportVersion: REPORT_EXPORT_VERSION,
    title: clean(report.title),
    status: clean(report.status),
  }

  if (includeGeneratedAt) metadata.generatedAt = clean(report.generatedAt)
  if (institutionName !== undefined) metadata.institutionName = clean(institutionName)
  if (periodLabel !== undefined) metadata.periodLabel = clean(periodLabel)

  const exported = {
    metadata: sanitizeJsonValue(metadata),
    executiveSummary: pickReportSection(report, 'executiveSummary', {}),
    criticalErrors: pickReportSection(report, 'criticalErrors', []),
    warnings: pickReportSection(report, 'warnings', []),
    decisions: pickReportSection(report, 'decisions', []),
    tablesSummary: pickReportSection(report, 'tablesSummary', {}),
    teachersSummary: pickReportSection(report, 'teachersSummary', []),
    careersSummary: pickReportSection(report, 'careersSummary', []),
    callsSummary: pickReportSection(report, 'callsSummary', []),
    compactationSummary: pickReportSection(report, 'compactationSummary', {}),
    datePlanningSummary: pickReportSection(report, 'datePlanningSummary', {}),
    pendingManualReview: pickReportSection(report, 'pendingManualReview', []),
    recommendations: pickReportSection(report, 'recommendations', []),
  }

  if (includeRaw) {
    exported.raw = sanitizeJsonValue(report.raw ?? {})
  }

  return exported
}

export function validatePipelineReportExport(exportedReport = {}) {
  const errors = []
  const warnings = []

  if (!exportedReport || typeof exportedReport !== 'object' || Array.isArray(exportedReport)) {
    pushIssue(errors, 'INVALID_EXPORT_ROOT', 'El export debe ser un objeto JSON.', 'exportedReport')
    return { valid: false, errors, warnings }
  }

  validateRequiredSections(exportedReport, errors)
  validateExecutiveSummary(exportedReport, errors)
  validateMetadata(exportedReport, errors, warnings)
  validateSerializableValue(exportedReport, errors)

  try {
    JSON.stringify(exportedReport)
  } catch (error) {
    pushIssue(errors, 'JSON_STRINGIFY_FAILED', error instanceof Error ? error.message : 'No se pudo serializar el export.', 'exportedReport')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
