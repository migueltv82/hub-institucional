const DEFAULT_LIMITS = {
  issues: 20,
  alerts: 20,
  tableRows: 50,
}

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

function issueCode(issue = {}) {
  return clean(issue.code ?? issue.reason ?? issue.message) || 'SIN_CODIGO'
}

function compactIssue(issue = {}) {
  return {
    code: issueCode(issue),
    message: clean(issue.message ?? issue.reason ?? issue.detail),
    severity: clean(issue.severity),
    stage: clean(issue.stage),
    mesaId: clean(issue.mesaId ?? issue.mesa_id),
    materia: clean(issue.materia ?? issue.nombreMateria),
    carrera: clean(issue.carrera),
    llamado: clean(issue.llamado),
    fecha: clean(issue.fecha),
    suggestedAction: clean(issue.suggestedAction),
  }
}

function compactAlert(alert = {}) {
  return {
    id: clean(alert.id),
    severity: clean(alert.severity),
    code: issueCode(alert),
    message: clean(alert.message),
    mesaId: clean(alert.mesaId),
    materia: clean(alert.materia),
    carrera: clean(alert.carrera),
    llamado: clean(alert.llamado),
    fecha: clean(alert.fecha),
    stage: clean(alert.stage),
    suggestedAction: clean(alert.suggestedAction),
  }
}

function compactTeacher(value = {}) {
  if (!value || typeof value !== 'object') return { id: clean(value) }
  return {
    id: clean(value.id),
    rol: clean(value.rol),
  }
}

function compactTableRow(row = {}) {
  return {
    id: clean(row.id),
    materiaId: clean(row.materiaId),
    materia: clean(row.materia),
    carreraId: clean(row.carreraId),
    carrera: clean(row.carrera),
    anio: row.anio ?? null,
    llamado: clean(row.llamado),
    fecha: clean(row.fecha),
    displayDate: clean(row.displayDate),
    turno: clean(row.turno),
    estado: clean(row.estado),
    displayStatus: clean(row.displayStatus),
    titular: compactTeacher(row.titular),
    vocales: asArray(row.vocales).map(compactTeacher),
    compactada: Boolean(row.compactada),
    alertLevel: clean(row.alertLevel),
    warningsCount: Number(row.warningsCount ?? 0),
    errorsCount: Number(row.errorsCount ?? 0),
    reviewRequired: Boolean(row.reviewRequired),
    reason: clean(row.reason),
    message: clean(row.message),
    suggestedAction: clean(row.suggestedAction),
  }
}

function countByCode(items = []) {
  return asArray(items).reduce((counts, item) => {
    const code = issueCode(item)
    counts[code] = (counts[code] ?? 0) + 1
    return counts
  }, {})
}

function topCodeCounts(items = [], limit = DEFAULT_LIMITS.issues) {
  return Object.entries(countByCode(items))
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
    .slice(0, limit)
}

function limitArray(items = [], limit = DEFAULT_LIMITS.issues, mapper = (value) => value) {
  return asArray(items).slice(0, limit).map(mapper)
}

function compactDto(dto = {}, limits = DEFAULT_LIMITS) {
  const uiTables = dto?.uiTables ?? {}

  return {
    success: Boolean(dto?.success),
    status: clean(dto?.status),
    uiSummary: cloneJson(dto?.uiSummary ?? {}),
    uiTables: {
      planned: limitArray(uiTables.planned, limits.tableRows, compactTableRow),
      unassigned: limitArray(uiTables.unassigned, limits.tableRows, compactTableRow),
    },
    uiAlerts: limitArray(dto?.uiAlerts, limits.alerts, compactAlert),
    uiTeacherSummary: [],
    uiCareerSummary: cloneJson(dto?.uiCareerSummary ?? []),
    uiCallSummary: cloneJson(dto?.uiCallSummary ?? []),
    uiPendingReview: limitArray(dto?.uiPendingReview, limits.issues, compactIssue),
    uiRecommendations: cloneJson(dto?.uiRecommendations ?? []),
    audit: {
      exportValidation: cloneJson(dto?.audit?.exportValidation ?? {}),
      metadata: cloneJson(dto?.audit?.metadata ?? {}),
    },
  }
}

function buildIssueSummary({ errors, warnings, alerts, limits }) {
  return {
    totalErrors: asArray(errors).length,
    totalWarnings: asArray(warnings).length,
    totalAlerts: asArray(alerts).length,
    visibleErrors: Math.min(asArray(errors).length, limits.issues),
    visibleWarnings: Math.min(asArray(warnings).length, limits.issues),
    visibleAlerts: Math.min(asArray(alerts).length, limits.alerts),
    topErrorsByCode: topCodeCounts(errors, limits.issues),
    topWarningsByCode: topCodeCounts(warnings, limits.issues),
    topAlertsByCode: topCodeCounts(alerts, limits.alerts),
    topByCode: topCodeCounts([...asArray(errors), ...asArray(warnings)], limits.issues),
  }
}

export function compactPreviewResultForUi(contract = {}, options = {}) {
  const limits = {
    ...DEFAULT_LIMITS,
    ...(options.limits ?? {}),
  }
  const errors = asArray(contract.errors)
  const warnings = asArray(contract.warnings)
  const uiDto = compactDto(contract.uiDto ?? {}, limits)
  const filteredDto = compactDto(contract.filteredDto ?? contract.uiDto ?? {}, limits)
  const issueSummary = buildIssueSummary({
    errors,
    warnings,
    alerts: contract.filteredDto?.uiAlerts ?? contract.uiDto?.uiAlerts,
    limits,
  })

  return {
    phase: contract.phase,
    status: clean(contract.status) || 'UNKNOWN',
    preview: {
      summary: cloneJson(contract.preview?.summary ?? {}),
      metadata: cloneJson(contract.preview?.metadata ?? {}),
    },
    uiDto,
    validation: {
      valid: Boolean(contract.validation?.valid),
      errors: limitArray(contract.validation?.errors, limits.issues, compactIssue),
      warnings: limitArray(contract.validation?.warnings, limits.issues, compactIssue),
    },
    filters: cloneJson(contract.filters ?? {}),
    filtersState: cloneJson(contract.filtersState ?? {}),
    filteredDto,
    canExportJson: Boolean(contract.canExportJson),
    canPublishOfficial: false,
    canSaveOfficialSchedule: false,
    errors: limitArray(errors, limits.issues, compactIssue),
    warnings: limitArray(warnings, limits.issues, compactIssue),
    metadata: {
      ...(cloneJson(contract.metadata ?? {}) ?? {}),
      compacted: true,
      limits,
      issueSummary,
      uiSummary: cloneJson(contract.uiDto?.uiSummary ?? {}),
    },
  }
}

export { DEFAULT_LIMITS as EXAM_ENGINE_PREVIEW_COMPACTION_LIMITS }
