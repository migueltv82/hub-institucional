import { describe, expect, it } from 'vitest'
import { buildExamTableCandidates } from '../planning/buildCandidates.js'

const docentes = [
  {
    id: 'doc-1',
    nombre: 'Ana Perez',
    carrera: 'Profesorado de Ingles',
    nombreMateria: 'Lengua Inglesa I',
    diasAsistencia: ['lunes', 'martes', 'miercoles'],
    activo: true,
  },
  {
    id: 'doc-2',
    nombre: 'Bruno Diaz',
    carrera: 'Profesorado de Ingles',
    nombreMateria: 'Gramatica Inglesa',
    diasAsistencia: ['lunes', 'martes'],
    activo: true,
  },
  {
    id: 'doc-inactivo',
    nombre: 'Carla Ruiz',
    carrera: 'Profesorado de Ingles',
    nombreMateria: 'Lengua Inglesa II',
    diasAsistencia: ['lunes', 'martes'],
    activo: false,
  },
]

const configUnLlamado = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 1,
}

const configDosLlamados = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 2,
}

function materia(overrides = {}) {
  return {
    carrera: 'Profesorado de Ingles',
    materia: 'ING1',
    nombreMateria: 'Lengua Inglesa I',
    anio: 1,
    titular_id: 'doc-1',
    requiereMesa: true,
    ...overrides,
  }
}

