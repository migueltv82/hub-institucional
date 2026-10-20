import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudentAccessSection from './StudentAccessSection.jsx'

const base = { alumnos: [{ email: 'a@x.invalid' }], isLoading: false, onProvisionStudents: vi.fn(), useRemoteWorkspace: true }

describe('StudentAccessSection: accesos incompletos', () => {
  it('sin accesos incompletos no ofrece reparar', () => {
    render(<StudentAccessSection {...base} lastResult={{ created: 3, updated: 0, failed: 0, errors: [] }} onRepairStudents={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Reparar accesos incompletos' })).not.toBeInTheDocument()
  })

  it('con legajos sin vincular explica qué pasó y ofrece repararlos', () => {
    const onRepairStudents = vi.fn()
    render(<StudentAccessSection
      {...base}
      lastResult={{ created: 21, updated: 0, failed: 3, errors: [{ row: 4, email: 'a@x.invalid', error: 'Identidad de alumno sin vinculo inequivoco con esta institucion.' }] }}
      onRepairStudents={onRepairStudents}
    />)
    expect(screen.getByRole('alert')).toHaveTextContent('Hay accesos incompletos')
    fireEvent.click(screen.getByRole('button', { name: 'Reparar accesos incompletos' }))
    expect(onRepairStudents).toHaveBeenCalledTimes(1)
  })
})
