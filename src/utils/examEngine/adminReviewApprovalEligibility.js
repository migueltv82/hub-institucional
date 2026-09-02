import {
  ADMIN_REVIEW_INTEGRITY_STATUS,
  ADMIN_REVIEW_PROMOTION_STATUS,
  ADMIN_REVIEW_PROMOTION_TYPE,
  verifyAdminReviewPromotionEvents,
} from './adminReviewPromotionWorkflow.js'
import { isTeacherBlockedOnDate } from './teacherBlockedDates.js'

export const ADMIN_REVIEW_APPROVAL_BLOCK_REASONS = Object.freeze({
  INVALID_TYPE: 'INVALID_PROMOTION_TYPE',
  INVALID_STATUS: 'INVALID_PROMOTION_STATUS',
  OFFICIAL_PROMOTION: 'PROMOTION_ALREADY_OFFICIAL',
  NOT_OFFICIAL_CANDIDATE: 'NOT_OFFICIAL_CANDIDATE',
  INTEGRITY_NOT_VERIFIED: 'INTEGRITY_NOT_VERIFIED',
  FUTURE_APPROVAL_NOT_ELIGIBLE: 'FUTURE_APPROVAL_NOT_ELIGIBLE',
  DRAFT_ID_REQUIRED: 'DRAFT_ID_REQUIRED',
  PROMOTION_ID_REQUIRED: 'PROMOTION_ID_REQUIRED',
  REVISION_NUMBER_REQUIRED: 'REVISION_NUMBER_REQUIRED',
  INTEGRITY_REQUIRED: 'INTEGRITY_REQUIRED',
  ADMIN_ACTOR_REQUIRED: 'ADMIN_ACTOR_REQUIRED',
  SCHEDULE_REQUIRED: 'PROMOTED_SCHEDULE_REQUIRED',
  TRIBUNAL_INCOMPLETE: 'TRIBUNAL_INCOMPLETE',
  SOURCE_DECISION_NOT_FOUND: 'SOURCE_DECISION_NOT_FOUND',
  AMBIGUOUS_LATEST_REVISION: 'AMBIGUOUS_LATEST_REVISION',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function isPositiveRevision(value) {
  const revision = Number(value)
  return Number.isInteger(revision) && revision > 0
}

function hasAdminActor(promotion = {}) {
  const actor = promotion.adminActor
  if (!actor || actor.displayName === 'ADMIN_REVIEW_USER_UNAVAILABLE') return false
  return Boolean(clean(actor.userId) || clean(actor.email) || clean(actor.displayName))
}

function buildBaseBlockReasons(promotion = {}, decisionIds = new Set(), teacherExamSourceContext = {}) {
  const reasons = []
  const promotionId = clean(promotion.promotionId)
  const draftId = clean(promotion.draftId)

  if (promotion.type !== ADMIN_REVIEW_PROMOTION_TYPE) reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.INVALID_TYPE)
  if (promotion.status !== ADMIN_REVIEW_PROMOTION_STATUS) {
    reasons.push(`${ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.INVALID_STATUS}:${clean(promotion.status) || 'missing'}`)
  }
  if (promotion.isOfficial === true) reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.OFFICIAL_PROMOTION)
  if (promotion.isOfficialCandidate !== true) reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.NOT_OFFICIAL_CANDIDATE)
  if (promotion.integrityStatus !== ADMIN_REVIEW_INTEGRITY_STATUS.VERIFIED) {
    reasons.push(`${ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.INTEGRITY_NOT_VERIFIED}:${clean(promotion.integrityStatus) || 'missing'}`)
  }
  if (promotion.integrityVerification?.eligibleForFutureApproval !== true) {
    reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.FUTURE_APPROVAL_NOT_ELIGIBLE)
  }
  if (!draftId) reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.DRAFT_ID_REQUIRED)
  if (!promotionId) reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.PROMOTION_ID_REQUIRED)
  if (!isPositiveRevision(promotion.revisionNumber)) reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.REVISION_NUMBER_REQUIRED)
  if (!promotion.integrity) reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.INTEGRITY_REQUIRED)
  if (!hasAdminActor(promotion)) reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.ADMIN_ACTOR_REQUIRED)
  asArray(promotion.hardRuleViolations).forEach((violation) => reasons.push(`HARD_RULE:${clean(violation) || 'unknown'}`))

  const schedule = asArray(promotion.schedule)
  if (!schedule.length) reasons.push(ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.SCHEDULE_REQUIRED)
  schedule.forEach((mesa, index) => {
    const mesaId = clean(mesa?.id) || `index-${index}`
    if (!clean(mesa?.titularId ?? mesa?.profesorTitularId) || asArray(mesa?.vocales).length < 2) {
      reasons.push(`${ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.TRIBUNAL_INCOMPLETE}:${mesaId}`)
    }
    const tribunal = [
      {
        teacherId: clean(mesa?.titularId ?? mesa?.profesorTitularId),
        teacherName: clean(mesa?.titular ?? mesa?.profesorTitular),
        role: 'TITULAR',
      },
      ...asArray(mesa?.vocales).map((vocal) => ({
        teacherId: clean(vocal?.docenteId),
        teacherName: clean(vocal?.docente),
        role: 'VOCAL',
      })),
    ]
    tribunal.filter((teacher) => teacher.teacherId).forEach((teacher) => {
      const blocked = isTeacherBlockedOnDate({
        blockedDatesByTeacher: teacherExamSourceContext?.blockedDatesByTeacher,
        teacherId: teacher.teacherId,
        teacherName: teacher.teacherName,
        date: mesa?.fechaIso,
        startTime: mesa?.inicio,
        endTime: mesa?.fin,
      })
      if (blocked.blocked) {
        reasons.push(`HARD_RULE:TEACHER_BLOCKED_DATE:${mesaId}:${teacher.teacherId}`)
        reasons.push(`HARD_RULE:${teacher.role}_BLOCKED_DATE:${mesaId}:${teacher.teacherId}`)
      }
    })
  })

  asArray(promotion.appliedDecisionIds).forEach((decisionId) => {
    if (!decisionIds.has(clean(decisionId))) {
      reasons.push(`${ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.SOURCE_DECISION_NOT_FOUND}:${clean(decisionId) || 'missing'}`)
    }
  })

  return unique(reasons)
}

