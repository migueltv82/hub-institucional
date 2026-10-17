import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PROBES, SEC2_BLOCK, applySec2Control, probeSql } from './validateMemberProfileLookupLocal.mjs'

describe('validateMemberProfileLookupLocal (SEC.2)', () => {
  it('cubre el panel admin, el superadmin, alumno, docente y cross-tenant', () => {
    expect(PROBES.filter((probe) => probe.expect === 1).map((probe) => probe.name)).toEqual(['admin A busca docente A', 'admin A busca alumno A', 'superadmin busca alumno A'])
    expect(PROBES.some((probe) => probe.name.includes('cross-tenant') && probe.expect === 0)).toBe(true)
    expect(PROBES.some((probe) => probe.role === null && probe.expect === 0)).toBe(true)
  })

  it('cada sonda corre como authenticated en una transaccion con rollback', () => {
    for (const probe of PROBES) {
      const sql = probeSql(probe)
      expect(sql.startsWith('begin;\nset local role authenticated;')).toBe(true)
      expect(sql.trim().endsWith('rollback;')).toBe(true)
      expect(sql).toContain(`'request.jwt.claim.sub', '${probe.caller}'`)
    }
  })

  it('el baseline exige rol y el control quita exactamente ese filtro', () => {
    const source = readFileSync(`supabase/schema/${SEC2_BLOCK.file}`, 'utf8')
    expect(source.replace(/\r\n/g, '\n')).toContain(SEC2_BLOCK.secured)
    const control = applySec2Control(source)
    expect(control).toContain(SEC2_BLOCK.legacy)
    expect(control).not.toContain(SEC2_BLOCK.secured)
  })
})
