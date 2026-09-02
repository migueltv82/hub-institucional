import {
  ADMIN_REVIEW_APPROVAL_REQUEST_STATUS,
  ADMIN_REVIEW_APPROVAL_REQUEST_TYPE,
} from './adminReviewApprovalRequest.js'

export const ADMIN_REVIEW_SECOND_APPROVAL_ALLOWED_ROLES = Object.freeze([
  'superadmin',
  'admin_instituto',
])

export const ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS = Object.freeze({
  REQUEST_REQUIRED: 'REQUEST_REQUIRED',
  REQUEST_ID_REQUIRED: 'REQUEST_ID_REQUIRED',
  INVALID_REQUEST_TYPE: 'INVALID_REQUEST_TYPE',
  INVALID_REQUEST_STATUS: 'INVALID_REQUEST_STATUS',
  SECOND_APPROVAL_NOT_REQUIRED: 'SECOND_APPROVAL_NOT_REQUIRED',
  SECOND_APPROVAL_ALREADY_RECORDED: 'SECOND_APPROVAL_ALREADY_RECORDED',
  PROMOTION_ID_REQUIRED: 'PROMOTION_ID_REQUIRED',
  DRAFT_ID_REQUIRED: 'DRAFT_ID_REQUIRED',
  REVISION_NUMBER_REQUIRED: 'REVISION_NUMBER_REQUIRED',
  PROMOTION_NOT_FOUND: 'PROMOTION_NOT_FOUND',
  PROMOTION_NOT_ELIGIBLE: 'PROMOTION_NOT_ELIGIBLE',
  PROMOTION_SUPERSEDED: 'PROMOTION_SUPERSEDED',
  PROMOTION_NOT_LATEST_REVISION: 'PROMOTION_NOT_LATEST_REVISION',
  AMBIGUOUS_PROMOTION_REVISION: 'AMBIGUOUS_PROMOTION_REVISION',
  PROMOTION_REVISION_MISMATCH: 'PROMOTION_REVISION_MISMATCH',
  PROMOTION_INTEGRITY_HASH_MISMATCH: 'PROMOTION_INTEGRITY_HASH_MISMATCH',
  INITIAL_REQUESTER_REQUIRED: 'INITIAL_REQUESTER_REQUIRED',
  CURRENT_ACTOR_REQUIRED: 'CURRENT_ACTOR_REQUIRED',
  SAME_ACTOR_NOT_ALLOWED: 'SAME_ACTOR_NOT_ALLOWED',
  CURRENT_ACTOR_ROLE_NOT_ALLOWED: 'CURRENT_ACTOR_ROLE_NOT_ALLOWED',
  HARD_RULE_VIOLATIONS: 'HARD_RULE_VIOLATIONS',
  BLOCKING_WARNINGS: 'BLOCKING_WARNINGS',
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

function actorIdentityPresent(actor = null) {
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

function isPositiveRevision(value) {
  const revision = Number(value)
  return Number.isInteger(revision) && revision > 0
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function blockingWarningsFor(request = {}, options = {}) {
  const explicitCodes = new Set(asArray(options.blockingWarningCodes).map(clean).filter(Boolean))
  return asArray(request?.warnings).map(clean).filter((warning) => (
    explicitCodes.has(warning)
    || warning.startsWith('BLOCKING_')
    || warning.startsWith('HARD_RULE')
    || warning === 'INTEGRITY_MISMATCH'
  ))
}

function blockedEntry(request, reasons) {
  return {
    requestId: clean(request?.requestId),
    promotionId: clean(request?.promotionId),
    draftId: clean(request?.draftId),
    revisionNumber: Number(request?.revisionNumber ?? 0),
    reasons: unique(reasons),
    request,
  }
}

export function buildAdminReviewSecondApprovalEligibility({
  approvalRequests = [],
  promotions = [],
  approvalEligibility = {},
  currentActor = null,
  options = {},
} = {}) {
  const allowedRoles = new Set(
    asArray(options.allowedRoles).length
      ? asArray(options.allowedRoles).map(normalizeRole)
      : ADMIN_REVIEW_SECOND_APPROVAL_ALLOWED_ROLES,
  )
  const promotionsById = new Map(asArray(promotions).map((promotion) => [clean(promotion?.promotionId), promotion]))
  const eligiblePromotionIds = new Set(asArray(approvalEligibility.eligiblePromotions).map((promotion) => clean(promotion?.promotionId)))
  const supersededPromotionIds = new Set(asArray(approvalEligibility.supersededPromotions).map((entry) => clean(entry?.promotionId)))
  const ambiguousDraftIds = new Set(asArray(approvalEligibility.warnings)
    .filter((warning) => clean(warning).startsWith('DUPLICATE_LATEST_REVISION:'))
    .map((warning) => clean(warning).split(':')[1])
    .filter(Boolean))
  const eligibleRequests = []
  const blockedRequests = []
  const warnings = []
  const currentActorPresent = actorIdentityPresent(currentActor)
  const currentActorRole = normalizeRole(currentActor?.role ?? currentActor?.accountRole)

  if (!currentActorPresent) warnings.push('CURRENT_ACTOR_UNAVAILABLE')
  else if (!allowedRoles.has(currentActorRole)) warnings.push(`CURRENT_ACTOR_ROLE_NOT_ALLOWED:${currentActorRole || 'missing'}`)

  asArray(approvalRequests).forEach((request) => {
    const reasons = []
    if (!request || typeof request !== 'object') {
      blockedRequests.push(blockedEntry(request, [ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.REQUEST_REQUIRED]))
      return
    }

    const requestId = clean(request.requestId)
    const promotionId = clean(request.promotionId)
    const draftId = clean(request.draftId)
    const promotion = promotionsById.get(promotionId)
    const latestPromotion = approvalEligibility.latestPromotionByDraft?.[draftId]

    if (!requestId) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.REQUEST_ID_REQUIRED)
    if (request.type !== ADMIN_REVIEW_APPROVAL_REQUEST_TYPE) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.INVALID_REQUEST_TYPE)
    if (request.status !== ADMIN_REVIEW_APPROVAL_REQUEST_STATUS) {
      reasons.push(`${ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.INVALID_REQUEST_STATUS}:${clean(request.status) || 'missing'}`)
    }
    if (request.requiresSecondApproval !== true) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.SECOND_APPROVAL_NOT_REQUIRED)
    if (request.secondApproval !== null && request.secondApproval !== undefined) {
      reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.SECOND_APPROVAL_ALREADY_RECORDED)
    }
    if (!promotionId) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.PROMOTION_ID_REQUIRED)
    if (!draftId) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.DRAFT_ID_REQUIRED)
    if (!isPositiveRevision(request.revisionNumber)) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.REVISION_NUMBER_REQUIRED)
    if (!promotion) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.PROMOTION_NOT_FOUND)
    if (supersededPromotionIds.has(promotionId)) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.PROMOTION_SUPERSEDED)
    if (ambiguousDraftIds.has(draftId)) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.AMBIGUOUS_PROMOTION_REVISION)
    if (promotion && !eligiblePromotionIds.has(promotionId)) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.PROMOTION_NOT_ELIGIBLE)
    if (promotion && (!latestPromotion || clean(latestPromotion.promotionId) !== promotionId)) {
      reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.PROMOTION_NOT_LATEST_REVISION)
    }
    if (promotion && Number(promotion.revisionNumber) !== Number(request.revisionNumber)) {
      reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.PROMOTION_REVISION_MISMATCH)
    }
    if (promotion && clean(request.basedOn?.promotionIntegrityHash) !== clean(promotion.integrity?.hash)) {
      reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.PROMOTION_INTEGRITY_HASH_MISMATCH)
    }
    if (!actorIdentityPresent(request.requestedBy)) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.INITIAL_REQUESTER_REQUIRED)
    if (!currentActorPresent) reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.CURRENT_ACTOR_REQUIRED)
    if (currentActorPresent && sameActor(request.requestedBy, currentActor)) {
      reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.SAME_ACTOR_NOT_ALLOWED)
    }
    if (currentActorPresent && !allowedRoles.has(currentActorRole)) {
      reasons.push(`${ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.CURRENT_ACTOR_ROLE_NOT_ALLOWED}:${currentActorRole || 'missing'}`)
    }
    if (asArray(promotion?.hardRuleViolations).length || asArray(request.hardRuleViolations).length) {
      reasons.push(ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.HARD_RULE_VIOLATIONS)
    }
    const blockingWarnings = blockingWarningsFor(request, options)
    if (blockingWarnings.length) {
      reasons.push(`${ADMIN_REVIEW_SECOND_APPROVAL_BLOCK_REASONS.BLOCKING_WARNINGS}:${blockingWarnings.join('|')}`)
    }

    if (reasons.length) blockedRequests.push(blockedEntry(request, reasons))
    else eligibleRequests.push(request)
  })

  const blockedReasonCounts = blockedRequests.reduce((counts, entry) => {
    entry.reasons.forEach((reason) => {
      const code = reason.split(':')[0]
      counts[code] = Number(counts[code] ?? 0) + 1
    })
    return counts
  }, {})

  return {
    eligibleRequests,
    blockedRequests,
    warnings: unique(warnings),
    diagnostics: {
      totalRequests: asArray(approvalRequests).length,
      eligibleRequests: eligibleRequests.length,
      blockedRequests: blockedRequests.length,
      allowedRoles: [...allowedRoles].sort(),
      blockedReasonCounts,
    },
  }
}
