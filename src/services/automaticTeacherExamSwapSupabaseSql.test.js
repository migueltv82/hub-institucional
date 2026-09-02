import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260828152423_automatic_teacher_exam_swap.sql',
  'utf8',
)

describe('automatic teacher exam swap migration', () => {
  it('bloquea, valida y permuta ambas filas en una sola sentencia', () => {
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('for update')
    expect(migration).toContain("pending_reason := 'OTHER_TEACHER_NOT_AVAILABLE_FOR_SOURCE'")
    expect(migration).toContain("pending_reason := 'REQUESTING_TEACHER_DATE_CONFLICT'")
    expect(migration).toContain('update public.exam_teacher_assignments assignment')
    expect(migration).toContain('where assignment.id in (source_row.id, target_row.id)')
  })

  it('solo permite actuar al docente propietario y no expone la RPC a anon', () => {
    expect(migration).toContain('teacher_id = auth.uid()')
    expect(migration).toContain('revoke execute on function public.academic_teacher_object_exam_assignment')
    expect(migration).toContain('from public, anon')
  })

  it('mantiene pendiente cualquier movimiento que no cierre ambos tribunales', () => {
    expect(migration).toContain("pending_reason := 'TARGET_ROLE_VACANT_REPLACEMENT_REQUIRED'")
    expect(migration).toContain("reassignment_status', case when automatic_swap then 'accepted' else 'requested' end")
  })
})
