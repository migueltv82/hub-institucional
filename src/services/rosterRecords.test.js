import { describe, expect, it } from 'vitest'
import {
  buildStudentRecordsFromSnapshot,
  buildTeacherRecordsFromSnapshot,
  isMissingRosterSchemaError,
  mapStudentRecordToSnapshotRow,
  mapTeacherRecordToSnapshotRow,
} from './rosterRecords.js'

describe('rosterRecords service', () => {
  it('normaliza estudiantes desde alumnos y students sin duplicar email mas carrera', () => {
    const records = buildStudentRecordsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      snapshot: {
        alumnos: [{
          email: 'ANA@example.com',
          nombre: 'Ana',
          apellido: 'Perez',
          carrera: 'Profesorado',
          dni: '30111222',
        }],
        students: [{
          email: 'ana@example.com',
          full_name: 'Ana Perez',
          career: 'Profesorado',
          legajo: 'A-15',
        }, {
          email: 'ana@example.com',
          full_name: 'Ana Perez',
          career: 'Tecnicatura',
        }],
      },
    })

    expect(records).toEqual([
      expect.objectContaining({
        institution_id: 'inst-1',
        workspace_key: 'main',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        career: 'Profesorado',
        legajo: 'A-15',
      }),
      expect.objectContaining({
        email: 'ana@example.com',
        career: 'Tecnicatura',
      }),
    ])
  })

  it('lee el anio del alumno desde anio_cursada (columna real de la planilla de alumnos)', () => {
    const records = buildStudentRecordsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      snapshot: {
        alumnos: [{
          email: 'yamil@example.com',
          nombre: 'Yamil',
          apellido: 'Abdelhamid Campos',
          carrera: 'PROFESORADO DE INGLES',
          dni: '45963378',
          anio_cursada: '1',
        }],
      },
    })

    expect(records[0]).toEqual(expect.objectContaining({
      academic_year: '1',
    }))
  })

  it('construye una identidad tecnica estable cuando el alumno no tiene email', () => {
    const records = buildStudentRecordsFromSnapshot({
      institutionId: 'inst-1',
      snapshot: { alumnos: [{ alumno_id: '2027-15', nombre: 'Nora', carrera: 'Turismo' }] },
    })

    expect(records[0]).toMatchObject({ email: '2027-15@alumnos.local', full_name: 'Nora' })
  })

  it('normaliza docentes y calcula el login tecnico desde el dni', () => {
    const records = buildTeacherRecordsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      snapshot: {
        docentes: [{
          nombre: 'Ana',
          apellido: 'Diaz',
          full_name: 'Ana Diaz',
          dni: '30111222',
          telefono: '3815551234',
        }],
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'Ingles I',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
        }],
      },
    })

    expect(records).toEqual([
      expect.objectContaining({
        institution_id: 'inst-1',
        workspace_key: 'main',
        full_name: 'Ana Diaz',
        dni: '30111222',
        login_email: '30111222@docentes.inst-1.local',
        phone: '3815551234',
        raw_payload: expect.objectContaining({
          careers: ['Profesorado'],
        }),
      }),
    ])
  })

  it('preserva carreras manuales del docente aunque todavia no tenga horarios', () => {
    const records = buildTeacherRecordsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      snapshot: {
        docentes: [{
          nombre: 'Susana',
          apellido: 'Aguero',
          full_name: 'Susana Aguero',
          dni: '18203460',
          carreras: ['Tecnicatura Superior en Turismo'],
        }],
        horariosDocentes: [],
      },
    })

    expect(records).toEqual([
      expect.objectContaining({
        full_name: 'Susana Aguero',
        dni: '18203460',
        raw_payload: expect.objectContaining({
          carrera: 'Tecnicatura Superior en Turismo',
          careers: ['Tecnicatura Superior en Turismo'],
          carreras: ['Tecnicatura Superior en Turismo'],
        }),
      }),
    ])
  })

  it('ignora docentes que solo existen en horarios docentes', () => {
    const records = buildTeacherRecordsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      snapshot: {
        docentes: [{
          nombre: 'Ana',
          apellido: 'Diaz',
          full_name: 'Ana Diaz',
          dni: '30111222',
        }],
        horariosDocentes: [{
          profesor: 'Ana Diaz',
          carrera: 'Profesorado',
          materia: 'Ingles I',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
        }, {
          profesor: 'Pedro Gomez',
          dni: '30999888',
          carrera: 'Profesorado',
          materia: 'Historia I',
          dia: 'Martes',
          inicio: '10:00',
          fin: '12:00',
        }],
      },
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toEqual(expect.objectContaining({
      full_name: 'Ana Diaz',
      dni: '30111222',
    }))
  })

  it('mapea registros a filas compatibles con los snapshots', () => {
    expect(mapStudentRecordToSnapshotRow({
      id: 'student-record-1',
      email: 'ana@example.com',
      first_name: 'Ana',
      last_name: 'Perez',
      full_name: 'Ana Perez',
      career: 'Profesorado',
      academic_year: '2',
      dni: '30111222',
      legajo: 'A-15',
      phone: '3815551234',
      status: 'activo',
    })).toEqual({
      record_id: 'student-record-1',
      email: 'ana@example.com',
      nombre: 'Ana',
      apellido: 'Perez',
      full_name: 'Ana Perez',
      carrera: 'Profesorado',
      anio: '2',
      dni: '30111222',
      legajo: 'A-15',
      telefono: '3815551234',
      estado: 'activo',
      raw: null,
    })

    expect(mapTeacherRecordToSnapshotRow({
      id: 'teacher-record-1',
      login_email: '30111222@docentes.inst-1.local',
      first_name: 'Ana',
      last_name: 'Diaz',
      full_name: 'Ana Diaz',
      dni: '30111222',
      phone: '3815551234',
      status: 'activo',
      raw_payload: {
        careers: ['Profesorado'],
      },
    })).toEqual({
      record_id: 'teacher-record-1',
      email: '30111222@docentes.inst-1.local',
      nombre: 'Ana',
      apellido: 'Diaz',
      full_name: 'Ana Diaz',
      dni: '30111222',
      telefono: '3815551234',
      carrera: 'Profesorado',
      carreras: ['Profesorado'],
      estado: 'activo',
      raw: {
        careers: ['Profesorado'],
      },
    })
  })

  it('detecta errores de esquema faltante para no romper el fallback', () => {
    expect(isMissingRosterSchemaError({
      code: '42P01',
      message: 'relation "public.student_records" does not exist',
    })).toBe(true)

    expect(isMissingRosterSchemaError({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    })).toBe(false)
  })
})
