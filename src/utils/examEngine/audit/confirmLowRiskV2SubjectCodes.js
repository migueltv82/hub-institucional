import {
  V2_SUBJECT_CODE_DRAFT_OBSERVATION,
  V2_SUBJECT_CODE_DRAFT_STATUS,
} from './prefillV2SubjectCodeReviewDraft.js'

export const V2_SUBJECT_CODE_CONFIRMED_OBSERVATION = (
  'Codigo simple confirmado institucionalmente para identidad v2.'
)

const PLACEHOLDER_TOKENS = [
  'PENDIENTE',
  'REVISAR',
  'SUGERIDO',
  'SIN_CODIGO',
  'SIN CODIGO',
  'PLAN-ACTUAL',
]
const REVIEW_OBSERVATION_TOKENS = ['revisar', 'pendiente', 'confirmar', 'duda', 'homonimia']

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

function joinedReviewText(row = {}) {
  return [
    row.motivo_revision,
    row.pendiente_motivo,
    row.accion_requerida,
    row.prefill_skip_reason,
    row.motivos_prioridad_alta,
  ].map(clean).filter(Boolean).join('|').toUpperCase()
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

function isStandardDraftObservation(value) {
  return normalizeText(value) === normalizeText(V2_SUBJECT_CODE_DRAFT_OBSERVATION)
}

function observationLooksReviewPending(value) {
  const raw = clean(value)
  if (!raw) return false
  if (isStandardDraftObservation(raw)) return false
  const normalized = normalizeText(raw)
  return REVIEW_OBSERVATION_TOKENS.some((token) => normalized.includes(token))
}

function isHomonymyRisk(row = {}) {
  const text = joinedReviewText(row)
  return (
    isYes(row.riesgo_homonimia) ||
    isYes(row.riesgo_nombre_duplicado) ||
    text.includes('HOMONIMIA') ||
    text.includes('DUPLICATE_SUBJECT_NAME')
  )
}

function isNameDuplicateRisk(row = {}) {
  const text = joinedReviewText(row)
  return (
    isYes(row.riesgo_nombre_duplicado) ||
    text.includes('NOMBRE_DUPLICADO') ||
    text.includes('DUPLICATE_SUBJECT_NAME')
  )
}

function isCodeDuplicateRisk(row = {}) {
  const text = joinedReviewText(row)
  return (
    isYes(row.riesgo_codigo_duplicado) ||
    text.includes('CODIGO_BORRADOR_DUPLICADO') ||
    text.includes('CODIGO_FINAL_DUPLICADO') ||
    text.includes('CODIGO_DUPLICADO') ||
    text.includes('DUPLICATE_FINAL_CODE') ||
    text.includes('DUPLICATE_DRAFT_CODE')
  )
}

function isHighPriority(row = {}) {
  return normalizeStatus(row.prioridad_revision) === 'ALTA'
}

function highRiskReasons(row = {}) {
  const reasons = []

  if (isHomonymyRisk(row)) reasons.push('RIESGO_HOMONIMIA')
  if (isNameDuplicateRisk(row)) reasons.push('RIESGO_NOMBRE_DUPLICADO')
  if (isCodeDuplicateRisk(row)) reasons.push('RIESGO_CODIGO_DUPLICADO')
  if (isHighPriority(row)) reasons.push('PRIORIDAD_ALTA')

  return unique(reasons)
}

function lowRiskBlockReasons(row = {}, riskReasons = []) {
  const reasons = []
  const finalCode = clean(row.materia_codigo_final)

  if (riskReasons.length) reasons.push('RIESGO_ALTO')
  if (!clean(row.plan_id_final)) reasons.push('FALTA_PLAN_ID_FINAL')
  if (!finalCode) reasons.push('FALTA_MATERIA_CODIGO_FINAL')
  if (normalizeStatus(row.estado_revision) !== V2_SUBJECT_CODE_DRAFT_STATUS) {
    reasons.push('ESTADO_NO_PRECONFIRMAR_CODIGO')
  }
  if (finalCode && hasPlaceholder(finalCode)) reasons.push('MATERIA_CODIGO_FINAL_PLACEHOLDER')
  if (finalCode && hasAlternative(finalCode)) reasons.push('MATERIA_CODIGO_FINAL_CON_ALTERNATIVAS')
  if (observationLooksReviewPending(row.observaciones_revision)) reasons.push('OBSERVACION_REQUIERE_REVISION')

  return unique(reasons)
}

function buildPendingRow(row = {}, reasons = [], riskReasons = []) {
  return {
    ...row,
    low_risk_skip_reason: unique([...reasons, ...riskReasons]).join('|'),
  }
}

function buildConfirmedRow(row = {}) {
  return {
    ...row,
    estado_revision: 'CONFIRMADO',
    observaciones_revision: V2_SUBJECT_CODE_CONFIRMED_OBSERVATION,
    low_risk_skip_reason: '',
  }
}

function buildWarning(summary = {}, expectedLowRiskRows) {
  if (!Number.isFinite(expectedLowRiskRows)) return []
  if (summary.confirmedRows === expectedLowRiskRows) return []

  return [{
    code: 'LOW_RISK_CONFIRMATION_COUNT_MISMATCH',
    expectedLowRiskRows,
    confirmedRows: summary.confirmedRows,
  }]
}

function buildSummary({ totalRows, confirmedRows, pendingRows, highRiskRows, homonymyRows, skippedRows }) {
  return {
    totalRows,
    eligibleLowRiskRows: confirmedRows.length,
    confirmedRows: confirmedRows.length,
    pendingRows: pendingRows.length,
    highRiskRows: highRiskRows.length,
    homonymyRows,
    skippedRows: skippedRows.length,
    readyForIdentityV2: pendingRows.length === 0 && totalRows > 0,
    readyForCompactFinalTableComparison: pendingRows.length === 0 && totalRows > 0,
    safeToReplaceLegacy: false,
    nextAction: pendingRows.length
      ? 'Resolver homonimias y pendientes restantes antes de habilitar identidad v2.'
      : 'Ejecutar validacion final de identidad v2 antes de cualquier comparacion compactada.',
  }
}

export function confirmLowRiskV2SubjectCodes({
  codeReviewRows,
  options = {},
} = {}) {
  const safeRows = cloneJson(asArray(codeReviewRows))
  const confirmedRows = []
  const pendingRows = []
  const skippedRows = []
  const highRiskRows = []
  let homonymyRows = 0

  safeRows.forEach((row) => {
    const risks = highRiskReasons(row)
    const blockers = lowRiskBlockReasons(row, risks)

    if (isHomonymyRisk(row)) homonymyRows += 1

    if (!blockers.length) {
      confirmedRows.push(buildConfirmedRow(row))
      return
    }

    const pendingRow = buildPendingRow(row, blockers, risks)
    pendingRows.push(pendingRow)
    skippedRows.push(pendingRow)

    if (risks.length) {
      highRiskRows.push({
        ...pendingRow,
        motivos_prioridad_alta: risks.join('|'),
      })
    }
  })

  const summary = buildSummary({
    totalRows: safeRows.length,
    confirmedRows,
    pendingRows,
    highRiskRows,
    homonymyRows,
    skippedRows,
  })
  const warnings = buildWarning(summary, options.expectedLowRiskRows ?? 100)

  return {
    confirmedRows: options.includeRows === false ? [] : confirmedRows,
    pendingRows: options.includeRows === false ? [] : pendingRows,
    skippedRows: options.includeRows === false ? [] : skippedRows,
    highRiskRows: options.includeRows === false ? [] : highRiskRows,
    summary,
    warnings,
    errors: [],
  }
}
