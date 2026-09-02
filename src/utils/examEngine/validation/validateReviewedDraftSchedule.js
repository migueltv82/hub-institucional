import { buildDateRange, getDayName, toIsoDate } from '../normalize/dates.js'
import { normalizeText } from '../normalize/subjects.js'
import { resolveDraftExamCallConfig } from '../planning/draftSchedule/generateDraftExamSchedule.js'

const REVIEWED_ROW_ALIASES = {
  draftMesaId: ['draftMesaId', 'ID Mesa', 'ID mesa', 'idMesa', 'mesaId', 'id'],
  fecha: ['fecha', 'Fecha'],
  carrera: ['carrera', 'Carrera'],
  anio: ['anio', 'A\u00f1o', 'ano', 'year'],
  materiaMesa: ['materiaMesa', 'Materia/Mesa', 'Materia Mesa', 'materia'],
  titular: ['titular', 'Titular', 'profesorTitular'],
  estado: ['estado', 'Estado'],
  observaciones: ['observaciones', 'Observaciones'],
  correccionSugerida: ['correccionSugerida', 'Correcci\u00f3n sugerida', 'Correccion sugerida'],
  confirmada: ['confirmada', 'Confirmada'],
  excluirMesa: ['excluirMesa', 'Excluir mesa', 'excluida', 'Excluir'],
  nuevoTitularSugerido: ['nuevoTitularSugerido', 'Nuevo titular sugerido'],
  nuevaFechaSugerida: ['nuevaFechaSugerida', 'Nueva fecha sugerida'],
  observacionesDocentes: ['observacionesDocentes', 'Observaciones docentes'],
}

const TRUE_VALUES = new Set(['1', 'true', 'si', 's\u00ed', 's', 'yes', 'y', 'x', 'ok'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'n', ''])

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
    if (value !== undefined && value !== null && clean(value) !== '') return value
  }

  return ''
}

export function normalizeReviewedBoolean(value) {
  if (value === true || value === false) return value
  const normalized = normalizeText(value)
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return false
}

function normalizeReviewedDate(value) {
  const raw = clean(value)
  const fecha = toIsoDate(raw)

  return {
    raw,
    fecha,
    invalid: Boolean(raw && !fecha),
  }
}

export function normalizeReviewedDraftRow(row = {}, rowIndex = 0) {
  const safeRow = row && typeof row === 'object' ? row : {}
  const fecha = normalizeReviewedDate(firstPresent(safeRow, REVIEWED_ROW_ALIASES.fecha))
  const nuevaFechaSugerida = normalizeReviewedDate(firstPresent(safeRow, REVIEWED_ROW_ALIASES.nuevaFechaSugerida))

  return {
    rowIndex,
    draftMesaId: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.draftMesaId)),
    fecha: fecha.fecha,
    fechaRaw: fecha.raw,
    fechaInvalida: fecha.invalid,
    carrera: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.carrera)),
    anio: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.anio)),
    materiaMesa: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.materiaMesa)),
    titular: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.titular)),
    estado: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.estado)),
    observaciones: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.observaciones)),
    correccionSugerida: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.correccionSugerida)),
    confirmada: normalizeReviewedBoolean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.confirmada)),
    excluirMesa: normalizeReviewedBoolean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.excluirMesa)),
    nuevoTitularSugerido: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.nuevoTitularSugerido)),
    nuevaFechaSugerida: nuevaFechaSugerida.fecha,
    nuevaFechaSugeridaRaw: nuevaFechaSugerida.raw,
    nuevaFechaSugeridaInvalida: nuevaFechaSugerida.invalid,
    observacionesDocentes: clean(firstPresent(safeRow, REVIEWED_ROW_ALIASES.observacionesDocentes)),
    originalRow: clonePlain(safeRow),
  }
}

export function getDraftMesaId(mesa = {}) {
  return clean(mesa.draftMesaId ?? mesa.id ?? mesa.mesaId)
}

export function buildDraftMesaMap(originalDraftSchedule = []) {
  return originalDraftSchedule.reduce((map, mesa) => {
    const draftMesaId = getDraftMesaId(mesa)
    if (draftMesaId && !map.has(draftMesaId)) map.set(draftMesaId, mesa)
    return map
  }, new Map())
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)

  return clean(
    docente.id ??
    docente.docenteId ??
    docente.teacherKey ??
    docente.dni ??
    docente.email ??
    docente.nombre,
  )
}

function getDocenteLabel(docente = {}) {
  if (typeof docente === 'string') return docente

  return clean(
    docente.nombre ??
    docente.full_name ??
    docente.display_name ??
    docente.profesor ??
    docente.docente ??
    getDocenteId(docente),
  )
}

