import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchExamEngineV21State,
  saveExamEngineV21State,
} from './examEngineV21State.js'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  isSupabaseConfigured: false,
}))

vi.mock('../lib/supabase.js', () => ({
  get isSupabaseConfigured() {
    return mocks.isSupabaseConfigured
  },
  get supabase() {
    return mocks.isSupabaseConfigured ? { from: mocks.from } : null
  },
}))

function createSelectQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  }
  return query
}

describe('examEngineV21State service', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    mocks.isSupabaseConfigured = false
  })

  it('guarda y lee estado local liviano', async () => {
    const state = { version: 1, uiState: 'REVIEWED_IMPORTED' }

    await saveExamEngineV21State({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      state,
      useRemote: false,
    })
    const result = await fetchExamEngineV21State({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      useRemote: false,
    })

    expect(result).toMatchObject({
      state,
      source: 'local',
    })
  })

  it('borra el estado local cuando se guarda null', async () => {
    await saveExamEngineV21State({
      institutionId: 'inst-1',
      state: { version: 1 },
      useRemote: false,
    })
    await saveExamEngineV21State({
      institutionId: 'inst-1',
      state: null,
      useRemote: false,
    })

    const result = await fetchExamEngineV21State({
      institutionId: 'inst-1',
      fallbackState: { version: 1, source: 'snapshot' },
      useRemote: false,
    })

    expect(result).toMatchObject({
      state: { version: 1, source: 'snapshot' },
      source: 'workspace-snapshot',
    })
  })

  it('guarda remoto con upsert cuando Supabase esta disponible', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mocks.isSupabaseConfigured = true
    mocks.from.mockReturnValue({ upsert })

    const state = { version: 1, uiState: 'FINAL_READY' }
    const result = await saveExamEngineV21State({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'user-1',
      state,
      useRemote: true,
    })

    expect(mocks.from).toHaveBeenCalledWith('exam_engine_v21_states')
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      institution_id: 'inst-1',
      workspace_key: 'main',
      owner_email: 'admin@example.com',
      owner_user_id: 'user-1',
      state,
    }), { onConflict: 'institution_id,workspace_key' })
    expect(result).toMatchObject({
      state,
      source: 'supabase',
    })
  })

  it('usa fallback del snapshot si la tabla remota todavia no existe', async () => {
    mocks.isSupabaseConfigured = true
    mocks.from.mockReturnValue(createSelectQuery({
      data: null,
      error: {
        code: '42P01',
        message: 'relation "exam_engine_v21_states" does not exist',
      },
    }))

    const fallbackState = { version: 1, uiState: 'REVIEWED_IMPORTED' }
    const result = await fetchExamEngineV21State({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      fallbackState,
      useRemote: true,
    })

    expect(result).toMatchObject({
      state: fallbackState,
      source: 'workspace-snapshot',
      missingRemoteTable: true,
    })
  })
})
