import { describe, expect, it } from 'vitest'
import {
  ADMIN_REVIEW_REQUIRED_SERVER_CHECKS,
  buildAdminReviewOfficializationPlan,
  fingerprintAdminReviewSchedule,
} from './adminReviewOfficializationPlan.js'

const currentActor = {
  userId: 'admin-3',
  displayName: 'Administrador Tres',
  email: 'admin3@example.com',
  role: 'admin_instituto',
}

function finalReadiness(overrides = {}) {
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
      revisionNumber: 2,
      schedule: [{
        id: 'mesa-1',
        titularId: 'teacher-ana',
        vocales: [{ docenteId: 'teacher-bruno' }, { docenteId: 'teacher-carla' }],
        fechaIso: '2026-07-13',
        inicio: '18:00',
        fin: '20:00',
        isOfficial: false,
      }],
      integrity: { algorithm: 'sha256', hash: 'a'.repeat(64) },
      requestedBy: { userId: 'admin-1', email: 'admin1@example.com', role: 'admin_instituto' },
      approvedBy: { userId: 'admin-2', email: 'admin2@example.com', role: 'superadmin' },
      basedOn: {
        promotionIntegrityHash: 'b'.repeat(64),
        requestIntegrityHash: 'c'.repeat(64),
        secondApprovalIntegrityHash: 'd'.repeat(64),
        appliedDecisionIds: ['decision-1'],
        skippedDecisionIds: ['decision-2'],
      },
      warnings: [],
      diagnostics: { scheduleCount: 1 },
      isOfficial: false,
    },
    blockedReasons: [],
    hardRuleViolations: [],
    warnings: [],
    diagnostics: {},
    ...overrides,
  }
}

function build(overrides = {}) {
  return buildAdminReviewOfficializationPlan({
    finalReadiness: finalReadiness(),
    currentOfficialSchedule: [{ id: 'official-1', confirmada: true }],
    currentActor,
    options: { now: () => '2026-07-11T12:00:00.000Z' },
    ...overrides,
  })
}

