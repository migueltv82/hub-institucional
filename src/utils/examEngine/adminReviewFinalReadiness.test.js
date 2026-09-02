import { describe, expect, it } from 'vitest'
import { buildAdminReviewApprovalEligibility } from './adminReviewApprovalEligibility.js'
import { createAdminReviewApprovalRequest } from './adminReviewApprovalRequest.js'
import { buildAdminReviewFinalReadiness } from './adminReviewFinalReadiness.js'
import { promoteAdminReviewedDraft } from './adminReviewPromotionWorkflow.js'
import { createAdminReviewSecondApproval } from './adminReviewSecondApproval.js'
import { buildAdminReviewSecondApprovalEligibility } from './adminReviewSecondApprovalEligibility.js'
import { buildTeacherExamSourceContext } from './teacherExamSourceContext.js'

const requester = {
  userId: 'requester-1',
  displayName: 'Solicitante Uno',
  email: 'requester@example.com',
  role: 'admin_instituto',
}
const approver = {
  userId: 'approver-1',
  displayName: 'Aprobador Dos',
  email: 'approver@example.com',
  role: 'superadmin',
}

function buildFixture({ blockedDates = [] } = {}) {
  const disponibilidadDocente = ['Ana Titular', 'Bruno Vocal', 'Carla Vocal'].map((docente) => ({
    docente,
    dia: 'Lunes',
    turno: 'NOCHE',
    hora_desde: '18:00',
    hora_hasta: '20:00',
  }))
  const cargaHorariaDocente = [
    { docente: 'Ana Titular', carrera: 'Profesorado Ingles', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 8, rol_en_materia: 'TITULAR' },
    { docente: 'Bruno Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING2', materia_nombre: 'Ingles II', horasCatedra: 4, rol_en_materia: 'AUXILIAR' },
    { docente: 'Carla Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING3', materia_nombre: 'Ingles III', horasCatedra: 4, rol_en_materia: 'AUXILIAR' },
  ]
  const context = buildTeacherExamSourceContext({
    disponibilidadDocente,
    cargaHorariaDocente,
    fechasBloqueadasDocente: blockedDates,
  })
  const decisions = [
    { teacherId: 'teacher-brunovocal', teacherName: 'Bruno Vocal' },
    { teacherId: 'teacher-carlavocal', teacherName: 'Carla Vocal' },
  ].map(({ teacherId, teacherName }) => ({
    decisionId: `TRIBUNAL_SELECTION:mesa-1::${teacherId}::VOCAL`,
    type: 'TRIBUNAL_SELECTION',
    targetId: `mesa-1::${teacherId}::VOCAL`,
    decision: 'SELECTED',
    metadata: { tableId: 'mesa-1', teacherId, teacherName, role: 'VOCAL' },
    hardRuleViolations: [],
  }))
  const draft = {
    draftId: 'draft-final-1',
    type: 'ADMIN_REVIEWED_SCHEDULE_DRAFT',
    status: 'REVIEW_READY',
    source: 'admin_review_workflow',
    basedOn: {
      preScheduleHash: 'hash-1',
      decisionIds: decisions.map((decision) => decision.decisionId),
      teacherSource: 'structured',
      workspaceKey: 'main',
    },
    schedule: [{
      id: 'mesa-1',
      carrera: 'Profesorado Ingles',
      materia: 'ING1',
      nombreMateria: 'Ingles I',
      titularId: 'teacher-anatitular',
      titular: 'Ana Titular',
      fechaIso: '2026-07-13',
      turno: 'NOCHE',
      inicio: '18:00',
      fin: '20:00',
      vocales: decisions.map((decision) => ({
        docenteId: decision.metadata.teacherId,
        docente: decision.metadata.teacherName,
        role: 'VOCAL',
        decisionId: decision.decisionId,
      })),
      isOfficial: false,
      confirmada: false,
      valid: false,
    }],
    appliedDecisions: decisions.map((decision) => ({
      decisionId: decision.decisionId,
      type: decision.type,
      decision: decision.decision,
    })),
    skippedDecisions: [],
    hardRuleViolations: [],
    warnings: [],
    diagnostics: { totalSchedule: 1, appliedDecisions: 2, skippedDecisions: 0, completeTribunals: 1 },
    isOfficial: false,
  }
  const promotion = promoteAdminReviewedDraft({
    draft,
    adminReviewDecisions: decisions,
    teacherExamSourceContext: context,
    options: {
      now: () => '2026-07-10T12:00:00.000Z',
      adminActor: { ...requester, userId: 'promoter-1', email: 'promoter@example.com' },
    },
  }).promotionRecord
  const approvalEligibility = buildAdminReviewApprovalEligibility({
    promotions: [promotion],
    drafts: [draft],
    adminReviewDecisions: decisions,
    teacherExamSourceContext: context,
  })
  const request = createAdminReviewApprovalRequest({
    promotion,
    approvalEligibility,
    adminActor: requester,
    options: { now: () => '2026-07-10T15:00:00.000Z' },
  }).approvalRequest
  const secondEligibility = buildAdminReviewSecondApprovalEligibility({
    approvalRequests: [request],
    promotions: [promotion],
    approvalEligibility,
    currentActor: approver,
  })
  const secondApproval = createAdminReviewSecondApproval({
    approvalRequest: request,
    promotion,
    secondApprovalEligibility: secondEligibility,
    currentActor: approver,
    options: { now: () => '2026-07-10T16:00:00.000Z' },
  }).secondApproval

  return {
    context,
    disponibilidadDocente,
    cargaHorariaDocente,
    decisions,
    draft,
    promotion,
    request,
    secondApproval,
  }
}

