const CONFIRMED_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])
const REJECTED_STATUSES = new Set(['RECHAZADO', 'REJECTED', 'NO_APROBADO'])
const PLACEHOLDER_TOKENS = [
  'PLAN-ACTUAL',
  'SUGERIDO',
  'PENDIENTE',
  'REVISAR',
  'SIN_CODIGO',
  'SIN CODIGO',
]
const OBSERVATION_PENDING_TOKENS = ['revisar', 'pendiente', 'confirmar', 'validar']

const FIELD_ALIASES = Object.freeze({
  carreraIdFinal: ['carrera_id_final', 'carrera_id_confirmado'],
  planIdFinal: ['plan_id_final', 'plan_id_confirmado'],
  materiaCodigoFinal: ['materia_codigo_final', 'materia_codigo_confirmado'],
  estadoRevision: ['estado_revision', 'revision_status', 'estado', 'validado'],
  observacionesRevision: ['observaciones_revision'],
})

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

function normalizeFieldName(value) {
  return normalizeToken(value)
}

function normalizeStatus(value) {
  const raw = clean(value).toUpperCase()
  if (['SI', 'TRUE', '1', 'YES'].includes(raw)) return 'VALIDADO'
  if (['NO', 'FALSE', '0'].includes(raw)) return ''
  return raw
}

function readField(row = {}, aliasKey) {
  if (!row || typeof row !== 'object') return ''
  const aliases = FIELD_ALIASES[aliasKey] ?? [aliasKey]

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && clean(row[alias])) return clean(row[alias])
  }

  const wanted = new Set(aliases.map(normalizeFieldName))
  const entry = Object.entries(row).find(([field, value]) => wanted.has(normalizeFieldName(field)) && clean(value))
  return clean(entry?.[1])
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function hasAlternative(value) {
  return clean(value).includes('|')
}

function hasPlaceholder(value) {
  const upper = clean(value).toUpperCase()
  return PLACEHOLDER_TOKENS.some((token) => upper.includes(token))
}

function observationLooksPending(value) {
  const normalized = normalizeText(value)
  return OBSERVATION_PENDING_TOKENS.some((token) => normalized.includes(token))
}

function isYes(value) {
  return normalizeToken(value) === 'si' || normalizeToken(value) === 'true' || normalizeToken(value) === '1'
}

function getFinalValue(row = {}, finalKey, suggestedKey, confirmed) {
  const explicit = readField(row, finalKey)
  if (explicit) return explicit
  return confirmed ? clean(row[suggestedKey]) : ''
}

function buildResolvedRow(row = {}) {
  const status = normalizeStatus(readField(row, 'estadoRevision'))
  const confirmed = CONFIRMED_STATUSES.has(status)
  const rejected = REJECTED_STATUSES.has(status)
  const carreraId = getFinalValue(row, 'carreraIdFinal', 'carrera_id_sugerido', confirmed)
  const planId = getFinalValue(row, 'planIdFinal', 'plan_id_sugerido', confirmed)
  const materiaCodigo = getFinalValue(row, 'materiaCodigoFinal', 'materia_codigo_sugerido', confirmed)

  return {
    original: row,
    status,
    confirmed,
    rejected,
    carreraId,
    planId,
    materiaCodigo,
    key: `${normalizeToken(planId)}::${normalizeToken(materiaCodigo)}`,
    materiaNombre: clean(row.materia_nombre),
    carrera: clean(row.carrera),
    reviewId: clean(row.review_id),
    observaciones: readField(row, 'observacionesRevision'),
  }
}

