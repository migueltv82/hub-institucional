const CONFIRMED_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])
const REJECTED_STATUSES = new Set(['RECHAZADO', 'REJECTED', 'NO_APROBADO'])
const PLACEHOLDER_TOKENS = [
  'PENDIENTE',
  'REVISAR',
  'SUGERIDO',
  'SIN_CODIGO',
  'SIN CODIGO',
  'PLAN-ACTUAL',
]
const PENDING_OBSERVATION_TOKENS = ['revisar', 'pendiente', 'confirmar', 'validar', 'corregir']

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
  const raw = clean(value).toUpperCase()
  if (['SI', 'TRUE', '1', 'YES'].includes(raw)) return 'VALIDADO'
  if (['NO', 'FALSE', '0'].includes(raw)) return ''
  return raw
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function isYes(value) {
  const token = normalizeToken(value)
  return token === 'si' || token === 'true' || token === '1' || token === 'yes'
}

function hasPlaceholder(value) {
  const text = clean(value).toUpperCase()
  const token = normalizeToken(value)
  return PLACEHOLDER_TOKENS.some((placeholder) => (
    text.includes(placeholder) || token.includes(normalizeToken(placeholder))
  ))
}

function hasAlternative(value) {
  return clean(value).includes('|')
}

function observationLooksPending(value) {
  const normalized = normalizeText(value)
  return PENDING_OBSERVATION_TOKENS.some((token) => normalized.includes(token))
}

function identityKey(row = {}) {
  return `${normalizeToken(row.planId)}::${normalizeToken(row.finalCode)}`
}

function subjectNameKey(row = {}) {
  return `${normalizeToken(row.planId)}::${normalizeToken(row.subjectName)}`
}

