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

function pickSummaryValue(summary = {}, key, fallback) {
  return sanitizeJsonValue(summary[key] ?? fallback)
}

export function exportRegularExamComparisonAuditSummary(summary = {}, options = {}) {
  const safeSummary = summary && typeof summary === 'object' ? summary : {}
  const {
    institutionName,
    periodLabel,
    includeMetadata = true,
  } = options

  const exported = {
    exportedAt: new Date().toISOString(),
  }

  if (institutionName !== undefined && clean(institutionName)) {
    exported.institutionName = clean(institutionName)
  }

  if (periodLabel !== undefined && clean(periodLabel)) {
    exported.periodLabel = clean(periodLabel)
  }

  Object.assign(exported, {
    status: clean(safeSummary.status),
    title: clean(safeSummary.title),
    summaryText: clean(safeSummary.summaryText),
    keyFindings: pickSummaryValue(safeSummary, 'keyFindings', []),
    criticalItems: pickSummaryValue(safeSummary, 'criticalItems', []),
    warnings: pickSummaryValue(safeSummary, 'warnings', []),
    recommendedActions: pickSummaryValue(safeSummary, 'recommendedActions', []),
    metrics: pickSummaryValue(safeSummary, 'metrics', {}),
  })

  if (includeMetadata !== false) {
    exported.metadata = pickSummaryValue(safeSummary, 'metadata', {})
  }

  return sanitizeJsonValue(exported)
}
