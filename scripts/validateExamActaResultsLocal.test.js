import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTORS, STEPS, evaluateStep, rosterSql, saveSql } from './validateExamActaResultsLocal.mjs'

const exams = readFileSync(resolve('supabase/schema/08_exam_tables.sql'), 'utf8')
const block = exams.slice(exams.indexOf('create or replace function public.exam_save_acta_results('))

describe('validateExamActaResultsLocal', () => {
  it('cubre permisos, dia del examen, validaciones, aprobado, desaprobado, cierre y correccion con motivo', () => {
    const errors = STEPS.map((step) => step.expectError).filter(Boolean)
    expect(errors).toEqual(expect.arrayContaining(['EXAM_NOT_TAKEN_YET', '42501', 'EXAM_ACTA_ABSENT_WITH_GRADE', 'EXAM_ACTA_GRADE_INVALID', 'EXAM_ACTA_ENROLLMENT_NOT_FOUND', 'EXAM_ACTA_INCOMPLETE', 'EXAM_ACTA_CLOSED', 'EXAM_ACTA_CORRECTION_REASON_REQUIRED']))
    expect(STEPS.filter((step) => step.expectError === '42501').map((step) => step.actor)).toEqual(['student', 'otherTeacher', 'adminB'])
    expect(STEPS.some((step) => step.expect?.latestStatus === 'regular' && step.expect?.result === 'failed')).toBe(true)
    expect(STEPS.some((step) => step.expect?.result === 'absent' && step.actor === 'adminA')).toBe(true)
  })

  it('cada llamada corre como el actor y escapa los datos', () => {
    const sql = saveSql(ACTORS.titular, [{ nota: "o'8" }], { reason: "por 'error'" })
    expect(sql).toContain('set local role authenticated')
    expect(sql).toContain("o''8")
    expect(sql).toContain("por ''error''")
    expect(rosterSql(ACTORS.titular)).toContain('get_exam_table_roster')
  })

  it('evalua errores y estados', () => {
    const denied = STEPS.find((step) => step.actor === 'student')
    expect(evaluateStep(denied, { result: { sqlstate: '42501' }, changed: false })).toEqual([])
    expect(evaluateStep(denied, { result: { guardados: 1 }, changed: true })).toHaveLength(2)
    const approved = STEPS.find((step) => step.expect?.result === 'approved')
    expect(evaluateStep(approved, { result: { guardados: 1 }, state: { result: 'approved', final: '8.00', approvedGrades: 1, latestStatus: 'approved' } })).toEqual([])
  })

  it('la RPC es security definer, el helper del titular es interno y exam_results es default-deny', () => {
    expect(block).toMatch(/security definer\s+set search_path = ''/)
    expect(block).toContain("v_result := case when v_final >= 4 then 'approved' else 'failed' end;")
    expect(exams).toContain('revoke all on function public.exam_table_caller_is_titular(uuid, text, uuid) from public, anon, authenticated;')
    expect(exams).toContain('revoke all on public.exam_results from public, anon, authenticated;')
    expect(exams).toContain('grant execute on function public.exam_save_acta_results(uuid, text, text, jsonb, boolean, text) to authenticated;')
  })
})
