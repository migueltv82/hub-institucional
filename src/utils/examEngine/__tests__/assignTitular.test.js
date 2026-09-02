import { describe, expect, it } from 'vitest'
import { contarVocaliasPorDocente } from '../rules/halfPlusOne.js'
import { assignTitularesToCandidates } from '../planning/assignTitular.js'
import { buildParticipacionesFromMesas } from '../validation/validateCronograma.js'

const docentes = [
  {
    id: 'doc-1',
    nombre: 'Ana Perez',
    activo: true,
    diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    turnosDisponibles: ['manana'],
  },
  {
    id: 'doc-sin-disponibilidad',
    nombre: 'Bruno Diaz',
    activo: true,
    diasAsistencia: [],
  },
  {
    id: 'doc-inactivo',
    nombre: 'Carla Ruiz',
    activo: false,
    diasAsistencia: ['lunes', 'martes'],
  },
]

function candidate(overrides = {}) {
  return {
    id: 'candidate:profesorado de ingles::ing1',
    materiaId: 'ING1',
    materia: 'Lengua Inglesa I',
    carreraId: 'Profesorado de Ingles',
    carrera: 'Profesorado de Ingles',
    anio: 1,
    titularId: 'doc-1',
    titularNombre: 'Ana Perez',
    requiereMesa: true,
    llamadosRequeridos: ['PRIMER_LLAMADO'],
    noAgrupable: false,
    familiaIdoneidad: 'INGLES',
    correlativasPrevias: [],
    correlativasPosteriores: [],
    riskScore: 20,
    riskLevel: 'LOW',
    warnings: [],
    metadata: {
      turno: 'manana',
    },
    ...overrides,
  }
}

describe('examEngine planning: assignTitularesToCandidates', () => {
  it('candidate con titular valido genera mesa preliminar', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate()],
      docentes,
    })

    expect(result.errors).toEqual([])
    expect(result.mesasPreliminares).toEqual([
      expect.objectContaining({
        candidateId: 'candidate:profesorado de ingles::ing1',
        materiaId: 'ING1',
        llamado: 'PRIMER_LLAMADO',
        titularId: 'doc-1',
        titularNombre: 'Ana Perez',
      }),
    ])
    expect(result.summary).toMatchObject({
      totalCandidates: 1,
      totalMesasPreliminares: 1,
      totalTitularesAsignados: 1,
      totalSinTitular: 0,
      mesasPorLlamado: {
        PRIMER_LLAMADO: 1,
      },
    })
  })

  it('candidate con dos llamados genera dos mesas preliminares', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate({
        llamadosRequeridos: ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'],
      })],
      docentes,
    })

    expect(result.mesasPreliminares).toHaveLength(2)
    expect(result.mesasPreliminares.map((mesa) => mesa.llamado)).toEqual([
      'PRIMER_LLAMADO',
      'SEGUNDO_LLAMADO',
    ])
    expect(result.summary.mesasPorLlamado).toEqual({
      PRIMER_LLAMADO: 1,
      SEGUNDO_LLAMADO: 1,
    })
  })

  it('candidate sin titular devuelve error critico', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate({ titularId: '' })],
      docentes,
    })

    expect(result.mesasPreliminares).toEqual([])
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_REQUIRED',
        severity: 'critical',
      }),
    ])
    expect(result.summary.totalSinTitular).toBe(1)
  })

  it('titular inexistente devuelve error critico', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate({ titularId: 'doc-no-existe' })],
      docentes,
    })

    expect(result.mesasPreliminares).toEqual([])
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_NOT_FOUND',
        severity: 'critical',
        titularId: 'doc-no-existe',
      }),
    ])
  })

  it('titular inactivo devuelve error critico', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate({ titularId: 'doc-inactivo' })],
      docentes,
    })

    expect(result.mesasPreliminares).toEqual([])
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_INACTIVE',
        severity: 'critical',
        titularId: 'doc-inactivo',
      }),
    ])
  })

  it('titular sin disponibilidad devuelve warning', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate({ titularId: 'doc-sin-disponibilidad' })],
      docentes,
    })

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'TITULAR_SIN_DISPONIBILIDAD',
        severity: 'warning',
        titularId: 'doc-sin-disponibilidad',
      }),
    ])
    expect(result.mesasPreliminares[0].warnings).toEqual([
      expect.objectContaining({
        code: 'TITULAR_SIN_DISPONIBILIDAD',
        llamado: 'PRIMER_LLAMADO',
      }),
    ])
  })

  it('titularidad no consume cupo de mitad mas uno', () => {
    const result = assignTitularesToCandidates({
      candidates: [
        candidate({
          llamadosRequeridos: ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'],
        }),
        candidate({
          id: 'candidate:profesorado de ingles::ing2',
          materiaId: 'ING2',
          materia: 'Lengua Inglesa II',
          llamadosRequeridos: ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'],
        }),
      ],
      docentes,
    })
    const participaciones = buildParticipacionesFromMesas(result.mesasPreliminares)

    expect(participaciones).toHaveLength(4)
    expect(contarVocaliasPorDocente(participaciones, 'doc-1', 'PRIMER_LLAMADO')).toBe(0)
    expect(contarVocaliasPorDocente(participaciones, 'doc-1', 'SEGUNDO_LLAMADO')).toBe(0)
    expect(result.errors).toEqual([])
  })

  it('mesa preliminar queda con estado PENDIENTE_FECHA', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate()],
      docentes,
    })

    expect(result.mesasPreliminares[0].estado).toBe('PENDIENTE_FECHA')
  })

  it('mesa preliminar mantiene noAgrupable', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate({ noAgrupable: true })],
      docentes,
    })

    expect(result.mesasPreliminares[0].noAgrupable).toBe(true)
  })

  it('mesa preliminar mantiene correlativas previas y posteriores', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate({
        correlativasPrevias: ['ING0'],
        correlativasPosteriores: ['ING2'],
      })],
      docentes,
    })

    expect(result.mesasPreliminares[0]).toMatchObject({
      correlativasPrevias: ['ING0'],
      correlativasPosteriores: ['ING2'],
    })
  })

  it('no asigna vocales', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate()],
      docentes,
    })

    expect(result.mesasPreliminares[0]).toMatchObject({
      vocal1Id: null,
      vocal2Id: null,
    })
  })

  it('no asigna fechas definitivas', () => {
    const result = assignTitularesToCandidates({
      candidates: [candidate()],
      docentes,
    })

    expect(result.mesasPreliminares[0]).toMatchObject({
      fecha: null,
      hora: null,
    })
  })
})
