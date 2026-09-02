import { describe, expect, it } from 'vitest'
import {
  CALENDAR_EXPANSION_SCENARIOS,
  simulateCalendarExpansion,
} from './simulateCalendarExpansion.js'

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
    diasAsistencia: ['lunes', 'martes'],
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

function buildInput(overrides = {}) {
  return {
    docentes: [
      docente('titular-1', { nombreMateria: 'Materia A' }),
      docente('titular-2', { nombreMateria: 'Materia B' }),
      docente('vocal-1'),
      docente('vocal-2'),
    ],
    materias: [
      materia('A', 'titular-1'),
      materia('B', 'titular-2'),
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
    ...overrides,
  }
}

function scenario(result, name) {
  return result.scenarios.find((entry) => entry.scenario === name)
}

describe('simulateCalendarExpansion', () => {
  it('agrega 1 fecha simulada sin mutar calendario base', () => {
    const input = buildInput()
    const originalCalendar = structuredClone(baseCalendar)
    const result = simulateCalendarExpansion({
      snapshot: {},
      baseCalendar,
      options: { input },
    })
    const addOne = scenario(result, CALENDAR_EXPANSION_SCENARIOS.ADD_1_DATE)

    expect(addOne.simulatedDates).toHaveLength(1)
    expect(addOne.simulatedDates[0]).toEqual(expect.objectContaining({
      id: 'SIM_EXTRA_DATE_1',
      isSimulated: true,
    }))
    expect(baseCalendar).toEqual(originalCalendar)
  })

  it('agrega 2 fechas simuladas', () => {
    const result = simulateCalendarExpansion({
      snapshot: {},
      baseCalendar,
      options: { input: buildInput() },
    })

    expect(scenario(result, CALENDAR_EXPANSION_SCENARIOS.ADD_2_DATES).simulatedDates).toHaveLength(2)
  })

  it('agrega 3 fechas simuladas y las marca como simuladas', () => {
    const result = simulateCalendarExpansion({
      snapshot: {},
      baseCalendar,
      options: { input: buildInput() },
    })
    const addThree = scenario(result, CALENDAR_EXPANSION_SCENARIOS.ADD_3_DATES)

    expect(addThree.simulatedDates).toHaveLength(3)
    expect(addThree.simulatedDates.every((slot) => slot.isSimulated === true)).toBe(true)
    expect(addThree.result.simulatedDateIds).toEqual([
      'SIM_EXTRA_DATE_1',
      'SIM_EXTRA_DATE_2',
      'SIM_EXTRA_DATE_3',
    ])
  })

  it('no modifica inputs', () => {
    const input = buildInput()
    const originalInput = structuredClone(input)

    simulateCalendarExpansion({
      snapshot: {},
      baseCalendar,
      options: { input },
    })

    expect(input).toEqual(originalInput)
  })

  it('respeta asistencia por dia al usar fecha simulada', () => {
    const result = simulateCalendarExpansion({
      snapshot: {},
      baseCalendar,
      options: {
        input: buildInput({
          docentes: [
            docente('titular-1', { diasAsistencia: ['martes'] }),
            docente('vocal-1', { diasAsistencia: ['martes'] }),
            docente('vocal-2', { diasAsistencia: ['martes'] }),
          ],
          materias: [
            materia('A', 'titular-1'),
          ],
        }),
      },
    })
    const addOne = scenario(result, CALENDAR_EXPANSION_SCENARIOS.ADD_1_DATE)

    expect(addOne.plan.plannedMesas[0]?.fecha).toBe(addOne.simulatedDates[0].fecha)
    expect(addOne.simulatedDates[0].day).toBe('martes')
  })

  it('respeta cupo por horas catedra y no permite superposicion', () => {
    const result = simulateCalendarExpansion({
      snapshot: {},
      baseCalendar,
      options: {
        input: buildInput({
          docentes: [
            docente('titular-1'),
            docente('titular-2'),
            docente('titular-3'),
            docente('vocal-limitado', { horasCatedra: 2 }),
          ],
          materias: [
            materia('A', 'titular-1'),
            materia('B', 'titular-2'),
            materia('C', 'titular-3'),
          ],
        }),
      },
    })
    const addThree = scenario(result, CALENDAR_EXPANSION_SCENARIOS.ADD_3_DATES)

    expect(addThree.result.docentesExcedidos).toBe(0)
    expect(addThree.result.integrity.superpositionsInPlan).toBe(0)
    expect(addThree.result.integrity.titularAsVocal).toBe(0)
    expect(addThree.result.integrity.duplicateVocales).toBe(0)
  })

  it('no expone nombres completos en warnings/errors', () => {
    const result = simulateCalendarExpansion({
      snapshot: {},
      baseCalendar,
      options: { input: buildInput() },
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
      summary: result.summary,
      scenarioResults: result.scenarioResults,
    })

    expect(serialized).not.toContain('Nombre Personal')
    expect(result.privacy.noFullTeacherNames).toBe(true)
  })
})
