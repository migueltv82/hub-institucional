import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DraftScheduleTable from './DraftScheduleTable.jsx'

const rows = [
  { draftMesaId: '1', fecha: '2026-07-30', carrera: 'Laboratorio', anio: 1, materiaMesa: 'Práctica Profesional I', titular: 'Silvia Flores', estado: 'READY', observaciones: '' },
  { draftMesaId: '2', fecha: '2026-07-30', carrera: 'Laboratorio', anio: 2, materiaMesa: 'Anatomía', titular: 'Carlos Bilavcik', estado: 'READY', observaciones: 'Revisar turno' },
  { draftMesaId: '3', fecha: '2026-07-31', carrera: 'Traductorado', anio: 1, materiaMesa: 'Lengua Inglesa', titular: 'Ana Pérez', estado: 'READY', observaciones: '' },
]

describe('DraftScheduleTable', () => {
  it('muestra una grilla por carrera con fechas en filas y años en columnas', () => {
    render(<DraftScheduleTable rows={rows} onExport={vi.fn()} />)
    const grid = screen.getByRole('table')
    expect(within(grid).getByText('1º año')).toBeInTheDocument()
    expect(within(grid).getByText('2º año')).toBeInTheDocument()
    expect(within(grid).getByText('jueves 30/07')).toBeInTheDocument()
    expect(within(grid).getByText('Práctica Profesional I')).toBeInTheDocument()
    expect(screen.queryByText('Lengua Inglesa')).not.toBeInTheDocument()
  })

  it('permite cambiar de carrera y conservar una vista de lista', () => {
    render(<DraftScheduleTable rows={rows} onExport={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Traductorado · 1' }))
    expect(screen.getByText('Lengua Inglesa')).toBeInTheDocument()
    expect(screen.queryByText('Práctica Profesional I')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(screen.getByRole('columnheader', { name: 'Materia/Mesa' })).toBeInTheDocument()
  })
  it('muestra estados legibles y separa la titularidad detectada', () => {
    render(<DraftScheduleTable rows={[
      {
        draftMesaId: 'teacher-review',
        fecha: '2026-07-30',
        carrera: 'Laboratorio',
        anio: 1,
        materiaMesa: 'Quimica I',
        titular: 'Silvia Flores',
        estado: 'TEACHER_REVIEW',
        observaciones: '',
      },
    ]} onExport={vi.fn()} />)

    expect(screen.queryByText('TEACHER_REVIEW')).not.toBeInTheDocument()
    expect(screen.getByText('Revision docente')).toBeInTheDocument()
    expect(screen.getByText('Titular detectado')).toBeInTheDocument()
  })
})
