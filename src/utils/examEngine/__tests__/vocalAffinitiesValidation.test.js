import { describe, expect, it } from 'vitest'
import { NIVELES_AFINIDAD } from '../rules/affinities.js'
import {
  buildParticipacionesFromMesas,
  validateCronograma,
} from '../validation/validateCronograma.js'
import { validarAfinidadVocales } from '../validation/validateVocalAffinities.js'

function mesaBase(overrides = {}) {
  return {
    id: overrides.id ?? 'mesa-1',
    carrera: 'Profesorado de Ingles',
    materia: 'MAT1',
    nombreMateria: 'Lengua Inglesa I',
    titular_id: 'titular-1',
    exam_type: 'regular',
    exam_call: 'first',
    ...overrides,
  }
}

function validar(mesas, docentes) {
  return validarAfinidadVocales(docentes, mesas, buildParticipacionesFromMesas(mesas))
}

describe('examEngine validation: afinidad de vocales', () => {
  it('docente de Ingles puede ser vocal en mesa de Ingles de otra carrera', () => {
    const mesa = mesaBase({
      carrera: 'Traductorado de Ingles',
      nombreMateria: 'Lengua Inglesa II',
      vocal1: 'doc-ing',
    })
    const result = validar([mesa], [
      { id: 'doc-ing', carrera: 'Profesorado de Ingles', nombreMateria: 'Gramatica Inglesa' },
    ])

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.resumenAfinidades).toEqual([
      expect.objectContaining({
        docenteId: 'doc-ing',
        mesaId: 'mesa-1',
        afinidadValida: true,
        nivelAfinidad: NIVELES_AFINIDAD.FAMILIA_INGLES,
      }),
    ])
  })

  it('docente de Informatica puede ser vocal en mesa de Informatica/TIC', () => {
    const mesa = mesaBase({
      carrera: 'Tecnicatura en Software',
      nombreMateria: 'TIC aplicada',
      vocal1: 'doc-tic',
    })
    const result = validar([mesa], [
      { id: 'doc-tic', carrera: 'Profesorado de Informatica', nombreMateria: 'Programacion I' },
    ])

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.resumenAfinidades[0]).toMatchObject({
      nivelAfinidad: NIVELES_AFINIDAD.FAMILIA_INFORMATICA_TIC,
    })
  })

  it('docente de practica pedagogica puede ser vocal en practica de otro profesorado', () => {
    const mesa = mesaBase({
      carrera: 'Profesorado de Historia',
      nombreMateria: 'Residencia',
      vocal1: 'doc-practica',
    })
    const result = validar([mesa], [
      { id: 'doc-practica', carrera: 'Profesorado de Ingles', nombreMateria: 'Practica Docente III' },
    ])

    expect(result.valid).toBe(true)
    expect(result.resumenAfinidades[0]).toMatchObject({
      nivelAfinidad: NIVELES_AFINIDAD.PRACTICA_PEDAGOGICA_TRANSVERSAL,
    })
  })

  it('docente de practica tecnica solo puede ser vocal en la misma carrera tecnica', () => {
    const mesaMismaCarrera = mesaBase({
      id: 'mesa-tecnica-1',
      carrera: 'Tecnicatura Superior en Turismo',
      nombreMateria: 'Practica Profesional II',
      vocal1: 'doc-turismo',
    })
    const mesaOtraCarrera = mesaBase({
      id: 'mesa-tecnica-2',
      carrera: 'Tecnicatura Superior en Laboratorio',
      nombreMateria: 'Practica Profesional II',
      vocal1: 'doc-turismo',
    })
    const docentes = [
      { id: 'doc-turismo', carrera: 'Tecnicatura Superior en Turismo', nombreMateria: 'Practica Profesional I' },
    ]

    expect(validar([mesaMismaCarrera], docentes)).toMatchObject({
      valid: true,
      errors: [],
    })
    expect(validar([mesaOtraCarrera], docentes)).toMatchObject({
      valid: false,
      errors: [
        expect.objectContaining({
          code: 'VOCAL_SIN_AFINIDAD',
          severity: 'critical',
          docenteId: 'doc-turismo',
          mesaId: 'mesa-tecnica-2',
        }),
      ],
    })
  })

  it('docente sin afinidad devuelve error critico como vocal', () => {
    const mesa = mesaBase({
      carrera: 'Tecnicatura en Software',
      nombreMateria: 'Programacion I',
      vocal1: 'doc-historia',
    })
    const result = validar([mesa], [
      { id: 'doc-historia', carrera: 'Profesorado de Historia', nombreMateria: 'Historia Antigua' },
    ])

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'VOCAL_SIN_AFINIDAD',
        severity: 'critical',
        docenteId: 'doc-historia',
        mesaId: 'mesa-1',
      }),
    ])
  })

  it('TITULAR no se evalua como vocal', () => {
    const mesa = mesaBase({
      titular_id: 'doc-historia',
      carrera: 'Tecnicatura en Software',
      nombreMateria: 'Programacion I',
    })
    const result = validar([mesa], [
      { id: 'doc-historia', carrera: 'Profesorado de Historia', nombreMateria: 'Historia Antigua' },
    ])

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.resumenAfinidades).toEqual([])
  })

  it('TRIBUNAL_CRUZADO no se evalua como vocalia comun', () => {
    const mesa = mesaBase({
      carrera: 'Tecnicatura en Software',
      nombreMateria: 'Programacion I',
      tribunalCruzado: 'doc-historia',
    })
    const result = validar([mesa], [
      { id: 'doc-historia', carrera: 'Profesorado de Historia', nombreMateria: 'Historia Antigua' },
    ])

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.resumenAfinidades).toEqual([])
  })

  it('validateCronograma incorpora error critico cuando un vocal no tiene afinidad', () => {
    const mesa = mesaBase({
      carrera: 'Tecnicatura en Software',
      nombreMateria: 'Programacion I',
      vocal1: 'doc-historia',
    })
    const result = validateCronograma({
      cronograma: [mesa],
      docentes: [
        { id: 'titular-1', carrera: 'Tecnicatura en Software', nombreMateria: 'Programacion I' },
        {
          id: 'doc-historia',
          carrera: 'Profesorado de Historia',
          nombreMateria: 'Historia Antigua',
          diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
          horasCatedra: 5,
        },
      ],
      examPeriodConfig: {
        tipoPeriodo: 'REGULAR',
        cantidadLlamados: 1,
      },
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'VOCAL_SIN_AFINIDAD',
        severity: 'critical',
        docenteId: 'doc-historia',
        mesaId: 'mesa-1',
      }),
    ])
    expect(result.resumenAfinidades).toEqual([
      expect.objectContaining({
        docenteId: 'doc-historia',
        afinidadValida: false,
      }),
    ])
  })
})
