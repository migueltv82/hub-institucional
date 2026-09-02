import { describe, expect, it } from 'vitest'
import { buildTeacherExamSourceContext } from './teacherExamSourceContext.js'
import {
  ADMIN_REVIEW_DECISION_TYPES,
  trySelectTribunalTeacherDecision,
} from './adminReviewDecisions.js'
import {
  buildTitularOnlyPreSchedule,
  recommendTribunalTeachers,
  suggestExamTableGroupings,
} from './adminReviewWorkflow.js'
import {
  EXPERIMENTAL_REVIEW_STATUS,
  buildExperimentalReviewedSchedule,
  buildExperimentalReviewedScheduleDraft,
  upsertExperimentalReviewedScheduleDraft,
} from './adminReviewApplyWorkflow.js'

function teacherContext(overrides = {}) {
  return buildTeacherExamSourceContext({
    disponibilidadDocente: [
      { docente: 'Ana Titular', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      { docente: 'Bruno Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      { docente: 'Carla Vocal', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      { docente: 'Diego Ocupado', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      ...(overrides.disponibilidadDocente ?? []),
    ],
    cargaHorariaDocente: [
      { docente: 'Ana Titular', carrera: 'Profesorado Ingles', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 8, rol_en_materia: 'TITULAR' },
      { docente: 'Ana Titular', carrera: 'Traductorado Ingles', materia_codigo: 'TRA1', materia_nombre: 'Ingles I', horasCatedra: 2, rol_en_materia: 'TITULAR' },
      { docente: 'Bruno Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING2', materia_nombre: 'Ingles II', horasCatedra: 4, rol_en_materia: 'TITULAR' },
      { docente: 'Carla Vocal', carrera: 'Profesorado Ingles', materia_codigo: 'ING3', materia_nombre: 'Ingles III', horasCatedra: 4, rol_en_materia: 'TITULAR' },
      { docente: 'Diego Ocupado', carrera: 'Profesorado Ingles', materia_codigo: 'ING4', materia_nombre: 'Ingles IV', horasCatedra: 2, rol_en_materia: 'TITULAR' },
      ...(overrides.cargaHorariaDocente ?? []),
    ],
    fechasBloqueadasDocente: overrides.fechasBloqueadasDocente ?? [],
  })
}

const planesEstudio = [
  { carrera: 'Profesorado Ingles', materia: 'ING1', nombreMateria: 'Ingles I', anio: 1 },
  { carrera: 'Traductorado Ingles', materia: 'TRA1', nombreMateria: 'Ingles I', anio: 1 },
  { carrera: 'Profesorado Ingles', materia: 'ING2', nombreMateria: 'Ingles II', anio: 2 },
]

function preSchedule(context = teacherContext()) {
  return buildTitularOnlyPreSchedule({
    teacherExamSourceContext: context,
    planesEstudio,
    fechasDisponibles: ['2026-07-13'],
    turno: 'NOCHE',
  }).mesas
}

function decisionFor({ context, mesa, docenteId, role = 'VOCAL', decisions = [], decisionOverride = null }) {
  const recommendations = recommendTribunalTeachers({
    teacherExamSourceContext: context,
    mesa,
    selections: [],
  })
  const recommendation = recommendations.find((item) => item.docente.id === docenteId)
  const result = trySelectTribunalTeacherDecision({
    decisions,
    mesa,
    recommendation,
    role,
    affectationBefore: {
      used: recommendation?.afectacionesUsadas ?? 0,
      remaining: recommendation?.afectacionesRestantes ?? 0,
      limit: recommendation?.limiteAfectacion ?? 0,
    },
    affectationAfter: {
      used: Number(recommendation?.afectacionesUsadas ?? 0) + (role === 'TITULAR' ? 0 : 1),
      remaining: Math.max(0, Number(recommendation?.afectacionesRestantes ?? 0) - (role === 'TITULAR' ? 0 : 1)),
      limit: recommendation?.limiteAfectacion ?? 0,
    },
  })

  if (!decisionOverride) return result.decisions.at(-1)
  return {
    ...result.decisions.at(-1),
    decision: decisionOverride,
  }
}

describe('buildExperimentalReviewedSchedule', () => {
  it('aplica selecciones validas de vocal y deja trazabilidad', () => {
    const context = teacherContext()
    const [mesa] = preSchedule(context).filter((item) => item.materia === 'ING1')
    const bruno = decisionFor({ context, mesa, docenteId: 'teacher-brunovocal' })
    const carla = decisionFor({ context, mesa, docenteId: 'teacher-carlavocal' })

    const result = buildExperimentalReviewedSchedule({
      preSchedule: [mesa],
      adminReviewDecisions: [bruno, carla],
      teacherExamSourceContext: context,
    })

    expect(result.status).toBe(EXPERIMENTAL_REVIEW_STATUS.REVIEW_READY)
    expect(result.schedule[0]).toMatchObject({
      experimental: true,
      isOfficial: false,
      confirmada: false,
      valid: false,
      tribunalStatus: 'PENDIENTE_REVISION_ADMIN',
      vocales: [
        expect.objectContaining({ docenteId: 'teacher-brunovocal', decisionId: bruno.decisionId }),
        expect.objectContaining({ docenteId: 'teacher-carlavocal', decisionId: carla.decisionId }),
      ],
    })
    expect(result.appliedDecisions).toHaveLength(2)
    expect(result.diagnostics).toMatchObject({
      appliedTribunalTeachers: 2,
      completeTribunals: 1,
      incompleteTribunals: 0,
    })
  })

  it('ignora selecciones BLOCKED_HARD_RULES y decisiones PENDING', () => {
    const context = teacherContext()
    const [mesa] = preSchedule(context).filter((item) => item.materia === 'ING1')
    const blocked = {
      decisionId: 'TRIBUNAL_SELECTION:blocked',
      type: ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION,
      targetId: 'blocked',
      decision: 'BLOCKED_HARD_RULES',
      hardRuleViolations: ['TEACHER_NOT_AVAILABLE_ON_SHIFT'],
      metadata: { tableId: mesa.id, teacherId: 'teacher-brunovocal', role: 'VOCAL' },
    }
    const pending = {
      decisionId: 'TRIBUNAL_SELECTION:pending',
      type: ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION,
      targetId: 'pending',
      decision: 'PENDING',
      metadata: { tableId: mesa.id, teacherId: 'teacher-carlavocal', role: 'VOCAL' },
    }

    const result = buildExperimentalReviewedSchedule({
      preSchedule: [mesa],
      adminReviewDecisions: [blocked, pending],
      teacherExamSourceContext: context,
    })

    expect(result.schedule[0].vocales).toEqual([])
    expect(result.skippedDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ decisionId: 'TRIBUNAL_SELECTION:blocked', reasonSkipped: 'SELECTION_NOT_SELECTED' }),
      expect.objectContaining({ decisionId: 'TRIBUNAL_SELECTION:pending', reasonSkipped: 'SELECTION_NOT_SELECTED' }),
    ]))
    expect(result.status).toBe(EXPERIMENTAL_REVIEW_STATUS.REVIEW_INCOMPLETE)
  })

  it('revalida fechas bloqueadas al construir el cronograma revisado', () => {
    const context = teacherContext({
      fechasBloqueadasDocente: [{
        docenteNombre: 'Ana Titular',
        date: '2026-07-13',
        scope: 'FULL_DAY',
        status: 'ACTIVE',
      }],
    })
    const [mesa] = preSchedule(context).filter((item) => item.materia === 'ING1')
    const result = buildExperimentalReviewedSchedule({
      preSchedule: [mesa],
      adminReviewDecisions: [],
      teacherExamSourceContext: context,
    })

    expect(result.hardRuleViolations).toEqual(expect.arrayContaining([
      `TITULAR_BLOCKED_DATE:${mesa.id}:teacher-anatitular`,
      `BLOCKED_DATE_CONFLICT:${mesa.id}:teacher-anatitular`,
    ]))
  })

  it('aplica remociones REMOVED como auditoria sin vocal aplicado', () => {
    const context = teacherContext()
    const [mesa] = preSchedule(context).filter((item) => item.materia === 'ING1')
    const removed = {
      decisionId: 'TRIBUNAL_SELECTION:removed',
      type: ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION,
      targetId: `${mesa.id}::teacher-brunovocal::VOCAL`,
      decision: 'REMOVED',
      metadata: { tableId: mesa.id, teacherId: 'teacher-brunovocal', role: 'VOCAL' },
    }

    const result = buildExperimentalReviewedSchedule({
      preSchedule: [mesa],
      adminReviewDecisions: [removed],
      teacherExamSourceContext: context,
    })

    expect(result.schedule[0].vocales).toEqual([])
    expect(result.skippedDecisions).toEqual([
      expect.objectContaining({ decisionId: 'TRIBUNAL_SELECTION:removed', reasonSkipped: 'SELECTION_REMOVED' }),
    ])
  })

  it('aplica agrupamiento ACCEPTED valido y bloquea agrupamiento con violaciones duras', () => {
    const context = teacherContext()
    const pre = preSchedule(context)
    const [suggestion] = suggestExamTableGroupings({ preSchedule: pre })
    const accepted = {
      decisionId: `GROUPING:${suggestion.groupId}`,
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: suggestion.groupId,
      decision: 'ACCEPTED',
      hardRuleViolations: [],
    }
    const invalid = {
      decisionId: 'GROUPING:invalid',
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: 'missing-group',
      decision: 'ACCEPTED',
      hardRuleViolations: ['GROUPING_REQUIRES_SAME_DATE_SLOT'],
    }

    const result = buildExperimentalReviewedSchedule({
      preSchedule: pre,
      adminReviewDecisions: [accepted, invalid],
      teacherExamSourceContext: context,
    })

    expect(result.appliedDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ decisionId: accepted.decisionId, appliedAs: 'GROUPING' }),
    ]))
    expect(result.skippedDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ decisionId: 'GROUPING:invalid', reasonSkipped: 'GROUPING_HAS_HARD_RULE_VIOLATIONS' }),
    ]))
    expect(result.schedule.some((mesa) => mesa.adminReview.appliedGroupingIds.includes(suggestion.groupId))).toBe(true)
  })

  it('no confirma tribunal incompleto', () => {
    const context = teacherContext()
    const [mesa] = preSchedule(context)
    const result = buildExperimentalReviewedSchedule({
      preSchedule: [mesa],
      adminReviewDecisions: [],
      teacherExamSourceContext: context,
    })

    expect(result.status).toBe(EXPERIMENTAL_REVIEW_STATUS.REVIEW_INCOMPLETE)
    expect(result.schedule[0]).toMatchObject({
      valid: false,
      confirmada: false,
      tribunalStatus: 'PENDIENTE_VOCALES',
    })
    expect(result.hardRuleViolations).toEqual(expect.arrayContaining([
      `TRIBUNAL_INCOMPLETE:${mesa.id}`,
    ]))
  })

  it('detecta docente duplicado en tribunal', () => {
    const context = teacherContext()
    const [mesa] = preSchedule(context).filter((item) => item.materia === 'ING1')
    const duplicated = {
      decisionId: 'TRIBUNAL_SELECTION:duplicated',
      type: ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION,
      targetId: `${mesa.id}::${mesa.titularId}::VOCAL`,
      decision: 'SELECTED',
      metadata: {
        tableId: mesa.id,
        teacherId: mesa.titularId,
        teacherName: mesa.titular,
        role: 'VOCAL',
      },
      hardRuleViolations: [],
    }

    const result = buildExperimentalReviewedSchedule({
      preSchedule: [mesa],
      adminReviewDecisions: [duplicated],
      teacherExamSourceContext: context,
    })

    expect(result.skippedDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decisionId: 'TRIBUNAL_SELECTION:duplicated',
        reasonSkipped: 'DUPLICATED_TEACHER_IN_TRIBUNAL',
      }),
    ]))
  })

  it('detecta conflicto de docente por fecha y franja', () => {
    const context = teacherContext()
    const mesas = preSchedule(context)
    const mesaIng1 = mesas.find((mesa) => mesa.materia === 'ING1')
    const mesaTra1 = mesas.find((mesa) => mesa.materia === 'TRA1')
    const first = decisionFor({ context, mesa: mesaIng1, docenteId: 'teacher-brunovocal' })
    const second = {
      ...decisionFor({ context, mesa: mesaTra1, docenteId: 'teacher-brunovocal' }),
      decisionId: 'TRIBUNAL_SELECTION:slot-conflict',
    }

    const result = buildExperimentalReviewedSchedule({
      preSchedule: [mesaIng1, mesaTra1],
      adminReviewDecisions: [first, second],
      teacherExamSourceContext: context,
    })

    expect(result.appliedDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ decisionId: first.decisionId }),
    ]))
    expect(result.skippedDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decisionId: 'TRIBUNAL_SELECTION:slot-conflict',
        reasonSkipped: 'SELECTION_VALIDATION_FAILED',
        hardRuleViolations: expect.arrayContaining(['TEACHER_SLOT_CONFLICT']),
      }),
    ]))
  })

  it('respeta mitad mas uno y no descuenta titular obligatorio', () => {
    const context = teacherContext({
      disponibilidadDocente: [
        { docente: 'Diego Ocupado', dia: 'Martes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
        { docente: 'Diego Ocupado', dia: 'Miercoles', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      ],
    })
    const mesas = preSchedule(context).map((mesa, index) => ({
      ...mesa,
      fechaIso: ['2026-07-13', '2026-07-14', '2026-07-15'][index] ?? mesa.fechaIso,
    }))
    const selected = mesas.slice(0, 3).map((mesa, index) => ({
      decisionId: `TRIBUNAL_SELECTION:diego-${index}`,
      type: ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION,
      targetId: `${mesa.id}::teacher-diegoocupado::VOCAL`,
      decision: 'SELECTED',
      metadata: {
        tableId: mesa.id,
        teacherId: 'teacher-diegoocupado',
        teacherName: 'Diego Ocupado',
        role: 'VOCAL',
        date: mesa.fechaIso,
        shift: mesa.turno,
        startTime: mesa.inicio,
        endTime: mesa.fin,
      },
      hardRuleViolations: [],
    }))
    const titularSelection = {
      decisionId: 'TRIBUNAL_SELECTION:titular',
      type: ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION,
      targetId: `${mesas[0].id}::teacher-anatitular::TITULAR`,
      decision: 'SELECTED',
      metadata: {
        tableId: mesas[0].id,
        teacherId: 'teacher-anatitular',
        teacherName: 'Ana Titular',
        role: 'TITULAR',
      },
      hardRuleViolations: [],
    }

    const result = buildExperimentalReviewedSchedule({
      preSchedule: mesas,
      adminReviewDecisions: [titularSelection, ...selected],
      teacherExamSourceContext: context,
    })

    expect(result.warnings).toEqual(expect.arrayContaining([
      `TITULAR_SELECTION_DOES_NOT_CONSUME_AFFECTATION:${mesas[0].id}:teacher-anatitular`,
    ]))
    expect(result.skippedDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonSkipped: 'SELECTION_VALIDATION_FAILED',
        hardRuleViolations: expect.arrayContaining(['TEACHER_AFFECTATION_LIMIT_EXCEEDED']),
      }),
    ]))
    const anaLedger = result.diagnostics.ledger.find((entry) => entry.docenteId === 'teacher-anatitular')
    expect(anaLedger.afectacionesUsadas).toBe(0)
  })

  it('mantiene cronograma oficial intacto y diagnostics sin payload sensible', () => {
    const context = teacherContext()
    const official = [{ id: 'official-1', vocales: [] }]
    const [mesa] = preSchedule(context)

    const result = buildExperimentalReviewedSchedule({
      preSchedule: [mesa],
      adminReviewDecisions: [],
      teacherExamSourceContext: context,
      options: { officialSchedule: official },
    })

    expect(official).toEqual([{ id: 'official-1', vocales: [] }])
    expect(JSON.stringify(result.diagnostics)).not.toContain('disponibilidadPorDocente')
    expect(JSON.stringify(result.diagnostics)).not.toContain('materiasPorDocente')
  })

  it('prepara borrador revisado experimental solo si el review esta listo', () => {
    const context = teacherContext()
    const [mesa] = preSchedule(context).filter((item) => item.materia === 'ING1')
    const bruno = decisionFor({ context, mesa, docenteId: 'teacher-brunovocal' })
    const carla = decisionFor({ context, mesa, docenteId: 'teacher-carlavocal' })
    const review = buildExperimentalReviewedSchedule({
      preSchedule: [mesa],
      adminReviewDecisions: [bruno, carla],
      teacherExamSourceContext: context,
    })

    const result = buildExperimentalReviewedScheduleDraft({
      review,
      preSchedule: [mesa],
      adminReviewDecisions: [bruno, carla],
      teacherExamSourceContext: context,
      workspaceKey: 'main',
      now: () => '2026-07-09T12:00:00.000Z',
    })

    expect(result.ok).toBe(true)
    expect(result.draft).toMatchObject({
      type: 'ADMIN_REVIEWED_SCHEDULE_DRAFT',
      status: 'REVIEW_READY',
      source: 'admin_review_workflow',
      createdAt: '2026-07-09T12:00:00.000Z',
      updatedAt: '2026-07-09T12:00:00.000Z',
      basedOn: {
        decisionIds: [bruno.decisionId, carla.decisionId],
        teacherSource: 'structured',
        workspaceKey: 'main',
      },
      isOfficial: false,
      appliedDecisions: expect.any(Array),
      skippedDecisions: [],
      hardRuleViolations: [],
      diagnostics: expect.objectContaining({
        totalSchedule: 1,
      }),
    })
    expect(result.draft.schedule[0]).toMatchObject({
      isOfficial: false,
      confirmada: false,
      valid: false,
    })
    expect(JSON.stringify(result.draft.diagnostics)).not.toContain('disponibilidadPorDocente')
  })

  it('bloquea borrador si el review tiene reglas duras o esta incompleto', () => {
    const context = teacherContext()
    const [mesa] = preSchedule(context)
    const review = buildExperimentalReviewedSchedule({
      preSchedule: [mesa],
      adminReviewDecisions: [],
      teacherExamSourceContext: context,
    })

    const result = buildExperimentalReviewedScheduleDraft({
      review,
      preSchedule: [mesa],
      adminReviewDecisions: [],
      teacherExamSourceContext: context,
    })

    expect(result).toMatchObject({
      ok: false,
      draft: null,
      error: 'REVIEW_NOT_PREPARABLE',
      status: 'REVIEW_INCOMPLETE',
      hardRuleViolations: expect.arrayContaining([`TRIBUNAL_INCOMPLETE:${mesa.id}`]),
    })
  })

  it('upsert de borrador no duplica draftId', () => {
    const first = { draftId: 'draft-1', updatedAt: 'a' }
    const second = { draftId: 'draft-1', updatedAt: 'b' }

    expect(upsertExperimentalReviewedScheduleDraft([first], second)).toEqual([second])
  })
})
