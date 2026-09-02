import { describe, expect, it } from 'vitest'
import {
  normalizeStudentDraft,
  normalizeTeacherDraft,
  validateStudentDraft,
  validateTeacherDraft,
} from './rosterDrafts.js'

describe('rosterDrafts service', () => {
  it('normaliza alumnos manuales con email en minusculas y estado por defecto', () => {
    expect(normalizeStudentDraft({
      nombre: 'Ana',
      apellido: 'Perez',
      email: 'ANA@EXAMPLE.COM',
      dni: '30111222',
      carrera: 'Profesorado',
    })).toEqual(expect.objectContaining({
      nombre: 'Ana',
      apellido: 'Perez',
      full_name: 'Ana Perez',
      email: 'ana@example.com',
      estado: 'activo',
      origen: 'manual',
      created_manually: true,
    }))
  })

  it('bloquea alumnos duplicados por email o dni dentro de la misma carrera', () => {
    const result = validateStudentDraft({
      draft: {
        nombre: 'Ana',
        apellido: 'Perez',
        email: 'ana@example.com',
        dni: '30111222',
        carrera: 'Profesorado',
      },
      students: [{
        nombre: 'Ana',
        apellido: 'Perez',
        email: 'ANA@example.com',
        dni: '30111222',
        carrera: 'Profesorado',
      }],
    })

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe un alumno con el mismo email o DNI dentro de esa carrera.',
    })
  })

  it('permite actualizar un alumno existente sin disparar falso duplicado', () => {
    const result = validateStudentDraft({
      currentIdentity: {
        emailCareer: 'ana@example.com::profesorado',
        dniCareer: '30111222::profesorado',
      },
      draft: {
        nombre: 'Ana Maria',
        apellido: 'Perez',
        email: 'ana@example.com',
        dni: '30111222',
        carrera: 'Profesorado',
      },
      students: [{
        nombre: 'Ana',
        apellido: 'Perez',
        email: 'ana@example.com',
        dni: '30111222',
        carrera: 'Profesorado',
      }],
    })

    expect(result).toEqual({
      ok: true,
      student: expect.objectContaining({
        nombre: 'Ana Maria',
        apellido: 'Perez',
        email: 'ana@example.com',
      }),
    })
  })

  it('normaliza docentes manuales con nombre completo y estado por defecto', () => {
    expect(normalizeTeacherDraft({
      nombre: 'Susana',
      apellido: 'Aguero',
      dni: '18203460',
      carreras: ['Tecnicatura Superior en Turismo'],
    })).toEqual(expect.objectContaining({
      nombre: 'Susana',
      apellido: 'Aguero',
      full_name: 'Susana Aguero',
      carrera: 'Tecnicatura Superior en Turismo',
      carreras: ['Tecnicatura Superior en Turismo'],
      estado: 'activo',
      origen: 'manual',
      created_manually: true,
    }))
  })

  it('bloquea docentes duplicados por dni', () => {
    const result = validateTeacherDraft({
      draft: {
        nombre: 'Susana',
        apellido: 'Aguero',
        dni: '18203460',
        carreras: ['Tecnicatura Superior en Turismo'],
      },
      teachers: [{
        nombre: 'Susana',
        apellido: 'Aguero',
        dni: '18203460',
        carreras: ['Tecnicatura Superior en Turismo'],
      }],
    })

    expect(result).toEqual({
      ok: false,
      error: 'Ya existe un docente con ese DNI en el padron.',
    })
  })

  it('permite actualizar un docente existente sin disparar falso duplicado', () => {
    const result = validateTeacherDraft({
      currentIdentity: {
        dni: '18203460',
      },
      draft: {
        nombre: 'Susana',
        apellido: 'Aguero',
        dni: '18203460',
        telefono: '3815551234',
        carreras: ['Tecnicatura Superior en Turismo'],
        estado: 'licencia',
      },
      teachers: [{
        nombre: 'Susana',
        apellido: 'Aguero',
        dni: '18203460',
        carreras: ['Tecnicatura Superior en Turismo'],
      }],
    })

    expect(result).toEqual({
      ok: true,
      teacher: expect.objectContaining({
        dni: '18203460',
        telefono: '3815551234',
        carreras: ['Tecnicatura Superior en Turismo'],
        estado: 'licencia',
      }),
    })
  })

  it('exige al menos una carrera en docentes', () => {
    const result = validateTeacherDraft({
      draft: {
        nombre: 'Susana',
        apellido: 'Aguero',
        dni: '18203460',
      },
      teachers: [],
    })

    expect(result).toEqual({
      ok: false,
      error: 'Selecciona al menos una carrera para el docente.',
    })
  })
})
