import { describe, expect, it } from 'vitest'
import { parseDocenteMateriaRows } from '../comparison/parseDocenteMateriaRows.js'
import { buildDocenteMateriaCandidateTemplate } from './buildDocenteMateriaCandidateTemplate.js'

function snapshot(overrides = {}) {
  return {
    docentes: [
      { full_name: 'Docente Uno', dni: '111' },
      { full_name: 'Docente Dos', dni: '222' },
      { full_name: 'Docente Tres', dni: '333' },
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
        materia: 'SINH',
        nombreMateria: 'Materia sin horario',
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
        materia: 'PRA',
        nombreMateria: 'Practica Profesional Docente III',
        anio: '3',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'DISC3',
        nombreMateria: 'Practicas Discursivas III',
        anio: '3',
      },
    ],
    horariosDocentes: [
      {
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
        profesor: 'Docente Uno',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'MULTI',
        nombreMateria: 'Lengua Inglesa II',
        profesor: 'Docente Uno',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'MULTI',
        nombreMateria: 'Lengua Inglesa II',
        profesor: 'Docente Dos',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'PRA',
        nombreMateria: 'Practica Profesional Docente III',
        profesor: 'Docente Uno',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'PRA',
        nombreMateria: 'Practica Profesional Docente III',
        profesor: 'Docente Dos',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'DISC3',
        nombreMateria: 'Practicas Discursivas III',
        profesor: 'Docente Dos',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'DISC3',
        nombreMateria: 'Practicas Discursivas III',
        profesor: 'Docente Tres',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'ORF',
        nombreMateria: 'Horario huerfano',
        profesor: 'Docente Uno',
      },
    ],
    ...overrides,
  }
}

function rowsByMateria(result, materiaCodigo) {
  return result.rows.filter((row) => row.materia_codigo === materiaCodigo)
}

describe('buildDocenteMateriaCandidateTemplate', () => {
  it('genera titular inferido con unico docente', () => {
    const result = buildDocenteMateriaCandidateTemplate(snapshot())
    const rows = rowsByMateria(result, 'ING1')

    expect(rows).toEqual([
      expect.objectContaining({
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
        requiere_mesa: 'SI',
        origen: 'HORARIOS_DOCENTES',
        nivel_confianza: 'ALTA',
        requiere_revision: 'NO',
        motivo_revision: '',
      }),
    ])
    expect(result.summary.titularesInferidosAltaConfianza).toBe(1)
  })

  it('materia sin horario queda requiere_mesa NO', () => {
    const result = buildDocenteMateriaCandidateTemplate(snapshot())
    const rows = rowsByMateria(result, 'SINH')

    expect(rows).toEqual([
      expect.objectContaining({
        docente: '',
        rol_en_materia: '',
        estado_asignacion: '',
        requiere_mesa: 'NO',
        origen: 'PLAN_ESTUDIO',
        motivo_revision: 'SIN_HORARIO_NO_REQUERIDA',
      }),
    ])
    expect(result.summary.materiasSinHorarioNoRequeridas).toBe(1)
  })

  it('materia sin horario no produce error bloqueante por docente vacio', () => {
    const result = buildDocenteMateriaCandidateTemplate(snapshot())

    expect(result.errors).toEqual([])
    expect(result.summary.parserErrors).toBe(0)
  })

  it('materia no practica con dos docentes requiere revision', () => {
    const result = buildDocenteMateriaCandidateTemplate(snapshot())
    const rows = rowsByMateria(result, 'MULTI')

    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.requiere_revision === 'SI')).toBe(true)
    expect(rows.every((row) => row.motivo_revision === 'MULTIDOCENTE_NO_PRACTICA')).toBe(true)
    expect(result.summary.materiasMultidocenteNoPractica).toBe(2)
  })

  it('practica profesional multidocente requiere revision especifica', () => {
    const result = buildDocenteMateriaCandidateTemplate(snapshot())
    const rows = rowsByMateria(result, 'PRA')

    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.motivo_revision === 'PRACTICA_PROFESIONAL_MULTIDOCENTE')).toBe(true)
    expect(result.summary.practicasProfesionalesMultidocente).toBe(1)
  })

  it('Practicas Discursivas III/IV no se clasifican como practica profesional', () => {
    const result = buildDocenteMateriaCandidateTemplate(snapshot())
    const rows = rowsByMateria(result, 'DISC3')

    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.motivo_revision === 'MULTIDOCENTE_NO_PRACTICA')).toBe(true)
    expect(result.summary.practicasDiscursivasDetectadas).toBe(1)
  })

  it('horarios huerfanos van a warnings y summary sin nombres completos', () => {
    const result = buildDocenteMateriaCandidateTemplate(snapshot())

    expect(result.summary.horariosHuerfanos).toBe(1)
    expect(result.orphanHorarios).toEqual([
      expect.objectContaining({
        materia: 'horario huerfano',
        docenteAnonId: expect.stringMatching(/^doc-/),
      }),
    ])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'HORARIO_HUERFANO',
        docenteAnonId: expect.stringMatching(/^doc-/),
      }),
    ]))
    expect(JSON.stringify(result.orphanHorarios)).not.toContain('Docente Uno')
  })

  it('la salida puede ser procesada por parseDocenteMateriaRows', () => {
    const result = buildDocenteMateriaCandidateTemplate(snapshot())
    const parsed = parseDocenteMateriaRows(result.rows, {
      allowEmptyDocenteWhenNoRequiereMesa: true,
    })

    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toHaveLength(result.rows.length)
  })
})
