import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWorkspaceSnapshot } from './workspaceSnapshot.js'

const mocks = vi.hoisted(() => ({
  workspaceRow: null,
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
  }
}

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => createWorkspaceQuery(),
  },
}))

vi.mock('./teacherAcademicRecords.js', () => ({
  fetchTeacherAcademicRecords: vi.fn().mockResolvedValue({
    skipped: false,
    disponibilidadDocente: [],
    cargaHorariaDocente: [],
  }),
  mergeTeacherAcademicRecordsIntoSnapshot: (snapshot) => snapshot,
  syncTeacherAcademicRecords: vi.fn(),
}))

vi.mock('./rosterRecords.js', () => ({
  syncRosterRecords: vi.fn(),
}))

// Este escenario es exactamente el bug reportado: el navegador tiene una
// copia local vieja/incompleta en localStorage con fecha mas reciente que
// la real en Supabase (por ejemplo, de una sesion de prueba anterior en la
// misma compu). Para el admin eso protege ediciones sin guardar, pero para
// el portal alumno (que nunca escribe local) tapaba los datos reales.
describe('fetchWorkspaceSnapshot: preferencia local vs remoto', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.workspaceRow = {
      payload: { planesEstudio: [{ carrera: 'INGLES', materia: 'ING01' }] },
      updated_at: '2026-08-01T10:00:00.000Z',
    }
    localStorage.setItem(
      'mesaflow.workspace:inst-1:main',
      JSON.stringify({
        payload: { planesEstudio: [] },
        updatedAt: '2026-08-15T10:00:00.000Z',
      }),
    )
  })

  it('por defecto (admin) prefiere la copia local si es mas nueva', async () => {
    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: true,
    })

    expect(result.source).toBe('local')
    expect(result.snapshot.planesEstudio).toEqual([])
  })

  it('con preferLocalWhenNewer=false (portal alumno) siempre usa Supabase', async () => {
    const result = await fetchWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: true,
      preferLocalWhenNewer: false,
    })

    expect(result.source).toBe('supabase')
    expect(result.snapshot.planesEstudio).toEqual([{ carrera: 'INGLES', materia: 'ING01' }])
  })
})
