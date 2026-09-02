import {
  asArray,
  clean,
  cloneJson,
  displayDate,
  displayStatus,
  getCarrera,
  getMesaId,
  getMateria,
  isCritical,
  numberOrZero,
} from './uiDtoShared.js'

function suggestedActionFor(issue = {}) {
  const code = clean(issue.code)
  if (clean(issue.suggestedAction)) return clean(issue.suggestedAction)
  if (code.includes('FECHA')) return 'Agregar fechas disponibles para el llamado.'
  if (code.includes('TITULAR')) return 'Revisar titularidad de la materia.'
  if (code.includes('VOCAL') || code.includes('TRIBUNAL')) return 'Revisar conformacion del tribunal.'
  if (code.includes('CORRELATIVIDAD')) return 'Revisar correlatividades antes de aprobar.'
  if (code.includes('DISPONIBLE') || code.includes('DISPONIBILIDAD')) return 'Revisar disponibilidad docente.'
  return 'Revisar manualmente.'
}

function normalizeAlert(issue = {}, fallbackSeverity = 'warning') {
  const severity = clean(issue.severity || fallbackSeverity).toLowerCase() || fallbackSeverity
  return {
    id: [
      clean(issue.code) || 'PIPELINE_ALERT',
      clean(issue.stage),
      getMesaId(issue),
      clean(issue.docenteId),
      clean(issue.message ?? issue.reason),
    ].join('::'),
    severity,
    code: clean(issue.code) || 'PIPELINE_ALERT',
    message: clean(issue.message) || clean(issue.reason) || clean(issue.detail) || 'Incidencia del cronograma.',
    mesaId: getMesaId(issue),
    materia: getMateria(issue),
    carrera: getCarrera(issue),
    llamado: clean(issue.llamado),
    fecha: clean(issue.fecha),
    docenteId: clean(issue.docenteId),
    docenteNombre: clean(issue.docenteNombre ?? issue.nombreDocente ?? issue.teacherName),
    stage: clean(issue.stage),
    suggestedAction: suggestedActionFor(issue),
  }
}

