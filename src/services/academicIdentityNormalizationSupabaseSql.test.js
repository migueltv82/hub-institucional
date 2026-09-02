import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260828054606_normalize_academic_student_record_identity.sql',
  'utf8',
)

describe('normalizacion de identidad academica SQL', () => {
  it('rellena student_record_id solo con coincidencias unicas por perfil y tenant', () => {
    expect(migration).toContain('having count(*) = 1')
    expect(migration).toContain('(array_agg(id))[1] as student_record_id')
    expect(migration).toContain("column_name = 'student_record_id'")
    expect(migration).toContain('target.institution_id = source.institution_id')
    expect(migration).toContain('target.workspace_key = source.workspace_key')
    expect(migration).toContain('target.student_id = source.profile_id')
    expect(migration).not.toMatch(/(?:target|source)\.(?:email|dni|full_name)/i)
  })

  it('protege nuevos datos con FK compuesta sin bloquear filas historicas', () => {
    expect(migration).toContain('foreign key (student_record_id, institution_id)')
    expect(migration).toContain('not valid')
    expect(migration).toContain('on delete restrict')
  })

  it('expone diagnosticos con security invoker y permisos minimos', () => {
    expect(migration).toContain('academic_identity_diagnostics')
    expect(migration).toContain('security invoker')
    expect(migration).toContain('revoke execute')
    expect(migration).toContain('grant execute')
  })
})
