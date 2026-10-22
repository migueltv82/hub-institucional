import { describe, expect, it } from 'vitest'
import { buildPurgeSql, parseArgs, sqlText } from './buildPurgeInstitutionSql.mjs'

describe('buildPurgeInstitutionSql (I3)', () => {
  it('exige el nombre exacto y por defecto genera la simulacion', () => {
    expect(() => parseArgs([])).toThrow('Falta --institucion')
    expect(() => parseArgs(['--institucion', 'a\nb'])).toThrow('saltos de linea')
    expect(() => parseArgs(['--otra'])).toThrow('Argumento desconocido')
    expect(parseArgs(['--institucion', 'Instituto Prueba'])).toMatchObject({ institucion: 'Instituto Prueba', ejecutar: false })
    expect(parseArgs(['--institucion', 'X', '--ejecutar']).ejecutar).toBe(true)
  })

  it('la simulacion solo cuenta y termina en rollback, sin delete', () => {
    const sql = buildPurgeSql({ institution: "Inst d'Prueba", ejecutar: false })
    expect(sql).toContain("where name = 'Inst d''Prueba'")
    expect(sql.trim().endsWith('rollback;')).toBe(true)
    expect(sql).not.toMatch(/\bdelete\s+from\b/i)
    expect(sql).toContain('PURGE_INSTITUTION_NOT_FOUND')
  })

  it('el borrado protege Super Admin, otras instituciones, Storage y verifica antes de confirmar', () => {
    const sql = buildPurgeSql({ institution: 'Instituto Prueba', ejecutar: true })
    expect(sql).toContain('not exists (select 1 from public.profiles p where p.user_id = u.id and p.is_global_admin)')
    expect(sql).toContain("not exists (select 1 from public.memberships m where m.user_id = u.id and m.institution_id <> (select id from purge_target))")
    expect(sql).toContain('s.profile_id = u.id and s.institution_id <> (select id from purge_target)')
    expect(sql).toContain('t.profile_id = u.id and t.institution_id <> (select id from purge_target)')
    expect(sql.indexOf('PURGE_STORAGE_FILES_PENDING')).toBeLessThan(sql.indexOf("execute format('delete from public.%I"))
    expect(sql.indexOf('PURGE_VERIFY_FAILED')).toBeLessThan(sql.indexOf('commit;'))
    expect(sql).toContain('delete from auth.users where id in (select id from purge_users_exclusive);')
    expect(sql).not.toMatch(/admin_audit_logs/)
  })

  it('escapa texto SQL', () => {
    expect(sqlText("o'neil")).toBe("'o''neil'")
  })
})
