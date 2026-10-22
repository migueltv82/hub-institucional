import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ complete: vi.fn(), signOut: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { error: mocks.toastError, success: mocks.toastSuccess } }))
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ signOutRemote: mocks.signOut, user: { email: 'docente@x.local' } }) }))
vi.mock('../services/initialPasswordChange.js', () => ({ completeInitialPasswordChange: mocks.complete }))

import ForcePasswordChangePage from './ForcePasswordChangePage.jsx'

function fill() {
  fireEvent.change(screen.getByLabelText('Contraseña actual (tu DNI)'), { target: { value: '30111222' } })
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'NuevaClave2026' } })
  fireEvent.change(screen.getByLabelText('Repeti la nueva contraseña'), { target: { value: 'NuevaClave2026' } })
}

describe('ForcePasswordChangePage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envia el cambio con las tres contrasenas', async () => {
    mocks.complete.mockResolvedValue({ success: true })
    render(<ForcePasswordChangePage />)
    expect(screen.getByText('docente@x.local')).toBeInTheDocument()
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
    expect(mocks.complete).toHaveBeenCalledWith({ currentPassword: '30111222', newPassword: 'NuevaClave2026', confirmPassword: 'NuevaClave2026' })
  })

  it('muestra el error y deja reintentar', async () => {
    mocks.complete.mockRejectedValue(new Error('La contrasena ingresada es incorrecta.'))
    render(<ForcePasswordChangePage />)
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('La contrasena ingresada es incorrecta.'))
    expect(screen.getByRole('button', { name: 'Cambiar contraseña' })).toBeEnabled()
  })

  it('permite salir sin cambiarla', () => {
    render(<ForcePasswordChangePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    expect(mocks.signOut).toHaveBeenCalled()
  })
})
