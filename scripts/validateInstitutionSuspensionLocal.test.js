import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTORS, SUSPENSION_BLOCKS, TABLES, evaluatePhase, probeSql, setStatusSql, stripSuspension } from './validateInstitutionSuspensionLocal.mjs'

const reads = value => Object.fromEntries(TABLES.map(table => [table, value]))
const allPass = (phase, cutValue) => Object.fromEntries(Object.entries(ACTORS).map(([name, actor]) => {
  const cut = phase === 'suspended' && actor.institution.startsWith('a1')
  return [name, cut ? { reads: reads(cutValue), write: 'ACADEMIC_COMMAND_FORBIDDEN|P0001' } : { reads: reads(1), write: 'saved' }]
}))

describe('validateInstitutionSuspensionLocal', () => {
  it('cubre admin, docente y alumno de A, y un admin de B como testigo', () => {
    const writes = Object.values(ACTORS).map(actor => actor.write)
    expect(writes).toEqual(expect.arrayContaining(['snapshot', 'grade', 'exam', 'subject']))
    expect(Object.values(ACTORS).some(actor => actor.institution.startsWith('b1'))).toBe(true)
  })

  it('cada sonda corre en transaccion con rollback y como authenticated', () => {
    for (const actor of Object.values(ACTORS)) {
      const sql = probeSql(actor)
      expect(sql.startsWith('begin;')).toBe(true)
      expect(sql.trim().endsWith('rollback;')).toBe(true)
      expect(sql).toContain('set local role authenticated;')
      expect(sql).toContain(`'request.jwt.claim.sub', '${actor.id}'`)
    }
  })

  it('el cambio de estado lo hace el superadmin por RLS, no el dueño de la base', () => {
    const sql = setStatusSql('suspended')
    expect(sql).toContain('set local role authenticated;')
    expect(sql).toContain("update public.institutions set status = 'suspended'")
  })

  it('acepta el corte esperado y detecta fugas de lectura o escritura', () => {
    expect(evaluatePhase('active', allPass('active'))).toEqual([])
    expect(evaluatePhase('suspended', allPass('suspended', 0))).toEqual([])
    expect(evaluatePhase('suspended', allPass('suspended', 1))).not.toEqual([])
    const leakedWrite = allPass('suspended', 0)
    leakedWrite.studentA = { reads: reads(0), write: 'saved' }
    expect(evaluatePhase('suspended', leakedWrite)).toEqual(['suspended studentA: escritura aceptada'])
    const brokenB = allPass('suspended', 0)
    brokenB.adminB = { reads: reads(0), write: 'saved' }
    expect(evaluatePhase('suspended', brokenB)).toEqual(['suspended adminB: sin lecturas'])
  })

  it('el control encuentra cada bloque 06.3 una sola vez en el baseline', () => {
    for (const file of Object.keys(SUSPENSION_BLOCKS)) {
      const source = readFileSync(resolve('supabase/schema', file), 'utf8')
      const stripped = stripSuspension(file, source)
      expect(stripped).not.toContain('06.3:')
      expect(stripped.length).toBeLessThan(source.replace(/\r\n/g, '\n').length)
    }
  })
})
