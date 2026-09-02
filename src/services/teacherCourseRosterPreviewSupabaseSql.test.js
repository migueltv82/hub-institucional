import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/setup_multi_tenant/09_teacher_course_roster_preview.sql', 'utf8')

describe('teacher course roster preview SQL', () => {
  it('declara la RPC read-only con la cadena relacional completa', () => {
    expect(sql).toContain('academic_get_teacher_course_roster_preview')
    expect(sql).toContain('public.teaching_assignments')
    expect(sql).toContain('public.course_offerings')
    expect(sql).toContain('public.course_enrollments')
    expect(sql).toContain('public.student_career_enrollments')
    expect(sql).toContain('public.student_records')
    expect(sql).toContain("relation.status = 'ACTIVE'")
  })

  it('permite solo authenticated y no concede nuevas lecturas globales', () => {
    expect(sql).toContain('from public, anon;')
    expect(sql).toContain('to authenticated;')
    expect(sql).not.toMatch(/grant\s+select\s+on\s+public\.(student_records|course_enrollments|student_career_enrollments)/i)
    expect(sql).not.toContain('service_role')
  })

  it('mantiene legacy como diagnostico sin usarlo en el roster', () => {
    expect(sql).toContain("'legacyFallbackUsed', false")
    expect(sql).toContain("'LEGACY_FALLBACK_AVAILABLE_BUT_NOT_USED'")
    expect(sql).toContain("'legacyEstimatedStudentsCount'")
    expect(sql).toContain("'ASSIGNMENT_WITHOUT_COURSE_OFFERING'")
    expect(sql).toContain("'CROSS_TENANT_RELATION_DETECTED'")
  })
})