describe('examEngine planning: buildExamTableCandidates', () => {
  it('materia con titular valido y requiereMesa true genera candidate', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [materia()],
      config: configUnLlamado,
    })

    expect(result.candidates).toEqual([
      expect.objectContaining({
        materiaId: 'ING1',
        materia: 'Lengua Inglesa I',
        carrera: 'Profesorado de Ingles',
        titularId: 'doc-1',
        titularNombre: 'Ana Perez',
        requiereMesa: true,
      }),
    ])
    expect(result.excluded).toEqual([])
  })

  it('materia sin titular va a excluded', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [materia({ titular_id: '' })],
      config: configUnLlamado,
    })

    expect(result.candidates).toEqual([])
    expect(result.excluded).toEqual([
      expect.objectContaining({
        materiaId: 'ING1',
        reason: 'Materia sin titular',
        severity: 'critical',
      }),
    ])
  })

  it('materia con titular inexistente va a excluded', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [materia({ titular_id: 'doc-no-existe' })],
      config: configUnLlamado,
    })

    expect(result.candidates).toEqual([])
    expect(result.excluded).toEqual([
      expect.objectContaining({
        reason: 'Titular inexistente',
        severity: 'critical',
      }),
    ])
  })

  it('materia con titular inactivo va a excluded', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [materia({ titular_id: 'doc-inactivo' })],
      config: configUnLlamado,
    })

    expect(result.candidates).toEqual([])
    expect(result.excluded).toEqual([
      expect.objectContaining({
        reason: 'Titular inactivo',
        severity: 'critical',
      }),
    ])
  })

  it('config con 1 llamado genera un solo llamado requerido', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [materia()],
      config: configUnLlamado,
    })

    expect(result.candidates[0].llamadosRequeridos).toEqual(['PRIMER_LLAMADO'])
    expect(result.summary.candidatesByCall).toEqual({
      PRIMER_LLAMADO: 1,
    })
  })

  it('config con 2 llamados genera dos llamados requeridos', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [materia()],
      config: configDosLlamados,
    })

    expect(result.candidates[0].llamadosRequeridos).toEqual(['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'])
    expect(result.summary.candidatesByCall).toEqual({
      PRIMER_LLAMADO: 1,
      SEGUNDO_LLAMADO: 1,
    })
  })

  it('Practicas Discursivas III queda marcada como noAgrupable', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [materia({
        materia: 'PD3',
        nombreMateria: 'Practicas Discursivas III',
        titular_id: 'doc-1',
      })],
      config: configUnLlamado,
    })

    expect(result.candidates[0]).toMatchObject({
      noAgrupable: true,
      reasons: expect.arrayContaining(['Materia no agrupable por regla institucional']),
      warnings: expect.arrayContaining(['Materia no agrupable por regla institucional']),
    })
  })

  it('Practicas Discursivas IV queda marcada como noAgrupable', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [materia({
        materia: 'PD4',
        nombreMateria: 'Practicas Discursivas IV',
        titular_id: 'doc-1',
      })],
      config: configUnLlamado,
    })

    expect(result.candidates[0]).toMatchObject({
      noAgrupable: true,
    })
  })

  it('candidatos de alto riesgo quedan priorizados arriba', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [
        materia({ materia: 'ING1', nombreMateria: 'Lengua Inglesa I', anio: 1 }),
        materia({ materia: 'PD3', nombreMateria: 'Practicas Discursivas III', anio: 3 }),
      ],
      config: configUnLlamado,
    })

    expect(result.candidates[0]).toMatchObject({
      materiaId: 'PD3',
      noAgrupable: true,
      riskLevel: 'HIGH',
    })
  })

  it('candidate incluye correlativas previas y posteriores si existen', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [
        materia({ materia: 'ING1', nombreMateria: 'Ingles I' }),
        materia({ materia: 'ING2', nombreMateria: 'Ingles II', anio: 2 }),
      ],
      correlatividades: [
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING2',
          nombreMateria: 'Ingles II',
          correlativas: ['ING1'],
        },
      ],
      config: configUnLlamado,
    })
    const inglesI = result.candidates.find((candidate) => candidate.materiaId === 'ING1')
    const inglesII = result.candidates.find((candidate) => candidate.materiaId === 'ING2')

    expect(inglesI.correlativasPosteriores).toEqual(['Ingles II'])
    expect(inglesII.correlativasPrevias).toEqual(['ING1'])
  })

  it.each([
    ['turismo con materia SUP y correlatividad SUPERIOR', 'TECNICO SUP EN TURISMO', 'TECNICO SUPERIOR EN TURISMO', 'TUR1', 'TUR2'],
    ['turismo con materia SUPERIOR y correlatividad SUP', 'TECNICO SUPERIOR EN TURISMO', 'TECNICO SUP EN TURISMO', 'TUR3', 'TUR4'],
    ['traductorado con materia SUP y correlatividad SUPERIOR', 'TECNICO SUP EN TRADUCTORADO', 'TECNICO SUPERIOR EN TRADUCTORADO', 'TRA1', 'TRA2'],
    ['traductorado con materia SUPERIOR y correlatividad SUP', 'TECNICO SUPERIOR EN TRADUCTORADO', 'TECNICO SUP EN TRADUCTORADO', 'TRA3', 'TRA4'],
  ])('matchea correlatividades aunque la carrera use alias: %s', (
    _caseName,
    materiaCareer,
    correlativityCareer,
    previaCode,
    posteriorCode,
  ) => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [
        materia({
          carrera: materiaCareer,
          materia: previaCode,
          nombreMateria: `Previa ${previaCode}`,
        }),
        materia({
          carrera: materiaCareer,
          materia: posteriorCode,
          nombreMateria: `Posterior ${posteriorCode}`,
          anio: 2,
        }),
      ],
      correlatividades: [
        {
          carrera: correlativityCareer,
          materia: posteriorCode,
          nombreMateria: `Posterior ${posteriorCode}`,
          correlativas: [previaCode],
        },
      ],
      config: configUnLlamado,
    })
    const previa = result.candidates.find((candidate) => candidate.materiaId === previaCode)
    const posterior = result.candidates.find((candidate) => candidate.materiaId === posteriorCode)

    expect(previa.correlativasPosteriores).toEqual([`Posterior ${posteriorCode}`])
    expect(posterior.correlativasPrevias).toEqual([previaCode])
  })

  it('summary contabiliza candidates, excluded y nonGroupableCandidates', () => {
    const result = buildExamTableCandidates({
      docentes,
      materias: [
        materia({ materia: 'PD3', nombreMateria: 'Practicas Discursivas III' }),
        materia({ materia: 'NO', nombreMateria: 'Materia excluida', requiereMesa: false }),
        materia({ materia: 'SIN', nombreMateria: 'Sin titular', titular_id: '' }),
      ],
      config: configUnLlamado,
    })

    expect(result.summary).toMatchObject({
      totalMaterias: 3,
      totalCandidates: 1,
      totalExcluded: 2,
      nonGroupableCandidates: 1,
      candidatesByCareer: {
        'Profesorado de Ingles': 1,
      },
    })
  })

  it('no modifica datos originales de entrada', () => {
    const inputMaterias = [
      materia({ materia: 'ING1', nombreMateria: 'Lengua Inglesa I' }),
    ]
    const snapshot = structuredClone(inputMaterias)

    buildExamTableCandidates({
      docentes,
      materias: inputMaterias,
      config: configUnLlamado,
    })

    expect(inputMaterias).toEqual(snapshot)
  })
})
