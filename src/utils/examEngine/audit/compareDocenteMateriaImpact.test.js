import { describe, expect, it } from 'vitest'
import { compareDocenteMateriaImpact } from './compareDocenteMateriaImpact.js'

function baseSnapshot() {
  return {
    docentes: [
      { full_name: 'Docente Secreto Uno', dni: '111' },
      { full_name: 'Docente Secreto Dos', dni: '222' },
      { full_name: 'Docente Secreto Tres', dni: '333' },
    ],
    planesEstudio: [
      {
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
        anio: '1',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'ING2',
        nombreMateria: 'Ingles II',
        anio: '1',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'MULTI',
        nombreMateria: 'Lengua Inglesa II',
        anio: '2',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'SINH',
        nombreMateria: 'Materia sin horario',
        anio: '2',
      },
    ],
    horariosDocentes: [
      {
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
        profesor: 'Docente Secreto Uno',
        dia: 'lunes',
        inicio: '18:00',
        fin: '20:00',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'ING2',
        nombreMateria: 'Ingles II',
        profesor: 'Docente Secreto Dos',
        dia: 'martes',
        inicio: '18:00',
        fin: '20:00',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'MULTI',
        nombreMateria: 'Lengua Inglesa II',
        profesor: 'Docente Secreto Uno',
        dia: 'lunes',
        inicio: '18:00',
        fin: '20:00',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'MULTI',
        nombreMateria: 'Lengua Inglesa II',
        profesor: 'Docente Secreto Dos',
        dia: 'martes',
        inicio: '18:00',
        fin: '20:00',
      },
    ],
    correlatividades: [],
    alumnos: [],
    fechaInicio: '2026-07-27',
    fechaFin: '2026-07-31',
    regularCallRanges: {
      first: { start: '2026-07-27', end: '2026-07-31' },
    },
    examType: 'regular',
    generationScope: { respectCorrelativities: true },
  }
}

function docenteMateriaRows() {
  return [
    {
      carrera: 'Profesorado de Ingles',
      materia_codigo: 'ING1',
      materia_nombre: 'Ingles I',
      anio: '1',
      docente: 'Docente Secreto Uno',
      dni_docente: '111',
      rol_en_materia: 'TITULAR',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'SI',
    },
    {
      carrera: 'Profesorado de Ingles',
      materia_codigo: 'MULTI',
      materia_nombre: 'Lengua Inglesa II',
      anio: '2',
      docente: 'Docente Secreto Uno',
      dni_docente: '111',
      rol_en_materia: '',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'SI',
      requiere_revision: 'SI',
      motivo_revision: 'MULTIDOCENTE_NO_PRACTICA',
    },
    {
      carrera: 'Profesorado de Ingles',
      materia_codigo: 'MULTI',
      materia_nombre: 'Lengua Inglesa II',
      anio: '2',
      docente: 'Docente Secreto Dos',
      dni_docente: '222',
      rol_en_materia: '',
      estado_asignacion: 'ACTIVO',
      requiere_mesa: 'SI',
      requiere_revision: 'SI',
      motivo_revision: 'MULTIDOCENTE_NO_PRACTICA',
    },
    {
      carrera: 'Profesorado de Ingles',
      materia_codigo: 'SINH',
      materia_nombre: 'Materia sin horario',
      anio: '2',
      docente: '',
      dni_docente: '',
      rol_en_materia: '',
      estado_asignacion: '',
      requiere_mesa: 'NO',
    },
  ]
}

describe('compareDocenteMateriaImpact', () => {
  it('compara dos snapshots sin mutar el original', () => {
    const snapshot = baseSnapshot()
    const before = JSON.stringify(snapshot)

    compareDocenteMateriaImpact({
      baseSnapshot: snapshot,
      docenteMateriaRows: docenteMateriaRows(),
    })

    expect(JSON.stringify(snapshot)).toBe(before)
    expect(snapshot.docenteMateria).toBeUndefined()
  })

  it('detecta reduccion de titulares inferidos cuando hay docenteMateria', () => {
    const result = compareDocenteMateriaImpact({
      baseSnapshot: baseSnapshot(),
      docenteMateriaRows: docenteMateriaRows(),
    })

    expect(result.withDocenteMateria.titularesInferidos).toBeLessThan(result.withoutDocenteMateria.titularesInferidos)
    expect(result.diff.titularesInferidos).toBeLessThan(0)
    expect(result.interpretation.reduceInferencias).toBe(true)
  })

  it('detecta filas que requieren revision', () => {
    const result = compareDocenteMateriaImpact({
      baseSnapshot: baseSnapshot(),
      docenteMateriaRows: docenteMateriaRows(),
    })

    expect(result.withDocenteMateria.materiasRequierenRevision).toBeGreaterThan(0)
    expect(result.withDocenteMateria.sourceRequiereRevision).toBeGreaterThan(0)
    expect(result.interpretation.aparecenMasCasosRevision).toBe(true)
  })

  it('informa fallback cuando una materia no esta en docenteMateria', () => {
    const result = compareDocenteMateriaImpact({
      baseSnapshot: baseSnapshot(),
      docenteMateriaRows: docenteMateriaRows(),
    })

    expect(result.withDocenteMateria.fallbackHorariosDocentes).toBeGreaterThan(0)
  })

  it('genera diff numerico', () => {
    const result = compareDocenteMateriaImpact({
      baseSnapshot: baseSnapshot(),
      docenteMateriaRows: docenteMateriaRows(),
    })

    expect(result.diff).toMatchObject({
      completionRate: expect.any(Number),
      titularesInferidos: expect.any(Number),
      mesasSinTribunal: expect.any(Number),
      warningCounts: expect.any(Object),
    })
  })

  it('genera interpretacion automatica', () => {
    const result = compareDocenteMateriaImpact({
      baseSnapshot: baseSnapshot(),
      docenteMateriaRows: docenteMateriaRows(),
    })

    expect(result.interpretation.summary.length).toBeGreaterThan(0)
    expect(result.recommendations).toEqual(expect.arrayContaining([
      'Revisar filas con requiere_revision = SI antes de usar docente_materia como fuente institucional.',
      'Definir titular en materias multidocente no practicas.',
    ]))
  })

  it('no rompe si docenteMateriaRows viene vacio', () => {
    const result = compareDocenteMateriaImpact({
      baseSnapshot: baseSnapshot(),
      docenteMateriaRows: [],
    })

    expect(result.parser).toMatchObject({
      rows: 0,
      errors: 0,
    })
    expect(result.withDocenteMateria.totalMesas).toBe(result.withoutDocenteMateria.totalMesas)
  })

  it('no expone nombres completos de docentes en interpretation/recommendations', () => {
    const result = compareDocenteMateriaImpact({
      baseSnapshot: baseSnapshot(),
      docenteMateriaRows: docenteMateriaRows(),
    })
    const safeText = JSON.stringify({
      interpretation: result.interpretation,
      recommendations: result.recommendations,
    })

    expect(safeText).not.toContain('Docente Secreto Uno')
    expect(safeText).not.toContain('Docente Secreto Dos')
    expect(safeText).not.toContain('Docente Secreto Tres')
  })
})
