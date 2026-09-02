import { describe, expect, it } from 'vitest'
import {
  ADMIN_REVIEW_SECOND_APPROVAL_ALLOWED_ROLES,
  buildAdminReviewSecondApprovalEligibility,
} from './adminReviewSecondApprovalEligibility.js'

function promotion(overrides = {}) {
  return {
    promotionId: 'promotion-1-r2',
    draftId: 'draft-1',
    revisionNumber: 2,
    integrity: { hash: 'a'.repeat(64) },
    hardRuleViolations: [],
    ...overrides,
  }
}

function request(overrides = {}) {
  return {
    requestId: 'request-1',
    type: 'ADMIN_REVIEW_APPROVAL_REQUEST',
    status: 'REQUESTED',
    promotionId: 'promotion-1-r2',
    draftId: 'draft-1',
    revisionNumber: 2,
    requestedBy: {
      userId: 'requester-1',
      displayName: 'Solicitante Uno',
      email: 'requester@example.com',
      role: 'admin_instituto',
    },
    basedOn: { promotionIntegrityHash: 'a'.repeat(64) },
    requiresSecondApproval: true,
    secondApproval: null,
    warnings: ['SECOND_APPROVAL_REQUIRED'],
    isOfficial: false,
    ...overrides,
  }
}

const secondActor = {
  userId: 'second-admin-1',
  displayName: 'Segundo Admin',
  email: 'second@example.com',
  role: 'superadmin',
}

function approvalEligibility(candidate = promotion()) {
  return {
    eligiblePromotions: [candidate],
    blockedPromotions: [],
    supersededPromotions: [],
    latestPromotionByDraft: { [candidate.draftId]: candidate },
    warnings: [],
  }
}

function evaluate({ approvalRequest = request(), candidate = promotion(), eligibility, actor = secondActor, options } = {}) {
  return buildAdminReviewSecondApprovalEligibility({
    approvalRequests: [approvalRequest],
    promotions: candidate ? [candidate] : [],
    approvalEligibility: eligibility ?? approvalEligibility(candidate ?? promotion()),
    currentActor: actor,
    options,
  })
}

describe('buildAdminReviewSecondApprovalEligibility', () => {
  it('deja elegible un request valido para un segundo actor autorizado', () => {
    const result = evaluate()

    expect(result.eligibleRequests).toEqual([request()])
    expect(result.blockedRequests).toEqual([])
    expect(result.diagnostics).toMatchObject({
      totalRequests: 1,
      eligibleRequests: 1,
      blockedRequests: 0,
      allowedRoles: ['admin_instituto', 'superadmin'],
    })
    expect(ADMIN_REVIEW_SECOND_APPROVAL_ALLOWED_ROLES).toEqual(['superadmin', 'admin_instituto'])
  })

  it('bloquea si la promocion dejo de ser elegible', () => {
    const result = evaluate({
      eligibility: {
        eligiblePromotions: [],
        blockedPromotions: [{ promotionId: 'promotion-1-r2' }],
        supersededPromotions: [],
        latestPromotionByDraft: {},
        warnings: [],
      },
    })

    expect(result.blockedRequests[0].reasons).toContain('PROMOTION_NOT_ELIGIBLE')
  })

  it('bloquea si la promocion fue superada', () => {
    const result = evaluate({
      eligibility: {
        eligiblePromotions: [],
        blockedPromotions: [],
        supersededPromotions: [{ promotionId: 'promotion-1-r2', supersededByPromotionId: 'promotion-1-r3' }],
        latestPromotionByDraft: { 'draft-1': promotion({ promotionId: 'promotion-1-r3', revisionNumber: 3 }) },
        warnings: [],
      },
    })

    expect(result.blockedRequests[0].reasons).toEqual(expect.arrayContaining([
      'PROMOTION_SUPERSEDED',
      'PROMOTION_NOT_ELIGIBLE',
      'PROMOTION_NOT_LATEST_REVISION',
    ]))
  })

  it('bloquea si el hash asociado ya no coincide', () => {
    const result = evaluate({
      approvalRequest: request({ basedOn: { promotionIntegrityHash: 'b'.repeat(64) } }),
    })

    expect(result.blockedRequests[0].reasons).toContain('PROMOTION_INTEGRITY_HASH_MISMATCH')
  })

  it('bloquea si falta actor actual', () => {
    const result = evaluate({ actor: null })

    expect(result.blockedRequests[0].reasons).toContain('CURRENT_ACTOR_REQUIRED')
    expect(result.warnings).toContain('CURRENT_ACTOR_UNAVAILABLE')
  })

  it('bloquea si el actor actual es el solicitante inicial', () => {
    const result = evaluate({ actor: request().requestedBy })

    expect(result.blockedRequests[0].reasons).toContain('SAME_ACTOR_NOT_ALLOWED')
  })

  it('bloquea roles no administrativos', () => {
    const result = evaluate({
      actor: { userId: 'teacher-1', email: 'teacher@example.com', role: 'docente' },
    })

    expect(result.blockedRequests[0].reasons).toContain('CURRENT_ACTOR_ROLE_NOT_ALLOWED:docente')
  })

  it.each([
    ['second approval existente', { secondApproval: { actorId: 'admin-2' } }, 'SECOND_APPROVAL_ALREADY_RECORDED'],
    ['status invalido', { status: 'CANCELLED' }, 'INVALID_REQUEST_STATUS:CANCELLED'],
    ['solicitante ausente', { requestedBy: null }, 'INITIAL_REQUESTER_REQUIRED'],
  ])('bloquea %s', (_label, changes, expectedReason) => {
    const result = evaluate({ approvalRequest: request(changes) })

    expect(result.blockedRequests[0].reasons).toContain(expectedReason)
  })

  it('bloquea revision ambigua, reglas duras y warnings bloqueantes', () => {
    const candidate = promotion({ hardRuleViolations: ['RULE_1'] })
    const result = evaluate({
      candidate,
      approvalRequest: request({ warnings: ['SECOND_APPROVAL_REQUIRED', 'BLOCKING_MANUAL_AUDIT'] }),
      eligibility: {
        eligiblePromotions: [candidate],
        blockedPromotions: [],
        supersededPromotions: [],
        latestPromotionByDraft: { 'draft-1': candidate },
        warnings: ['DUPLICATE_LATEST_REVISION:draft-1:2'],
      },
    })

    expect(result.blockedRequests[0].reasons).toEqual(expect.arrayContaining([
      'AMBIGUOUS_PROMOTION_REVISION',
      'HARD_RULE_VIOLATIONS',
      'BLOCKING_WARNINGS:BLOCKING_MANUAL_AUDIT',
    ]))
  })

  it('mantiene diagnostics sin payload sensible', () => {
    const result = evaluate()

    expect(JSON.stringify(result.diagnostics)).not.toContain('requester@example.com')
    expect(JSON.stringify(result.diagnostics)).not.toContain('second@example.com')
    expect(JSON.stringify(result.diagnostics)).not.toContain('a'.repeat(64))
  })
})
