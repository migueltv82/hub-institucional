import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildCountsQuery, extractCanonicalTables } from '../../supabase/baseline/staging_baseline_verifier.mjs'

describe('staging baseline read-only verifier', () => {
  it('conserva digitos en el identificador canonico del schema', () => {
    const source = readFileSync('supabase/schema/03_workspace_data.sql', 'utf8')
    const tables = extractCanonicalTables([source])
    expect(tables).toEqual(['exam_engine_v21_states', 'workspace_snapshots'])
    const sql = buildCountsQuery(tables)
    expect(sql).toContain('FROM public.exam_engine_v21_states')
    expect(sql).not.toMatch(/FROM public\.exam_engine_v\b/)
  })

  it('deduplica tablas y genera solo conteos en transaccion read-only', () => {
    const source = 'create table if not exists public.table_21 (id uuid);'
    expect(extractCanonicalTables([source, source])).toEqual(['table_21'])
    const sql = buildCountsQuery(['table_21'])
    expect(sql).toMatch(/^BEGIN READ ONLY;/)
    expect(sql).toContain('count(*) AS rows')
    expect(sql).toMatch(/COMMIT;$/)
    expect(sql).not.toMatch(/\b(?:insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/i)
  })

  it('rechaza inventario vacio o identificadores inseguros', () => {
    expect(() => buildCountsQuery([])).toThrow()
    expect(() => buildCountsQuery(['bad;drop table x'])).toThrow()
  })
})
