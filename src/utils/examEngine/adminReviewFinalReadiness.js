import { buildAdminReviewApprovalEligibility } from './adminReviewApprovalEligibility.js'
import {
  ADMIN_REVIEW_APPROVAL_REQUEST_STATUS,
  ADMIN_REVIEW_APPROVAL_REQUEST_TYPE,
} from './adminReviewApprovalRequest.js'
import {
  ADMIN_REVIEW_SECOND_APPROVAL_STATUS,
  ADMIN_REVIEW_SECOND_APPROVAL_TYPE,
  buildAdminReviewApprovalRequestIntegrity,
} from './adminReviewSecondApproval.js'
import { ADMIN_REVIEW_SECOND_APPROVAL_ALLOWED_ROLES } from './adminReviewSecondApprovalEligibility.js'
import {
  ADMIN_REVIEW_INTEGRITY_STATUS,
  sha256Hex,
  stableSerializeAdminReviewValue,
  validateAdminReviewedDraftForPromotion,
} from './adminReviewPromotionWorkflow.js'
import {
  buildTeacherAffectationLedger,
  getTeacherAvailabilityForExamTable,
} from './adminReviewWorkflow.js'
import { doTimeRangesOverlap } from './rules/timeRanges.js'
import {
  isTeacherBlockedOnDate,
  normalizeTeacherExamIdentity,
} from './teacherBlockedDates.js'

export const ADMIN_REVIEW_FINAL_CANDIDATE_TYPE = 'ADMIN_REVIEW_FINAL_CANDIDATE'
export const ADMIN_REVIEW_FINAL_CANDIDATE_STATUS = 'READY_FOR_OFFICIALIZATION'

