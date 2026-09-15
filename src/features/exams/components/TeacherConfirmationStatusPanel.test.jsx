import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TeacherConfirmationStatusPanel from './TeacherConfirmationStatusPanel.jsx'

const mesas = [
  {
    draftMesaId: 'draft:1',
    materiaMesa: 'Didactica General',
    carrera: 'Profesorado de Historia',
    fecha: '2026-08-10',
    titular: { nombre: 'Ana Titular', status: 'confirmed', notas: '', confirmedAt: '2026-08-01' },
    vocal1: { nombre: 'Bruno Vocal', teacherId: 'uid-bruno', examTableId: 'draft:1', status: 'objected', notas: 'No puedo ese dia', confirmedAt: null },
    vocal2: null,
  },
]

describe('TeacherConfirmationStatusPanel', () => {
  it('muestra los contadores agregados y el detalle por mesa con notas de objecion', () => {
    render(
      <TeacherConfirmationStatusPanel
        mesas={mesas}
        counts={{ confirmed: 1, pending: 0, objected: 1, total: 2 }}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('1 confirmadas')).toBeInTheDocument()
    expect(screen.getByText('1 objetadas')).toBeInTheDocument()
    expect(screen.getByText('Ana Titular')).toBeInTheDocument()
    expect(screen.getByText('Confirmada')).toBeInTheDocument()
    expect(screen.getByText('Objetada')).toBeInTheDocument()
    expect(screen.getByText('No puedo ese dia')).toBeInTheDocument()
  })

  it('muestra "sin publicar" para un rol sin asignacion', () => {
    render(
      <TeacherConfirmationStatusPanel
        mesas={mesas}
        counts={{ confirmed: 1, pending: 0, objected: 1, total: 2 }}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('Vocal 2: sin publicar')).toBeInTheDocument()
  })

  it('llama a onRefresh al apretar Actualizar', () => {
    const onRefresh = vi.fn()
    render(
      <TeacherConfirmationStatusPanel
        mesas={mesas}
        counts={{ confirmed: 1, pending: 0, objected: 1, total: 2 }}
        onRefresh={onRefresh}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('permite confirmar mesas listas y hacer bypass admin por rol o mesa', () => {
    const onConfirmReadyMesas = vi.fn()
    const onConfirmAssignmentAsAdmin = vi.fn()
    const onConfirmMesaAsAdmin = vi.fn()

    render(
      <TeacherConfirmationStatusPanel
        canConfirmAsAdmin
        mesas={mesas}
        counts={{ confirmed: 1, pending: 0, objected: 1, total: 2 }}
        onConfirmAssignmentAsAdmin={onConfirmAssignmentAsAdmin}
        onConfirmMesaAsAdmin={onConfirmMesaAsAdmin}
        onConfirmReadyMesas={onConfirmReadyMesas}
        onRefresh={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mesas listas' }))
    fireEvent.click(screen.getByRole('button', { name: /^Confirmar$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mesa' }))

    expect(onConfirmReadyMesas).toHaveBeenCalledTimes(1)
    expect(onConfirmAssignmentAsAdmin).toHaveBeenCalledWith('draft:1', 'uid-bruno')
    expect(onConfirmMesaAsAdmin).toHaveBeenCalledWith('draft:1')
  })

  it('muestra estado vacio cuando todavia no se publico nada', () => {
    render(
      <TeacherConfirmationStatusPanel
        mesas={[]}
        counts={{ confirmed: 0, pending: 0, objected: 0, total: 0 }}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText('Todavía no publicaste el precronograma para revisión docente.')).toBeInTheDocument()
  })
})
