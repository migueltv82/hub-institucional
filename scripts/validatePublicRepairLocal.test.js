import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXPECTED_TOUCHED, REPAIR_TABLES, TRIGGER_MAINTAINED, evaluate, repairSql } from './validatePublicRepairLocal.mjs'
import { retargetCopyBuffer } from './retargetRepairCopy.mjs'

const state = (a, b = 'b', auth = 'auth', rls = 40, profiles = 'p') => ({ a: { student_records: a, subject_enrollments: a, student_grades: a }, b: { all: b }, profiles, auth: { users: auth }, rls_on: rls })

describe('retargetRepairCopy (RB.2b)', () => {
  it('cambia solo el encabezado del COPY y deja los bytes UTF-8, tabs y CRLF intactos', () => {
    const data = 'c0\tÑandú\tÁvila Peña\r\n\\.\n'
    const input = Buffer.from(`SET client_encoding = 'UTF8';\nCOPY public.student_records (id, first_name, last_name) FROM stdin;\n${data}`, 'utf8')
    const output = retargetCopyBuffer(input, 'student_records')
    expect(output.toString('utf8')).toContain('COPY pg_temp.repair_student_records (id, first_name, last_name) FROM stdin;')
    expect(output.subarray(output.length - Buffer.byteLength(data))).toEqual(Buffer.from(data, 'utf8'))
  })

  it('falla si no hay exactamente un COPY de la tabla al inicio de linea', () => {
    expect(() => retargetCopyBuffer(Buffer.from('-- nada\n'), 'student_records')).toThrow(/exactamente un COPY/)
    expect(() => retargetCopyBuffer(Buffer.from('x COPY public.student_records (id)\n'), 'student_records')).toThrow()
    expect(() => retargetCopyBuffer(Buffer.from('COPY public.student_records (id)\n'), 'student; drop')).toThrow(/invalido/)
  })
})

describe('validatePublicRepairLocal (RB.2b)', () => {
  it('repara en orden de FK y nunca toca profiles (tabla global)', () => {
    expect(REPAIR_TABLES.map(({ table }) => table)).toEqual(['student_records', 'subject_enrollments', 'student_grades'])
    expect(REPAIR_TABLES.some(({ table }) => table === 'profiles')).toBe(false)
    for (const { filter } of REPAIR_TABLES) expect(filter).toBe("r.institution_id = :'inst'")
    expect(Object.keys(TRIGGER_MAINTAINED)).toEqual(Object.keys(EXPECTED_TOUCHED))
  })

  it('repara en una transaccion, sin desactivar triggers ni tocar auth, ignorando updated_at al comparar', () => {
    const sql = repairSql(['-- copy'])
    expect(sql).toContain('\\set ON_ERROR_STOP 1\nbegin;')
    expect(sql.trim().endsWith('commit;')).toBe(true)
    expect(sql).not.toMatch(/session_replication_role|disable trigger|auth\.|profiles/i)
    for (const { table, key } of REPAIR_TABLES) {
      expect(sql).toContain(`create temp table repair_${table} (like public.${table}) on commit drop;`)
      expect(sql).toContain(`on conflict (${key}) do update set :cols where (to_jsonb(t) - 'updated_at') is distinct from (to_jsonb(excluded) - 'updated_at');`)
    }
  })

  it('el control omite el upsert', () => {
    expect(repairSql(['-- copy'], { control: true })).not.toContain('insert into public.')
  })

  it('detecta daño no reparado y cambios en B, profiles, auth o RLS', () => {
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('x') })).toEqual([])
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('y') })).toHaveLength(3)
    expect(evaluate({ before: state('x'), damaged: state('x'), after: state('x') })).toHaveLength(3)
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('x', 'B2') })).toEqual(['institution B changed'])
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('x', 'b', 'auth', 40, 'p2') })).toEqual(['profiles changed'])
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('x', 'b', 'auth2') })).toEqual(['auth.* changed'])
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('x', 'b', 'auth', 39) })).toEqual(['RLS state changed'])
  })
})

describe('public_repair_template.sql', () => {
  it('es exactamente el script que ensaya el harness, con \\ir relativo al template', () => {
    const template = readFileSync('supabase/security/public_repair_template.sql', 'utf8').replace(/\r\n/g, '\n')
    const body = template.split('\n').filter((line) => !line.startsWith('-- ')).join('\n').trim()
    expect(body).toBe(repairSql(REPAIR_TABLES.map(({ table }) => `\\ir repair_${table}.sql`)))
  })
})
