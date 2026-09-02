import { describe, expect, it } from 'vitest'
import { buildDocenteMateriaTribunalDiagnosis } from './docenteMateriaMatrix.js'

describe('buildDocenteMateriaTribunalDiagnosis', () => {
  it('marca materia completa cuando tiene titular y dos vocales afines distintos', () => {
    const diagnosis = buildDocenteMateriaTribunalDiagnosis({
      planesEstudio: [{
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombre: 'Gramatica I',
      }],
      docenteMateria: [
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          docente: 'Ana Diaz',
          docenteId: 'D1',
          rol_en_materia: 'TITULAR',
        },
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          docente: 'Luis Gomez',
          docenteId: 'D2',
          rol_en_materia: 'VOCAL_AFIN',
        },
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          docente: 'Marta Ruiz',
          docenteId: 'D3',
          rol_en_materia: 'VOCAL_AFIN',
        },
      ],
    })

    expect(diagnosis.summary).toMatchObject({
      totalMaterias: 1,
      completas: 1,
      conObservaciones: 0,
    })
    expect(diagnosis.subjects[0]).toMatchObject({
      status: 'COMPLETA',
      completa: true,
    })
  })

  it('no cuenta al titular como vocal de su propia materia', () => {
    const diagnosis = buildDocenteMateriaTribunalDiagnosis({
      planesEstudio: [{
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombre: 'Gramatica I',
      }],
      docenteMateria: [
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          docente: 'Ana Diaz',
          docenteId: 'D1',
          rol_en_materia: 'TITULAR_Y_VOCAL_AFIN',
        },
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          docente: 'Luis Gomez',
          docenteId: 'D2',
          rol_en_materia: 'VOCAL_AFIN',
        },
      ],
    })

    expect(diagnosis.subjects[0]).toMatchObject({
      status: 'VOCALES_INSUFICIENTES',
    })
    expect(diagnosis.subjects[0].titulares).toHaveLength(1)
    expect(diagnosis.subjects[0].vocales).toHaveLength(1)
  })
})
