import { describe, expect, it } from 'vitest'
import { auditCalendarExpansionScenarios } from './auditCalendarExpansionScenarios.js'

const baseCalendar = [
  {
    fecha: '2026-07-27',
    diaSemana: 'LUNES',
    llamado: 'PRIMER_LLAMADO',
    turno: 'NOCHE',
    disponible: true,
  },
]

function docente(id, overrides = {}) {
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

function materia(id, titularId, overrides = {}) {
  return {
    id,
    codigo: id,
    materia: id,
    nombreMateria: `Materia ${id}`,
    carrera: 'Carrera A',
    carreraId: 'CAR-A',
    anio: 1,
    titularId,
    titular_id: titularId,
    requiereMesa: true,
    turno: 'NOCHE',
    ...overrides,
  }
}

function buildInput() {
  return {
    docentes: [
      docente('titular-1', { nombreMateria: 'Materia A' }),
      docente('titular-2', { nombreMateria: 'Materia B' }),
      docente('titular-3', { nombreMateria: 'Materia C' }),
      docente('vocal-1'),
      docente('vocal-2'),
    ],
    materias: [
      materia('A', 'titular-1'),
      materia('B', 'titular-2'),
      materia('C', 'titular-3'),
    ],
    correlatividades: [],
    fechasDisponibles: baseCalendar,
    config: {
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 1,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-31',
    },
    options: {
      halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
    },
  }
}

describe('auditCalendarExpansionScenarios', () => {
  it('identifica mejor escenario y calcula mejora frente a baseline', () => {
    const report = auditCalendarExpansionScenarios({
      snapshot: {},
      baseCalendar,
      options: { input: buildInput() },
    })

    expect(report.bestScenario).toEqual(expect.objectContaining({
      scenario: expect.any(String),
      improvementVsBaseline: expect.any(Object),
    }))
    expect(report.bestScenario.scenario).not.toBe('BASELINE_CURRENT')
    expect(report.summary).toEqual(expect.objectContaining({
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      readyForIdentityV2: false,
      identityV2PendingHomonymies: 34,
    }))
    expect(report.scenarioResults[0]).toHaveProperty('improvementVsBaseline')
  })

  it('expone metricas institucionales por escenario', () => {
    const report = auditCalendarExpansionScenarios({
      snapshot: {},
      baseCalendar,
      options: { input: buildInput() },
    })

    report.scenarioResults.forEach((scenario) => {
      expect(scenario).toEqual(expect.objectContaining({
        totalMesas: expect.any(Number),
        full: expect.any(Number),
        minimumReview: expect.any(Number),
        manual: expect.any(Number),
        mesasSinFecha: expect.any(Number),
        blockedBySuperposition: expect.any(Number),
        blockedByCalendar: expect.any(Number),
        blockedByIdoneity: expect.any(Number),
        docentesExcedidos: expect.any(Number),
        maxUsoCupo: expect.any(Number),
        fechasUsadas: expect.any(Number),
        fechasSimuladas: expect.any(Number),
        improvementVsBaseline: expect.any(Object),
        improvementVsAddOneExtraDate: expect.any(Object),
        recommendation: expect.any(String),
      }))
    })
  })

  it('devuelve casos, fechas y docentes cuello de botella anonimizados', () => {
    const report = auditCalendarExpansionScenarios({
      snapshot: {},
      baseCalendar,
      options: { input: buildInput() },
    })

    expect(report.cases.length).toBeGreaterThan(0)
    expect(report.byDate.length).toBeGreaterThan(0)
    expect(report.teacherBottlenecks[0]).toHaveProperty('docenteAnonId')
    expect(report.teacherBottlenecks[0]).not.toHaveProperty('docenteId')
  })

  it('no expone nombres completos en warnings/errors', () => {
    const report = auditCalendarExpansionScenarios({
      snapshot: {},
      baseCalendar,
      options: { input: buildInput() },
    })
    const serialized = JSON.stringify({
      summary: report.summary,
      recommendations: report.recommendations,
      warnings: report.warnings,
      errors: report.errors,
    })

    expect(serialized).not.toContain('Nombre Personal')
    expect(report.privacy.noFullTeacherNames).toBe(true)
  })
})
