import {
  normalizeAdminReviewActor,
  sha256Hex,
  stableSerializeAdminReviewValue,
} from './adminReviewPromotionWorkflow.js'
import {
  ADMIN_REVIEW_FINAL_CANDIDATE_STATUS,
  ADMIN_REVIEW_FINAL_CANDIDATE_TYPE,
} from './adminReviewFinalReadiness.js'

export const ADMIN_REVIEW_OFFICIALIZATION_PLAN_TYPE = 'ADMIN_REVIEW_OFFICIALIZATION_PLAN'
export const ADMIN_REVIEW_OFFICIALIZATION_PLAN_STATUS = 'READY_FOR_SERVER_OFFICIALIZATION'

export const ADMIN_REVIEW_REQUIRED_SERVER_CHECKS = Object.freeze([
  'AUTHORIZATION',
  'HASH_REVERIFICATION',
  'CURRENT_OFFICIAL_SCHEDULE_RECHECK',
  'APPEND_ONLY_EVENT_WRITE',
  'NO_DIRECT_OVERWRITE',
])

export const ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS = Object.freeze({
  READINESS_NOT_READY: 'OFFICIALIZATION_PLAN_READINESS_NOT_READY',
  FINAL_CANDIDATE_REQUIRED: 'OFFICIALIZATION_PLAN_FINAL_CANDIDATE_REQUIRED',
  INVALID_CANDIDATE_TYPE: 'OFFICIALIZATION_PLAN_INVALID_CANDIDATE_TYPE',
  INVALID_CANDIDATE_STATUS: 'OFFICIALIZATION_PLAN_INVALID_CANDIDATE_STATUS',
  CANDIDATE_ALREADY_OFFICIAL: 'OFFICIALIZATION_PLAN_CANDIDATE_ALREADY_OFFICIAL',
  FINAL_CANDIDATE_HASH_REQUIRED: 'OFFICIALIZATION_PLAN_FINAL_CANDIDATE_HASH_REQUIRED',
  SOURCE_HASHES_REQUIRED: 'OFFICIALIZATION_PLAN_SOURCE_HASHES_REQUIRED',
  ACTOR_REQUIRED: 'OFFICIALIZATION_PLAN_ACTOR_REQUIRED',
  ACTOR_ROLE_NOT_ALLOWED: 'OFFICIALIZATION_PLAN_ACTOR_ROLE_NOT_ALLOWED',
  DISTINCT_PREPARER_REQUIRED: 'OFFICIALIZATION_PLAN_DISTINCT_PREPARER_REQUIRED',
  CURRENT_SCHEDULE_STATE_REQUIRED: 'OFFICIALIZATION_PLAN_CURRENT_SCHEDULE_STATE_REQUIRED',
  CURRENT_SCHEDULE_FINGERPRINT_REQUIRED: 'OFFICIALIZATION_PLAN_CURRENT_SCHEDULE_FINGERPRINT_REQUIRED',
  PROPOSED_SCHEDULE_FINGERPRINT_REQUIRED: 'OFFICIALIZATION_PLAN_PROPOSED_SCHEDULE_FINGERPRINT_REQUIRED',
  PROPOSED_SCHEDULE_EMPTY: 'OFFICIALIZATION_PLAN_PROPOSED_SCHEDULE_EMPTY',
  INHERITED_HARD_RULE_VIOLATIONS: 'OFFICIALIZATION_PLAN_INHERITED_HARD_RULE_VIOLATIONS',
  INHERITED_BLOCKED_REASONS: 'OFFICIALIZATION_PLAN_INHERITED_BLOCKED_REASONS',
  DIRECT_OVERWRITE_NOT_ALLOWED: 'OFFICIALIZATION_PLAN_DIRECT_OVERWRITE_NOT_ALLOWED',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function unique(values = []) {
  return [...new Set(asArray(values).map(clean).filter(Boolean))]
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

function cloneProposedSchedule(schedule = []) {
  return asArray(schedule).map((mesa) => ({
    ...mesa,
    vocales: asArray(mesa?.vocales).map((vocal) => ({ ...vocal })),
    isOfficial: false,
    confirmada: false,
    valid: false,
  }))
}

export function fingerprintAdminReviewSchedule(schedule) {
  if (!Array.isArray(schedule)) return ''
  try {
    return sha256Hex(stableSerializeAdminReviewValue(schedule))
  } catch {
    return ''
  }
}

export function buildAdminReviewOfficializationPlan(input = {}) {
  const {
    finalReadiness = {},
    currentOfficialSchedule,
    currentActor = null,
    options = {},
  } = input
  const blockedReasons = []
  const warnings = []
  const finalCandidate = finalReadiness?.finalCandidate ?? null
  const allowedRoles = new Set(
    asArray(options.allowedRoles).length
      ? asArray(options.allowedRoles).map(normalizeRole)
      : ['superadmin', 'admin_instituto'],
  )

  if (finalReadiness?.ready !== true) {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.READINESS_NOT_READY)
  }
  if (!finalCandidate) {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.FINAL_CANDIDATE_REQUIRED)
  } else {
    if (finalCandidate.type !== ADMIN_REVIEW_FINAL_CANDIDATE_TYPE) {
      blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.INVALID_CANDIDATE_TYPE)
    }
    if (finalCandidate.status !== ADMIN_REVIEW_FINAL_CANDIDATE_STATUS) {
      blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.INVALID_CANDIDATE_STATUS)
    }
    if (finalCandidate.isOfficial !== false) {
      blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.CANDIDATE_ALREADY_OFFICIAL)
    }
    if (!clean(finalCandidate.integrity?.hash)) {
      blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.FINAL_CANDIDATE_HASH_REQUIRED)
    }
    if (
      !clean(finalCandidate.basedOn?.promotionIntegrityHash)
      || !clean(finalCandidate.basedOn?.requestIntegrityHash)
      || !clean(finalCandidate.basedOn?.secondApprovalIntegrityHash)
    ) blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.SOURCE_HASHES_REQUIRED)
    if (!asArray(finalCandidate.schedule).length) {
      blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.PROPOSED_SCHEDULE_EMPTY)
    }
  }
  if (asArray(finalReadiness?.hardRuleViolations).length) {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.INHERITED_HARD_RULE_VIOLATIONS)
  }
  if (asArray(finalReadiness?.blockedReasons).length) {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.INHERITED_BLOCKED_REASONS)
  }

  const actorResult = normalizeAdminReviewActor(currentActor)
  const preparedBy = actorResult.actor
  if (actorResult.warning || !actorPresent(preparedBy)) {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.ACTOR_REQUIRED)
  } else if (!allowedRoles.has(normalizeRole(preparedBy.role))) {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.ACTOR_ROLE_NOT_ALLOWED)
  }
  if (finalCandidate && actorPresent(preparedBy) && sameActor(preparedBy, finalCandidate.approvedBy)) {
    if (options.requireDistinctPreparer === true) {
      blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.DISTINCT_PREPARER_REQUIRED)
    } else {
      warnings.push('PREPARER_MATCHES_SECOND_APPROVER_TECHNICAL_PLAN_ONLY')
    }
  }

  const currentScheduleStateProvided = Object.prototype.hasOwnProperty.call(input, 'currentOfficialSchedule')
  if (!currentScheduleStateProvided || !Array.isArray(currentOfficialSchedule)) {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.CURRENT_SCHEDULE_STATE_REQUIRED)
  }
  if (options.willReplaceOfficialSchedule === true || clean(options.mode).toUpperCase() === 'DIRECT_OVERWRITE') {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.DIRECT_OVERWRITE_NOT_ALLOWED)
  }

  const proposedSchedule = cloneProposedSchedule(finalCandidate?.schedule)
  const currentOfficialScheduleFingerprint = currentScheduleStateProvided && Array.isArray(currentOfficialSchedule)
    ? fingerprintAdminReviewSchedule(currentOfficialSchedule)
    : ''
  const proposedOfficialScheduleFingerprint = proposedSchedule.length
    ? fingerprintAdminReviewSchedule(proposedSchedule)
    : ''
  if (!currentOfficialScheduleFingerprint) {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.CURRENT_SCHEDULE_FINGERPRINT_REQUIRED)
  }
  if (!proposedOfficialScheduleFingerprint) {
    blockedReasons.push(ADMIN_REVIEW_OFFICIALIZATION_PLAN_BLOCK_REASONS.PROPOSED_SCHEDULE_FINGERPRINT_REQUIRED)
  }

  const finalBlockedReasons = unique(blockedReasons)
  const canPrepareOfficialization = finalBlockedReasons.length === 0
  const preparedAt = typeof options.now === 'function' ? options.now() : new Date().toISOString()
  const planIdentity = canPrepareOfficialization
    ? sha256Hex(stableSerializeAdminReviewValue({
        candidateId: finalCandidate.candidateId,
        preparedAt,
        preparedBy: clean(preparedBy.userId) || clean(preparedBy.email),
        currentOfficialScheduleFingerprint,
        proposedOfficialScheduleFingerprint,
      }))
    : ''
  const officializationPlan = canPrepareOfficialization ? {
    planId: `admin-review-officialization-plan-${planIdentity.slice(0, 16)}`,
    type: ADMIN_REVIEW_OFFICIALIZATION_PLAN_TYPE,
    status: ADMIN_REVIEW_OFFICIALIZATION_PLAN_STATUS,
    candidateId: finalCandidate.candidateId,
    promotionId: finalCandidate.promotionId,
    requestId: finalCandidate.requestId,
    secondApprovalId: finalCandidate.secondApprovalId,
    draftId: finalCandidate.draftId,
    revisionNumber: Number(finalCandidate.revisionNumber),
    preparedAt,
    preparedBy: {
      userId: preparedBy.userId,
      displayName: preparedBy.displayName,
      email: preparedBy.email,
      role: preparedBy.role,
    },
    basedOn: {
      finalCandidateHash: clean(finalCandidate.integrity?.hash),
      promotionIntegrityHash: clean(finalCandidate.basedOn?.promotionIntegrityHash),
      requestIntegrityHash: clean(finalCandidate.basedOn?.requestIntegrityHash),
      secondApprovalIntegrityHash: clean(finalCandidate.basedOn?.secondApprovalIntegrityHash),
      appliedDecisionIds: unique(finalCandidate.basedOn?.appliedDecisionIds),
      skippedDecisionIds: unique(finalCandidate.basedOn?.skippedDecisionIds),
    },
    currentOfficialScheduleFingerprint,
    proposedOfficialScheduleFingerprint,
    proposedSchedule,
    requiredServerChecks: [...ADMIN_REVIEW_REQUIRED_SERVER_CHECKS],
    isOfficial: false,
    willReplaceOfficialSchedule: false,
  } : null

  return {
    canPrepareOfficialization,
    officializationPlan,
    blockedReasons: finalBlockedReasons,
    warnings: unique([...warnings, ...asArray(finalReadiness?.warnings)]),
    diagnostics: {
      readinessReady: finalReadiness?.ready === true,
      finalCandidatePresent: Boolean(finalCandidate),
      actorPresent: actorPresent(preparedBy),
      actorRoleAllowed: actorPresent(preparedBy) && allowedRoles.has(normalizeRole(preparedBy.role)),
      currentOfficialSchedulePresent: currentScheduleStateProvided && Array.isArray(currentOfficialSchedule),
      currentOfficialScheduleCount: asArray(currentOfficialSchedule).length,
      proposedScheduleCount: proposedSchedule.length,
      currentFingerprintPresent: Boolean(currentOfficialScheduleFingerprint),
      proposedFingerprintPresent: Boolean(proposedOfficialScheduleFingerprint),
      requiredServerChecks: ADMIN_REVIEW_REQUIRED_SERVER_CHECKS.length,
      blockedReasons: finalBlockedReasons.length,
    },
  }
}
