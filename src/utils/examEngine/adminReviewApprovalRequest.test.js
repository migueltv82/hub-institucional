import { describe, expect, it } from 'vitest'
import {
  appendAdminReviewApprovalRequest,
  createAdminReviewApprovalRequest,
} from './adminReviewApprovalRequest.js'

function promotion(overrides = {}) {
  return {
    promotionId: 'promotion-draft-1-r2',
    draftId: 'draft-1',
    revisionNumber: 2,
    type: 'ADMIN_REVIEWED_SCHEDULE_PROMOTION',
    status: 'PROMOTED_EXPERIMENTAL',
    integrityStatus: 'VERIFIED',
    integrityVerification: {
      status: 'VERIFIED',
      eligibleForFutureApproval: true,
    },
    integrity: {
      hash: 'a'.repeat(64),
      workflowVersion: '1.1.0',
    },
    adminActor: {
      userId: 'promoter-1',
      displayName: 'Promotora Uno',
      email: 'promoter@example.com',
      role: 'admin_instituto',
    },
    appliedDecisionIds: ['decision-1', 'decision-2'],
    skippedDecisionIds: ['decision-3'],
    hardRuleViolations: [],
    isOfficialCandidate: true,
    isOfficial: false,
    ...overrides,
  }
}

function eligibility(eligiblePromotion = promotion()) {
  return {
    eligiblePromotions: [eligiblePromotion],
    blockedPromotions: [],
    supersededPromotions: [],
    latestPromotionByDraft: {
      [eligiblePromotion.draftId]: eligiblePromotion,
    },
  }
}

const requester = {
  userId: 'requester-1',
  displayName: 'Solicitante Uno',
  email: 'requester@example.com',
  role: 'admin_instituto',
}

describe('createAdminReviewApprovalRequest', () => {
  it('crea un evento REQUESTED para la ultima promocion elegible', () => {
    const candidate = promotion()
    const result = createAdminReviewApprovalRequest({
      promotion: candidate,
      approvalEligibility: eligibility(candidate),
      adminActor: requester,
      options: { now: () => '2026-07-10T15:00:00.000Z' },
    })

    expect(result.requestCreated).toBe(true)
    expect(result.blockedReason).toBe('')
    expect(result.approvalRequest).toMatchObject({
      requestId: expect.stringMatching(/^admin-review-approval-request-[a-f0-9]{16}$/),
      type: 'ADMIN_REVIEW_APPROVAL_REQUEST',
      status: 'REQUESTED',
      promotionId: candidate.promotionId,
      draftId: candidate.draftId,
      revisionNumber: 2,
      requestedAt: '2026-07-10T15:00:00.000Z',
      requestedBy: requester,
      basedOn: {
        promotionIntegrityHash: candidate.integrity.hash,
        promotionWorkflowVersion: '1.1.0',
        appliedDecisionIds: ['decision-1', 'decision-2'],
        skippedDecisionIds: ['decision-3'],
      },
      requiresSecondApproval: true,
      secondApproval: null,
      warnings: ['SECOND_APPROVAL_REQUIRED'],
      isOfficial: false,
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain('requester@example.com')
    expect(JSON.stringify(result.diagnostics)).not.toContain(candidate.integrity.hash)
  })

  it('bloquea una promocion que no figura como elegible', () => {
    const result = createAdminReviewApprovalRequest({
      promotion: promotion(),
      approvalEligibility: {
        eligiblePromotions: [],
        blockedPromotions: [],
        supersededPromotions: [],
        latestPromotionByDraft: {},
      },
      adminActor: requester,
    })

    expect(result).toMatchObject({ requestCreated: false, blockedReason: 'PROMOTION_NOT_ELIGIBLE' })
  })

  it('bloquea una revision superada', () => {
    const candidate = promotion({ revisionNumber: 1, promotionId: 'promotion-draft-1-r1' })
    const result = createAdminReviewApprovalRequest({
      promotion: candidate,
      approvalEligibility: {
        eligiblePromotions: [],
        blockedPromotions: [],
        supersededPromotions: [{ promotionId: candidate.promotionId, supersededByPromotionId: 'promotion-draft-1-r2' }],
        latestPromotionByDraft: { 'draft-1': promotion() },
      },
      adminActor: requester,
    })

    expect(result).toMatchObject({
      requestCreated: false,
      blockedReason: 'PROMOTION_SUPERSEDED',
      diagnostics: { supersededByPromotionId: 'promotion-draft-1-r2' },
    })
  })

  it.each([
    ['MISMATCH', 'PROMOTION_MISMATCH'],
    ['LEGACY_UNVERIFIED', 'PROMOTION_LEGACY_UNVERIFIED'],
    ['VERIFY_ERROR', 'PROMOTION_VERIFY_ERROR'],
  ])('bloquea integridad %s', (integrityStatus, blockedReason) => {
    const candidate = promotion({ integrityStatus })
    const result = createAdminReviewApprovalRequest({
      promotion: candidate,
      approvalEligibility: eligibility(candidate),
      adminActor: requester,
    })

    expect(result).toMatchObject({ requestCreated: false, blockedReason })
  })

  it.each([
    ['actor promotor', { adminActor: null }, requester, 'PROMOTION_ADMIN_ACTOR_REQUIRED'],
    ['actor solicitante', {}, null, 'REQUEST_ADMIN_ACTOR_REQUIRED'],
    ['hash', { integrity: { hash: '', workflowVersion: '1.1.0' } }, requester, 'PROMOTION_INTEGRITY_HASH_REQUIRED'],
  ])('bloquea si falta %s', (_label, promotionChanges, requestActor, blockedReason) => {
    const candidate = promotion(promotionChanges)
    const result = createAdminReviewApprovalRequest({
      promotion: candidate,
      approvalEligibility: eligibility(candidate),
      adminActor: requestActor,
    })

    expect(result).toMatchObject({ requestCreated: false, blockedReason })
  })

  it('evita una segunda solicitud activa para la misma promocion', () => {
    const candidate = promotion()
    const result = createAdminReviewApprovalRequest({
      promotion: candidate,
      approvalEligibility: eligibility(candidate),
      adminActor: requester,
      existingApprovalRequests: [{
        requestId: 'request-existing',
        promotionId: candidate.promotionId,
        status: 'REQUESTED',
      }],
    })

    expect(result).toMatchObject({
      requestCreated: false,
      blockedReason: 'ACTIVE_REQUEST_ALREADY_EXISTS',
      diagnostics: { activeRequestId: 'request-existing' },
    })
  })

  it('append de solicitudes no reemplaza eventos existentes', () => {
    const first = { requestId: 'request-1', status: 'REQUESTED' }
    const duplicate = { requestId: 'request-1', status: 'CHANGED' }
    const second = { requestId: 'request-2', status: 'REQUESTED' }

    expect(appendAdminReviewApprovalRequest([first], duplicate)).toEqual([first])
    expect(appendAdminReviewApprovalRequest([first], second)).toEqual([first, second])
  })
})
