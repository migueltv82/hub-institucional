import { describe, expect, it } from 'vitest'
import { teacherHasAttendanceOnDate, teacherIsAvailableOnDate, teacherIsBlockedOnDate } from './availability.js'

// 2026-08-03 es lunes.
const MONDAY = '2026-08-03'

describe('teacherHasAttendanceOnDate', () => {
  it('reconoce disponibilidad cargada como fechasDisponibles (ISO), no solo dia de semana', () => {
    const docente = { fechasDisponibles: ['2026-08-03'] }
    expect(teacherHasAttendanceOnDate(docente, MONDAY)).toBe(true)
  })

  it('no marca disponible una fecha ISO distinta a la cargada en fechasDisponibles', () => {
    const docente = { fechasDisponibles: ['2026-08-04'] }
    expect(teacherHasAttendanceOnDate(docente, MONDAY)).toBe(false)
  })

  it('sigue reconociendo disponibilidad cargada por nombre de dia de semana', () => {
    const docente = { diasAsistencia: ['lunes'] }
    expect(teacherHasAttendanceOnDate(docente, MONDAY)).toBe(true)
  })

  it('reconoce entradas objeto con fecha explicita dentro de diasDisponibles', () => {
    const docente = { diasDisponibles: [{ fecha: '2026-08-03' }] }
    expect(teacherHasAttendanceOnDate(docente, MONDAY)).toBe(true)
  })

  it('devuelve false sin ninguna fuente de disponibilidad cargada', () => {
    expect(teacherHasAttendanceOnDate({}, MONDAY)).toBe(false)
  })
})

describe('teacherIsAvailableOnDate', () => {
  it('devuelve false si la fecha esta bloqueada aunque figure en fechasDisponibles', () => {
    const docente = { fechasDisponibles: ['2026-08-03'], bloqueos: ['2026-08-03'] }
    expect(teacherIsBlockedOnDate(docente, MONDAY)).toBe(true)
    expect(teacherIsAvailableOnDate(docente, MONDAY)).toBe(false)
  })

  it('devuelve true cuando fechasDisponibles matchea y no hay bloqueo', () => {
    const docente = { fechasDisponibles: ['2026-08-03'] }
    expect(teacherIsAvailableOnDate(docente, MONDAY)).toBe(true)
  })
})
