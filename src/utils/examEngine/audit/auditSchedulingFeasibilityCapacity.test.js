import { describe, expect, it } from 'vitest'
import {
  SCHEDULING_FEASIBILITY_CLASSIFICATIONS,
  auditSchedulingFeasibilityCapacity,
} from './auditSchedulingFeasibilityCapacity.js'

const baseCalendar = [
  {
    fecha: '2026-07-27',
    diaSemana: 'LUNES',
    llamado: 'PRIMER_LLAMADO',
    turno: 'NOCHE',
    disponible: true,
  },
]

function teacher(id, overrides = {}) {
  return {
    id,
    nombre: `Nombre Personal ${id}`,
    activo: true,
    carrera: 'Carrera A',
    nombreMateria: 'Materia Afin',
    diasAsistencia: ['lunes'],
    turnosDisponibles: ['NOCHE'],
    horasCatedra: 6,
    halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
    ...overrides,
  }
}

function mesa(id, overrides = {}) {
  return {
    id,
    materiaId: `MAT-${id}`,
    materia: 'Materia A',
    carreraId: 'CAR-A',
    carrera: 'Carrera A',
    anio: 1,
    llamado: 'PRIMER_LLAMADO',
    fecha: '',
    fechaIso: '',
    turno: 'NOCHE',
    titularId: 'titular-1',
    vocal1Id: null,
    vocal2Id: null,
    warnings: [],
    errors: [],
    metadata: {},
    ...overrides,
  }
}

function runAudit({ teachers, calendar = baseCalendar, plannedMesas = [], unassignedMesas = [], participaciones = [] }) {
  return auditSchedulingFeasibilityCapacity({
    snapshot: {},
    options: {
      input: {
        docentes: teachers,
        fechasDisponibles: calendar,
      },
      plan: {
        plannedMesas,
        unassignedMesas,
        participaciones,
      },
    },
  })
}

function onlyClassification(result) {
  return result.examFeasibilityCases[0]?.classification
}

describe('auditSchedulingFeasibilityCapacity', () => {
  it('clasifica FEASIBLE_FULL', () => {
    const result = runAudit({
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
        teacher('vocal-2'),
      ],
      unassignedMesas: [mesa('full')],
    })

    expect(onlyClassification(result)).toBe(SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_FULL)
    expect(result.summary.fullFeasible).toBe(1)
  })

  it('clasifica FEASIBLE_MINIMUM_REVIEW', () => {
    const result = runAudit({
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
      ],
      unassignedMesas: [mesa('minimum')],
    })

    expect(onlyClassification(result)).toBe(SCHEDULING_FEASIBILITY_CLASSIFICATIONS.FEASIBLE_MINIMUM_REVIEW)
    expect(result.summary.minimumReviewFeasible).toBe(1)
  })

  it('clasifica TITLE_ONLY_REVIEW cuando hay titular pero el vocal no tiene cupo', () => {
    const result = runAudit({
      teachers: [
        teacher('titular-1'),
        teacher('vocal-limitado', { horasCatedra: 0 }),
      ],
      unassignedMesas: [mesa('title-only')],
    })

    expect(onlyClassification(result)).toBe(SCHEDULING_FEASIBILITY_CLASSIFICATIONS.TITLE_ONLY_REVIEW)
  })

  it('clasifica NO_TITLE_DATE', () => {
    const result = runAudit({
      teachers: [
        teacher('titular-1', { diasAsistencia: ['martes'] }),
        teacher('vocal-1'),
        teacher('vocal-2'),
      ],
      unassignedMesas: [mesa('no-title-date')],
    })

    expect(onlyClassification(result)).toBe(SCHEDULING_FEASIBILITY_CLASSIFICATIONS.NO_TITLE_DATE)
  })

  it('clasifica NO_VOCAL_POOL', () => {
    const result = runAudit({
      teachers: [
        teacher('titular-1'),
      ],
      unassignedMesas: [mesa('no-vocal-pool')],
    })

    expect(onlyClassification(result)).toBe(SCHEDULING_FEASIBILITY_CLASSIFICATIONS.NO_VOCAL_POOL)
  })

  it('clasifica CALENDAR_TOO_RESTRICTIVE', () => {
    const result = runAudit({
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1', { diasAsistencia: ['martes'] }),
      ],
      unassignedMesas: [mesa('calendar')],
    })

    expect(onlyClassification(result)).toBe(SCHEDULING_FEASIBILITY_CLASSIFICATIONS.CALENDAR_TOO_RESTRICTIVE)
  })

  it('clasifica BLOCKED_BY_SUPERPOSITION', () => {
    const busy = mesa('busy', {
      fecha: '2026-07-27',
      fechaIso: '2026-07-27',
      titularId: 'otro-titular',
      vocal1Id: 'vocal-1',
      vocal2Id: null,
    })
    const target = mesa('blocked')
    const result = runAudit({
      teachers: [
        teacher('titular-1'),
        teacher('otro-titular'),
        teacher('vocal-1'),
      ],
      plannedMesas: [busy],
      unassignedMesas: [target],
      participaciones: [
        { docenteId: 'vocal-1', mesaId: 'busy', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      ],
    })

    const targetCase = result.examFeasibilityCases.find((item) => item.mesaId === 'blocked')
    expect(targetCase.classification).toBe(SCHEDULING_FEASIBILITY_CLASSIFICATIONS.BLOCKED_BY_SUPERPOSITION)
  })

  it('calcula capacidad por fecha', () => {
    const result = runAudit({
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
        teacher('vocal-2'),
      ],
      unassignedMesas: [mesa('capacity')],
    })

    expect(result.dateCapacity[0]).toEqual(expect.objectContaining({
      fecha: '2026-07-27',
      mesasCandidatas: 1,
      docentesUnicosDisponibles: 3,
    }))
  })

  it('identifica docente cuello de botella', () => {
    const result = runAudit({
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
      ],
      unassignedMesas: [
        mesa('a'),
        mesa('b'),
        mesa('c'),
        mesa('d'),
      ],
    })

    expect(result.teacherBottlenecks[0]).toEqual(expect.objectContaining({
      cuelloDeBotella: true,
    }))
  })

  it('compara escenarios sin modificar inputs', () => {
    const input = {
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
      ],
      unassignedMesas: [mesa('scenario')],
    }
    const original = structuredClone(input)
    const result = runAudit(input)

    expect(input).toEqual(original)
    expect(result.scenarioComparisons.map((scenario) => scenario.scenario)).toEqual(expect.arrayContaining([
      'STRICT_CURRENT',
      'IGNORE_GLOBAL_SUPERPOSITION',
      'IGNORE_IDONEITY_SOFT',
      'ADD_ONE_EXTRA_DATE',
      'MINIMUM_ONE_VOCAL_REVIEW',
    ]))
  })

  it('no muta inputs ni expone nombres completos en warnings/errors', () => {
    const input = {
      teachers: [
        teacher('titular-1', { nombre: 'Nombre Personal Titular' }),
        teacher('vocal-1', { nombre: 'Nombre Personal Vocal' }),
      ],
      unassignedMesas: [mesa('privacy')],
    }
    const original = structuredClone(input)
    const result = runAudit(input)
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
      summary: result.summary,
      scenarioComparisons: result.scenarioComparisons,
    })

    expect(input).toEqual(original)
    expect(serialized).not.toContain('Nombre Personal Titular')
    expect(serialized).not.toContain('Nombre Personal Vocal')
    expect(result.privacy.noFullTeacherNames).toBe(true)
  })
})
