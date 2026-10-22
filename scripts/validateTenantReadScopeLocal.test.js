import { describe, expect, it } from 'vitest'
import { ACTORS, TABLES, evaluate, expectedRows, legacyPoliciesSql, probeSql } from './validateTenantReadScopeLocal.mjs'

const totals = Object.fromEntries(Object.entries(TABLES).map(([table, spec]) => [table, spec.catalog ? { all: 1, own: 1 } : { all: 3, own: spec.own === 'false' ? 0 : 1 }]))
const resultsFor = (overrides = {}) => Object.fromEntries(Object.entries(ACTORS).map(([name, actor]) => [name, Object.fromEntries(Object.keys(TABLES).map((table) => [table, overrides[name]?.[table] ?? expectedRows(actor.scope, table, totals)]))]))

describe('validateTenantReadScopeLocal (SEC.3)', () => {
  it('cubre las tablas con datos personales, el catalogo y los tres roles', () => {
    expect(Object.keys(ACTORS)).toEqual(['adminA', 'teacherA', 'studentA'])
    for (const table of ['student_records', 'teacher_records', 'student_grades', 'subject_attendance_records', 'student_financial_status', 'workspace_snapshots', 'workspace_source_files', 'deleted_person_records']) {
      expect(TABLES[table].catalog).toBeUndefined()
    }
    expect(Object.entries(TABLES).filter(([, spec]) => spec.catalog).map(([table]) => table)).toEqual(['careers', 'subjects', 'study_plans'])
  })

  it('el personal ve todo, el alumno solo lo propio y todo el catalogo', () => {
    expect(expectedRows('staff', 'student_records', totals)).toBe(3)
    expect(expectedRows('own', 'student_records', totals)).toBe(1)
    expect(expectedRows('own', 'workspace_snapshots', totals)).toBe(0)
    expect(expectedRows('own', 'careers', totals)).toBe(1)
  })

  it('detecta un alumno que ve filas ajenas y un fixture sin filas ajenas', () => {
    expect(evaluate(resultsFor(), totals)).toEqual([])
    expect(evaluate(resultsFor({ studentA: { student_records: 3 } }), totals)).toEqual(['studentA.student_records: esperaba 1, ve 3'])
    expect(evaluate(resultsFor({ teacherA: { workspace_snapshots: 0 } }), totals)).toEqual(['teacherA.workspace_snapshots: esperaba 3, ve 0'])
    const weak = { ...totals, student_grades: { all: 1, own: 1 } }
    expect(evaluate(resultsFor(), weak)).toContain('fixture debil: student_grades no tiene filas ajenas al alumno')
  })

  it('las sondas corren como authenticated con rollback y el control recrea solo las tablas con PII', () => {
    const sql = probeSql(ACTORS.studentA)
    expect(sql.startsWith('begin;\nset local role authenticated;')).toBe(true)
    expect(sql.trim().endsWith('rollback;')).toBe(true)
    const legacy = legacyPoliciesSql()
    expect(legacy).toContain('create policy "student_records members read"')
    expect(legacy).not.toContain('"careers members read"')
  })
})
