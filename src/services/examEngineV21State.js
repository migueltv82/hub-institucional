import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

const TABLE_NAME = 'exam_engine_v21_states'
const LOCAL_STATE_PREFIX = 'mesaflow.examEngineV21State'
const MISSING_STATE_TABLE_ERROR_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205'])

function normalizeWorkspaceKey(value) {
  return String(value || 'main').trim() || 'main'
}

function normalizeState(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function getLocalStateStorageKey({ institutionId, workspaceKey }) {
  return `${LOCAL_STATE_PREFIX}:${institutionId ?? 'demo'}:${normalizeWorkspaceKey(workspaceKey)}`
}

function isMissingStateTableError(error) {
  const message = String(error?.message ?? error ?? '').toLowerCase()
  return MISSING_STATE_TABLE_ERROR_CODES.has(error?.code) ||
    message.includes(TABLE_NAME) ||
    message.includes('schema cache') ||
    message.includes('does not exist')
}

function readLocalExamEngineState(params) {
  try {
    const raw = localStorage.getItem(getLocalStateStorageKey(params))
    if (!raw) return { state: null, updatedAt: null, source: 'local' }

    const parsed = JSON.parse(raw)
    return {
      state: normalizeState(parsed?.state),
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
      source: 'local',
    }
  } catch {
    return { state: null, updatedAt: null, source: 'local' }
  }
}

function writeLocalExamEngineState(params, state, explicitUpdatedAt = null) {
  const updatedAt = explicitUpdatedAt ?? new Date().toISOString()
  const storageKey = getLocalStateStorageKey(params)
  const normalizedState = normalizeState(state)

  try {
    if (!normalizedState) {
      localStorage.removeItem(storageKey)
    } else {
      localStorage.setItem(storageKey, JSON.stringify({
        state: normalizedState,
        updatedAt,
      }))
    }
  } catch {
    // El estado remoto sigue siendo la fuente principal; localStorage es best-effort.
  }

  return {
    state: normalizedState,
    updatedAt,
    source: 'local',
  }
}

function canUseRemoteState({ institutionId, useRemote }) {
  return Boolean(useRemote && institutionId && isSupabaseConfigured && supabase)
}

export async function fetchExamEngineV21State({
  institutionId,
  workspaceKey = 'main',
  useRemote,
  fallbackState = null,
} = {}) {
  const fallback = normalizeState(fallbackState)

  if (!institutionId) {
    return {
      state: fallback,
      updatedAt: null,
      source: 'memory',
    }
  }

  const localState = readLocalExamEngineState({ institutionId, workspaceKey })

  if (!canUseRemoteState({ institutionId, useRemote })) {
    return localState.state
      ? localState
      : { state: fallback, updatedAt: null, source: 'workspace-snapshot' }
  }

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('state, updated_at')
      .eq('institution_id', institutionId)
      .eq('workspace_key', normalizeWorkspaceKey(workspaceKey))
      .maybeSingle()

    if (error) {
      if (isMissingStateTableError(error)) {
        return {
          state: localState.state ?? fallback,
          updatedAt: localState.updatedAt,
          source: localState.state ? 'local' : 'workspace-snapshot',
          missingRemoteTable: true,
        }
      }

      return {
        state: localState.state ?? fallback,
        updatedAt: localState.updatedAt,
        source: localState.state ? 'local' : 'workspace-snapshot',
        fetchError: error,
      }
    }

    return {
      state: normalizeState(data?.state) ?? fallback,
      updatedAt: data?.updated_at ?? null,
      source: 'supabase',
    }
  } catch (error) {
    return {
      state: localState.state ?? fallback,
      updatedAt: localState.updatedAt,
      source: localState.state ? 'local' : 'workspace-snapshot',
      fetchError: error,
    }
  }
}

export async function saveExamEngineV21State({
  institutionId,
  workspaceKey = 'main',
  ownerEmail = null,
  ownerUserId = null,
  state = null,
  useRemote,
} = {}) {
  if (!institutionId) {
    return {
      state: normalizeState(state),
      updatedAt: new Date().toISOString(),
      source: 'memory',
      skippedRemoteWrite: true,
    }
  }

  const localResult = writeLocalExamEngineState({ institutionId, workspaceKey }, state)

  if (!canUseRemoteState({ institutionId, useRemote })) {
    return localResult
  }

  try {
    const { error } = await supabase.from(TABLE_NAME).upsert({
      institution_id: institutionId,
      workspace_key: normalizeWorkspaceKey(workspaceKey),
      owner_user_id: ownerUserId ?? null,
      owner_email: ownerEmail ?? null,
      state: normalizeState(state),
      updated_at: localResult.updatedAt,
    }, { onConflict: 'institution_id,workspace_key' })

    if (error) {
      if (isMissingStateTableError(error)) {
        return {
          ...localResult,
          missingRemoteTable: true,
          skippedRemoteWrite: true,
        }
      }

      return {
        ...localResult,
        saveError: error,
        skippedRemoteWrite: true,
      }
    }

    return {
      state: normalizeState(state),
      updatedAt: localResult.updatedAt,
      source: 'supabase',
    }
  } catch (error) {
    return {
      ...localResult,
      saveError: error,
      skippedRemoteWrite: true,
    }
  }
}