describe('buildAdminReviewOfficializationPlan', () => {
  it('genera un plan verificable sin oficializar ni reemplazar', () => {
    const result = build()

    expect(result.canPrepareOfficialization).toBe(true)
    expect(result.blockedReasons).toEqual([])
    expect(result.officializationPlan).toMatchObject({
      planId: expect.stringMatching(/^admin-review-officialization-plan-[a-f0-9]{16}$/),
      type: 'ADMIN_REVIEW_OFFICIALIZATION_PLAN',
      status: 'READY_FOR_SERVER_OFFICIALIZATION',
      candidateId: 'candidate-1',
      promotionId: 'promotion-1',
      requestId: 'request-1',
      secondApprovalId: 'second-1',
      draftId: 'draft-1',
      revisionNumber: 2,
      preparedAt: '2026-07-11T12:00:00.000Z',
      preparedBy: currentActor,
      basedOn: {
        finalCandidateHash: 'a'.repeat(64),
        promotionIntegrityHash: 'b'.repeat(64),
        requestIntegrityHash: 'c'.repeat(64),
        secondApprovalIntegrityHash: 'd'.repeat(64),
        appliedDecisionIds: ['decision-1'],
        skippedDecisionIds: ['decision-2'],
      },
      currentOfficialScheduleFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      proposedOfficialScheduleFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      requiredServerChecks: ADMIN_REVIEW_REQUIRED_SERVER_CHECKS,
      isOfficial: false,
      willReplaceOfficialSchedule: false,
    })
    expect(result.officializationPlan.proposedSchedule[0]).toMatchObject({
      isOfficial: false,
      confirmada: false,
      valid: false,
    })
  })

  it.each([
    ['readiness', { finalReadiness: finalReadiness({ ready: false }) }, 'OFFICIALIZATION_PLAN_READINESS_NOT_READY'],
    ['candidato', { finalReadiness: finalReadiness({ finalCandidate: null }) }, 'OFFICIALIZATION_PLAN_FINAL_CANDIDATE_REQUIRED'],
    ['candidato oficial', { finalReadiness: finalReadiness({ finalCandidate: { ...finalReadiness().finalCandidate, isOfficial: true } }) }, 'OFFICIALIZATION_PLAN_CANDIDATE_ALREADY_OFFICIAL'],
    ['actor', { currentActor: null }, 'OFFICIALIZATION_PLAN_ACTOR_REQUIRED'],
    ['rol', { currentActor: { userId: 'teacher-1', email: 'teacher@example.com', role: 'docente' } }, 'OFFICIALIZATION_PLAN_ACTOR_ROLE_NOT_ALLOWED'],
    ['schedule propuesto', { finalReadiness: finalReadiness({ finalCandidate: { ...finalReadiness().finalCandidate, schedule: [] } }) }, 'OFFICIALIZATION_PLAN_PROPOSED_SCHEDULE_EMPTY'],
  ])('bloquea si falla %s', (_label, changes, expected) => {
    const result = build(changes)
    expect(result.canPrepareOfficialization).toBe(false)
    expect(result.officializationPlan).toBeNull()
    expect(result.blockedReasons).toContain(expected)
  })

  it('exige declarar el estado actual aun cuando no exista cronograma oficial', () => {
    const missing = buildAdminReviewOfficializationPlan({
      finalReadiness: finalReadiness(),
      currentActor,
    })
    const empty = build({ currentOfficialSchedule: [] })

    expect(missing.blockedReasons).toContain('OFFICIALIZATION_PLAN_CURRENT_SCHEDULE_STATE_REQUIRED')
    expect(empty.canPrepareOfficialization).toBe(true)
    expect(empty.diagnostics.currentOfficialScheduleCount).toBe(0)
    expect(empty.officializationPlan.currentOfficialScheduleFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('genera fingerprints deterministas y sensibles a cambios', () => {
    const schedule = [{ id: 'mesa-1', fechaIso: '2026-07-13' }]
    expect(fingerprintAdminReviewSchedule(schedule)).toBe(fingerprintAdminReviewSchedule(structuredClone(schedule)))
    expect(fingerprintAdminReviewSchedule(schedule)).not.toBe(fingerprintAdminReviewSchedule([{ ...schedule[0], fechaIso: '2026-07-14' }]))
    expect(build().officializationPlan.currentOfficialScheduleFingerprint)
      .not.toBe(build().officializationPlan.proposedOfficialScheduleFingerprint)
  })

  it('no muta el cronograma actual ni el candidato', () => {
    const officialSchedule = [{ id: 'official-1', confirmada: true }]
    const readiness = finalReadiness()
    const officialBefore = structuredClone(officialSchedule)
    const candidateBefore = structuredClone(readiness.finalCandidate)

    buildAdminReviewOfficializationPlan({
      finalReadiness: readiness,
      currentOfficialSchedule: officialSchedule,
      currentActor,
    })

    expect(officialSchedule).toEqual(officialBefore)
    expect(readiness.finalCandidate).toEqual(candidateBefore)
  })

  it('bloquea intentos de overwrite directo', () => {
    const result = build({ options: { willReplaceOfficialSchedule: true } })
    expect(result.blockedReasons).toContain('OFFICIALIZATION_PLAN_DIRECT_OVERWRITE_NOT_ALLOWED')
  })

  it('permite mismo segundo aprobador solo como plan tecnico y puede exigir tercer actor', () => {
    const sameApprover = finalReadiness().finalCandidate.approvedBy
    const technical = build({ currentActor: sameApprover })
    const strict = build({
      currentActor: sameApprover,
      options: { requireDistinctPreparer: true },
    })

    expect(technical.canPrepareOfficialization).toBe(true)
    expect(technical.warnings).toContain('PREPARER_MATCHES_SECOND_APPROVER_TECHNICAL_PLAN_ONLY')
    expect(strict.blockedReasons).toContain('OFFICIALIZATION_PLAN_DISTINCT_PREPARER_REQUIRED')
  })

  it('propaga bloqueos y reglas duras del readiness', () => {
    const result = build({
      finalReadiness: finalReadiness({
        blockedReasons: ['FINAL_READINESS_BLOCKED'],
        hardRuleViolations: ['TRIBUNAL_INCOMPLETE:mesa-1'],
      }),
    })
    expect(result.blockedReasons).toEqual(expect.arrayContaining([
      'OFFICIALIZATION_PLAN_INHERITED_BLOCKED_REASONS',
      'OFFICIALIZATION_PLAN_INHERITED_HARD_RULE_VIOLATIONS',
    ]))
  })

  it('no depende de Supabase y diagnostics no exponen payload sensible', () => {
    const result = build()
    const diagnostics = JSON.stringify(result.diagnostics)

    expect(result.canPrepareOfficialization).toBe(true)
    expect(diagnostics).not.toContain('admin3@example.com')
    expect(diagnostics).not.toContain('Administrador Tres')
    expect(diagnostics).not.toContain('official-1')
    expect(diagnostics).not.toContain('mesa-1')
  })
})
