import { DOCENTE_A_DESIGNAR } from '../../constants.js'
import {
  DRAFT_SCHEDULE_STATUSES,
} from '../../fieldTest/august2026FieldTestConfig.js'
import { resolveDraftExamCallConfig } from '../draftSchedule/generateDraftExamSchedule.js'
import { normalizeText } from '../../normalize/subjects.js'
import {
  buildDocenteReviewMap,
  buildDraftMesaMap,
  findReviewedDocente,
  getDraftMesaId,
  getReviewedDocenteId,
  getReviewedDocenteLabel,
  normalizeReviewedDraftRow,
  validateReviewedDraftSchedule,
} from '../../validation/validateReviewedDraftSchedule.js'

export const REVIEWED_DRAFT_REVIEW_SOURCE = 'TEACHER_REVIEW_IMPORT'

const BLOCKING_REVIEW_CODES = new Set([
  'REVIEWED_ROW_WITHOUT_ID',
  'UNKNOWN_DRAFT_MESA_ID',
  'DUPLICATED_DRAFT_MESA_ID',
  'REVIEWED_DATE_INVALID',
  'REVIEWED_DATE_OUT_OF_PERIOD',
  'REVIEWED_TITULAR_NOT_FOUND',
  'REVIEWED_MESA_WITHOUT_TITULAR',
])

function clean(value) {
  return String(value ?? '').trim()
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlain(entry)]))
  }

  return value
}

function cloneMesaWithoutVocales(mesa = {}) {
  const {
    vocal1: _vocal1,
    vocal2: _vocal2,
    vocal1Id: _vocal1Id,
    vocal2Id: _vocal2Id,
    vocal1_id: _vocal1_id,
    vocal2_id: _vocal2_id,
    ...rest
  } = clonePlain(mesa)

  return rest
}

function getOriginalFecha(original = {}) {
  return clean(original.fechaSugerida ?? original.fecha)
}

function getOriginalMateriaMesa(original = {}) {
  return clean(original.materiaMesa ?? original.materia ?? original.nombreMateria)
}

function getOriginalTitularAliases(original = {}) {
  return [
    original.titularId,
    original.titular,
    original.titularNombre,
    original.profesorTitular,
  ].map(normalizeText).filter(Boolean)
}

function sameOriginalTitular(value = '', original = {}) {
  const valueKey = normalizeText(value)
  if (!valueKey) return false
  return getOriginalTitularAliases(original).includes(valueKey)
}

function getEffectiveFecha(row = {}, original = {}) {
  if (row.nuevaFechaSugerida) return row.nuevaFechaSugerida
  if (row.fecha) return row.fecha
  return getOriginalFecha(original)
}

function getEffectiveMateriaMesa(row = {}, original = {}) {
  return clean(row.materiaMesa || getOriginalMateriaMesa(original))
}

function getTitularRaw(row = {}, original = {}) {
  return clean(row.nuevoTitularSugerido || row.titular || original.titularId || original.titular)
}

function resolveTitular({ row, original, docenteMap }) {
  const raw = getTitularRaw(row, original)
  const docente = findReviewedDocente(docenteMap, raw)

  if (docente) {
    return {
      titularId: getReviewedDocenteId(docente),
      titular: getReviewedDocenteLabel(docente),
      sourceValue: raw,
      found: true,
    }
  }

  return {
    titularId: raw && normalizeText(raw) !== normalizeText(DOCENTE_A_DESIGNAR) ? raw : '',
    titular: raw || DOCENTE_A_DESIGNAR,
    sourceValue: raw,
    found: false,
  }
}

