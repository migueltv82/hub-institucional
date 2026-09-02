import { describe, expect, it } from 'vitest'
import {
  buildCareerCatalog,
  getCareerValues,
  getPrimaryCareer,
} from './careerCatalog.js'

describe('careerCatalog service', () => {
  it('usa planes de estudio como catalogo canonico cuando esta cargado', () => {
    const careers = buildCareerCatalog({
      alumnos: [{
        carrera: 'Profesorado de Ingles turno noche',
      }],
      planesEstudio: [{
        carrera: 'Profesorado de Ingles',
      }, {
        carrera: 'Tecnicatura Superior en Turismo',
      }],
      horariosDocentes: [{
        carrera: 'Tecnicatura Superior en Turismo sede centro',
      }],
    })

    expect(careers).toEqual([
      'Profesorado de Ingles',
      'Tecnicatura Superior en Turismo',
    ])
  })

  it('usa el nombre de carrera del plan y no expone codigos internos', () => {
    const careers = buildCareerCatalog({
      planesEstudio: [{
        carrera_id: 'ING',
        carrera_nombre: 'PROFESORADO DE INGLES',
        materia_codigo: 'ING1',
      }, {
        carrera_id: 'LAB',
        carrera_nombre: 'TECNICO SUPERIOR EN LABORATORIO',
        materia_codigo: 'LAB1',
      }],
      horariosDocentes: [{
        carrera: 'ING',
      }, {
        carrera: 'LAB',
      }],
    })

    expect(careers).toEqual([
      'PROFESORADO DE INGLES',
      'TECNICO SUPERIOR EN LABORATORIO',
    ])
  })

  it('unifica codigo y nombre oficial cuando distintas filas comparten carrera_id', () => {
    const careers = buildCareerCatalog({
      planesEstudio: [{
        carrera_id: 'GEO',
        carrera: 'GEO',
        materia: 'GEO01',
      }, {
        carrera_id: 'GEO',
        carrera: 'PROFESORADO DE GEOGRAFIA',
        materia: 'GEO02',
      }, {
        carrera_id: 'ING',
        carrera: 'ING',
        materia: 'ING01',
      }, {
        carrera_id: 'ING',
        carrera_nombre: 'PROFESORADO DE INGLES',
        materia: 'ING02',
      }, {
        carrera_id: 'TUR',
        carrera: 'TECNICO SUPER EN TURISMO',
        materia: 'TUR01',
      }],
    })

    expect(careers).toEqual([
      'PROFESORADO DE GEOGRAFIA',
      'PROFESORADO DE INGLES',
      'TECNICO SUPERIOR EN TURISMO',
    ])
  })

  it('resuelve el catalogo institucional aunque el plan solo contenga codigos', () => {
    const careers = buildCareerCatalog({
      planesEstudio: [
        { carrera_id: 'GEO', carrera: 'GEO', materia: 'GEO01' },
        { carrera_id: 'ING', carrera: 'ING', materia: 'ING01' },
        { carrera_id: 'QUI', carrera: 'QUI', materia: 'QUI01' },
        { carrera_id: 'LAB', carrera: 'LAB', materia: 'LAB01' },
        { carrera_id: 'TRA', carrera: 'TRA', materia: 'TRA01' },
        { carrera_id: 'TUR', carrera: 'TUR', materia: 'TUR01' },
      ],
      horariosDocentes: [
        { carrera: 'GEO' },
        { carrera: 'PROFESORADO DE GEOGRAFIA' },
      ],
    })

    expect(careers).toEqual([
      'PROFESORADO DE GEOGRAFIA',
      'PROFESORADO DE INGLES',
      'PROFESORADO DE QUIMICA',
      'TECNICO SUPERIOR EN LABORATORIO',
      'TECNICO SUPERIOR EN TRADUCTORADO',
      'TECNICO SUPERIOR EN TURISMO',
    ])
  })

  it('usa otros datasets como fallback cuando todavia no hay plan de estudios', () => {
    const careers = buildCareerCatalog({
      alumnos: [{
        carrera: 'Profesorado de Ingles',
      }],
      horariosDocentes: [{
        carrera: 'Tecnicatura Superior en Turismo',
      }],
      planesEstudio: [],
    })

    expect(careers).toEqual([
      'Profesorado de Ingles',
      'Tecnicatura Superior en Turismo',
    ])
  })

  it('lee carreras desde perfiles docentes y payloads normalizados', () => {
    expect(getCareerValues({
      carrera: 'Profesorado',
      carreras: ['Tecnicatura'],
      raw: {
        careers: ['Turismo'],
      },
    })).toEqual([
      'Profesorado',
      'Tecnicatura',
      'Turismo',
    ])

    expect(getPrimaryCareer({
      carreras: ['Profesorado', 'Tecnicatura'],
    })).toBe('Profesorado')
  })
})
