import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260828153013_automatic_teacher_exam_swap_metadata.sql',
  'utf8',
)

describe('automatic teacher exam swap metadata migration', () => {
  it('sincroniza el nombre visible del rol cuando cambia teacher_id', () => {
    expect(migration).toContain('before update of teacher_id')
    expect(migration).toContain("when 'TITULAR' then 'titular'")
    expect(migration).toContain("when 'VOCAL_1' then 'vocal1'")
    expect(migration).toContain("when 'VOCAL_2' then 'vocal2'")
    expect(migration).toContain('profile.display_name')
    expect(migration).toContain('jsonb_set')
  })

  it('no expone la funcion de trigger como RPC publica', () => {
    expect(migration).toContain('revoke execute on function public.academic_sync_exam_assignment_teacher_metadata()')
    expect(migration).toContain('from public, anon, authenticated')
  })
})
