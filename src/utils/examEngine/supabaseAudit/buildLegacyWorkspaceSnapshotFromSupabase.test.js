import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  buildLegacyWorkspaceSnapshotFromSupabase,
  inspectWorkspaceSnapshotsSchema,
} from './buildLegacyWorkspaceSnapshotFromSupabase.js'

const samplePayload = {
  alumnos: [],
  horariosDocentes: [{ docenteId: 'doc-1', profesor: 'Docente 1' }],
  docentes: [{ id: 'doc-1', nombre: 'Docente 1' }],
  planesEstudio: [{ id: 'subject-1', materia: 'MAT1' }],
  correlatividades: [],
  fechaInicio: '2026-07-27',
  fechaFin: '2026-08-07',
  examGenerationConfig: {
    examType: 'regular',
    generationScope: {},
    regularCallRanges: {
      first: {
        start: '2026-07-27',
        end: '2026-08-07',
      },
    },
    selectedSpecialSubjectKeys: [],
  },
}

const sampleRow = {
  id: 'snapshot-1',
  institution_id: 'institution-1',
  created_at: '2026-06-05T12:00:00.000Z',
  payload: samplePayload,
}

function readFunctionSource() {
  return readFileSync(
    join(process.cwd(), 'src/utils/examEngine/supabaseAudit/buildLegacyWorkspaceSnapshotFromSupabase.js'),
    'utf8',
  )
}

function createReadOnlySupabaseMock({ data = [sampleRow], error = null, responses = null } = {}) {
  const responseQueue = Array.isArray(responses) ? [...responses] : null
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
      if (responseQueue) {
        return responseQueue.shift() ?? { data, error }
      }
      return { data, error }
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
  const supabase = {
    from: vi.fn(() => builder),
    rpc: vi.fn(() => {
      throw new Error('rpc no debe llamarse en modo solo lectura')
    }),
  }

  return { supabase, builder }
}

describe('inspectWorkspaceSnapshotsSchema', () => {
  it('devuelve columnas y candidatos sin valores sensibles', async () => {
    const sensitiveRow = {
      uuid: 'snapshot-secret-id',
      schoolId: 'school-secret-id',
      savedAt: '2026-06-05T12:00:00.000Z',
      data: {
        docentes: [{ nombre: 'Nombre Real Sensible', email: 'persona@example.com' }],
      },
      email: 'persona@example.com',
    }
    const { supabase, builder } = createReadOnlySupabaseMock({ data: [sensitiveRow] })

    const result = await inspectWorkspaceSnapshotsSchema({ supabase })

    expect(supabase.from).toHaveBeenCalledWith('workspace_snapshots')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(builder.order).not.toHaveBeenCalled()
    expect(builder.limit).toHaveBeenCalledWith(1)
    expect(builder.insert).not.toHaveBeenCalled()
    expect(builder.upsert).not.toHaveBeenCalled()
    expect(builder.update).not.toHaveBeenCalled()
    expect(builder.delete).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      columns: ['uuid', 'schoolId', 'savedAt', 'data', 'email'],
      hasPayload: true,
      payloadCandidateKeys: ['data'],
      timestampCandidateKeys: ['savedAt'],
      idCandidateKeys: ['uuid'],
      institutionCandidateKeys: ['schoolId'],
    })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('Nombre Real Sensible')
    expect(serialized).not.toContain('persona@example.com')
    expect(serialized).not.toContain('snapshot-secret-id')
    expect(serialized).not.toContain('school-secret-id')
    expect(serialized).not.toContain('2026-06-05T12:00:00.000Z')
  })
})

