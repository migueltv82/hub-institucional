const CONFIRMED_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])
const PLACEHOLDER_TOKENS = [
  'PENDIENTE',
  'REVISAR',
  'SUGERIDO',
  'SIN_CODIGO',
  'SIN CODIGO',
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

function normalizeCareerId(value) {
  return clean(value).toUpperCase()
}

function isYes(value) {
  const token = normalizeToken(value)
  return token === 'si' || token === 'true' || token === '1' || token === 'yes'
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

function joinedMotives(row = {}) {
  return [
    row.motivo_revision,
    row.pendiente_motivo,
    row.accion_requerida,
  ].map(clean).filter(Boolean).join('|')
}

function isHomonymyRisk(row = {}) {
  const motive = joinedMotives(row).toUpperCase()
  return (
    isYes(row.riesgo_nombre_duplicado) ||
    motive.includes('DUPLICATE_SUBJECT_NAME') ||
    motive.includes('HOMONIMIA')
  )
}

function isConfirmedCode(row = {}) {
  return Boolean(
    clean(row.materia_codigo_final) &&
    CONFIRMED_STATUSES.has(normalizeStatus(row.estado_revision))
  )
}

function groupRows(rows = [], keyBuilder) {
  return rows.reduce((map, row) => {
    const key = keyBuilder(row)
    if (!key) return map
    const group = map.get(key) ?? []
    group.push(row)
    map.set(key, group)
    return map
  }, new Map())
}

function duplicateKeys(rows = [], keyBuilder) {
  return new Set(
    [...groupRows(rows, keyBuilder).entries()]
      .filter(([, group]) => group.length > 1)
      .map(([key]) => key),
  )
}

function duplicateGroupItems(rows = [], keyBuilder, type) {
  return [...groupRows(rows, keyBuilder).entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      type,
      key,
      affectedRows: group.length,
      reviewIds: unique(group.map((row) => row.review_id)),
      plans: unique(group.map((row) => row.plan_id_final)),
      careers: unique(group.map((row) => row.carrera_id_final)),
      codes: unique(group.map((row) => row.materia_codigo_borrador || row.materia_codigo_final)),
    }))
}

function crossPlanCodeWarnings(rows = []) {
  return [...groupRows(
    rows.filter((row) => row.materia_codigo_borrador || row.materia_codigo_final),
    (row) => normalizeToken(row.materia_codigo_borrador || row.materia_codigo_final),
  ).entries()]
    .filter(([, group]) => unique(group.map((row) => row.plan_id_final)).length > 1)
    .map(([key, group]) => ({
      code: 'CODIGO_USADO_EN_DISTINTOS_PLANES',
      key,
      affectedRows: group.length,
      plans: unique(group.map((row) => row.plan_id_final)),
      careers: unique(group.map((row) => row.carrera_id_final)),
    }))
}

function baseReviewRow(row = {}) {
  const finalCode = clean(row.materia_codigo_final)
  const suggestedCode = clean(row.materia_codigo_sugerido)
  const status = isConfirmedCode(row) ? normalizeStatus(row.estado_revision) : 'PENDIENTE_CODIGO'

  return {
    review_id: clean(row.review_id),
    carrera: clean(row.carrera),
    carrera_id_final: normalizeCareerId(row.carrera_id_final || row.carrera_id_sugerido),
    plan_id_final: clean(row.plan_id_final),
    anio: clean(row.anio),
    materia_nombre: clean(row.materia_nombre),
    materia_codigo_sugerido: suggestedCode,
    materia_codigo_borrador: suggestedCode,
    materia_codigo_final: finalCode,
    estado_revision: status,
    riesgo_nombre_duplicado: isYes(row.riesgo_nombre_duplicado) ? 'SI' : 'NO',
    riesgo_codigo_duplicado: 'NO',
    riesgo_homonimia: isHomonymyRisk(row) ? 'SI' : 'NO',
    prioridad_revision: 'MEDIA',
    motivo_revision: clean(row.motivo_revision),
    accion_requerida: 'CONFIRMAR_MATERIA_CODIGO_FINAL',
    observaciones_revision: clean(row.observaciones_revision),
  }
}

