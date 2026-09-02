import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { clearLegacySupabaseAuthStorage } from '../lib/authStorage.js'
import {
  fetchAccessibleInstitutions,
  persistActiveInstitutionId,
  readStoredActiveInstitutionId,
} from '../services/institutions.js'

// Permite apagar el login solo para desarrollo local puntual.
const AUTH_DISABLED_TEMPORARILY = import.meta.env.DEV && import.meta.env.VITE_DISABLE_AUTH === 'true'

// Sesion local de desarrollo para trabajar sin depender de servicios externos.
const DEV_SESSION = {
  user: {
    id: 'dev-admin',
    email: 'desarrollo@institutosanmiguel.local',
  },
}

const DEV_PROFILE = {
  user_id: 'dev-admin',
  email: DEV_SESSION.user.email,
  display_name: 'Modo desarrollo',
  account_role: 'superadmin',
  is_global_admin: true,
  is_blocked: false,
}

const AuthContext = createContext(null)

function normalizeAccountRole(profile, sessionUser) {
  if (profile?.is_global_admin) return 'superadmin'
  return profile?.account_role ?? sessionUser?.user_metadata?.account_role ?? 'admin_instituto'
}

function buildUser(sessionUser, profile) {
  if (!sessionUser) return null

  const accountRole = normalizeAccountRole(profile, sessionUser)

  return {
    id: sessionUser.id,
    email: sessionUser.email ?? DEV_SESSION.user.email,
    nombre:
      profile?.display_name ??
      sessionUser.user_metadata?.nombre ??
      sessionUser.user_metadata?.full_name ??
      sessionUser.email ??
      DEV_PROFILE.display_name,
    role: accountRole,
    accountRole,
    isStudent: ['alumno', 'student'].includes(String(accountRole).toLowerCase()),
    isTeacher: ['docente', 'profesor', 'teacher'].includes(String(accountRole).toLowerCase()),
  }
}