function getDocenteKeys(docente = {}) {
  if (typeof docente === 'string') return [normalizeText(docente)].filter(Boolean)

  return [
    docente.id,
    docente.docenteId,
    docente.teacherKey,
    docente.dni,
    docente.email,
    docente.nombre,
    docente.full_name,
    docente.display_name,
    docente.profesor,
    docente.docente,
  ].map(normalizeText).filter(Boolean)
}

export function buildDocenteReviewMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    getDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
}

export function findReviewedDocente(docenteMap = new Map(), value = '') {
  return docenteMap.get(normalizeText(value)) ?? null
}

export function getReviewedDocenteId(docente = {}) {
  return getDocenteId(docente)
}

export function getReviewedDocenteLabel(docente = {}) {
  return getDocenteLabel(docente)
}

function getOriginalFecha(original = {}) {
  return clean(original.fechaSugerida ?? original.fecha)
}

function getOriginalTitularAliases(original = {}) {
  return [
    original.titularId,
    original.titular,
    original.titularNombre,
    original.profesorTitular,
  ].map(normalizeText).filter(Boolean)
}

function sameTitularValue(value = '', original = {}) {
  const valueKey = normalizeText(value)
  if (!valueKey) return false
  return getOriginalTitularAliases(original).includes(valueKey)
}

function getEffectiveFecha(row = {}, original = {}) {
  return row.nuevaFechaSugerida || row.fecha || getOriginalFecha(original)
}

function getEffectiveTitularRaw(row = {}, original = {}) {
  return clean(row.nuevoTitularSugerido || row.titular || original.titularId || original.titular)
}

function detectManualOverrides(row = {}, original = {}) {
  const effectiveFecha = getEffectiveFecha(row, original)
  const effectiveTitular = getEffectiveTitularRaw(row, original)

  return {
    fecha: Boolean((row.nuevaFechaSugerida || row.fecha) && effectiveFecha !== getOriginalFecha(original)),
    titular: Boolean((row.nuevoTitularSugerido || row.titular) && !sameTitularValue(effectiveTitular, original)),
    materiaMesa: Boolean(row.materiaMesa && row.materiaMesa !== clean(original.materiaMesa ?? original.materia)),
    excluded: row.excluirMesa === true,
  }
}

function buildAllowedDateSet(config = {}) {
  if (Array.isArray(config.fechasHabiles) && config.fechasHabiles.length) {
    return new Set(config.fechasHabiles.map(toIsoDate).filter(Boolean))
  }

  const useWorkingDays = config.usarDiasHabiles ?? config.usarSoloDiasHabiles ?? true
  const workingDays = new Set(
    Array.isArray(config.diasHabiles) && config.diasHabiles.length
      ? config.diasHabiles.map(normalizeText)
      : ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  )

  return new Set(
    buildDateRange(config.fechaInicio, config.fechaFin)
      .filter((fecha) => !useWorkingDays || workingDays.has(getDayName(fecha))),
  )
}

function createIssue({ code, message, severity = 'warning', row = {}, draftMesaId = '', extra = {} }) {
  return {
    code,
    message,
    severity,
    rowIndex: row.rowIndex,
    draftMesaId: draftMesaId || row.draftMesaId,
    ...extra,
  }
}

function validationKey(issue = {}) {
  return [
    issue.code,
    issue.severity,
    issue.rowIndex,
    issue.draftMesaId,
    issue.fecha,
    issue.titular,
  ].map((value) => String(value ?? '')).join('::')
}

function dedupeIssues(issues = []) {
  const seen = new Set()
  const unique = []

  issues.forEach((issue) => {
    const key = validationKey(issue)
    if (seen.has(key)) return
    seen.add(key)
    unique.push(issue)
  })

  return unique
}

