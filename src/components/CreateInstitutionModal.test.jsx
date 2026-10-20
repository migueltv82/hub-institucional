import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CreateInstitutionModal from './CreateInstitutionModal.jsx'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isRemoteSession: false }) }))

describe('CreateInstitutionModal', () => {
  it('cada campo se encuentra por su etiqueta (accesibilidad, D1 P3)', () => {
    render(<CreateInstitutionModal isOpen onClose={() => {}} onSuccess={() => {}} />)

    expect(screen.getByLabelText('Nombre del instituto')).toHaveAttribute('required')
    expect(screen.getByLabelText('Plan inicial').tagName).toBe('SELECT')
    expect(screen.getByLabelText('Email del administrador')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Contraseña de acceso')).toHaveAttribute('readonly')
    for (const name of ['Cerrar', 'Generar otra contraseña', 'Copiar contraseña']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Dar de alta la institución' })).toHaveAttribute('type', 'submit')
  })
})