function detectManualOverrides({ row, original, resolvedTitular, effectiveFecha, effectiveMateriaMesa }) {
  const originalFecha = getOriginalFecha(original)
  const titularChanged = Boolean(
    (row.nuevoTitularSugerido || row.titular) &&
    !sameOriginalTitular(resolvedTitular.sourceValue || resolvedTitular.titularId, original) &&
    !sameOriginalTitular(resolvedTitular.titularId, original) &&
    !sameOriginalTitular(resolvedTitular.titular, original)
  )

  return {
    fecha: Boolean((row.nuevaFechaSugerida || row.fecha) && effectiveFecha !== originalFecha),
    titular: titularChanged,
    materiaMesa: Boolean(row.materiaMesa && effectiveMateriaMesa !== getOriginalMateriaMesa(original)),
    excluded: row.excluirMesa === true,
  }
}

function createAlertFromIssue(issue = {}) {
  return {
    code: issue.code,
    message: issue.message,
    severity: BLOCKING_REVIEW_CODES.has(issue.code) ? 'critical' : 'warning',
    draftMesaId: issue.draftMesaId,
    rowIndex: issue.rowIndex,
    ...(issue.fecha ? { fecha: issue.fecha } : {}),
    ...(issue.titular ? { titular: issue.titular } : {}),
    ...(issue.manualOverrides ? { manualOverrides: issue.manualOverrides } : {}),
  }
}

function buildReviewChanges(manualOverrides = {}, row = {}, original = {}, resolvedTitular = {}, effectiveFecha = '', effectiveMateriaMesa = '') {
  const changes = []

  if (manualOverrides.fecha) {
    changes.push({
      field: 'fecha',
      from: getOriginalFecha(original),
      to: effectiveFecha,
    })
  }

  if (manualOverrides.titular) {
    changes.push({
      field: 'titular',
      from: clean(original.titular ?? original.titularId),
      to: resolvedTitular.titular,
      titularId: resolvedTitular.titularId,
    })
  }

  if (manualOverrides.materiaMesa) {
    changes.push({
      field: 'materiaMesa',
      from: getOriginalMateriaMesa(original),
      to: effectiveMateriaMesa,
    })
  }

  if (manualOverrides.excluded) {
    changes.push({
      field: 'excluded',
      from: false,
      to: true,
    })
  }

  if (row.observacionesDocentes) {
    changes.push({
      field: 'observacionesDocentes',
      from: '',
      to: row.observacionesDocentes,
    })
  }

  return changes
}

function getStatus({ excluded, confirmed, hasBlockingAlerts, manualOverrides }) {
  if (excluded) return DRAFT_SCHEDULE_STATUSES.EXCLUDED_BY_REVIEW
  if (hasBlockingAlerts) return DRAFT_SCHEDULE_STATUSES.NEEDS_INSTITUTIONAL_REVIEW
  if (confirmed) return DRAFT_SCHEDULE_STATUSES.READY_FOR_TRIBUNAL
  if (Object.values(manualOverrides).some(Boolean)) return DRAFT_SCHEDULE_STATUSES.REVIEWED
  return DRAFT_SCHEDULE_STATUSES.REVIEWED
}

function getIssuesForRow(validation = {}, row = {}) {
  return (validation.warnings ?? []).filter((issue) => (
    issue.rowIndex === row.rowIndex ||
    (row.draftMesaId && issue.draftMesaId === row.draftMesaId)
  ))
}

