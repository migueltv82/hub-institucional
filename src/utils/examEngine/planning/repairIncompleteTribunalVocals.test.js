import { describe, expect, it } from 'vitest'
import { repairIncompleteTribunalVocals } from './repairIncompleteTribunalVocals.js'

const calendar = [
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

describe('repairIncompleteTribunalVocals', () => {
  it('completa 2 vocales cuando puede', () => {
    const result = repairIncompleteTribunalVocals({
      plannedItems: [mesa({
        warnings: [{ code: 'TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA', severity: 'warning' }],
        metadata: { requiresManualReview: true },
      })],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
        teacher('vocal-2'),
      ],
      calendar,
      options: { minimumVocalCount: 2 },
    })

    expect(result.summary.repairedWithTwoVocales).toBe(1)
    expect(result.plannedItems[0]).toMatchObject({
      vocal1Id: expect.any(String),
      vocal2Id: expect.any(String),
      metadata: { requiresManualReview: false },
    })
    expect(result.plannedItems[0].warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA' }),
    ]))
  })

  it('completa 1 vocal si minimumVocalCount es 1 y marca revision', () => {
    const result = repairIncompleteTribunalVocals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    })

    expect(result.summary.repairedWithOneVocal).toBe(1)
    expect(result.summary.minimumReviewExistingOneVocal).toBe(0)
    expect(result.plannedItems[0].metadata.vocalRepairStatus).toBe('MINIMUM_TRIBUNAL_REVIEW')
    expect(result.plannedItems[0].warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MINIMUM_TRIBUNAL_REVIEW' }),
    ]))
  })

  it('deja manual si no hay vocal valido', () => {
    const result = repairIncompleteTribunalVocals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-ausente', { diasAsistencia: ['martes'] }),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    })

    expect(result.summary.manualVocalReview).toBe(1)
    expect(result.plannedItems[0].warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MANUAL_VOCAL_REVIEW' }),
    ]))
  })

  it('no usa titular como vocal ni duplica vocal existente', () => {
    const result = repairIncompleteTribunalVocals({
      plannedItems: [mesa({ vocal1Id: 'vocal-1' })],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-1'),
      ],
      calendar,
      options: { minimumVocalCount: 1 },
    })

    expect(result.summary.repairedWithOneVocal).toBe(0)
    expect(result.summary.minimumReviewExistingOneVocal).toBe(1)
    expect(result.plannedItems[0].vocal2Id).toBeNull()
    expect(result.plannedItems[0].metadata.requiresManualReview).toBe(true)
  })

  it('respeta cupo por horas catedra', () => {
    const result = repairIncompleteTribunalVocals({
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

    expect(result.summary.manualVocalReview).toBe(1)
    expect(result.summary.rejectedByCause.vocales_rechazados_por_cupo).toBeGreaterThan(0)
  })

  it('detecta superposicion y no consume cupo hasta confirmar', () => {
    const busyMesa = mesa({
      id: 'mesa-busy',
      titularId: 'otro-titular',
      vocal1Id: 'vocal-busy',
      vocal2Id: null,
    })
    const result = repairIncompleteTribunalVocals({
      plannedItems: [busyMesa, mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('otro-titular'),
        teacher('vocal-busy'),
      ],
      calendar,
      options: { minimumVocalCount: 2 },
    })

    expect(result.summary.manualVocalReview).toBeGreaterThan(0)
    expect(result.summary.rejectedByCause.vocales_rechazados_por_superposicion).toBeGreaterThan(0)
    expect(result.participaciones.filter((item) => item.mesaId === 'mesa-1')).toHaveLength(0)
  })

  it('no muta inputs ni expone nombres completos en diagnosticos', () => {
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
    const result = repairIncompleteTribunalVocals(input)
    const serialized = JSON.stringify({
      summary: result.summary,
      cases: result.cases,
      repairs: result.repairs,
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(input).toEqual(original)
    expect(serialized).not.toContain('Nombre Personal Titular')
    expect(serialized).not.toContain('Nombre Personal Vocal')
  })
})
