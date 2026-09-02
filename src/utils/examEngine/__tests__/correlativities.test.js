import { describe, expect, it } from 'vitest'
import {
  validateCorrelativeOrder,
  validateNoInvertedCorrelativities,
} from '../rules/correlativities.js'

describe('examEngine hard rule: correlatividades no invertidas', () => {
  it('permite que la correlativa previa este antes que la posterior', () => {
    const result = validateCorrelativeOrder({
      mesaPrevia: { materia: 'ING1', fechaIso: '2026-07-01' },
      mesaPosterior: { materia: 'ING2', fechaIso: '2026-07-08' },
    })

    expect(result).toMatchObject({
      valid: true,
      error: null,
      warning: null,
    })
  })

  it('permite misma fecha con advertencia', () => {
    const result = validateCorrelativeOrder({
      mesaPrevia: { materia: 'ING1', fechaIso: '2026-07-01' },
      mesaPosterior: { materia: 'ING2', fechaIso: '2026-07-01' },
    })

    expect(result).toMatchObject({
      valid: true,
      error: null,
      warning: 'Correlative subjects are scheduled on the same date.',
    })
  })

  it('devuelve error critico si Ingles II queda antes que Ingles I', () => {
    const result = validateNoInvertedCorrelativities({
      cronograma: [
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING2',
          nombreMateria: 'Ingles II',
          fechaIso: '2026-07-01',
        },
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          nombreMateria: 'Ingles I',
          fechaIso: '2026-07-08',
        },
      ],
      correlatividades: [
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING2',
          correlativas: ['ING1'],
        },
      ],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'CORRELATIVITY_INVERTED',
        severity: 'critical',
      }),
    ])
  })

  it('detecta la inversion incluso cuando la fila de correlatividades trae codigo explicito de la posterior', () => {
    // Si la fila de correlatividades tiene un campo `codigo` (el de la
    // materia posterior), la clave de la materia previa no debe heredarlo:
    // getSubjectCode() prioriza `codigo` sobre `materia`, asi que sin
    // sobreescribir `codigo` tambien, la busqueda de la mesa previa
    // terminaba apuntando (por accidente) a la propia mesa posterior.
    const result = validateNoInvertedCorrelativities({
      cronograma: [
        {
          carrera: 'Profesorado de Analisis',
          materia: 'ANALISIS I',
          fechaIso: '2026-08-10',
        },
        {
          carrera: 'Profesorado de Analisis',
          materia: 'ANALISIS II',
          codigo: 'AN02',
          fechaIso: '2026-08-05',
        },
      ],
      correlatividades: [
        {
          carrera: 'Profesorado de Analisis',
          materia: 'ANALISIS II',
          codigo: 'AN02',
          correlativas: ['ANALISIS I'],
        },
      ],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'CORRELATIVITY_INVERTED',
        severity: 'critical',
      }),
    ])
  })
})

