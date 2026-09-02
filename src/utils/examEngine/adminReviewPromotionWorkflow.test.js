import { describe, expect, it } from 'vitest'
import { buildTeacherExamSourceContext } from './teacherExamSourceContext.js'
import {
  buildAdminReviewPromotionIntegrity,
  doTimeRangesOverlap,
  promoteAdminReviewedDraft,
  sha256Hex,
  upsertAdminReviewedPromotion,
  validateAdminReviewedDraftForPromotion,
  verifyAdminReviewPromotionIntegrity,
  verifyAdminReviewPromotionEvent,
  verifyAdminReviewPromotionEvents,
} from './adminReviewPromotionWorkflow.js'

function context({ brunoHours = 4, fechasBloqueadasDocente = [] } = {}) {
  const teachers = ['Ana Titular', 'Bruno Vocal', 'Carla Vocal', 'Diego Titular', 'Elena Vocal']
  return buildTeacherExamSourceContext({
    disponibilidadDocente: teachers.map((docente) => ({
      docente,
      dia: 'Lunes',
      turno: 'NOCHE',
      hora_desde: '18:00',
      hora_hasta: '22:00',
    })),
    cargaHorariaDocente: [
      { docente: 'Ana Titular', carrera: 'Profesorado Ingles', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 8, rol_en_materia: 'TITULAR' },
      { docente: 'Bruno Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING2', materia_nombre: 'Ingles II', horasCatedra: brunoHours, rol_en_materia: 'AUXILIAR' },
      { docente: 'Carla Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING3', materia_nombre: 'Ingles III', horasCatedra: 8, rol_en_materia: 'AUXILIAR' },
      { docente: 'Diego Titular', carrera: 'Profesorado Ingles', materia_codigo: 'ING4', materia_nombre: 'Ingles IV', horasCatedra: 8, rol_en_materia: 'TITULAR' },
      { docente: 'Elena Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING5', materia_nombre: 'Ingles V', horasCatedra: 8, rol_en_materia: 'AUXILIAR' },
    ],
    fechasBloqueadasDocente,
  })
}

function selectionDecision({ tableId, teacherId, teacherName }) {
  const decisionId = `TRIBUNAL_SELECTION:${tableId}::${teacherId}::VOCAL`
  return {
    decisionId,
    type: 'TRIBUNAL_SELECTION',
    targetId: `${tableId}::${teacherId}::VOCAL`,
    decision: 'SELECTED',
    metadata: {
      tableId,
      teacherId,
      teacherName,
      role: 'VOCAL',
    },
    hardRuleViolations: [],
  }
}

function mesa({
  id = 'mesa-1',
  date = '2026-07-13',
  start = '18:00',
  end = '20:00',
  titularId = 'teacher-anatitular',
  vocales = [
    { docenteId: 'teacher-brunovocal', docente: 'Bruno Vocal' },
    { docenteId: 'teacher-carlavocal', docente: 'Carla Vocal' },
  ],
} = {}) {
  return {
    id,
    carrera: 'Profesorado Ingles',
    materia: 'ING1',
    nombreMateria: 'Ingles I',
    titularId,
    fechaIso: date,
    turno: 'NOCHE',
    inicio: start,
    fin: end,
    vocales: vocales.map((vocal) => ({
      ...vocal,
      role: 'VOCAL',
      decisionId: `TRIBUNAL_SELECTION:${id}::${vocal.docenteId}::VOCAL`,
    })),
    isOfficial: false,
    confirmada: false,
    valid: false,
  }
}

function decisionsForSchedule(schedule) {
  return schedule.flatMap((table) => table.vocales.map((vocal) => selectionDecision({
    tableId: table.id,
    teacherId: vocal.docenteId,
    teacherName: vocal.docente,
  })))
}

