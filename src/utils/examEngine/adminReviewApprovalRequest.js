import {
  ADMIN_REVIEW_INTEGRITY_STATUS,
  ADMIN_REVIEW_PROMOTION_TYPE,
  normalizeAdminReviewActor,
  sha256Hex,
} from './adminReviewPromotionWorkflow.js'

export const ADMIN_REVIEW_APPROVAL_REQUEST_TYPE = 'ADMIN_REVIEW_APPROVAL_REQUEST'
export const ADMIN_REVIEW_APPROVAL_REQUEST_STATUS = 'REQUESTED'

export const ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS = Object.freeze({
  PROMOTION_REQUIRED: 'PROMOTION_REQUIRED',
  PROMOTION_NOT_ELIGIBLE: 'PROMOTION_NOT_ELIGIBLE',
  PROMOTION_SUPERSEDED: 'PROMOTION_SUPERSEDED',
  PROMOTION_BLOCKED: 'PROMOTION_BLOCKED',
  PROMOTION_MISMATCH: 'PROMOTION_MISMATCH',
  PROMOTION_LEGACY_UNVERIFIED: 'PROMOTION_LEGACY_UNVERIFIED',
  PROMOTION_VERIFY_ERROR: 'PROMOTION_VERIFY_ERROR',
  PROMOTION_NOT_LATEST_REVISION: 'PROMOTION_NOT_LATEST_REVISION',
  PROMOTION_ID_REQUIRED: 'PROMOTION_ID_REQUIRED',
  DRAFT_ID_REQUIRED: 'DRAFT_ID_REQUIRED',
  REVISION_NUMBER_REQUIRED: 'REVISION_NUMBER_REQUIRED',
  PROMOTION_INTEGRITY_HASH_REQUIRED: 'PROMOTION_INTEGRITY_HASH_REQUIRED',
  PROMOTION_ADMIN_ACTOR_REQUIRED: 'PROMOTION_ADMIN_ACTOR_REQUIRED',
  REQUEST_ADMIN_ACTOR_REQUIRED: 'REQUEST_ADMIN_ACTOR_REQUIRED',
  ACTIVE_REQUEST_ALREADY_EXISTS: 'ACTIVE_REQUEST_ALREADY_EXISTS',
  HARD_RULE_VIOLATIONS: 'HARD_RULE_VIOLATIONS',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function hasActor(actor = null) {
  return Boolean(
    actor
    && actor.displayName !== 'ADMIN_REVIEW_USER_UNAVAILABLE'
    && (clean(actor.userId) || clean(actor.email) || clean(actor.displayName)),
  )
}

function activeRequestForPromotion(requests = [], promotionId = '') {
  return asArray(requests).find((request) => (
    clean(request?.promotionId) === clean(promotionId)
    && ['REQUESTED', 'PENDING_SECOND_APPROVAL'].includes(clean(request?.status).toUpperCase())
  )) ?? null
}

function blockedResult({ reason, promotion, warnings = [], diagnostics = {} }) {
  return {
    requestCreated: false,
    approvalRequest: null,
    blockedReason: reason,
    hardRuleViolations: asArray(promotion?.hardRuleViolations),
    warnings,
    diagnostics: {
      promotionIdPresent: Boolean(clean(promotion?.promotionId)),
      draftIdPresent: Boolean(clean(promotion?.draftId)),
      revisionNumberPresent: Number.isInteger(Number(promotion?.revisionNumber)) && Number(promotion?.revisionNumber) > 0,
      integrityHashPresent: Boolean(clean(promotion?.integrity?.hash)),
      ...diagnostics,
    },
  }
}

export function createAdminReviewApprovalRequest({
  promotion,
  approvalEligibility = {},
  adminActor = null,
  existingApprovalRequests = [],
  options = {},
} = {}) {
  if (!promotion) return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_REQUIRED })

  const promotionId = clean(promotion.promotionId)
  const draftId = clean(promotion.draftId)
  const eligiblePromotion = asArray(approvalEligibility.eligiblePromotions)
    .find((candidate) => clean(candidate?.promotionId) === promotionId)
  const supersededPromotion = asArray(approvalEligibility.supersededPromotions)
    .find((entry) => clean(entry?.promotionId) === promotionId)
  const blockedPromotion = asArray(approvalEligibility.blockedPromotions)
    .find((entry) => clean(entry?.promotionId) === promotionId)

  if (!promotionId) return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_ID_REQUIRED, promotion })
  if (!draftId) return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.DRAFT_ID_REQUIRED, promotion })
  if (!Number.isInteger(Number(promotion.revisionNumber)) || Number(promotion.revisionNumber) <= 0) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.REVISION_NUMBER_REQUIRED, promotion })
  }
  if (supersededPromotion) {
    return blockedResult({
      reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_SUPERSEDED,
      promotion,
      diagnostics: { supersededByPromotionId: supersededPromotion.supersededByPromotionId ?? null },
    })
  }
  if (promotion.integrityStatus === ADMIN_REVIEW_INTEGRITY_STATUS.MISMATCH) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_MISMATCH, promotion })
  }
  if (promotion.integrityStatus === ADMIN_REVIEW_INTEGRITY_STATUS.LEGACY_UNVERIFIED) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_LEGACY_UNVERIFIED, promotion })
  }
  if (promotion.integrityStatus === ADMIN_REVIEW_INTEGRITY_STATUS.VERIFY_ERROR) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_VERIFY_ERROR, promotion })
  }
  if (blockedPromotion) {
    return blockedResult({
      reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_BLOCKED,
      promotion,
      warnings: asArray(blockedPromotion.reasons),
    })
  }
  if (!eligiblePromotion) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_NOT_ELIGIBLE, promotion })
  }
  if (promotion.type !== ADMIN_REVIEW_PROMOTION_TYPE) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_NOT_ELIGIBLE, promotion })
  }
  if (
    promotion.integrityStatus !== ADMIN_REVIEW_INTEGRITY_STATUS.VERIFIED
    || promotion.integrityVerification?.eligibleForFutureApproval !== true
  ) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_NOT_ELIGIBLE, promotion })
  }
  const latest = approvalEligibility.latestPromotionByDraft?.[draftId]
  if (!latest || clean(latest.promotionId) !== promotionId) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_NOT_LATEST_REVISION, promotion })
  }
  if (asArray(promotion.hardRuleViolations).length) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.HARD_RULE_VIOLATIONS, promotion })
  }
  if (!clean(promotion.integrity?.hash)) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_INTEGRITY_HASH_REQUIRED, promotion })
  }
  if (!hasActor(promotion.adminActor)) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.PROMOTION_ADMIN_ACTOR_REQUIRED, promotion })
  }

  const actorResult = normalizeAdminReviewActor(adminActor)
  if (actorResult.warning || !hasActor(actorResult.actor)) {
    return blockedResult({ reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.REQUEST_ADMIN_ACTOR_REQUIRED, promotion })
  }
  const activeRequest = activeRequestForPromotion(existingApprovalRequests, promotionId)
  if (activeRequest) {
    return blockedResult({
      reason: ADMIN_REVIEW_APPROVAL_REQUEST_BLOCK_REASONS.ACTIVE_REQUEST_ALREADY_EXISTS,
      promotion,
      diagnostics: { activeRequestId: activeRequest.requestId ?? null },
    })
  }

  const requestedAt = typeof options.now === 'function' ? options.now() : new Date().toISOString()
  const requestId = `admin-review-approval-request-${sha256Hex(`${promotionId}:${requestedAt}:${actorResult.actor.userId ?? actorResult.actor.email}`).slice(0, 16)}`
  const approvalRequest = {
    requestId,
    type: ADMIN_REVIEW_APPROVAL_REQUEST_TYPE,
    status: ADMIN_REVIEW_APPROVAL_REQUEST_STATUS,
    promotionId,
    draftId,
    revisionNumber: Number(promotion.revisionNumber),
    requestedAt,
    requestedBy: actorResult.actor,
    basedOn: {
      promotionIntegrityHash: promotion.integrity.hash,
      promotionWorkflowVersion: clean(promotion.integrity.workflowVersion),
      appliedDecisionIds: asArray(promotion.appliedDecisionIds).map(clean).filter(Boolean),
      skippedDecisionIds: asArray(promotion.skippedDecisionIds).map(clean).filter(Boolean),
    },
    requiresSecondApproval: true,
    secondApproval: null,
    warnings: ['SECOND_APPROVAL_REQUIRED'],
    diagnostics: {
      source: 'admin_review_approval_request',
      eligibilityStatus: 'ELIGIBLE_AT_REQUEST_TIME',
      secondApprovalRequired: true,
      activeRequestsForPromotionBeforeCreate: 0,
    },
    isOfficial: false,
  }

  return {
    requestCreated: true,
    approvalRequest,
    blockedReason: '',
    hardRuleViolations: [],
    warnings: approvalRequest.warnings,
    diagnostics: approvalRequest.diagnostics,
  }
}

export function appendAdminReviewApprovalRequest(requests = [], request = {}) {
  if (!clean(request?.requestId)) return asArray(requests)
  if (asArray(requests).some((current) => clean(current?.requestId) === clean(request.requestId))) return asArray(requests)
  return [...asArray(requests), request]
}
