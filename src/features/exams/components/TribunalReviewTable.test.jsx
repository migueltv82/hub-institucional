import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TribunalReviewTable from './TribunalReviewTable.jsx'

const rows = [
  { draftMesaId: '1', fecha: '2026-07-30', carrera: 'Laboratorio', anio: 1, materiaMesa: 'Práctica Profesional I', titular: 'Silvia Flores', vocal1: 'Ana Vocal', vocal2: 'Beto Vocal', estado: 'COMPLETA', alertas: '' },
  { draftMesaId: '2', fecha: '2026-07-30', carrera: 'Laboratorio', anio: 2, materiaMesa: 'Anatomía', titular: 'Carlos Bilavcik', vocal1: 'Ana Vocal', vocal2: '', estado: 'CON_UN_VOCAL', alertas: 'Falta vocal 2' },
  { draftMesaId: '3', fecha: '2026-07-31', carrera: 'Traductorado', anio: 1, materiaMesa: 'Lengua Inglesa', titular: 'Ana Pérez', vocal1: 'Dario Vocal', vocal2: 'Elena Vocal', estado: 'COMPLETA', alertas: '' },
]

describe('TribunalReviewTable', () => {
  it('sin filas no muestra tabs de carrera y avisa que no hay tribunales', () => {
    render(<TribunalReviewTable rows={[]} onExport={vi.fn()} onExportPdf={vi.fn()} />)

    expect(screen.queryByLabelText('Carreras del precronograma completo')).not.toBeInTheDocument()
    expect(screen.getByText('Sin tribunales generados.')).toBeInTheDocument()
  })

  it('filtra la tabla por carrera para no mostrar todas las mesas juntas', () => {
    render(<TribunalReviewTable rows={rows} onExport={vi.fn()} onExportPdf={vi.fn()} />)

    expect(screen.getByText('Práctica Profesional I')).toBeInTheDocument()
    expect(screen.getByText('Anatomía')).toBeInTheDocument()
    expect(screen.queryByText('Lengua Inglesa')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Traductorado · 1' }))

    expect(screen.getByText('Lengua Inglesa')).toBeInTheDocument()
    expect(screen.queryByText('Práctica Profesional I')).not.toBeInTheDocument()
    expect(screen.queryByText('Anatomía')).not.toBeInTheDocument()
  })

  it('exporta siempre todas las carreras, no solo la carrera activa', () => {
    const onExportPdf = vi.fn()
    render(<TribunalReviewTable rows={rows} onExport={vi.fn()} onExportPdf={onExportPdf} />)

    fireEvent.click(screen.getByRole('button', { name: 'Traductorado · 1' }))
    fireEvent.click(screen.getByRole('button', { name: /PDF para docentes/ }))

    expect(onExportPdf).toHaveBeenCalledTimes(1)
  })

  it('publica para revision docente y avisa la limitacion de cuentas de portal', () => {
    const onPublishForReview = vi.fn()
    render(<TribunalReviewTable rows={rows} onExport={vi.fn()} onExportPdf={vi.fn()} onPublishForReview={onPublishForReview} />)

    fireEvent.click(screen.getByRole('button', { name: /Publicar para revision docente/ }))

    expect(onPublishForReview).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/solo llega a los docentes que ya tienen cuenta de/)).toBeInTheDocument()
  })

  it('deshabilita las acciones sin filas', () => {
    render(<TribunalReviewTable rows={[]} onExport={vi.fn()} onExportPdf={vi.fn()} onPublishForReview={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Publicar para revision docente/ })).toBeDisabled()
  })
})
