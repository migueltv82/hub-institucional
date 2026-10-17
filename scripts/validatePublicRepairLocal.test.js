import { describe, expect, it } from 'vitest'
import { REPAIR_TABLES, TRIGGER_MAINTAINED, evaluate, repairSql, retargetCopy } from './validatePublicRepairLocal.mjs'

const state = (a, b = 'b', auth = 'auth', rls = 40) => ({ a: { student_grades: a, subject_enrollments: a, profiles: a }, b: { all: b }, auth: { users: auth }, rls_on: rls })

describe('validatePublicRepairLocal (RB.2)', () => {
  it('redirige solo el COPY de la tabla pedida a la temporal', () => {
    const script = "SET search_path = '';\nCOPY public.student_grades (id, institution_id) FROM stdin;\n1\tA\n\\.\n"
    expect(retargetCopy(script, 'student_grades')).toContain('COPY pg_temp.repair_student_grades (id, institution_id) FROM stdin;')
    expect(() => retargetCopy(script, 'profiles')).toThrow(/public\.profiles/)
  })

  it('repara en una transaccion, sin desactivar triggers ni tocar auth', () => {
    const sql = repairSql(['-- copy'])
    expect(sql).toContain('\\set ON_ERROR_STOP 1\nbegin;')
    expect(sql.trim().endsWith('commit;')).toBe(true)
    expect(sql).not.toMatch(/session_replication_role|disable trigger|auth\./i)
    for (const { table, key } of REPAIR_TABLES) {
      expect(sql).toContain(`create temp table repair_${table} (like public.${table}) on commit drop;`)
      expect(sql).toContain(`on conflict (${key}) do update set :cols where row(t.*) is distinct from row(excluded.*);`)
    }
  })

  it('el control omite el upsert', () => {
    expect(repairSql(['-- copy'], { control: true })).not.toContain('insert into public.')
  })

  it('cada tabla reparable filtra por la institucion afectada', () => {
    for (const { filter } of REPAIR_TABLES) expect(filter).toContain(":'inst'")
    expect(Object.keys(TRIGGER_MAINTAINED)).toEqual(['student_grades', 'subject_enrollments'])
  })

  it('detecta daño no reparado, cambios en B, en auth o en RLS', () => {
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('x') })).toEqual([])
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('y') })).toHaveLength(3)
    expect(evaluate({ before: state('x'), damaged: state('x'), after: state('x') })).toHaveLength(3)
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('x', 'B2') })).toEqual(['institution B changed'])
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('x', 'b', 'auth2') })).toEqual(['auth.* changed'])
    expect(evaluate({ before: state('x'), damaged: state('y'), after: state('x', 'b', 'auth', 39) })).toEqual(['RLS state changed'])
  })
})

describe('public_repair_template.sql', () => {
  it('es exactamente el script que ensaya el harness', async () => {
    const { readFileSync } = await import('node:fs')
    const template = readFileSync('supabase/security/public_repair_template.sql', 'utf8').replace(/\r\n/g, '\n')
    const body = template.split('\n').filter((line) => !line.startsWith('-- ')).join('\n').trim()
    expect(body).toBe(repairSql(REPAIR_TABLES.map(({ table }) => `\\i repair_${table}.sql`)))
  })
})