function resolvedRow(row = {}) {
  const status = normalizeStatus(row.estado_revision)
  const finalCode = clean(row.materia_codigo_final)
  const draftCode = clean(row.materia_codigo_borrador)
  const planId = clean(row.plan_id_final)
  const subjectName = clean(row.materia_nombre)
  const homonymyRisk = isYes(row.riesgo_homonimia) || isYes(row.riesgo_nombre_duplicado)

  return {
    original: row,
    reviewId: clean(row.review_id),
    carrera: clean(row.carrera),
    carreraId: clean(row.carrera_id_final),
    planId,
    anio: clean(row.anio),
    subjectName,
    suggestedCode: clean(row.materia_codigo_sugerido),
    draftCode,
    finalCode,
    status,
    confirmed: CONFIRMED_STATUSES.has(status),
    rejected: REJECTED_STATUSES.has(status),
    homonymyRisk,
    riskCodeDuplicate: isYes(row.riesgo_codigo_duplicado),
    motive: clean(row.motivo_revision),
    requiredAction: clean(row.accion_requerida),
    observations: clean(row.observaciones_revision),
  }
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

function duplicateItem(type, key, rows, recommendation) {
  return {
    type,
    key,
    affectedRows: rows.length,
    materias: unique(rows.map((row) => row.subjectName)),
    reviewIds: unique(rows.map((row) => row.reviewId)),
    plans: unique(rows.map((row) => row.planId)),
    codes: unique(rows.map((row) => row.finalCode)),
    recommendation,
  }
}

function buildDuplicateKeys(rows = []) {
  const rowsWithFinalCode = rows.filter((row) => row.planId && row.finalCode)
  const duplicateKeys = []

  groupRows(rowsWithFinalCode, identityKey).forEach((group, key) => {
    const differentSubjects = unique(group.map((row) => normalizeText(row.subjectName))).length > 1
    if (!differentSubjects) return
    duplicateKeys.push(duplicateItem(
      'DUPLICATE_PLAN_ID_MATERIA_CODIGO_FINAL',
      key,
      group,
      'Asignar un materia_codigo_final unico para cada materia dentro del plan.',
    ))
  })

  groupRows(rowsWithFinalCode, subjectNameKey).forEach((group, key) => {
    const distinctCodes = unique(group.map((row) => normalizeToken(row.finalCode))).length
    if (distinctCodes <= 1) return
    duplicateKeys.push(duplicateItem(
      'SAME_SUBJECT_DIFFERENT_FINAL_CODE_IN_PLAN',
      key,
      group,
      'Confirmar si son materias distintas u homonimias antes de aplicar identidad v2.',
    ))
  })

  return duplicateKeys
}

function duplicateReasonsFor(row = {}, duplicateKeys = []) {
  return duplicateKeys
    .filter((duplicate) => (
      duplicate.reviewIds.includes(row.reviewId) &&
      duplicate.type === 'DUPLICATE_PLAN_ID_MATERIA_CODIGO_FINAL'
    ))
    .map((duplicate) => duplicate.type)
}

function validationIssue(row = {}, code, severity = 'warning') {
  return {
    code,
    severity,
    review_id: row.reviewId,
    carrera: row.carrera,
    materia_nombre: row.subjectName,
  }
}

function validateRow(row = {}, duplicateKeys = []) {
  const pendingReasons = []
  const rejectReasons = []

  if (row.rejected) rejectReasons.push('ESTADO_RECHAZADO')
  if (!row.planId && row.finalCode) rejectReasons.push('PLAN_ID_FINAL_VACIO_CON_CODIGO_FINAL')
  if (row.confirmed && !row.finalCode) rejectReasons.push('CONFIRMADO_SIN_MATERIA_CODIGO_FINAL')
  if (row.finalCode && hasAlternative(row.finalCode)) rejectReasons.push('MATERIA_CODIGO_FINAL_CON_ALTERNATIVAS')
  if (row.finalCode && hasPlaceholder(row.finalCode)) rejectReasons.push('MATERIA_CODIGO_FINAL_PLACEHOLDER')
  duplicateReasonsFor(row, duplicateKeys).forEach((reason) => rejectReasons.push(reason))

  if (!row.planId) pendingReasons.push('FALTA_PLAN_ID_FINAL')
  if (!row.finalCode) pendingReasons.push('FALTA_MATERIA_CODIGO_FINAL')
  if (!row.status) pendingReasons.push('FALTA_ESTADO_REVISION')
  if (row.status && !row.confirmed && !row.rejected) pendingReasons.push('ESTADO_NO_CONFIRMADO')
  if (row.draftCode && !row.finalCode) pendingReasons.push('SOLO_MATERIA_CODIGO_BORRADOR')
  if (row.homonymyRisk && !row.confirmed) pendingReasons.push('HOMONIMIA_REQUIERE_CONFIRMACION')
  if (observationLooksPending(row.observations)) pendingReasons.push('OBSERVACION_PENDIENTE')
  if (!row.finalCode && hasPlaceholder(row.draftCode)) pendingReasons.push('MATERIA_CODIGO_BORRADOR_PLACEHOLDER')

  return {
    pendingReasons: unique(pendingReasons),
    rejectReasons: unique(rejectReasons),
  }
}

function correctedOutputRow(row = {}) {
  return {
    review_id: row.reviewId,
    carrera: row.carrera,
    carrera_id_final: row.carreraId,
    plan_id_final: row.planId,
    anio: row.anio,
    materia_nombre: row.subjectName,
    materia_codigo_final: row.finalCode,
    identity_v2_key: `${row.planId}::${row.finalCode}`,
    estado_revision: row.status,
    observaciones_revision: row.observations,
  }
}

function pendingOutputRow(row = {}, reasons = []) {
  return {
    ...row.original,
    pendiente_motivo: reasons.join('|') || 'PENDIENTE_CODIGO',
  }
}

function rejectedOutputRow(row = {}, reasons = []) {
  return {
    ...row.original,
    rechazo_motivo: reasons.join('|') || 'RECHAZADO',
  }
}

function buildNameCodeWarnings(rows = []) {
  const rowsWithFinalCode = rows.filter((row) => row.planId && row.finalCode)

  return [...groupRows(rowsWithFinalCode, subjectNameKey).entries()]
    .filter(([, group]) => unique(group.map((row) => normalizeToken(row.finalCode))).length > 1)
    .map(([key, group]) => ({
      type: 'SAME_NORMALIZED_SUBJECT_NAME_DIFFERENT_CODE_IN_PLAN',
      key,
      affectedRows: group.length,
      materias: unique(group.map((row) => row.subjectName)),
      reviewIds: unique(group.map((row) => row.reviewId)),
      plans: unique(group.map((row) => row.planId)),
      codes: unique(group.map((row) => row.finalCode)),
      recommendation: 'Revisar homonimia antes de aplicar identidad v2.',
    }))
}

function buildSummary({
  totalReviewRows,
  correctedRows,
  pendingRows,
  rejectedRows,
  duplicateKeys,
  validationIssues,
}) {
  const countRowsWithIssues = (codes = []) => new Set(
    validationIssues
      .filter((issue) => codes.includes(issue.code))
      .map((issue) => issue.review_id),
  ).size
  const readyForIdentityV2 = (
    totalReviewRows > 0 &&
    correctedRows.length === totalReviewRows &&
    pendingRows.length === 0 &&
    rejectedRows.length === 0 &&
    duplicateKeys.length === 0
  )

  return {
    totalReviewRows,
    correctedRows: correctedRows.length,
    pendingRows: pendingRows.length,
    rejectedRows: rejectedRows.length,
    duplicateKeyCount: duplicateKeys.length,
    missingFinalCode: countRowsWithIssues([
      'FALTA_MATERIA_CODIGO_FINAL',
      'CONFIRMADO_SIN_MATERIA_CODIGO_FINAL',
    ]),
    unconfirmedRows: countRowsWithIssues([
      'FALTA_ESTADO_REVISION',
      'ESTADO_NO_CONFIRMADO',
      'SOLO_MATERIA_CODIGO_BORRADOR',
    ]),
    placeholderRows: countRowsWithIssues([
      'MATERIA_CODIGO_FINAL_PLACEHOLDER',
      'MATERIA_CODIGO_BORRADOR_PLACEHOLDER',
    ]),
    homonymyRiskRows: countRowsWithIssues(['HOMONIMIA_REQUIERE_CONFIRMACION']),
    readyForIdentityV2,
    readyForCompactFinalTableComparison: readyForIdentityV2,
    safeToReplaceLegacy: false,
    nextAction: readyForIdentityV2
      ? 'Ejecutar validacion de identidad v2 y comparacion compactada antes de cualquier reemplazo.'
      : 'Completar materia_codigo_final y confirmar institucionalmente todas las filas pendientes o rechazadas.',
  }
}

function buildRecommendations(summary = {}) {
  const recommendations = []
  if (summary.pendingRows > 0) {
    recommendations.push('Completar materia_codigo_final y estado_revision confirmado en las filas pendientes.')
  }
  if (summary.rejectedRows > 0) {
    recommendations.push('Corregir filas rechazadas antes de aplicar identidad v2.')
  }
  if (summary.duplicateKeyCount > 0) {
    recommendations.push('Resolver duplicados de plan_id_final + materia_codigo_final.')
  }
  if (summary.homonymyRiskRows > 0) {
    recommendations.push('Resolver homonimias antes de confirmar codigos finales.')
  }
  return recommendations.length ? recommendations : ['Continuar con validacion de identidad v2 y comparacion final compactada.']
}

export function applyV2SubjectCodeReview({
  codeReviewRows,
  options = {},
} = {}) {
  const safeRows = cloneJson(asArray(codeReviewRows))
  const resolvedRows = safeRows.map(resolvedRow)
  const duplicateKeys = buildDuplicateKeys(resolvedRows)
  const nameCodeWarnings = buildNameCodeWarnings(resolvedRows)
  const allDuplicateKeys = [
    ...duplicateKeys,
    ...nameCodeWarnings,
  ]
  const correctedRows = []
  const pendingRows = []
  const rejectedRows = []
  const validationIssues = []

  resolvedRows.forEach((row) => {
    const validation = validateRow(row, duplicateKeys)

    validation.rejectReasons.forEach((code) => validationIssues.push(validationIssue(row, code, 'error')))
    validation.pendingReasons.forEach((code) => validationIssues.push(validationIssue(row, code, 'warning')))

    if (validation.rejectReasons.length) {
      rejectedRows.push(rejectedOutputRow(row, validation.rejectReasons))
      return
    }

    if (validation.pendingReasons.length || !row.confirmed) {
      pendingRows.push(pendingOutputRow(row, validation.pendingReasons))
      return
    }

    correctedRows.push(correctedOutputRow(row))
  })

  const summary = buildSummary({
    totalReviewRows: safeRows.length,
    correctedRows,
    pendingRows,
    rejectedRows,
    duplicateKeys: allDuplicateKeys,
    validationIssues,
  })

  return {
    correctedRows: options.includeRows === false ? [] : correctedRows,
    pendingRows: options.includeRows === false ? [] : pendingRows,
    rejectedRows: options.includeRows === false ? [] : rejectedRows,
    duplicateKeys: allDuplicateKeys,
    validationIssues,
    summary,
    recommendations: buildRecommendations(summary),
    warnings: [],
    errors: [],
  }
}
