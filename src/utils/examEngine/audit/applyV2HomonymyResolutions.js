const CONFIRMED_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])
const PLACEHOLDER_TOKENS = [
  'PENDIENTE',
  'REVISAR',
  'SUGERIDO',
  'SIN_CODIGO',
  'SIN CODIGO',
  'PLAN-ACTUAL',
]
const PENDING_OBSERVATION_TOKENS = ['pendiente', 'revisar', 'confirmar', 'duda']
const DEFAULT_HOMONYMY_OBSERVATION = 'Homonimia revisada y codigo confirmado institucionalmente.'

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

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeStatus(value) {
  return clean(value).toUpperCase()
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function hasAlternative(value) {
  return clean(value).includes('|')
}

function hasPlaceholder(value) {
  const text = clean(value).toUpperCase()
  const token = normalizeToken(value)
  return PLACEHOLDER_TOKENS.some((placeholder) => (
    text.includes(placeholder) || token.includes(normalizeToken(placeholder))
  ))
}

function observationLooksPending(value) {
  const normalized = normalizeText(value)
  return PENDING_OBSERVATION_TOKENS.some((token) => normalized.includes(token))
}

function buildBaseIndex(baseRows = []) {
  return asArray(baseRows).reduce((map, row) => {
    const reviewId = clean(row?.review_id)
    if (reviewId) map.set(reviewId, row)
    return map
  }, new Map())
}

function groupResolutionRows(rows = []) {
  return asArray(rows).reduce((map, row) => {
    const reviewId = clean(row?.review_id)
    if (!reviewId) return map
    const group = map.get(reviewId) ?? []
    group.push(row)
    map.set(reviewId, group)
    return map
  }, new Map())
}

function buildDuplicateResolutionRows(groupedRows = new Map()) {
  return [...groupedRows.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([reviewId, rows]) => ({
      review_id: reviewId,
      count: rows.length,
    }))
}

function resolutionIssues(row = {}) {
  const reasons = []
  const finalCode = clean(row.materia_codigo_final)
  const status = normalizeStatus(row.estado_revision)

  if (!finalCode) reasons.push('FALTA_MATERIA_CODIGO_FINAL')
  if (!status) reasons.push('FALTA_ESTADO_REVISION')
  if (status && !CONFIRMED_STATUSES.has(status)) reasons.push('ESTADO_NO_CONFIRMADO')
  if (finalCode && hasPlaceholder(finalCode)) reasons.push('MATERIA_CODIGO_FINAL_PLACEHOLDER')
  if (finalCode && hasAlternative(finalCode)) reasons.push('MATERIA_CODIGO_FINAL_CON_ALTERNATIVAS')
  if (observationLooksPending(row.observaciones_revision)) reasons.push('OBSERVACION_PENDIENTE')

  return unique(reasons)
}

function buildUnresolvedRow(row = {}, reasons = []) {
  return {
    ...row,
    homonymy_resolution_status: 'NO_RESUELTA',
    homonymy_resolution_reason: reasons.join('|') || 'HOMONIMIA_NO_RESUELTA',
  }
}

function buildUnmatchedRow(row = {}) {
  return {
    ...row,
    homonymy_resolution_status: 'NO_ENCONTRADA',
    homonymy_resolution_reason: 'REVIEW_ID_NO_ENCONTRADO_EN_BASE',
  }
}

function buildAppliedRow(baseRow = {}, resolutionRow = {}) {
  return {
    ...baseRow,
    materia_codigo_final: clean(resolutionRow.materia_codigo_final),
    estado_revision: normalizeStatus(resolutionRow.estado_revision),
    observaciones_revision: clean(resolutionRow.observaciones_revision) || DEFAULT_HOMONYMY_OBSERVATION,
  }
}

function duplicateFinalKeyGroups(rows = []) {
  const groups = asArray(rows).reduce((map, row) => {
    const planId = clean(row.plan_id_final)
    const finalCode = clean(row.materia_codigo_final)
    if (!planId || !finalCode) return map
    const key = `${normalizeToken(planId)}::${normalizeToken(finalCode)}`
    const group = map.get(key) ?? []
    group.push(row)
    map.set(key, group)
    return map
  }, new Map())

  return [...groups.entries()]
    .filter(([, rowsForKey]) => rowsForKey.length > 1)
    .map(([key, rowsForKey]) => ({
      key,
      affectedRows: rowsForKey.length,
      reviewIds: unique(rowsForKey.map((row) => row.review_id)),
      planId: clean(rowsForKey[0]?.plan_id_final),
      materiaCodigoFinal: clean(rowsForKey[0]?.materia_codigo_final),
    }))
}

function confirmedRowsWithoutCode(rows = []) {
  return asArray(rows)
    .filter((row) => CONFIRMED_STATUSES.has(normalizeStatus(row.estado_revision)) && !clean(row.materia_codigo_final))
    .map((row) => ({
      review_id: clean(row.review_id),
      carrera: clean(row.carrera),
      materia_nombre: clean(row.materia_nombre),
      rejection_reason: 'CONFIRMADO_SIN_MATERIA_CODIGO_FINAL',
    }))
}

function duplicateRowsAsRejected(duplicateKeys = []) {
  return duplicateKeys.flatMap((duplicate) => (
    duplicate.reviewIds.map((reviewId) => ({
      review_id: reviewId,
      rejection_reason: 'DUPLICATE_PLAN_ID_MATERIA_CODIGO_FINAL',
      duplicateKey: duplicate.key,
    }))
  ))
}

function buildSummary({
  baseRows,
  homonymyResolutionRows,
  appliedResolutions,
  unresolvedRows,
  rejectedRows,
  unmatchedRows,
  duplicateResolutionRows,
  duplicateFinalKeys,
}) {
  const readyForValidation = (
    duplicateResolutionRows.length === 0 &&
    unmatchedRows.length === 0 &&
    rejectedRows.length === 0 &&
    duplicateFinalKeys.length === 0
  )

  return {
    totalBaseRows: baseRows.length,
    totalHomonymyResolutionRows: homonymyResolutionRows.length,
    appliedResolutions,
    unresolvedRows: unresolvedRows.length,
    rejectedRows: rejectedRows.length,
    unmatchedRows: unmatchedRows.length,
    duplicateResolutionRows: duplicateResolutionRows.length,
    duplicateFinalKeys: duplicateFinalKeys.length,
    readyForValidation,
    readyForIdentityV2: false,
    readyForCompactFinalTableComparison: false,
    safeToReplaceLegacy: false,
    nextAction: unresolvedRows.length
      ? 'Completar homonimias no resueltas y volver a ejecutar el integrador.'
      : 'Ejecutar validador final de codigos v2 sobre la carpeta homonymies-applied.',
  }
}

export function applyV2HomonymyResolutions({
  baseRows,
  homonymyResolutionRows,
  options = {},
} = {}) {
  const safeBaseRows = cloneJson(asArray(baseRows))
  const safeResolutionRows = cloneJson(asArray(homonymyResolutionRows))
  const baseByReviewId = buildBaseIndex(safeBaseRows)
  const resolutionGroups = groupResolutionRows(safeResolutionRows)
  const duplicateResolutionRows = buildDuplicateResolutionRows(resolutionGroups)
  const duplicateResolutionIds = new Set(duplicateResolutionRows.map((row) => row.review_id))
  const updatedByReviewId = new Map()
  const unresolvedRows = []
  const unmatchedRows = []
  let appliedResolutions = 0

  safeResolutionRows.forEach((resolutionRow) => {
    const reviewId = clean(resolutionRow.review_id)

    if (!reviewId) {
      unresolvedRows.push(buildUnresolvedRow(resolutionRow, ['FALTA_REVIEW_ID']))
      return
    }

    if (duplicateResolutionIds.has(reviewId)) return

    const baseRow = baseByReviewId.get(reviewId)
    if (!baseRow) {
      unmatchedRows.push(buildUnmatchedRow(resolutionRow))
      return
    }

    const issues = resolutionIssues(resolutionRow)
    if (issues.length) {
      unresolvedRows.push(buildUnresolvedRow(resolutionRow, issues))
      return
    }

    updatedByReviewId.set(reviewId, buildAppliedRow(baseRow, resolutionRow))
    appliedResolutions += 1
  })

  const updatedRows = safeBaseRows.map((baseRow) => (
    updatedByReviewId.get(clean(baseRow.review_id)) ?? baseRow
  ))
  const duplicateFinalKeys = duplicateFinalKeyGroups(updatedRows)
  const rejectedRows = [
    ...confirmedRowsWithoutCode(updatedRows),
    ...duplicateRowsAsRejected(duplicateFinalKeys),
  ]
  const summary = buildSummary({
    baseRows: safeBaseRows,
    homonymyResolutionRows: safeResolutionRows,
    appliedResolutions,
    unresolvedRows,
    rejectedRows,
    unmatchedRows,
    duplicateResolutionRows,
    duplicateFinalKeys,
  })
  const warnings = [
    ...duplicateFinalKeys.map((duplicate) => ({
      code: 'DUPLICATE_PLAN_ID_MATERIA_CODIGO_FINAL',
      key: duplicate.key,
      affectedRows: duplicate.affectedRows,
      reviewIds: duplicate.reviewIds,
    })),
  ]

  return {
    updatedRows: options.includeRows === false ? [] : updatedRows,
    unresolvedRows: options.includeRows === false ? [] : unresolvedRows,
    rejectedRows: options.includeRows === false ? [] : rejectedRows,
    unmatchedRows: options.includeRows === false ? [] : unmatchedRows,
    duplicateResolutionRows,
    summary,
    warnings,
    errors: [],
  }
}