describe('buildLegacyWorkspaceSnapshotFromSupabase', () => {
  it('lee workspace_snapshots con select star y limit sin depender de columnas fijas', async () => {
    const { supabase, builder } = createReadOnlySupabaseMock()

    await buildLegacyWorkspaceSnapshotFromSupabase({ supabase })

    expect(supabase.from).toHaveBeenCalledWith('workspace_snapshots')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(builder.order).not.toHaveBeenCalled()
    expect(builder.limit).toHaveBeenCalledWith(1)
  })

  it('funciona con tabla que solo tiene payload', async () => {
    const { supabase } = createReadOnlySupabaseMock({
      data: [{ payload: samplePayload }],
    })

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({ supabase })

    expect(result.snapshot).toEqual(samplePayload)
    expect(result.metadata).toMatchObject({
      snapshotId: null,
      institutionId: null,
      createdAt: null,
      payloadKeyUsed: 'payload',
      idKeyUsed: null,
      institutionKeyUsed: null,
      timestampKeyUsed: null,
      readOnly: true,
    })
  })

  it('funciona con columna data en vez de payload', async () => {
    const row = {
      uuid: 'snapshot-2',
      school_id: 'institution-2',
      updatedAt: '2026-06-06T12:00:00.000Z',
      data: samplePayload,
    }
    const { supabase } = createReadOnlySupabaseMock({ data: [row] })

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({ supabase })

    expect(result.snapshot).toEqual(samplePayload)
    expect(result.metadata).toMatchObject({
      snapshotId: 'snapshot-2',
      institutionId: 'institution-2',
      createdAt: '2026-06-06T12:00:00.000Z',
      payloadKeyUsed: 'data',
      idKeyUsed: 'uuid',
      institutionKeyUsed: 'school_id',
      timestampKeyUsed: 'updatedAt',
    })
  })

  it('funciona sin id', async () => {
    const { supabase } = createReadOnlySupabaseMock({
      data: [{
        institutionId: 'institution-3',
        createdAt: '2026-06-07T12:00:00.000Z',
        payload: samplePayload,
      }],
    })

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({ supabase })

    expect(result.metadata.snapshotId).toBeNull()
    expect(result.metadata.institutionId).toBe('institution-3')
    expect(result.metadata.createdAt).toBe('2026-06-07T12:00:00.000Z')
  })

  it('funciona sin created_at', async () => {
    const { supabase } = createReadOnlySupabaseMock({
      data: [{
        id: 'snapshot-no-created-at',
        institution_id: 'institution-1',
        payload: samplePayload,
      }],
    })

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({ supabase })

    expect(result.metadata.snapshotId).toBe('snapshot-no-created-at')
    expect(result.metadata.createdAt).toBeNull()
    expect(result.metadata.fallbackWithoutCreatedAt).toBe(false)
  })

  it('respeta payloadKey explicito', async () => {
    const { supabase } = createReadOnlySupabaseMock({
      data: [{
        payload: { descartado: true },
        workspace_payload: samplePayload,
      }],
    })

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({
      supabase,
      payloadKey: 'workspace_payload',
    })

    expect(result.snapshot).toEqual(samplePayload)
    expect(result.metadata.payloadKeyUsed).toBe('workspace_payload')
  })

  it('filtra por institutionId si se pasa y se conoce institutionKey', async () => {
    const { supabase, builder } = createReadOnlySupabaseMock()

    await buildLegacyWorkspaceSnapshotFromSupabase({
      supabase,
      institutionId: 'institution-1',
    })

    expect(builder.eq).toHaveBeenCalledWith('institution_id', 'institution-1')
  })

  it('puede ordenar solo si se pide orderBy explicitamente', async () => {
    const { supabase, builder } = createReadOnlySupabaseMock()

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({
      supabase,
      orderBy: 'created_at',
    })

    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(result.metadata.orderByUsed).toBe('created_at')
  })

  it('hace fallback sin order si orderBy por created_at falla', async () => {
    const { supabase, builder } = createReadOnlySupabaseMock({
      responses: [
        {
          data: null,
          error: {
            code: 'PGRST204',
            message: 'Could not find the created_at column of workspace_snapshots in the schema cache',
          },
        },
        {
          data: [{
            payload: samplePayload,
          }],
          error: null,
        },
      ],
    })

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({
      supabase,
      orderBy: 'created_at',
    })

    expect(supabase.from).toHaveBeenCalledTimes(2)
    expect(builder.select).toHaveBeenNthCalledWith(1, '*')
    expect(builder.select).toHaveBeenNthCalledWith(2, '*')
    expect(builder.order).toHaveBeenCalledTimes(1)
    expect(result.metadata.orderByUsed).toBeNull()
    expect(result.metadata.fallbackWithoutCreatedAt).toBe(true)
  })

  it('funciona con orderBy = null sin aplicar order', async () => {
    const { supabase, builder } = createReadOnlySupabaseMock()

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({
      supabase,
      orderBy: null,
    })

    expect(builder.order).not.toHaveBeenCalled()
    expect(result.metadata).toMatchObject({
      orderByUsed: null,
      fallbackWithoutCreatedAt: false,
    })
  })

  it('devuelve error claro si no hay payload/data/snapshot candidato', async () => {
    const { supabase } = createReadOnlySupabaseMock({
      data: [{
        id: 'snapshot-without-payload',
        created_at: '2026-06-05T12:00:00.000Z',
        descripcion: 'fila sin snapshot',
      }],
    })

    await expect(buildLegacyWorkspaceSnapshotFromSupabase({ supabase }))
      .rejects
      .toThrow('No se encontro columna de payload compatible en workspace_snapshots.')
  })

  it('devuelve snapshot clonado desde el payload resuelto', async () => {
    const { supabase } = createReadOnlySupabaseMock()

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({ supabase })

    expect(result.snapshot).toEqual(samplePayload)
    expect(result.snapshot).not.toBe(samplePayload)
  })

  it('devuelve metadata readOnly true y tolera claves reales ausentes', async () => {
    const { supabase } = createReadOnlySupabaseMock()

    const result = await buildLegacyWorkspaceSnapshotFromSupabase({ supabase })

    expect(result.metadata).toMatchObject({
      source: 'supabase',
      table: 'workspace_snapshots',
      snapshotId: 'snapshot-1',
      institutionId: 'institution-1',
      createdAt: '2026-06-05T12:00:00.000Z',
      readOnly: true,
      orderByUsed: null,
      fallbackWithoutCreatedAt: false,
      payloadKeyUsed: 'payload',
      idKeyUsed: 'id',
      institutionKeyUsed: 'institution_id',
      timestampKeyUsed: 'created_at',
    })
  })

  it('falla controlado si no hay datos', async () => {
    const { supabase } = createReadOnlySupabaseMock({ data: [] })

    await expect(buildLegacyWorkspaceSnapshotFromSupabase({ supabase }))
      .rejects
      .toThrow('No se encontro workspace snapshot en Supabase para auditar.')
  })

  it('falla controlado si Supabase devuelve error', async () => {
    const { supabase } = createReadOnlySupabaseMock({
      data: null,
      error: { message: 'RLS denied' },
    })

    await expect(buildLegacyWorkspaceSnapshotFromSupabase({ supabase }))
      .rejects
      .toThrow('No se pudo leer workspace snapshot desde Supabase: RLS denied')
  })

  it('no llama insert/upsert/update/delete/rpc', async () => {
    const { supabase, builder } = createReadOnlySupabaseMock()

    await buildLegacyWorkspaceSnapshotFromSupabase({ supabase })

    expect(builder.insert).not.toHaveBeenCalled()
    expect(builder.upsert).not.toHaveBeenCalled()
    expect(builder.update).not.toHaveBeenCalled()
    expect(builder.delete).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('no importa supabaseClient ni cliente real', () => {
    const source = readFunctionSource()

    expect(source).not.toContain('supabaseClient')
    expect(source).not.toContain('../lib/supabase')
    expect(source).not.toContain('../../../lib/supabase')
  })

  it('no toca motor viejo ni UI', () => {
    const source = readFunctionSource()
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')
    const routerPackage = ['react', '-router-dom'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(adapter)
    expect(source).not.toContain(routerPackage)
    expect(source).not.toContain('components/')
  })
})