function buildReviewContext(rows = []) {
  const rowsWithDraftCode = rows.filter((row) => clean(row.materia_codigo_borrador))
  const rowsWithFinalCode = rows.filter((row) => clean(row.materia_codigo_final))

  return {
    duplicateDraftKeys: duplicateKeys(
      rowsWithDraftCode,
      (row) => `${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_codigo_borrador)}`,
    ),
    duplicateFinalKeys: duplicateKeys(
      rowsWithFinalCode,
      (row) => `${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_codigo_final)}`,
    ),
    duplicateNameKeys: duplicateKeys(
      rows,
      (row) => `${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_nombre)}`,
    ),
  }
}

function riskReasons(row = {}, context = {}) {
  const reasons = []
  const draftKey = `${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_codigo_borrador)}`
  const finalKey = `${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_codigo_final)}`
  const nameKey = `${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_nombre)}`

  if (row.riesgo_homonimia === 'SI') reasons.push('RIESGO_HOMONIMIA')
  if (row.riesgo_nombre_duplicado === 'SI') reasons.push('RIESGO_NOMBRE_DUPLICADO')
  if (!clean(row.plan_id_final)) reasons.push('FALTA_PLAN_ID_FINAL')
  if (!clean(row.materia_codigo_sugerido)) reasons.push('FALTA_MATERIA_CODIGO_SUGERIDO')
  if (hasAlternative(row.materia_codigo_sugerido)) reasons.push('CODIGO_SUGERIDO_CON_ALTERNATIVAS')
  if (hasPlaceholder(row.materia_codigo_sugerido)) reasons.push('CODIGO_SUGERIDO_PLACEHOLDER')
  if (clean(row.materia_codigo_borrador) && context.duplicateDraftKeys.has(draftKey)) {
    reasons.push('CODIGO_BORRADOR_DUPLICADO_EN_PLAN')
  }
  if (clean(row.materia_codigo_final) && context.duplicateFinalKeys.has(finalKey)) {
    reasons.push('CODIGO_FINAL_DUPLICADO_EN_PLAN')
  }
  if (clean(row.materia_nombre) && context.duplicateNameKeys.has(nameKey)) {
    reasons.push('NOMBRE_DUPLICADO_EN_PLAN')
  }

  return unique(reasons)
}

function enrichReviewRow(row = {}, context = {}) {
  const reasons = riskReasons(row, context)
  const confirmed = isConfirmedCode(row)
  const codigoDuplicado = reasons.some((reason) => [
    'CODIGO_BORRADOR_DUPLICADO_EN_PLAN',
    'CODIGO_FINAL_DUPLICADO_EN_PLAN',
  ].includes(reason))

  return {
    ...row,
    riesgo_codigo_duplicado: codigoDuplicado ? 'SI' : 'NO',
    prioridad_revision: reasons.length ? 'ALTA' : (confirmed ? 'BAJA' : 'MEDIA'),
    motivo_revision: unique([row.motivo_revision, ...reasons]).join('|'),
    accion_requerida: confirmed ? 'VERIFICAR_CODIGO_FINAL_EXISTENTE' : 'COMPLETAR_Y_CONFIRMAR_MATERIA_CODIGO_FINAL',
  }
}

function groupByField(rows = [], field, fallback = 'UNKNOWN') {
  return rows.reduce((groups, row) => {
    const key = clean(row[field]) || fallback
    const group = groups[key] ?? []
    group.push(row)
    groups[key] = group
    return groups
  }, {})
}

function buildSummary({
  reviewRows,
  duplicateDraftRows,
  duplicateFinalRows,
}) {
  const subjectsWithFinalCode = reviewRows.filter((row) => clean(row.materia_codigo_final)).length
  const subjectsMissingFinalCode = reviewRows.length - subjectsWithFinalCode
  const allCodesConfirmed = reviewRows.length > 0 && reviewRows.every(isConfirmedCode)
  const readyForCodeApply = (
    allCodesConfirmed &&
    duplicateFinalRows.length === 0 &&
    subjectsMissingFinalCode === 0
  )

  return {
    totalSubjects: reviewRows.length,
    subjectsWithPlanId: reviewRows.filter((row) => clean(row.plan_id_final)).length,
    subjectsMissingPlanId: reviewRows.filter((row) => !clean(row.plan_id_final)).length,
    subjectsWithFinalCode,
    subjectsMissingFinalCode,
    subjectsWithDraftCode: reviewRows.filter((row) => clean(row.materia_codigo_borrador)).length,
    highPriorityRows: reviewRows.filter((row) => row.prioridad_revision === 'ALTA').length,
    homonymyRows: reviewRows.filter((row) => row.riesgo_homonimia === 'SI').length,
    duplicateDraftCodeRisks: duplicateDraftRows.length,
    duplicateFinalCodeRisks: duplicateFinalRows.length,
    readyForCodeApply,
    readyForCompactFinalTableComparison: false,
    safeToReplaceLegacy: false,
    nextAction: readyForCodeApply
      ? 'Mergear/aplicar la revision de codigos y validar identidad v2 antes de comparar tablas finales.'
      : 'Completar materia_codigo_final y confirmar institucionalmente las filas pendientes, priorizando homonimias y duplicados.',
  }
}

