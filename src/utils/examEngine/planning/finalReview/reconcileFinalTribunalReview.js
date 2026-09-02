import { normalizeText } from '../../normalize/subjects.js'
import { resolveDraftExamCallConfig } from '../draftSchedule/generateDraftExamSchedule.js'
import { DEFAULT_TRIBUNAL_RULES } from '../tribunals/generateTribunalsFromReviewedSchedule.js'
import {
  buildTribunalDocenteMap,
  findTribunalDocente,
  getTribunalDocenteId,
  getTribunalDocenteLabel,
} from '../tribunals/buildTribunalCandidatePool.js'
import { validateFinalTribunals } from '../../validation/validateFinalTribunals.js'

export const FINAL_REVIEW_SOURCE = 'INSTITUTIONAL_FINAL_REVIEW'

export const FINAL_TRIBUNAL_STATUSES = {
  FINAL_CONFIRMED: 'FINAL_CONFIRMED',
  FINAL_CONFIRMED_MINIMUM: 'FINAL_CONFIRMED_MINIMUM',
  FINAL_NEEDS_REVIEW: 'FINAL_NEEDS_REVIEW',
  FINAL_INCOMPLETE: 'FINAL_INCOMPLETE',
  FINAL_EXCLUDED: 'FINAL_EXCLUDED',
  FINAL_BLOCKED_BY_VALIDATION: 'FINAL_BLOCKED_BY_VALIDATION',
}

const FINAL_ROW_ALIASES = {
  draftMesaId: ['draftMesaId', 'ID Mesa', 'ID mesa', 'idMesa', 'mesaId', 'id'],
  vocal1: ['vocal1', 'Vocal 1', 'nuevoVocal1', 'Nuevo vocal 1'],
  vocal1Id: ['vocal1Id', 'ID Vocal 1', 'nuevoVocal1Id'],
  vocal2: ['vocal2', 'Vocal 2', 'nuevoVocal2', 'Nuevo vocal 2'],
  vocal2Id: ['vocal2Id', 'ID Vocal 2', 'nuevoVocal2Id'],
  estadoFinal: ['estadoFinal', 'Estado final', 'estado', 'Estado'],
  observacionesFinales: ['observacionesFinales', 'Observaciones finales', 'observaciones', 'Observaciones'],
  correccionInstitucional: ['correccionInstitucional', 'Correcci\u00f3n institucional', 'Correccion institucional'],
  excluirMesa: ['excluirMesa', 'Excluir mesa', 'excluida', 'Excluir', 'finalExcluirMesa'],
  tribunalMinimoAceptado: [
    'tribunalMinimoAceptado',
    'Aceptar tribunal minimo',
    'Aceptar tribunal m\u00ednimo',
    'Tribunal minimo aceptado',
    'Tribunal m\u00ednimo aceptado',
    'aceptaMinimo',
  ],
  confirmada: ['confirmada', 'Confirmada', 'confirmar', 'Confirmar'],
  devolverRevision: ['devolverRevision', 'Devolver a revision', 'Devolver a revisi\u00f3n'],
}

