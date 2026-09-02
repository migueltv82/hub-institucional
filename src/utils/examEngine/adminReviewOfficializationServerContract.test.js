import { describe, expect, it } from 'vitest'
import { buildAdminReviewOfficializationPlan } from './adminReviewOfficializationPlan.js'
import {
  buildAdminReviewOfficializationServerPreflight,
  validateAdminReviewOfficializationEventContract,
  validateOfficialExamScheduleVersionContract,
} from './adminReviewOfficializationServerContract.js'

const actor = {
  userId: 'admin-server-1',
  displayName: 'Admin Servidor',
  email: 'server@example.com',
  role: 'admin_instituto',
}

function finalReadiness() {
  return {
    ready: true,
    finalCandidate: {
      candidateId: 'candidate-1',
      type: 'ADMIN_REVIEW_FINAL_CANDIDATE',
      status: 'READY_FOR_OFFICIALIZATION',
      promotionId: 'promotion-1',
      requestId: 'request-1',
      secondApprovalId: 'second-1',
      draftId: 'draft-1',
      revisionNumber: 3,
      schedule: [{
        id: 'mesa-1',
        titularId: 'teacher-ana',
        vocales: [{ docenteId: 'teacher-bruno' }, { docenteId: 'teacher-carla' }],
        fechaIso: '2026-07-13',
        inicio: '18:00',
        fin: '20:00',
        isOfficial: false,
      }],
      integrity: { hash: 'a'.repeat(64) },
      requestedBy: { userId: 'admin-1', role: 'admin_instituto' },
      approvedBy: { userId: 'admin-2', role: 'superadmin' },
      basedOn: {
        promotionIntegrityHash: 'b'.repeat(64),
        requestIntegrityHash: 'c'.repeat(64),
        secondApprovalIntegrityHash: 'd'.repeat(64),
        appliedDecisionIds: ['decision-1'],
        skippedDecisionIds: [],
      },
      isOfficial: false,
    },
    blockedReasons: [],
    hardRuleViolations: [],
    warnings: [],
  }
}

function fixture() {
  const currentOfficialSchedule = [{ id: 'official-1', fechaIso: '2026-06-01', isOfficial: true }]
  const plan = buildAdminReviewOfficializationPlan({
    finalReadiness: finalReadiness(),
    currentOfficialSchedule,
    currentActor: actor,
    options: { now: () => '2026-07-14T12:00:00.000Z' },
  }).officializationPlan
  return { currentOfficialSchedule, plan }
}

function preflight(overrides = {}) {
  const data = fixture()
  return buildAdminReviewOfficializationServerPreflight({
    plan: data.plan,
    institutionId: 'institution-1',
    workspaceKey: 'main',
    authenticatedActor: actor,
    currentOfficialSchedule: data.currentOfficialSchedule,
    activeOfficialVersion: { versionId: 'official-version-previous' },
    existingOfficializationEvents: [],
    latestPromotion: { promotionId: 'promotion-1', revisionNumber: 3 },
    serverRevalidation: {
      administrativeChainPassed: true,
      readinessPassed: true,
      hashesPassed: true,
      hardRulesPassed: true,
      blockedDatesPassed: true,
      latestRevisionPassed: true,
    },
    options: { now: () => '2026-07-14T13:00:00.000Z' },
    ...overrides,
  })
}

