import { describe, expect, it } from 'vitest'
import {
  ADMIN_REVIEW_DECISION_TYPES,
  getSelectedTribunalSelections,
  removeTribunalTeacherDecision,
  trySelectTribunalTeacherDecision,
  tryAcceptAdminReviewDecision,
  upsertAdminReviewDecision,
} from './adminReviewDecisions.js'

const now = () => '2026-07-09T12:00:00.000Z'

describe('adminReviewDecisions', () => {
  it('crea y actualiza decisiones sin duplicar target', () => {
    const created = upsertAdminReviewDecision([], {
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: 'group-1',
      decision: 'REJECTED',
      reason: 'No conviene institucionalmente.',
      now,
    })
    const updated = upsertAdminReviewDecision(created, {
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: 'group-1',
      decision: 'EDITED',
      reason: 'Editado por bedelia.',
      metadata: { note: 'mismo dia, otra franja' },
      now,
    })

    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({
      decisionId: 'GROUPING:group-1',
      type: 'GROUPING',
      targetId: 'group-1',
      decision: 'EDITED',
      reason: 'Editado por bedelia.',
      metadata: { note: 'mismo dia, otra franja' },
      source: 'exam_admin_review_workflow',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
    })
  })

  it('acepta solo targets sin violaciones duras', () => {
    const result = tryAcceptAdminReviewDecision({
      target: { canAccept: true, hardRuleViolations: [] },
      decisions: [],
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: 'group-ok',
      reason: 'Mismo titular.',
    })

    expect(result.ok).toBe(true)
    expect(result.decisions[0]).toMatchObject({
      decision: 'ACCEPTED',
      reason: 'Mismo titular.',
    })
  })

  it('bloquea aceptacion si el target viola reglas duras', () => {
    const result = tryAcceptAdminReviewDecision({
      target: {
        canAccept: false,
        hardRuleViolations: ['GROUPING_REQUIRES_SAME_DATE_SLOT'],
      },
      decisions: [],
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: 'group-invalid',
    })

    expect(result.ok).toBe(false)
    expect(result.decisions[0]).toMatchObject({
      decision: 'PENDING',
      reason: 'ACCEPT_BLOCKED_HARD_RULES',
      hardRuleViolations: ['GROUPING_REQUIRES_SAME_DATE_SLOT'],
      metadata: {
        requestedDecision: 'ACCEPTED',
        blocked: true,
      },
    })
  })

  it('persiste seleccion valida de vocal con metadata de tribunal', () => {
    const result = trySelectTribunalTeacherDecision({
      decisions: [],
      mesa: {
        id: 'mesa-1',
        fechaIso: '2026-07-13',
        turno: 'NOCHE',
        inicio: '18:00',
        fin: '20:00',
      },
      recommendation: {
        docente: { id: 'teacher-bruno', nombre: 'Bruno Vocal' },
        eligible: true,
        hardRuleViolations: [],
        score: 93,
        reasons: ['Disponible en la fecha.'],
        warnings: [],
      },
      role: 'VOCAL',
      affectationBefore: { used: 0, remaining: 3, limit: 3 },
      affectationAfter: { used: 1, remaining: 2, limit: 3 },
    })

    expect(result.ok).toBe(true)
    expect(result.decisions[0]).toMatchObject({
      type: 'TRIBUNAL_SELECTION',
      targetId: 'mesa-1::teacher-bruno::VOCAL',
      decision: 'SELECTED',
      metadata: {
        tableId: 'mesa-1',
        teacherId: 'teacher-bruno',
        teacherName: 'Bruno Vocal',
        role: 'VOCAL',
        date: '2026-07-13',
        shift: 'NOCHE',
        startTime: '18:00',
        endTime: '20:00',
        consumesAffectation: true,
        affectationBefore: { used: 0, remaining: 3, limit: 3 },
        affectationAfter: { used: 1, remaining: 2, limit: 3 },
        recommendationScore: 93,
        recommendationReasons: ['Disponible en la fecha.'],
        recommendationWarnings: [],
      },
      hardRuleViolations: [],
    })
  })

  it('bloquea seleccion de vocal con violaciones duras', () => {
    const result = trySelectTribunalTeacherDecision({
      decisions: [],
      mesa: { id: 'mesa-1' },
      recommendation: {
        docente: { id: 'teacher-carla', nombre: 'Carla' },
        eligible: false,
        hardRuleViolations: ['TEACHER_NOT_AVAILABLE_ON_SHIFT'],
        warnings: ['No confirmable mientras tenga violaciones duras.'],
      },
      role: 'VOCAL',
    })

    expect(result.ok).toBe(false)
    expect(result.decisions[0]).toMatchObject({
      decision: 'BLOCKED_HARD_RULES',
      reason: 'Seleccion bloqueada por reglas duras.',
      hardRuleViolations: ['TEACHER_NOT_AVAILABLE_ON_SHIFT'],
    })
    expect(getSelectedTribunalSelections(result.decisions)).toEqual([])
  })

  it('convierte decisiones SELECTED en selecciones de ledger y REMOVED las libera', () => {
    const selected = trySelectTribunalTeacherDecision({
      decisions: [],
      mesa: {
        id: 'mesa-1',
        fechaIso: '2026-07-13',
        inicio: '18:00',
        fin: '20:00',
      },
      recommendation: {
        docente: { id: 'teacher-bruno', nombre: 'Bruno Vocal' },
        eligible: true,
        hardRuleViolations: [],
      },
      role: 'VOCAL',
    }).decisions

    expect(getSelectedTribunalSelections(selected)).toEqual([expect.objectContaining({
      mesaId: 'mesa-1',
      docenteId: 'teacher-bruno',
      docente: 'Bruno Vocal',
      role: 'VOCAL',
    })])

    const removed = removeTribunalTeacherDecision({
      decisions: selected,
      selection: getSelectedTribunalSelections(selected)[0],
    })

    expect(removed).toHaveLength(1)
    expect(removed[0]).toMatchObject({
      type: 'TRIBUNAL_SELECTION',
      decision: 'REMOVED',
    })
    expect(getSelectedTribunalSelections(removed)).toEqual([])
  })

  it('titular obligatorio no consume afectacion en metadata', () => {
    const result = trySelectTribunalTeacherDecision({
      decisions: [],
      mesa: { id: 'mesa-1' },
      recommendation: {
        docente: { id: 'teacher-ana', nombre: 'Ana Titular' },
        eligible: true,
        hardRuleViolations: [],
      },
      role: 'TITULAR',
    })

    expect(result.decisions[0].metadata).toMatchObject({
      role: 'TITULAR',
      consumesAffectation: false,
    })
  })
})
