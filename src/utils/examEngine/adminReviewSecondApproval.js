import { ADMIN_REVIEW_APPROVAL_REQUEST_STATUS } from './adminReviewApprovalRequest.js'
import {
  ADMIN_REVIEW_INTEGRITY_ALGORITHM,
  ADMIN_REVIEW_INTEGRITY_STATUS,
  normalizeAdminReviewActor,
  sha256Hex,
  stableSerializeAdminReviewValue,
} from './adminReviewPromotionWorkflow.js'
import { ADMIN_REVIEW_SECOND_APPROVAL_ALLOWED_ROLES } from './adminReviewSecondApprovalEligibility.js'

export const ADMIN_REVIEW_SECOND_APPROVAL_TYPE = 'ADMIN_REVIEW_SECOND_APPROVAL'
export const ADMIN_REVIEW_SECOND_APPROVAL_STATUS = 'SECOND_APPROVED'

export const ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS = Object.freeze({
  REQUEST_REQUIRED: 'REQUEST_REQUIRED',
  REQUEST_NOT_ELIGIBLE: 'REQUEST_NOT_ELIGIBLE',
  REQUEST_ALREADY_APPROVED: 'REQUEST_ALREADY_APPROVED',
  REQUEST_STATUS_INVALID: 'REQUEST_STATUS_INVALID',
  REQUEST_ID_REQUIRED: 'REQUEST_ID_REQUIRED',
  PROMOTION_REQUIRED: 'PROMOTION_REQUIRED',
  PROMOTION_NOT_VERIFIED: 'PROMOTION_NOT_VERIFIED',
  PROMOTION_HASH_MISMATCH: 'PROMOTION_HASH_MISMATCH',
  ACTOR_REQUIRED: 'ACTOR_REQUIRED',
  SAME_ACTOR_NOT_ALLOWED: 'SAME_ACTOR_NOT_ALLOWED',
  ACTOR_ROLE_NOT_ALLOWED: 'ACTOR_ROLE_NOT_ALLOWED',
  HARD_RULE_VIOLATIONS: 'HARD_RULE_VIOLATIONS',
  SECOND_APPROVAL_ALREADY_EXISTS: 'SECOND_APPROVAL_ALREADY_EXISTS',
  REQUEST_INTEGRITY_GENERATION_FAILED: 'REQUEST_INTEGRITY_GENERATION_FAILED',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeRole(value) {
  return clean(value).toLowerCase()
}

function actorPresent(actor = null) {
  return Boolean(actor && (clean(actor.userId) || clean(actor.email)))
}

function sameActor(left = null, right = null) {
  const leftUserId = clean(left?.userId)
  const rightUserId = clean(right?.userId)
  if (leftUserId && rightUserId && leftUserId === rightUserId) return true
  const leftEmail = clean(left?.email).toLowerCase()
  const rightEmail = clean(right?.email).toLowerCase()
  return Boolean(leftEmail && rightEmail && leftEmail === rightEmail)
}

function requestCoreForIntegrity(request = {}) {
  return {
    requestId: clean(request.requestId),
    type: clean(request.type),
    status: clean(request.status),
    promotionId: clean(request.promotionId),
    draftId: clean(request.draftId),
    revisionNumber: Number(request.revisionNumber ?? 0),
    requestedAt: clean(request.requestedAt),
    requestedBy: {
      userId: clean(request.requestedBy?.userId) || null,
      role: normalizeRole(request.requestedBy?.role) || null,
    },
    basedOn: {
      promotionIntegrityHash: clean(request.basedOn?.promotionIntegrityHash),
      promotionWorkflowVersion: clean(request.basedOn?.promotionWorkflowVersion),
      appliedDecisionIds: asArray(request.basedOn?.appliedDecisionIds).map(clean).filter(Boolean).sort(),
      skippedDecisionIds: asArray(request.basedOn?.skippedDecisionIds).map(clean).filter(Boolean).sort(),
    },
    requiresSecondApproval: request.requiresSecondApproval === true,
    secondApprovalPresent: request.secondApproval !== null && request.secondApproval !== undefined,
    isOfficial: request.isOfficial === true,
  }
}

export function buildAdminReviewApprovalRequestIntegrity({ approvalRequest, promotion } = {}) {
  try {
    const requestCoreHash = sha256Hex(stableSerializeAdminReviewValue(requestCoreForIntegrity(approvalRequest)))
    const promotionHash = clean(promotion?.integrity?.hash)
    if (!promotionHash) return { ok: false, requestIntegrity: null, error: 'PROMOTION_HASH_REQUIRED' }
    const hash = sha256Hex(stableSerializeAdminReviewValue({ requestCoreHash, promotionHash }))
    return {
      ok: true,
      requestIntegrity: {
        hash,
        algorithm: ADMIN_REVIEW_INTEGRITY_ALGORITHM,
        generatedAt: '',
        inputs: {
          requestCoreHash,
          promotionHash,
        },
      },
      error: '',
    }
  } catch {
    return {
      ok: false,
      requestIntegrity: null,
      error: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.REQUEST_INTEGRITY_GENERATION_FAILED,
    }
  }
}

function blockedResult({ reason, approvalRequest, promotion, warnings = [], diagnostics = {} }) {
  return {
    approvalCreated: false,
    secondApproval: null,
    blockedReason: reason,
    hardRuleViolations: [
      ...asArray(approvalRequest?.hardRuleViolations),
      ...asArray(promotion?.hardRuleViolations),
    ],
    warnings,
    diagnostics: {
      requestIdPresent: Boolean(clean(approvalRequest?.requestId)),
      promotionIdPresent: Boolean(clean(promotion?.promotionId)),
      promotionHashPresent: Boolean(clean(promotion?.integrity?.hash)),
      ...diagnostics,
    },
  }
}

export function createAdminReviewSecondApproval({
  approvalRequest,
  promotion,
  secondApprovalEligibility = {},
  currentActor = null,
  existingSecondApprovals = [],
  options = {},
} = {}) {
  if (!approvalRequest) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.REQUEST_REQUIRED })
  }
  if (!promotion) {
    return blockedResult({
      reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.PROMOTION_REQUIRED,
      approvalRequest,
    })
  }

  const requestId = clean(approvalRequest.requestId)
  const eligibleRequest = asArray(secondApprovalEligibility.eligibleRequests)
    .find((request) => clean(request?.requestId) === requestId)
  if (!requestId) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.REQUEST_ID_REQUIRED, approvalRequest, promotion })
  }
  if (approvalRequest.status !== ADMIN_REVIEW_APPROVAL_REQUEST_STATUS) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.REQUEST_STATUS_INVALID, approvalRequest, promotion })
  }
  if (approvalRequest.secondApproval !== null && approvalRequest.secondApproval !== undefined) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.REQUEST_ALREADY_APPROVED, approvalRequest, promotion })
  }
  if (!eligibleRequest) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.REQUEST_NOT_ELIGIBLE, approvalRequest, promotion })
  }
  if (
    promotion.integrityStatus !== ADMIN_REVIEW_INTEGRITY_STATUS.VERIFIED
    || promotion.integrityVerification?.eligibleForFutureApproval !== true
  ) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.PROMOTION_NOT_VERIFIED, approvalRequest, promotion })
  }
  if (clean(approvalRequest.basedOn?.promotionIntegrityHash) !== clean(promotion.integrity?.hash)) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.PROMOTION_HASH_MISMATCH, approvalRequest, promotion })
  }

  const actorResult = normalizeAdminReviewActor(currentActor)
  if (actorResult.warning || !actorPresent(actorResult.actor)) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.ACTOR_REQUIRED, approvalRequest, promotion })
  }
  if (sameActor(approvalRequest.requestedBy, actorResult.actor)) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.SAME_ACTOR_NOT_ALLOWED, approvalRequest, promotion })
  }
  const actorRole = normalizeRole(actorResult.actor.role)
  if (!ADMIN_REVIEW_SECOND_APPROVAL_ALLOWED_ROLES.includes(actorRole)) {
    return blockedResult({
      reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.ACTOR_ROLE_NOT_ALLOWED,
      approvalRequest,
      promotion,
      diagnostics: { actorRoleAllowed: false },
    })
  }
  if (asArray(approvalRequest.hardRuleViolations).length || asArray(promotion.hardRuleViolations).length) {
    return blockedResult({ reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.HARD_RULE_VIOLATIONS, approvalRequest, promotion })
  }
  const existingApproval = asArray(existingSecondApprovals).find((approval) => (
    clean(approval?.requestId) === requestId
    && clean(approval?.status) === ADMIN_REVIEW_SECOND_APPROVAL_STATUS
  ))
  if (existingApproval) {
    return blockedResult({
      reason: ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.SECOND_APPROVAL_ALREADY_EXISTS,
      approvalRequest,
      promotion,
      diagnostics: { existingSecondApprovalId: existingApproval.secondApprovalId ?? null },
    })
  }

  const integrityResult = buildAdminReviewApprovalRequestIntegrity({ approvalRequest, promotion })
  if (!integrityResult.ok) {
    return blockedResult({
      reason: integrityResult.error || ADMIN_REVIEW_SECOND_APPROVAL_CREATE_BLOCK_REASONS.REQUEST_INTEGRITY_GENERATION_FAILED,
      approvalRequest,
      promotion,
    })
  }

  const approvedAt = typeof options.now === 'function' ? options.now() : new Date().toISOString()
  const requestIntegrity = {
    ...integrityResult.requestIntegrity,
    generatedAt: approvedAt,
  }
  const secondApprovalId = `admin-review-second-approval-${sha256Hex(`${requestId}:${approvedAt}:${actorResult.actor.userId ?? actorResult.actor.email}`).slice(0, 16)}`
  const secondApproval = {
    secondApprovalId,
    type: ADMIN_REVIEW_SECOND_APPROVAL_TYPE,
    status: ADMIN_REVIEW_SECOND_APPROVAL_STATUS,
    requestId,
    promotionId: clean(promotion.promotionId),
    draftId: clean(promotion.draftId),
    revisionNumber: Number(promotion.revisionNumber),
    approvedAt,
    approvedBy: actorResult.actor,
    requestIntegrity,
    basedOn: {
      requestId,
      requestHash: requestIntegrity.hash,
      promotionIntegrityHash: promotion.integrity.hash,
      promotionWorkflowVersion: clean(promotion.integrity.workflowVersion),
      appliedDecisionIds: asArray(promotion.appliedDecisionIds).map(clean).filter(Boolean),
      skippedDecisionIds: asArray(promotion.skippedDecisionIds).map(clean).filter(Boolean),
    },
    warnings: ['OFFICIALIZATION_NOT_PERFORMED'],
    diagnostics: {
      source: 'admin_review_second_approval',
      eligibilityStatus: 'SECOND_APPROVAL_ELIGIBLE_AT_CREATE_TIME',
      requestIntegrityVerified: true,
      officializationPerformed: false,
    },
    isOfficial: false,
  }

  return {
    approvalCreated: true,
    secondApproval,
    blockedReason: '',
    hardRuleViolations: [],
    warnings: secondApproval.warnings,
    diagnostics: secondApproval.diagnostics,
  }
}

export function appendAdminReviewSecondApproval(approvals = [], approval = {}) {
  if (!clean(approval?.secondApprovalId)) return asArray(approvals)
  if (asArray(approvals).some((current) => clean(current?.secondApprovalId) === clean(approval.secondApprovalId))) {
    return asArray(approvals)
  }
  return [...asArray(approvals), approval]
}
