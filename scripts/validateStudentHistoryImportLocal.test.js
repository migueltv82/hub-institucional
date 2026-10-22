import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTORS, CASES, RACES, STUDENT_DNI, enrollSql, evaluateCase, importSql, teacherRaceSql } from './validateStudentHistoryImportLocal.mjs'

const operations = readFileSync(resolve('supabase/schema/07_academic_operations.sql'), 'utf8')
const block = operations.slice(operations.indexOf('create or replace function public.academic_admin_import_student_history('))

describe('validateStudentHistoryImportLocal', () => {
  it('cubre permisos, cada motivo de rechazo, idempotencia, no pisar al docente y la mesa', () => {
    const names = CASES.map((item) => item.name)
    expect(CASES.filter((item) => item.expectError === '42501').map((item) => item.actor)).toEqual([ACTORS.studentA, ACTORS.teacherA, ACTORS.adminB])
    const reasons = CASES.flatMap((item) => item.expect?.motivos ?? [])
    for (const reason of ['FALTAN_DATOS', 'CONDICION_INVALIDA', 'NOTA_INVALIDA', 'FECHA_INVALIDA', 'CARRERA_NO_ENCONTRADA', 'MATERIA_NO_ESTA_EN_EL_PLAN', 'ALUMNO_NO_ENCONTRADO', 'ALUMNO_SIN_CUENTA', 'YA_TIENE_NOTAS_DEL_SISTEMA']) {
      expect(reasons).toContain(reason)
    }
    expect(names).toEqual(expect.arrayContaining(['regular importada habilita la mesa', 're-importar es idempotente y actualiza', 'nunca pisa una nota cargada por el docente']))
    expect(CASES.some((item) => item.enroll === 'registered')).toBe(true)
  })

  it('AUD.I2a: cubre los dos ordenes de la carrera docente/importacion y el legajo de otra carrera', () => {
    expect(RACES.map((race) => race.teacher)).toEqual(['write-then-sleep', 'sleep-then-write'])
    expect(teacherRaceSql('write-then-sleep').indexOf('academic_teacher_upsert_student_grade')).toBeLessThan(teacherRaceSql('write-then-sleep').indexOf('pg_sleep'))
    expect(teacherRaceSql('sleep-then-write').indexOf('pg_sleep')).toBeLessThan(teacherRaceSql('sleep-then-write').indexOf('academic_teacher_upsert_student_grade'))
    expect(CASES.flatMap((item) => item.expect?.motivos ?? [])).toContain('ALUMNO_DE_OTRA_CARRERA')
    expect(operations).toContain("new.updated_at := timezone('utc', clock_timestamp());")
    expect(operations.match(/perform public\.academic_lock_student_subject\(/g)).toHaveLength(2)
    expect(operations).toContain('revoke all on function public.academic_lock_student_subject(uuid, text, uuid, text, text) from public, anon, authenticated;')
  })

  it('cada llamada corre como el actor dentro de su transaccion y escapa el payload', () => {
    const sql = importSql(ACTORS.adminA, [{ dni: STUDENT_DNI, materia: "o'reg" }])
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql).toContain('set local role authenticated')
    expect(sql).toContain(`'${ACTORS.adminA}'`)
    expect(sql).toContain("o''reg")
    expect(enrollSql().trim().endsWith('rollback;')).toBe(true)
  })

  it('evalua el reporte y detecta desviaciones', () => {
    const okCase = CASES.find((item) => item.name === 'regular importada habilita la mesa')
    const good = { result: { importadas: 1, actualizadas: 0, omitidas: 0, rechazadas: 0, problemas: [] }, grades: [{ type: 'historia', status: 'regular', record: okCase.grades[0].record, program: okCase.grades[0].program, observations: 'Libro 3 Folio 27', period: '2024-12-15' }], enroll: 'registered' }
    expect(evaluateCase(okCase, good)).toEqual([])
    expect(evaluateCase(okCase, { ...good, enroll: 'EXAM_REGULARITY_REQUIRED' })).not.toEqual([])
    const denied = CASES[0]
    expect(evaluateCase(denied, { result: { sqlstate: '42501' }, gradesChanged: false })).toEqual([])
    expect(evaluateCase(denied, { result: { importadas: 1 }, gradesChanged: true })).toHaveLength(2)
  })

  it('la RPC es security definer, staff-only, sin EXECUTE para anon y en canonico', () => {
    expect(block).toMatch(/security definer\s+set search_path = ''/)
    expect(block).toContain("public.is_member_of_institution(p_institution_id, array['owner', 'admin', 'editor'])")
    expect(block).toContain("and grade.grade_type <> 'historia'")
    expect(block).toContain("'historia', 1, clean_grade")
    expect(operations).toContain('revoke execute on function public.academic_admin_import_student_history(uuid, text, jsonb) from public, anon;')
    expect(operations).toContain('grant execute on function public.academic_admin_import_student_history(uuid, text, jsonb) to authenticated;')
  })
})
