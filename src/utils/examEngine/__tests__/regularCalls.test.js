import { describe, expect, it } from 'vitest'
import { validateCronograma } from '../validation/validateCronograma.js'
import {
  getLlamadosRequeridos,
  requiereSegundoLlamado,
  validarCantidadLlamados,
  validarLlamadosMateria,
} from '../rules/regularCalls.js'

const materiaIngles = {
  carrera: 'Profesorado de Ingles',
  materia: 'ING1',
  nombreMateria: 'Ingles I',
}

describe('examEngine rule: cantidad de llamados configurable', () => {
  it('periodo regular con cantidadLlamados = 1 no exige segundo llamado', () => {
    const config = {
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 1,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
    }
    const result = validarCantidadLlamados([materiaIngles], [
      {
        ...materiaIngles,
        exam_type: 'regular',
        exam_call: 'first',
      },
    ], config)

    expect(getLlamadosRequeridos(config)).toEqual(['PRIMER_LLAMADO'])
    expect(requiereSegundoLlamado(config)).toBe(false)
    expect(result).toMatchObject({
      valid: true,
      errors: [],
      requiredCalls: ['PRIMER_LLAMADO'],
    })
  })

  it('periodo regular con cantidadLlamados = 2 exige primer y segundo llamado', () => {
    const config = {
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 2,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
    }
    const result = validarCantidadLlamados([materiaIngles], [
      {
        ...materiaIngles,
        exam_type: 'regular',
        exam_call: 'first',
      },
      {
        ...materiaIngles,
        exam_type: 'regular',
        exam_call: 'second',
      },
    ], config)

    expect(getLlamadosRequeridos(config)).toEqual(['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'])
    expect(requiereSegundoLlamado(config)).toBe(true)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('periodo especial con cantidadLlamados = 1 valida solo un llamado especial', () => {
    const config = {
      tipoPeriodo: 'ESPECIAL',
      cantidadLlamados: 1,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
    }
    const result = validarCantidadLlamados([materiaIngles], [
      {
        ...materiaIngles,
        exam_type: 'special',
        exam_call: 'special',
      },
    ], config)

    expect(getLlamadosRequeridos(config)).toEqual(['LLAMADO_ESPECIAL'])
    expect(requiereSegundoLlamado(config)).toBe(false)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('periodo especial con cantidadLlamados = 2 valida ambos llamados', () => {
    const config = {
      tipoPeriodo: 'ESPECIAL',
      cantidadLlamados: 2,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
    }
    const result = validarCantidadLlamados([materiaIngles], [
      {
        ...materiaIngles,
        exam_type: 'special',
        exam_call: 'first',
      },
      {
        ...materiaIngles,
        exam_type: 'special',
        exam_call: 'second',
      },
    ], config)

    expect(getLlamadosRequeridos(config)).toEqual(['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'])
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('cantidadLlamados invalido devuelve error controlado', () => {
    const result = validarCantidadLlamados([materiaIngles], [], {
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 3,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'INVALID_CALL_COUNT',
        severity: 'critical',
      }),
    ])
  })

  it('si falta primer llamado devuelve error critico', () => {
    const result = validarLlamadosMateria(materiaIngles, [
      {
        ...materiaIngles,
        exam_type: 'regular',
        exam_call: 'second',
      },
    ], {
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 2,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'SUBJECT_WITHOUT_REQUIRED_CALLS',
        missingCalls: ['PRIMER_LLAMADO'],
        severity: 'critical',
      }),
    ])
  })

  it('si falta segundo llamado y config pide 2 llamados devuelve error critico', () => {
    const result = validarLlamadosMateria(materiaIngles, [
      {
        ...materiaIngles,
        exam_type: 'regular',
        exam_call: 'first',
      },
    ], {
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 2,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'SUBJECT_WITHOUT_REQUIRED_CALLS',
        missingCalls: ['SEGUNDO_LLAMADO'],
        severity: 'critical',
      }),
    ])
  })

  it('si falta segundo llamado y config pide 1 llamado no devuelve error', () => {
    const result = validarLlamadosMateria(materiaIngles, [
      {
        ...materiaIngles,
        exam_type: 'regular',
        exam_call: 'first',
      },
    ], {
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 1,
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('validateCronograma respeta examPeriodConfig.cantidadLlamados', () => {
    const result = validateCronograma({
      materias: [materiaIngles],
      cronograma: [{
        id: 'mesa-1',
        ...materiaIngles,
        profesorTitular: 'Ana Perez',
        exam_type: 'regular',
        exam_call: 'first',
      }],
      examPeriodConfig: {
        tipoPeriodo: 'REGULAR',
        cantidadLlamados: 1,
        fechaInicio: '2026-07-27',
        fechaFin: '2026-08-07',
      },
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
})

