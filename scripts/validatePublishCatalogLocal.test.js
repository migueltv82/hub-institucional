import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG_DUMP_SQL, USERS, publishSql } from './validatePublishCatalogLocal.mjs'

const operations = readFileSync(resolve('supabase/schema/07_academic_operations.sql'), 'utf8')
const block = operations.slice(operations.indexOf('create or replace function public.academic_admin_publish_catalog('))
const harness = readFileSync(resolve('scripts/validatePublishCatalogLocal.mjs'), 'utf8')

describe('validatePublishCatalogLocal', () => {
  it('compara la RPC contra el SQL de CAT.1 en todas las tablas del catalogo', () => {
    for (const key of ['careers', 'plans', 'subjects', 'plan_subjects', 'prerequisites', 'student_plans']) expect(CATALOG_DUMP_SQL).toContain(`'${key}'`)
    expect(harness).toContain("assert.ok(report.equivalent, 'RPC and SQL catalogs differ')")
    expect(harness).toContain("assert.equal(report.editor.sqlstate, '42501')")
    expect(harness).toContain("assert.equal(report.teacher.sqlstate, '42501')")
    expect(harness).toContain('CATALOG_CAREER_RENAME')
    expect(harness).toContain("assert.ok(report.appPayloadMatches")
  })

  it('cada llamada corre como el actor dentro de su transaccion y escapa el payload', () => {
    const sql = publishSql(USERS.owner.id, { careers: [{ code: 'ING', name: "Profesorado d'Ingles" }] })
    expect(sql.startsWith('begin;')).toBe(true)
    expect(sql).toContain('set local role authenticated')
    expect(sql).toContain(`'${USERS.owner.id}'`)
    expect(sql).toContain("d''Ingles")
  })

  it('la RPC es security definer, owner/admin, sin EXECUTE para anon y nunca borra', () => {
    expect(block).toMatch(/security definer\s+set search_path = ''/)
    expect(block).toContain("public.is_member_of_institution(p_institution_id, array['owner', 'admin'])")
    expect(block.slice(0, block.indexOf('$$;'))).not.toMatch(/\bdelete\s+from\b/i)
    expect(operations).toContain('revoke all on function public.academic_normalize_identity(text) from public, anon, authenticated;')
    expect(operations).toContain('revoke execute on function public.academic_admin_publish_catalog(uuid, jsonb) from public, anon;')
    expect(operations).toContain('grant execute on function public.academic_admin_publish_catalog(uuid, jsonb) to authenticated;')
  })
})
