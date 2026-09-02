import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import ProtectedSuperAdminRoute from './ProtectedSuperAdminRoute.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}))

function renderProtectedRoute(authState) {
  useAuth.mockReturnValue({
    isLoading: false,
    isAuthenticated: false,
    isSuperAdmin: false,
    ...authState,
  })

  render(
    <MemoryRouter initialEntries={['/super-admin']}>
      <Routes>
        <Route path="/login" element={<p>Login</p>} />
        <Route path="/app" element={<p>Workspace</p>} />
        <Route element={<ProtectedSuperAdminRoute />}>
          <Route path="/super-admin" element={<p>Panel superadmin</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedSuperAdminRoute', () => {
  it('redirige al login cuando no hay sesion', () => {
    renderProtectedRoute()

    expect(screen.getByText('Login')).toBeInTheDocument()
  })

  it('redirige al workspace cuando el usuario no es superadmin', () => {
    renderProtectedRoute({
      isAuthenticated: true,
      isSuperAdmin: false,
    })

    expect(screen.getByText('Workspace')).toBeInTheDocument()
  })

  it('muestra el panel cuando hay sesion superadmin', () => {
    renderProtectedRoute({
      isAuthenticated: true,
      isSuperAdmin: true,
    })

    expect(screen.getByText('Panel superadmin')).toBeInTheDocument()
  })
})
