import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspacePersistence } from './useWorkspacePersistence.js'

const mocks = vi.hoisted(() => ({
  clearWorkspaceData: vi.fn(),
  discardLocalWorkspaceSnapshot: vi.fn(),
  fetchAccessibleInstitutions: vi.fn(),
  fetchExamEngineV21State: vi.fn(),
  fetchRelationalExamSnapshot: vi.fn(),
  fetchRelationalPreviewSetting: vi.fn(),
  fetchWorkspaceSnapshot: vi.fn(),
  isSupabaseConfigured: false,
  persistActiveInstitutionId: vi.fn(),
  readStoredActiveInstitutionId: vi.fn(),
  saveWorkspaceSnapshot: vi.fn(),
  saveExamEngineV21State: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../lib/supabase.js', () => ({
  get isSupabaseConfigured() {
    return mocks.isSupabaseConfigured
  },
  get supabase() {
    return mocks.isSupabaseConfigured ? {} : null
  },
}))

vi.mock('../services/institutions.js', () => ({
  fetchAccessibleInstitutions: mocks.fetchAccessibleInstitutions,
  persistActiveInstitutionId: mocks.persistActiveInstitutionId,
  readStoredActiveInstitutionId: mocks.readStoredActiveInstitutionId,
}))

vi.mock('../services/workspaceSnapshot.js', () => ({
  clearWorkspaceData: mocks.clearWorkspaceData,
  createEmptyWorkspaceSnapshot: () => ({
    alumnos: [],
    docentes: [],
    docenteMateria: [],
    horariosDocentes: [],
    planesEstudio: [],
    correlatividades: [],
    uploadedFiles: {
      masterWorkbook: null,
      docentesWorkbook: null,
      alumnosWorkbook: null,
      horarios: null,
      planes: null,
      correlatividades: null,
      alumnos: null,
      docentes: null,
      docenteMateria: null,
    },
    fechaInicio: '',
    fechaFin: '',
    cronograma: [],
    examEngineV21State: null,
    requiereRegeneracion: false,
  }),
  fetchWorkspaceSnapshot: mocks.fetchWorkspaceSnapshot,
  saveWorkspaceSnapshot: mocks.saveWorkspaceSnapshot,
  discardLocalWorkspaceSnapshot: mocks.discardLocalWorkspaceSnapshot,
  isWorkspaceConflictError: (error) => error?.code === 'WORKSPACE_CONFLICT',
}))

vi.mock('../services/relationalExamPreview.js', () => ({
  fetchRelationalExamSnapshot: mocks.fetchRelationalExamSnapshot,
  fetchRelationalPreviewSetting: mocks.fetchRelationalPreviewSetting,
}))

vi.mock('../services/examEngineV21State.js', () => ({
  fetchExamEngineV21State: mocks.fetchExamEngineV21State,
  saveExamEngineV21State: mocks.saveExamEngineV21State,
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
  },
}))

const institutions = [
  { id: 'institution-1', name: 'Instituto Uno' },
  { id: 'institution-2', name: 'Instituto Dos' },
]

const emptySnapshot = {
  horariosDocentes: [],
  planesEstudio: [],
  correlatividades: [],
  uploadedFiles: {
    horarios: null,
    planes: null,
    correlatividades: null,
  },
  fechaInicio: '',
  fechaFin: '',
  cronograma: [],
  examEngineV21State: null,
  requiereRegeneracion: false,
}