function draftFor(schedule, decisions, overrides = {}) {
  return {
    draftId: 'draft-valid-1',
    type: 'ADMIN_REVIEWED_SCHEDULE_DRAFT',
    status: 'REVIEW_READY',
    source: 'admin_review_workflow',
    basedOn: {
      preScheduleHash: 'hash-1',
      decisionIds: decisions.map((decision) => decision.decisionId),
      teacherSource: 'structured',
      workspaceKey: 'main',
    },
    schedule,
    appliedDecisions: decisions.map((decision) => ({
      decisionId: decision.decisionId,
      type: decision.type,
      decision: decision.decision,
    })),
    skippedDecisions: [],
    hardRuleViolations: [],
    warnings: [],
    diagnostics: { totalSchedule: schedule.length },
    isOfficial: false,
    ...overrides,
  }
}

describe('promoteAdminReviewedDraft', () => {
  it('implementa SHA-256 deterministico sobre serializacion estable', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('detecta solapamientos parciales y permite franjas contiguas', () => {
    expect(doTimeRangesOverlap('18:00', '20:00', '19:00', '21:00')).toBe(true)
    expect(doTimeRangesOverlap('18:00:00', '20:00:00', '19:30:00', '21:00:00')).toBe(true)
    expect(doTimeRangesOverlap('18:00', '20:00', '20:00', '22:00')).toBe(false)
    expect(doTimeRangesOverlap('', '20:00', '19:00', '21:00')).toBe(false)
    expect(doTimeRangesOverlap('25:00', '26:00', '19:00', '21:00')).toBe(false)
    expect(doTimeRangesOverlap('20:00', '18:00', '19:00', '21:00')).toBe(false)
  })

  it('promueve un borrador valido con trazabilidad y sin volverlo oficial', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const original = draftFor(schedule, decisions)

    const result = promoteAdminReviewedDraft({
      draft: original,
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
      options: {
        now: () => '2026-07-10T12:00:00.000Z',
        adminActor: {
          userId: 'admin-1',
          displayName: 'Administradora Uno',
          email: 'admin@example.com',
          role: 'admin_instituto',
        },
      },
    })

    expect(result.promoted).toBe(true)
    expect(result.promotionRecord).toMatchObject({
      promotionId: 'admin-review-promotion-draft-valid-1-r1',
      draftId: 'draft-valid-1',
      revisionNumber: 1,
      previousPromotionId: null,
      type: 'ADMIN_REVIEWED_SCHEDULE_PROMOTION',
      status: 'PROMOTED_EXPERIMENTAL',
      promotedAt: '2026-07-10T12:00:00.000Z',
      source: 'admin_review_workflow',
      isOfficialCandidate: true,
      isOfficial: false,
      appliedDecisionIds: decisions.map((decision) => decision.decisionId),
      skippedDecisionIds: [],
      integrity: {
        algorithm: 'sha256',
        workflowVersion: '1.1.0',
        generatedAt: '2026-07-10T12:00:00.000Z',
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        inputs: {
          draftHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          appliedDecisionsHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          skippedDecisionsHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          teacherContextHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      },
      adminActor: {
        userId: 'admin-1',
        displayName: 'Administradora Uno',
        email: 'admin@example.com',
        role: 'admin_instituto',
      },
    })
    expect(result.promotedSchedule[0]).toMatchObject({
      isOfficial: false,
      isOfficialCandidate: true,
      confirmada: false,
      valid: false,
    })
    expect(original.schedule[0]).not.toHaveProperty('isOfficialCandidate')
    expect(result.diagnostics.ledger.find((entry) => entry.docenteId === 'teacher-anatitular')).toMatchObject({
      afectacionesUsadas: 0,
    })
    expect(JSON.stringify(result.diagnostics)).not.toContain('disponibilidadPorDocente')
    expect(JSON.stringify(result.diagnostics)).not.toContain('Ana Titular')
    expect(JSON.stringify(result.promotionRecord.integrity)).not.toContain('Ana Titular')
    expect(JSON.stringify(result.promotionRecord.integrity)).not.toContain('admin@example.com')
    expect(JSON.stringify(result.promotionRecord.integrity)).not.toContain('disponibilidadPorDocente')

    expect(verifyAdminReviewPromotionIntegrity({
      promotion: result.promotionRecord,
      draft: original,
      teacherExamSourceContext: context(),
    })).toEqual({
      valid: true,
      error: '',
      mismatches: [],
    })
  })

  it('bloquea promocion si un titular o vocal tiene la fecha bloqueada', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const result = promoteAdminReviewedDraft({
      draft: draftFor(schedule, decisions),
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context({
        fechasBloqueadasDocente: [{
          docenteNombre: 'Bruno Vocal',
          date: '2026-07-13',
          scope: 'FULL_DAY',
          status: 'ACTIVE',
        }],
      }),
    })

    expect(result.promoted).toBe(false)
    expect(result.hardRuleViolations).toEqual(expect.arrayContaining([
      'TEACHER_BLOCKED_DATE:mesa-1:teacher-brunovocal',
      'VOCAL_BLOCKED_DATE:mesa-1:teacher-brunovocal',
      'BLOCKED_DATE_CONFLICT:mesa-1:teacher-brunovocal',
    ]))
  })

  it('agrega actor de fallback y warning si no hay identidad administrativa', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const result = promoteAdminReviewedDraft({
      draft: draftFor(schedule, decisions),
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
      options: { now: () => '2026-07-10T12:00:00.000Z' },
    })

    expect(result.promoted).toBe(true)
    expect(result.promotionRecord.adminActor).toEqual({
      userId: null,
      displayName: 'ADMIN_REVIEW_USER_UNAVAILABLE',
      email: null,
      role: null,
    })
    expect(result.warnings).toContain('ADMIN_ACTOR_UNAVAILABLE')
  })

  it('cambia el sello si cambia el borrador o las decisiones aplicadas', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const baseDraft = draftFor(schedule, decisions)
    const changedDraft = draftFor([{ ...schedule[0], nombreMateria: 'Ingles I actualizado' }], decisions)
    const groupingDecision = {
      decisionId: 'GROUPING:group-1',
      type: 'GROUPING',
      targetId: 'group-1',
      decision: 'ACCEPTED',
      hardRuleViolations: [],
    }
    const changedDecisionsDraft = {
      ...baseDraft,
      basedOn: {
        ...baseDraft.basedOn,
        decisionIds: [...baseDraft.basedOn.decisionIds, groupingDecision.decisionId],
      },
      appliedDecisions: [...baseDraft.appliedDecisions, groupingDecision],
      diagnostics: {
        ...baseDraft.diagnostics,
        appliedDecisions: baseDraft.appliedDecisions.length + 1,
      },
    }
    const fixed = {
      generatedAt: '2026-07-10T12:00:00.000Z',
      teacherExamSourceContext: context(),
    }
    const base = buildAdminReviewPromotionIntegrity({
      ...fixed,
      draft: baseDraft,
      appliedDecisionIds: decisions.map((decision) => decision.decisionId),
    })
    const changedContent = buildAdminReviewPromotionIntegrity({
      ...fixed,
      draft: changedDraft,
      appliedDecisionIds: decisions.map((decision) => decision.decisionId),
    })
    const changedDecisions = buildAdminReviewPromotionIntegrity({
      ...fixed,
      draft: changedDecisionsDraft,
      appliedDecisionIds: [...decisions.map((decision) => decision.decisionId), groupingDecision.decisionId],
    })

    expect(base.integrity.hash).not.toBe(changedContent.integrity.hash)
    expect(base.integrity.inputs.draftHash).not.toBe(changedContent.integrity.inputs.draftHash)
    expect(base.integrity.inputs.appliedDecisionsHash).not.toBe(changedDecisions.integrity.inputs.appliedDecisionsHash)
  })

  it('el verificador detecta alteraciones posteriores y promociones legacy sin sello', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const original = draftFor(schedule, decisions)
    const result = promoteAdminReviewedDraft({
      draft: original,
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
      options: { now: () => '2026-07-10T12:00:00.000Z' },
    })
    const altered = {
      ...original,
      schedule: [{ ...original.schedule[0], nombreMateria: 'Contenido alterado' }],
    }

    expect(verifyAdminReviewPromotionIntegrity({
      promotion: result.promotionRecord,
      draft: altered,
      teacherExamSourceContext: context(),
    })).toMatchObject({
      valid: false,
      error: 'INTEGRITY_MISMATCH',
      mismatches: expect.arrayContaining(['hash', 'inputs.draftHash']),
    })
    expect(verifyAdminReviewPromotionIntegrity({
      promotion: { promotionId: 'legacy-1' },
      draft: original,
      teacherExamSourceContext: context(),
    })).toEqual({
      valid: false,
      error: 'INTEGRITY_MISSING',
      mismatches: ['integrity'],
    })
  })

  it('clasifica automaticamente promociones verificadas, alteradas, legacy y con error', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const original = draftFor(schedule, decisions)
    const result = promoteAdminReviewedDraft({
      draft: original,
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
      options: { now: () => '2026-07-10T12:00:00.000Z' },
    })
    const verified = verifyAdminReviewPromotionEvent({
      promotion: result.promotionRecord,
      draft: original,
      teacherExamSourceContext: context(),
      now: () => '2026-07-10T13:00:00.000Z',
    })
    const alteredDraft = {
      ...original,
      schedule: [{ ...original.schedule[0], nombreMateria: 'Contenido alterado' }],
    }
    const mismatch = verifyAdminReviewPromotionEvent({
      promotion: result.promotionRecord,
      draft: alteredDraft,
      teacherExamSourceContext: context(),
      now: () => '2026-07-10T13:00:00.000Z',
    })
    const legacy = verifyAdminReviewPromotionEvent({
      promotion: { promotionId: 'legacy-1', draftId: 'draft-valid-1', isOfficialCandidate: true },
      draft: original,
      teacherExamSourceContext: context(),
      now: () => '2026-07-10T13:00:00.000Z',
    })
    const verifyError = verifyAdminReviewPromotionEvent({
      promotion: result.promotionRecord,
      draft: null,
      teacherExamSourceContext: context(),
      now: () => '2026-07-10T13:00:00.000Z',
    })

    expect(verified).toMatchObject({
      integrityStatus: 'VERIFIED',
      isOfficialCandidate: true,
      integrityVerification: {
        status: 'VERIFIED',
        mismatchFields: [],
        eligibleForFutureApproval: true,
      },
    })
    expect(mismatch).toMatchObject({
      integrityStatus: 'MISMATCH',
      isOfficialCandidate: false,
      integrityVerification: {
        mismatchFields: expect.arrayContaining(['hash', 'inputs.draftHash', 'promotion.schedule']),
        eligibleForFutureApproval: false,
      },
    })
    expect(legacy).toMatchObject({
      integrityStatus: 'LEGACY_UNVERIFIED',
      isOfficialCandidate: false,
      integrityVerification: {
        warnings: ['LEGACY_PROMOTION_WITHOUT_INTEGRITY'],
      },
    })
    expect(verifyError).toMatchObject({
      integrityStatus: 'VERIFY_ERROR',
      isOfficialCandidate: false,
      integrityVerification: {
        mismatchFields: ['draft'],
        warnings: ['SOURCE_DRAFT_NOT_FOUND'],
      },
    })
  })

  it('verifica una coleccion al recargar y conserva verifiedAt si el resultado no cambia', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const original = draftFor(schedule, decisions)
    const result = promoteAdminReviewedDraft({
      draft: original,
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
      options: { now: () => '2026-07-10T12:00:00.000Z' },
    })
    const first = verifyAdminReviewPromotionEvents({
      promotions: [result.promotionRecord],
      drafts: [original],
      teacherExamSourceContext: context(),
      now: () => '2026-07-10T13:00:00.000Z',
    })
    const second = verifyAdminReviewPromotionEvents({
      promotions: first,
      drafts: [original],
      teacherExamSourceContext: context(),
      now: () => '2026-07-10T14:00:00.000Z',
    })

    expect(first[0].integrityStatus).toBe('VERIFIED')
    expect(second[0].integrityVerification.verifiedAt).toBe(first[0].integrityVerification.verifiedAt)
  })

  it.each([
    ['REVIEW_BLOCKED_HARD_RULES'],
    ['REVIEW_INCOMPLETE'],
  ])('bloquea estado no promovible %s', (status) => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const result = promoteAdminReviewedDraft({
      draft: draftFor(schedule, decisions, { status }),
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
    })

    expect(result.promoted).toBe(false)
    expect(result.hardRuleViolations).toContain(`DRAFT_STATUS_NOT_PROMOTABLE:${status}`)
  })

  it('bloquea mesas incompletas', () => {
    const schedule = [mesa({ vocales: [{ docenteId: 'teacher-brunovocal', docente: 'Bruno Vocal' }] })]
    const decisions = decisionsForSchedule(schedule)
    const validation = validateAdminReviewedDraftForPromotion({
      draft: draftFor(schedule, decisions),
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
    })

    expect(validation.valid).toBe(false)
    expect(validation.hardRuleViolations).toContain('TRIBUNAL_INCOMPLETE:mesa-1')
  })

  it('bloquea docentes duplicados dentro del tribunal', () => {
    const schedule = [mesa({ vocales: [
      { docenteId: 'teacher-brunovocal', docente: 'Bruno Vocal' },
      { docenteId: 'teacher-brunovocal', docente: 'Bruno Vocal' },
    ] })]
    const decisions = decisionsForSchedule(schedule)
    const result = promoteAdminReviewedDraft({
      draft: draftFor(schedule, decisions),
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
    })

    expect(result.promoted).toBe(false)
    expect(result.hardRuleViolations).toContain('DUPLICATED_TEACHER_IN_TRIBUNAL:mesa-1')
  })

  it('bloquea solapamiento parcial de un docente en la misma fecha', () => {
    const schedule = [
      mesa({ id: 'mesa-1' }),
      mesa({
        id: 'mesa-2',
        start: '19:00',
        end: '21:00',
        titularId: 'teacher-diegotitular',
        vocales: [
          { docenteId: 'teacher-brunovocal', docente: 'Bruno Vocal' },
          { docenteId: 'teacher-elenavocal', docente: 'Elena Vocal' },
        ],
      }),
    ]
    const decisions = decisionsForSchedule(schedule)
    const result = promoteAdminReviewedDraft({
      draft: draftFor(schedule, decisions),
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
    })

    expect(result.promoted).toBe(false)
    expect(result.hardRuleViolations).toContain('TEACHER_SLOT_CONFLICT:teacher-brunovocal')
  })

  it('permite al mismo docente en franjas contiguas no solapadas', () => {
    const schedule = [
      mesa({ id: 'mesa-1' }),
      mesa({
        id: 'mesa-2',
        start: '20:00',
        end: '22:00',
        titularId: 'teacher-diegotitular',
        vocales: [
          { docenteId: 'teacher-brunovocal', docente: 'Bruno Vocal' },
          { docenteId: 'teacher-elenavocal', docente: 'Elena Vocal' },
        ],
      }),
    ]
    const decisions = decisionsForSchedule(schedule)
    const result = promoteAdminReviewedDraft({
      draft: draftFor(schedule, decisions),
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
    })

    expect(result.promoted).toBe(true)
    expect(result.hardRuleViolations).not.toContain('TEACHER_SLOT_CONFLICT:teacher-brunovocal')
  })

  it('bloquea exceso de mitad mas uno y no descuenta titulares', () => {
    const schedule = ['2026-07-13', '2026-07-20', '2026-07-27'].map((date, index) => mesa({
      id: `mesa-${index + 1}`,
      date,
    }))
    const decisions = decisionsForSchedule(schedule)
    const result = promoteAdminReviewedDraft({
      draft: draftFor(schedule, decisions),
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context({ brunoHours: 2 }),
    })

    expect(result.promoted).toBe(false)
    expect(result.hardRuleViolations).toContain('TEACHER_AFFECTATION_LIMIT_EXCEEDED:teacher-brunovocal')
    expect(result.diagnostics.ledger.find((entry) => entry.docenteId === 'teacher-anatitular')).toMatchObject({
      afectacionesUsadas: 0,
    })
  })

  it('bloquea si una decision aplicada ya no existe o dejo de estar seleccionada', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const stale = decisions.map((decision, index) => (
      index === 0 ? { ...decision, decision: 'REMOVED' } : decision
    ))
    const result = promoteAdminReviewedDraft({
      draft: draftFor(schedule, decisions),
      adminReviewDecisions: stale.slice(0, 1),
      teacherExamSourceContext: context(),
    })

    expect(result.promoted).toBe(false)
    expect(result.hardRuleViolations).toEqual(expect.arrayContaining([
      `APPLIED_DECISION_NO_LONGER_VALID:${decisions[0].decisionId}`,
      `SOURCE_DECISION_NOT_FOUND:${decisions[1].decisionId}`,
    ]))
  })

  it('bloquea un borrador alterado de forma inconsistente', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const alteredDraft = draftFor(schedule, decisions, {
      diagnostics: { totalSchedule: 99 },
    })
    const result = promoteAdminReviewedDraft({
      draft: alteredDraft,
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
    })

    expect(result.promoted).toBe(false)
    expect(result.hardRuleViolations).toContain('DRAFT_DIAGNOSTIC_MISMATCH:totalSchedule')
  })

  it('bloquea si el sello no puede generarse', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const cyclicDraft = draftFor(schedule, decisions)
    cyclicDraft.diagnostics.cyclic = cyclicDraft
    const result = promoteAdminReviewedDraft({
      draft: cyclicDraft,
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
    })

    expect(result.promoted).toBe(false)
    expect(result.hardRuleViolations).toEqual(['INTEGRITY_HASH_GENERATION_FAILED'])
  })

  it('crea eventos inmutables con revision y referencia a la promocion anterior', () => {
    const schedule = [mesa()]
    const decisions = decisionsForSchedule(schedule)
    const original = draftFor(schedule, decisions)
    const first = promoteAdminReviewedDraft({
      draft: original,
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
      options: { now: () => '2026-07-10T12:00:00.000Z' },
    }).promotionRecord
    const second = promoteAdminReviewedDraft({
      draft: original,
      adminReviewDecisions: decisions,
      teacherExamSourceContext: context(),
      options: {
        now: () => '2026-07-10T13:00:00.000Z',
        existingPromotions: [first],
      },
    }).promotionRecord

    expect(first).toMatchObject({
      promotionId: 'admin-review-promotion-draft-valid-1-r1',
      revisionNumber: 1,
      previousPromotionId: null,
    })
    expect(second).toMatchObject({
      promotionId: 'admin-review-promotion-draft-valid-1-r2',
      revisionNumber: 2,
      previousPromotionId: first.promotionId,
    })
    expect(upsertAdminReviewedPromotion(upsertAdminReviewedPromotion([], first), second)).toEqual([first, second])
  })

  it('append inmutable no reemplaza un evento si se repite promotionId', () => {
    const first = { promotionId: 'promotion-1', promotedAt: 'a' }
    const second = { promotionId: 'promotion-1', promotedAt: 'b' }

    expect(upsertAdminReviewedPromotion([first], second)).toEqual([first])
  })
})
