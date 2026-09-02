export const ADMIN_REVIEW_DECISION_TYPES = Object.freeze({
  GROUPING: 'GROUPING',
  TRIBUNAL_SELECTION: 'TRIBUNAL_SELECTION',
})

export const ADMIN_REVIEW_DECISION_SOURCE = 'exam_admin_review_workflow'

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeDecision(value) {
  const normalized = clean(value).toUpperCase()
  if ([
    'ACCEPTED',
    'REJECTED',
    'EDITED',
    'PENDING',
    'SELECTED',
    'REMOVED',
    'BLOCKED_HARD_RULES',
  ].includes(normalized)) return normalized
  return 'PENDING'
}

export function buildAdminReviewDecision({
  currentDecision = null,
  type,
  targetId,
  decision = 'PENDING',
  reason = '',
  metadata = {},
  hardRuleViolations = [],
  source = ADMIN_REVIEW_DECISION_SOURCE,
  now = () => new Date().toISOString(),
} = {}) {
  const normalizedType = clean(type)
  const normalizedTargetId = clean(targetId)
  const timestamp = now()

  if (!normalizedType) throw new Error('La decision administrativa requiere type.')
  if (!normalizedTargetId) throw new Error('La decision administrativa requiere targetId.')

  return {
    decisionId: clean(currentDecision?.decisionId) || `${normalizedType}:${normalizedTargetId}`,
    type: normalizedType,
    targetId: normalizedTargetId,
    decision: normalizeDecision(decision),
    reason: clean(reason),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
    hardRuleViolations: asArray(hardRuleViolations).map(clean).filter(Boolean),
    source,
    createdAt: clean(currentDecision?.createdAt) || timestamp,
    updatedAt: timestamp,
  }
}

