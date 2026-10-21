import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ end: vi.fn(), fetch: vi.fn(), resolve: vi.fn() }))
vi.mock('../../services/subjectTeacherAssignments.js', async (importOriginal) => ({
  ...(await importOriginal()),
  endSubjectTeacherAssignment: mocks.end,
  fetchSubjectTeacherAssignmentsForTeacher: mocks.fetch,
  resolveTeacherProfile: mocks.resolve,
}))

import TeacherRosterSection from './TeacherRosterSection.jsx'

const titular = { id: 'as-1', subject_id: 'GEO38', program_id: 'PROFESORADO DE GEOGRAFIA', role: 'titular', status: 'active', source: 'manual', metadata: {} }

function renderPanel() {
  render(
    <TeacherRosterSection
      activeInstitution={{ id: 'inst-1' }}
      canEditWorkspace
      docentes={[{ full_name: 'ALE JIMENA', dni: '36942805' }]}
      horariosDocentes={[]}
      planesEstudio={[{ carrera: 'PROFESORADO DE GEOGRAFIA', materia: 'GEO38', nombre: 'Geografia Argentina', anio: 4 }]}
      cargaHorariaDocente={[]}
      disponibilidadDocente={[]}
      fechasBloqueadasDocente={[]}
      careerOptions={['PROFESORADO DE GEOGRAFIA']}
    />,
  )
  fireEvent.click(screen.getByText('ALE JIMENA'))
}

describe('Punto 3: baja de una asignacion docente con motivo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolve.mockResolvedValue({ success: true, profile: { user_id: 'u-1' } })
    mocks.fetch.mockResolvedValue([titular])
  })

  it('pide motivo y fecha, no permite fecha futura y registra la baja por RPC', async () => {
    mocks.end.mockResolvedValue({ success: true, data: { remainingReplacements: 0 } })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Dar de baja/ }))

    const dialog = screen.getByRole('region', { name: 'Dar de baja la asignación' })
    const confirm = within(dialog).getByRole('button', { name: 'Confirmar baja' })
    expect(confirm).toBeDisabled()
    expect(within(dialog).getByLabelText('Fecha de la baja')).toHaveAttribute('max')

    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'renuncia' } })
    fireEvent.change(within(dialog).getByLabelText('Observaciones (opcional)'), { target: { value: 'Presento nota' } })
    fireEvent.click(confirm)

    await waitFor(() => expect(mocks.end).toHaveBeenCalledWith(expect.objectContaining({ id: 'as-1', reason: 'renuncia', notes: 'Presento nota' })))
    expect(await screen.findByRole('status')).toHaveTextContent('Baja registrada')
    expect(screen.queryByRole('region', { name: 'Dar de baja la asignación' })).not.toBeInTheDocument()
  })

  it('si el docente estaba de licencia avisa que el reemplazante sigue a cargo', async () => {
    mocks.end.mockResolvedValue({ success: true, data: { remainingReplacements: 1 } })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Dar de baja/ }))
    const dialog = screen.getByRole('region', { name: 'Dar de baja la asignación' })
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'jubilacion' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar baja' }))
    expect(await screen.findByRole('status')).toHaveTextContent('El reemplazante sigue a cargo')
  })

  it('si la base rechaza, el error se ve dentro del modal y la materia sigue', async () => {
    mocks.end.mockResolvedValue({ success: false, error: 'No se pudo dar de baja la asignacion. La asignacion ya estaba terminada.' })
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /Dar de baja/ }))
    const dialog = screen.getByRole('region', { name: 'Dar de baja la asignación' })
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'baja' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar baja' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ya estaba terminada')
  })

  it('muestra quien reemplaza a quien con el vinculo real', async () => {
    mocks.fetch.mockResolvedValue([
      { ...titular, role: 'licencia', metadata: { replacement_teacher_name: 'Quiroga Esteban', leave_ends_on: '2026-11-30' } },
      { ...titular, id: 'as-2', subject_id: 'GEO39', role: 'suplente', source: 'leave', replaces_assignment_id: 'as-9', ends_on: '2026-11-30', metadata: { teacher_on_leave_name: 'Ortiz Milagros' } },
    ])
    renderPanel()
    expect(await screen.findByText(/lo reemplaza Quiroga Esteban hasta el 30\/11\/2026/)).toBeInTheDocument()
    expect(screen.getByText(/Reemplaza a Ortiz Milagros hasta el 30\/11\/2026/)).toBeInTheDocument()
  })
})