function evaluate(data, overrides = {}) {
  return buildAdminReviewFinalReadiness({
    promotions: [data.promotion],
    approvalRequests: [data.request],
    secondApprovals: [data.secondApproval],
    drafts: [data.draft],
    adminReviewDecisions: data.decisions,
    teacherExamSourceContext: data.context,
    currentActor: approver,
    ...overrides,
  })
}

describe('buildAdminReviewFinalReadiness', () => {
  it('genera candidato final experimental cuando toda la cadena es valida', () => {
    const data = buildFixture()
    const officialSchedule = [{ id: 'official-1', confirmada: true }]
    const before = structuredClone(officialSchedule)
    const result = evaluate(data)

    expect(result.ready).toBe(true)
    expect(result.blockedReasons).toEqual([])
    expect(result.finalCandidate).toMatchObject({
      candidateId: expect.stringMatching(/^admin-review-final-[a-f0-9]{16}$/),
      type: 'ADMIN_REVIEW_FINAL_CANDIDATE',
      status: 'READY_FOR_OFFICIALIZATION',
      promotionId: data.promotion.promotionId,
      requestId: data.request.requestId,
      secondApprovalId: data.secondApproval.secondApprovalId,
      draftId: data.draft.draftId,
      revisionNumber: 1,
      integrity: { algorithm: 'sha256', hash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      requestedBy: requester,
      approvedBy: approver,
      isOfficial: false,
    })
    expect(result.finalCandidate.schedule[0]).toMatchObject({ isOfficial: false, confirmada: false, valid: false })
    expect(officialSchedule).toEqual(before)
  })

  it.each([
    ['promocion', (_data) => ({ promotions: [] }), 'FINAL_READINESS_NO_ELIGIBLE_PROMOTION'],
    ['request', () => ({ approvalRequests: [] }), 'FINAL_READINESS_MISSING_REQUEST'],
    ['segunda aprobacion', () => ({ secondApprovals: [] }), 'FINAL_READINESS_MISSING_SECOND_APPROVAL'],
  ])('bloquea si falta %s', (_label, changes, expected) => {
    const data = buildFixture()
    const result = evaluate(data, changes(data))
    expect(result.ready).toBe(false)
    expect(result.blockedReasons).toContain(expected)
  })

  it('bloquea request o second approval duplicados', () => {
    const data = buildFixture()
    const duplicateRequest = { ...data.request, requestId: 'request-duplicate' }
    const requestResult = evaluate(data, { approvalRequests: [data.request, duplicateRequest] })
    const duplicateApproval = { ...data.secondApproval, secondApprovalId: 'second-duplicate' }
    const approvalResult = evaluate(data, { secondApprovals: [data.secondApproval, duplicateApproval] })

    expect(requestResult.blockedReasons).toContain('FINAL_READINESS_DUPLICATE_REQUEST')
    expect(approvalResult.blockedReasons).toContain('FINAL_READINESS_DUPLICATE_SECOND_APPROVAL')
  })

  it('bloquea hashes alterados y mismo actor', () => {
    const data = buildFixture()
    expect(evaluate(data, {
      approvalRequests: [{ ...data.request, basedOn: { ...data.request.basedOn, promotionIntegrityHash: 'old' } }],
    }).blockedReasons).toContain('FINAL_READINESS_PROMOTION_HASH_MISMATCH')
    expect(evaluate(data, {
      secondApprovals: [{ ...data.secondApproval, basedOn: { ...data.secondApproval.basedOn, requestHash: 'old' } }],
    }).blockedReasons).toContain('FINAL_READINESS_REQUEST_HASH_MISMATCH')
    expect(evaluate(data, {
      secondApprovals: [{ ...data.secondApproval, approvedBy: data.request.requestedBy }],
    }).blockedReasons).toContain('FINAL_READINESS_SAME_ACTOR')
  })

  it('bloquea actores ausentes o roles no autorizados', () => {
    const data = buildFixture()
    expect(evaluate(data, {
      approvalRequests: [{ ...data.request, requestedBy: null }],
    }).blockedReasons).toContain('FINAL_READINESS_ACTOR_REQUIRED')
    expect(evaluate(data, {
      secondApprovals: [{ ...data.secondApproval, approvedBy: { userId: 'teacher-1', role: 'docente' } }],
    }).blockedReasons).toContain('FINAL_READINESS_ACTOR_ROLE_NOT_ALLOWED:APPROVER')
  })

  it('bloquea tribunal incompleto y reglas duras', () => {
    const data = buildFixture()
    const incomplete = { ...data.promotion, schedule: [{ ...data.promotion.schedule[0], vocales: [] }] }
    const result = evaluate(data, { promotions: [incomplete] })

    expect(result.ready).toBe(false)
    expect(result.blockedReasons).toContain('FINAL_READINESS_INCOMPLETE_TRIBUNAL:mesa-1')
    expect(result.hardRuleViolations).toContain('TRIBUNAL_INCOMPLETE:mesa-1')
  })

  it('revalida el borrador contra decisiones administrativas actuales', () => {
    const data = buildFixture()
    const changedDecisions = data.decisions.map((decision, index) => (
      index === 0 ? { ...decision, decision: 'REMOVED' } : decision
    ))
    const result = evaluate(data, { adminReviewDecisions: changedDecisions })

    expect(result.ready).toBe(false)
    expect(result.hardRuleViolations).toContain(`APPLIED_DECISION_NO_LONGER_VALID:${data.decisions[0].decisionId}`)
  })

  it.each([
    ['titular', 'Ana Titular', 'FULL_DAY', '', '', 'FINAL_READINESS_TITULAR_BLOCKED_DATE:mesa-1:teacher-anatitular'],
    ['vocal', 'Bruno Vocal', 'FULL_DAY', '', '', 'FINAL_READINESS_VOCAL_BLOCKED_DATE:mesa-1:teacher-brunovocal'],
    ['titular parcial', 'Ana Titular', 'TIME_RANGE', '19:00', '21:00', 'FINAL_READINESS_TITULAR_BLOCKED_DATE:mesa-1:teacher-anatitular'],
    ['vocal parcial', 'Bruno Vocal', 'TIME_RANGE', '19:00', '21:00', 'FINAL_READINESS_VOCAL_BLOCKED_DATE:mesa-1:teacher-brunovocal'],
  ])('bloquea %s en fecha o franja solapada', (_label, docenteNombre, scope, startTime, endTime, expected) => {
    const data = buildFixture()
    const blockedContext = buildTeacherExamSourceContext({
      disponibilidadDocente: data.disponibilidadDocente,
      cargaHorariaDocente: data.cargaHorariaDocente,
      fechasBloqueadasDocente: [{ docenteNombre, date: '2026-07-13', scope, startTime, endTime, status: 'ACTIVE' }],
    })
    const result = evaluate(data, { teacherExamSourceContext: blockedContext })

    expect(result.ready).toBe(false)
    expect(result.blockedReasons).toContain(expected)
    expect(result.blockedReasons).toContain(`FINAL_READINESS_BLOCKED_DATE_CONFLICT:mesa-1:${expected.split(':').at(-1)}`)
  })

  it('permite bloqueo parcial contiguo sin solapamiento', () => {
    const data = buildFixture({
      blockedDates: [{
        docenteNombre: 'Bruno Vocal',
        date: '2026-07-13',
        scope: 'TIME_RANGE',
        startTime: '16:00',
        endTime: '18:00',
        status: 'ACTIVE',
      }],
    })
    const result = evaluate(data)

    expect(result.ready).toBe(true)
    expect(result.blockedReasons.some((reason) => reason.includes('BLOCKED_DATE'))).toBe(false)
  })

  it('bloquea promociones ambiguas y revisiones superadas referenciadas', () => {
    const data = buildFixture()
    const ambiguous = evaluate(data, { promotions: [data.promotion, structuredClone(data.promotion)] })
    const newer = promoteAdminReviewedDraft({
      draft: data.draft,
      adminReviewDecisions: data.decisions,
      teacherExamSourceContext: data.context,
      options: {
        existingPromotions: [data.promotion],
        now: () => '2026-07-10T17:00:00.000Z',
        adminActor: { ...requester, userId: 'promoter-1' },
      },
    }).promotionRecord
    const superseded = evaluate(data, { promotions: [data.promotion, newer] })

    expect(ambiguous.blockedReasons).toContain('FINAL_READINESS_AMBIGUOUS_PROMOTION')
    expect(superseded.blockedReasons).toContain('FINAL_READINESS_SUPERSEDED_PROMOTION')
  })

  it('diagnostics no exponen actores, motivos ni payload sensible', () => {
    const data = buildFixture()
    const diagnostics = JSON.stringify(evaluate(data).diagnostics)
    expect(diagnostics).not.toContain('requester@example.com')
    expect(diagnostics).not.toContain('Aprobador Dos')
    expect(diagnostics).not.toContain('ING1')
  })
})
