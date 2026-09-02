import { describe, expect, it } from 'vitest'
import {
  appendAdminReviewSecondApproval,
  buildAdminReviewApprovalRequestIntegrity,
  createAdminReviewSecondApproval,
} from './adminReviewSecondApproval.js'

function promotion(overrides = {}) {
  return {
    promotionId: 'promotion-1-r2',
    draftId: 'draft-1',
    revisionNumber: 2,
    integrityStatus: 'VERIFIED',
    integrityVerification: { eligibleForFutureApproval: true },
    integrity: { hash: 'a'.repeat(64), workflowVersion: '1.1.0' },
    appliedDecisionIds: ['decision-1'],
    skippedDecisionIds: ['decision-2'],
    hardRuleViolations: [],
    ...overrides,
  }
}

function approvalRequest(overrides = {}) {
  return {
    requestId: 'request-1',
    type: 'ADMIN_REVIEW_APPROVAL_REQUEST',
    status: 'REQUESTED',
    promotionId: 'promotion-1-r2',
    draftId: 'draft-1',
    revisionNumber: 2,
    requestedAt: '2026-07-10T15:00:00.000Z',
    requestedBy: {
      userId: 'requester-1',
      displayName: 'Solicitante Uno',
      email: 'requester@example.com',
      role: 'admin_instituto',
    },
    basedOn: {
      promotionIntegrityHash: 'a'.repeat(64),
      promotionWorkflowVersion: '1.1.0',
      appliedDecisionIds: ['decision-1'],
      skippedDecisionIds: ['decision-2'],
    },
    requiresSecondApproval: true,
    secondApproval: null,
    hardRuleViolations: [],
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

function eligibility(request = approvalRequest()) {
  return { eligibleRequests: [request], blockedRequests: [], warnings: [], diagnostics: {} }
}

describe('createAdminReviewSecondApproval', () => {
  it('crea un evento SECOND_APPROVED ligado a hashes de request y promocion', () => {
    const request = approvalRequest()
    const candidate = promotion()
    const result = createAdminReviewSecondApproval({
      approvalRequest: request,
      promotion: candidate,
      secondApprovalEligibility: eligibility(request),
      currentActor: secondActor,
      options: { now: () => '2026-07-10T16:00:00.000Z' },
    })

    expect(result.approvalCreated).toBe(true)
    expect(result.secondApproval).toMatchObject({
      secondApprovalId: expect.stringMatching(/^admin-review-second-approval-[a-f0-9]{16}$/),
      type: 'ADMIN_REVIEW_SECOND_APPROVAL',
      status: 'SECOND_APPROVED',
      requestId: request.requestId,
      promotionId: candidate.promotionId,
      draftId: candidate.draftId,
      revisionNumber: 2,
      approvedAt: '2026-07-10T16:00:00.000Z',
      approvedBy: secondActor,
      requestIntegrity: {
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        algorithm: 'sha256',
        generatedAt: '2026-07-10T16:00:00.000Z',
        inputs: {
          requestCoreHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          promotionHash: candidate.integrity.hash,
        },
      },
      basedOn: {
        requestId: request.requestId,
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        promotionIntegrityHash: candidate.integrity.hash,
        promotionWorkflowVersion: '1.1.0',
        appliedDecisionIds: ['decision-1'],
        skippedDecisionIds: ['decision-2'],
      },
      warnings: ['OFFICIALIZATION_NOT_PERFORMED'],
      isOfficial: false,
    })
    expect(request.secondApproval).toBeNull()
    expect(JSON.stringify(result.diagnostics)).not.toContain('second@example.com')
    expect(JSON.stringify(result.diagnostics)).not.toContain(candidate.integrity.hash)
  })

  it('calcula hash estable sin exponer payload sensible', () => {
    const first = buildAdminReviewApprovalRequestIntegrity({ approvalRequest: approvalRequest(), promotion: promotion() })
    const second = buildAdminReviewApprovalRequestIntegrity({ approvalRequest: approvalRequest(), promotion: promotion() })

    expect(first).toEqual(second)
    expect(JSON.stringify(first.requestIntegrity)).not.toContain('requester@example.com')
    expect(JSON.stringify(first.requestIntegrity)).not.toContain('Solicitante Uno')
  })

  it('bloquea request no elegible', () => {
    const result = createAdminReviewSecondApproval({
      approvalRequest: approvalRequest(),
      promotion: promotion(),
      secondApprovalEligibility: { eligibleRequests: [] },
      currentActor: secondActor,
    })

    expect(result).toMatchObject({ approvalCreated: false, blockedReason: 'REQUEST_NOT_ELIGIBLE' })
  })

  it.each([
    ['mismo actor', approvalRequest().requestedBy, {}, 'SAME_ACTOR_NOT_ALLOWED'],
    ['rol no autorizado', { userId: 'teacher-1', email: 'teacher@example.com', role: 'docente' }, {}, 'ACTOR_ROLE_NOT_ALLOWED'],
    ['hash cambiado', secondActor, { integrity: { hash: 'b'.repeat(64), workflowVersion: '1.1.0' } }, 'PROMOTION_HASH_MISMATCH'],
    ['promocion no verificada', secondActor, { integrityStatus: 'MISMATCH' }, 'PROMOTION_NOT_VERIFIED'],
  ])('bloquea %s', (_label, actor, promotionChanges, blockedReason) => {
    const request = approvalRequest()
    const candidate = promotion(promotionChanges)
    const result = createAdminReviewSecondApproval({
      approvalRequest: request,
      promotion: candidate,
      secondApprovalEligibility: eligibility(request),
      currentActor: actor,
    })

    expect(result).toMatchObject({ approvalCreated: false, blockedReason })
  })

  it('bloquea si ya existe segunda aprobacion para el request', () => {
    const request = approvalRequest()
    const result = createAdminReviewSecondApproval({
      approvalRequest: request,
      promotion: promotion(),
      secondApprovalEligibility: eligibility(request),
      currentActor: secondActor,
      existingSecondApprovals: [{
        secondApprovalId: 'second-existing',
        requestId: request.requestId,
        status: 'SECOND_APPROVED',
      }],
    })

    expect(result).toMatchObject({
      approvalCreated: false,
      blockedReason: 'SECOND_APPROVAL_ALREADY_EXISTS',
      diagnostics: { existingSecondApprovalId: 'second-existing' },
    })
  })

  it('append no reemplaza eventos existentes', () => {
    const first = { secondApprovalId: 'second-1', status: 'SECOND_APPROVED' }
    const duplicate = { secondApprovalId: 'second-1', status: 'CHANGED' }
    const second = { secondApprovalId: 'second-2', status: 'SECOND_APPROVED' }

    expect(appendAdminReviewSecondApproval([first], duplicate)).toEqual([first])
    expect(appendAdminReviewSecondApproval([first], second)).toEqual([first, second])
  })
})
