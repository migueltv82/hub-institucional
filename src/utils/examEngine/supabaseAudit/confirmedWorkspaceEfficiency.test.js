import { describe, expect, it, vi } from 'vitest'
import {
  buildConfirmedWorkspaceEfficiencyReport,
  buildSnapshotNotFoundReport,
  chooseFinalRecommendation,
  getPayloadCounts,
  groupFailureCauses,
  readConfirmedWorkspaceSnapshot,
} from './confirmedWorkspaceEfficiency.js'

const institutionId = '95dcde93-6065-4dd8-89af-fee40b9ce028'
const workspaceKey = 'main'
const payload = {
  alumnos: Array.from({ length: 3 }, (_, index) => ({ id: `alumno-${index}` })),
  docentes: Array.from({ length: 2 }, (_, index) => ({ id: `docente-${index}` })),
  horariosDocentes: Array.from({ length: 4 }, (_, index) => ({ id: `horario-${index}` })),
  planesEstudio: Array.from({ length: 5 }, (_, index) => ({ id: `materia-${index}` })),
  correlatividades: Array.from({ length: 6 }, (_, index) => ({ id: `correlatividad-${index}` })),
}
const row = {
  id: 'snapshot-1',
  institution_id: institutionId,
  workspace_key: workspaceKey,
  updated_at: '2026-06-09T23:12:05.479Z',
  payload,
}

function createSupabaseMock(responses = []) {
  const responseQueue = [...responses]
  const builders = []
  const supabase = {
    from: vi.fn(() => {
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
          return responseQueue.shift() ?? { data: [], error: null }
        }),
        insert: vi.fn(() => {
          throw new Error('insert no debe llamarse')
        }),
        upsert: vi.fn(() => {
          throw new Error('upsert no debe llamarse')
        }),
        update: vi.fn(() => {
          throw new Error('update no debe llamarse')
        }),
        delete: vi.fn(() => {
          throw new Error('delete no debe llamarse')
        }),
      }

      builders.push(builder)
      return builder
    }),
    rpc: vi.fn(() => {
      throw new Error('rpc no debe llamarse')
    }),
  }

  return { supabase, builders }
}

