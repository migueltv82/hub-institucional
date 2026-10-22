import { describe, expect, it } from 'vitest'
import { diffSnapshots, filesToApply, parseRemoteSnapshot } from './compareDriftSnapshot.mjs'

const base = {
  kind: 'hub_drift_snapshot_v1',
  functions: [{ sig: 'public.f_a(uuid)', body_md5: 'a', secdef: true, config: 'search_path=public, pg_temp', anon_exec: false, auth_exec: true }],
  policies: [{ table: 'public.careers', name: 'careers members read', cmd: 'SELECT', roles: 'authenticated', expr_md5: 'p' }],
  tables: [{ table: 'public.careers', rls: true, columns_md5: 'c', constraints_md5: 'k', anon_select: false, auth_select: true }],
  triggers: [], storage_buckets: [{ id: 'workspace-source-files', public: false }],
}
const clone = value => JSON.parse(JSON.stringify(value))
const files = {
  '01_foundation.sql': 'create or replace function public.f_a(x uuid) returns void',
  '02_academic_relational_schema.sql': 'create table if not exists public.careers (id uuid); execute format(...)',
  '05_workspace_operational_compat.sql': "insert into storage.buckets values ('workspace-source-files')",
}

describe('compareDriftSnapshot', () => {
  it('acepta las formas en que el SQL Editor entrega la celda', () => {
    expect(parseRemoteSnapshot(JSON.stringify(base)).kind).toBe('hub_drift_snapshot_v1')
    expect(parseRemoteSnapshot(JSON.stringify([{ snapshot: base }])).kind).toBe('hub_drift_snapshot_v1')
    expect(parseRemoteSnapshot(JSON.stringify([{ snapshot: JSON.stringify(base) }])).kind).toBe('hub_drift_snapshot_v1')
    expect(() => parseRemoteSnapshot('{"kind":"otra"}')).toThrow(/hub_drift_snapshot_v1/)
  })

  it('sin drift no pide aplicar nada', () => {
    expect(diffSnapshots(base, clone(base))).toEqual([])
  })

  it('detecta grants, cuerpo, RLS y objetos faltantes o sobrantes', () => {
    const remote = clone(base)
    remote.functions[0].anon_exec = true
    remote.tables[0].rls = false
    remote.policies = []
    remote.functions.push({ sig: 'public.legacy_x()', body_md5: 'z', secdef: true, config: '', anon_exec: true, auth_exec: true })
    const diffs = diffSnapshots(base, remote)
    expect(diffs).toEqual(expect.arrayContaining([
      { kind: 'function', key: 'public.f_a(uuid)', change: 'different', fields: ['anon_exec'] },
      { kind: 'table', key: 'public.careers', change: 'different', fields: ['rls'] },
      { kind: 'policy', key: 'public.careers.careers members read', change: 'missing' },
      { kind: 'function', key: 'public.legacy_x()', change: 'extra' },
    ]))
    const plan = filesToApply(diffs, files)
    expect(plan.ordered.map(item => item.file)).toEqual(['01_foundation.sql', '02_academic_relational_schema.sql'])
    expect(plan.unresolved).toEqual([])
  })

  it('una policy creada con format() se resuelve por el archivo de su tabla', () => {
    const plan = filesToApply([{ kind: 'policy', key: 'public.careers.careers members read', change: 'missing' }], files)
    expect(plan.ordered).toEqual([{ file: '02_academic_relational_schema.sql', reasons: ['policy public.careers.careers members read (missing)'] }])
  })
})
