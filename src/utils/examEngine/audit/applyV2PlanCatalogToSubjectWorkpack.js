export const V2_PLAN_CATALOG_APPLIED_OBSERVATION = (
  'Plan aplicado desde catálogo v2 confirmado; falta confirmar código de materia.'
)

const CONFIRMED_STATUSES = new Set(['CONFIRMADO', 'APROBADO', 'VALIDADO', 'OK'])
const PLACEHOLDER_TOKENS = [
  'PLAN-ACTUAL',
  'SUGERIDO',
  'PENDIENTE',
  'REVISAR',
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

function normalizeStatus(value) {
  return clean(value).toUpperCase()
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

function isConfirmedPlan(row = {}) {
  const planId = clean(row.plan_id_final)
  return Boolean(
    CONFIRMED_STATUSES.has(normalizeStatus(row.estado_revision)) &&
    planId &&
    !hasPlaceholder(planId) &&
    !hasAlternative(planId)
  )
}

function buildPlanIndex(planCatalogRows = []) {
  return asArray(planCatalogRows).reduce((map, row) => {
    const careerId = normalizeCareerId(row?.carrera_id)
    if (!careerId || map.has(careerId)) return map
    map.set(careerId, row)
    return map
  }, new Map())
}

function careerIdFor(row = {}) {
  return normalizeCareerId(row.carrera_id_final || row.carrera_id_sugerido)
}

function pendingRow(row = {}, reason) {
  return {
    ...row,
    plan_apply_pending_reason: reason,
  }
}

function changedRow(row = {}, planId) {
  return {
    ...row,
    plan_id_final: planId,
    estado_revision: 'PRECONFIRMAR_PLAN',
    observaciones_revision: V2_PLAN_CATALOG_APPLIED_OBSERVATION,
  }
}

function buildSummary({
  totalRows,
  updatedRows,
  unchangedRows,
  pendingRows,
  planCatalogRows,
}) {
  const confirmedPlanCareers = asArray(planCatalogRows).filter(isConfirmedPlan).length
  const pendingPlanCareers = asArray(planCatalogRows).filter((row) => !isConfirmedPlan(row)).length

  return {
    totalRows,
    updatedRows,
    unchangedRows,
    pendingRows,
    confirmedPlanCareers,
    pendingPlanCareers,
    readyForSubjectIdentityReview: false,
    safeToReplaceLegacy: false,
    nextAction: updatedRows > 0
      ? 'Revisar codigos de materia y confirmar manualmente cada identidad v2.'
      : 'Confirmar catalogo de planes v2 antes de aplicar planes a materias.',
  }
}

export function applyV2PlanCatalogToSubjectWorkpack({
  subjectRows,
  planCatalogRows,
  options = {},
} = {}) {
  const safeRows = cloneJson(asArray(subjectRows))
  const safePlans = cloneJson(asArray(planCatalogRows))
  const overwrite = options.overwrite === true
  const plansByCareer = buildPlanIndex(safePlans)
  const updatedRows = []
  const unchangedRows = []
  const pendingRows = []

  safeRows.forEach((row) => {
    const careerId = careerIdFor(row)
    const catalogRow = plansByCareer.get(careerId)
    const planId = clean(catalogRow?.plan_id_final)
    const currentPlanId = clean(row.plan_id_final)

    if (!careerId) {
      pendingRows.push(pendingRow(row, 'FALTA_CARRERA_ID'))
      return
    }
    if (!catalogRow) {
      pendingRows.push(pendingRow(row, 'SIN_PLAN_EN_CATALOGO'))
      return
    }
    if (!isConfirmedPlan(catalogRow)) {
      pendingRows.push(pendingRow(row, 'PLAN_NO_CONFIRMADO_O_INVALIDO'))
      return
    }
    if (currentPlanId && !overwrite) {
      unchangedRows.push({
        ...row,
        plan_apply_skip_reason: 'PLAN_ID_FINAL_EXISTENTE',
      })
      return
    }

    updatedRows.push(changedRow(row, planId))
  })

  const summary = buildSummary({
    totalRows: safeRows.length,
    updatedRows: updatedRows.length,
    unchangedRows: unchangedRows.length,
    pendingRows: pendingRows.length,
    planCatalogRows: safePlans,
  })

  return {
    updatedRows: options.includeRows === false ? [] : updatedRows,
    unchangedRows: options.includeRows === false ? [] : unchangedRows,
    pendingRows: options.includeRows === false ? [] : pendingRows,
    summary,
    warnings: [],
    errors: [],
  }
}