describe('readConfirmedWorkspaceSnapshot', () => {
  it('lee snapshot confirmado con filtros exactos sin operaciones de escritura', async () => {
    const { supabase, builders } = createSupabaseMock([
      { data: [row], error: null },
    ])

    const result = await readConfirmedWorkspaceSnapshot({ supabase, institutionId, workspaceKey })

    expect(result.ok).toBe(true)
    expect(result.snapshot).toEqual(payload)
    expect(result.snapshot).not.toBe(payload)
    expect(result.metadata).toMatchObject({
      source: 'supabase',
      table: 'workspace_snapshots',
      institutionId,
      workspaceKey,
      updatedAt: '2026-06-09T23:12:05.479Z',
      readMode: 'exact-filter',
      readOnly: true,
    })
    expect(supabase.from).toHaveBeenCalledWith('workspace_snapshots')
    expect(builders[0].select).toHaveBeenCalledWith('*')
    expect(builders[0].eq).toHaveBeenCalledWith('institution_id', institutionId)
    expect(builders[0].eq).toHaveBeenCalledWith('workspace_key', workspaceKey)
    expect(builders[0].order).toHaveBeenCalledWith('updated_at', { ascending: false })
    expect(builders[0].limit).toHaveBeenCalledWith(1)
    expect(builders[0].insert).not.toHaveBeenCalled()
    expect(builders[0].upsert).not.toHaveBeenCalled()
    expect(builders[0].update).not.toHaveBeenCalled()
    expect(builders[0].delete).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('diagnostica 0 filas visibles sin imprimir payload sensible', async () => {
    const { supabase } = createSupabaseMock([
      { data: [], error: null },
      { data: [], error: null },
    ])

    const result = await readConfirmedWorkspaceSnapshot({ supabase, institutionId, workspaceKey })
    const report = buildSnapshotNotFoundReport({
      diagnostic: result.diagnostic,
      institutionId,
      workspaceKey,
    })
    const serialized = JSON.stringify(report)

    expect(result.ok).toBe(false)
    expect(report.diagnostic.visibleRows).toBe(0)
    expect(report.diagnostic.possibleRlsOrSessionIssue).toBe(true)
    expect(serialized).not.toContain('alumno-')
    expect(serialized).not.toContain('docente-')
  })
})

describe('confirmed workspace report helpers', () => {
  it('cuenta payload sin exponer filas', () => {
    expect(getPayloadCounts(payload)).toEqual({
      alumnos: 3,
      docentes: 2,
      horariosDocentes: 4,
      planesEstudio: 5,
      correlatividades: 6,
    })
  })

  it('agrupa causas por categorias seguras', () => {
    const causes = groupFailureCauses({
      contract: {
        errors: [
          { code: 'TITULAR_REQUIRED', message: 'Docente Real no visible' },
          { code: 'CORRELATIVIDAD_CONFLICTIVA' },
        ],
        warnings: [
          { code: 'VOCAL_SIN_AFINIDAD' },
          { code: 'SIN_FECHA_VALIDA' },
        ],
        preview: {
          unassignedMesas: [
            {
              reason: 'TITULAR_NO_DISPONIBLE',
              errors: [{ code: 'DOCENTE_SUPERPUESTO' }],
            },
          ],
        },
      },
      input: {
        fechasDisponibles: [],
        materias: [{ id: 'm1' }],
        docentes: [{ id: 'd1' }],
      },
    })

    expect(causes.sinTitular.count).toBeGreaterThan(0)
    expect(causes.titularSinDisponibilidad.count).toBeGreaterThan(0)
    expect(causes.vocalesSinAfinidad.count).toBeGreaterThan(0)
    expect(causes.faltaDeFechas.count).toBeGreaterThan(0)
    expect(causes.fechaNoAsignable.count).toBeGreaterThan(0)
    expect(causes.correlatividadConflictiva.count).toBeGreaterThan(0)
    expect(JSON.stringify(causes)).not.toContain('Docente Real')
  })

  it('elige recomendacion final segun metricas', () => {
    expect(chooseFinalRecommendation({
      conclusion: 'EFICIENTE',
      totalCriticalErrors: 0,
      totalMesas: 10,
    })).toBe('listo para integración interna en modo preview')

    expect(chooseFinalRecommendation({
      conclusion: 'PARCIALMENTE EFICIENTE',
      totalCriticalErrors: 2,
      totalMesas: 10,
    })).toBe('requiere ajustes de datos/adaptador antes de integrar')

    expect(chooseFinalRecommendation({
      conclusion: 'NO EFICIENTE',
      totalMesas: 0,
      totalPlanned: 0,
    })).toBe('no integrar todavía')
  })

  it('arma informe seguro sin payload completo', () => {
    const report = buildConfirmedWorkspaceEfficiencyReport({
      metadata: {
        table: 'workspace_snapshots',
        institutionId,
        workspaceKey,
        updatedAt: '2026-06-09T23:12:05.479Z',
        readMode: 'exact-filter',
      },
      snapshot: payload,
      input: {
        materias: [{ id: 'm1' }],
        docentes: [{ id: 'd1' }],
        fechasDisponibles: [{ fecha: '2026-07-27' }],
      },
      summary: {
        totalMaterias: 1,
        totalDocentes: 1,
        totalFechasDisponibles: 1,
        conclusion: 'EFICIENTE',
        totalCriticalErrors: 0,
        totalMesas: 1,
        totalPlanned: 1,
      },
      contract: {},
      durationMs: 12,
    })
    const serialized = JSON.stringify(report)

    expect(report.source.counts).toEqual(getPayloadCounts(payload))
    expect(report.finalRecommendation).toBe('listo para integración interna en modo preview')
    expect(serialized).not.toContain('alumno-')
    expect(serialized).not.toContain('docente-')
    expect(serialized).not.toContain('horario-')
  })
})
