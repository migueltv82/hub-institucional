export const V2_SUBJECT_CODE_DRAFT_STATUS = 'PRECONFIRMAR_CODIGO'
export const V2_SUBJECT_CODE_DRAFT_OBSERVATION = (
  'Precarga asistida: revisar y confirmar institucionalmente el codigo de materia.'
)

const CONFIRMED_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])
const PLACEHOLDER_TOKENS = [
  'PENDIENTE',
  'REVISAR',
  'SUGERIDO',
  'SIN_CODIGO',
  'SIN CODIGO',
  'PLAN-ACTUAL',
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
  ].map(clean).filter(Boolean).join('|').toUpperCase()
}

function isHomonymyRisk(row = {}) {
  const motive = joinedMotives(row)
  return (
    isYes(row.riesgo_homonimia) ||
    isYes(row.riesgo_nombre_duplicado) ||
    motive.includes('HOMONIMIA') ||
    motive.includes('DUPLICATE_SUBJECT_NAME')
  )
}

function isNameDuplicateRisk(row = {}) {
  const motive = joinedMotives(row)
  return (
    isYes(row.riesgo_nombre_duplicado) ||
    motive.includes('NOMBRE_DUPLICADO') ||
    motive.includes('DUPLICATE_SUBJECT_NAME')
  )
}

function isCodeDuplicateRisk(row = {}) {
  const motive = joinedMotives(row)
  return (
    isYes(row.riesgo_codigo_duplicado) ||
    motive.includes('CODIGO_BORRADOR_DUPLICADO') ||
    motive.includes('CODIGO_FINAL_DUPLICADO') ||
    motive.includes('CODIGO_DUPLICADO')
  )
}

function isHighPriority(row = {}) {
  return normalizeStatus(row.prioridad_revision) === 'ALTA'
}

function isConfirmed(row = {}) {
  return CONFIRMED_STATUSES.has(normalizeStatus(row.estado_revision))
}

function buildHighRiskReasons(row = {}) {
  const reasons = []

  if (isHomonymyRisk(row)) reasons.push('RIESGO_HOMONIMIA')
  if (isNameDuplicateRisk(row)) reasons.push('RIESGO_NOMBRE_DUPLICADO')
  if (isHighPriority(row)) reasons.push('PRIORIDAD_ALTA')
  if (!clean(row.materia_codigo_borrador)) reasons.push('CODIGO_BORRADOR_VACIO')
  if (isCodeDuplicateRisk(row)) reasons.push('RIESGO_CODIGO_DUPLICADO')
  if (!clean(row.plan_id_final)) reasons.push('FALTA_PLAN_ID_FINAL')

  return unique(reasons)
}

function buildSkipReasons(row = {}, highRiskReasons = []) {
  const reasons = []
  const draftCode = clean(row.materia_codigo_borrador)

  if (highRiskReasons.length) reasons.push('RIESGO_ALTO')
  if (clean(row.materia_codigo_final)) reasons.push('MATERIA_CODIGO_FINAL_EXISTENTE')
  if (draftCode && hasPlaceholder(draftCode)) reasons.push('CODIGO_BORRADOR_PLACEHOLDER')
  if (draftCode && hasAlternative(draftCode)) reasons.push('CODIGO_BORRADOR_CON_ALTERNATIVAS')

  return unique(reasons)
}

function buildPrefilledRow(row = {}) {
  return {
    ...row,
    materia_codigo_final: clean(row.materia_codigo_borrador),
    estado_revision: V2_SUBJECT_CODE_DRAFT_STATUS,
    observaciones_revision: V2_SUBJECT_CODE_DRAFT_OBSERVATION,
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
  outputRows,
}) {
  return {
    totalRows,
    prefilledRows,
    skippedRows,
    highRiskRows,
    homonymyRows,
    preconfirmarRows: outputRows.filter((row) => normalizeStatus(row.estado_revision) === V2_SUBJECT_CODE_DRAFT_STATUS).length,
    confirmedRows: outputRows.filter(isConfirmed).length,
    readyForIdentityV2: false,
    readyForCompactFinalTableComparison: false,
    safeToReplaceLegacy: false,
    nextAction: (
      'Revisar manualmente los codigos precargados, cambiar PRECONFIRMAR_CODIGO a CONFIRMADO solo tras validacion institucional y volver a ejecutar el validador.'
    ),
  }
}

export function prefillV2SubjectCodeReviewDraft({
  codeReviewRows,
  options = {},
} = {}) {
  const safeRows = cloneJson(asArray(codeReviewRows))
  const prefilledRows = []
  const skippedRows = []
  const highRiskRows = []
  const outputRows = []
  let homonymyRows = 0

  safeRows.forEach((row) => {
    const highRiskReasons = buildHighRiskReasons(row)
    const skipReasons = buildSkipReasons(row, highRiskReasons)

    if (isHomonymyRisk(row)) homonymyRows += 1

    if (skipReasons.length) {
      const skippedRow = buildSkippedRow(row, skipReasons)
      skippedRows.push(skippedRow)
      outputRows.push(skippedRow)
      if (highRiskReasons.length) {
        highRiskRows.push(buildHighRiskRow(row, highRiskReasons, skipReasons))
      }
      return
    }

    const prefilledRow = buildPrefilledRow(row)
    prefilledRows.push(prefilledRow)
    outputRows.push(prefilledRow)
  })

  const summary = buildSummary({
    totalRows: safeRows.length,
    prefilledRows: prefilledRows.length,
    skippedRows: skippedRows.length,
    highRiskRows: highRiskRows.length,
    homonymyRows,
    outputRows,
  })

  return {
    prefilledRows: options.includeRows === false ? [] : prefilledRows,
    skippedRows: options.includeRows === false ? [] : skippedRows,
    highRiskRows: options.includeRows === false ? [] : highRiskRows,
    outputRows: options.includeRows === false ? [] : outputRows,
    summary,
    warnings: [],
    errors: [],
  }
}
