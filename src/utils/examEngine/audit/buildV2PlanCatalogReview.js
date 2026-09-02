const KNOWN_CAREERS = Object.freeze([
  { id: 'ING', name: 'Profesorado de Ingles' },
  { id: 'GEO', name: 'Profesorado de Geografia' },
  { id: 'QUI', name: 'Profesorado de Quimica' },
  { id: 'LAB', name: 'Tecnicatura Superior en Laboratorio' },
  { id: 'TUR', name: 'Tecnicatura Superior en Turismo' },
  { id: 'TRA', name: 'Traductorado' },
])

const CONFIRMED_STATUS = 'CONFIRMADO'
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

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function unwrapWorkpackSummary(workpackSummary = {}) {
  const safeSummary = workpackSummary && typeof workpackSummary === 'object'
    ? workpackSummary
    : {}
  return safeSummary.workpackSummary && typeof safeSummary.workpackSummary === 'object'
    ? safeSummary.workpackSummary
    : safeSummary
}

function unwrapSubjectRows(subjectIdentityRows = []) {
  if (Array.isArray(subjectIdentityRows)) return subjectIdentityRows
  if (Array.isArray(subjectIdentityRows?.reviewRows)) return subjectIdentityRows.reviewRows
  if (Array.isArray(subjectIdentityRows?.rows)) return subjectIdentityRows.rows
  return []
}

function buildSubjectIndex(rows = []) {
  return asArray(rows).reduce((map, row) => {
    const careerId = normalizeCareerId(row?.carrera_id_sugerido || row?.carrera_id_final)
    if (!careerId) return map
    const bucket = map.get(careerId) ?? []
    bucket.push(row)
    map.set(careerId, bucket)
    return map
  }, new Map())
}

function careerNameFor(careerId, rows = []) {
  const fromRows = unique(rows.map((row) => row.carrera))[0]
  if (fromRows) return fromRows
  return KNOWN_CAREERS.find((career) => career.id === careerId)?.name ?? careerId
}

function suggestedPlanFor(careerId, rows = []) {
  const suggestions = unique(rows.map((row) => row.plan_id_sugerido))
  if (suggestions.length) return suggestions.join('|')
  return `${careerId}-PLAN-ACTUAL`
}

function detectedCareerIds(rowsByCareer = {}, subjectRows = []) {
  const ids = []
  Object.keys(rowsByCareer).forEach((careerId) => {
    const normalized = normalizeCareerId(careerId)
    if (normalized && normalized !== 'UNKNOWN' && !ids.includes(normalized)) ids.push(normalized)
  })
  subjectRows.forEach((row) => {
    const careerId = normalizeCareerId(row.carrera_id_sugerido || row.carrera_id_final)
    if (careerId && careerId !== 'UNKNOWN' && !ids.includes(careerId)) ids.push(careerId)
  })
  KNOWN_CAREERS.forEach((career) => {
    if (Object.prototype.hasOwnProperty.call(rowsByCareer, career.id) && !ids.includes(career.id)) {
      ids.push(career.id)
    }
  })
  return ids
}

function isPlanConfirmed(row = {}) {
  const planId = clean(row.plan_id_final)
  return Boolean(
    Number(row.materias_requeridas) > 0 &&
    planId &&
    !hasPlaceholder(planId) &&
    normalizeStatus(row.estado_revision) === CONFIRMED_STATUS
  )
}

function buildPlanRow({ careerId, requiredSubjects, rows }) {
  return {
    carrera_id: careerId,
    carrera_nombre: careerNameFor(careerId, rows),
    materias_requeridas: requiredSubjects,
    plan_id_sugerido: suggestedPlanFor(careerId, rows),
    plan_id_final: '',
    plan_nombre_final: '',
    anio_plan: '',
    resolucion_plan: '',
    estado_revision: 'PENDIENTE',
    observaciones_revision: '',
  }
}

function buildSummary(planRows = []) {
  const rowsWithSubjects = planRows.filter((row) => Number(row.materias_requeridas) > 0)
  const confirmedPlans = rowsWithSubjects.filter(isPlanConfirmed).length
  const pendingPlans = rowsWithSubjects.length - confirmedPlans
  const totalRequiredSubjects = rowsWithSubjects.reduce(
    (total, row) => total + Number(row.materias_requeridas || 0),
    0,
  )
  const readyForPlanApply = rowsWithSubjects.length > 0 && pendingPlans === 0

  return {
    totalCareers: planRows.length,
    totalRequiredSubjects,
    careersWithSubjects: rowsWithSubjects.length,
    careersWithoutSubjects: planRows.length - rowsWithSubjects.length,
    pendingPlans,
    confirmedPlans,
    readyForPlanApply,
    safeToReplaceLegacy: false,
    nextAction: readyForPlanApply
      ? 'Aplicar catalogo de planes v2 confirmado al workpack de materias.'
      : 'Completar plan_id_final y confirmar institucionalmente cada carrera con materias requeridas.',
  }
}

function buildRecommendations(summary = {}) {
  const recommendations = []
  if (summary.pendingPlans > 0) {
    recommendations.push('Confirmar plan_id_final por carrera antes de aplicar planes al workpack de materias.')
  }
  if (summary.careersWithoutSubjects > 0) {
    recommendations.push('Las carreras sin materias requeridas quedan documentadas y no bloquean readyForPlanApply.')
  }
  if (!summary.readyForPlanApply) {
    recommendations.push('No usar PLAN-ACTUAL como plan_id_final.')
  }
  return recommendations.length ? recommendations : ['Aplicar el catalogo confirmado al workpack de materias.']
}

export function buildV2PlanCatalogReview({
  workpackSummary,
  subjectIdentityRows,
  options = {},
} = {}) {
  const safeSummary = cloneJson(unwrapWorkpackSummary(workpackSummary))
  const safeRows = cloneJson(unwrapSubjectRows(subjectIdentityRows))
  const rowsByCareer = safeSummary?.rowsByCareer ?? {}
  const subjectRowsByCareer = buildSubjectIndex(safeRows)
  const planRows = detectedCareerIds(rowsByCareer, safeRows)
    .map((careerId) => {
      const requiredSubjects = Number(rowsByCareer[careerId] ?? subjectRowsByCareer.get(careerId)?.length ?? 0) || 0
      return buildPlanRow({
        careerId,
        requiredSubjects,
        rows: subjectRowsByCareer.get(careerId) ?? [],
      })
    })
  const summary = buildSummary(planRows)

  return {
    planRows: options.includeRows === false ? [] : planRows,
    summary,
    recommendations: buildRecommendations(summary),
    warnings: [],
    errors: [],
  }
}
