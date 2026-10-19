import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ save: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(), toast: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(mocks.toast, { error: mocks.toastError, success: mocks.toastSuccess }) }))
vi.mock('../../services/examActaResults.js', async (importOriginal) => ({ ...(await importOriginal()), saveExamActaResults: mocks.save }))

import ExamActaEditor from './ExamActaEditor.jsx'

const roster = (overrides = {}) => ({
  puedeCargarNotas: true,
  actaCerrada: false,
  alumnos: [
    { inscripcion_id: 'e1', nombre: 'Ana Perez', dni: '1' },
    { inscripcion_id: 'e2', nombre: 'Luis Gomez', dni: '2' },
  ],
  ...overrides,
})

describe('ExamActaEditor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('el titular carga notas, ve el resultado en vivo y guarda solo lo que cambio', async () => {
    mocks.save.mockResolvedValue({ guardados: 1, actaCerrada: false })
    const onSaved = vi.fn()
    render(<ExamActaEditor examKey="m1" institutionId="i1" onSaved={onSaved} roster={roster()} />)

    fireEvent.change(screen.getByLabelText('Nota final de Ana Perez'), { target: { value: '8' } })
    expect(screen.getByText('Aprobado (8)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cerrar acta/ })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ examKey: 'm1', close: false, rows: [{ inscripcion_id: 'e1', ausente: false, escrito: '', oral: '', nota: '8' }] }))
  })

  it('marcar ausente limpia las notas y con todos cargados se puede cerrar', async () => {
    mocks.save.mockResolvedValue({ guardados: 2, actaCerrada: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<ExamActaEditor examKey="m1" institutionId="i1" roster={roster()} />)

    fireEvent.change(screen.getByLabelText('Escrito de Ana Perez'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Oral de Ana Perez'), { target: { value: '4' } })
    expect(screen.getByText('Desaprobado (3.5)')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Ausente: Luis Gomez'))
    expect(screen.getByLabelText('Nota final de Luis Gomez')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Cerrar acta/ }))

    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ close: true })))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Acta cerrada.')
  })

  it('acta cerrada: el docente solo lee; secretaria corrige con motivo', async () => {
    const closed = roster({ actaCerrada: true, puedeCargarNotas: false, alumnos: [{ inscripcion_id: 'e1', nombre: 'Ana Perez', resultado: 'failed', nota: 3 }] })
    const { unmount } = render(<ExamActaEditor examKey="m1" institutionId="i1" roster={closed} />)
    expect(screen.getByLabelText('Nota final de Ana Perez')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull()
    expect(screen.getByText(/avisale a secretaria/)).toBeInTheDocument()
    unmount()

    mocks.save.mockResolvedValue({ guardados: 1, actaCerrada: true })
    render(<ExamActaEditor examKey="m1" institutionId="i1" isStaff roster={closed} />)
    fireEvent.change(screen.getByLabelText('Nota final de Ana Perez'), { target: { value: '7' } })
    const button = screen.getByRole('button', { name: 'Guardar correccion' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Motivo de la correccion'), { target: { value: 'Error de transcripcion' } })
    fireEvent.click(button)
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Error de transcripcion', close: false })))
  })

  it('antes del dia del examen no deja cargar', () => {
    render(<ExamActaEditor examKey="m1" institutionId="i1" roster={roster({ puedeCargarNotas: false })} />)
    expect(screen.getByText(/desde el dia del examen/)).toBeInTheDocument()
    expect(screen.getByLabelText('Nota final de Ana Perez')).toBeDisabled()
  })
})