function dedupeAlerts(alerts = []) {
  const seen = new Set()
  return alerts.filter((alert) => {
    const key = [
      alert.severity,
      alert.code,
      alert.mesaId,
      alert.docenteId,
      alert.message,
    ].join('::')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildAlerts(preview = {}) {
  const report = preview.report ?? {}
  return dedupeAlerts([
    ...asArray(report.criticalErrors).map((issue) => normalizeAlert(issue, 'critical')),
    ...asArray(report.warnings).map((issue) => normalizeAlert(issue, 'warning')),
  ])
}

function buildIssuesByMesa(alerts = [], pending = []) {
  const map = new Map()
  const add = (mesaId, issue) => {
    const key = clean(mesaId)
    if (!key) return
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(issue)
  }

  alerts.forEach((alert) => add(alert.mesaId, alert))
  asArray(pending).forEach((item) => add(item.mesaId, normalizeAlert(item, item.severity ?? 'warning')))
  return map
}

function countMesaIssues(mesa = {}, issuesByMesa = new Map()) {
  const linkedIssues = issuesByMesa.get(getMesaId(mesa)) ?? []
  const ownErrors = asArray(mesa.errors)
  const ownWarnings = asArray(mesa.warnings)
  const errorsCount = linkedIssues.filter(isCritical).length + ownErrors.length
  const warningsCount = linkedIssues.filter((issue) => !isCritical(issue)).length + ownWarnings.length

  return { errorsCount, warningsCount }
}

function getAlertLevel({ errorsCount = 0, warningsCount = 0, unassigned = false } = {}) {
  if (errorsCount > 0 || unassigned) return 'CRITICAL'
  if (warningsCount > 0) return 'WARNING'
  return 'OK'
}

function getTitular(mesa = {}) {
  const id = clean(mesa.titularId ?? mesa.titular_id ?? mesa.titular?.id)
  return {
    id,
    nombre: clean(mesa.titularNombre ?? mesa.nombreTitular ?? mesa.titular?.nombre ?? mesa.titular),
  }
}

function getVocales(mesa = {}) {
  return [
    {
      id: clean(mesa.vocal1Id ?? mesa.vocal1?.id),
      nombre: clean(mesa.vocal1Nombre ?? mesa.nombreVocal1 ?? mesa.vocal1?.nombre ?? mesa.vocal1),
      rol: 'VOCAL_1',
    },
    {
      id: clean(mesa.vocal2Id ?? mesa.vocal2?.id),
      nombre: clean(mesa.vocal2Nombre ?? mesa.nombreVocal2 ?? mesa.vocal2?.nombre ?? mesa.vocal2),
      rol: 'VOCAL_2',
    },
  ].filter((vocal) => vocal.id || vocal.nombre)
}

function hasFecha(mesa = {}) {
  return Boolean(clean(mesa.fecha ?? mesa.fechaIso))
}

function isReviewRequired(mesa = {}, issuesByMesa = new Map(), unassigned = false) {
  if (unassigned) return true
  if (issuesByMesa.has(getMesaId(mesa))) return true
  if (asArray(mesa.errors).length || asArray(mesa.warnings).length) return true
  if (!hasFecha(mesa)) return true
  if (!clean(mesa.titularId ?? mesa.titular_id) || getVocales(mesa).length < 2) return true
  return clean(mesa.estado) === 'PENDIENTE_REVISION'
}

function normalizeGroupedSubjects(mesa = {}) {
  return asArray(mesa.materiasAgrupadas).map((subject) => ({
    materiaId: clean(subject.materiaId ?? subject.id),
    materia: getMateria(subject),
    carreraId: clean(subject.carreraId),
    carrera: getCarrera(subject),
    anio: subject.anio ?? null,
    llamado: clean(subject.llamado ?? mesa.llamado),
  }))
}

function normalizePlannedMesa(mesa = {}, issuesByMesa = new Map()) {
  const counts = countMesaIssues(mesa, issuesByMesa)
  return {
    id: getMesaId(mesa),
    materiaId: clean(mesa.materiaId ?? mesa.idMateria),
    materia: getMateria(mesa),
    carreraId: clean(mesa.carreraId),
    carrera: getCarrera(mesa),
    anio: mesa.anio ?? null,
    llamado: clean(mesa.llamado),
    fecha: clean(mesa.fecha ?? mesa.fechaIso),
    displayDate: displayDate(mesa.fecha ?? mesa.fechaIso),
    turno: clean(mesa.turno),
    estado: clean(mesa.estado) || 'PLANIFICADA',
    displayStatus: displayStatus(mesa.estado, 'Planificada'),
    titular: getTitular(mesa),
    vocales: getVocales(mesa),
    compactada: Boolean(mesa.compactada),
    materiasAgrupadas: normalizeGroupedSubjects(mesa),
    alertLevel: getAlertLevel(counts),
    warningsCount: counts.warningsCount,
    errorsCount: counts.errorsCount,
    reviewRequired: isReviewRequired(mesa, issuesByMesa),
  }
}

function normalizeUnassignedMesa(mesa = {}, issuesByMesa = new Map()) {
  const counts = countMesaIssues(mesa, issuesByMesa)
  return {
    id: getMesaId(mesa),
    materiaId: clean(mesa.materiaId ?? mesa.idMateria),
    materia: getMateria(mesa),
    carreraId: clean(mesa.carreraId),
    carrera: getCarrera(mesa),
    anio: mesa.anio ?? null,
    llamado: clean(mesa.llamado),
    estado: clean(mesa.estado) || 'SIN_FECHA',
    reason: clean(mesa.reason),
    message: clean(mesa.message) || clean(mesa.detail) || clean(mesa.reason) || 'Mesa pendiente de asignacion.',
    alertLevel: getAlertLevel({ ...counts, unassigned: true }),
    warningsCount: counts.warningsCount,
    errorsCount: counts.errorsCount,
    reviewRequired: true,
    suggestedAction: clean(mesa.suggestedAction) || 'Revisar manualmente la mesa pendiente.',
  }
}

function buildUiSummary(preview = {}) {
  const executiveSummary = preview.report?.executiveSummary ?? preview.exportedReport?.executiveSummary ?? {}
  const compactationSummary = preview.report?.compactationSummary ?? preview.exportedReport?.compactationSummary ?? {}
  const pendingManualReview = asArray(preview.report?.pendingManualReview)

  const totalPlanned = asArray(preview.plannedMesas).length || numberOrZero(executiveSummary.totalMesasPlanificadas)
  const totalUnassigned = asArray(preview.unassignedMesas).length || numberOrZero(executiveSummary.totalMesasSinFecha)

  return {
    totalPlanned,
    totalUnassigned,
    totalMesas: totalPlanned + totalUnassigned,
    totalCriticalErrors: numberOrZero(executiveSummary.totalErroresCriticos ?? preview.report?.criticalErrors?.length),
    totalWarnings: numberOrZero(executiveSummary.totalAdvertencias ?? preview.report?.warnings?.length),
    totalPendingManualReview: pendingManualReview.length,
    totalCompactadas: numberOrZero(executiveSummary.totalCompactaciones ?? compactationSummary.totalCompactaciones),
    cantidadLlamados: executiveSummary.cantidadLlamados ?? preview.metadata?.cantidadLlamados ?? null,
    tipoPeriodo: clean(executiveSummary.tipoPeriodo ?? preview.metadata?.tipoPeriodo),
    compactMode: compactationSummary.compactMode ?? executiveSummary.compactMode ?? preview.metadata?.compactMode ?? null,
    compactacionEjecutada: Boolean(compactationSummary.compactacionEjecutada ?? preview.metadata?.compactacionEjecutada),
    exportValid: Boolean(preview.exportValidation?.valid),
  }
}

function omitRaw(value = {}) {
  const cloned = cloneJson(value)
  if (cloned && typeof cloned === 'object' && !Array.isArray(cloned)) {
    delete cloned.raw
  }
  return cloned
}

export function buildRegularExamPreviewUiDto(preview = {}) {
  const alerts = buildAlerts(preview)
  const pendingManualReview = cloneJson(asArray(preview.report?.pendingManualReview))
  const issuesByMesa = buildIssuesByMesa(alerts, pendingManualReview)

  return {
    success: Boolean(preview.success),
    status: clean(preview.status) || clean(preview.report?.status) || 'UNKNOWN',
    uiSummary: buildUiSummary(preview),
    uiTables: {
      planned: asArray(preview.plannedMesas).map((mesa) => normalizePlannedMesa(mesa, issuesByMesa)),
      unassigned: asArray(preview.unassignedMesas).map((mesa) => normalizeUnassignedMesa(mesa, issuesByMesa)),
    },
    uiAlerts: cloneJson(alerts),
    uiTeacherSummary: cloneJson(preview.report?.teachersSummary ?? preview.exportedReport?.teachersSummary ?? []),
    uiCareerSummary: cloneJson(preview.report?.careersSummary ?? preview.exportedReport?.careersSummary ?? []),
    uiCallSummary: cloneJson(preview.report?.callsSummary ?? preview.exportedReport?.callsSummary ?? []),
    uiPendingReview: pendingManualReview,
    uiRecommendations: cloneJson(preview.report?.recommendations ?? preview.exportedReport?.recommendations ?? []),
    audit: {
      exportedReport: omitRaw(preview.exportedReport ?? {}),
      exportValidation: cloneJson(preview.exportValidation ?? {}),
      metadata: cloneJson(preview.metadata ?? {}),
    },
  }
}

