export const V2_SUBJECT_IDENTITY_DRAFT_STATUS = 'PRECONFIRMAR'
export const V2_SUBJECT_IDENTITY_DRAFT_OBSERVATION = (
  'Precarga asistida: revisar y confirmar institucionalmente.'
)

const KNOWN_CAREER_IDS = new Set(['ING', 'GEO', 'QUI', 'LAB', 'TUR', 'TRA'])
const PLACEHOLDER_TOKENS = [
  'PLAN-ACTUAL',
  'SUGERIDO',
  'PENDIENTE',
  'REVISAR',
  'SIN_CODIGO',
  'SIN CODIGO',
]

const CRITICAL_REVIEW_TOKENS = [
  'DUPLICATE_SUBJECT_NAME',
  'HOMONIMIA',
  'UNKNOWN_CAREER',
  'CARRERA_DESCONOCIDA',
  'PLAN_ALTERNATIVO',
  'PLAN ALTERNATIVO',
  'MULTIPLAN',
  'MULTI_PLAN',
  'LABORATORIO_MULTIPLAN',
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

function isKnownCareerId(value) {
  return KNOWN_CAREER_IDS.has(normalizeCareerId(value))
}

function joinedReviewMotives(row = {}) {
  return [
    row.motivo_revision,
    row.pendiente_motivo,
    row.accion_requerida,
  ].map(clean).filter(Boolean).join('|')
}

function hasCriticalReviewMotive(row = {}) {
  const motive = joinedReviewMotives(row).toUpperCase()
  return CRITICAL_REVIEW_TOKENS.some((token) => motive.includes(token))
}

function isHomonymyRisk(row = {}) {
  const motive = joinedReviewMotives(row).toUpperCase()
  return (
    isYes(row.riesgo_nombre_duplicado) ||
    motive.includes('DUPLICATE_SUBJECT_NAME') ||
    motive.includes('HOMONIMIA')
  )
}

function isUnknownCareer(row = {}) {
  const careerId = normalizeCareerId(row.carrera_id_sugerido)
  return !careerId || careerId === 'UNKNOWN' || !isKnownCareerId(careerId)
}

function isLaboratoryMultiPlanRisk(row = {}) {
  const careerId = normalizeCareerId(row.carrera_id_sugerido)
  const motive = joinedReviewMotives(row).toUpperCase()
  return careerId === 'LAB' && (
    hasAlternative(row.plan_id_sugerido) ||
    motive.includes('MULTIPLAN') ||
    motive.includes('MULTI_PLAN') ||
    motive.includes('PLAN_ALTERNATIVO')
  )
}

function buildHighRiskReasons(row = {}) {
  const reasons = []

  if (isHomonymyRisk(row)) reasons.push('RIESGO_HOMONIMIA')
  if (isUnknownCareer(row)) reasons.push('CARRERA_DESCONOCIDA')
  if (hasAlternative(row.plan_id_sugerido)) reasons.push('PLAN_ALTERNATIVO')
  if (hasAlternative(row.materia_codigo_sugerido)) reasons.push('CODIGO_ALTERNATIVO')
  if (!clean(row.materia_codigo_sugerido)) reasons.push('CODIGO_SUGERIDO_VACIO')
  if (isLaboratoryMultiPlanRisk(row)) reasons.push('RIESGO_LABORATORIO_MULTIPLAN')
  if (hasCriticalReviewMotive(row)) reasons.push('MOTIVO_REVISION_CRITICO')

  return unique(reasons)
}

function buildSkipReasons(row = {}, highRiskReasons = []) {
  const reasons = []
  const suggestedValues = [
    row.carrera_id_sugerido,
    row.plan_id_sugerido,
    row.materia_codigo_sugerido,
  ]

  if (!clean(row.carrera_id_sugerido)) reasons.push('FALTA_CARRERA_ID_SUGERIDO')
  if (!clean(row.plan_id_sugerido)) reasons.push('FALTA_PLAN_ID_SUGERIDO')
  if (!clean(row.materia_codigo_sugerido)) reasons.push('FALTA_MATERIA_CODIGO_SUGERIDO')
  if (suggestedValues.some(hasAlternative)) reasons.push('CONTIENE_ALTERNATIVAS')
  if (suggestedValues.some(hasPlaceholder)) reasons.push('CONTIENE_PLACEHOLDER')
  if (isUnknownCareer(row)) reasons.push('CARRERA_DESCONOCIDA')
  if (highRiskReasons.length) reasons.push('RIESGO_ALTO')

  return unique(reasons)
}

function buildPrefilledRow(row = {}) {
  return {
    ...row,
    carrera_id_final: clean(row.carrera_id_sugerido),
    plan_id_final: clean(row.plan_id_sugerido),
    materia_codigo_final: clean(row.materia_codigo_sugerido),
    estado_revision: V2_SUBJECT_IDENTITY_DRAFT_STATUS,
    observaciones_revision: V2_SUBJECT_IDENTITY_DRAFT_OBSERVATION,
  }
}

function buildSkippedRow(row = {}, skipReasons = []) {
  return {
    ...row,
    prefill_skip_reason: skipReasons.join('|'),
  }
}

function buildHighRiskRow(row = {}, highRiskReasons = [], skipReasons = []) {
  return {
    ...row,
    motivos_prioridad_alta: highRiskReasons.join('|'),
    prefill_skip_reason: skipReasons.join('|'),
  }
}

function buildSummary({
  totalRows,
  prefilledRows,
  skippedRows,
  highRiskRows,
  homonymyRows,
}) {
  return {
    totalRows,
    prefilledRows,
    skippedRows,
    highRiskRows,
    homonymyRows,
    readyForApply: totalRows > 0,
    readyForCompactFinalTableComparison: false,
    safeToReplaceLegacy: false,
    nextAction: (
      'Revisar manualmente la precarga, cambiar PRECONFIRMAR a CONFIRMADO solo tras validacion institucional y luego ejecutar merge/apply.'
    ),
  }
}

export function prefillV2SubjectIdentityWorkpackDraft({
  workpackRows,
  options = {},
} = {}) {
  const safeRows = cloneJson(asArray(workpackRows))
  const prefilledRows = []
  const skippedRows = []
  const highRiskRows = []
  let homonymyRows = 0

  safeRows.forEach((row) => {
    const highRiskReasons = buildHighRiskReasons(row)
    const skipReasons = buildSkipReasons(row, highRiskReasons)

    if (isHomonymyRisk(row)) homonymyRows += 1

    if (skipReasons.length) {
      const skippedRow = buildSkippedRow(row, skipReasons)
      skippedRows.push(skippedRow)
      if (highRiskReasons.length) {
        highRiskRows.push(buildHighRiskRow(row, highRiskReasons, skipReasons))
      }
      return
    }

    prefilledRows.push(buildPrefilledRow(row))
  })

  const summary = buildSummary({
    totalRows: safeRows.length,
    prefilledRows: prefilledRows.length,
    skippedRows: skippedRows.length,
    highRiskRows: highRiskRows.length,
    homonymyRows,
  })

  return {
    prefilledRows: options.includeRows === false ? [] : prefilledRows,
    skippedRows: options.includeRows === false ? [] : skippedRows,
    highRiskRows: options.includeRows === false ? [] : highRiskRows,
    summary,
    warnings: [],
    errors: [],
  }
}
