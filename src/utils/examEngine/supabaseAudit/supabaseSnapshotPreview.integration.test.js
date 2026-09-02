import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { legacyWorkspaceSnapshotInstitutional } from '../comparison/__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js'
import { buildLegacyWorkspaceSnapshotFromSupabase } from './buildLegacyWorkspaceSnapshotFromSupabase.js'

function clone(value) {
  return structuredClone(value)
}

function hasRaw(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)

  if (Object.prototype.hasOwnProperty.call(value, 'raw')) return true
  if (Array.isArray(value)) return value.some((entry) => hasRaw(entry, seen))
  return Object.values(value).some((entry) => hasRaw(entry, seen))
}

function sourceFor(paths = []) {
  return paths
    .map((sourcePath) => readFileSync(join(process.cwd(), sourcePath), 'utf8'))
    .join('\n')
}

function createReadOnlySupabaseMock({ row }) {
  const builder = {
    select: vi.fn(function select() {
      return this
    }),
    eq: vi.fn(function eq() {
      return this
    }),
    order: vi.fn(function order() {
      return this
    }),
    limit: vi.fn(async function limit() {
      return {
        data: [row],
        error: null,
      }
    }),
    insert: vi.fn(() => {
      throw new Error('insert no debe llamarse en modo solo lectura')
    }),
    upsert: vi.fn(() => {
      throw new Error('upsert no debe llamarse en modo solo lectura')
    }),
    update: vi.fn(() => {
      throw new Error('update no debe llamarse en modo solo lectura')
    }),
    delete: vi.fn(() => {
      throw new Error('delete no debe llamarse en modo solo lectura')
    }),
  }

  return {
    supabase: {
      from: vi.fn(() => builder),
      rpc: vi.fn(() => {
        throw new Error('rpc no debe llamarse en modo solo lectura')
      }),
    },
    builder,
  }
}

describe('supabase snapshot preview integration', () => {
  it('lee snapshot mockeado, lo adapta y ejecuta el preview nuevo', async () => {
    const payload = clone(legacyWorkspaceSnapshotInstitutional)
    const originalPayload = clone(payload)
    const row = {
      id: 'workspace-snapshot-institutional-1',
      institution_id: 'institution-internal-audit',
      created_at: '2026-06-05T12:00:00.000Z',
      payload,
    }
    const { supabase, builder } = createReadOnlySupabaseMock({ row })

    const readResult = await buildLegacyWorkspaceSnapshotFromSupabase({
      supabase,
      institutionId: 'institution-internal-audit',
    })

    expect(readResult.snapshot).toEqual(payload)
    expect(readResult.snapshot).not.toBe(payload)
    expect(readResult.metadata).toEqual({
      source: 'supabase',
      table: 'workspace_snapshots',
      snapshotId: 'workspace-snapshot-institutional-1',
      institutionId: 'institution-internal-audit',
      createdAt: '2026-06-05T12:00:00.000Z',
      readOnly: true,
      orderByUsed: null,
      fallbackWithoutCreatedAt: false,
      payloadKeyUsed: 'payload',
      idKeyUsed: 'id',
      institutionKeyUsed: 'institution_id',
      timestampKeyUsed: 'created_at',
      schema: {
        ok: true,
        columns: ['id', 'institution_id', 'created_at', 'payload'],
        hasPayload: true,
        payloadCandidateKeys: ['payload'],
        timestampCandidateKeys: ['created_at'],
        idCandidateKeys: ['id'],
        institutionCandidateKeys: ['institution_id'],
      },
    })
    expect(supabase.from).toHaveBeenCalledWith('workspace_snapshots')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(builder.eq).toHaveBeenCalledWith('institution_id', 'institution-internal-audit')
    expect(builder.order).not.toHaveBeenCalled()
    expect(builder.limit).toHaveBeenCalledWith(1)

    const input = buildRegularExamInputFromWorkspaceSnapshot(readResult.snapshot)
    const originalInput = clone(input)

    expect(input).toMatchObject({
      docentes: expect.any(Array),
      materias: expect.any(Array),
      correlatividades: expect.any(Array),
      fechasDisponibles: expect.any(Array),
      config: expect.any(Object),
      options: expect.any(Object),
      metadata: expect.any(Object),
    })
    expect(input.docentes.length).toBeGreaterThan(0)
    expect(input.materias.length).toBeGreaterThan(0)
    expect(input.fechasDisponibles.length).toBeGreaterThan(0)

    const contract = buildRegularExamPreviewIntegrationContract(input, {})

    expect(contract.phase).toMatch(/^(success|warning|critical)$/)
    expect(contract.validation.valid).toBe(true)
    expect(contract.uiDto).toEqual(expect.any(Object))
    expect(contract.filteredDto).toEqual(expect.any(Object))
    expect(contract.uiDto.uiSummary).toEqual(expect.any(Object))

    const planned = contract.filteredDto?.uiTables?.planned ?? []
    const unassigned = contract.filteredDto?.uiTables?.unassigned ?? []
    expect(planned.length + unassigned.length).toBeGreaterThan(0)
    expect(hasRaw(contract)).toBe(false)

    expect(payload).toEqual(originalPayload)
    expect(input).toEqual(originalInput)
    expect(builder.insert).not.toHaveBeenCalled()
    expect(builder.upsert).not.toHaveBeenCalled()
    expect(builder.update).not.toHaveBeenCalled()
    expect(builder.delete).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('mantiene el flujo aislado de cliente real, motor viejo, adaptadores prohibidos y UI', () => {
    const source = sourceFor([
      'src/utils/examEngine/supabaseAudit/supabaseSnapshotPreview.integration.test.js',
      'src/utils/examEngine/supabaseAudit/buildLegacyWorkspaceSnapshotFromSupabase.js',
      'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js',
      'src/utils/examEngine/preview/buildRegularExamPreviewIntegrationContract.js',
    ])
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')
    const routerPackage = ['react', '-router-dom'].join('')
    const realClient = ['supabase', 'Client'].join('')
    const libSupabaseFromParent = ['../lib/', 'supabase'].join('')
    const libSupabaseFromNested = ['../../../lib/', 'supabase'].join('')

    expect(source).not.toContain(realClient)
    expect(source).not.toContain(libSupabaseFromParent)
    expect(source).not.toContain(libSupabaseFromNested)
    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(adapter)
    expect(source).not.toContain(routerPackage)
    expect(source).not.toMatch(/from\s+['"].*components/)
  })
})