function buildRecommendations(summary = {}) {
  const recommendations = []
  if (summary.homonymyRows > 0) {
    recommendations.push('Revisar primero las homonimias antes de confirmar codigos finales.')
  }
  if (summary.duplicateDraftCodeRisks > 0 || summary.duplicateFinalCodeRisks > 0) {
    recommendations.push('Resolver codigos duplicados dentro del mismo plan antes de aplicar la revision.')
  }
  if (summary.subjectsMissingFinalCode > 0) {
    recommendations.push('Completar materia_codigo_final y cambiar estado_revision a CONFIRMADO solo tras validacion institucional.')
  }
  return recommendations.length ? recommendations : ['Mergear/aplicar la revision de codigos y validar identidad v2.']
}

export function buildV2SubjectCodeReview({
  subjectRows,
  options = {},
} = {}) {
  const safeRows = cloneJson(asArray(subjectRows))
  const baseRows = safeRows.map(baseReviewRow)
  const context = buildReviewContext(baseRows)
  const reviewRows = baseRows.map((row) => enrichReviewRow(row, context))
  const duplicateDraftRows = reviewRows.filter((row) => (
    clean(row.materia_codigo_borrador) &&
    context.duplicateDraftKeys.has(`${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_codigo_borrador)}`)
  ))
  const duplicateFinalRows = reviewRows.filter((row) => (
    clean(row.materia_codigo_final) &&
    context.duplicateFinalKeys.has(`${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_codigo_final)}`)
  ))
  const duplicateNameRows = reviewRows.filter((row) => (
    clean(row.materia_nombre) &&
    context.duplicateNameKeys.has(`${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_nombre)}`)
  ))
  const duplicateRiskRows = [...new Map(
    [...duplicateDraftRows, ...duplicateFinalRows, ...duplicateNameRows]
      .map((row) => [row.review_id, row]),
  ).values()]
  const summary = buildSummary({
    reviewRows,
    duplicateDraftRows,
    duplicateFinalRows,
  })
  const warnings = crossPlanCodeWarnings(reviewRows)

  return {
    reviewRows: options.includeRows === false ? [] : reviewRows,
    rowsByCareer: options.includeRows === false ? {} : groupByField(reviewRows, 'carrera_id_final'),
    rowsByPlan: options.includeRows === false ? {} : groupByField(reviewRows, 'plan_id_final'),
    priorityRows: options.includeRows === false ? [] : reviewRows.filter((row) => row.prioridad_revision === 'ALTA'),
    duplicateRiskRows: options.includeRows === false ? [] : duplicateRiskRows,
    homonymyRows: options.includeRows === false ? [] : reviewRows.filter((row) => row.riesgo_homonimia === 'SI'),
    summary,
    recommendations: buildRecommendations(summary),
    warnings,
    errors: [],
    duplicateGroups: options.includeRows === false ? [] : [
      ...duplicateGroupItems(
        reviewRows.filter((row) => clean(row.materia_codigo_borrador)),
        (row) => `${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_codigo_borrador)}`,
        'DUPLICATE_DRAFT_CODE_IN_PLAN',
      ),
      ...duplicateGroupItems(
        reviewRows.filter((row) => clean(row.materia_codigo_final)),
        (row) => `${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_codigo_final)}`,
        'DUPLICATE_FINAL_CODE_IN_PLAN',
      ),
      ...duplicateGroupItems(
        reviewRows,
        (row) => `${normalizeToken(row.plan_id_final)}::${normalizeToken(row.materia_nombre)}`,
        'DUPLICATE_SUBJECT_NAME_IN_PLAN',
      ),
    ],
  }
}
