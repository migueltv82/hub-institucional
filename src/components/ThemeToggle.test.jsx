import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ThemeToggle from './ThemeToggle.jsx'

describe('ThemeToggle', () => {
  it('ofrece cambiar a oscuro desde el tema claro', () => {
    const onToggle = vi.fn()
    render(<ThemeToggle onToggle={onToggle} theme="light" />)

    const button = screen.getByRole('button', { name: 'Cambiar a tema oscuro' })
    expect(button).toHaveAttribute('title', 'Cambiar a tema oscuro')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('ofrece volver a claro desde el tema oscuro', () => {
    render(<ThemeToggle onToggle={() => {}} theme="dark" />)

    expect(screen.getByRole('button', { name: 'Cambiar a tema claro' })).toBeInTheDocument()
  })
})
