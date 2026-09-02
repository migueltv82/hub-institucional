import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/setup_multi_tenant/07_student_course_enrollment_preview_read.sql',
), 'utf8')

describe('student course enrollment preview SQL', () => {
  it('es read-only, tenant-aware y resuelve actor con auth.uid', () => {
    expect(sql).toContain('academic_get_student_course_enrollment_preview')
    expect(sql).toContain('actor_user_id uuid := auth.uid()')
    expect(sql).toContain('security definer')
    expect(sql).toContain('set search_path = public, pg_temp')
    expect(sql).toContain('public.can_admin_academic_institution(p_institution_id)')
    expect(sql).toContain("lower(profile.account_role::text) in ('alumno', 'student')")
    expect(sql).toContain('profile.is_blocked = false')
    expect(sql).not.toMatch(/\b(insert|update|delete|upsert)\s+(into|public\.)/i)
  })

  it('no recibe email, carrera textual ni actor confiable como parametros', () => {
    const signature = sql.slice(
      sql.indexOf('create or replace function public.academic_get_student_course_enrollment_preview'),
      sql.indexOf('returns jsonb'),
    )
    expect(signature).not.toMatch(/email|career_name|actor_id/i)
    expect(signature).toContain('p_institution_id uuid')
    expect(signature).toContain('p_student_career_enrollment_id uuid')
  })

  it('solo concede EXECUTE a authenticated', () => {
    expect(sql).toContain('revoke all on function public.academic_get_student_course_enrollment_preview(uuid, uuid) from public, anon')
    expect(sql).toContain('grant execute on function public.academic_get_student_course_enrollment_preview(uuid, uuid) to authenticated')
  })
})
