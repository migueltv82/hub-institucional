import { describe, expect, it } from 'vitest'
import {
  RESCHEDULE_TRIBUNAL_STATUS,
  rescheduleIncompleteTribunals,
} from './rescheduleIncompleteTribunals.js'

const calendar = [
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
]

function teacher(id, overrides = {}) {
  return {
    id,
    nombre: `Nombre Personal ${id}`,
    activo: true,
    carrera: 'Carrera A',
    nombreMateria: 'Materia Afin',
    diasAsistencia: ['martes'],
    turnosDisponibles: ['NOCHE'],
    horasCatedra: 6,
    halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
    ...overrides,
  }
}

function mesa(overrides = {}) {
  return {
    id: 'mesa-1',
    materiaId: 'MAT-1',
    materia: 'Materia A',
    carreraId: 'CAR-A',
    carrera: 'Carrera A',
    llamado: 'PRIMER_LLAMADO',
    fecha: '2026-07-27',
    fechaIso: '2026-07-27',
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

describe('rescheduleIncompleteTribunals', () => {
  it('no mueve mesa completa valida', () => {
    const completeMesa = mesa({
      fecha: '2026-07-28',
      fechaIso: '2026-07-28',
      vocal1Id: 'vocal-1',
      vocal2Id: 'vocal-2',
    })
    const result = rescheduleIncompleteTribunals({
      plannedItems: [completeMesa],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
        teacher('vocal-2'),
      ],
      calendar,
      options: { minimumVocalCount: 2 },
    })

    expect(result.summary.rescheduleAttempts).toBe(0)
    expect(result.plannedItems[0]).toMatchObject({
      fecha: '2026-07-28',
      vocal1Id: 'vocal-1',
      vocal2Id: 'vocal-2',
    })
  })

  it('mueve mesa incompleta a fecha con 2 vocales validos', () => {
    const result = rescheduleIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
        teacher('vocal-2'),
      ],
      calendar,
      options: { minimumVocalCount: 2 },
    })

    expect(result.summary.rescheduledComplete).toBe(1)
    expect(result.plannedItems[0]).toMatchObject({
      fecha: '2026-07-28',
      vocal1Id: expect.any(String),
      vocal2Id: expect.any(String),
    })
    expect(result.cases[0].status).toBe(RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_COMPLETE)
  })

  it('mueve mesa incompleta a fecha con 1 vocal si minimumVocalCount es 1', () => {
    const result = rescheduleIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    })

    expect(result.summary.rescheduledMinimumReview).toBe(1)
    expect(result.plannedItems[0].fecha).toBe('2026-07-28')
    expect(result.plannedItems[0].metadata.requiresManualReview).toBe(true)
  })

  it('deja manual si no hay fecha viable', () => {
    const result = rescheduleIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1', { diasAsistencia: ['lunes', 'martes'] }),
        teacher('vocal-ausente', { diasAsistencia: ['miercoles'] }),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    })

    expect(result.summary.manualReviewNoFeasibleDateVocals).toBe(1)
    expect(result.plannedItems[0].metadata.rescheduleStatus)
      .toBe(RESCHEDULE_TRIBUNAL_STATUS.MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS)
  })

  it('no asigna docente que no asiste', () => {
    const result = rescheduleIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-ausente', { diasAsistencia: ['lunes'] }),
        teacher('vocal-valido'),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    })

    expect([result.plannedItems[0].vocal1Id, result.plannedItems[0].vocal2Id]).not.toContain('vocal-ausente')
    expect(result.summary.rejectedByCause.vocales_rechazados_por_no_asistir).toBeGreaterThan(0)
  })

  it('evita superposicion', () => {
    const busyMesa = mesa({
      id: 'mesa-busy',
      fecha: '2026-07-28',
      fechaIso: '2026-07-28',
      titularId: 'otro-titular',
      vocal1Id: 'vocal-busy',
      vocal2Id: 'vocal-ocupado-2',
    })
    const result = rescheduleIncompleteTribunals({
      plannedItems: [busyMesa, mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('otro-titular'),
        teacher('vocal-busy'),
        teacher('vocal-ocupado-2'),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    })

    expect(result.summary.manualReviewNoFeasibleDateVocals).toBe(1)
    expect(result.summary.rejectedByCause.vocales_rechazados_por_superposicion).toBeGreaterThan(0)
  })

  it('respeta cupo por horas catedra', () => {
    const result = rescheduleIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-limitado', { horasCatedra: 2 }),
      ],
      calendar,
      teacherLoad: [
        { docenteId: 'vocal-limitado', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
        { docenteId: 'vocal-limitado', mesaId: 'm2', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
      ],
      options: { minimumVocalCount: 1 },
    })

    expect(result.summary.manualReviewNoFeasibleDateVocals).toBe(1)
    expect(result.summary.rejectedByCause.vocales_rechazados_por_cupo).toBeGreaterThan(0)
  })

  it('no usa titular como vocal ni duplica vocal', () => {
    const result = rescheduleIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-duplicado'),
        teacher('vocal-duplicado'),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    })

    expect([result.plannedItems[0].vocal1Id, result.plannedItems[0].vocal2Id]).not.toContain('titular-1')
    expect(new Set([result.plannedItems[0].vocal1Id, result.plannedItems[0].vocal2Id].filter(Boolean)).size)
      .toBe([result.plannedItems[0].vocal1Id, result.plannedItems[0].vocal2Id].filter(Boolean).length)
  })

  it('libera y recalcula cupo si cambia un vocal previo', () => {
    const result = rescheduleIncompleteTribunals({
      plannedItems: [mesa({ vocal1Id: 'vocal-previo' })],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-previo', { horasCatedra: 2 }),
        teacher('vocal-2'),
      ],
      calendar,
      teacherLoad: [
        { docenteId: 'vocal-previo', mesaId: 'mesa-1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
        { docenteId: 'vocal-previo', mesaId: 'otra-mesa', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      ],
      options: { minimumVocalCount: 2 },
    })

    expect(result.summary.rescheduledComplete).toBe(1)
    expect([result.plannedItems[0].vocal1Id, result.plannedItems[0].vocal2Id]).toContain('vocal-previo')
    expect(result.participaciones.filter((item) => item.docenteId === 'vocal-previo')).toHaveLength(2)
  })

  it('no consume cupo hasta confirmar combinacion', () => {
    const result = rescheduleIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-ausente', { diasAsistencia: ['lunes'] }),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    })

    expect(result.summary.manualReviewNoFeasibleDateVocals).toBe(1)
    expect(result.participaciones.filter((item) => item.mesaId === 'mesa-1')).toHaveLength(0)
  })

  it('no muta inputs ni expone nombres personales en diagnosticos', () => {
    const input = {
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1', { nombre: 'Nombre Personal Titular' }),
        teacher('vocal-1', { nombre: 'Nombre Personal Vocal' }),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    }
    const original = structuredClone(input)
    const result = rescheduleIncompleteTribunals(input)
    const serialized = JSON.stringify({
      summary: result.summary,
      cases: result.cases,
      warnings: result.warnings,
      errors: result.errors,
      diagnostics: result.diagnostics,
    })

    expect(input).toEqual(original)
    expect(serialized).not.toContain('Nombre Personal Titular')
    expect(serialized).not.toContain('Nombre Personal Vocal')
  })
})
