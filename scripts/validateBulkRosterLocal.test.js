import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTORS, CASES, bulkSql, evaluateCase } from './validateBulkRosterLocal.mjs'

const operations = readFileSync(resolve('supabase/schema/07_academic_operations.sql'), 'utf8')

describe('validateBulkRosterLocal', () => {
  it('cubre permisos, rechazos, idempotencia, cambio de rol y bajas que no se reactivan', () => {
    expect(CASES.filter((item) => item.expectError === '42501').map((item) => item.actor)).toEqual(['studentA', 'teacherA', 'adminB'])
    const reasons = CASES.flatMap((item) => item.expect?.motivos ?? [])
    for (const reason of ['ROL_INVALIDO', 'DOCENTE_NO_ENCONTRADO', 'DOCENTE_SIN_CUENTA', 'ALUMNO_SIN_CUENTA', 'MATERIA_NO_ESTA_EN_EL_PLAN', 'CURSADA_DADA_DE_BAJA']) expect(reasons).toContain(reason)
    expect(CASES.some((item) => item.state?.role === 'suplente')).toBe(true)
  })

  it('corre cada llamada como el actor y escapa los datos', () => {
    const sql = bulkSql('academic_admin_bulk_enroll_students', ACTORS.adminA, [{ materia: "o'x" }])
    expect(sql).toContain('set local role authenticated')
    expect(sql).toContain("o''x")
  })

  it('evalua reportes y estado', () => {
    const created = CASES.find((item) => item.name === 'cursada creada')
    expect(evaluateCase(created, { result: { creadas: 1, sin_cambios: 0, omitidas: 0, rechazadas: 0, problemas: [] }, state: { enrollments: 1, enrollmentStatus: 'active' } })).toEqual([])
    expect(evaluateCase(created, { result: { creadas: 2, problemas: [] }, state: {} }).length).toBeGreaterThan(0)
  })

  it('las RPC son staff-only y los helpers internos', () => {
    for (const fn of ['academic_admin_bulk_assign_teachers', 'academic_admin_bulk_enroll_students']) {
      expect(operations).toContain(`grant execute on function public.${fn}(uuid, text, jsonb) to authenticated;`)
      expect(operations).toContain(`revoke execute on function public.${fn}(uuid, text, jsonb) from public, anon;`)
    }
    expect(operations).toContain('revoke all on function public.academic_resolve_catalog_subject(uuid, text, text) from public, anon, authenticated;')
    expect(operations).toContain('revoke all on function public.academic_resolve_student_record_by_dni(uuid, text, text, text) from public, anon, authenticated;')
  })
})
