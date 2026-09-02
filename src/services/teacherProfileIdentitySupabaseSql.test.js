import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/setup_multi_tenant/10_teacher_profile_identity_link.sql', 'utf8')

describe('teacher profile identity SQL', () => {
  it('agrega un vinculo explicito y unico con Profile', () => {
    expect(sql).toContain('add column if not exists profile_id uuid')
    expect(sql).toContain('teacher_records_profile_fk')
    expect(sql).toContain('teacher_records_institution_profile_unique')
    expect(sql).toContain('TEACHER_PROFILE_LINK_INVALID_TENANT_OR_ROLE')
  })

  it('expone solo RPC administrativas autenticadas y auditadas', () => {
    expect(sql).toContain('academic_admin_get_teacher_profile_link_candidates')
    expect(sql).toContain('academic_admin_link_teacher_record_profile')
    expect(sql).toContain('TEACHER_PROFILE_LINKED')
    expect(sql).toContain('to authenticated;')
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+public\.teacher_records/i)
  })

  it('prohibe matching automatico y minimiza candidatos', () => {
    expect(sql).toContain("'automaticMatchingUsed', false")
    expect(sql).toContain("jsonb_build_array('displayName')")
    expect(sql).toContain('Never backfilled automatically by name, email or DNI')
  })
})
