import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from './workspaceSnapshot.js'

const mocks = vi.hoisted(() => ({
  workspaceRow: null,
  upsert: vi.fn(),
  fetchTeacherAcademicRecords: vi.fn(),
  mergeTeacherAcademicRecordsIntoSnapshot: vi.fn((snapshot, records) => ({
    ...snapshot,
    disponibilidadDocente: records.disponibilidadDocente.length
      ? records.disponibilidadDocente
      : snapshot.disponibilidadDocente,
    cargaHorariaDocente: records.cargaHorariaDocente.length
      ? records.cargaHorariaDocente
      : snapshot.cargaHorariaDocente,
  })),
  syncTeacherAcademicRecords: vi.fn(),
  syncRosterRecords: vi.fn(),
}))

function createWorkspaceQuery() {
  return {
    select() {
      return this
    },
    eq() {
      return this
    },
    maybeSingle() {
      return {
        data: mocks.workspaceRow,
        error: null,
      }
    },
    upsert(payload) {
      mocks.upsert(payload)
      return { error: null }
    },
  }
}

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => createWorkspaceQuery(),
  },
}))

vi.mock('./teacherAcademicRecords.js', () => ({
  fetchTeacherAcademicRecords: mocks.fetchTeacherAcademicRecords,
  mergeTeacherAcademicRecordsIntoSnapshot: mocks.mergeTeacherAcademicRecordsIntoSnapshot,
  syncTeacherAcademicRecords: mocks.syncTeacherAcademicRecords,
}))

vi.mock('./rosterRecords.js', () => ({
  syncRosterRecords: mocks.syncRosterRecords,
}))

describe('workspaceSnapshot teacher academic persistence', () => {
  beforeEach(() => {
    mocks.workspaceRow = null
    mocks.upsert.mockReset()
    mocks.fetchTeacherAcademicRecords.mockReset()
    mocks.mergeTeacherAcademicRecordsIntoSnapshot.mockClear()
    mocks.syncTeacherAcademicRecords.mockReset()
    mocks.syncRosterRecords.mockReset()

    mocks.fetchTeacherAcademicRecords.mockResolvedValue({
      skipped: false,
      disponibilidadDocente: [],
      cargaHorariaDocente: [],
    })
    mocks.syncTeacherAcademicRecords.mockResolvedValue({
      source: 'supabase',
      availability: { skipped: false, synced: 0, deleted: 0 },
      workload: { skipped: false, synced: 0, deleted: 0 },
    })
    mocks.syncRosterRecords.mockResolvedValue({
      source: 'supabase',
      students: { skipped: false, synced: 0, deleted: 0 },
      teachers: { skipped: false, synced: 0, deleted: 0 },
    })
  })

  it('carga datos docentes relacionales hacia workspaceSnapshot remoto', async () => {
    mocks.workspaceRow = {
      payload: {
        disponibilidadDocente: [{ id: 'snapshot-disp' }],
        cargaHorariaDocente: [{ id: 'snapshot-load' }],
      },
      updated_at: '2026-07-07T10:00:00.000Z',
    }
    mocks.fetchTeacherAcademicRecords.mockResolvedValue({
      skipped: false,
      disponibilidadDocente: [{ id: 'rel-disp', docente: 'Ana', dia: 'Lunes' }],
      cargaHorariaDocente: [{ id: 'rel-load', docente: 'Ana', materia_codigo: 'ING1', horasCatedra: 4 }],
    })

    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: true,
    })

    expect(result.snapshot.disponibilidadDocente).toEqual([
      expect.objectContaining({ id: 'rel-disp' }),
    ])
    expect(result.snapshot.cargaHorariaDocente).toEqual([
      expect.objectContaining({ id: 'rel-load' }),
    ])
    expect(mocks.fetchTeacherAcademicRecords).toHaveBeenCalledWith({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: true,
    })
  })

  it('persiste cambios de UI hacia tablas docentes relacionales al guardar remoto', async () => {
    const payload = {
      docentes: [{ full_name: 'Ana Diaz', dni: '30111222' }],
      disponibilidadDocente: [{ docente: 'Ana Diaz', dia: 'Lunes', hora_desde: '18:00', hora_hasta: '20:00' }],
      cargaHorariaDocente: [{ docente: 'Ana Diaz', carrera: 'Profesorado', materia_codigo: 'ING1', horasCatedra: 4 }],
    }

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'admin-1',
      payload,
      useRemote: true,
    })

    expect(mocks.upsert).toHaveBeenCalled()
    expect(mocks.syncTeacherAcademicRecords).toHaveBeenCalledWith({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      snapshot: expect.objectContaining({
        disponibilidadDocente: payload.disponibilidadDocente,
        cargaHorariaDocente: payload.cargaHorariaDocente,
      }),
      useRemote: true,
    })
  })
})