function validateResolvedRow(resolved = {}) {
  const reasons = []
  const rejectReasons = []

  if (resolved.rejected) rejectReasons.push('ESTADO_RECHAZADO')
  if (!resolved.status) reasons.push('FALTA_ESTADO_REVISION')
  if (!resolved.confirmed && !resolved.rejected) reasons.push('ESTADO_NO_CONFIRMADO')
  if (!resolved.carreraId) reasons.push('FALTA_CARRERA_ID_FINAL')
  if (!resolved.planId) reasons.push('FALTA_PLAN_ID_FINAL')
  if (!resolved.materiaCodigo) reasons.push('FALTA_MATERIA_CODIGO_FINAL')

  if (resolved.confirmed && !resolved.planId) rejectReasons.push('PLAN_VACIO_CONFIRMADO')
  if (resolved.confirmed && !resolved.materiaCodigo) rejectReasons.push('CODIGO_VACIO_CONFIRMADO')

  if (hasAlternative(resolved.planId) || hasAlternative(resolved.materiaCodigo)) {
    reasons.push('CONTIENE_ALTERNATIVAS')
  }
  if ([resolved.carreraId, resolved.planId, resolved.materiaCodigo].some(hasPlaceholder)) {
    reasons.push('CONTIENE_PLACEHOLDER')
  }
  if (observationLooksPending(resolved.observaciones)) {
    reasons.push('OBSERVACION_PENDIENTE')
  }
  if (isYes(resolved.original.riesgo_nombre_duplicado) && !resolved.confirmed) {
    reasons.push('HOMONIMIA_REQUIERE_REVISION')
  }
  if (clean(resolved.original.keyType).toUpperCase() === 'WEAK_KEY' && !resolved.confirmed) {
    reasons.push('CLAVE_DEBIL_SIN_CONFIRMAR')
  }

  return {
    pendingReasons: unique(reasons),
    rejectReasons: unique(rejectReasons),
  }
}

function correctedOutputRow(resolved = {}) {
  return {
    review_id: resolved.reviewId,
    carrera: resolved.carrera,
    carrera_id: resolved.carreraId,
    plan_id: resolved.planId,
    materia_codigo: resolved.materiaCodigo,
    materia_nombre: resolved.materiaNombre,
    materia_key_anterior: clean(resolved.original.materia_key_actual),
    estado_revision: resolved.status,
    observaciones_revision: resolved.observaciones,
  }
}

function issueFor(resolved = {}, code, severity = 'warning') {
  return {
    code,
    severity,
    review_id: resolved.reviewId,
    carrera: resolved.carrera,
    materia_nombre: resolved.materiaNombre,
  }
}

function buildDuplicateItems(resolvedRows = []) {
  const confirmedRows = resolvedRows.filter((item) => item.confirmed && item.planId && item.materiaCodigo)
  const groups = []
  const addGroups = (type, keyBuilder, differs) => {
    const map = confirmedRows.reduce((acc, item) => {
      const key = keyBuilder(item)
      if (!key) return acc
      const rows = acc.get(key) ?? []
      rows.push(item)
      acc.set(key, rows)
      return acc
    }, new Map())

    map.forEach((rows, key) => {
      if (rows.length <= 1) return
      if (differs && !differs(rows)) return
      groups.push({
        type,
        key,
        affectedRows: rows.length,
        materias: unique(rows.map((row) => row.materiaNombre)),
        carreras: unique(rows.map((row) => row.carrera)),
        reviewIds: unique(rows.map((row) => row.reviewId)),
        recommendation: 'Revisar identidad v2: plan_id + materia_codigo debe ser unico y estable.',
      })
    })
  }

  addGroups(
    'DUPLICATE_PLAN_MATERIA_CODIGO',
    (row) => `${row.planId}::${row.materiaCodigo}`,
    null,
  )
  addGroups(
    'SAME_CODE_DIFFERENT_SUBJECT_NAME_IN_PLAN',
    (row) => `${row.planId}::${row.materiaCodigo}`,
    (rows) => unique(rows.map((row) => normalizeText(row.materiaNombre))).length > 1,
  )
  addGroups(
    'SAME_SUBJECT_NAME_DIFFERENT_CODE_IN_PLAN',
    (row) => `${row.planId}::${normalizeToken(row.materiaNombre)}`,
    (rows) => unique(rows.map((row) => row.materiaCodigo)).length > 1,
  )
  addGroups(
    'SAME_CODE_USED_IN_DIFFERENT_CAREERS',
    (row) => row.materiaCodigo,
    (rows) => unique(rows.map((row) => normalizeText(row.carrera))).length > 1,
  )

  return groups
}

function duplicateRejectReasons(resolved = {}, duplicateKeys = []) {
  return duplicateKeys
    .filter((duplicate) => duplicate.reviewIds.includes(resolved.reviewId))
    .map((duplicate) => duplicate.type)
}

