import {
  ADMIN_REVIEW_OFFICIALIZATION_PLAN_STATUS,
  ADMIN_REVIEW_OFFICIALIZATION_PLAN_TYPE,
  ADMIN_REVIEW_REQUIRED_SERVER_CHECKS,
  fingerprintAdminReviewSchedule,
} from './adminReviewOfficializationPlan.js'
import { sha256Hex, stableSerializeAdminReviewValue } from './adminReviewPromotionWorkflow.js'

export const ADMIN_REVIEW_OFFICIALIZATION_EVENT_TYPE = 'ADMIN_REVIEW_OFFICIALIZATION_EVENT'
export const ADMIN_REVIEW_OFFICIALIZATION_EVENT_STATUS = 'OFFICIALIZED'
export const OFFICIAL_EXAM_SCHEDULE_VERSION_SOURCE = 'admin_review_officialization'
export const OFFICIAL_EXAM_SCHEDULE_VERSION_STATUSES = Object.freeze([
  'ACTIVE',
  'SUPERSEDED',
  'ROLLED_BACK',
])

export const ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS = Object.freeze({
  PLAN_REQUIRED: 'SERVER_OFFICIALIZATION_PLAN_REQUIRED',
  PLAN_TYPE_INVALID: 'SERVER_OFFICIALIZATION_PLAN_TYPE_INVALID',
  PLAN_STATUS_INVALID: 'SERVER_OFFICIALIZATION_PLAN_STATUS_INVALID',
  PLAN_ALREADY_OFFICIAL: 'SERVER_OFFICIALIZATION_PLAN_ALREADY_OFFICIAL',
  DIRECT_OVERWRITE_NOT_ALLOWED: 'SERVER_OFFICIALIZATION_DIRECT_OVERWRITE_NOT_ALLOWED',
  INSTITUTION_REQUIRED: 'SERVER_OFFICIALIZATION_INSTITUTION_REQUIRED',
  WORKSPACE_REQUIRED: 'SERVER_OFFICIALIZATION_WORKSPACE_REQUIRED',
  ACTOR_REQUIRED: 'SERVER_OFFICIALIZATION_ACTOR_REQUIRED',
  ACTOR_ROLE_NOT_ALLOWED: 'SERVER_OFFICIALIZATION_ACTOR_ROLE_NOT_ALLOWED',
  REQUIRED_SERVER_CHECKS_MISSING: 'SERVER_OFFICIALIZATION_REQUIRED_CHECKS_MISSING',
  ADMINISTRATIVE_CHAIN_NOT_REVERIFIED: 'SERVER_OFFICIALIZATION_ADMINISTRATIVE_CHAIN_NOT_REVERIFIED',
  READINESS_NOT_REVERIFIED: 'SERVER_OFFICIALIZATION_READINESS_NOT_REVERIFIED',
  HASHES_NOT_REVERIFIED: 'SERVER_OFFICIALIZATION_HASHES_NOT_REVERIFIED',
  HARD_RULES_NOT_REVERIFIED: 'SERVER_OFFICIALIZATION_HARD_RULES_NOT_REVERIFIED',
  BLOCKED_DATES_NOT_REVERIFIED: 'SERVER_OFFICIALIZATION_BLOCKED_DATES_NOT_REVERIFIED',
  LATEST_REVISION_NOT_REVERIFIED: 'SERVER_OFFICIALIZATION_LATEST_REVISION_NOT_REVERIFIED',
  CURRENT_SCHEDULE_FINGERPRINT_MISMATCH: 'SERVER_OFFICIALIZATION_CURRENT_SCHEDULE_FINGERPRINT_MISMATCH',
  PROPOSED_SCHEDULE_FINGERPRINT_MISMATCH: 'SERVER_OFFICIALIZATION_PROPOSED_SCHEDULE_FINGERPRINT_MISMATCH',
  PROPOSED_SCHEDULE_EMPTY: 'SERVER_OFFICIALIZATION_PROPOSED_SCHEDULE_EMPTY',
  OFFICIALIZATION_ALREADY_EXISTS: 'SERVER_OFFICIALIZATION_ALREADY_EXISTS',
  LATEST_PROMOTION_MISMATCH: 'SERVER_OFFICIALIZATION_LATEST_PROMOTION_MISMATCH',
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
  return Boolean(actor && clean(actor.userId))
}

function cloneOfficialSchedule(schedule = []) {
  return asArray(schedule).map((mesa) => ({
    ...mesa,
    vocales: asArray(mesa?.vocales).map((vocal) => ({ ...vocal })),
    isOfficial: true,
  }))
}

function requiredHashesPresent(plan = {}) {
  return Boolean(
    clean(plan.basedOn?.finalCandidateHash)
    && clean(plan.basedOn?.promotionIntegrityHash)
    && clean(plan.basedOn?.requestIntegrityHash)
    && clean(plan.basedOn?.secondApprovalIntegrityHash),
  )
}

function buildId(prefix, value) {
  return `${prefix}-${sha256Hex(stableSerializeAdminReviewValue(value)).slice(0, 20)}`
}

export function validateAdminReviewOfficializationEventContract(event = {}) {
  const errors = []
  if (!clean(event.officializationId)) errors.push('OFFICIALIZATION_ID_REQUIRED')
  if (event.type !== ADMIN_REVIEW_OFFICIALIZATION_EVENT_TYPE) errors.push('OFFICIALIZATION_TYPE_INVALID')
  if (event.status !== ADMIN_REVIEW_OFFICIALIZATION_EVENT_STATUS) errors.push('OFFICIALIZATION_STATUS_INVALID')
  if (!clean(event.institutionId)) errors.push('INSTITUTION_ID_REQUIRED')
  if (!clean(event.workspaceKey)) errors.push('WORKSPACE_KEY_REQUIRED')
  if (!clean(event.planId) || !clean(event.candidateId)) errors.push('PLAN_AND_CANDIDATE_REQUIRED')
  if (!clean(event.previousOfficialVersionId) && event.previousOfficialVersionId !== null) errors.push('PREVIOUS_VERSION_INVALID')
  if (!clean(event.newOfficialVersionId)) errors.push('NEW_VERSION_REQUIRED')
  if (!actorPresent(event.officializedBy)) errors.push('OFFICIALIZED_ACTOR_REQUIRED')
  if (!requiredHashesPresent({ basedOn: event.basedOn })) errors.push('SOURCE_HASHES_REQUIRED')
  ADMIN_REVIEW_REQUIRED_SERVER_CHECKS.forEach((check) => {
    const field = {
      AUTHORIZATION: 'authorization',
      HASH_REVERIFICATION: 'hashReverification',
      CURRENT_OFFICIAL_SCHEDULE_RECHECK: 'currentScheduleRecheck',
      APPEND_ONLY_EVENT_WRITE: 'appendOnlyWrite',
      NO_DIRECT_OVERWRITE: 'noDirectOverwrite',
    }[check]
    if (event.serverVerification?.[field] !== 'PASSED') errors.push(`SERVER_CHECK_NOT_PASSED:${check}`)
  })
  if (event.isOfficial !== true) errors.push('EVENT_MUST_BE_OFFICIAL')

  return {
    valid: errors.length === 0,
    errors: unique(errors),
    diagnostics: {
      officializationIdPresent: Boolean(clean(event.officializationId)),
      institutionIdPresent: Boolean(clean(event.institutionId)),
      workspaceKeyPresent: Boolean(clean(event.workspaceKey)),
      sourceHashesPresent: requiredHashesPresent({ basedOn: event.basedOn }),
      serverChecksPassed: ADMIN_REVIEW_REQUIRED_SERVER_CHECKS.length - errors.filter((error) => error.startsWith('SERVER_CHECK_NOT_PASSED:')).length,
    },
  }
}

export function validateOfficialExamScheduleVersionContract(version = {}) {
  const errors = []
  if (!clean(version.versionId)) errors.push('VERSION_ID_REQUIRED')
  if (!clean(version.institutionId)) errors.push('INSTITUTION_ID_REQUIRED')
  if (!clean(version.workspaceKey)) errors.push('WORKSPACE_KEY_REQUIRED')
  if (version.source !== OFFICIAL_EXAM_SCHEDULE_VERSION_SOURCE) errors.push('VERSION_SOURCE_INVALID')
  if (!OFFICIAL_EXAM_SCHEDULE_VERSION_STATUSES.includes(clean(version.status).toUpperCase())) errors.push('VERSION_STATUS_INVALID')
  if (!clean(version.scheduleFingerprint)) errors.push('SCHEDULE_FINGERPRINT_REQUIRED')
  if (!asArray(version.schedule).length) errors.push('VERSION_SCHEDULE_EMPTY')
  if (fingerprintAdminReviewSchedule(version.schedule) !== clean(version.scheduleFingerprint)) errors.push('VERSION_FINGERPRINT_MISMATCH')
  if (!clean(version.basedOnOfficializationId)) errors.push('OFFICIALIZATION_REFERENCE_REQUIRED')
  if (!actorPresent(version.createdBy)) errors.push('VERSION_ACTOR_REQUIRED')
  if (version.isOfficial !== true) errors.push('VERSION_MUST_BE_OFFICIAL')

  return {
    valid: errors.length === 0,
    errors: unique(errors),
    diagnostics: {
      versionIdPresent: Boolean(clean(version.versionId)),
      scheduleCount: asArray(version.schedule).length,
      fingerprintPresent: Boolean(clean(version.scheduleFingerprint)),
      officializationReferencePresent: Boolean(clean(version.basedOnOfficializationId)),
    },
  }
}

export function buildAdminReviewOfficializationServerPreflight({
  plan,
  institutionId,
  workspaceKey = 'main',
  authenticatedActor = null,
  currentOfficialSchedule,
  activeOfficialVersion = null,
  existingOfficializationEvents = [],
  latestPromotion = null,
  serverRevalidation = {},
  options = {},
} = {}) {
  const blockedReasons = []
  const warnings = []
  const allowedRoles = new Set(
    asArray(options.allowedRoles).length
      ? asArray(options.allowedRoles).map(normalizeRole)
      : ['superadmin', 'admin_instituto'],
  )

  if (!plan) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.PLAN_REQUIRED)
  if (plan && plan.type !== ADMIN_REVIEW_OFFICIALIZATION_PLAN_TYPE) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.PLAN_TYPE_INVALID)
  if (plan && plan.status !== ADMIN_REVIEW_OFFICIALIZATION_PLAN_STATUS) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.PLAN_STATUS_INVALID)
  if (plan?.isOfficial !== false) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.PLAN_ALREADY_OFFICIAL)
  if (plan?.willReplaceOfficialSchedule !== false) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.DIRECT_OVERWRITE_NOT_ALLOWED)
  if (!clean(institutionId)) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.INSTITUTION_REQUIRED)
  if (!clean(workspaceKey)) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.WORKSPACE_REQUIRED)
  if (!actorPresent(authenticatedActor)) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.ACTOR_REQUIRED)
  else if (!allowedRoles.has(normalizeRole(authenticatedActor.role))) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.ACTOR_ROLE_NOT_ALLOWED)

  const missingChecks = ADMIN_REVIEW_REQUIRED_SERVER_CHECKS.filter((check) => !asArray(plan?.requiredServerChecks).includes(check))
  if (missingChecks.length) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.REQUIRED_SERVER_CHECKS_MISSING)
  if (serverRevalidation.administrativeChainPassed !== true) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.ADMINISTRATIVE_CHAIN_NOT_REVERIFIED)
  if (serverRevalidation.readinessPassed !== true) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.READINESS_NOT_REVERIFIED)
  if (serverRevalidation.hashesPassed !== true || !requiredHashesPresent(plan)) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.HASHES_NOT_REVERIFIED)
  if (serverRevalidation.hardRulesPassed !== true) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.HARD_RULES_NOT_REVERIFIED)
  if (serverRevalidation.blockedDatesPassed !== true) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.BLOCKED_DATES_NOT_REVERIFIED)
  if (serverRevalidation.latestRevisionPassed !== true) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.LATEST_REVISION_NOT_REVERIFIED)

  const currentFingerprint = Array.isArray(currentOfficialSchedule)
    ? fingerprintAdminReviewSchedule(currentOfficialSchedule)
    : ''
  const proposedFingerprint = fingerprintAdminReviewSchedule(plan?.proposedSchedule)
  if (!currentFingerprint || currentFingerprint !== clean(plan?.currentOfficialScheduleFingerprint)) {
    blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.CURRENT_SCHEDULE_FINGERPRINT_MISMATCH)
  }
  if (!asArray(plan?.proposedSchedule).length) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.PROPOSED_SCHEDULE_EMPTY)
  if (!proposedFingerprint || proposedFingerprint !== clean(plan?.proposedOfficialScheduleFingerprint)) {
    blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.PROPOSED_SCHEDULE_FINGERPRINT_MISMATCH)
  }
  if (asArray(existingOfficializationEvents).some((event) => (
    clean(event?.planId) === clean(plan?.planId)
    || clean(event?.candidateId) === clean(plan?.candidateId)
  ))) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.OFFICIALIZATION_ALREADY_EXISTS)
  if (latestPromotion && (
    clean(latestPromotion.promotionId) !== clean(plan?.promotionId)
    || Number(latestPromotion.revisionNumber) !== Number(plan?.revisionNumber)
  )) blockedReasons.push(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.LATEST_PROMOTION_MISMATCH)

  const finalBlockedReasons = unique(blockedReasons)
  const canCommit = finalBlockedReasons.length === 0
  const officializedAt = typeof options.now === 'function' ? options.now() : new Date().toISOString()
  const officializationId = canCommit ? buildId('admin-review-officialization', {
    institutionId,
    workspaceKey,
    planId: plan.planId,
    candidateId: plan.candidateId,
  }) : ''
  const newOfficialVersionId = canCommit ? buildId('official-exam-schedule-version', {
    officializationId,
    proposedFingerprint,
  }) : ''
  const previousOfficialVersionId = clean(activeOfficialVersion?.versionId) || null
  const officialSchedule = cloneOfficialSchedule(plan?.proposedSchedule)
  const officialScheduleFingerprint = fingerprintAdminReviewSchedule(officialSchedule)

  const officializationEvent = canCommit ? {
    officializationId,
    type: ADMIN_REVIEW_OFFICIALIZATION_EVENT_TYPE,
    status: ADMIN_REVIEW_OFFICIALIZATION_EVENT_STATUS,
    institutionId: clean(institutionId),
    workspaceKey: clean(workspaceKey),
    planId: plan.planId,
    candidateId: plan.candidateId,
    promotionId: plan.promotionId,
    requestId: plan.requestId,
    secondApprovalId: plan.secondApprovalId,
    draftId: plan.draftId,
    revisionNumber: Number(plan.revisionNumber),
    officializedAt,
    officializedBy: {
      userId: authenticatedActor.userId,
      role: authenticatedActor.role,
    },
    basedOn: {
      currentOfficialScheduleFingerprint: plan.currentOfficialScheduleFingerprint,
      proposedOfficialScheduleFingerprint: plan.proposedOfficialScheduleFingerprint,
      finalCandidateHash: plan.basedOn.finalCandidateHash,
      promotionIntegrityHash: plan.basedOn.promotionIntegrityHash,
      requestIntegrityHash: plan.basedOn.requestIntegrityHash,
      secondApprovalIntegrityHash: plan.basedOn.secondApprovalIntegrityHash,
    },
    previousOfficialVersionId,
    newOfficialVersionId,
    serverVerification: {
      authorization: 'PASSED',
      hashReverification: 'PASSED',
      currentScheduleRecheck: 'PASSED',
      appendOnlyWrite: 'PASSED',
      noDirectOverwrite: 'PASSED',
    },
    isOfficial: true,
  } : null
  const newOfficialVersion = canCommit ? {
    versionId: newOfficialVersionId,
    institutionId: clean(institutionId),
    workspaceKey: clean(workspaceKey),
    source: OFFICIAL_EXAM_SCHEDULE_VERSION_SOURCE,
    status: 'ACTIVE',
    createdAt: officializedAt,
    createdBy: {
      userId: authenticatedActor.userId,
      role: authenticatedActor.role,
    },
    scheduleFingerprint: officialScheduleFingerprint,
    schedule: officialSchedule,
    basedOnOfficializationId: officializationId,
    previousVersionId: previousOfficialVersionId,
    isOfficial: true,
  } : null
  const previousVersionUpdate = canCommit && previousOfficialVersionId ? {
    versionId: previousOfficialVersionId,
    status: 'SUPERSEDED',
    supersededByVersionId: newOfficialVersionId,
  } : null

  return {
    canCommit,
    officializationEvent,
    newOfficialVersion,
    previousVersionUpdate,
    blockedReasons: finalBlockedReasons,
    warnings: unique(warnings),
    diagnostics: {
      planPresent: Boolean(plan),
      institutionPresent: Boolean(clean(institutionId)),
      workspacePresent: Boolean(clean(workspaceKey)),
      authenticatedActorPresent: actorPresent(authenticatedActor),
      currentScheduleCount: asArray(currentOfficialSchedule).length,
      proposedScheduleCount: asArray(plan?.proposedSchedule).length,
      currentFingerprintMatched: Boolean(currentFingerprint && currentFingerprint === clean(plan?.currentOfficialScheduleFingerprint)),
      proposedFingerprintMatched: Boolean(proposedFingerprint && proposedFingerprint === clean(plan?.proposedOfficialScheduleFingerprint)),
      existingEventConflict: finalBlockedReasons.includes(ADMIN_REVIEW_SERVER_PREFLIGHT_BLOCK_REASONS.OFFICIALIZATION_ALREADY_EXISTS),
      blockedReasons: finalBlockedReasons.length,
      persistencePerformed: false,
    },
  }
}