async function fetchOwnProfile(userId) {
  if (!userId || !isSupabaseConfigured || !supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, display_name, account_role, is_global_admin, is_blocked')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function fetchAuthInstitutions({ profile, source }) {
  const { institutions } = await fetchAccessibleInstitutions({
    isSuperAdmin: Boolean(profile?.is_global_admin),
    useRemote: source === 'remote',
  })

  return institutions
}

function resolveActiveInstitutionId(institutions) {
  const storedInstitutionId = readStoredActiveInstitutionId()
  const activeInstitution = institutions.find((institution) => institution.id === storedInstitutionId)
    ?? institutions[0]
    ?? null

  return activeInstitution?.id ?? null
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [institutions, setInstitutions] = useState([])
  const [activeInstitutionId, setActiveInstitutionIdState] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authUserId, setAuthUserId] = useState(null)
  const [sessionSource, setSessionSource] = useState('none')
  const activeRemoteUserIdRef = useRef(null)

  useEffect(() => {
    let isMounted = true

    async function syncSession(nextSession, { source = 'remote' } = {}) {
      if (!isMounted) return

      setSession(nextSession)
      setSessionSource(nextSession?.user ? source : 'none')
      const nextUserId = nextSession?.user?.id ?? null
      setAuthUserId(source === 'remote' ? nextUserId : null)

      if (!nextUserId) {
        activeRemoteUserIdRef.current = null
        setProfile(null)
        setInstitutions([])
        setActiveInstitutionIdState(null)
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      if (source === 'local') {
        setProfile(DEV_PROFILE)
        const nextInstitutions = await fetchAuthInstitutions({ profile: DEV_PROFILE, source })
        setInstitutions(nextInstitutions)
        setActiveInstitutionIdState(resolveActiveInstitutionId(nextInstitutions))
        setIsLoading(false)
        return
      }

      try {
        const nextProfile = await fetchOwnProfile(nextUserId)
        if (!isMounted) return

        if (!nextProfile || nextProfile.is_blocked) {
          if (source === 'remote' && supabase) {
            await supabase.auth.signOut()
          }

          if (!isMounted) return
          setSession(null)
          setSessionSource('none')
          setAuthUserId(null)
          setProfile(null)
          setInstitutions([])
          setActiveInstitutionIdState(null)
          setIsLoading(false)
          return
        }

        const nextInstitutions = await fetchAuthInstitutions({ profile: nextProfile, source })
        if (!isMounted) return

        activeRemoteUserIdRef.current = nextUserId
        setProfile(nextProfile)
        setInstitutions(nextInstitutions)
        setActiveInstitutionIdState(resolveActiveInstitutionId(nextInstitutions))
      } catch {
        if (!isMounted) return
        if (source === 'remote' && supabase) {
          await supabase.auth.signOut()
        }

        if (!isMounted) return
        setSession(null)
        setSessionSource('none')
        setAuthUserId(null)
        setProfile(null)
        setInstitutions([])
        setActiveInstitutionIdState(null)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    async function bootstrapSession() {
      if (AUTH_DISABLED_TEMPORARILY) {
        await syncSession(DEV_SESSION, { source: 'local' })
        return
      }

      if (!isSupabaseConfigured || !supabase) {
        if (isMounted) setIsLoading(false)
        return
      }

      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        await syncSession(data.session)
      } catch {
        if (isMounted) {
          setSession(null)
          setProfile(null)
          setInstitutions([])
          setActiveInstitutionIdState(null)
          setAuthUserId(null)
          setIsLoading(false)
        }
      }
    }

    bootstrapSession()

    if (AUTH_DISABLED_TEMPORARILY || !isSupabaseConfigured || !supabase) {
      return () => {
        isMounted = false
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user?.id ?? null
      const isSameAuthenticatedUser = Boolean(
        nextUserId && nextUserId === activeRemoteUserIdRef.current,
      )

      if (isSameAuthenticatedUser && ['TOKEN_REFRESHED', 'SIGNED_IN', 'USER_UPDATED'].includes(event)) {
        setSession(nextSession)
        setSessionSource('remote')
        setAuthUserId(nextUserId)
        return
      }

      void syncSession(nextSession)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const user = useMemo(() => buildUser(session?.user, profile), [session, profile])
  const isLocalSession = sessionSource === 'local'
  const isRemoteSession = sessionSource === 'remote' && Boolean(authUserId)
  const isSuperAdmin = isRemoteSession ? Boolean(profile?.is_global_admin) : isLocalSession
  const activeInstitution = useMemo(
    () => institutions.find((institution) => institution.id === activeInstitutionId) ?? null,
    [activeInstitutionId, institutions],
  )

  const setActiveInstitutionId = useCallback((nextInstitutionId) => {
    const safeInstitutionId = institutions.some((institution) => institution.id === nextInstitutionId)
      ? nextInstitutionId
      : null

    setActiveInstitutionIdState(safeInstitutionId)
    persistActiveInstitutionId(safeInstitutionId)
  }, [institutions])

  const value = useMemo(() => ({
    user,
    profile: profile ?? (isLocalSession ? DEV_PROFILE : null),
    institutions,
    activeInstitution,
    activeInstitutionId,
    setActiveInstitutionId,
    authUserId,
    accessToken: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null,
    status: isRemoteSession ? 'remote-authenticated' : (isLocalSession ? 'local-authenticated' : 'unauthenticated'),
    isAuthenticated: Boolean(authUserId) || isLocalSession,
    isLoading,
    isRemoteSession,
    isAuthBypassed: isLocalSession,
    isSuperAdmin,
    async requestMagicLink(email) {
      if (AUTH_DISABLED_TEMPORARILY) {
        throw new Error('El inicio de sesion esta desactivado temporalmente.')
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase no esta configurado en este entorno.')
      }

      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail) {
        throw new Error('Ingresa un email valido para recibir el magic link.')
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
          shouldCreateUser: false,
        },
      })

      if (error) throw error
    },
    async signInWithPassword({ email, password }) {
      if (AUTH_DISABLED_TEMPORARILY) {
        throw new Error('El inicio de sesion esta desactivado temporalmente.')
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase no esta configurado en este entorno.')
      }

      const normalizedEmail = email.trim().toLowerCase()
      if (!normalizedEmail) {
        throw new Error('Ingresa un email valido.')
      }

      if (!password.trim()) {
        throw new Error('Ingresa una contrasena valida.')
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error) throw error

      const nextProfile = await fetchOwnProfile(data.user?.id ?? null)

      if (!nextProfile) {
        await supabase.auth.signOut()
        throw new Error('No existe un perfil habilitado para esta cuenta.')
      }

      if (nextProfile.is_blocked) {
        await supabase.auth.signOut()
        throw new Error('Tu usuario esta bloqueado. Contacta al administrador del sistema.')
      }

      if (!nextProfile.is_global_admin) {
        await supabase.auth.signOut()
        throw new Error('Esta cuenta no tiene permisos de Super Admin.')
      }
    },
    async changeOwnPassword({ currentPassword, newPassword }) {
      if (AUTH_DISABLED_TEMPORARILY) {
        throw new Error('El cambio de contrasena no esta disponible en modo desarrollo local.')
      }

      if (!isSupabaseConfigured || !supabase) {
        throw new Error('Supabase no esta configurado en este entorno.')
      }

      const email = session?.user?.email?.trim().toLowerCase()
      if (!email) {
        throw new Error('No se pudo identificar el email de la sesion actual.')
      }

      if (!currentPassword.trim()) {
        throw new Error('Ingresa tu contrasena actual.')
      }

      if (!newPassword.trim() || newPassword.trim().length < 8) {
        throw new Error('La nueva contrasena debe tener al menos 8 caracteres.')
      }

      if (currentPassword === newPassword) {
        throw new Error('La nueva contrasena debe ser distinta de la actual.')
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })

      if (signInError) {
        throw new Error('La contrasena actual no es correcta.')
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      })

      if (updateError) throw updateError
    },
    async signOutRemote() {
      if (AUTH_DISABLED_TEMPORARILY) return
      if (!isSupabaseConfigured || !supabase) return
      const { error } = await supabase.auth.signOut()
      clearLegacySupabaseAuthStorage()
      if (error) throw error
    },
    async refreshSession() {
      if (AUTH_DISABLED_TEMPORARILY) {
        return DEV_SESSION
      }

      if (!isSupabaseConfigured || !supabase) {
        return null
      }

      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      return data.session ?? null
    },
  }), [activeInstitution, activeInstitutionId, authUserId, institutions, isLoading, isLocalSession, isRemoteSession, isSuperAdmin, profile, session, setActiveInstitutionId, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.')
  }

  return context
}
