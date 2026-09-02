import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const migration = fs.readFileSync(path.join(root, 'supabase/setup_multi_tenant/06_transactional_course_enrollment.sql'), 'utf8')
const postgresTests = fs.readFileSync(path.join(root, 'supabase/security/academic_transactional_enrollment_tests.sql'), 'utf8')
const schemaValidation = fs.readFileSync(path.join(root, 'supabase/security/academic_transactional_schema_validation.sql'), 'utf8')
const concurrencyRunner = fs.readFileSync(path.join(root, 'scripts/validateAcademicEnrollmentConcurrencyLocal.ps1'), 'utf8')

describe('transactional academic enrollment SQL', () => {
  it('defines stable relational identity and prerequisite tables without destructive legacy operations', () => {
    expect(migration).toContain('create table if not exists public.student_career_enrollments')
    expect(migration).toContain('foreign key (student_record_id, institution_id)')
    expect(migration).toContain('foreign key (study_plan_id, career_id, institution_id)')
    expect(migration).toContain('create table if not exists public.study_plan_subject_prerequisites')
    expect(migration).toContain('study_plan_subject_prerequisites_cycle')
    expect(migration).not.toMatch(/drop\s+table|truncate\s+table/i)
  })

  it('makes RPC commands idempotent, authenticated and security-definer constrained', () => {
    expect(migration).toContain('constraint domain_command_requests_idempotency_unique unique (institution_id, request_id, command_type)')
    expect(migration).toContain('create or replace function public.academic_enroll_first_year_student(')
    expect(migration).toContain('create or replace function public.academic_enroll_student_in_course_offering(')
    expect(migration.match(/security definer/g)?.length).toBeGreaterThanOrEqual(2)
    expect(migration.match(/set search_path = public, pg_temp/g)?.length).toBeGreaterThanOrEqual(2)
    expect(migration).toContain('grant execute on function public.academic_enroll_first_year_student(uuid, uuid, uuid) to authenticated')
    expect(migration).toContain('grant execute on function public.academic_enroll_student_in_course_offering(uuid, uuid, uuid) to authenticated')
    expect(migration).not.toMatch(/p_(email|career_name|actor_id)/i)
  })

  it('keeps direct writes unavailable and validates physical PostgreSQL behavior', () => {
    expect(migration).toContain('revoke all on public.student_career_enrollments')
    expect(migration).toContain('grant select on public.student_career_enrollments')
    expect(postgresTests).toContain('rollback;')
    expect(postgresTests).toContain('same request returns original result')
    expect(postgresTests).toContain('first year failure rolls back completely')
    expect(postgresTests).toContain('adjacent teaching slots are allowed')
    expect(postgresTests).toContain('overlapping teaching slot is rejected')
    expect(schemaValidation).toContain('TRANSACTIONAL_SCHEMA_VALIDATION_OK')
  })

  it('provides a local-only two-session concurrency check', () => {
    expect(concurrencyRunner).toContain('LOCAL_POSTGRES_CONCURRENCY_TEST')
    expect(concurrencyRunner).toContain('Start-Job')
    expect(concurrencyRunner).toContain('persistedEnrollments')
    expect(concurrencyRunner).toContain('remoteSupabaseUsed = $false')
    expect(concurrencyRunner).not.toMatch(/supabase\s+(link|db\s+push)|--linked/i)
  })
})
