import { describe, expect, it } from 'vitest'
import { validateMesa } from '../validation/validateMesa.js'

const docentes = [
  { id: 'doc-1', nombre: 'Ana Perez', activo: true },
  { id: 'doc-2', nombre: 'Bruno Diaz', activo: true },
  { id: 'doc-3', nombre: 'Carla Ruiz', activo: true },
]

describe('examEngine validation: validateMesa con contratos canonicos', () => {
  it('mesa legacy con presidente_id valido pasa como titular', () => {
    const result = validateMesa({
      id: 'mesa-1',
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      presidente_id: 'doc-1',
    }, { docentes })

    expect(result).toMatchObject({
      valid: true,
      mesaId: 'mesa-1',
      errors: [],
      mesa: {
        titularId: 'doc-1',
      },
    })
  })

  it('mesa sin titular devuelve error critico', () => {
    const result = validateMesa({
      id: 'mesa-2',
      carrera: 'Profesorado de Ingles',
      materia: 'ING2',
    }, { docentes })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_REQUIRED',
        severity: 'critical',
        mesaId: 'mesa-2',
      }),
    ])
  })

  it('mesa con titular tambien cargado como vocal devuelve error', () => {
    const result = validateMesa({
      id: 'mesa-3',
      carrera: 'Profesorado de Ingles',
      materia: 'ING3',
      titular_id: 'doc-1',
      vocal1: 'doc-1',
      vocal2: 'doc-2',
    }, { docentes })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_AS_VOCAL',
        severity: 'critical',
        mesaId: 'mesa-3',
      }),
    ])
  })

  it('mesa con vocal1 y vocal2 iguales devuelve error', () => {
    const result = validateMesa({
      id: 'mesa-4',
      carrera: 'Profesorado de Ingles',
      materia: 'ING4',
      titular_id: 'doc-1',
      vocal1: 'doc-2',
      vocal2: 'doc-2',
    }, { docentes })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'DUPLICATED_VOCALES',
        severity: 'critical',
        mesaId: 'mesa-4',
      }),
    ])
  })

  it('mesa con exam_call first se normaliza a PRIMER_LLAMADO', () => {
    const result = validateMesa({
      id: 'mesa-5',
      carrera: 'Profesorado de Ingles',
      materia: 'ING5',
      titular_id: 'doc-1',
      exam_call: 'first',
      fechaIso: '2026-07-27',
      inicio: '08:00',
    }, { docentes })

    expect(result.valid).toBe(true)
    expect(result.mesa).toMatchObject({
      llamado: 'PRIMER_LLAMADO',
      fecha: '2026-07-27',
      hora: '08:00',
    })
  })
})
