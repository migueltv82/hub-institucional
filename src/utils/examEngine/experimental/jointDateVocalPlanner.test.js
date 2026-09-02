import { describe, expect, it } from 'vitest'
import { planWithJointDateVocalPlanner } from './jointDateVocalPlanner.js'

function docente(id, overrides = {}) {
  return {
    id,
    nombre: `Docente ${id}`,
    activo: true,
    carrera: 'Profesorado de Prueba',
    nombreMateria: 'Materia afin',
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
    carrera: 'Profesorado de Prueba',
    carreraId: 'PROF-TEST',
    anio: 1,
    titularId,
    titular_id: titularId,
    requiereMesa: true,
    ...overrides,
  }
}

function baseInput(overrides = {}) {
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
    fechasDisponibles: [
      {
        fecha: '2026-07-27',
        diaSemana: 'LUNES',
        llamado: 'PRIMER_LLAMADO',
        turno: 'NOCHE',
        disponible: true,
      },
      {
        fecha: '2026-07-28',
        diaSemana: 'MARTES',
        llamado: 'PRIMER_LLAMADO',
        turno: 'NOCHE',
        disponible: true,
      },
    ],
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

describe('jointDateVocalPlanner', () => {
  it('planifica fecha y vocales disponibles en una estrategia conjunta', () => {
    const result = planWithJointDateVocalPlanner(baseInput())

    expect(result.summary.totalPlanned).toBeGreaterThan(0)
    expect(result.plannedMesas[0]).toMatchObject({
      fecha: '2026-07-27',
      vocal1Id: expect.any(String),
    })
    expect(result.diagnostics.safeToReplaceLegacy).toBe(false)
  })

  it('no asigna vocal que no asiste ese dia', () => {
    const result = planWithJointDateVocalPlanner(baseInput({
      docentes: [
        docente('titular-1'),
        docente('vocal-ausente', { diasAsistencia: ['martes'] }),
      ],
      materias: [materia('A', 'titular-1')],
      fechasDisponibles: [
        {
          fecha: '2026-07-27',
          diaSemana: 'LUNES',
          llamado: 'PRIMER_LLAMADO',
          turno: 'NOCHE',
          disponible: true,
        },
      ],
    }))

    expect(result.summary.totalPlanned).toBe(0)
    expect(result.summary.vocalesNoDisponibles).toBeGreaterThan(0)
  })

  it('respeta cupo por horas catedra y no sobreutiliza docentes', () => {
    const result = planWithJointDateVocalPlanner(baseInput({
      docentes: [
        docente('titular-1', { horasCatedra: 0 }),
        docente('titular-2', { horasCatedra: 0 }),
        docente('titular-3', { horasCatedra: 0 }),
        docente('vocal-limitado', { horasCatedra: 2 }),
      ],
      materias: [
        materia('A', 'titular-1'),
        materia('B', 'titular-2'),
        materia('C', 'titular-3'),
      ],
      fechasDisponibles: [
        {
          fecha: '2026-07-27',
          diaSemana: 'LUNES',
          llamado: 'PRIMER_LLAMADO',
          turno: 'NOCHE',
          disponible: true,
        },
        {
          fecha: '2026-08-03',
          diaSemana: 'LUNES',
          llamado: 'PRIMER_LLAMADO',
          turno: 'NOCHE',
          disponible: true,
        },
        {
          fecha: '2026-08-10',
          diaSemana: 'LUNES',
          llamado: 'PRIMER_LLAMADO',
          turno: 'NOCHE',
          disponible: true,
        },
      ],
    }))

    const limitedUses = result.participaciones.filter((participacion) => participacion.docenteId === 'vocal-limitado')

    expect(result.summary.consumoCupo.docentesExcedidos).toBe(0)
    expect(limitedUses).toHaveLength(2)
  })

  it('evita superposicion de docente en la misma fecha y turno', () => {
    const result = planWithJointDateVocalPlanner(baseInput({
      docentes: [
        docente('titular-1'),
        docente('titular-2'),
        docente('vocal-unico'),
      ],
      materias: [
        materia('A', 'titular-1'),
        materia('B', 'titular-2'),
      ],
      fechasDisponibles: [
        {
          fecha: '2026-07-27',
          diaSemana: 'LUNES',
          llamado: 'PRIMER_LLAMADO',
          turno: 'NOCHE',
          disponible: true,
        },
      ],
    }))

    const vocalUsesOnSameSlot = result.plannedMesas.filter((mesa) => (
      mesa.fecha === '2026-07-27' &&
      [mesa.vocal1Id, mesa.vocal2Id].includes('vocal-unico')
    ))

    expect(vocalUsesOnSameSlot).toHaveLength(1)
  })

  it('expone la metrica de casos compactables experimentales', () => {
    const result = planWithJointDateVocalPlanner(baseInput({
      docentes: [
        docente('titular-1'),
        docente('vocal-1'),
        docente('vocal-2'),
      ],
      materias: [
        materia('A', 'titular-1'),
        materia('B', 'titular-1'),
      ],
      fechasDisponibles: [
        {
          fecha: '2026-07-27',
          diaSemana: 'LUNES',
          llamado: 'PRIMER_LLAMADO',
          turno: 'NOCHE',
          disponible: true,
        },
      ],
    }))

    expect(result.summary).toHaveProperty('casosCompactables')
    expect(result.compactableCases).toEqual(expect.any(Array))
  })

  it('no muta input ni expone nombres personales en diagnosticos', () => {
    const input = baseInput({
      docentes: [
        docente('titular-1', { nombre: 'Nombre Personal Titular' }),
        docente('vocal-1', { nombre: 'Nombre Personal Vocal' }),
      ],
      materias: [materia('A', 'titular-1')],
    })
    const original = structuredClone(input)
    const result = planWithJointDateVocalPlanner(input)
    const serialized = JSON.stringify({
      summary: result.summary,
      diagnostics: result.diagnostics,
      caseRows: result.caseRows,
    })

    expect(input).toEqual(original)
    expect(serialized).not.toContain('Nombre Personal Titular')
    expect(serialized).not.toContain('Nombre Personal Vocal')
  })
})
