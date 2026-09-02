import { describe, expect, it } from 'vitest'
import { buildFeasibilityDiagnosis } from '../diagnostics/feasibility.js'

const configUnLlamado = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 1,
}

const configDosLlamados = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 2,
}

// horasCatedra = cantidad de diasAsistencia en cada fixture: preserva el
// mismo limite floor(horas/2)+1 que daba el modo historico por dias, ahora
// que la validacion de mitad-mas-uno fuerza TEACHING_HOURS_HALF_PLUS_ONE.
const docentesBase = [
  {
    id: 'doc-titular',
    nombre: 'Ana Titular',
    carrera: 'Tecnicatura en Software',
    nombreMateria: 'Programacion I',
    diasAsistencia: ['lunes', 'martes', 'miercoles'],
    horasCatedra: 3,
    activo: true,
  },
  {
    id: 'doc-vocal-1',
    nombre: 'Bruno Vocal',
    carrera: 'Tecnicatura en Software',
    nombreMateria: 'Programacion II',
    diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    horasCatedra: 5,
    activo: true,
  },
  {
    id: 'doc-vocal-2',
    nombre: 'Carla Vocal',
    carrera: 'Tecnicatura en Software',
    nombreMateria: 'TIC aplicada',
    diasAsistencia: ['lunes', 'martes', 'miercoles'],
    horasCatedra: 3,
    activo: true,
  },
]

const materiaSoftware = {
  carrera: 'Tecnicatura en Software',
  materia: 'PRG1',
  nombreMateria: 'Programacion I',
  titular_id: 'doc-titular',
}

function mesaSoftware(overrides = {}) {
  return {
    id: overrides.id ?? 'mesa-1',
    carrera: 'Tecnicatura en Software',
    materia: overrides.materia ?? 'PRG1',
    nombreMateria: overrides.nombreMateria ?? 'Programacion I',
    titular_id: overrides.titular_id ?? 'doc-titular',
    exam_type: 'regular',
    exam_call: overrides.exam_call ?? 'first',
    vocal1: overrides.vocal1,
    vocal2: overrides.vocal2,
    ...overrides,
  }
}

