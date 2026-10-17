import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COUNTED_TABLES, countsSql, runbookSqlBlocks } from './validateRunbookCommandsLocal.mjs'

describe('validateRunbookCommandsLocal', () => {
  const markdown = readFileSync('docs/RUNBOOK_PRODUCCION_V1.md', 'utf8')

  it('lee del runbook los bloques SQL que se ensayan, todos read-only', () => {
    const [snapshot] = runbookSqlBlocks(markdown, '## 3. T-0')
    const [post] = runbookSqlBlocks(markdown, '## 4. Aplicación de SQL')
    for (const sql of [snapshot, post]) {
      expect(sql.trim()).toMatch(/^begin; set transaction read only;/)
      expect(sql.trim().endsWith('rollback;')).toBe(true)
    }
    expect(post).toContain('handle_new_user_ok')
    expect(post).toContain('upsert_exam_enrollment_from_portal')
  })

  it('falla claro si la seccion no existe', () => {
    expect(() => runbookSqlBlocks(markdown, '## 99. Inexistente')).toThrow(/Seccion no encontrada/)
  })

  it('cuenta auth, public y storage', () => {
    const sql = countsSql()
    for (const table of COUNTED_TABLES) expect(sql).toContain(`from ${table})`)
    expect(COUNTED_TABLES).toEqual(expect.arrayContaining(['auth.users', 'public.profiles', 'storage.objects']))
  })

  it('el runbook ya no ofrece el restore manual del archive como camino completo', () => {
    expect(markdown).toContain('El archive propio del §3 NO sirve para un restore completo')
    expect(markdown).not.toMatch(/restaurar el archive con `pg_restore` en una transacción/)
  })
})