function createUnmatchedReviewedMesa({ row, issues }) {
  const draftMesaId = row.draftMesaId || `review-row:${row.rowIndex}`
  const alertas = issues.length
    ? issues.map(createAlertFromIssue)
    : [{
        code: 'UNKNOWN_DRAFT_MESA_ID',
        message: 'La fila importada no pudo reconciliarse con el precronograma original.',
        severity: 'critical',
        draftMesaId,
        rowIndex: row.rowIndex,
      }]

  return {
    id: draftMesaId,
    draftMesaId,
    fecha: row.nuevaFechaSugerida || row.fecha || '',
    fechaSugerida: row.nuevaFechaSugerida || row.fecha || '',
    carrera: row.carrera,
    anio: row.anio,
    materiaMesa: row.materiaMesa,
    materia: row.materiaMesa,
    titularId: '',
    titular: row.nuevoTitularSugerido || row.titular || DOCENTE_A_DESIGNAR,
    estado: DRAFT_SCHEDULE_STATUSES.NEEDS_INSTITUTIONAL_REVIEW,
    confirmada: row.confirmada,
    excluida: row.excluirMesa,
    observacionesDocentes: row.observacionesDocentes,
    manualOverrides: {
      fecha: Boolean(row.nuevaFechaSugerida || row.fecha),
      titular: Boolean(row.nuevoTitularSugerido || row.titular),
      materiaMesa: Boolean(row.materiaMesa),
      excluded: row.excluirMesa === true,
    },
    reviewSource: REVIEWED_DRAFT_REVIEW_SOURCE,
    lockedForTribunalGeneration: false,
    alertas,
    reviewChanges: [],
    metadata: {
      reviewUnmatched: true,
      reviewedRow: clonePlain(row.originalRow),
    },
  }
}

function createReviewedMesa({ original, row, issues, docenteMap }) {
  const baseMesa = cloneMesaWithoutVocales(original)
  const draftMesaId = getDraftMesaId(original)
  const effectiveFecha = getEffectiveFecha(row, original)
  const effectiveMateriaMesa = getEffectiveMateriaMesa(row, original)
  const resolvedTitular = resolveTitular({ row, original, docenteMap })
  const manualOverrides = detectManualOverrides({
    row,
    original,
    resolvedTitular,
    effectiveFecha,
    effectiveMateriaMesa,
  })
  const alertas = issues.map(createAlertFromIssue)
  const hasBlockingAlerts = alertas.some((alerta) => alerta.severity === 'critical')
  const estado = getStatus({
    excluded: row.excluirMesa,
    confirmed: row.confirmada,
    hasBlockingAlerts,
    manualOverrides,
  })
  const reviewChanges = buildReviewChanges(
    manualOverrides,
    row,
    original,
    resolvedTitular,
    effectiveFecha,
    effectiveMateriaMesa,
  )

  return {
    ...baseMesa,
    id: baseMesa.id ?? draftMesaId,
    draftMesaId,
    fecha: effectiveFecha,
    fechaSugerida: effectiveFecha,
    materiaMesa: effectiveMateriaMesa,
    materia: effectiveMateriaMesa,
    titularId: resolvedTitular.titularId,
    titular: resolvedTitular.titular,
    estado,
    confirmada: row.confirmada,
    excluida: row.excluirMesa,
    observaciones: clean(row.observaciones || baseMesa.observaciones),
    correccionSugerida: clean(row.correccionSugerida || baseMesa.correccionSugerida),
    observacionesDocentes: row.observacionesDocentes,
    manualOverrides,
    reviewSource: REVIEWED_DRAFT_REVIEW_SOURCE,
    lockedForTribunalGeneration: !row.excluirMesa && !hasBlockingAlerts,
    alertas,
    reviewChanges,
    metadata: {
      ...(baseMesa.metadata ?? {}),
      originalDraftMesa: cloneMesaWithoutVocales(original),
      reviewedRow: clonePlain(row.originalRow),
      reviewedAtStage: REVIEWED_DRAFT_REVIEW_SOURCE,
      confirmedByReview: row.confirmada,
      excludedByReview: row.excluirMesa,
    },
  }
}

