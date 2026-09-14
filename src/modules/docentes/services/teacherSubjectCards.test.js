import { describe, expect, it } from 'vitest'
import {
  mergeSubjectGroupsWithRosters,
  mergeSubjectsWithRosters,
  mergeTeacherSubjects,
} from './teacherSubjectCards.js'

describe('teacherSubjectCards', () => {
  it('fusiona una asignacion generica CARRERA con la materia real que tiene horarios', () => {
    const result = mergeTeacherSubjects({
      subjectGroups: [{
        key: 'profesorado::ing06',
        career: 'PROFESORADO DE INGLES',
        code: 'ING06',
        name: 'FONETICA Y FONOLOGIA INGLESA I',
        year: '1',
        schedules: [
          { dia: 'JUEVES', inicio: '19:40', fin: '21:10' },
          { dia: 'MIERCOLES', inicio: '19:40', fin: '21:10' },
        ],
        students: [],
      }],
      assignedSubjects: [{
        id: 'assignment-1',
        subjectId: 'ING06',
        programId: 'CARRERA',
        nombre: 'FONETICA Y FONOLOGIA INGLESA I',
        carrera: 'CARRERA',
        anio: '1',
      }],
    })

    expect(result).toEqual([
      expect.objectContaining({
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        carrera: 'PROFESORADO DE INGLES',
        schedules: [
          expect.objectContaining({ dia: 'JUEVES' }),
          expect.objectContaining({ dia: 'MIERCOLES' }),
        ],
      }),
    ])
  })

  it('no fusiona dos carreras reales distintas aunque compartan codigo de materia', () => {
    const result = mergeTeacherSubjects({
      subjectGroups: [{
        key: 'profesorado::ing06',
        career: 'PROFESORADO DE INGLES',
        code: 'ING06',
        name: 'FONETICA Y FONOLOGIA INGLESA I',
        schedules: [{ dia: 'JUEVES' }],
        students: [],
      }, {
        key: 'traductorado::ing06',
        career: 'TECNICO SUP EN TRADUCTORADO',
        code: 'ING06',
        name: 'FONETICA Y FONOLOGIA INGLESA I',
        schedules: [{ dia: 'VIERNES' }],
        students: [],
      }],
      assignedSubjects: [],
    })

    expect(result).toHaveLength(2)
  })

  it('cruza las tarjetas con las inscripciones reales de alumnos', () => {
    const subjects = [
      {
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        nombre: 'FONETICA Y FONOLOGIA INGLESA I',
        carrera: 'PROFESORADO DE INGLES',
        students: [],
        studentCount: 0,
      },
      {
        subjectId: 'ING16',
        programId: 'PROFESORADO DE INGLES',
        nombre: 'FONETICA Y FONOLOGIA INGLESA II',
        carrera: 'PROFESORADO DE INGLES',
        students: [],
        studentCount: 0,
      },
    ]
    const rosters = [{
      enrollmentId: 'enroll-1',
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
      studentId: 'student-yamil',
      studentRecordId: 'record-yamil',
      fullName: 'Yamil Abdelamhind Campos',
      dni: '45963378',
      email: 'yamil@example.com',
    }]

    const result = mergeSubjectsWithRosters(subjects, rosters)

    expect(result).toEqual([
      expect.objectContaining({
        subjectId: 'ING06',
        studentCount: 1,
        students: [expect.objectContaining({ full_name: 'Yamil Abdelamhind Campos' })],
      }),
      expect.objectContaining({
        subjectId: 'ING16',
        studentCount: 0,
        students: [],
      }),
    ])
  })

  it('fusiona el alumno del padron y del roster aunque tengan ids tecnicos distintos', () => {
    const result = mergeSubjectsWithRosters([{
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
      nombre: 'FONETICA Y FONOLOGIA INGLESA I',
      carrera: 'PROFESORADO DE INGLES',
      students: [{
        id: 'record-yamil',
        record_id: 'record-yamil',
        full_name: 'Yamil Omar Abdelhamid Campos',
        dni: '45963378',
        anio: '1',
      }],
    }], [{
      enrollmentId: 'enroll-yamil',
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
      studentId: 'auth-yamil',
      studentRecordId: '',
      fullName: 'Yamil Omar Abdelhamid Campos',
      dni: '45963378',
    }])

    expect(result[0].studentCount).toBe(1)
    expect(result[0].students).toEqual([
      expect.objectContaining({
        record_id: 'record-yamil',
        student_id: 'auth-yamil',
        dni: '45963378',
        anio: '1',
      }),
    ])
  })

  it('cruza tarjetas con inscripciones que vienen con subject_id compuesto y carrera slug', () => {
    const result = mergeSubjectsWithRosters([{
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
      nombre: 'FONETICA Y FONOLOGIA INGLESA I',
      carrera: 'PROFESORADO DE INGLES',
      students: [],
      studentCount: 0,
    }], [{
      enrollmentId: 'enroll-legacy-1',
      subjectId: 'profesorado-de-ingles:ing06',
      programId: 'profesorado-de-ingles',
      studentId: 'student-yamil',
      studentRecordId: 'record-yamil',
      fullName: 'Yamil Abdelamhind Campos',
    }])

    expect(result).toEqual([
      expect.objectContaining({
        subjectId: 'ING06',
        studentCount: 1,
        students: [expect.objectContaining({ full_name: 'Yamil Abdelamhind Campos' })],
      }),
    ])
  })

  it('fusiona variantes ING06 e INGO6 de Fonetica I', () => {
    const result = mergeTeacherSubjects({
      subjectGroups: [{
        key: 'profesorado::ing06',
        career: 'PROFESORADO DE INGLES',
        code: 'ING06',
        name: 'FONETICA Y FONOLOGIA INGLESA I',
        schedules: [{ dia: 'JUEVES' }],
        students: [],
      }],
      assignedSubjects: [{
        id: 'assignment-legacy-code',
        subjectId: 'INGO6',
        programId: 'CARRERA',
        nombre: 'FONETICA Y FONOLOGIA INGLESA I',
        carrera: 'CARRERA',
      }],
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(expect.objectContaining({
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
    }))
  })

  it('no crea tarjetas desde asignaciones relacionales que no aparecen en los grupos filtrados del docente', () => {
    const result = mergeTeacherSubjects({
      includeAssignedOnly: false,
      subjectGroups: [{
        key: 'profesorado::ing06',
        career: 'PROFESORADO DE INGLES',
        code: 'ING06',
        name: 'FONETICA Y FONOLOGIA INGLESA I',
        schedules: [{ dia: 'JUEVES' }],
        students: [],
      }],
      assignedSubjects: [{
        id: 'assignment-real',
        subjectId: 'INGO6',
        programId: 'CARRERA',
        nombre: 'FONETICA Y FONOLOGIA INGLESA I',
        carrera: 'CARRERA',
      }, {
        id: 'assignment-extra',
        subjectId: 'ING99',
        programId: 'PROFESORADO DE INGLES',
        nombre: 'MATERIA DE OTRO DOCENTE',
        carrera: 'PROFESORADO DE INGLES',
      }],
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(expect.objectContaining({
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
      schedules: [expect.objectContaining({ dia: 'JUEVES' })],
    }))
  })

  it('cruza los grupos del dashboard con las inscripciones reales', () => {
    const result = mergeSubjectGroupsWithRosters([
      {
        key: 'profesorado::ing06',
        career: 'PROFESORADO DE INGLES',
        code: 'ING06',
        name: 'FONETICA Y FONOLOGIA INGLESA I',
        schedules: [],
        students: [],
        source: 'none',
      },
    ], [{
      enrollmentId: 'enroll-1',
      subjectId: 'ING06',
      programId: 'PROFESORADO DE INGLES',
      studentId: 'student-yamil',
      studentRecordId: 'record-yamil',
      fullName: 'Yamil Abdelamhind Campos',
    }])

    expect(result).toEqual([
      expect.objectContaining({
        code: 'ING06',
        source: 'relational',
        students: [expect.objectContaining({ full_name: 'Yamil Abdelamhind Campos' })],
      }),
    ])
  })

  it('un roster autoritativo vacio no recupera alumnos historicos del snapshot', () => {
    const result = mergeSubjectGroupsWithRosters([{
      key: 'profesorado::ing06',
      career: 'PROFESORADO DE INGLES',
      code: 'ING06',
      name: 'FONETICA Y FONOLOGIA INGLESA I',
      students: [{
        id: 'student-yamil',
        full_name: 'Yamil Omar Abdelhamid Campos',
        dni: '45963378',
        anio: '1',
      }],
      source: 'academic',
    }], [], { authoritative: true })

    expect(result).toEqual([
      expect.objectContaining({
        code: 'ING06',
        students: [],
        source: 'relational',
      }),
    ])
  })

  it('deduplica tambien los grupos usados por alumnos por materia', () => {
    const result = mergeSubjectGroupsWithRosters([
      {
        key: 'profesorado::ing16',
        career: 'PROFESORADO DE INGLES',
        code: 'ING16',
        name: 'FONETICA Y FONOLOGIA INGLESA II',
        schedules: [{ dia: 'LUNES', inicio: '20:30', fin: '22:35' }],
        students: [],
        source: 'none',
      },
      {
        key: 'carrera::ing16',
        career: 'CARRERA',
        code: 'ING16',
        name: 'FONETICA Y FONOLOGIA INGLESA II',
        schedules: [],
        students: [],
        source: 'none',
      },
    ], [{
      enrollmentId: 'enroll-1',
      subjectId: 'ING16',
      programId: 'Profesorado de Ingles',
      studentId: 'student-yamil',
      studentRecordId: 'record-yamil',
      fullName: 'Yamil Abdelamhind Campos',
    }])

    expect(result).toHaveLength(1)
    expect(result).toEqual([
      expect.objectContaining({
        career: 'PROFESORADO DE INGLES',
        code: 'ING16',
        schedules: [expect.objectContaining({ dia: 'LUNES' })],
        students: [expect.objectContaining({ full_name: 'Yamil Abdelamhind Campos' })],
      }),
    ])
  })
})