describe('adminReviewOfficializationServerContract', () => {
  it('construye contratos validos de evento append-only y version oficial', () => {
    const result = preflight()

    expect(result.canCommit).toBe(true)
    expect(result.diagnostics.persistencePerformed).toBe(false)
    expect(result.officializationEvent).toMatchObject({
      officializationId: expect.stringMatching(/^admin-review-officialization-[a-f0-9]{20}$/),
      type: 'ADMIN_REVIEW_OFFICIALIZATION_EVENT',
      status: 'OFFICIALIZED',
      institutionId: 'institution-1',
      workspaceKey: 'main',
      planId: fixture().plan.planId,
      candidateId: 'candidate-1',
      previousOfficialVersionId: 'official-version-previous',
      newOfficialVersionId: expect.stringMatching(/^official-exam-schedule-version-[a-f0-9]{20}$/),
      serverVerification: {
        authorization: 'PASSED',
        hashReverification: 'PASSED',
        currentScheduleRecheck: 'PASSED',
        appendOnlyWrite: 'PASSED',
        noDirectOverwrite: 'PASSED',
      },
      isOfficial: true,
    })
    expect(result.newOfficialVersion).toMatchObject({
      versionId: result.officializationEvent.newOfficialVersionId,
      status: 'ACTIVE',
      source: 'admin_review_officialization',
      previousVersionId: 'official-version-previous',
      basedOnOfficializationId: result.officializationEvent.officializationId,
      isOfficial: true,
    })
    expect(result.previousVersionUpdate).toEqual({
      versionId: 'official-version-previous',
      status: 'SUPERSEDED',
      supersededByVersionId: result.newOfficialVersion.versionId,
    })
    expect(validateAdminReviewOfficializationEventContract(result.officializationEvent)).toMatchObject({ valid: true, errors: [] })
    expect(validateOfficialExamScheduleVersionContract(result.newOfficialVersion)).toMatchObject({ valid: true, errors: [] })
  })

  it('rechaza si cambio el cronograma oficial desde que se preparo el plan', () => {
    const result = preflight({
      currentOfficialSchedule: [{ id: 'official-2', fechaIso: '2026-06-02', isOfficial: true }],
    })
    expect(result.canCommit).toBe(false)
    expect(result.blockedReasons).toContain('SERVER_OFFICIALIZATION_CURRENT_SCHEDULE_FINGERPRINT_MISMATCH')
  })

  it('rechaza si cambia la propuesta', () => {
    const data = fixture()
    const result = preflight({
      plan: {
        ...data.plan,
        proposedSchedule: [{ ...data.plan.proposedSchedule[0], fechaIso: '2026-07-14' }],
      },
    })
    expect(result.blockedReasons).toContain('SERVER_OFFICIALIZATION_PROPOSED_SCHEDULE_FINGERPRINT_MISMATCH')
  })

  it('rechaza actor ausente o no autorizado', () => {
    expect(preflight({ authenticatedActor: null }).blockedReasons).toContain('SERVER_OFFICIALIZATION_ACTOR_REQUIRED')
    expect(preflight({ authenticatedActor: { userId: 'teacher-1', role: 'docente' } }).blockedReasons)
      .toContain('SERVER_OFFICIALIZATION_ACTOR_ROLE_NOT_ALLOWED')
  })

  it('rechaza evento previo para el plan o candidato', () => {
    const data = fixture()
    const result = preflight({
      existingOfficializationEvents: [{
        officializationId: 'existing-1',
        planId: data.plan.planId,
        candidateId: data.plan.candidateId,
      }],
    })
    expect(result.blockedReasons).toContain('SERVER_OFFICIALIZATION_ALREADY_EXISTS')
  })

  it('rechaza overwrite directo y revision superada', () => {
    const data = fixture()
    expect(preflight({ plan: { ...data.plan, willReplaceOfficialSchedule: true } }).blockedReasons)
      .toContain('SERVER_OFFICIALIZATION_DIRECT_OVERWRITE_NOT_ALLOWED')
    expect(preflight({ latestPromotion: { promotionId: 'promotion-2', revisionNumber: 4 } }).blockedReasons)
      .toContain('SERVER_OFFICIALIZATION_LATEST_PROMOTION_MISMATCH')
  })

  it('exige que el servidor revalide cadena, hashes, readiness y reglas', () => {
    const result = preflight({ serverRevalidation: {} })
    expect(result.blockedReasons).toEqual(expect.arrayContaining([
      'SERVER_OFFICIALIZATION_ADMINISTRATIVE_CHAIN_NOT_REVERIFIED',
      'SERVER_OFFICIALIZATION_READINESS_NOT_REVERIFIED',
      'SERVER_OFFICIALIZATION_HASHES_NOT_REVERIFIED',
      'SERVER_OFFICIALIZATION_HARD_RULES_NOT_REVERIFIED',
      'SERVER_OFFICIALIZATION_BLOCKED_DATES_NOT_REVERIFIED',
      'SERVER_OFFICIALIZATION_LATEST_REVISION_NOT_REVERIFIED',
    ]))
  })

  it('no muta plan ni cronograma y diagnostics no exponen payload sensible', () => {
    const data = fixture()
    const planBefore = structuredClone(data.plan)
    const scheduleBefore = structuredClone(data.currentOfficialSchedule)
    const result = preflight({
      plan: data.plan,
      currentOfficialSchedule: data.currentOfficialSchedule,
      authenticatedActor: { ...actor, email: 'secret@example.com' },
    })
    const diagnostics = JSON.stringify(result.diagnostics)

    expect(data.plan).toEqual(planBefore)
    expect(data.currentOfficialSchedule).toEqual(scheduleBefore)
    expect(diagnostics).not.toContain('secret@example.com')
    expect(diagnostics).not.toContain('official-1')
    expect(diagnostics).not.toContain('mesa-1')
  })
})
