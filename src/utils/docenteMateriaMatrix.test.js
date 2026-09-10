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

  it('toma automaticamente como titular al docente que figura en horarios', () => {
    const diagnosis = buildDocenteMateriaTribunalDiagnosis({
      planesEstudio: [{
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombre: 'Gramatica I',
      }],
      docenteMateria: [],
      horariosDocentes: [{
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombreMateria: 'Gramatica I',
        docente: 'Ana Diaz',
        docenteId: 'D1',
      }],
    })

    expect(diagnosis.summary.sinTitular + diagnosis.summary.sinTitularYVocales).toBe(0)
    expect(diagnosis.summary.titularesAutomaticosDesdeHorarios).toBe(1)
    expect(diagnosis.subjects[0].titulares).toEqual([
      expect.objectContaining({
        docente: 'Ana Diaz',
        docenteKey: 'd1',
        rolEnMateria: 'TITULAR',
      }),
    ])
  })

  it('deduplica bloques de horario del mismo docente para la misma materia', () => {
    const diagnosis = buildDocenteMateriaTribunalDiagnosis({
      planesEstudio: [{
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombre: 'Gramatica I',
      }],
      horariosDocentes: [
        { carrera: 'Profesorado de Ingles', materia: 'ING1', docente: 'Ana Diaz', docenteId: 'D1', dia: 'lunes' },
        { carrera: 'Profesorado de Ingles', materia: 'ING1', docente: 'Ana Diaz', docenteId: 'D1', dia: 'martes' },
      ],
    })

    expect(diagnosis.subjects[0].titulares).toHaveLength(1)
    expect(diagnosis.summary.titularesAutomaticosDesdeHorarios).toBe(1)
  })

  it('acepta co-titulares por horario solo en practicas profesionales de profesorados', () => {
    const diagnosis = buildDocenteMateriaTribunalDiagnosis({
      planesEstudio: [{
        carrera: 'Profesorado de Ingles',
        materia: 'PRA1',
        nombre: 'Practica Profesional Docente I',
      }],
      horariosDocentes: [
        { carrera: 'Profesorado de Ingles', materia: 'PRA1', nombreMateria: 'Practica Profesional Docente I', docente: 'Ana Diaz', docenteId: 'D1' },
        { carrera: 'Profesorado de Ingles', materia: 'PRA1', nombreMateria: 'Practica Profesional Docente I', docente: 'Luis Gomez', docenteId: 'D2' },
      ],
    })

    expect(diagnosis.subjects[0].titulares).toHaveLength(2)
    expect(diagnosis.summary.titularesAutomaticosDesdeHorarios).toBe(2)
  })

  it('no asume co-titularidad por horario en materias comunes', () => {
    const diagnosis = buildDocenteMateriaTribunalDiagnosis({
      planesEstudio: [{
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombre: 'Gramatica I',
      }],
      horariosDocentes: [
        { carrera: 'Profesorado de Ingles', materia: 'ING1', nombreMateria: 'Gramatica I', docente: 'Ana Diaz', docenteId: 'D1' },
        { carrera: 'Profesorado de Ingles', materia: 'ING1', nombreMateria: 'Gramatica I', docente: 'Luis Gomez', docenteId: 'D2' },
      ],
    })

    expect(diagnosis.subjects[0].titulares).toHaveLength(0)
    expect(diagnosis.subjects[0].status).toBe('SIN_TITULAR_Y_VOCALES')
    expect(diagnosis.summary.titularesAutomaticosDesdeHorarios).toBe(0)
  })
})
