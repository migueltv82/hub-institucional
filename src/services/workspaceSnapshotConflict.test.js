import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  discardLocalWorkspaceSnapshot,
  fetchWorkspaceSnapshot,
  isWorkspaceConflictError,
  refreshKnownWorkspaceVersion,
  saveWorkspaceSnapshot,
} from './workspaceSnapshot.js'

// Base simulada con UNA fila de workspace_snapshots y su updated_at. Las otras tablas responden vacio.
const db = vi.hoisted(() => ({ row: null, clock: 0, writes: [] }))
const nextVersion = () => `2026-10-20T12:00:${String(++db.clock).padStart(2, '0')}.000Z`

function query(table) {
  const state = { filters: {}, mode: 'select', value: null }
  const builder = {
    select() { return builder },
    eq(column, value) { state.filters[column] = value; return builder },
    in() { return builder },
    delete() { state.mode = 'delete'; return builder },
    update(value) { state.mode = 'update'; state.value = value; return builder },
    upsert(value) { state.mode = 'upsert'; state.value = value; return builder },
    maybeSingle() { return Promise.resolve({ data: table === 'workspace_snapshots' ? db.row : null, error: null }) },
    then(resolve) {
      if (table !== 'workspace_snapshots') return resolve({ data: [], error: null })
      if (state.mode === 'update') {
        if (!db.row || (state.filters.updated_at && state.filters.updated_at !== db.row.updated_at)) return resolve({ data: [], error: null })
        db.row = { ...db.row, ...state.value, updated_at: nextVersion() }
        db.writes.push('update')
        return resolve({ data: [{ updated_at: db.row.updated_at }], error: null })
      }
      if (state.mode === 'upsert') {
        db.row = { ...state.value, updated_at: nextVersion() }
        db.writes.push('upsert')
        return resolve({ data: [{ updated_at: db.row.updated_at }], error: null })
      }
      return resolve({ data: db.row ? [db.row] : [], error: null })
    },
  }
  return builder
}

vi.mock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { from: (table) => query(table) } }))
vi.mock('./teacherAcademicRecords.js', () => ({
  fetchTeacherAcademicRecords: vi.fn().mockResolvedValue({ skipped: true, disponibilidadDocente: [], cargaHorariaDocente: [] }),
  mergeTeacherAcademicRecordsIntoSnapshot: (snapshot) => snapshot,
  syncTeacherAcademicRecords: vi.fn().mockResolvedValue({}),
}))
vi.mock('./subjectTeacherAssignments.js', () => ({ fetchSubjectTeacherAssignments: vi.fn().mockResolvedValue([]) }))
vi.mock('./rosterRecords.js', () => ({ syncRosterRecords: vi.fn().mockResolvedValue({}) }))

const params = { institutionId: 'inst-conflict', workspaceKey: 'main', useRemote: true }
const save = (payload, extra = {}) => saveWorkspaceSnapshot({ ...params, ownerEmail: 'a@x.invalid', ownerUserId: 'u1', payload, syncOperational: false, ...extra })
const otherSessionWrites = (payload) => { db.row = { ...db.row, payload, updated_at: nextVersion() } }

describe('workspaceSnapshot: aviso de conflicto entre sesiones', () => {
  beforeEach(() => {
    localStorage.clear()
    db.row = { institution_id: params.institutionId, workspace_key: 'main', payload: { docentes: [{ id: 'd1' }] }, updated_at: nextVersion() }
    db.writes = []
    discardLocalWorkspaceSnapshot(params)
  })

  it('guarda sobre la version que cargo y sigue guardando sobre la suya', async () => {
    await fetchWorkspaceSnapshot({ ...params, preferLocalWhenNewer: false })
    await save({ docentes: [{ id: 'd1' }, { id: 'd2' }] })
    await save({ docentes: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }] })
    expect(db.writes).toEqual(['update', 'update'])
    expect(db.row.payload.docentes).toHaveLength(3)
  })

  it('si otra sesion guardo en el medio, no la pisa: avisa y deja la copia local', async () => {
    await fetchWorkspaceSnapshot({ ...params, preferLocalWhenNewer: false })
    otherSessionWrites({ docentes: [{ id: 'otra-sesion' }] })
    const error = await save({ docentes: [{ id: 'mio' }] }).catch((failure) => failure)
    expect(isWorkspaceConflictError(error)).toBe(true)
    expect(error.remoteUpdatedAt).toBe(db.row.updated_at)
    expect(db.row.payload.docentes).toEqual([{ id: 'otra-sesion' }])
    expect(localStorage.getItem('mesaflow.workspace:inst-conflict:main')).toContain('"mio"')
  })

  it('"subir los mios igual" (force) pisa a conciencia y retoma desde esa version', async () => {
    await fetchWorkspaceSnapshot({ ...params, preferLocalWhenNewer: false })
    otherSessionWrites({ docentes: [{ id: 'otra-sesion' }] })
    await save({ docentes: [{ id: 'mio' }] }).catch(() => {})
    await save({ docentes: [{ id: 'mio' }] }, { force: true })
    expect(db.row.payload.docentes).toEqual([{ id: 'mio' }])
    await save({ docentes: [{ id: 'mio' }, { id: 'otro' }] })
    expect(db.writes).toEqual(['upsert', 'update'])
  })

  it('"ver los cambios" descarta la copia local y la proxima carga trae la de la otra sesion', async () => {
    await fetchWorkspaceSnapshot({ ...params, preferLocalWhenNewer: false })
    otherSessionWrites({ docentes: [{ id: 'otra-sesion' }] })
    await save({ docentes: [{ id: 'mio' }] }).catch(() => {})
    discardLocalWorkspaceSnapshot(params)
    const reloaded = await fetchWorkspaceSnapshot(params)
    expect(reloaded.snapshot.docentes).toEqual([{ id: 'otra-sesion' }])
    await save({ docentes: [{ id: 'otra-sesion' }, { id: 'mio' }] })
    expect(db.row.payload.docentes).toHaveLength(2)
  })

  it('una copia local editada sin conexion se compara contra la version de la que partio', async () => {
    await fetchWorkspaceSnapshot({ ...params, preferLocalWhenNewer: false })
    otherSessionWrites({ docentes: [{ id: 'otra-sesion' }] })
    // Copia local mas nueva que la remota, basada en la version anterior.
    const key = 'mesaflow.workspace:inst-conflict:main'
    localStorage.setItem(key, JSON.stringify({ payload: { docentes: [{ id: 'offline' }] }, updatedAt: '2099-01-01T00:00:00.000Z' }))
    const loaded = await fetchWorkspaceSnapshot(params)
    expect(loaded.snapshot.docentes).toEqual([{ id: 'offline' }])
    const error = await save({ docentes: [{ id: 'offline' }] }).catch((failure) => failure)
    expect(isWorkspaceConflictError(error)).toBe(true)
    expect(db.row.payload.docentes).toEqual([{ id: 'otra-sesion' }])
  })

  it('despues de una accion propia aplicada por la Edge, refrescar la version evita un falso conflicto', async () => {
    await fetchWorkspaceSnapshot({ ...params, preferLocalWhenNewer: false })
    otherSessionWrites({ docentes: [] })
    await refreshKnownWorkspaceVersion(params)
    await save({ docentes: [] })
    expect(db.writes).toEqual(['update'])
  })
})
