import { describe, expect, it } from 'vitest'
import {
  buildParticipacionesFromMesas,
  validateCronograma,
} from '../validation/validateCronograma.js'

const materiaIngles = {
  carrera: 'Profesorado de Ingles',
  materia: 'ING1',
  nombreMateria: 'Ingles I',
}

describe('examEngine validation: validateCronograma con contratos canonicos', () => {
  it('config regular con 1 llamado no exige segundo', () => {
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
      },
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.normalizedCronograma[0].llamado).toBe('PRIMER_LLAMADO')
  })

  it('config regular con 2 llamados exige segundo', () => {
    const result = validateCronograma({
      materias: [materiaIngles],
      cronograma: [{
        id: 'mesa-2',
        ...materiaIngles,
        profesorTitular: 'Ana Perez',
        exam_type: 'regular',
        exam_call: 'first',
      }],
      examPeriodConfig: {
        tipoPeriodo: 'REGULAR',
        cantidadLlamados: 2,
      },
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

  it('config invalida devuelve error controlado', () => {
    const result = validateCronograma({
      materias: [materiaIngles],
      cronograma: [{
        id: 'mesa-3',
        ...materiaIngles,
        profesorTitular: 'Ana Perez',
        exam_type: 'regular',
        exam_call: 'first',
      }],
      examPeriodConfig: {
        tipoPeriodo: 'REGULAR',
        cantidadLlamados: 4,
      },
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'INVALID_CALL_COUNT',
        severity: 'critical',
      }),
    ])
  })

  it('cronograma con mesa sin titular devuelve error critico', () => {
    const result = validateCronograma({
      materias: [materiaIngles],
      cronograma: [{
        id: 'mesa-4',
        ...materiaIngles,
        exam_type: 'regular',
        exam_call: 'first',
      }],
      examPeriodConfig: {
        tipoPeriodo: 'REGULAR',
        cantidadLlamados: 1,
      },
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_REQUIRED',
        severity: 'critical',
        mesaId: 'mesa-4',
      }),
    ])
  })

  it('cronograma con campos legacy se normaliza y valida correctamente', () => {
    const result = validateCronograma({
      materias: [materiaIngles],
      cronograma: [{
        id: 'mesa-5',
        ...materiaIngles,
        presidente_id: 'doc-1',
        vocal1: 'doc-2',
        vocal2: 'doc-3',
        exam_type: 'regular',
        exam_call: 'first',
        fechaIso: '2026-07-27',
        inicio: '08:00',
      }],
      examPeriodConfig: {
        tipoPeriodo: 'REGULAR',
        cantidadLlamados: 1,
      },
    })

    expect(result.valid).toBe(true)
    expect(result.normalizedCronograma[0]).toMatchObject({
      titularId: 'doc-1',
      vocal1Id: 'doc-2',
      vocal2Id: 'doc-3',
      llamado: 'PRIMER_LLAMADO',
      fecha: '2026-07-27',
      hora: '08:00',
    })
    expect(result.participaciones).toEqual([
      expect.objectContaining({ docenteId: 'doc-1', rol: 'TITULAR' }),
      expect.objectContaining({ docenteId: 'doc-2', rol: 'VOCAL_1' }),
      expect.objectContaining({ docenteId: 'doc-3', rol: 'VOCAL_2' }),
    ])
  })

  it('buildParticipacionesFromMesas registra tribunal cruzado aparte', () => {
    const participaciones = buildParticipacionesFromMesas([{
      id: 'mesa-6',
      titular_id: 'doc-1',
      vocal1: 'doc-2',
      tribunalCruzado: 'doc-externo',
      exam_call: 'first',
    }])

    expect(participaciones).toEqual([
      expect.objectContaining({ docenteId: 'doc-1', rol: 'TITULAR' }),
      expect.objectContaining({ docenteId: 'doc-2', rol: 'VOCAL_1' }),
      expect.objectContaining({ docenteId: 'doc-externo', rol: 'TRIBUNAL_CRUZADO' }),
    ])
  })
})
