import { describe, expect, it } from 'vitest'
import { WRITE_SCENARIOS, evaluateScenario, scenarioSql } from './validateAcademicStatusWriteLocal.mjs'

describe('validateAcademicStatusWriteLocal', () => {
  it('cubre canonicos, sinonimos, vacios y rechazos', () => {
    const inputs = WRITE_SCENARIOS.flatMap(scenario => scenario.steps.map(step => step.status))
    expect(inputs).toEqual(expect.arrayContaining(['Regular', ' regular ', 'APROBADO', 'ausente', null, 'cursando', 'xyz']))
    expect(WRITE_SCENARIOS.some(scenario => scenario.enroll === 'registered')).toBe(true)
    expect(WRITE_SCENARIOS.some(scenario => scenario.enroll === 'blocked')).toBe(true)
  })

  it('arma SQL transaccional que siempre termina en rollback y escapa comillas', () => {
    const sql = scenarioSql({ name: 'comilla', steps: [{ status: "o'reg", expect: 'ACADEMIC_STATUS_INVALID' }] })
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql.trim().endsWith('rollback;')).toBe(true)
    expect(sql).toContain("'o''reg'")
    expect(sql).not.toContain('session_replication_role')
  })

  it('acepta la salida esperada y detecta las desviaciones', () => {
    const scenario = { steps: [{ status: 'regular', expect: 'regular' }, { status: 'cursando', expect: 'ACADEMIC_STATUS_INVALID' }], enroll: 'registered' }
    expect(evaluateScenario(scenario, { steps: ['saved', 'ACADEMIC_STATUS_INVALID|22023'], enroll: 'registered', rows: [{ status: 'regular', lock: 1 }] })).toEqual([])
    expect(evaluateScenario(scenario, { steps: ['saved', 'saved'], enroll: 'registered', rows: [{ status: 'cursando', lock: 2 }] })).not.toEqual([])
    expect(evaluateScenario(scenario, { steps: ['saved', 'ACADEMIC_STATUS_INVALID|22023'], enroll: 'EXAM_REGULARITY_REQUIRED', rows: [{ status: 'regular', lock: 1 }] })).not.toEqual([])
  })

  it('un rechazo sin fila previa no debe dejar filas', () => {
    const scenario = { steps: [{ status: 'xyz', expect: 'ACADEMIC_STATUS_INVALID' }] }
    expect(evaluateScenario(scenario, { steps: ['ACADEMIC_STATUS_INVALID|22023'], rows: [] })).toEqual([])
    expect(evaluateScenario(scenario, { steps: ['ACADEMIC_STATUS_INVALID|22023'], rows: [{ status: 'xyz' }] })).not.toEqual([])
  })
})
