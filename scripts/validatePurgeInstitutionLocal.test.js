import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXTRA_FIXTURE_SQL, STORAGE_OBJECT_SQL, institutionDigestSql } from './validatePurgeInstitutionLocal.mjs'

const harness = readFileSync(resolve('scripts/validatePurgeInstitutionLocal.mjs'), 'utf8')

describe('validatePurgeInstitutionLocal', () => {
  it('prepara usuarios que nunca se borran: Super Admin, compartido y con legajo en otra institucion', () => {
    expect(EXTRA_FIXTURE_SQL).toContain('is_global_admin = true')
    expect(EXTRA_FIXTURE_SQL).toMatch(/'viewer'\)/)
    expect(EXTRA_FIXTURE_SQL).toContain('insert into public.student_records')
    expect(EXTRA_FIXTURE_SQL).toContain('source_file_storage_operations')
    expect(STORAGE_OBJECT_SQL).toContain("'workspace-source-files'")
  })

  it('verifica simulacion sin cambios, freno por archivos, purga completa, B intacta y segunda corrida', () => {
    for (const message of ["'Dry run deleted rows'", "'Purge ran with storage files pending'", "'Blocked purge deleted rows'", "'Institution B changed'", "'Audit logs were deleted'", "'A protected user was deleted'", "'Exclusive users of A remain'", "'Second purge did not fail'"]) {
      expect(harness).toContain(message)
    }
  })

  it('compara B con un digest de todas sus filas', () => {
    const sql = institutionDigestSql(['students', 'grades'], 'b1')
    expect(sql).toContain("from public.students x where x.institution_id = 'b1'")
    expect(sql).toContain('md5(string_agg(')
  })
})
