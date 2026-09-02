import { describe, expect, it } from 'vitest'
import { getYearCompletionGateCheck } from './yearCompletionGate.js'

const PROGRAM = 'Profesorado de Geografia'

function subject(code, year) {
  return { canonical_subject_id: code, canonical_program_id: PROGRAM, semester: year, name: code }
}

describe('getYearCompletionGateCheck', () => {
  it('no aplica para anios 1 y 2', () => {
    const result = getYearCompletionGateCheck({
      subject: subject('AN2-1', 2),
      subjects: [subject('AN2-1', 2)],
      grades: [],
    })

    expect(result.applies).toBe(false)
    expect(result.canEnroll).toBe(true)
  })

  it('profesorado: cursar anio 4 exige anios 1 y 2 aprobados', () => {
    const subjects = [subject('A1', 1), subject('A2', 2), subject('A3', 3), subject('A4', 4)]
    const grades = [
      { subject_id: 'A1', program_id: PROGRAM, academic_status: 'approved', updated_at: '2026-01-01' },
    ]

    const result = getYearCompletionGateCheck({ subject: subject('A4', 4), subjects, grades })

    expect(result.applies).toBe(true)
    expect(result.canEnroll).toBe(false)
    expect(result.missing.map((item) => item.canonical_subject_id)).toEqual(['A2'])
  })

  it('habilita cuando todos los anios previos requeridos estan aprobados', () => {
    const subjects = [subject('A1', 1), subject('A2', 2), subject('A3', 3), subject('A4', 4)]
    const grades = [
      { subject_id: 'A1', program_id: PROGRAM, academic_status: 'approved', updated_at: '2026-01-01' },
      { subject_id: 'A2', program_id: PROGRAM, academic_status: 'promocionado', updated_at: '2026-01-01' },
    ]

    const result = getYearCompletionGateCheck({ subject: subject('A4', 4), subjects, grades })

    expect(result.canEnroll).toBe(true)
  })

  it('tecnicatura: cursar anio 3 exige solo el anio 1 aprobado', () => {
    const subjects = [subject('T1', 1), subject('T2', 2), subject('T3', 3)]
    const grades = []

    const result = getYearCompletionGateCheck({ subject: subject('T3', 3), subjects, grades })

    expect(result.applies).toBe(true)
    expect(result.missing.map((item) => item.canonical_subject_id)).toEqual(['T1'])
  })

  it('no mezcla materias de otra carrera', () => {
    const subjects = [
      subject('A1', 1),
      subject('A2', 2),
      { canonical_subject_id: 'B1', canonical_program_id: 'Otra carrera', semester: 1, name: 'B1' },
    ]

    const result = getYearCompletionGateCheck({ subject: subject('A4', 4), subjects, grades: [] })

    expect(result.missing.map((item) => item.canonical_subject_id).sort()).toEqual(['A1', 'A2'])
  })
})
