import { describe, expect, it } from 'vitest'
import { buildAdminReviewApprovalEligibility } from './adminReviewApprovalEligibility.js'
import { promoteAdminReviewedDraft } from './adminReviewPromotionWorkflow.js'
import { buildTeacherExamSourceContext } from './teacherExamSourceContext.js'

function fixture() {
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
  const teacherExamSourceContext = buildTeacherExamSourceContext({ disponibilidadDocente, cargaHorariaDocente })
  const decisions = [
    { teacherId: 'teacher-brunovocal', teacherName: 'Bruno Vocal' },
    { teacherId: 'teacher-carlavocal', teacherName: 'Carla Vocal' },
  ].map(({ teacherId, teacherName }) => ({
    decisionId: `TRIBUNAL_SELECTION:mesa-1::${teacherId}::VOCAL`,
    type: 'TRIBUNAL_SELECTION',
    targetId: `mesa-1::${teacherId}::VOCAL`,
    decision: 'SELECTED',
    metadata: {
      tableId: 'mesa-1',
      teacherId,
      teacherName,
      role: 'VOCAL',
    },
    hardRuleViolations: [],
  }))
  const draft = {
    draftId: 'draft-1',
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
  const actor = {
    userId: 'admin-1',
    displayName: 'Admin Instituto',
    email: 'admin@example.com',
    role: 'admin_instituto',
  }
  const promote = (existingPromotions = [], timestamp = '2026-07-10T12:00:00.000Z') => promoteAdminReviewedDraft({
    draft,
    adminReviewDecisions: decisions,
    teacherExamSourceContext,
    options: {
      existingPromotions,
      adminActor: actor,
      now: () => timestamp,
    },
  }).promotionRecord

  return { draft, decisions, teacherExamSourceContext, promote }
}

function evaluate({ promotions, drafts, decisions, teacherExamSourceContext }) {
  return buildAdminReviewApprovalEligibility({
    promotions,
    drafts,
    adminReviewDecisions: decisions,
    teacherExamSourceContext,
    options: { now: () => '2026-07-10T14:00:00.000Z' },
  })
}

describe('buildAdminReviewApprovalEligibility', () => {
  it('deja elegible solo la ultima revision VERIFIED y marca la anterior como superada', () => {
    const data = fixture()
    const first = data.promote()
    const second = data.promote([first], '2026-07-10T13:00:00.000Z')
    const result = evaluate({
      promotions: [first, second],
      drafts: [data.draft],
      decisions: data.decisions,
      teacherExamSourceContext: data.teacherExamSourceContext,
    })

    expect(result.eligiblePromotions).toHaveLength(1)
    expect(result.eligiblePromotions[0]).toMatchObject({
      promotionId: second.promotionId,
      revisionNumber: 2,
      integrityStatus: 'VERIFIED',
    })
    expect(result.latestPromotionByDraft['draft-1'].promotionId).toBe(second.promotionId)
    expect(result.supersededPromotions).toEqual([
      expect.objectContaining({
        promotionId: first.promotionId,
        reason: 'SUPERSEDED_BY_NEWER_REVISION',
        supersededByPromotionId: second.promotionId,
      }),
    ])
    expect(result.blockedPromotions).toEqual([])
  })

  it('bloquea elegibilidad si aparece una fecha bloqueada despues de promover', () => {
    const data = fixture()
    const promotion = data.promote()
    const blockedContext = {
      ...data.teacherExamSourceContext,
      blockedDatesByTeacher: {
        'teacher-brunovocal': [{
          id: 'block-1',
          docenteId: 'teacher-brunovocal',
          date: '2026-07-13',
          scope: 'FULL_DAY',
          status: 'ACTIVE',
        }],
      },
    }
    const result = evaluate({
      promotions: [promotion],
      drafts: [data.draft],
      decisions: data.decisions,
      teacherExamSourceContext: blockedContext,
    })

    expect(result.eligiblePromotions).toEqual([])
    expect(result.blockedPromotions[0].reasons).toEqual(expect.arrayContaining([
      'HARD_RULE:TEACHER_BLOCKED_DATE:mesa-1:teacher-brunovocal',
      'HARD_RULE:VOCAL_BLOCKED_DATE:mesa-1:teacher-brunovocal',
    ]))
  })

  it.each([
    ['MISMATCH', (promotion) => ({
      ...promotion,
      schedule: [{ ...promotion.schedule[0], nombreMateria: 'Alterada' }],
    })],
    ['LEGACY_UNVERIFIED', (promotion) => ({
      promotionId: 'legacy-1',
      draftId: promotion.draftId,
      revisionNumber: 1,
      type: promotion.type,
      status: promotion.status,
      schedule: promotion.schedule,
      adminActor: promotion.adminActor,
      isOfficialCandidate: true,
      isOfficial: false,
    })],
    ['VERIFY_ERROR', (promotion) => ({ ...promotion, draftId: 'missing-draft' })],
  ])('bloquea una promocion %s', (expectedStatus, mutate) => {
    const data = fixture()
    const promotion = mutate(data.promote())
    const result = evaluate({
      promotions: [promotion],
      drafts: [data.draft],
      decisions: data.decisions,
      teacherExamSourceContext: data.teacherExamSourceContext,
    })

    expect(result.eligiblePromotions).toEqual([])
    expect(result.blockedPromotions[0].promotion.integrityStatus).toBe(expectedStatus)
    expect(result.blockedPromotions[0].reasons).toContain(`INTEGRITY_NOT_VERIFIED:${expectedStatus}`)
  })

  it.each([
    ['draftId', { draftId: '' }, 'DRAFT_ID_REQUIRED'],
    ['promotionId', { promotionId: '' }, 'PROMOTION_ID_REQUIRED'],
    ['revisionNumber', { revisionNumber: undefined }, 'REVISION_NUMBER_REQUIRED'],
    ['type', { type: 'UNKNOWN_PROMOTION' }, 'INVALID_PROMOTION_TYPE'],
    ['status blocked', { status: 'REVIEW_BLOCKED_HARD_RULES' }, 'INVALID_PROMOTION_STATUS:REVIEW_BLOCKED_HARD_RULES'],
    ['status incomplete', { status: 'REVIEW_INCOMPLETE' }, 'INVALID_PROMOTION_STATUS:REVIEW_INCOMPLETE'],
    ['isOfficial', { isOfficial: true }, 'PROMOTION_ALREADY_OFFICIAL'],
  ])('bloquea promocion invalida por %s', (_field, changes, expectedReason) => {
    const data = fixture()
    const promotion = { ...data.promote(), ...changes }
    const result = evaluate({
      promotions: [promotion],
      drafts: [data.draft],
      decisions: data.decisions,
      teacherExamSourceContext: data.teacherExamSourceContext,
    })

    expect(result.eligiblePromotions).toEqual([])
    expect(result.blockedPromotions[0].reasons).toContain(expectedReason)
  })

  it('bloquea actor ausente, tribunal incompleto y decision fuente faltante', () => {
    const data = fixture()
    const promotion = data.promote()
    const invalid = {
      ...promotion,
      adminActor: null,
      schedule: [{ ...promotion.schedule[0], vocales: promotion.schedule[0].vocales.slice(0, 1) }],
    }
    const result = evaluate({
      promotions: [invalid],
      drafts: [data.draft],
      decisions: data.decisions.slice(0, 1),
      teacherExamSourceContext: data.teacherExamSourceContext,
    })

    expect(result.blockedPromotions[0].reasons).toEqual(expect.arrayContaining([
      'ADMIN_ACTOR_REQUIRED',
      'TRIBUNAL_INCOMPLETE:mesa-1',
      `SOURCE_DECISION_NOT_FOUND:${data.decisions[1].decisionId}`,
    ]))
  })

  it('mantiene diagnostics agregados sin payload docente sensible', () => {
    const data = fixture()
    const result = evaluate({
      promotions: [data.promote()],
      drafts: [data.draft],
      decisions: data.decisions,
      teacherExamSourceContext: data.teacherExamSourceContext,
    })

    expect(result.diagnostics).toMatchObject({
      totalPromotions: 1,
      eligiblePromotions: 1,
      blockedPromotions: 0,
      supersededPromotions: 0,
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain('Ana Titular')
    expect(JSON.stringify(result.diagnostics)).not.toContain('disponibilidadPorDocente')
    expect(JSON.stringify(result.diagnostics)).not.toContain('admin@example.com')
  })
})
