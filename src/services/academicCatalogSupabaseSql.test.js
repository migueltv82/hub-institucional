import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = path.resolve('supabase/setup_multi_tenant/05_academic_catalog_and_course_offerings.sql')
const rlsTestPath = path.resolve('supabase/security/academic_catalog_rls_tests.sql')

function sql(filePath = migrationPath) {
  return fs.readFileSync(filePath, 'utf8').toLowerCase()
}

describe('academic catalog local migration', () => {
  it('crea el catalogo, la oferta y sus relaciones minimas', () => {
    const text = sql()
    for (const table of [
      'academic_careers', 'academic_study_plans', 'academic_years', 'academic_terms',
      'study_plan_subjects', 'course_offerings', 'course_schedules',
      'teaching_assignments', 'course_enrollments', 'domain_audit_events',
    ]) {
      expect(text).toContain(`create table if not exists public.${table}`)
      expect(text).toContain(`alter table public.${table} enable row level security`)
    }
  })

  it('separa materia estable de oferta anual y evita ofertas duplicadas', () => {
    const text = sql()
    expect(text).toContain('study_plan_subject_id uuid not null')
    expect(text).toContain('academic_year_id uuid not null')
    expect(text).toContain('create unique index if not exists course_offerings_natural_key_unique')
    expect(text).toContain("coalesce(academic_term_id, '00000000-0000-0000-0000-000000000000'::uuid)")
    expect(text).toContain('upper(commission_code)')
  })

  it('impone estados y transiciones explicitas de oferta', () => {
    const text = sql()
    expect(text).toContain('course_offerings_status_check')
    expect(text).toContain('academic_validate_course_offering_transition')
    expect(text).toContain('course_offering_invalid_status_transition')
    expect(text).toContain("when 'pending_course_closure' then new.status in ('course_closed', 'in_progress')")
  })

  it('hace idempotente la inscripcion y prohibe borrado fisico por permisos', () => {
    const text = sql()
    expect(text).toContain('course_enrollments_student_offering_unique unique (institution_id, student_id, course_offering_id)')
    expect(text).toContain("'automatic_first_year', 'student_selected', 'administrative', 'migrated_legacy'")
    expect(text).toContain('grant select, insert, update on public.academic_careers')
    expect(text).not.toMatch(/grant\s+delete\s+on\s+public\.course_enrollments/)
  })

  it('reserva escrituras academicas a service_role', () => {
    const text = sql()
    expect(text).toContain('revoke all on public.academic_careers')
    expect(text).toContain('from anon, authenticated')
    expect(text).toContain('grant select on public.academic_careers')
    expect(text).toContain('to authenticated')
    expect(text).not.toMatch(/grant\s+[^;]*(insert|update|delete)[^;]*to\s+authenticated/)
  })

  it('protege auditoria append-only con hash encadenado y funcion server-side', () => {
    const text = sql()
    expect(text).toContain('domain_audit_events_aggregate_sequence_unique')
    expect(text).toContain('academic_reject_domain_audit_event_mutation')
    expect(text).toContain('academic_append_domain_audit_event')
    expect(text).toContain('pg_advisory_xact_lock')
    expect(text).toContain("extensions.digest(convert_to(jsonb_build_object(")
    expect(text).toContain('grant execute on function public.academic_append_domain_audit_event')
    expect(text).toContain('to service_role')
  })

  it('no migra, borra ni renombra fuentes legacy', () => {
    const text = sql()
    expect(text).not.toMatch(/drop\s+table/)
    expect(text).not.toMatch(/alter\s+table\s+public\.(workspace_snapshots|student_records|teacher_records|subject_enrollments)\s+rename/)
    expect(text).not.toMatch(/delete\s+from\s+public\.(workspace_snapshots|student_records|teacher_records|subject_enrollments)/)
    expect(text).not.toContain('cronograma')
    expect(text).not.toContain("default 'regular'")
  })

  it('mantiene el test RLS transaccional y cubre casos positivos y negativos', () => {
    const text = sql(rlsTestPath)
    expect(text).toContain('begin;')
    expect(text).toContain('rollback;')
    for (const scenario of [
      'student reads own enrollment',
      'student cannot read another enrollment',
      'student cannot insert directly',
      'student cannot read another career offering',
      'teacher reads assigned offering',
      'teacher cannot read unassigned offering',
      'teacher cannot update teaching assignment',
      'admin cannot read another institution',
      'unscoped user cannot write',
    ]) expect(text).toContain(scenario)
  })
})
