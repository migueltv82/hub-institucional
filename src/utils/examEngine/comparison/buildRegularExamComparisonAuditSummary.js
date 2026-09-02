const SECTION_FINDINGS = [
  {
    section: 'diferenciasTitulares',
    type: 'DIFERENCIAS_TITULARES',
    message: 'Hay diferencias de titulares entre legacy y el preview nuevo.',
    action: 'Revisar titulares asignados antes de avanzar.',
  },
  {
    section: 'diferenciasVocales',
    type: 'DIFERENCIAS_VOCALES',
    message: 'Hay diferencias de vocales entre legacy y el preview nuevo.',
    action: 'Revisar vocales asignados y afinidades docentes.',
  },
  {
    section: 'diferenciasFechas',
    type: 'DIFERENCIAS_FECHAS',
    message: 'Hay diferencias de fechas entre legacy y el preview nuevo.',
    action: 'Revisar fechas, disponibilidad y rangos de llamados.',
  },
  {
    section: 'mesasSinEquivalente',
    type: 'MESAS_SIN_EQUIVALENTE',
    message: 'Hay mesas sin equivalente entre legacy y el preview nuevo.',
    action: 'Revisar mesas sin equivalente y claves de matching.',
  },
  {
    section: 'mesasSinTribunal',
    type: 'MESAS_SIN_TRIBUNAL',
    message: 'Hay mesas sin tribunal completo.',
    action: 'Revisar mesas sin tribunal antes de cualquier integracion.',
  },
  {
    section: 'compactaciones',
    type: 'COMPACTACIONES',
    message: 'El preview nuevo contiene compactaciones o diferencias asociadas.',
    action: 'Validar compactaciones de forma separada.',
  },
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function getSections(report = {}) {
  return report.sections && typeof report.sections === 'object' ? report.sections : {}
}

function sectionItems(report = {}, section) {
  return asArray(getSections(report)[section])
}

function allSectionItems(report = {}) {
  return Object.values(getSections(report)).flatMap(asArray)
}

function normalizeStatus(report = {}, metrics = {}) {
  const status = clean(report.status).toUpperCase()
  if (['OK', 'WARNING', 'CRITICAL'].includes(status)) return status
  if (metrics.totalCriticalDiffs > 0) return 'CRITICAL'
  if (metrics.totalDiffs > 0 || asArray(report.warnings).length > 0) return 'WARNING'
  return 'OK'
}

function buildMetrics(report = {}) {
  const summary = report.executiveSummary ?? {}

  return {
    totalLegacyMesas: Number(summary.totalLegacyMesas ?? 0) || 0,
    totalNewMesas: Number(summary.totalNewMesas ?? 0) || 0,
    totalDiffs: Number(summary.totalDiffs ?? 0) || 0,
    totalCriticalDiffs: Number(summary.totalCriticalDiffs ?? 0) || 0,
    unmatchedLegacyCount: Number(summary.unmatchedLegacyCount ?? 0) || 0,
    unmatchedNewCount: Number(summary.unmatchedNewCount ?? 0) || 0,
    compactedNewCount: Number(summary.compactedNewCount ?? 0) || 0,
  }
}

function highestSeverity(items = []) {
  if (items.some((item) => clean(item.severity).toLowerCase() === 'critical')) return 'critical'
  if (items.some((item) => clean(item.severity).toLowerCase() === 'warning')) return 'warning'
  return 'info'
}

function buildKeyFindings(report = {}) {
  const findings = SECTION_FINDINGS
    .map((definition) => {
      const items = sectionItems(report, definition.section)
      return {
        type: definition.type,
        severity: highestSeverity(items),
        count: items.length,
        message: definition.message,
      }
    })
    .filter((finding) => finding.count > 0)

  if (findings.length) return findings

  return [{
    type: 'SIN_DIFERENCIAS_RELEVANTES',
    severity: 'info',
    count: 0,
    message: 'No se detectaron diferencias relevantes entre legacy y el preview nuevo.',
  }]
}

function normalizeItem(item = {}) {
  return {
    severity: clean(item.severity || 'warning').toLowerCase(),
    type: clean(item.type || item.code || 'ITEM'),
    mesaKey: clean(item.mesaKey || item.matchKey),
    materia: clean(item.materia),
    carrera: clean(item.carrera),
    llamado: clean(item.llamado),
    message: clean(item.message || item.reason || item.type || item.code),
    suggestedAction: clean(item.suggestedAction),
  }
}

function buildCriticalItems(report = {}) {
  const explicitCritical = asArray(report.criticalDiffs)
  const sectionCritical = allSectionItems(report).filter((item) => clean(item.severity).toLowerCase() === 'critical')
  const items = explicitCritical.length ? explicitCritical : sectionCritical

  return items.map(normalizeItem)
}

function buildWarnings(report = {}) {
  const reportWarnings = asArray(report.warnings).map(normalizeItem)
  const sectionWarnings = allSectionItems(report)
    .filter((item) => clean(item.severity).toLowerCase() === 'warning')
    .map(normalizeItem)

  return [...reportWarnings, ...sectionWarnings]
}

function uniqueValues(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function buildRecommendedActions(report = {}) {
  const actions = [
    ...asArray(report.recommendations),
    ...SECTION_FINDINGS.flatMap((definition) => (
      sectionItems(report, definition.section).length ? [definition.action] : []
    )),
    ...asArray(getSections(report).recomendaciones).map((item) => item.suggestedAction || item.message),
  ]

  return uniqueValues(actions)
}

function buildSummaryText({ status, metrics, keyFindings, criticalItems, warnings, recommendedActions }) {
  const diffText = `${metrics.totalDiffs} diferencia${metrics.totalDiffs === 1 ? '' : 's'}`
  const unmatchedText = metrics.unmatchedLegacyCount || metrics.unmatchedNewCount
    ? ` Hay ${metrics.unmatchedLegacyCount} mesa(s) legacy y ${metrics.unmatchedNewCount} mesa(s) nuevas sin equivalente.`
    : ''
  const reviewText = (
    status === 'CRITICAL' ||
    criticalItems.length > 0 ||
    warnings.length > 0 ||
    recommendedActions.length > 0
  )
    ? ' Requiere revision manual antes de cualquier integracion.'
    : ' No requiere revision manual por diferencias detectadas.'

  if (status === 'OK') {
    return `La comparacion finalizo en estado OK: no se detectaron diferencias relevantes entre legacy y el preview nuevo. Se compararon ${metrics.totalLegacyMesas} mesa(s) legacy contra ${metrics.totalNewMesas} mesa(s) nuevas.`
  }

  const mainRisks = keyFindings
    .slice(0, 3)
    .map((finding) => finding.message)
    .join(' ')

  return `La comparacion finalizo en estado ${status}: se detectaron ${diffText}, con ${metrics.totalCriticalDiffs} diferencia(s) critica(s).${unmatchedText}${reviewText}\n\n${mainRisks}`
}

export function buildRegularExamComparisonAuditSummary(report = {}) {
  const safeReport = report && typeof report === 'object' ? report : {}
  const metrics = buildMetrics(safeReport)
  const status = normalizeStatus(safeReport, metrics)
  const keyFindings = buildKeyFindings(safeReport)
  const criticalItems = buildCriticalItems(safeReport)
  const warnings = buildWarnings(safeReport)
  const recommendedActions = buildRecommendedActions(safeReport)

  return {
    status,
    title: `Resumen de auditoria comparativa - ${status}`,
    summaryText: buildSummaryText({
      status,
      metrics,
      keyFindings,
      criticalItems,
      warnings,
      recommendedActions,
    }),
    keyFindings,
    criticalItems,
    warnings,
    recommendedActions,
    metrics,
    metadata: {
      source: 'regularExamComparisonAuditSummary',
      generatedAt: null,
      inputStatus: clean(safeReport.status),
      inputMetadata: cloneJson(safeReport.metadata ?? {}),
    },
  }
}
