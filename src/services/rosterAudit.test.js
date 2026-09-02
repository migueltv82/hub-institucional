import { describe, expect, it } from 'vitest'
import { createRosterAuditReport, getStudentAuditKey, getTeacherAuditKey } from './rosterAudit.js'

describe('rosterAudit service', () => {
  it('calcula alineacion completa cuando snapshot y tablas coinciden', () => {
    const report = createRosterAuditReport({
      source: 'supabase',
      status: 'ready',
      snapshotUpdatedAt: '2026-05-14T13:00:00.000Z',
      snapshot: {
        alumnos: [{
          email: 'ana@example.com',
          nombre: 'Ana',
          apellido: 'Perez',
          carrera: 'Profesorado',
        }],
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
        }],
      },
      actualStudentRows: [{
        id: 'student-record-1',
        email: 'ana@example.com',
        full_name: 'Ana Perez',
        career: 'Profesorado',
      }],
      actualTeacherRows: [{
        id: 'teacher-record-1',
        dni: '30111222',
        full_name: 'Ana Diaz',
      }],
    })

    expect(report.overall).toEqual({
      aligned: true,
      driftCount: 0,
    })
    expect(report.students.aligned).toBe(true)
    expect(report.teachers.aligned).toBe(true)
  })

  it('detecta faltantes y sobrantes por key normalizada', () => {
    const report = createRosterAuditReport({
      source: 'supabase',
      status: 'ready',
      snapshot: {
        alumnos: [{
          email: 'ana@example.com',
          nombre: 'Ana',
          apellido: 'Perez',
          carrera: 'Profesorado',
        }],
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
        }],
      },
      actualStudentRows: [{
        id: 'student-record-2',
        email: 'bruno@example.com',
        full_name: 'Bruno Lopez',
        career: 'Tecnicatura',
      }],
      actualTeacherRows: [],
    })

    expect(report.overall.aligned).toBe(false)
    expect(report.overall.driftCount).toBe(3)
    expect(report.students.missingFromTable).toEqual([
      expect.objectContaining({
        email: 'ana@example.com',
        career: 'Profesorado',
      }),
    ])
    expect(report.students.onlyInTable).toEqual([
      expect.objectContaining({
        email: 'bruno@example.com',
        career: 'Tecnicatura',
      }),
    ])
    expect(report.teachers.missingFromTable).toEqual([
      expect.objectContaining({
        dni: '30111222',
        full_name: 'Ana Diaz',
      }),
    ])
  })

  it('normaliza las claves de comparacion de alumnos y docentes', () => {
    expect(getStudentAuditKey({
      email: 'ANA@example.com',
      career: 'Profesorado de Ingles',
    })).toBe('ana@example.com::profesorado de ingles')

    expect(getTeacherAuditKey({
      dni: '30111222',
      full_name: 'Ana Diaz',
    })).toBe('30111222')
  })
})
