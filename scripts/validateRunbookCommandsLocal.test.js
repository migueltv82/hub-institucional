import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COUNTED_TABLES, EXPECTED_R4_FAILURES, REQUIRED_SUCCESS_STEPS, countsSql, evaluateRunbookSteps, runbookSqlBlocks } from './validateRunbookCommandsLocal.mjs'

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
    expect(() => runbookSqlBlocks('## Sin SQL\r\nTexto\r\n', '## Sin SQL')).toThrow(/Bloque SQL no encontrado/)
  })

  it('extrae los mismos bloques con LF y CRLF', () => {
    const heading = '## 4. Aplicación de SQL'
    const lf = runbookSqlBlocks(markdown.replaceAll('\r\n', '\n'), heading)
    const crlf = runbookSqlBlocks(markdown.replace(/\r?\n/g, '\r\n'), heading)
    expect(crlf).toEqual(lf)
    expect(crlf[0]).toContain('handle_new_user_ok')
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

  it('solo pasa si los pasos requeridos pasan y las cuatro fallas R4 son las esperadas', () => {
    const steps = Object.fromEntries(REQUIRED_SUCCESS_STEPS.map(name => [name, { ok: true }]))
    steps['4_post_sql_verification_as_postgres'].expected = true
    for (const [name, pattern] of Object.entries(EXPECTED_R4_FAILURES)) {
      const representative = {
        R4_restore_empty: 'schema "public" already exists',
        R4_restore_fresh_project: 'schema "auth" already exists',
        R4_restore_fresh_baseline_data_only: 'identities_user_id_fkey',
        R4_restore_fresh_baseline_data_only_disable_triggers: 'must be owner of table audit_log_entries',
      }[name]
      expect(pattern.test(representative)).toBe(true)
      steps[name] = { ok: false, error: representative }
    }
    expect(evaluateRunbookSteps(steps)).toEqual({ pass: true, requiredFailures: [], unexpectedR4: [] })
    steps['3.3_catalog_snapshot_as_postgres'] = { ok: false, error: 'blank output' }
    expect(evaluateRunbookSteps(steps)).toMatchObject({ pass: false, requiredFailures: ['3.3_catalog_snapshot_as_postgres'] })
    steps['3.3_catalog_snapshot_as_postgres'] = { ok: true }
    steps['4_post_sql_verification_as_postgres'].expected = false
    expect(evaluateRunbookSteps(steps)).toMatchObject({ pass: false, requiredFailures: ['4_post_sql_verification_as_postgres'] })
    steps['4_post_sql_verification_as_postgres'].expected = true
    steps.R4_restore_empty.error = 'unexpected restore failure'
    expect(evaluateRunbookSteps(steps)).toMatchObject({ pass: false, unexpectedR4: ['R4_restore_empty'] })
  })
})