export const ADMIN_REVIEW_FINAL_BLOCK_REASONS = Object.freeze({
  NO_ELIGIBLE_PROMOTION: 'FINAL_READINESS_NO_ELIGIBLE_PROMOTION',
  AMBIGUOUS_PROMOTION: 'FINAL_READINESS_AMBIGUOUS_PROMOTION',
  SUPERSEDED_PROMOTION: 'FINAL_READINESS_SUPERSEDED_PROMOTION',
  MISSING_REQUEST: 'FINAL_READINESS_MISSING_REQUEST',
  DUPLICATE_REQUEST: 'FINAL_READINESS_DUPLICATE_REQUEST',
  INVALID_REQUEST: 'FINAL_READINESS_INVALID_REQUEST',
  MISSING_SECOND_APPROVAL: 'FINAL_READINESS_MISSING_SECOND_APPROVAL',
  DUPLICATE_SECOND_APPROVAL: 'FINAL_READINESS_DUPLICATE_SECOND_APPROVAL',
  INVALID_SECOND_APPROVAL: 'FINAL_READINESS_INVALID_SECOND_APPROVAL',
  PROMOTION_HASH_MISMATCH: 'FINAL_READINESS_PROMOTION_HASH_MISMATCH',
  REQUEST_HASH_MISMATCH: 'FINAL_READINESS_REQUEST_HASH_MISMATCH',
  SAME_ACTOR: 'FINAL_READINESS_SAME_ACTOR',
  ACTOR_REQUIRED: 'FINAL_READINESS_ACTOR_REQUIRED',
  ACTOR_ROLE_NOT_ALLOWED: 'FINAL_READINESS_ACTOR_ROLE_NOT_ALLOWED',
  INCOMPLETE_TRIBUNAL: 'FINAL_READINESS_INCOMPLETE_TRIBUNAL',
  TITULAR_BLOCKED_DATE: 'FINAL_READINESS_TITULAR_BLOCKED_DATE',
  VOCAL_BLOCKED_DATE: 'FINAL_READINESS_VOCAL_BLOCKED_DATE',
  BLOCKED_DATE_CONFLICT: 'FINAL_READINESS_BLOCKED_DATE_CONFLICT',
  TEACHER_IDENTITY_UNRESOLVED: 'FINAL_READINESS_TEACHER_IDENTITY_UNRESOLVED',
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

function activeRequest(request = {}) {
  return [ADMIN_REVIEW_APPROVAL_REQUEST_STATUS, 'PENDING_SECOND_APPROVAL']
    .includes(clean(request.status).toUpperCase())
}

function cloneSchedule(schedule = []) {
  return asArray(schedule).map((mesa) => ({
    ...mesa,
    vocales: asArray(mesa?.vocales).map((vocal) => ({ ...vocal })),
    isOfficial: false,
    confirmada: false,
    valid: false,
  }))
}

function findTeacher(context = {}, teacherId = '', teacherName = '') {
  const normalizedId = normalizeTeacherExamIdentity(teacherId)
  const normalizedName = normalizeTeacherExamIdentity(teacherName)
  return asArray(context.docentes).find((teacher) => (
    teacher.id === normalizedId
    || normalizeTeacherExamIdentity(teacher.nombre) === normalizedName
  )) ?? null
}

function validateSchedule({ schedule, teacherExamSourceContext }) {
  const hardRuleViolations = []
  const blockedReasons = []
  const slotsByTeacher = new Map()
  const selections = []

  asArray(schedule).forEach((mesa, index) => {
    const mesaId = clean(mesa?.id) || `index-${index}`
    const titularId = clean(mesa?.titularId ?? mesa?.profesorTitularId)
    const vocales = asArray(mesa?.vocales)
    if (!titularId || vocales.length < 2) {
      blockedReasons.push(`${ADMIN_REVIEW_FINAL_BLOCK_REASONS.INCOMPLETE_TRIBUNAL}:${mesaId}`)
      hardRuleViolations.push(`TRIBUNAL_INCOMPLETE:${mesaId}`)
    }

    const tribunal = [
      { teacherId: titularId, teacherName: clean(mesa?.titular ?? mesa?.profesorTitular), role: 'TITULAR' },
      ...vocales.map((vocal) => ({
        teacherId: clean(vocal?.docenteId),
        teacherName: clean(vocal?.docente),
        role: clean(vocal?.role).toUpperCase() || 'VOCAL',
      })),
    ].filter((teacher) => teacher.teacherId)
    const teacherIds = tribunal.map((teacher) => normalizeTeacherExamIdentity(teacher.teacherId))
    if (new Set(teacherIds).size !== teacherIds.length) {
      hardRuleViolations.push(`DUPLICATED_TEACHER_IN_TRIBUNAL:${mesaId}`)
    }

    tribunal.forEach((teacher) => {
      const contextTeacher = findTeacher(teacherExamSourceContext, teacher.teacherId, teacher.teacherName)
      if (!contextTeacher) {
        blockedReasons.push(`${ADMIN_REVIEW_FINAL_BLOCK_REASONS.TEACHER_IDENTITY_UNRESOLVED}:${mesaId}:${teacher.teacherId}`)
        hardRuleViolations.push(`TEACHER_IDENTITY_UNRESOLVED:${mesaId}:${teacher.teacherId}`)
        return
      }

      const blocked = isTeacherBlockedOnDate({
        blockedDatesByTeacher: teacherExamSourceContext?.blockedDatesByTeacher,
        teacherId: contextTeacher.id,
        teacherName: contextTeacher.nombre,
        date: mesa?.fechaIso,
        startTime: mesa?.inicio,
        endTime: mesa?.fin,
      })
      if (blocked.blocked) {
        const roleReason = teacher.role === 'TITULAR'
          ? ADMIN_REVIEW_FINAL_BLOCK_REASONS.TITULAR_BLOCKED_DATE
          : ADMIN_REVIEW_FINAL_BLOCK_REASONS.VOCAL_BLOCKED_DATE
        blockedReasons.push(`${roleReason}:${mesaId}:${contextTeacher.id}`)
        blockedReasons.push(`${ADMIN_REVIEW_FINAL_BLOCK_REASONS.BLOCKED_DATE_CONFLICT}:${mesaId}:${contextTeacher.id}`)
        hardRuleViolations.push(`${teacher.role === 'TITULAR' ? 'TITULAR_BLOCKED_DATE' : 'VOCAL_BLOCKED_DATE'}:${mesaId}:${contextTeacher.id}`)
      }

      const availability = getTeacherAvailabilityForExamTable({
        teacherExamSourceContext,
        docenteId: contextTeacher.id,
        mesa,
      })
      if (!availability.disponibleEseDia) hardRuleViolations.push(`TEACHER_NOT_AVAILABLE_ON_DATE:${mesaId}:${contextTeacher.id}`)
      else if (!availability.disponibleEnTurno) hardRuleViolations.push(`TEACHER_NOT_AVAILABLE_ON_SHIFT:${mesaId}:${contextTeacher.id}`)

      const slots = slotsByTeacher.get(contextTeacher.id) ?? []
      if (slots.some((slot) => (
        clean(slot.date) === clean(mesa?.fechaIso)
        && doTimeRangesOverlap(slot.startTime, slot.endTime, mesa?.inicio, mesa?.fin)
      ))) {
        hardRuleViolations.push(`TEACHER_SLOT_CONFLICT:${contextTeacher.id}`)
      }
      slotsByTeacher.set(contextTeacher.id, [...slots, {
        date: mesa?.fechaIso,
        startTime: mesa?.inicio,
        endTime: mesa?.fin,
      }])
      selections.push({
        mesaId,
        docenteId: contextTeacher.id,
        role: teacher.role,
        fechaIso: mesa?.fechaIso,
        inicio: mesa?.inicio,
        fin: mesa?.fin,
      })
    })
  })

  const ledger = buildTeacherAffectationLedger({ teacherExamSourceContext, selections })
  Object.values(ledger).forEach((entry) => {
    if (entry.afectacionesUsadas > entry.limiteAfectacion) {
      hardRuleViolations.push(`TEACHER_AFFECTATION_LIMIT_EXCEEDED:${entry.docenteId}`)
    }
  })

  return {
    blockedReasons: unique(blockedReasons),
    hardRuleViolations: unique(hardRuleViolations),
    ledger,
  }
}

function secondApprovalIntegrityHash(secondApproval = {}) {
  return sha256Hex(stableSerializeAdminReviewValue({
    secondApprovalId: clean(secondApproval.secondApprovalId),
    type: clean(secondApproval.type),
    status: clean(secondApproval.status),
    requestId: clean(secondApproval.requestId),
    promotionId: clean(secondApproval.promotionId),
    draftId: clean(secondApproval.draftId),
    revisionNumber: Number(secondApproval.revisionNumber ?? 0),
    approvedAt: clean(secondApproval.approvedAt),
    approvedBy: {
      userId: clean(secondApproval.approvedBy?.userId) || null,
      role: normalizeRole(secondApproval.approvedBy?.role) || null,
    },
    requestIntegrityHash: clean(secondApproval.requestIntegrity?.hash),
    promotionIntegrityHash: clean(secondApproval.basedOn?.promotionIntegrityHash),
    isOfficial: secondApproval.isOfficial === true,
  }))
}

export function buildAdminReviewFinalReadiness({
  promotions = [],
  approvalRequests = [],
  secondApprovals = [],
  drafts = [],
  adminReviewDecisions = [],
  teacherExamSourceContext = {},
  currentActor = null,
  options = {},
} = {}) {
  const blockedReasons = []
  const hardRuleViolations = []
  const warnings = []
  const allowedRoles = new Set(
    asArray(options.allowedRoles).length
      ? asArray(options.allowedRoles).map(normalizeRole)
      : ADMIN_REVIEW_SECOND_APPROVAL_ALLOWED_ROLES,
  )
  const approvalEligibility = buildAdminReviewApprovalEligibility({
    promotions,
    drafts,
    adminReviewDecisions,
    teacherExamSourceContext,
    options: { now: options.now },
  })
  const eligiblePromotions = asArray(approvalEligibility.eligiblePromotions)

  if (!eligiblePromotions.length) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.NO_ELIGIBLE_PROMOTION)
  if (eligiblePromotions.length > 1 || approvalEligibility.warnings.some((warning) => warning.startsWith('DUPLICATE_LATEST_REVISION:'))) {
    blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.AMBIGUOUS_PROMOTION)
  }
  if (approvalEligibility.supersededPromotions.length && approvalRequests.some((request) => (
    approvalEligibility.supersededPromotions.some((entry) => clean(entry.promotionId) === clean(request?.promotionId))
  ))) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.SUPERSEDED_PROMOTION)

  approvalEligibility.blockedPromotions.forEach((entry) => {
    entry.reasons.filter((reason) => reason.startsWith('HARD_RULE:')).forEach((reason) => {
      hardRuleViolations.push(reason.slice('HARD_RULE:'.length))
    })
  })
  const promotion = eligiblePromotions.length === 1 ? eligiblePromotions[0] : null
  const promotionsToScan = promotion ? [promotion] : asArray(promotions)
  promotionsToScan.forEach((candidate) => {
    const scan = validateSchedule({ schedule: candidate?.schedule, teacherExamSourceContext })
    blockedReasons.push(...scan.blockedReasons)
    hardRuleViolations.push(...scan.hardRuleViolations)
  })
  let request = null
  let secondApproval = null
  let requestIntegrityHash = ''
  let secondIntegrityHash = ''

  if (promotion) {
    if (promotion.integrityStatus !== ADMIN_REVIEW_INTEGRITY_STATUS.VERIFIED) {
      blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.NO_ELIGIBLE_PROMOTION)
    }
    const matchingRequests = asArray(approvalRequests).filter((candidate) => (
      clean(candidate?.promotionId) === clean(promotion.promotionId) && activeRequest(candidate)
    ))
    if (!matchingRequests.length) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.MISSING_REQUEST)
    if (matchingRequests.length > 1) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.DUPLICATE_REQUEST)
    request = matchingRequests.length === 1 ? matchingRequests[0] : null
  }

  if (request && promotion) {
    if (
      request.type !== ADMIN_REVIEW_APPROVAL_REQUEST_TYPE
      || clean(request.draftId) !== clean(promotion.draftId)
      || Number(request.revisionNumber) !== Number(promotion.revisionNumber)
    ) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.INVALID_REQUEST)
    if (clean(request.basedOn?.promotionIntegrityHash) !== clean(promotion.integrity?.hash)) {
      blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.PROMOTION_HASH_MISMATCH)
    }
    if (!actorPresent(request.requestedBy)) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.ACTOR_REQUIRED)
    else if (!allowedRoles.has(normalizeRole(request.requestedBy?.role))) {
      blockedReasons.push(`${ADMIN_REVIEW_FINAL_BLOCK_REASONS.ACTOR_ROLE_NOT_ALLOWED}:REQUESTER`)
    }

    const matchingApprovals = asArray(secondApprovals).filter((candidate) => (
      clean(candidate?.requestId) === clean(request.requestId)
      && clean(candidate?.status).toUpperCase() === ADMIN_REVIEW_SECOND_APPROVAL_STATUS
    ))
    if (!matchingApprovals.length) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.MISSING_SECOND_APPROVAL)
    if (matchingApprovals.length > 1) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.DUPLICATE_SECOND_APPROVAL)
    secondApproval = matchingApprovals.length === 1 ? matchingApprovals[0] : null
  }

  if (secondApproval && request && promotion) {
    if (
      secondApproval.type !== ADMIN_REVIEW_SECOND_APPROVAL_TYPE
      || clean(secondApproval.promotionId) !== clean(promotion.promotionId)
      || clean(secondApproval.draftId) !== clean(promotion.draftId)
      || Number(secondApproval.revisionNumber) !== Number(promotion.revisionNumber)
    ) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.INVALID_SECOND_APPROVAL)
    if (clean(secondApproval.basedOn?.promotionIntegrityHash) !== clean(promotion.integrity?.hash)) {
      blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.PROMOTION_HASH_MISMATCH)
    }
    const integrity = buildAdminReviewApprovalRequestIntegrity({ approvalRequest: request, promotion })
    requestIntegrityHash = clean(integrity.requestIntegrity?.hash)
    if (
      !integrity.ok
      || !requestIntegrityHash
      || clean(secondApproval.requestIntegrity?.hash) !== requestIntegrityHash
      || clean(secondApproval.basedOn?.requestHash) !== requestIntegrityHash
    ) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.REQUEST_HASH_MISMATCH)
    if (!actorPresent(secondApproval.approvedBy)) blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.ACTOR_REQUIRED)
    else if (!allowedRoles.has(normalizeRole(secondApproval.approvedBy?.role))) {
      blockedReasons.push(`${ADMIN_REVIEW_FINAL_BLOCK_REASONS.ACTOR_ROLE_NOT_ALLOWED}:APPROVER`)
    }
    if (sameActor(request.requestedBy, secondApproval.approvedBy)) {
      blockedReasons.push(ADMIN_REVIEW_FINAL_BLOCK_REASONS.SAME_ACTOR)
    }
    secondIntegrityHash = secondApprovalIntegrityHash(secondApproval)
  }

  const scheduleValidation = promotion
    ? validateSchedule({ schedule: promotion.schedule, teacherExamSourceContext })
    : { blockedReasons: [], hardRuleViolations: [], ledger: {} }
  const sourceDraft = promotion
    ? asArray(drafts).find((draft) => clean(draft?.draftId) === clean(promotion.draftId))
    : null
  const draftValidation = sourceDraft
    ? validateAdminReviewedDraftForPromotion({
        draft: sourceDraft,
        adminReviewDecisions,
        teacherExamSourceContext,
      })
    : { valid: false, hardRuleViolations: promotion ? ['SOURCE_DRAFT_NOT_FOUND'] : [], warnings: [] }
  blockedReasons.push(...scheduleValidation.blockedReasons)
  hardRuleViolations.push(...scheduleValidation.hardRuleViolations)
  hardRuleViolations.push(...asArray(draftValidation.hardRuleViolations))
  warnings.push(...asArray(draftValidation.warnings))
  asArray(promotion?.hardRuleViolations).forEach((violation) => hardRuleViolations.push(clean(violation)))
  if (hardRuleViolations.length) blockedReasons.push('FINAL_READINESS_HARD_RULE_VIOLATIONS')

  const finalBlockedReasons = unique(blockedReasons)
  const finalHardRuleViolations = unique(hardRuleViolations)
  const ready = Boolean(
    promotion && request && secondApproval
    && finalBlockedReasons.length === 0
    && finalHardRuleViolations.length === 0,
  )
  const candidateCore = ready ? {
    promotionId: promotion.promotionId,
    requestId: request.requestId,
    secondApprovalId: secondApproval.secondApprovalId,
    draftId: promotion.draftId,
    revisionNumber: Number(promotion.revisionNumber),
    promotionIntegrityHash: promotion.integrity.hash,
    requestIntegrityHash,
    secondApprovalIntegrityHash: secondIntegrityHash,
  } : null
  const candidateIntegrityHash = candidateCore
    ? sha256Hex(stableSerializeAdminReviewValue(candidateCore))
    : ''
  const finalCandidate = ready ? {
    candidateId: `admin-review-final-${candidateIntegrityHash.slice(0, 16)}`,
    type: ADMIN_REVIEW_FINAL_CANDIDATE_TYPE,
    status: ADMIN_REVIEW_FINAL_CANDIDATE_STATUS,
    promotionId: promotion.promotionId,
    requestId: request.requestId,
    secondApprovalId: secondApproval.secondApprovalId,
    draftId: promotion.draftId,
    revisionNumber: Number(promotion.revisionNumber),
    schedule: cloneSchedule(promotion.schedule),
    integrity: {
      algorithm: 'sha256',
      hash: candidateIntegrityHash,
    },
    requestedBy: { ...request.requestedBy },
    approvedBy: { ...secondApproval.approvedBy },
    basedOn: {
      promotionIntegrityHash: promotion.integrity.hash,
      requestIntegrityHash,
      secondApprovalIntegrityHash: secondIntegrityHash,
      appliedDecisionIds: unique(promotion.appliedDecisionIds),
      skippedDecisionIds: unique(promotion.skippedDecisionIds),
    },
    warnings: unique([...asArray(promotion.warnings), ...asArray(request.warnings), ...asArray(secondApproval.warnings)]),
    diagnostics: {
      scheduleCount: asArray(promotion.schedule).length,
      completeTribunals: asArray(promotion.schedule).filter((mesa) => clean(mesa?.titularId) && asArray(mesa?.vocales).length >= 2).length,
      validatedTeachers: Object.keys(scheduleValidation.ledger).length,
    },
    isOfficial: false,
  } : null

  return {
    ready,
    finalCandidate,
    blockedReasons: finalBlockedReasons,
    hardRuleViolations: finalHardRuleViolations,
    warnings: unique([...warnings, ...approvalEligibility.warnings]),
    diagnostics: {
      promotions: asArray(promotions).length,
      eligiblePromotions: eligiblePromotions.length,
      requests: asArray(approvalRequests).length,
      matchingRequests: promotion ? asArray(approvalRequests).filter((item) => clean(item?.promotionId) === clean(promotion.promotionId) && activeRequest(item)).length : 0,
      secondApprovals: asArray(secondApprovals).length,
      scheduleCount: asArray(promotion?.schedule).length,
      completeTribunals: asArray(promotion?.schedule).filter((mesa) => clean(mesa?.titularId) && asArray(mesa?.vocales).length >= 2).length,
      blockedReasons: finalBlockedReasons.length,
      hardRuleViolations: finalHardRuleViolations.length,
      currentActorPresent: actorPresent(currentActor),
    },
  }
}
