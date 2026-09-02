import { describe, expect, it } from 'vitest'
import { getTeachersFromProfiles } from './teacherAccess.js'

describe('teacherAccess service', () => {
  it('arma la lista de docentes desde la planilla y la enriquece con materias', () => {
    const teachers = getTeachersFromProfiles(
      [{
        nombre: 'Ana',
        apellido: 'Diaz',
        full_name: 'Ana Diaz',
        dni: '30111222',
        telefono: '3815551234',
      }],
      [{
        profesor: 'Ana Diaz',
        dni: '30111222',
        carrera: 'Profesorado',
        materia: 'Ingles I',
      }, {
        profesor: 'Ana Diaz',
        carrera: 'Profesorado',
        materia: 'Ingles II',
      }, {
        profesor: 'Pedro Gomez',
        dni: '30999888',
        carrera: 'Profesorado',
        materia: 'Historia I',
      }],
    )

    expect(teachers).toEqual([
      expect.objectContaining({
        nombre: 'Ana Diaz',
        dni: '30111222',
        telefono: '3815551234',
        carreras: ['Profesorado'],
        materias: ['Ingles I', 'Ingles II'],
      }),
    ])
  })

  it('conserva carreras manuales del perfil docente aunque no tenga horarios', () => {
    const teachers = getTeachersFromProfiles(
      [{
        nombre: 'Susana',
        apellido: 'Aguero',
        full_name: 'Susana Aguero',
        dni: '18203460',
        carreras: ['Tecnicatura Superior en Turismo'],
      }],
      [],
    )

    expect(teachers).toEqual([
      expect.objectContaining({
        nombre: 'Susana Aguero',
        dni: '18203460',
        carreras: ['Tecnicatura Superior en Turismo'],
        materias: [],
      }),
    ])
  })

  it('lee datos completos de la plantilla v2 y cruza materias por docente_id', () => {
    const teachers = getTeachersFromProfiles(
      [{
        docente_id: 'doc-1',
        apellido: 'Aguero',
        nombre: 'Susana',
        dni_docente: '18203460',
        email: 'susana.aguero@example.edu',
        telefono: '3815550000',
        estado_docente: 'ACTIVO',
        horas_catedra: '8',
      }],
      [{
        docente_id: 'doc-1',
        carrera: 'Tecnicatura Superior en Laboratorio',
        materia_codigo: 'LAB24-QUIM1',
        materia_nombre: 'Quimica General',
        rol_en_materia: 'TITULAR',
      }],
    )

    expect(teachers).toEqual([
      expect.objectContaining({
        id: 'doc-1',
        nombre: 'Aguero Susana',
        dni: '18203460',
        email: 'susana.aguero@example.edu',
        telefono: '3815550000',
        estado: 'ACTIVO',
        horasCatedra: 8,
        carreras: ['Tecnicatura Superior en Laboratorio'],
        materias: ['Quimica General'],
      }),
    ])
  })

  it('cruza titularidades de Supabase por teacher_record_id aunque no tengan horario docente', () => {
    const teachers = getTeachersFromProfiles(
      [{
        id: 'teacher-row-1',
        full_name: 'Ana Diaz',
        dni: '30111222',
      }],
      [{
        teacher_record_id: 'teacher-row-1',
        teacher_id: 'auth-user-1',
        carrera: 'Tecnicatura Superior en Laboratorio',
        subject_id: 'LAB05',
        materia_nombre: 'Quimica General',
        role: 'titular',
      }],
    )

    expect(teachers).toEqual([
      expect.objectContaining({
        id: 'teacher-row-1',
        nombre: 'Ana Diaz',
        carreras: ['Tecnicatura Superior en Laboratorio'],
        materias: ['Quimica General'],
      }),
    ])
  })

  it('no devuelve docentes si solo hay horarios y no hay planilla de docentes', () => {
    const teachers = getTeachersFromProfiles([], [{
      profesor: 'Ana Diaz',
      dni: '30111222',
      materia: 'Ingles I',
    }])

    expect(teachers).toEqual([])
  })
})
