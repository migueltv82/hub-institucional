import { describe, expect, it } from 'vitest'
import { pickDraftDateForSubject } from './planDraftScheduleDates.js'

function fecha(iso, diaSemana) {
  return { fecha: iso, diaSemana, disponible: true, llamado: 'PRIMER_LLAMADO' }
}

const CALL_DATES = [
  fecha('2026-07-30', 'jueves'),
  fecha('2026-07-31', 'viernes'),
  fecha('2026-08-03', 'lunes'),
  fecha('2026-08-04', 'martes'),
]

describe('pickDraftDateForSubject', () => {
  it('elige el primer dia en que el titular asiste', () => {
    const titular = { dia: ['lunes', 'martes'] }

    const result = pickDraftDateForSubject({ callDates: CALL_DATES, titular })

    expect(result.fecha.fecha).toBe('2026-08-03')
  })

  it('respeta que el titular solo asista un dia de la semana', () => {
    const titular = { diasAsistencia: ['viernes'] }

    const result = pickDraftDateForSubject({ callDates: CALL_DATES, titular })

    expect(result.fecha.fecha).toBe('2026-07-31')
  })

  it('cae al round-robin cuando el titular no tiene datos de disponibilidad cargados', () => {
    const titular = {}

    const withoutTitular = pickDraftDateForSubject({ callDates: CALL_DATES, titular: null, subjectIndex: 1, callIndex: 0 })
    const withEmptyTitular = pickDraftDateForSubject({ callDates: CALL_DATES, titular, subjectIndex: 1, callIndex: 0 })

    expect(withoutTitular.dateIndex).toBe(1)
    expect(withoutTitular.fecha.fecha).toBe('2026-07-31')
    expect(withEmptyTitular).toEqual(withoutTitular)
  })

  it('cae al round-robin cuando el titular tiene datos pero ninguna fecha del llamado le sirve', () => {
    const titular = { dia: ['sabado'] }

    const result = pickDraftDateForSubject({ callDates: CALL_DATES, titular, subjectIndex: 2, callIndex: 0 })

    expect(result.dateIndex).toBe(2)
    expect(result.fecha.fecha).toBe('2026-08-03')
  })

  it('entre varios dias disponibles del titular, prioriza el que tiene menos mesas cargadas en la corrida', () => {
    const titular = { dia: ['jueves', 'viernes', 'lunes'] }
    const dateLoad = new Map([
      ['2026-07-30', 3],
      ['2026-07-31', 0],
      ['2026-08-03', 1],
    ])

    const result = pickDraftDateForSubject({ callDates: CALL_DATES, titular, dateLoad })

    expect(result.fecha.fecha).toBe('2026-07-31')
  })

  it('en empate de carga, prioriza la fecha mas temprana entre las disponibles del titular', () => {
    const titular = { dia: ['jueves', 'lunes'] }
    const dateLoad = new Map([
      ['2026-07-30', 2],
      ['2026-08-03', 2],
    ])

    const result = pickDraftDateForSubject({ callDates: CALL_DATES, titular, dateLoad })

    expect(result.fecha.fecha).toBe('2026-07-30')
  })

  it('devuelve dateIndex -1 cuando no hay fechas de llamado', () => {
    const result = pickDraftDateForSubject({ callDates: [], titular: { dia: ['lunes'] } })

    expect(result.dateIndex).toBe(-1)
    expect(result.fecha).toBeUndefined()
  })
})
