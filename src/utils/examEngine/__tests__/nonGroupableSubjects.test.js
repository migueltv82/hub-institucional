import { describe, expect, it } from 'vitest'
import { isNonGroupableSubject } from '../normalize/subjects.js'
import { canCompactSubjects } from '../planning/compactMesas.js'
import { validateMesa } from '../validation/validateMesa.js'

describe('examEngine hard rule: Practicas Discursivas III y IV no se agrupan', () => {
  it.each([
    'Practicas Discursivas III',
    'Prácticas Discursivas III',
    'Practicas Discursivas IV',
    'Prácticas Discursivas IV',
  ])('detecta la variante "%s" como no agrupable', (nombreMateria) => {
    expect(isNonGroupableSubject({ nombreMateria })).toBe(true)
  })

  it('rechaza compactar Practicas Discursivas III con otra materia', () => {
    expect(canCompactSubjects([
      { carrera: 'Profesorado de Ingles', materia: 'PD3', nombreMateria: 'Prácticas Discursivas III' },
      { carrera: 'Profesorado de Ingles', materia: 'ING3', nombreMateria: 'Ingles III' },
    ])).toBe(false)
  })

  it('devuelve error critico si una mesa agrupa una materia no agrupable', () => {
    const result = validateMesa({
      profesorTitular: 'Ana Perez',
      materiasAgrupadas: [
        { carrera: 'Profesorado de Ingles', materia: 'PD4', nombreMateria: 'Practicas Discursivas IV' },
        { carrera: 'Profesorado de Ingles', materia: 'ING4', nombreMateria: 'Ingles IV' },
      ],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'NON_GROUPABLE_SUBJECT',
        severity: 'critical',
      }),
    ])
  })
})

