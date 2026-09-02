import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  fetchAccessibleInstitutions,
  persistActiveInstitutionId,
  readStoredActiveInstitutionId,
} from '../services/institutions.js'
import {
  clearWorkspaceData,
  fetchWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from '../services/workspaceSnapshot.js'
import { isSupabaseConfigured } from '../lib/supabase.js'

const WORKSPACE_KEY = 'main'
const WRITABLE_REMOTE_ROLES = new Set(['owner', 'admin', 'editor', 'superadmin'])
const DEBUG_WORKSPACE_PERSISTENCE = import.meta.env.DEV

function getSnapshotCounts(snapshotPayload) {
  return {
    alumnos: Array.isArray(snapshotPayload?.alumnos) ? snapshotPayload.alumnos.length : 0,
    docentes: Array.isArray(snapshotPayload?.docentes) ? snapshotPayload.docentes.length : 0,
    docenteMateria: Array.isArray(snapshotPayload?.docenteMateria) ? snapshotPayload.docenteMateria.length : 0,
    horariosDocentes: Array.isArray(snapshotPayload?.horariosDocentes) ? snapshotPayload.horariosDocentes.length : 0,
    planesEstudio: Array.isArray(snapshotPayload?.planesEstudio) ? snapshotPayload.planesEstudio.length : 0,
    correlatividades: Array.isArray(snapshotPayload?.correlatividades) ? snapshotPayload.correlatividades.length : 0,
    cronograma: Array.isArray(snapshotPayload?.cronograma) ? snapshotPayload.cronograma.length : 0,
  }
}

function getPersistenceMode({ activeInstitutionId, useRemoteWorkspace }) {
  if (useRemoteWorkspace) return 'supabase'
  if (activeInstitutionId) return 'localStorage'
  return 'memory'
}

function logWorkspacePersistenceDiagnostic(level, event, details = {}) {
  if (!DEBUG_WORKSPACE_PERSISTENCE) return

  const logger = level === 'warn' ? console.warn : console.info
  logger(`[workspace-persistence] ${event}`, details)
}

export function useWorkspacePersistence({
  isRemoteSession,
  isSuperAdmin,
  ownerEmail,
  ownerUserId,
  onHydrate,
  snapshotPayload,
  contextInstitutions = null,
  contextActiveInstitutionId = null,
  onActiveInstitutionIdChange = null,
}) {
  const [localInstitutions, setLocalInstitutions] = useState([])
  const [localActiveInstitutionId, setLocalActiveInstitutionId] = useState(null)
  const [isLoadingLocalInstitutions, setIsLoadingLocalInstitutions] = useState(true)
  const [isHydrating, setIsHydrating] = useState(true)
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured ? 'syncing' : 'local-only')
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const skipAutoSaveRef = useRef(true)
  const dirtySnapshotRef = useRef(false)
  const latestSaveContextRef = useRef(null)
  const hasContextInstitutions = Array.isArray(contextInstitutions)
  const institutions = hasContextInstitutions ? contextInstitutions : localInstitutions
  const activeInstitutionId = hasContextInstitutions ? contextActiveInstitutionId : localActiveInstitutionId
  const setActiveInstitutionId = onActiveInstitutionIdChange ?? setLocalActiveInstitutionId
  const isLoadingInstitutions = hasContextInstitutions ? false : isLoadingLocalInstitutions

  const activeInstitution = useMemo(
    () => institutions.find((institution) => institution.id === activeInstitutionId) ?? null,
    [activeInstitutionId, institutions],
  )
  const useRemoteWorkspace = Boolean(isRemoteSession && activeInstitutionId)
  const canWriteRemoteWorkspace = !useRemoteWorkspace || WRITABLE_REMOTE_ROLES.has(activeInstitution?.role)
  const effectiveSyncStatus = (
    activeInstitutionId &&
    !isHydrating &&
    !canWriteRemoteWorkspace
  )
    ? 'read-only'
    : syncStatus

  useEffect(() => {
    latestSaveContextRef.current = {
      activeInstitutionId,
      canWriteRemoteWorkspace,
      ownerEmail,
      ownerUserId,
      payload: snapshotPayload,
      useRemoteWorkspace,
    }
  }, [
    activeInstitutionId,
    canWriteRemoteWorkspace,
    ownerEmail,
    ownerUserId,
    snapshotPayload,
    useRemoteWorkspace,
  ])

  const saveSnapshotNow = useCallback(async (payloadOverride = snapshotPayload) => {
    if (!activeInstitutionId) throw new Error('No hay una institucion activa para guardar los datos.')
    if (!canWriteRemoteWorkspace) throw new Error('Tu rol institucional es de solo lectura.')
    setSyncStatus(useRemoteWorkspace ? 'syncing' : 'local-only')
    const result = await saveWorkspaceSnapshot({
      institutionId: activeInstitutionId,
      workspaceKey: WORKSPACE_KEY,
      ownerEmail: ownerEmail ?? null,
      ownerUserId: ownerUserId ?? null,
      payload: payloadOverride,
      useRemote: useRemoteWorkspace,
    })
    setLastSyncedAt(result.updatedAt)
    setSyncStatus(result.source === 'supabase' ? 'saved' : 'local-only')
    return result
  }, [activeInstitutionId, canWriteRemoteWorkspace, ownerEmail, ownerUserId, snapshotPayload, useRemoteWorkspace])

  const clearWorkspaceNow = useCallback(async () => {
    if (!activeInstitutionId) throw new Error('No hay una institucion activa para borrar los datos.')
    if (!canWriteRemoteWorkspace) throw new Error('Tu rol institucional es de solo lectura.')

    setSyncStatus(useRemoteWorkspace ? 'syncing' : 'local-only')

    try {
      const result = await clearWorkspaceData({
        institutionId: activeInstitutionId,
        workspaceKey: WORKSPACE_KEY,
        ownerEmail: ownerEmail ?? null,
        ownerUserId: ownerUserId ?? null,
        useRemote: useRemoteWorkspace,
      })

      dirtySnapshotRef.current = false
      skipAutoSaveRef.current = true
      setLastSyncedAt(result.updatedAt)
      setSyncStatus(result.source === 'supabase' ? 'saved' : 'local-only')
      return result
    } catch (error) {
      setSyncStatus('error')
      throw error
    }
  }, [activeInstitutionId, canWriteRemoteWorkspace, ownerEmail, ownerUserId, useRemoteWorkspace])

  useEffect(() => {
    let cancelled = false

    async function loadInstitutions() {
      if (hasContextInstitutions) {
        setIsLoadingLocalInstitutions(false)
        return
      }

      setIsLoadingLocalInstitutions(true)

      try {
        const { institutions: nextInstitutions } = await fetchAccessibleInstitutions({
          isSuperAdmin,
          useRemote: isRemoteSession,
        })

        if (cancelled) return

        setLocalInstitutions(nextInstitutions)

        const storedInstitutionId = readStoredActiveInstitutionId()
        const nextInstitution = nextInstitutions.find(
          (institution) => institution.id === storedInstitutionId,
        ) ?? nextInstitutions[0] ?? null

        setLocalActiveInstitutionId(nextInstitution?.id ?? null)
      } catch (error) {
        if (cancelled) return
        toast.error(`No se pudieron cargar las instituciones: ${error.message}`)
      } finally {
        if (!cancelled) {
          setIsLoadingLocalInstitutions(false)
        }
      }
    }

    loadInstitutions()

    return () => {
      cancelled = true
    }
  }, [hasContextInstitutions, isRemoteSession, isSuperAdmin, ownerEmail])

  useEffect(() => {
    persistActiveInstitutionId(activeInstitutionId)
  }, [activeInstitutionId])

  useEffect(() => {
    let cancelled = false

    async function hydrateWorkspace() {
      if (!activeInstitutionId) {
        logWorkspacePersistenceDiagnostic('info', 'hydrate:skipped-no-institution', {
          activeInstitutionId,
          mode: getPersistenceMode({ activeInstitutionId, useRemoteWorkspace }),
          useRemoteWorkspace,
          workspaceKey: WORKSPACE_KEY,
        })
        setIsHydrating(false)
        return
      }

      setIsHydrating(true)
      setSyncStatus(useRemoteWorkspace ? 'syncing' : 'local-only')

      try {
        const { snapshot, updatedAt, source } = await fetchWorkspaceSnapshot({
          institutionId: activeInstitutionId,
          workspaceKey: WORKSPACE_KEY,
          useRemote: useRemoteWorkspace,
        })

        if (cancelled) return

        logWorkspacePersistenceDiagnostic('info', 'hydrate:ok', {
          activeInstitutionId,
          mode: source === 'supabase' ? 'supabase' : 'localStorage',
          source,
          updatedAt,
          useRemoteWorkspace,
          workspaceKey: WORKSPACE_KEY,
          counts: getSnapshotCounts(snapshot),
        })
        onHydrate(snapshot)
        dirtySnapshotRef.current = useRemoteWorkspace && source === 'local'
        setLastSyncedAt(updatedAt)
        setSyncStatus(source === 'supabase' ? 'saved' : 'local-only')
        // Si se recupero un respaldo local mas nuevo, no se omite el siguiente
        // autosave: debe subir esa copia pendiente a Supabase.
        skipAutoSaveRef.current = !(useRemoteWorkspace && source === 'local')
      } catch (error) {
        if (cancelled) return
        logWorkspacePersistenceDiagnostic('warn', 'hydrate:error', {
          activeInstitutionId,
          mode: getPersistenceMode({ activeInstitutionId, useRemoteWorkspace }),
          useRemoteWorkspace,
          workspaceKey: WORKSPACE_KEY,
          errorMessage: error.message,
        })
        setSyncStatus('error')
        toast.error(`No se pudo recuperar el workspace desde Supabase: ${error.message}`)
      } finally {
        if (!cancelled) {
          setIsHydrating(false)
        }
      }
    }

    hydrateWorkspace()

    return () => {
      cancelled = true
    }
  }, [activeInstitutionId, onHydrate, useRemoteWorkspace])

  useEffect(() => {
    if (isHydrating) return
    if (!activeInstitutionId) {
      logWorkspacePersistenceDiagnostic('info', 'autosave:skipped-no-institution', {
        activeInstitutionId,
        mode: getPersistenceMode({ activeInstitutionId, useRemoteWorkspace }),
        useRemoteWorkspace,
        workspaceKey: WORKSPACE_KEY,
        counts: getSnapshotCounts(snapshotPayload),
      })
      return
    }
    if (!canWriteRemoteWorkspace) {
      logWorkspacePersistenceDiagnostic('info', 'autosave:skipped-read-only', {
        activeInstitutionId,
        mode: getPersistenceMode({ activeInstitutionId, useRemoteWorkspace }),
        role: activeInstitution?.role ?? null,
        useRemoteWorkspace,
        workspaceKey: WORKSPACE_KEY,
        counts: getSnapshotCounts(snapshotPayload),
      })
      return
    }

    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false
      logWorkspacePersistenceDiagnostic('info', 'autosave:skipped-initial-hydration', {
        activeInstitutionId,
        mode: getPersistenceMode({ activeInstitutionId, useRemoteWorkspace }),
        useRemoteWorkspace,
        workspaceKey: WORKSPACE_KEY,
        counts: getSnapshotCounts(snapshotPayload),
      })
      return
    }

    dirtySnapshotRef.current = true

    let cancelled = false
    const timeoutId = window.setTimeout(async () => {
      try {
        setSyncStatus(useRemoteWorkspace ? 'syncing' : 'local-only')

        const { updatedAt, source } = await saveWorkspaceSnapshot({
          institutionId: activeInstitutionId,
          workspaceKey: WORKSPACE_KEY,
          ownerEmail: ownerEmail ?? null,
          ownerUserId: ownerUserId ?? null,
          payload: snapshotPayload,
          useRemote: useRemoteWorkspace,
        })

        if (cancelled) return

        if (latestSaveContextRef.current?.payload === snapshotPayload) {
          dirtySnapshotRef.current = false
        }

        logWorkspacePersistenceDiagnostic('info', 'autosave:ok', {
          activeInstitutionId,
          mode: source === 'supabase' ? 'supabase' : 'localStorage',
          source,
          updatedAt,
          useRemoteWorkspace,
          workspaceKey: WORKSPACE_KEY,
          counts: getSnapshotCounts(snapshotPayload),
        })
        setLastSyncedAt(updatedAt)
        setSyncStatus(source === 'supabase' ? 'saved' : 'local-only')
      } catch (error) {
        if (cancelled) return

        logWorkspacePersistenceDiagnostic('warn', 'autosave:error', {
          activeInstitutionId,
          mode: getPersistenceMode({ activeInstitutionId, useRemoteWorkspace }),
          useRemoteWorkspace,
          workspaceKey: WORKSPACE_KEY,
          counts: getSnapshotCounts(snapshotPayload),
          errorMessage: error.message,
        })
        setSyncStatus('error')
        toast.error(`No se pudo guardar el workspace en Supabase: ${error.message}`)
      }
    }, 700)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
    // activeInstitution?.role is only read for a diagnostic log message when
    // autosave is skipped; canWriteRemoteWorkspace already derives from it and
    // gates the actual write logic, so adding the raw role here would only
    // restart the autosave debounce/log on role changes that don't affect
    // writability, which is not desired.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeInstitutionId,
    canWriteRemoteWorkspace,
    isHydrating,
    ownerEmail,
    ownerUserId,
    snapshotPayload,
    useRemoteWorkspace,
  ])

  useEffect(() => {
    const flushPendingSnapshot = () => {
      const context = latestSaveContextRef.current
      if (!dirtySnapshotRef.current || !context?.activeInstitutionId || !context.canWriteRemoteWorkspace) return

      dirtySnapshotRef.current = false
      void saveWorkspaceSnapshot({
        institutionId: context.activeInstitutionId,
        workspaceKey: WORKSPACE_KEY,
        ownerEmail: context.ownerEmail ?? null,
        ownerUserId: context.ownerUserId ?? null,
        payload: context.payload,
        useRemote: context.useRemoteWorkspace,
      }).catch(() => {
        dirtySnapshotRef.current = true
      })
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPendingSnapshot()
    }

    window.addEventListener('pagehide', flushPendingSnapshot)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', flushPendingSnapshot)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      flushPendingSnapshot()
    }
  }, [])

  return {
    activeInstitution,
    activeInstitutionId,
    institutions,
    isHydrating,
    isLoadingInstitutions,
    lastSyncedAt,
    clearWorkspaceNow,
    setActiveInstitutionId,
    saveSnapshotNow,
    syncStatus: effectiveSyncStatus,
    useRemoteWorkspace,
    canWriteRemoteWorkspace,
    workspaceKey: WORKSPACE_KEY,
  }
}