function pushMesaIssues({ row, original, docentes, docenteMap, allowedDates, warnings }) {
  const manualOverrides = detectManualOverrides(row, original)
  const effectiveFecha = getEffectiveFecha(row, original)
  const effectiveTitular = getEffectiveTitularRaw(row, original)

  if (row.excluirMesa) {
    warnings.push(createIssue({
      code: 'MESA_EXCLUDED_BY_REVIEW',
      message: 'La mesa fue marcada como excluida en la revision docente.',
      row,
    }))
  }

  if (row.fechaInvalida || row.nuevaFechaSugeridaInvalida) {
    warnings.push(createIssue({
      code: 'REVIEWED_DATE_INVALID',
      message: 'La fecha corregida no tiene formato ISO valido.',
      row,
      extra: { fecha: row.nuevaFechaSugeridaRaw || row.fechaRaw },
    }))
  } else if (effectiveFecha && allowedDates.size && !allowedDates.has(effectiveFecha)) {
    warnings.push(createIssue({
      code: 'REVIEWED_DATE_OUT_OF_PERIOD',
      message: 'La fecha corregida esta fuera del llamado configurado.',
      row,
      extra: { fecha: effectiveFecha },
    }))
  }

  if (!effectiveTitular) {
    warnings.push(createIssue({
      code: 'REVIEWED_MESA_WITHOUT_TITULAR',
      message: 'La mesa revisada no tiene titular.',
      row,
    }))
  } else if (docentes.length && !findReviewedDocente(docenteMap, effectiveTitular)) {
    warnings.push(createIssue({
      code: 'REVIEWED_TITULAR_NOT_FOUND',
      message: 'El titular corregido no existe en docentes.',
      row,
      extra: { titular: effectiveTitular },
    }))
  }

  if (Object.values(manualOverrides).some(Boolean)) {
    warnings.push(createIssue({
      code: 'MANUAL_OVERRIDES_DETECTED',
      message: 'La fila contiene cambios manuales detectados.',
      row,
      extra: { manualOverrides },
    }))
  }
}

export function validateReviewedDraftSchedule(input = {}) {
  const originalDraftSchedule = Array.isArray(input.originalDraftSchedule) ? input.originalDraftSchedule : []
  const reviewedRows = Array.isArray(input.reviewedRows) ? input.reviewedRows : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const config = resolveDraftExamCallConfig(input)
  const errors = []
  const warnings = []

  if (!Array.isArray(input.originalDraftSchedule)) {
    errors.push({
      code: 'INVALID_ORIGINAL_DRAFT_SCHEDULE',
      message: 'originalDraftSchedule debe ser un array.',
      severity: 'critical',
    })
  }

  if (!Array.isArray(input.reviewedRows)) {
    errors.push({
      code: 'INVALID_REVIEWED_ROWS',
      message: 'reviewedRows debe ser un array.',
      severity: 'critical',
    })
  }

  const normalizedRows = reviewedRows.map(normalizeReviewedDraftRow)
  const originalMap = buildDraftMesaMap(originalDraftSchedule)
  const docenteMap = buildDocenteReviewMap(docentes)
  const allowedDates = buildAllowedDateSet(config)
  const seenIds = new Set()

  normalizedRows.forEach((row) => {
    if (!row.draftMesaId) {
      warnings.push(createIssue({
        code: 'REVIEWED_ROW_WITHOUT_ID',
        message: 'La fila importada no tiene ID Mesa.',
        row,
      }))
      return
    }

    if (seenIds.has(row.draftMesaId)) {
      warnings.push(createIssue({
        code: 'DUPLICATED_DRAFT_MESA_ID',
        message: 'El ID Mesa aparece mas de una vez en la importacion.',
        row,
      }))
      return
    }
    seenIds.add(row.draftMesaId)

    const original = originalMap.get(row.draftMesaId)
    if (!original) {
      warnings.push(createIssue({
        code: 'UNKNOWN_DRAFT_MESA_ID',
        message: 'El ID Mesa no existe en el precronograma original.',
        row,
      }))
      return
    }

    pushMesaIssues({
      row,
      original,
      docentes,
      docenteMap,
      allowedDates,
      warnings,
    })
  })

  const finalErrors = dedupeIssues(errors)
  const finalWarnings = dedupeIssues(warnings)

  return {
    valid: finalErrors.length === 0,
    errors: finalErrors,
    warnings: finalWarnings,
    normalizedRows,
    summary: {
      totalOriginalMesas: originalDraftSchedule.length,
      totalReviewedRows: reviewedRows.length,
      totalRowsWithoutId: finalWarnings.filter((warning) => warning.code === 'REVIEWED_ROW_WITHOUT_ID').length,
      totalUnknownIds: finalWarnings.filter((warning) => warning.code === 'UNKNOWN_DRAFT_MESA_ID').length,
      totalDuplicatedIds: finalWarnings.filter((warning) => warning.code === 'DUPLICATED_DRAFT_MESA_ID').length,
      totalExcluded: normalizedRows.filter((row) => row.excluirMesa).length,
      totalConfirmed: normalizedRows.filter((row) => row.confirmada).length,
      totalWarnings: finalWarnings.length,
      totalErrors: finalErrors.length,
    },
  }
}
