import { describe, expect, it } from 'vitest'
import {
  buildTeacherBlockedDatesByTeacher,
  isTeacherBlockedOnDate,
  validateTeacherBlockedDateDraft,
} from './teacherBlockedDates.js'

describe('teacherBlockedDates', () => {
  const docentes = [{ id: 'teacher-fernandasalinas', nombre: 'Fernanda Salinas' }]

  it('bloquea dia completo y resuelve identidad por nombre', () => {
    const blockedDatesByTeacher = buildTeacherBlockedDatesByTeacher({
      docentes,
      records: [{ id: 'b1', docenteNombre: 'Fernanda Salinas', date: '2026-07-30', scope: 'FULL_DAY', status: 'ACTIVE' }],
    })

    expect(isTeacherBlockedOnDate({
      blockedDatesByTeacher,
      teacherId: 'teacher-fernandasalinas',
      date: '2026-07-30',
      startTime: '18:00',
      endTime: '20:00',
    })).toMatchObject({ blocked: true, code: 'TEACHER_BLOCKED_DATE', scope: 'FULL_DAY' })
  })

  it('detecta solapamiento parcial y permite franjas contiguas', () => {
    const blockedDatesByTeacher = buildTeacherBlockedDatesByTeacher({
      docentes,
      records: [{ docenteNombre: 'Fernanda Salinas', date: '30/07/2026', scope: 'TIME_RANGE', startTime: '18:00', endTime: '20:00' }],
    })

    expect(isTeacherBlockedOnDate({ blockedDatesByTeacher, teacherName: 'Fernanda Salinas', date: '2026-07-30', startTime: '19:00', endTime: '21:00' }).blocked).toBe(true)
    expect(isTeacherBlockedOnDate({ blockedDatesByTeacher, teacherName: 'Fernanda Salinas', date: '2026-07-30', startTime: '20:00', endTime: '22:00' }).blocked).toBe(false)
  })

  it('trata franja incompleta como dia completo e ignora registros inactivos', () => {
    const blockedDatesByTeacher = buildTeacherBlockedDatesByTeacher({
      docentes,
      records: [
        { id: 'active', docenteNombre: 'Fernanda Salinas', date: '2026-08-04', scope: 'TIME_RANGE', startTime: '18:00' },
        { id: 'inactive', docenteNombre: 'Fernanda Salinas', date: '2026-08-07', scope: 'FULL_DAY', status: 'INACTIVE' },
      ],
    })

    expect(blockedDatesByTeacher['teacher-fernandasalinas'][0].scope).toBe('FULL_DAY')
    expect(isTeacherBlockedOnDate({ blockedDatesByTeacher, teacherName: 'Fernanda Salinas', date: '2026-08-07' }).blocked).toBe(false)
  })

  it('valida el contrato administrativo sin conservar campos ajenos', () => {
    expect(validateTeacherBlockedDateDraft({
      docenteNombre: 'Fernanda Salinas',
      date: '2026-07-30',
      scope: 'TIME_RANGE',
      startTime: '18:00',
      endTime: '20:00',
      reason: 'Otra institucion',
      secret: 'no-exponer',
    })).toEqual({
      ok: true,
      value: {
        docenteId: 'teacher-fernandasalinas',
        docenteNombre: 'Fernanda Salinas',
        date: '2026-07-30',
        startTime: '18:00',
        endTime: '20:00',
        scope: 'TIME_RANGE',
        reason: 'Otra institucion',
        source: 'manual_admin',
        status: 'ACTIVE',
      },
    })
  })
})
