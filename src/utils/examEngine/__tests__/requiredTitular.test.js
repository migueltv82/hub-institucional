import { describe, expect, it } from 'vitest'
import {
  asignarTitularDesdeMateria,
} from '../planning/assignTitular.js'
import {
  mesaTieneTitular,
  obtenerTitularMesa,
} from '../rules/roleConflicts.js'
import {
  validarTitularObligatorio,
  validateMesa,
} from '../validation/validateMesa.js'

const docentes = [
  { id: 'doc-1', nombre: 'Ana Perez', activo: true },
  { id: 'doc-2', nombre: 'Bruno Diaz', activo: true },
  { id: 'doc-inactivo', nombre: 'Carla Ruiz', activo: false },
]

describe('examEngine hard rule: titular obligatorio', () => {
  it('mesa con titular_id valido pasa', () => {
    const mesa = {
      id: 'mesa-1',
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      nombreMateria: 'Ingles I',
      titular_id: 'doc-1',
    }

    expect(obtenerTitularMesa(mesa)).toBe('doc-1')
    expect(mesaTieneTitular(mesa)).toBe(true)
    expect(validarTitularObligatorio(mesa, docentes)).toMatchObject({
      valid: true,
      mesaId: 'mesa-1',
      titularId: 'doc-1',
    })
    expect(validateMesa(mesa, { docentes }).valid).toBe(true)
  })

  it('mesa con presidente_id valido usado como titular pasa', () => {
    const mesa = {
      id: 'mesa-2',
      carrera: 'Profesorado de Ingles',
      materia: 'ING2',
      nombreMateria: 'Ingles II',
      presidente_id: 'doc-2',
    }

    expect(obtenerTitularMesa(mesa)).toBe('doc-2')
    expect(validateMesa(mesa, { docentes })).toMatchObject({
      valid: true,
      errors: [],
    })
  })

  it('mesa sin titular devuelve error critico', () => {
    const result = validateMesa({
      id: 'mesa-3',
      carrera: 'Profesorado de Ingles',
      materia: 'ING3',
      nombreMateria: 'Ingles III',
    }, { docentes })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_REQUIRED',
        severity: 'critical',
      }),
    ])
  })

  it('mesa con titular A designar devuelve error critico', () => {
    const result = validateMesa({
      id: 'mesa-4',
      carrera: 'Profesorado de Ingles',
      materia: 'ING4',
      nombreMateria: 'Ingles IV',
      profesorTitular: 'A designar',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_A_DESIGNAR',
        severity: 'critical',
      }),
    ])
  })

  it('mesa con titular inexistente en docentes devuelve error critico', () => {
    const result = validateMesa({
      id: 'mesa-5',
      carrera: 'Profesorado de Ingles',
      materia: 'ING5',
      nombreMateria: 'Ingles V',
      titularId: 'doc-no-existe',
    }, { docentes })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_NOT_FOUND',
        severity: 'critical',
        titularId: 'doc-no-existe',
      }),
    ])
  })

  it('mesa con titular inactivo devuelve error critico si existe campo activo', () => {
    const result = validateMesa({
      id: 'mesa-6',
      carrera: 'Profesorado de Ingles',
      materia: 'ING6',
      nombreMateria: 'Ingles VI',
      titular_id: 'doc-inactivo',
    }, { docentes })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'TITULAR_INACTIVE',
        severity: 'critical',
        titularId: 'doc-inactivo',
      }),
    ])
  })

  it('asignarTitularDesdeMateria asigna titular valido desde la materia', () => {
    const result = asignarTitularDesdeMateria(
      { id: 'mesa-7', carrera: 'Profesorado de Ingles', materia: 'ING7' },
      { materia: 'ING7', titular_id: 'doc-1' },
      docentes,
    )

    expect(result).toMatchObject({
      titular_id: 'doc-1',
      profesorTitular: 'doc-1',
      titularError: null,
    })
  })
})