function blockedEntry(promotion, reasons) {
  return {
    promotionId: clean(promotion?.promotionId),
    draftId: clean(promotion?.draftId),
    revisionNumber: Number(promotion?.revisionNumber ?? 0),
    reasons: unique(reasons),
    promotion,
  }
}

export function buildAdminReviewApprovalEligibility({
  promotions = [],
  drafts = [],
  adminReviewDecisions = [],
  teacherExamSourceContext = {},
  options = {},
} = {}) {
  const verifiedPromotions = verifyAdminReviewPromotionEvents({
    promotions,
    drafts,
    teacherExamSourceContext,
    now: options.now,
  })
  const sourceDecisionIds = new Set(asArray(adminReviewDecisions).map((decision) => clean(decision?.decisionId)).filter(Boolean))
  const blockedPromotions = []
  const supersededPromotions = []
  const eligiblePromotions = []
  const latestPromotionByDraft = {}
  const warnings = []
  const validByDraft = new Map()

  verifiedPromotions.forEach((promotion) => {
    const reasons = buildBaseBlockReasons(promotion, sourceDecisionIds, teacherExamSourceContext)
    if (reasons.length) {
      blockedPromotions.push(blockedEntry(promotion, reasons))
      return
    }

    const current = validByDraft.get(promotion.draftId) ?? []
    current.push(promotion)
    validByDraft.set(promotion.draftId, current)
  })

  validByDraft.forEach((draftPromotions, draftId) => {
    const highestRevision = Math.max(...draftPromotions.map((promotion) => Number(promotion.revisionNumber)))
    const latestCandidates = draftPromotions.filter((promotion) => Number(promotion.revisionNumber) === highestRevision)

    if (latestCandidates.length > 1) {
      warnings.push(`DUPLICATE_LATEST_REVISION:${draftId}:${highestRevision}`)
      latestCandidates.forEach((promotion) => {
        blockedPromotions.push(blockedEntry(promotion, [ADMIN_REVIEW_APPROVAL_BLOCK_REASONS.AMBIGUOUS_LATEST_REVISION]))
      })
      draftPromotions.filter((promotion) => Number(promotion.revisionNumber) < highestRevision).forEach((promotion) => {
        supersededPromotions.push({
          promotionId: promotion.promotionId,
          draftId,
          revisionNumber: promotion.revisionNumber,
          reason: 'SUPERSEDED_BY_NEWER_REVISION',
          supersededByPromotionId: null,
          promotion,
        })
      })
      return
    }

    const latest = latestCandidates[0]
    latestPromotionByDraft[draftId] = latest
    eligiblePromotions.push(latest)
    draftPromotions.filter((promotion) => promotion.promotionId !== latest.promotionId).forEach((promotion) => {
      supersededPromotions.push({
        promotionId: promotion.promotionId,
        draftId,
        revisionNumber: promotion.revisionNumber,
        reason: 'SUPERSEDED_BY_NEWER_REVISION',
        supersededByPromotionId: latest.promotionId,
        promotion,
      })
    })
  })

  const blockedReasonCounts = blockedPromotions.reduce((counts, entry) => {
    entry.reasons.forEach((reason) => {
      const code = reason.split(':')[0]
      counts[code] = Number(counts[code] ?? 0) + 1
    })
    return counts
  }, {})

  return {
    eligiblePromotions,
    blockedPromotions,
    supersededPromotions,
    latestPromotionByDraft,
    warnings: unique(warnings),
    diagnostics: {
      totalPromotions: verifiedPromotions.length,
      eligiblePromotions: eligiblePromotions.length,
      blockedPromotions: blockedPromotions.length,
      supersededPromotions: supersededPromotions.length,
      draftsWithEligiblePromotion: Object.keys(latestPromotionByDraft).length,
      blockedReasonCounts,
    },
  }
}