const TRUE_VALUES = new Set(['1', 'true', 'si', 's\u00ed', 's', 'yes', 'y', 'x', 'ok'])
const FINAL_NEEDS_REVIEW_TEXT = new Set([
  'final_needs_review',
  'needs_review',
  'revision',
  'revisar',
  'devuelve_a_revision',
  'devuelto_a_revision',
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

function firstPresent(row = {}, aliases = []) {
  for (const alias of aliases) {
    if (!Object.prototype.hasOwnProperty.call(row, alias)) continue
    const value = row[alias]
    if (value === false || value === true) return value
    return value ?? ''
  }

  return ''
}

function hasAnyAlias(row = {}, aliases = []) {
  return aliases.some((alias) => Object.prototype.hasOwnProperty.call(row, alias))
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value
  return TRUE_VALUES.has(normalizeText(value))
}

function normalizeFinalStatus(value = '') {
  const text = clean(value)
  const key = normalizeText(text).replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, '')
  if (Object.values(FINAL_TRIBUNAL_STATUSES).includes(text)) return text
  if (FINAL_NEEDS_REVIEW_TEXT.has(key)) return FINAL_TRIBUNAL_STATUSES.FINAL_NEEDS_REVIEW
  if (key === 'final_excluded' || key === 'excluida' || key === 'excluir') return FINAL_TRIBUNAL_STATUSES.FINAL_EXCLUDED
  if (key === 'final_confirmed' || key === 'confirmada' || key === 'confirmado') return FINAL_TRIBUNAL_STATUSES.FINAL_CONFIRMED
  return ''
}

export function normalizeFinalTribunalReviewRow(row = {}, rowIndex = 0) {
  const safeRow = row && typeof row === 'object' ? row : {}

  return {
    rowIndex,
    draftMesaId: clean(firstPresent(safeRow, FINAL_ROW_ALIASES.draftMesaId)),
    vocal1: clean(firstPresent(safeRow, FINAL_ROW_ALIASES.vocal1)),
    vocal1Id: clean(firstPresent(safeRow, FINAL_ROW_ALIASES.vocal1Id)),
    hasVocal1: hasAnyAlias(safeRow, FINAL_ROW_ALIASES.vocal1) || hasAnyAlias(safeRow, FINAL_ROW_ALIASES.vocal1Id),
    vocal2: clean(firstPresent(safeRow, FINAL_ROW_ALIASES.vocal2)),
    vocal2Id: clean(firstPresent(safeRow, FINAL_ROW_ALIASES.vocal2Id)),
    hasVocal2: hasAnyAlias(safeRow, FINAL_ROW_ALIASES.vocal2) || hasAnyAlias(safeRow, FINAL_ROW_ALIASES.vocal2Id),
    estadoFinal: normalizeFinalStatus(firstPresent(safeRow, FINAL_ROW_ALIASES.estadoFinal)),
    rawEstadoFinal: clean(firstPresent(safeRow, FINAL_ROW_ALIASES.estadoFinal)),
    hasEstadoFinal: hasAnyAlias(safeRow, FINAL_ROW_ALIASES.estadoFinal),
    observacionesFinales: clean(firstPresent(safeRow, FINAL_ROW_ALIASES.observacionesFinales)),
    correccionInstitucional: clean(firstPresent(safeRow, FINAL_ROW_ALIASES.correccionInstitucional)),
    excluirMesa: normalizeBoolean(firstPresent(safeRow, FINAL_ROW_ALIASES.excluirMesa)),
    tribunalMinimoAceptado: normalizeBoolean(firstPresent(safeRow, FINAL_ROW_ALIASES.tribunalMinimoAceptado)),
    confirmada: normalizeBoolean(firstPresent(safeRow, FINAL_ROW_ALIASES.confirmada)),
    devolverRevision: normalizeBoolean(firstPresent(safeRow, FINAL_ROW_ALIASES.devolverRevision)),
    originalRow: clonePlain(safeRow),
  }
}

function getDraftMesaId(mesa = {}) {
  return clean(mesa.draftMesaId ?? mesa.id ?? mesa.mesaId)
}

function buildGeneratedMap(generatedTribunals = []) {
  return generatedTribunals.reduce((map, mesa) => {
    const draftMesaId = getDraftMesaId(mesa)
    if (draftMesaId && !map.has(draftMesaId)) map.set(draftMesaId, mesa)
    return map
  }, new Map())
}

function resolveDocente(value = '', fallbackId = '', docenteMap = new Map()) {
  const raw = clean(value || fallbackId)
  const docente = findTribunalDocente(docenteMap, raw)

  if (docente) {
    return {
      id: getTribunalDocenteId(docente),
      nombre: getTribunalDocenteLabel(docente),
      found: true,
      raw,
    }
  }

  return {
    id: raw,
    nombre: raw,
    found: false,
    raw,
  }
}

function resolveVocal(row = {}, original = {}, number = 1, docenteMap = new Map()) {
  const hasField = number === 1 ? row.hasVocal1 : row.hasVocal2
  const rawId = number === 1 ? row.vocal1Id : row.vocal2Id
  const rawName = number === 1 ? row.vocal1 : row.vocal2
  const originalId = number === 1 ? original.vocal1Id : original.vocal2Id
  const originalName = number === 1 ? original.vocal1 : original.vocal2

  if (!hasField) {
    return resolveDocente(originalId || originalName, originalId, docenteMap)
  }

  if (!rawId && !rawName) {
    return {
      id: '',
      nombre: '',
      found: false,
      raw: '',
    }
  }

  return resolveDocente(rawId || rawName, rawId, docenteMap)
}

function valuesDiffer(left = '', right = '') {
  return normalizeText(left) !== normalizeText(right)
}

function detectFinalManualOverrides({ row, original, vocal1, vocal2 }) {
  const originalEstado = clean(original.estadoFinal ?? original.estado)
  const newObservaciones = clean(row.observacionesFinales || row.correccionInstitucional)
  const originalObservaciones = clean(original.observacionesFinales ?? original.observaciones ?? original.observacionesDocentes)

  return {
    vocal1: Boolean(row.hasVocal1 && (
      valuesDiffer(vocal1.id, original.vocal1Id) ||
      valuesDiffer(vocal1.nombre, original.vocal1)
    )),
    vocal2: Boolean(row.hasVocal2 && (
      valuesDiffer(vocal2.id, original.vocal2Id) ||
      valuesDiffer(vocal2.nombre, original.vocal2)
    )),
    estado: Boolean((row.hasEstadoFinal || row.confirmada || row.devolverRevision) && valuesDiffer(row.estadoFinal || row.rawEstadoFinal, originalEstado)),
    observaciones: Boolean(newObservaciones && valuesDiffer(newObservaciones, originalObservaciones)),
    excluded: row.excluirMesa === true,
    tribunalMinimoAceptado: row.tribunalMinimoAceptado === true,
  }
}

function createUnmatchedFinalMesa(row = {}) {
  return {
    id: row.draftMesaId || `final-review-row:${row.rowIndex}`,
    draftMesaId: row.draftMesaId || `final-review-row:${row.rowIndex}`,
    estadoFinal: FINAL_TRIBUNAL_STATUSES.FINAL_BLOCKED_BY_VALIDATION,
    finalReviewSource: FINAL_REVIEW_SOURCE,
    finalManualOverrides: {
      vocal1: Boolean(row.vocal1 || row.vocal1Id),
      vocal2: Boolean(row.vocal2 || row.vocal2Id),
      estado: Boolean(row.estadoFinal),
      observaciones: Boolean(row.observacionesFinales || row.correccionInstitucional),
      excluded: row.excluirMesa,
      tribunalMinimoAceptado: row.tribunalMinimoAceptado,
    },
    finalValidation: {
      valid: false,
      alerts: [{
        code: row.draftMesaId ? 'FINAL_UNKNOWN_DRAFT_MESA_ID' : 'FINAL_ROW_WITHOUT_ID',
        message: 'La fila final no pudo reconciliarse con la propuesta generada.',
        severity: 'critical',
        draftMesaId: row.draftMesaId,
      }],
    },
    alertasFinales: [{
      code: row.draftMesaId ? 'FINAL_UNKNOWN_DRAFT_MESA_ID' : 'FINAL_ROW_WITHOUT_ID',
      message: 'La fila final no pudo reconciliarse con la propuesta generada.',
      severity: 'critical',
      draftMesaId: row.draftMesaId,
    }],
    metadata: {
      finalReviewUnmatched: true,
      reviewedRow: clonePlain(row.originalRow),
    },
  }
}

function createFinalMesa({ original, row, docenteMap }) {
  const vocal1 = resolveVocal(row, original, 1, docenteMap)
  const vocal2 = resolveVocal(row, original, 2, docenteMap)
  const finalManualOverrides = detectFinalManualOverrides({
    row,
    original,
    vocal1,
    vocal2,
  })

  return {
    ...clonePlain(original),
    draftMesaId: getDraftMesaId(original),
    vocal1: vocal1.nombre,
    vocal1Id: vocal1.id,
    vocal2: vocal2.nombre,
    vocal2Id: vocal2.id,
    estadoFinalSolicitado: row.estadoFinal,
    observacionesFinales: clean(row.observacionesFinales || row.correccionInstitucional || original.observacionesFinales || original.observacionesDocentes || original.observaciones),
    correccionInstitucional: row.correccionInstitucional,
    excluidaFinal: row.excluirMesa,
    tribunalMinimoAceptado: row.tribunalMinimoAceptado,
    confirmadaFinal: row.confirmada,
    devolverRevision: row.devolverRevision,
    finalManualOverrides,
    finalReviewSource: FINAL_REVIEW_SOURCE,
    finalValidation: {
      valid: true,
      alerts: [],
    },
    metadata: {
      ...(original.metadata ?? {}),
      generatedTribunal: clonePlain(original),
      finalReviewedRow: clonePlain(row.originalRow),
      finalReviewSource: FINAL_REVIEW_SOURCE,
    },
  }
}

function createMissingFinalMesa(original = {}) {
  return {
    ...clonePlain(original),
    draftMesaId: getDraftMesaId(original),
    estadoFinalSolicitado: '',
    observacionesFinales: clean(original.observacionesFinales ?? original.observacionesDocentes ?? original.observaciones),
    excluidaFinal: false,
    tribunalMinimoAceptado: false,
    confirmadaFinal: false,
    devolverRevision: true,
    finalManualOverrides: {
      vocal1: false,
      vocal2: false,
      estado: true,
      observaciones: false,
      excluded: false,
      tribunalMinimoAceptado: false,
    },
    finalReviewSource: FINAL_REVIEW_SOURCE,
    finalValidation: {
      valid: false,
      alerts: [{
        code: 'FINAL_REVIEW_ROW_NOT_IMPORTED',
        message: 'La mesa generada no vino en la revision final importada.',
        severity: 'warning',
        draftMesaId: getDraftMesaId(original),
      }],
    },
    alertasFinales: [{
      code: 'FINAL_REVIEW_ROW_NOT_IMPORTED',
      message: 'La mesa generada no vino en la revision final importada.',
      severity: 'warning',
      draftMesaId: getDraftMesaId(original),
    }],
    estadoFinal: FINAL_TRIBUNAL_STATUSES.FINAL_NEEDS_REVIEW,
    metadata: {
      ...(original.metadata ?? {}),
      generatedTribunal: clonePlain(original),
      missingFinalReviewRow: true,
    },
  }
}

function normalizeTribunalRules(rules = {}) {
  return {
    ...DEFAULT_TRIBUNAL_RULES,
    ...rules,
    idealVocales: Number(rules.idealVocales ?? DEFAULT_TRIBUNAL_RULES.idealVocales) || DEFAULT_TRIBUNAL_RULES.idealVocales,
    minimoVocales: Number(rules.minimoVocales ?? DEFAULT_TRIBUNAL_RULES.minimoVocales) || DEFAULT_TRIBUNAL_RULES.minimoVocales,
    maxParticipacionesDocentePorDia: Number(
      rules.maxParticipacionesDocentePorDia ?? DEFAULT_TRIBUNAL_RULES.maxParticipacionesDocentePorDia,
    ) || DEFAULT_TRIBUNAL_RULES.maxParticipacionesDocentePorDia,
  }
}

function getMesaAlerts(validation = {}, draftMesaId = '') {
  return (validation.alerts ?? []).filter((alert) => clean(alert.draftMesaId) === clean(draftMesaId))
}

function hasCriticalAlerts(alerts = []) {
  return alerts.some((alert) => alert.severity === 'critical')
}

function getVocalCount(mesa = {}) {
  return [mesa.vocal1Id || mesa.vocal1, mesa.vocal2Id || mesa.vocal2].filter((value) => clean(value)).length
}

function resolveFinalStatus(mesa = {}, alerts = []) {
  if (mesa.excluidaFinal) return FINAL_TRIBUNAL_STATUSES.FINAL_EXCLUDED
  if (hasCriticalAlerts(alerts)) return FINAL_TRIBUNAL_STATUSES.FINAL_BLOCKED_BY_VALIDATION
  if (mesa.devolverRevision || mesa.estadoFinalSolicitado === FINAL_TRIBUNAL_STATUSES.FINAL_NEEDS_REVIEW) {
    return FINAL_TRIBUNAL_STATUSES.FINAL_NEEDS_REVIEW
  }

  const vocalCount = getVocalCount(mesa)
  if (vocalCount >= 2) return FINAL_TRIBUNAL_STATUSES.FINAL_CONFIRMED
  if (vocalCount === 1 && mesa.tribunalMinimoAceptado) return FINAL_TRIBUNAL_STATUSES.FINAL_CONFIRMED_MINIMUM
  if (vocalCount === 0) return FINAL_TRIBUNAL_STATUSES.FINAL_INCOMPLETE
  return FINAL_TRIBUNAL_STATUSES.FINAL_NEEDS_REVIEW
}

function attachValidation(finalTribunals = [], validation = {}) {
  return finalTribunals.map((mesa) => {
    if (mesa.finalValidation?.alerts?.some((alert) => alert.severity === 'critical')) return mesa

    const alerts = [
      ...(mesa.finalValidation?.alerts ?? []),
      ...getMesaAlerts(validation, mesa.draftMesaId),
    ]
    const estadoFinal = resolveFinalStatus(mesa, alerts)

    return {
      ...mesa,
      estadoFinal,
      finalValidation: {
        valid: !hasCriticalAlerts(alerts),
        alerts,
      },
      alertasFinales: alerts,
    }
  })
}

function summarize(finalTribunals = [], validation = {}) {
  return {
    totalMesas: finalTribunals.length,
    confirmadas: finalTribunals.filter((mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_CONFIRMED).length,
    confirmadasMinimas: finalTribunals.filter((mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_CONFIRMED_MINIMUM).length,
    pendientes: finalTribunals.filter((mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_NEEDS_REVIEW).length,
    incompletas: finalTribunals.filter((mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_INCOMPLETE).length,
    bloqueadas: finalTribunals.filter((mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_BLOCKED_BY_VALIDATION).length,
    excluidas: finalTribunals.filter((mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_EXCLUDED).length,
    totalAlertas: validation.alerts.length,
  }
}

export function reconcileFinalTribunalReview(input = {}) {
  const generatedTribunals = Array.isArray(input.generatedTribunals)
    ? input.generatedTribunals
    : Array.isArray(input.tribunales)
      ? input.tribunales
      : []
  const reviewedRows = Array.isArray(input.reviewedRows) ? input.reviewedRows : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const teacherAssignments = Array.isArray(input.teacherAssignments) ? input.teacherAssignments : []
  const examCallConfig = resolveDraftExamCallConfig(input)
  const tribunalRules = normalizeTribunalRules(input.tribunalRules ?? {})
  const docenteMap = buildTribunalDocenteMap(docentes)
  const generatedMap = buildGeneratedMap(generatedTribunals)
  const normalizedRows = reviewedRows.map(normalizeFinalTribunalReviewRow)
  const processedIds = new Set()
  const preliminaryFinalTribunals = []

  normalizedRows.forEach((row) => {
    const original = generatedMap.get(row.draftMesaId)
    if (!row.draftMesaId || !original || processedIds.has(row.draftMesaId)) {
      preliminaryFinalTribunals.push(createUnmatchedFinalMesa(row))
      return
    }

    processedIds.add(row.draftMesaId)
    preliminaryFinalTribunals.push(createFinalMesa({
      original,
      row,
      docenteMap,
    }))
  })

  generatedTribunals.forEach((mesa) => {
    const draftMesaId = getDraftMesaId(mesa)
    if (!processedIds.has(draftMesaId)) preliminaryFinalTribunals.push(createMissingFinalMesa(mesa))
  })

  const validation = validateFinalTribunals({
    finalTribunals: preliminaryFinalTribunals,
    docentes,
    teacherAssignments,
    examCallConfig,
    tribunalRules,
  })
  const finalTribunals = attachValidation(preliminaryFinalTribunals, validation)

  return {
    success: validation.valid && finalTribunals.every((mesa) => mesa.finalValidation?.valid !== false),
    stage: 'RECONCILE_FINAL_TRIBUNAL_REVIEW',
    finalTribunals,
    validation,
    errors: validation.errors,
    warnings: validation.warnings,
    alerts: validation.alerts,
    summary: summarize(finalTribunals, validation),
    metadata: {
      finalReviewSource: FINAL_REVIEW_SOURCE,
      examCallConfig,
      tribunalRules,
      halfPlusOneRecalculated: true,
      halfPlusOneOnlyVocalias: tribunalRules.mitadMasUnoSoloVocalias !== false,
    },
  }
}
