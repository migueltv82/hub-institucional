import { describe, expect, it } from 'vitest'
import { auditIncompleteTribunals } from './auditIncompleteTribunals.js'

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

describe('auditIncompleteTribunals', () => {
  it('clasifica falta de 1 vocal', () => {
    const result = auditIncompleteTribunals({
      plannedItems: [mesa({ vocal1Id: 'vocal-1' })],
      teachers: [teacher('titular-1'), teacher('vocal-1'), teacher('vocal-2')],
      calendar,
    })

    expect(result.summary.faltaVocal2).toBe(1)
    expect(result.cases[0].missing).toBe('falta_vocal_2')
  })

  it('clasifica falta de 2 vocales', () => {
    const result = auditIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [teacher('titular-1')],
      calendar,
    })

    expect(result.summary.faltanAmbosVocales).toBe(1)
    expect(result.groupedByCause.faltan_ambos_vocales).toBe(1)
  })

  it('detecta rechazo por asistencia', () => {
    const result = auditIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [teacher('titular-1'), teacher('vocal-ausente', { diasAsistencia: ['martes'] })],
      calendar,
    })

    expect(result.groupedByCause.vocales_rechazados_por_no_asistir).toBeGreaterThan(0)
  })

  it('detecta rechazo por cupo', () => {
    const result = auditIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [teacher('titular-1'), teacher('vocal-limitado', { horasCatedra: 2 })],
      calendar,
      options: {
        participaciones: [
          { docenteId: 'vocal-limitado', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
          { docenteId: 'vocal-limitado', mesaId: 'm2', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
        ],
      },
    })

    expect(result.groupedByCause.vocales_rechazados_por_cupo).toBeGreaterThan(0)
  })

  it('detecta rechazo por superposicion', () => {
    const result = auditIncompleteTribunals({
      plannedItems: [
        mesa({ id: 'mesa-busy', titularId: 'otro-titular', vocal1Id: 'vocal-busy' }),
        mesa(),
      ],
      teachers: [teacher('titular-1'), teacher('otro-titular'), teacher('vocal-busy')],
      calendar,
    })

    expect(result.groupedByCause.vocales_rechazados_por_superposicion).toBeGreaterThan(0)
  })

  it('detecta rechazo por idoneidad', () => {
    const result = auditIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1'),
        teacher('vocal-sin-afinidad', {
          carrera: 'Carrera B',
          nombreMateria: 'Materia Lejana',
        }),
      ],
      calendar,
    })

    expect(result.groupedByCause.vocales_rechazados_por_idoneidad).toBeGreaterThan(0)
  })

  it('no expone nombres completos', () => {
    const result = auditIncompleteTribunals({
      plannedItems: [mesa()],
      teachers: [
        teacher('titular-1', { nombre: 'Nombre Personal Titular' }),
        teacher('vocal-1', { nombre: 'Nombre Personal Vocal' }),
      ],
      calendar,
    })
    const serialized = JSON.stringify(result)

    expect(serialized).not.toContain('Nombre Personal Titular')
    expect(serialized).not.toContain('Nombre Personal Vocal')
  })
})
