import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260828144600_teacher_exam_reassignment_request.sql',
  'utf8',
)

describe('teacher exam reassignment migration', () => {
  it('persiste la solicitud y valida propiedad, carrera, fecha y vacante', () => {
    expect(migration).toContain('academic_teacher_object_exam_assignment')
    expect(migration).toContain('teacher_id = auth.uid()')
    expect(migration).toContain("La mesa alternativa debe pertenecer a la misma carrera")
    expect(migration).toContain("La fecha alternativa no coincide con la mesa seleccionada")
    expect(migration).toContain('propuesta de intercambio')
    expect(migration).toContain("reassignment_status = case")
  })

  it('no expone la RPC a sesiones anonimas', () => {
    expect(migration).toContain('revoke execute on function public.academic_teacher_object_exam_assignment')
    expect(migration).toContain('from public, anon')
    expect(migration).toContain('to authenticated, service_role')
  })
})