function renderPersistenceHook(props = {}) {
  return renderHook((hookProps) => useWorkspacePersistence(hookProps), {
    initialProps: {
      isRemoteSession: false,
      isSuperAdmin: false,
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      onHydrate: vi.fn(),
      snapshotPayload: emptySnapshot,
      ...props,
    },
  })
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

describe('useWorkspacePersistence', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    sessionStorage.clear()

    mocks.isSupabaseConfigured = false
    mocks.fetchAccessibleInstitutions.mockResolvedValue({ institutions })
    mocks.fetchRelationalPreviewSetting.mockResolvedValue(false)
    mocks.fetchRelationalExamSnapshot.mockResolvedValue({
      snapshot: emptySnapshot,
      diagnostics: { counts: {} },
    })
    mocks.fetchWorkspaceSnapshot.mockResolvedValue({
      snapshot: emptySnapshot,
      updatedAt: '2026-04-28T10:00:00.000Z',
      source: 'local',
    })
    mocks.fetchExamEngineV21State.mockImplementation(({ fallbackState } = {}) => Promise.resolve({
      state: fallbackState ?? null,
      updatedAt: null,
      source: 'workspace-snapshot',
    }))
    mocks.saveExamEngineV21State.mockResolvedValue({
      state: null,
      updatedAt: '2026-04-28T10:01:00.000Z',
      source: 'local',
    })
    mocks.saveWorkspaceSnapshot.mockResolvedValue({
      updatedAt: '2026-04-28T10:01:00.000Z',
      source: 'local',
    })
    mocks.clearWorkspaceData.mockResolvedValue({
      updatedAt: '2026-04-28T10:02:00.000Z',
      source: 'local',
      snapshot: emptySnapshot,
      cleanup: [],
    })
    mocks.readStoredActiveInstitutionId.mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('carga instituciones, respeta la seleccion guardada e hidrata el workspace', async () => {
    const onHydrate = vi.fn()
    const hydratedSnapshot = {
      ...emptySnapshot,
      fechaInicio: '2026-05-01',
      cronograma: [{ materia: 'Matematica' }],
    }

    mocks.readStoredActiveInstitutionId.mockReturnValue('institution-2')
    mocks.fetchWorkspaceSnapshot.mockResolvedValue({
      snapshot: hydratedSnapshot,
      updatedAt: '2026-04-28T11:00:00.000Z',
      source: 'local',
    })

    const { result } = renderPersistenceHook({ onHydrate })

    await waitFor(() => {
      expect(result.current.activeInstitutionId).toBe('institution-2')
    })

    expect(mocks.fetchAccessibleInstitutions).toHaveBeenCalledWith({
      isSuperAdmin: false,
      useRemote: false,
    })
    expect(result.current.activeInstitutionId).toBe('institution-2')
    expect(result.current.activeInstitution).toEqual(institutions[1])
    expect(mocks.fetchWorkspaceSnapshot).toHaveBeenCalledWith({
      institutionId: 'institution-2',
      workspaceKey: 'main',
      useRemote: false,
    })
    expect(onHydrate).toHaveBeenCalledWith(hydratedSnapshot)
    expect(result.current.lastSyncedAt).toBe('2026-04-28T11:00:00.000Z')
    expect(result.current.syncStatus).toBe('local-only')
  })

  it('hidrata la UI existente desde el schema relacional cuando la institucion tiene el flag activo', async () => {
    const onHydrate = vi.fn()
    mocks.isSupabaseConfigured = true
    mocks.fetchRelationalPreviewSetting.mockResolvedValue(true)
    mocks.fetchRelationalExamSnapshot.mockResolvedValue({
      snapshot: {
        alumnos: [{ id: 'student-1', full_name: 'Ana Perez' }],
        docentes: [{ id: 'teacher-1', full_name: 'Carla Ruiz' }],
        docenteMateria: [{ id: 'assignment-1' }],
        horariosDocentes: [{ id: 'schedule-1' }],
        planesEstudio: [{ id: 'subject-1' }],
        correlatividades: [],
        fechasBloqueadasDocente: [{ id: 'block-1' }],
      },
      diagnostics: {
        counts: {
          studentRecords: 1,
          teacherRecords: 1,
        },
      },
    })

    const { result } = renderPersistenceHook({
      contextInstitutions: [{ id: 'institution-remote', name: 'Instituto Remoto', role: 'admin' }],
      contextActiveInstitutionId: 'institution-remote',
      isRemoteSession: true,
      onHydrate,
    })

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false)
    })

    expect(mocks.fetchRelationalPreviewSetting).toHaveBeenCalledWith({
      institutionId: 'institution-remote',
      signal: expect.any(AbortSignal),
    })
    expect(mocks.fetchRelationalExamSnapshot).toHaveBeenCalledWith({
      institutionId: 'institution-remote',
      signal: expect.any(AbortSignal),
    })
    expect(mocks.fetchWorkspaceSnapshot).not.toHaveBeenCalled()
    expect(onHydrate).toHaveBeenCalledWith(expect.objectContaining({
      alumnos: [{ id: 'student-1', full_name: 'Ana Perez' }],
      docentes: [{ id: 'teacher-1', full_name: 'Carla Ruiz' }],
      fechasBloqueadasDocente: [{ id: 'block-1' }],
      uploadedFiles: expect.objectContaining({
        masterWorkbook: 'schema-relacional',
        docentesWorkbook: 'schema-relacional',
        alumnosWorkbook: 'schema-relacional',
      }),
      cronograma: [],
      requiereRegeneracion: false,
    }))
    expect(result.current.workspaceSource).toBe('academic-relational-schema')
    expect(result.current.isRelationalWorkspaceSource).toBe(true)
    expect(result.current.canWriteRemoteWorkspace).toBe(false)
    expect(result.current.syncStatus).toBe('read-only')
  })

  it('omite el auto-guardado inicial y guarda luego de un cambio del payload', async () => {
    const onHydrate = vi.fn()
    const { rerender, result } = renderPersistenceHook({ onHydrate })

    await waitFor(() => {
      expect(result.current.activeInstitutionId).toBe('institution-1')
    })
    await waitFor(() => {
      expect(onHydrate).toHaveBeenCalledWith(emptySnapshot)
    })
    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false)
    })
    await act(async () => {})

    rerender({
      isRemoteSession: false,
      isSuperAdmin: false,
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      onHydrate,
      snapshotPayload: { ...emptySnapshot },
    })
    await act(async () => {})

    expect(mocks.saveWorkspaceSnapshot).not.toHaveBeenCalled()

    const changedSnapshot = {
      ...emptySnapshot,
      fechaFin: '2026-05-31',
    }

    rerender({
      isRemoteSession: false,
      isSuperAdmin: false,
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      onHydrate,
      snapshotPayload: changedSnapshot,
    })

    await waitFor(() => {
      expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(result.current.lastSyncedAt).toBe('2026-04-28T10:01:00.000Z')
    })
    expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledWith({
      institutionId: 'institution-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      payload: changedSnapshot,
      useRemote: false,
      syncOperational: false,
      allowLargeRemotePayload: false,
    })
    expect(result.current.syncStatus).toBe('local-only')
  })

  it('no intenta guardar remotamente cuando el rol institucional es viewer', async () => {
    const onHydrate = vi.fn()
    mocks.fetchAccessibleInstitutions.mockResolvedValue({
      institutions: [{ id: 'institution-1', name: 'Instituto Uno', role: 'viewer' }],
    })

    const { rerender, result } = renderPersistenceHook({
      isRemoteSession: true,
      onHydrate,
    })

    await waitFor(() => {
      expect(result.current.activeInstitutionId).toBe('institution-1')
    })
    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false)
    })

    rerender({
      isRemoteSession: true,
      isSuperAdmin: false,
      ownerEmail: 'viewer@example.com',
      onHydrate,
      snapshotPayload: {
        ...emptySnapshot,
        fechaInicio: '2026-07-13',
      },
    })

    await waitFor(() => {
      expect(result.current.syncStatus).toBe('read-only')
    })
    expect(mocks.saveWorkspaceSnapshot).not.toHaveBeenCalled()
  })

  it('hidrata un snapshot inexistente dentro de la institucion solicitada', async () => {
    const onHydrate = vi.fn()
    mocks.fetchWorkspaceSnapshot.mockResolvedValue({
      snapshot: emptySnapshot,
      updatedAt: null,
      source: 'supabase',
    })

    const { result } = renderPersistenceHook({
      contextInstitutions: [{ id: 'institution-remote', name: 'Instituto Remoto', role: 'admin' }],
      contextActiveInstitutionId: 'institution-remote',
      isRemoteSession: true,
      onHydrate,
    })

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false)
    })

    expect(mocks.fetchWorkspaceSnapshot).toHaveBeenCalledWith({
      institutionId: 'institution-remote',
      workspaceKey: 'main',
      useRemote: true,
    })
    expect(onHydrate).toHaveBeenCalledWith(emptySnapshot)
    expect(result.current.lastSyncedAt).toBeNull()
    expect(result.current.syncStatus).toBe('saved')
  })

  it('hidrata el estado del motor de mesas desde su storage liviano', async () => {
    const onHydrate = vi.fn()
    const engineState = { version: 1, uiState: 'REVIEWED_IMPORTED' }
    mocks.fetchWorkspaceSnapshot.mockResolvedValue({
      snapshot: { ...emptySnapshot, examEngineV21State: null },
      updatedAt: '2026-04-28T10:00:00.000Z',
      source: 'supabase',
    })
    mocks.fetchExamEngineV21State.mockResolvedValue({
      state: engineState,
      updatedAt: '2026-04-28T10:01:00.000Z',
      source: 'supabase',
    })

    const { result } = renderPersistenceHook({
      contextInstitutions: [{ id: 'institution-remote', name: 'Instituto Remoto', role: 'admin' }],
      contextActiveInstitutionId: 'institution-remote',
      isRemoteSession: true,
      onHydrate,
    })

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false)
    })

    expect(mocks.fetchExamEngineV21State).toHaveBeenCalledWith({
      institutionId: 'institution-remote',
      workspaceKey: 'main',
      useRemote: true,
      fallbackState: null,
    })
    expect(onHydrate).toHaveBeenCalledWith(expect.objectContaining({
      examEngineV21State: engineState,
    }))
  })

  it('informa el error de carga y no hidrata despues de un fallo de red', async () => {
    const onHydrate = vi.fn()
    const networkCause = new Error('socket cerrado')
    const networkError = new Error('network unavailable', { cause: networkCause })
    mocks.fetchWorkspaceSnapshot.mockRejectedValue(networkError)

    const { result } = renderPersistenceHook({
      contextInstitutions: [{ id: 'institution-1', name: 'Instituto Uno', role: 'admin' }],
      contextActiveInstitutionId: 'institution-1',
      isRemoteSession: true,
      onHydrate,
    })

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false)
    })

    expect(result.current.syncStatus).toBe('error')
    expect(onHydrate).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      'No se pudo recuperar el workspace desde Supabase: network unavailable',
    )
    expect(networkError.cause).toBe(networkCause)
  })

  it('borra explicitamente la carga del workspace activo', async () => {
    const onHydrate = vi.fn()
    mocks.clearWorkspaceData.mockResolvedValue({
      updatedAt: '2026-04-28T10:05:00.000Z',
      source: 'supabase',
      snapshot: emptySnapshot,
      cleanup: [],
    })

    const { result } = renderPersistenceHook({
      contextInstitutions: [{ id: 'institution-remote', name: 'Instituto Remoto', role: 'admin' }],
      contextActiveInstitutionId: 'institution-remote',
      isRemoteSession: true,
      onHydrate,
    })

    await waitFor(() => {
      expect(result.current.isHydrating).toBe(false)
    })

    await act(async () => {
      await result.current.clearWorkspaceNow()
    })

    expect(mocks.clearWorkspaceData).toHaveBeenCalledWith({
      institutionId: 'institution-remote',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      useRemote: true,
      operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    })
    expect(mocks.saveExamEngineV21State).not.toHaveBeenCalled()
    expect(result.current.lastSyncedAt).toBe('2026-04-28T10:05:00.000Z')
    expect(result.current.syncStatus).toBe('saved')
  })

  it('reuses one operation ID after a lost response, remount and manual retry; a later clear is new', async () => {
    const options = { contextInstitutions: [{ id: 'institution-remote', name: 'Remoto', role: 'admin' }], contextActiveInstitutionId: 'institution-remote', isRemoteSession: true, onHydrate: vi.fn() }
    mocks.clearWorkspaceData.mockRejectedValueOnce(new Error('lost response after DB commit'))
    const first = renderPersistenceHook(options)
    await waitFor(() => expect(first.result.current.isHydrating).toBe(false))
    await act(async () => { await expect(first.result.current.clearWorkspaceNow()).rejects.toThrow('lost response') })
    const firstId = mocks.clearWorkspaceData.mock.calls.at(-1)[0].operationId
    first.unmount()
    mocks.clearWorkspaceData.mockResolvedValue({ updatedAt: '2026-10-05T00:00:00Z', source: 'supabase', snapshot: emptySnapshot, cleanup: [] })
    const retry = renderPersistenceHook(options)
    await waitFor(() => expect(retry.result.current.isHydrating).toBe(false))
    await act(async () => { await retry.result.current.clearWorkspaceNow() })
    expect(mocks.clearWorkspaceData.mock.calls.at(-1)[0].operationId).toBe(firstId)
    await act(async () => { await retry.result.current.clearWorkspaceNow() })
    expect(mocks.clearWorkspaceData.mock.calls.at(-1)[0].operationId).not.toBe(firstId)
  })

  it('ignora una hidratacion que termina despues del unmount', async () => {
    const deferredHydration = createDeferred()
    const onHydrate = vi.fn()
    mocks.fetchWorkspaceSnapshot.mockReturnValue(deferredHydration.promise)
    const { unmount } = renderPersistenceHook({
      contextInstitutions: [{ id: 'institution-1', name: 'Instituto Uno', role: 'admin' }],
      contextActiveInstitutionId: 'institution-1',
      isRemoteSession: true,
      onHydrate,
    })

    unmount()
    deferredHydration.reject(new Error('network after unmount'))
    await act(async () => {})

    expect(onHydrate).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  describe('debounce de autosave', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    async function renderHydratedHook(overrides = {}) {
      const onHydrate = overrides.onHydrate ?? vi.fn()
      const hook = renderPersistenceHook({
        contextInstitutions: [{ id: 'institution-1', name: 'Instituto Uno', role: 'admin' }],
        contextActiveInstitutionId: 'institution-1',
        isRemoteSession: false,
        onHydrate,
        ...overrides,
      })

      await act(async () => {})
      expect(hook.result.current.isHydrating).toBe(false)
      return { ...hook, onHydrate }
    }

    function rerenderWithPayload(rerender, payload, overrides = {}) {
      rerender({
        isRemoteSession: false,
        isSuperAdmin: false,
        ownerEmail: 'admin@example.com',
        ownerUserId: 'user-1',
        onHydrate: overrides.onHydrate,
        snapshotPayload: payload,
        contextInstitutions: [{ id: 'institution-1', name: 'Instituto Uno', role: 'admin' }],
        contextActiveInstitutionId: 'institution-1',
        onActiveInstitutionIdChange: null,
        ...overrides,
      })
    }

    it('no guarda durante la hidratacion ni cuando el payload conserva la misma referencia', async () => {
      const { rerender, onHydrate } = await renderHydratedHook()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })
      rerenderWithPayload(rerender, emptySnapshot, { onHydrate })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000)
      })

      expect(mocks.saveWorkspaceSnapshot).not.toHaveBeenCalled()
    })

    it('caracteriza que una copia estructuralmente igual se considera un cambio por referencia', async () => {
      const { rerender, onHydrate } = await renderHydratedHook()

      rerenderWithPayload(rerender, { ...emptySnapshot }, { onHydrate })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700)
      })

      expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledTimes(1)
    })

    it('guarda el payload cambiado solamente despues de 700 ms', async () => {
      const { rerender, result, onHydrate } = await renderHydratedHook()
      const changedSnapshot = { ...emptySnapshot, fechaFin: '2026-08-10' }

      rerenderWithPayload(rerender, changedSnapshot, { onHydrate })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(699)
      })
      expect(mocks.saveWorkspaceSnapshot).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })

      expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledTimes(1)
      expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        institutionId: 'institution-1',
        workspaceKey: 'main',
        payload: changedSnapshot,
        syncOperational: false,
      }))
      expect(result.current.lastSyncedAt).toBe('2026-04-28T10:01:00.000Z')
    })

    it('guarda inmediatamente el cambio pendiente al desmontar', async () => {
      const { rerender, unmount, onHydrate } = await renderHydratedHook()
      rerenderWithPayload(rerender, { ...emptySnapshot, fechaInicio: '2026-08-01' }, { onHydrate })

      unmount()
      await act(async () => {
        await vi.runAllTimersAsync()
      })

      expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledTimes(1)
      expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({ fechaInicio: '2026-08-01' }),
        syncOperational: false,
      }))
    })

    it('no notifica ni actualiza el resultado de una escritura que termina despues del unmount', async () => {
      const deferredSave = createDeferred()
      mocks.saveWorkspaceSnapshot.mockReturnValue(deferredSave.promise)
      const { rerender, unmount, onHydrate } = await renderHydratedHook()
      rerenderWithPayload(rerender, { ...emptySnapshot, fechaInicio: '2026-08-01' }, { onHydrate })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700)
      })
      expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledTimes(1)
      unmount()

      deferredSave.reject(new Error('network after unmount'))
      await act(async () => {})

      expect(mocks.toastError).not.toHaveBeenCalled()
    })

    it('mantiene la causa del error de red recibido y expone el estado de fallo', async () => {
      const rootCause = new Error('connection reset')
      const saveError = new Error('No hay conexion', { cause: rootCause })
      mocks.saveWorkspaceSnapshot.mockRejectedValue(saveError)
      const { rerender, result, onHydrate } = await renderHydratedHook()
      rerenderWithPayload(rerender, { ...emptySnapshot, fechaInicio: '2026-08-01' }, { onHydrate })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700)
      })

      expect(result.current.syncStatus).toBe('error')
      expect(mocks.toastError).toHaveBeenCalledWith(
        'No se pudo guardar el workspace en Supabase: No hay conexion',
      )
      expect(saveError.cause).toBe(rootCause)
      expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledTimes(1)
    })

    it('conflicto con otra sesion: pausa el autoguardado, avisa y "recargar" descarta la copia local y vuelve a cargar', async () => {
      const conflict = Object.assign(new Error('Otra sesion guardo cambios.'), { code: 'WORKSPACE_CONFLICT', remoteUpdatedAt: '2026-10-20T15:30:00.000Z' })
      mocks.saveWorkspaceSnapshot.mockRejectedValue(conflict)
      const { rerender, result, onHydrate } = await renderHydratedHook()
      rerenderWithPayload(rerender, { ...emptySnapshot, fechaInicio: '2026-08-01' }, { onHydrate })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700)
      })

      expect(result.current.syncStatus).toBe('conflict')
      expect(result.current.workspaceConflict).toEqual({ remoteUpdatedAt: '2026-10-20T15:30:00.000Z' })
      expect(mocks.toastError).not.toHaveBeenCalled()

      // Mientras dura el conflicto no se vuelve a intentar pisar.
      rerenderWithPayload(rerender, { ...emptySnapshot, fechaInicio: '2026-08-02' }, { onHydrate })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      expect(mocks.saveWorkspaceSnapshot).toHaveBeenCalledTimes(1)

      const fetchesBefore = mocks.fetchWorkspaceSnapshot.mock.calls.length
      await act(async () => {
        await result.current.resolveWorkspaceConflict('reload')
      })
      expect(mocks.discardLocalWorkspaceSnapshot).toHaveBeenCalledWith({ institutionId: 'institution-1', workspaceKey: 'main' })
      expect(mocks.fetchWorkspaceSnapshot.mock.calls.length).toBeGreaterThan(fetchesBefore)
      expect(result.current.workspaceConflict).toBeNull()
    })

    it('conflicto: "subir los mios igual" guarda con force y levanta el aviso', async () => {
      const conflict = Object.assign(new Error('Otra sesion guardo cambios.'), { code: 'WORKSPACE_CONFLICT', remoteUpdatedAt: null })
      mocks.saveWorkspaceSnapshot.mockRejectedValueOnce(conflict).mockResolvedValue({ updatedAt: '2026-10-20T16:00:00.000Z', source: 'local' })
      const { rerender, result, onHydrate } = await renderHydratedHook()
      rerenderWithPayload(rerender, { ...emptySnapshot, fechaInicio: '2026-08-01' }, { onHydrate })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700)
      })
      expect(result.current.syncStatus).toBe('conflict')

      await act(async () => {
        await result.current.resolveWorkspaceConflict('overwrite')
      })
      expect(mocks.saveWorkspaceSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }))
      expect(result.current.workspaceConflict).toBeNull()
    })
  })
})
