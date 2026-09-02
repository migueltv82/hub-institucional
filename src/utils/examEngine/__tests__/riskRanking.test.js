import { describe, expect, it } from 'vitest'
import { buildRiskRanking } from '../diagnostics/riskRanking.js'

describe('examEngine diagnostics: risk ranking', () => {
  it('detecta docente con muchas materias como titular', () => {
    const risks = buildRiskRanking({
      docentes: [
        {
          id: 'doc-1',
          nombre: 'Ana Perez',
          carrera: 'Profesorado de Ingles',
          nombreMateria: 'Lengua Inglesa I',
          diasAsistencia: ['lunes', 'martes', 'miercoles'],
        },
        {
          id: 'doc-2',
          nombre: 'Bruno Diaz',
          carrera: 'Profesorado de Ingles',
          nombreMateria: 'Gramatica Inglesa',
          diasAsistencia: ['lunes', 'martes'],
        },
      ],
      materias: [
        { carrera: 'Profesorado de Ingles', materia: 'ING1', nombreMateria: 'Lengua Inglesa I', titular_id: 'doc-1' },
        { carrera: 'Profesorado de Ingles', materia: 'ING2', nombreMateria: 'Lengua Inglesa II', titular_id: 'doc-1' },
        { carrera: 'Profesorado de Ingles', materia: 'ING3', nombreMateria: 'Gramatica Inglesa', titular_id: 'doc-1' },
      ],
    })

    expect(risks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'DOCENTE_MUCHAS_TITULARIDADES',
        severity: 'MEDIUM',
        entityType: 'DOCENTE',
        entityId: 'doc-1',
      }),
    ]))
  })

  it('detecta materia con pocas opciones de vocales', () => {
    const risks = buildRiskRanking({
      docentes: [
        {
          id: 'doc-titular',
          nombre: 'Ana Titular',
          carrera: 'Tecnicatura en Software',
          nombreMateria: 'Programacion I',
          diasAsistencia: ['lunes', 'martes'],
        },
        {
          id: 'doc-historia',
          nombre: 'Historia',
          carrera: 'Profesorado de Historia',
          nombreMateria: 'Historia Antigua',
          diasAsistencia: ['lunes', 'martes'],
        },
      ],
      materias: [
        {
          carrera: 'Tecnicatura en Software',
          materia: 'PRG1',
          nombreMateria: 'Programacion I',
          titular_id: 'doc-titular',
        },
      ],
    })

    expect(risks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'MATERIA_POCOS_VOCALES_POSIBLES',
        severity: 'HIGH',
        entityType: 'MATERIA',
        entityId: 'tecnicatura en software::prg1',
      }),
    ]))
  })
})
