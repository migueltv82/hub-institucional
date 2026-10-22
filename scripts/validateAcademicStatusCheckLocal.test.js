import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANONICAL_STATUSES, CONSTRAINT, RPC_SCENARIOS, constraintStateSql, definitionIsCanonical, directGradeSql } from './validateAcademicStatusCheckLocal.mjs'
import { WRITE_SCENARIOS } from './validateAcademicStatusWriteLocal.mjs'

const operations = readFileSync(resolve('supabase/schema/07_academic_operations.sql'), 'utf8')

describe('validateAcademicStatusCheckLocal', () => {
  it('el CHECK de 07 usa el mismo conjunto canonico que el RPC del docente (03.5b)', () => {
    const check = operations.match(/add constraint student_grades_academic_status_check\s+check \(academic_status in \(([^)]*)\)\)\s+not valid;/)
    expect(check).not.toBeNull()
    const values = [...check[1].matchAll(/'([^']+)'/g)].map(match => match[1])
    expect(values).toEqual([...CANONICAL_STATUSES])
    const rpc = operations.match(/when raw_academic_status in \(([^)]*)\) then raw_academic_status/)
    expect([...rpc[1].matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual([...CANONICAL_STATUSES])
  })

  it('valida aparte y aborta con mensaje claro si hay filas no canonicas', () => {
    const block = operations.slice(operations.indexOf('-- 03.5c:'))
    expect(block).toContain('not convalidated')
    expect(block).toContain('ACADEMIC_STATUS_NONCANONICAL_ROWS')
    expect(block.indexOf('raise exception')).toBeLessThan(block.indexOf('validate constraint student_grades_academic_status_check'))
    expect(block.slice(0, block.indexOf('end $$;'))).not.toMatch(/\b(update|delete from)\s+public\.student_grades/)
  })

  it('reconoce la definicion canonica de pg_get_constraintdef y rechaza variantes', () => {
    const definition = `CHECK ((academic_status = ANY (ARRAY[${CANONICAL_STATUSES.map(value => `'${value}'::text`).join(', ')}])))`
    expect(definitionIsCanonical(definition)).toBe(true)
    expect(definitionIsCanonical(definition.replace(", 'absent'::text", ''))).toBe(false)
    expect(definitionIsCanonical(definition.replace("'regular'", "'Regular'"))).toBe(false)
    expect(definitionIsCanonical(undefined)).toBe(false)
  })

  it('arma SQL acotado al CHECK y escapa el estado', () => {
    expect(constraintStateSql()).toContain(`conname = '${CONSTRAINT}'`)
    expect(directGradeSql("o'reg")).toContain("'o''reg'")
  })

  it('reusa escenarios existentes de 03.5b, con normalizacion, rechazo y bloqueo de mesa', () => {
    const scenarios = RPC_SCENARIOS.map(name => WRITE_SCENARIOS.find(item => item.name === name))
    expect(scenarios.every(Boolean)).toBe(true)
    expect(scenarios.some(item => item.enroll === 'registered')).toBe(true)
    expect(scenarios.some(item => item.enroll === 'blocked')).toBe(true)
    expect(scenarios.some(item => item.steps.some(step => step.expect === 'ACADEMIC_STATUS_INVALID'))).toBe(true)
  })
})
