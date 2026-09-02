import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/setup_multi_tenant/08_student_career_enrollment_admin_commands.sql',
), 'utf8')

function signature(functionName) {
  const start = sql.indexOf(`create or replace function public.${functionName}`)
  return sql.slice(start, sql.indexOf('returns jsonb', start))
}

describe('student career enrollment admin SQL', () => {
  it('define comandos independientes sin institution_id ni actor confiable', () => {
    const functions = [
      'academic_admin_create_student_career_enrollment',
      'academic_admin_correct_student_career_enrollment',
      'academic_admin_invalidate_student_career_enrollment',
    ]
    functions.forEach((name) => {
      expect(sql).toContain(`create or replace function public.${name}`)
      expect(signature(name)).not.toMatch(/p_institution_id|p_actor_id|email|career_name/i)
    })
    expect(sql).toContain('actor_user_id uuid := auth.uid()')
    expect(sql).toContain('public.can_admin_academic_institution')
  })

  it('usa idempotencia, locks y auditoria append-only', () => {
    expect(sql).toContain('CREATE_STUDENT_CAREER_ENROLLMENT')
    expect(sql).toContain('CORRECT_STUDENT_CAREER_ENROLLMENT')
    expect(sql).toContain('INVALIDATE_STUDENT_CAREER_ENROLLMENT')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('public.academic_complete_domain_command')
    expect(sql).toContain('public.academic_append_domain_audit_event')
    expect(sql).toContain('STUDENT_CAREER_ENROLLMENT_CREATION_REJECTED')
  })

  it('corrige por reemplazo e invalida sin deletes', () => {
    expect(sql).toContain('supersedes_enrollment_id')
    expect(sql).toContain('superseded_by_enrollment_id')
    expect(sql).toContain("set status = 'INVALIDATED'")
    expect(sql).toContain('ACTIVE_COURSE_ENROLLMENTS_EXIST')
    expect(sql).not.toMatch(/delete\s+from\s+public\.(student_career_enrollments|course_enrollments)/i)
  })

  it('revoca public y anon y solo concede execute a authenticated', () => {
    expect(sql).toMatch(/revoke all on function public\.academic_admin_create_student_career_enrollment[\s\S]*from public, anon;/)
    expect(sql).toMatch(/grant execute on function public\.academic_admin_create_student_career_enrollment[\s\S]*to authenticated;/)
    expect(sql).not.toMatch(/grant\s+(insert|update|delete).*authenticated/i)
    expect(sql).not.toMatch(/execute\s+format|execute\s+immediate/i)
  })
})