function createMissingReviewedMesa(original = {}) {
  const baseMesa = cloneMesaWithoutVocales(original)
  const draftMesaId = getDraftMesaId(original)
  const alert = {
    code: 'REVIEWED_ROW_NOT_IMPORTED',
    message: 'La mesa original no vino en las filas revisadas importadas.',
    severity: 'warning',
    draftMesaId,
  }

  return {
    ...baseMesa,
    id: baseMesa.id ?? draftMesaId,
    draftMesaId,
    estado: DRAFT_SCHEDULE_STATUSES.NEEDS_INSTITUTIONAL_REVIEW,
    reviewSource: REVIEWED_DRAFT_REVIEW_SOURCE,
    lockedForTribunalGeneration: false,
    manualOverrides: {
      fecha: false,
      titular: false,
      materiaMesa: false,
      excluded: false,
    },
    alertas: [alert],
    reviewChanges: [],
    metadata: {
      ...(baseMesa.metadata ?? {}),
      originalDraftMesa: cloneMesaWithoutVocales(original),
      missingReviewedRow: true,
    },
  }
}

function summarize(reviewedSchedule = [], validation = {}) {
  return {
    totalReviewedMesas: reviewedSchedule.length,
    totalReadyForTribunal: reviewedSchedule.filter((mesa) => mesa.estado === DRAFT_SCHEDULE_STATUSES.READY_FOR_TRIBUNAL).length,
    totalNeedsInstitutionalReview: reviewedSchedule.filter((mesa) => mesa.estado === DRAFT_SCHEDULE_STATUSES.NEEDS_INSTITUTIONAL_REVIEW).length,
    totalExcluded: reviewedSchedule.filter((mesa) => mesa.estado === DRAFT_SCHEDULE_STATUSES.EXCLUDED_BY_REVIEW).length,
    totalManualOverrides: reviewedSchedule.filter((mesa) => Object.values(mesa.manualOverrides ?? {}).some(Boolean)).length,
    totalWarnings: validation.warnings.length,
    totalErrors: validation.errors.length,
  }
}

export function reconcileReviewedDraftSchedule(input = {}) {
  const originalDraftSchedule = Array.isArray(input.originalDraftSchedule) ? input.originalDraftSchedule : []
  const reviewedRows = Array.isArray(input.reviewedRows) ? input.reviewedRows : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const config = resolveDraftExamCallConfig(input)
  const validation = validateReviewedDraftSchedule({
    originalDraftSchedule,
    reviewedRows,
    docentes,
    config,
  })
  const normalizedRows = validation.normalizedRows.length
    ? validation.normalizedRows
    : reviewedRows.map(normalizeReviewedDraftRow)
  const originalMap = buildDraftMesaMap(originalDraftSchedule)
  const docenteMap = buildDocenteReviewMap(docentes)
  const processedOriginalIds = new Set()
  const processedImportedIds = new Set()
  const reviewedSchedule = []

  normalizedRows.forEach((row) => {
    const issues = getIssuesForRow(validation, row)

    if (!row.draftMesaId || processedImportedIds.has(row.draftMesaId)) {
      reviewedSchedule.push(createUnmatchedReviewedMesa({ row, issues }))
      return
    }
    processedImportedIds.add(row.draftMesaId)

    const original = originalMap.get(row.draftMesaId)
    if (!original) {
      reviewedSchedule.push(createUnmatchedReviewedMesa({ row, issues }))
      return
    }

    processedOriginalIds.add(row.draftMesaId)
    reviewedSchedule.push(createReviewedMesa({
      original,
      row,
      issues,
      docenteMap,
    }))
  })

  originalDraftSchedule.forEach((original) => {
    const draftMesaId = getDraftMesaId(original)
    if (processedOriginalIds.has(draftMesaId)) return
    reviewedSchedule.push(createMissingReviewedMesa(original))
  })

  return {
    success: validation.errors.length === 0,
    stage: 'RECONCILE_REVIEWED_DRAFT_SCHEDULE',
    reviewedSchedule,
    cronogramaRevisado: reviewedSchedule,
    validation,
    errors: validation.errors,
    warnings: validation.warnings,
    summary: summarize(reviewedSchedule, validation),
    metadata: {
      config,
      reviewSource: REVIEWED_DRAFT_REVIEW_SOURCE,
      vocalesAsignados: false,
      mitadMasUnoAplicada: false,
    },
  }
}
