import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext.jsx'

const {
  fetchAccessibleInstitutions,
  getSession,
  maybeSingle,
  onAuthStateChange,
  signInWithOtp,
} = vi.hoisted(() => ({
  fetchAccessibleInstitutions: vi.fn(),
  getSession: vi.fn(),
  maybeSingle: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
}))

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession,
      onAuthStateChange,
      signOut: vi.fn(),
      signInWithOtp,
      signInWithPassword: vi.fn(),
      updateUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
    })),
  },
}))

vi.mock('../services/institutions.js', () => ({
  fetchAccessibleInstitutions,
  persistActiveInstitutionId: vi.fn(),
  readStoredActiveInstitutionId: vi.fn(() => null),
}))

function AuthProbe() {
  const { activeInstitution, isAuthenticated, isLoading, isSuperAdmin, user } = useAuth()

  return (
    <div>
      <p data-testid="loading">{String(isLoading)}</p>
      <p data-testid="authenticated">{String(isAuthenticated)}</p>
      <p data-testid="superadmin">{String(isSuperAdmin)}</p>
      <p data-testid="email">{user?.email ?? 'none'}</p>
      <p data-testid="institution">{activeInstitution?.name ?? 'none'}</p>
    </div>
  )
}

function MagicLinkProbe() {
  const { requestMagicLink } = useAuth()

  return (
    <button type="button" onClick={() => requestMagicLink(' Admin@Example.COM ')}>
      enviar magic link
    </button>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mantiene loading hasta resolver el perfil remoto del superadmin', async () => {
    let authListener = () => {}
    let resolveProfile

    const profilePromise = new Promise((resolve) => {
      resolveProfile = resolve
    })

    getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
    maybeSingle.mockImplementation(() => profilePromise)
    fetchAccessibleInstitutions.mockResolvedValue({
      institutions: [{
        id: 'inst-1',
        name: 'Instituto Uno',
        role: 'superadmin',
      }],
    })
    onAuthStateChange.mockImplementation((callback) => {
      authListener = callback
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      }
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    })

    act(() => {
      authListener('SIGNED_IN', {
        user: {
          id: 'user-1',
          email: 'superadmin@example.com',
          user_metadata: {},
        },
      })
    })

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    expect(screen.getByTestId('superadmin')).toHaveTextContent('false')

    await act(async () => {
      resolveProfile({
        data: {
          user_id: 'user-1',
          email: 'superadmin@example.com',
          display_name: 'Super Admin',
          account_role: 'superadmin',
          is_global_admin: true,
          is_blocked: false,
        },
        error: null,
      })
      await profilePromise
    })

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
      expect(screen.getByTestId('superadmin')).toHaveTextContent('true')
      expect(screen.getByTestId('email')).toHaveTextContent('superadmin@example.com')
    })

    act(() => {
      authListener('TOKEN_REFRESHED', {
        access_token: 'token-renovado',
        user: {
          id: 'user-1',
          email: 'superadmin@example.com',
          user_metadata: {},
        },
      })
    })

    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    expect(maybeSingle).toHaveBeenCalledTimes(1)
    expect(fetchAccessibleInstitutions).toHaveBeenCalledTimes(1)
  })

  it('pide magic links sin crear usuarios nuevos desde el cliente', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    })
    signInWithOtp.mockResolvedValue({ error: null })

    render(
      <AuthProvider>
        <MagicLinkProbe />
      </AuthProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /enviar magic link/i }))

    await waitFor(() => {
      expect(signInWithOtp).toHaveBeenCalledWith({
        email: 'admin@example.com',
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
          shouldCreateUser: false,
        },
      })
    })
  })

  it('no termina la carga de un usuario institucional antes de resolver su institucion activa', async () => {
    let resolveInstitutions
    const institutionsPromise = new Promise((resolve) => {
      resolveInstitutions = resolve
    })

    getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: 'teacher-1',
            email: 'docente@example.com',
            user_metadata: {},
          },
        },
      },
      error: null,
    })
    maybeSingle.mockResolvedValue({
      data: {
        user_id: 'teacher-1',
        email: 'docente@example.com',
        display_name: 'Docente Uno',
        account_role: 'docente',
        is_global_admin: false,
        is_blocked: false,
      },
      error: null,
    })
    fetchAccessibleInstitutions.mockImplementation(() => institutionsPromise)
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(fetchAccessibleInstitutions).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('institution')).toHaveTextContent('none')

    await act(async () => {
      resolveInstitutions({
        institutions: [{ id: 'inst-1', name: 'Instituto Uno', role: 'teacher' }],
      })
      await institutionsPromise
    })

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
      expect(screen.getByTestId('institution')).toHaveTextContent('Instituto Uno')
    })
  })
})