describe('examEngine diagnostics: feasibility diagnosis', () => {
  it('config valida y datos completos devuelve canGenerate true', () => {
    const diagnosis = buildFeasibilityDiagnosis({
      docentes: docentesBase,
      materias: [materiaSoftware],
      mesas: [],
      config: configUnLlamado,
    })

    expect(diagnosis.canGenerate).toBe(true)
    expect(diagnosis.errors).toEqual([])
    expect(diagnosis.summary).toMatchObject({
      totalDocentes: 3,
      totalMaterias: 1,
      materiasQueRequierenMesa: 1,
      materiasSinTitular: 0,
      llamadosRequeridos: ['PRIMER_LLAMADO'],
    })
  })

  it('config invalida devuelve canGenerate false', () => {
    const diagnosis = buildFeasibilityDiagnosis({
      docentes: docentesBase,
      materias: [materiaSoftware],
      config: {
        tipoPeriodo: 'REGULAR',
        cantidadLlamados: 3,
      },
    })

    expect(diagnosis.canGenerate).toBe(false)
    expect(diagnosis.errors).toEqual([
      expect.objectContaining({
        code: 'INVALID_CALL_COUNT',
        severity: 'critical',
        entityType: 'CONFIG',
      }),
    ])
  })

  it('materia sin titular devuelve error critico', () => {
    const diagnosis = buildFeasibilityDiagnosis({
      docentes: docentesBase,
      materias: [{ ...materiaSoftware, titular_id: '' }],
      config: configUnLlamado,
    })

    expect(diagnosis.canGenerate).toBe(false)
    expect(diagnosis.errors).toEqual([
      expect.objectContaining({
        code: 'MATERIA_SIN_TITULAR',
        severity: 'critical',
      }),
    ])
    expect(diagnosis.summary.materiasSinTitular).toBe(1)
  })

  it('titular inexistente devuelve error critico', () => {
    const diagnosis = buildFeasibilityDiagnosis({
      docentes: docentesBase,
      materias: [{ ...materiaSoftware, titular_id: 'doc-no-existe' }],
      config: configUnLlamado,
    })

    expect(diagnosis.canGenerate).toBe(false)
    expect(diagnosis.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_NOT_FOUND',
        severity: 'critical',
        titularId: 'doc-no-existe',
      }),
    ])
  })

  it('docente sin disponibilidad devuelve warning', () => {
    const diagnosis = buildFeasibilityDiagnosis({
      docentes: [
        docentesBase[0],
        docentesBase[1],
        { ...docentesBase[2], diasAsistencia: [] },
      ],
      materias: [materiaSoftware],
      config: configUnLlamado,
    })

    expect(diagnosis.canGenerate).toBe(true)
    expect(diagnosis.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DOCENTE_SIN_DISPONIBILIDAD',
        severity: 'warning',
        entityId: 'doc-vocal-2',
      }),
    ]))
  })

  it('docente inactivo como titular devuelve error critico', () => {
    const diagnosis = buildFeasibilityDiagnosis({
      docentes: [
        { ...docentesBase[0], activo: false },
        docentesBase[1],
        docentesBase[2],
      ],
      materias: [materiaSoftware],
      config: configUnLlamado,
    })

    expect(diagnosis.canGenerate).toBe(false)
    expect(diagnosis.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TITULAR_INACTIVE',
        severity: 'critical',
      }),
    ]))
  })

  it('falta segundo llamado cuando config pide 2 llamados devuelve error critico', () => {
    const diagnosis = buildFeasibilityDiagnosis({
      docentes: docentesBase,
      materias: [materiaSoftware],
      mesas: [mesaSoftware()],
      config: configDosLlamados,
    })

    expect(diagnosis.canGenerate).toBe(false)
    expect(diagnosis.errors).toEqual([
      expect.objectContaining({
        code: 'SUBJECT_WITHOUT_REQUIRED_CALLS',
        severity: 'critical',
        missingCalls: ['SEGUNDO_LLAMADO'],
      }),
    ])
  })

  it('no falta segundo llamado cuando config pide 1 llamado', () => {
    const diagnosis = buildFeasibilityDiagnosis({
      docentes: docentesBase,
      materias: [materiaSoftware],
      mesas: [mesaSoftware()],
      config: configUnLlamado,
    })

    expect(diagnosis.canGenerate).toBe(true)
    expect(diagnosis.errors).toEqual([])
  })

  it('vocal sin afinidad devuelve error critico si hay mesas existentes', () => {
    const diagnosis = buildFeasibilityDiagnosis({
      docentes: [
        ...docentesBase,
        {
          id: 'doc-historia',
          nombre: 'Historia',
          carrera: 'Profesorado de Historia',
          nombreMateria: 'Historia Antigua',
          diasAsistencia: ['lunes', 'martes', 'miercoles'],
          horasCatedra: 3,
          activo: true,
        },
      ],
      materias: [materiaSoftware],
      mesas: [mesaSoftware({ vocal1: 'doc-historia' })],
      config: configUnLlamado,
    })

    expect(diagnosis.canGenerate).toBe(false)
    expect(diagnosis.errors).toEqual([
      expect.objectContaining({
        code: 'VOCAL_SIN_AFINIDAD',
        severity: 'critical',
        docenteId: 'doc-historia',
      }),
    ])
  })

  it('docente justo en limite de vocalias devuelve warning', () => {
    const docentes = [
      ...docentesBase,
      { id: 'titular-2', carrera: 'Tecnicatura en Software', nombreMateria: 'Programacion II', diasAsistencia: ['lunes'], activo: true },
      { id: 'titular-3', carrera: 'Tecnicatura en Software', nombreMateria: 'Programacion III', diasAsistencia: ['lunes'], activo: true },
    ]
    const mesas = [
      mesaSoftware({ id: 'mesa-1', materia: 'PRG1', titular_id: 'doc-titular', vocal1: 'doc-vocal-1' }),
      mesaSoftware({ id: 'mesa-2', materia: 'PRG2', titular_id: 'titular-2', vocal1: 'doc-vocal-1' }),
      mesaSoftware({ id: 'mesa-3', materia: 'PRG3', titular_id: 'titular-3', vocal1: 'doc-vocal-1' }),
    ]

    const diagnosis = buildFeasibilityDiagnosis({
      docentes,
      materias: [],
      mesas,
      config: configUnLlamado,
    })

    expect(diagnosis.canGenerate).toBe(true)
    expect(diagnosis.warnings).toEqual([
      expect.objectContaining({
        code: 'DOCENTE_ALCANZA_LIMITE_VOCALIAS',
        severity: 'warning',
        docenteId: 'doc-vocal-1',
      }),
    ])
  })
})