function buildSummary({
  totalReviewRows,
  correctedRows,
  pendingRows,
  rejectedRows,
  duplicateKeys,
  validationIssues,
}) {
  const rowCountWithCodes = (codes = []) => new Set(
    validationIssues
      .filter((issue) => codes.includes(issue.code))
      .map((issue) => issue.review_id),
  ).size
  const readyForCompactFinalTableComparison = (
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
    missingCarreraId: rowCountWithCodes(['FALTA_CARRERA_ID_FINAL']),
    missingPlanId: rowCountWithCodes(['FALTA_PLAN_ID_FINAL', 'PLAN_VACIO_CONFIRMADO']),
    missingMateriaCodigo: rowCountWithCodes(['FALTA_MATERIA_CODIGO_FINAL', 'CODIGO_VACIO_CONFIRMADO']),
    unconfirmedRows: rowCountWithCodes(['FALTA_ESTADO_REVISION', 'ESTADO_NO_CONFIRMADO']),
    placeholderRows: rowCountWithCodes(['CONTIENE_PLACEHOLDER']),
    homonymyRiskRows: rowCountWithCodes(['HOMONIMIA_REQUIERE_REVISION']),
    readyForCompactFinalTableComparison,
    safeToReplaceLegacy: false,
    nextAction: readyForCompactFinalTableComparison
      ? 'Reejecutar equivalencia de universo con identidad v2 corregida antes de cualquier reemplazo.'
      : 'Completar revision institucional de identidad v2 y resolver pendientes/duplicados.',
  }
}

function buildRecommendations(summary = {}) {
  const recommendations = []
  if (summary.pendingRows > 0) {
    recommendations.push('Completar estado_revision y campos finales oficiales para filas pendientes.')
  }
  if (summary.rejectedRows > 0) {
    recommendations.push('Corregir filas rechazadas antes de generar identidad v2 completa.')
  }
  if (summary.duplicateKeyCount > 0) {
    recommendations.push('Resolver duplicados de plan_id + materia_codigo antes de comparar compactacion.')
  }
  if (!summary.readyForCompactFinalTableComparison) {
    recommendations.push('No correr comparacion final compactada hasta que las 134 materias esten confirmadas sin duplicados.')
  }
  return recommendations.length ? recommendations : ['Reejecutar auditorias de equivalencia con la identidad v2 corregida.']
}

export function applyV2SubjectIdentityReview({ reviewRows, snapshot, options = {} } = {}) {
  const safeRows = cloneJson(asArray(reviewRows))
  const resolvedRows = safeRows.map(buildResolvedRow)
  const duplicateKeys = buildDuplicateItems(resolvedRows)
  const correctedRows = []
  const pendingRows = []
  const rejectedRows = []
  const validationIssues = []

  resolvedRows.forEach((resolved) => {
    const validation = validateResolvedRow(resolved)
    const duplicateReasons = duplicateRejectReasons(resolved, duplicateKeys)
    const rejectReasons = unique([...validation.rejectReasons, ...duplicateReasons])

    rejectReasons.forEach((code) => validationIssues.push(issueFor(resolved, code, 'error')))
    validation.pendingReasons.forEach((code) => validationIssues.push(issueFor(resolved, code, 'warning')))

    if (rejectReasons.length) {
      rejectedRows.push({
        ...resolved.original,
        rechazo_motivo: rejectReasons.join('|'),
      })
      return
    }

    if (validation.pendingReasons.length || !resolved.confirmed) {
      pendingRows.push({
        ...resolved.original,
        pendiente_motivo: validation.pendingReasons.join('|') || 'ESTADO_NO_CONFIRMADO',
      })
      return
    }

    correctedRows.push(correctedOutputRow(resolved))
  })

  const summary = buildSummary({
    totalReviewRows: safeRows.length,
    correctedRows,
    pendingRows,
    rejectedRows,
    duplicateKeys,
    validationIssues,
  })

  return {
    correctedRows: options.includeRows === false ? [] : correctedRows,
    pendingRows: options.includeRows === false ? [] : pendingRows,
    rejectedRows: options.includeRows === false ? [] : rejectedRows,
    duplicateKeys,
    validationIssues,
    summary: {
      ...summary,
      sourceCounts: {
        reviewRows: safeRows.length,
        planesEstudio: asArray(snapshot?.planesEstudio).length,
      },
    },
    recommendations: buildRecommendations(summary),
    warnings: [],
    errors: [],
  }
}
