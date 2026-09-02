import { describe, expect, it } from 'vitest'
import {
  canAssignVocalByAffinity,
  detectarFamiliaMateria,
  docenteTieneAfinidadConMesa,
  FAMILIAS_AFINIDAD,
  getNivelAfinidadDocenteMesa,
  hasAcademicAffinity,
  NIVELES_AFINIDAD,
  normalizeTextoAcademico,
} from '../rules/affinities.js'

describe('examEngine hard rule: vocales con afinidad o idoneidad', () => {
  it('usa la afinidad institucional explicita aun entre carreras distintas', () => {
    const result = getNivelAfinidadDocenteMesa(
      { carrera: 'Profesorado de Quimica', codigosMaterias: ['QUI05'], gruposAfinidad: ['QUIMICA-GENERAL-INORGANICA'] },
      { carrera: 'Tecnico Superior en Laboratorio', materia: 'LAB05', grupo_afin_mesa: 'QUIMICA-GENERAL-INORGANICA', codigos_materias_afines: 'QUI05, QUI06' },
      { requireCareerCompatibility: true },
    )

    expect(result).toMatchObject({
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.ESPECIALIDAD_DECLARADA,
    })
    expect(result.motivo).toContain('plantilla maestra')
  })

  it('no permite cruzar carreras aunque ambas materias sean de Ingles', () => {
    expect(hasAcademicAffinity(
      { carrera: 'Profesorado de Ingles', nombreMateria: 'Lengua Inglesa I' },
      { carrera: 'Traductorado de Ingles', nombreMateria: 'Ingles II' },
      { requireCareerCompatibility: true },
    )).toBe(false)
  })

  it('permite cruzar carreras por compartir Informatica/TIC', () => {
    expect(hasAcademicAffinity(
      { carrera: 'Tecnicatura en Software', nombreMateria: 'TIC aplicada' },
      { carrera: 'Profesorado de Informatica', nombreMateria: 'Informatica educativa' },
      { requireCareerCompatibility: true },
    )).toBe(true)
  })

  it('no detecta TIC falsamente dentro de Didactica, Practica o Problematica', () => {
    expect(hasAcademicAffinity(
      { carrera: 'Profesorado de Historia', nombreMateria: 'Didactica General' },
      { carrera: 'Profesorado de Lengua', nombreMateria: 'Problematica Educativa' },
    )).toBe(false)

    expect(hasAcademicAffinity(
      { carrera: 'Tecnicatura en Turismo', nombreMateria: 'Practica Profesional I' },
      { carrera: 'Profesorado de Lengua', nombreMateria: 'Didactica de la Lengua' },
    )).toBe(false)
  })

  it('permite cruzar practicas entre profesorados', () => {
    expect(hasAcademicAffinity(
      { carrera: 'Profesorado de Ingles', nombreMateria: 'Practica Docente III' },
      { carrera: 'Profesorado de Historia', nombreMateria: 'Practicas de Ensenanza II' },
    )).toBe(true)
  })

  it('permite practicas tecnicas de tecnicaturas solo dentro de la propia carrera tecnica', () => {
    expect(hasAcademicAffinity(
      { carrera: 'Tecnicatura Superior en Turismo', nombreMateria: 'Practica Profesional I' },
      { carrera: 'Tecnicatura Superior en Turismo', nombreMateria: 'Practica Profesional II' },
    )).toBe(true)

    expect(hasAcademicAffinity(
      { carrera: 'Tecnicatura Superior en Turismo', nombreMateria: 'Practica Profesional I' },
      { carrera: 'Tecnicatura Superior en Laboratorio', nombreMateria: 'Practica Profesional II' },
    )).toBe(false)
  })

  it('considera misma carrera aunque una planilla abrevie "superior" como "sup"', () => {
    expect(hasAcademicAffinity(
      { carrera: 'TECNICO SUP EN TURISMO', nombreMateria: 'Informatica Aplicada' },
      { carrera: 'TECNICO SUPERIOR EN TURISMO', nombreMateria: 'Etica y Deontologia Profesional' },
    )).toBe(true)

    expect(hasAcademicAffinity(
      { carreras: ['TECNICO SUP EN TRADUCTORADO'], nombreMateria: 'Relaciones Humanas' },
      { carrera: 'TECNICO SUPERIOR EN TRADUCTORADO', nombreMateria: 'Informatica' },
    )).toBe(true)
  })

  it('rechaza asignar vocal sin afinidad ni idoneidad academica', () => {
    expect(canAssignVocalByAffinity(
      { carrera: 'Profesorado de Historia', nombreMateria: 'Historia Antigua' },
      { carrera: 'Traductorado de Ingles', nombreMateria: 'Quimica aplicada' },
    )).toMatchObject({
      allowed: false,
    })
  })

  it('no deja que la idoneidad explicita saltee el limite entre carreras', () => {
    expect(canAssignVocalByAffinity(
      { carrera: 'Profesorado de Historia', nombreMateria: 'Historia Antigua', idoneidadAcademica: true },
      { carrera: 'Traductorado de Ingles', nombreMateria: 'Quimica aplicada' },
      { requireCareerCompatibility: true },
    )).toMatchObject({
      allowed: false,
    })
  })

  it('nunca propone Quimica de otra carrera para Traductorado', () => {
    expect(getNivelAfinidadDocenteMesa(
      {
        carrera: 'Profesorado de Quimica',
        nombreMateria: 'Quimica General',
        idoneidadAcademica: true,
      },
      {
        carrera: 'Traductorado de Ingles',
        nombreMateria: 'Quimica aplicada a la traduccion',
      },
      { requireCareerCompatibility: true },
    )).toMatchObject({
      afinidadValida: false,
      nivelAfinidad: NIVELES_AFINIDAD.CARRERA_INCOMPATIBLE,
    })
  })

  it('mantiene las excepciones intercarrera para espacios pedagogicos y didacticos', () => {
    expect(hasAcademicAffinity(
      { carrera: 'Profesorado de Historia', nombreMateria: 'Didactica General' },
      { carrera: 'Profesorado de Lengua', nombreMateria: 'Didactica General' },
      { requireCareerCompatibility: true },
    )).toBe(true)
  })

  it('normaliza texto academico sin tildes y con espacios estables', () => {
    expect(normalizeTextoAcademico('Tecnologia de la Informacion')).toBe('tecnologia de la informacion')
  })

  it('detecta variantes de familia Ingles', () => {
    expect(detectarFamiliaMateria({ nombreMateria: 'Lengua Inglesa I' })).toBe(FAMILIAS_AFINIDAD.INGLES)
    expect(detectarFamiliaMateria({ nombreMateria: 'Gramatica Inglesa' })).toBe(FAMILIAS_AFINIDAD.INGLES)
    expect(detectarFamiliaMateria({ nombreMateria: 'Fonetica Inglesa' })).toBe(FAMILIAS_AFINIDAD.INGLES)
    expect(detectarFamiliaMateria({ nombreMateria: 'Practicas Discursivas en Ingles' })).toBe(FAMILIAS_AFINIDAD.INGLES)
  })

  it('detecta variantes de familia Informatica/TIC sin falsos positivos', () => {
    expect(detectarFamiliaMateria({ nombreMateria: 'Tecnologia de la Informacion' })).toBe(FAMILIAS_AFINIDAD.INFORMATICA_TIC)
    expect(detectarFamiliaMateria({ nombreMateria: 'Computacion' })).toBe(FAMILIAS_AFINIDAD.INFORMATICA_TIC)
    expect(detectarFamiliaMateria({ nombreMateria: 'Programacion I' })).toBe(FAMILIAS_AFINIDAD.INFORMATICA_TIC)

    expect(detectarFamiliaMateria({ nombreMateria: 'Didactica General' })).not.toBe(FAMILIAS_AFINIDAD.INFORMATICA_TIC)
    expect(detectarFamiliaMateria({ nombreMateria: 'Practica Docente' })).not.toBe(FAMILIAS_AFINIDAD.INFORMATICA_TIC)
    expect(detectarFamiliaMateria({ nombreMateria: 'Problematica Educativa' })).not.toBe(FAMILIAS_AFINIDAD.INFORMATICA_TIC)
  })

  it('misma carrera es afinidad valida', () => {
    expect(getNivelAfinidadDocenteMesa(
      { carrera: 'Profesorado de Historia', nombreMateria: 'Historia Argentina' },
      { carrera: 'Profesorado de Historia', nombreMateria: 'Historia Antigua' },
      { requireCareerCompatibility: true },
    )).toMatchObject({
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.MISMA_CARRERA,
    })
  })

  it('especialidad declarada del docente es afinidad valida', () => {
    expect(getNivelAfinidadDocenteMesa(
      { id: 'doc-1', especialidades: ['Ingles'] },
      { carrera: 'Traductorado de Ingles', nombreMateria: 'Lengua Inglesa II' },
    )).toMatchObject({
      afinidadValida: true,
      nivelAfinidad: NIVELES_AFINIDAD.ESPECIALIDAD_DECLARADA,
    })

    expect(docenteTieneAfinidadConMesa(
      { id: 'doc-2', especialidad: 'Programacion' },
      { carrera: 'Tecnicatura en Software', nombreMateria: 'Programacion I' },
    )).toBe(true)
  })
})