export function normalizeAdminReviewDecisions(decisions = []) {
  return asArray(decisions)
    .map((decision) => {
      try {
        return buildAdminReviewDecision({
          currentDecision: decision,
          type: decision?.type,
          targetId: decision?.targetId,
          decision: decision?.decision,
          reason: decision?.reason,
          metadata: decision?.metadata,
          hardRuleViolations: decision?.hardRuleViolations,
          source: clean(decision?.source) || ADMIN_REVIEW_DECISION_SOURCE,
          now: () => clean(decision?.updatedAt) || new Date().toISOString(),
        })
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

export function findAdminReviewDecision(decisions = [], { type, targetId } = {}) {
  const normalizedType = clean(type)
  const normalizedTargetId = clean(targetId)

  return asArray(decisions).find((decision) => (
    clean(decision?.type) === normalizedType &&
    clean(decision?.targetId) === normalizedTargetId
  )) ?? null
}

export function upsertAdminReviewDecision(decisions = [], nextDecisionInput = {}) {
  const currentDecision = findAdminReviewDecision(decisions, nextDecisionInput)
  const nextDecision = buildAdminReviewDecision({
    ...nextDecisionInput,
    currentDecision,
  })
  const replaced = new Set()
  const nextDecisions = asArray(decisions).map((decision) => {
    const isTarget = (
      clean(decision?.type) === nextDecision.type &&
      clean(decision?.targetId) === nextDecision.targetId
    )

    if (!isTarget) return decision
    replaced.add(nextDecision.decisionId)
    return nextDecision
  })

  if (!replaced.size) nextDecisions.push(nextDecision)

  return normalizeAdminReviewDecisions(nextDecisions)
}

export function tryAcceptAdminReviewDecision({ target, decisions = [], type, targetId, reason = '' } = {}) {
  const hardRuleViolations = asArray(target?.hardRuleViolations)
  const canAccept = Boolean(target?.canAccept) && hardRuleViolations.length === 0

  return {
    ok: canAccept,
    decisions: upsertAdminReviewDecision(decisions, {
      type,
      targetId,
      decision: canAccept ? 'ACCEPTED' : 'PENDING',
      reason: canAccept ? reason : 'ACCEPT_BLOCKED_HARD_RULES',
      metadata: {
        requestedDecision: 'ACCEPTED',
        blocked: !canAccept,
      },
      hardRuleViolations,
    }),
    hardRuleViolations,
  }
}

export function buildTribunalSelectionTargetId({ tableId, teacherId, role = 'VOCAL' } = {}) {
  return [clean(tableId), clean(teacherId), clean(role).toUpperCase()].filter(Boolean).join('::')
}

export function getSelectedTribunalSelections(decisions = []) {
  return asArray(decisions)
    .filter((decision) => (
      decision?.type === ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION &&
      decision?.decision === 'SELECTED'
    ))
    .map((decision) => ({
      mesaId: decision.metadata?.tableId,
      docenteId: decision.metadata?.teacherId,
      docente: decision.metadata?.teacherName,
      role: decision.metadata?.role,
      fechaIso: decision.metadata?.date,
      inicio: decision.metadata?.startTime,
      fin: decision.metadata?.endTime,
      decisionId: decision.decisionId,
      targetId: decision.targetId,
    }))
    .filter((selection) => selection.mesaId && selection.docenteId)
}

export function trySelectTribunalTeacherDecision({
  decisions = [],
  mesa = {},
  recommendation = {},
  role = 'VOCAL',
  groupId = '',
  affectationBefore = null,
  affectationAfter = null,
} = {}) {
  const tableId = clean(mesa.id)
  const teacherId = clean(recommendation?.docente?.id)
  const targetId = buildTribunalSelectionTargetId({ tableId, teacherId, role })
  const hardRuleViolations = asArray(recommendation?.hardRuleViolations)
  const eligible = Boolean(recommendation?.eligible) && hardRuleViolations.length === 0
  const normalizedRole = clean(role).toUpperCase() || 'VOCAL'
  const consumesAffectation = normalizedRole !== 'TITULAR'

  return {
    ok: eligible,
    targetId,
    decisions: upsertAdminReviewDecision(decisions, {
      type: ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION,
      targetId,
      decision: eligible ? 'SELECTED' : 'BLOCKED_HARD_RULES',
      reason: eligible
        ? 'Docente seleccionado para tribunal desde revision administrativa experimental.'
        : 'Seleccion bloqueada por reglas duras.',
      metadata: {
        tableId,
        groupId: clean(groupId),
        teacherId,
        teacherName: clean(recommendation?.docente?.nombre),
        role: normalizedRole,
        date: clean(mesa.fechaIso),
        shift: clean(mesa.turno),
        startTime: clean(mesa.inicio),
        endTime: clean(mesa.fin),
        consumesAffectation,
        affectationBefore,
        affectationAfter,
        recommendationScore: Number(recommendation?.score ?? 0),
        recommendationReasons: asArray(recommendation?.reasons),
        recommendationWarnings: asArray(recommendation?.warnings),
      },
      hardRuleViolations,
    }),
    hardRuleViolations,
  }
}

export function removeTribunalTeacherDecision({
  decisions = [],
  selection = {},
  reason = 'Seleccion removida desde revision administrativa experimental.',
} = {}) {
  const targetId = clean(selection.targetId) || buildTribunalSelectionTargetId({
    tableId: selection.mesaId ?? selection.metadata?.tableId,
    teacherId: selection.docenteId ?? selection.metadata?.teacherId,
    role: selection.role ?? selection.metadata?.role,
  })

  return upsertAdminReviewDecision(decisions, {
    type: ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION,
    targetId,
    decision: 'REMOVED',
    reason,
    metadata: selection.metadata ?? {
      tableId: selection.mesaId,
      teacherId: selection.docenteId,
      teacherName: selection.docente,
      role: selection.role,
      date: selection.fechaIso,
      startTime: selection.inicio,
      endTime: selection.fin,
      consumesAffectation: clean(selection.role).toUpperCase() !== 'TITULAR',
    },
    hardRuleViolations: [],
  })
}
