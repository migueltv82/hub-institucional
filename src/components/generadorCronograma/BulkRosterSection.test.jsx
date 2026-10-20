import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ teachers: vi.fn(), students: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { error: mocks.toastError, success: mocks.toastSuccess } }))
vi.mock('../../services/bulkRoster.js', async (importOriginal) => ({ ...(await importOriginal()), applyTeacherAssignments: mocks.teachers, applyStudentEnrollments: mocks.students }))

import BulkRosterSection from './BulkRosterSection.jsx'

const props = {
  canEditWorkspace: true,
  docenteMateria: [{ dni: '20111222', carrera: 'P', materia: 'ING01', rol_en_materia: 'TITULAR' }],
  inscripcionesAlumnos: [{ dni: '30111222', carrera: 'P', materia_codigo: 'ING01' }, { dni: '30222333', carrera: 'P', materia_codigo: 'ING01' }],
  institutionId: 'i1',
  useRemoteWorkspace: true,
}

describe('BulkRosterSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aplica titularidades y muestra el resumen', async () => {
    mocks.teachers.mockResolvedValue({ procesadas: 1, creadas: 1, actualizadas: 0, sin_cambios: 0, omitidas: 0, rechazadas: 0, problemas: [] })
    render(<BulkRosterSection {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar titularidades (1)' }))
    expect(await screen.findByText('1 nuevas')).toBeInTheDocument()
    expect(mocks.teachers).toHaveBeenCalledWith(expect.objectContaining({ institutionId: 'i1', rows: [{ fila: '1', dni: '20111222', carrera: 'P', materia: 'ING01', rol: 'TITULAR' }] }))
  })

  it('una renuncia de la planilla no se manda a la base: se informa como omitida', async () => {
    mocks.teachers.mockImplementation(async ({ skipped }) => ({ procesadas: 2, creadas: 1, actualizadas: 0, sin_cambios: 0, omitidas: skipped.length, rechazadas: 0, problemas: skipped }))
    const docenteMateria = [...props.docenteMateria, { dni: '20333444', carrera: 'P', materia: 'ING02', estado_asignacion: 'RENUNCIA' }]
    render(<BulkRosterSection {...props} docenteMateria={docenteMateria} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar titularidades (1)' }))
    expect(await screen.findByText(/renuncia, baja o reemplazado/)).toBeInTheDocument()
    const call = mocks.teachers.mock.calls[0][0]
    expect(call.rows.map((row) => row.materia)).toEqual(['ING01'])
    expect(call.skipped).toEqual([{ fila: '2', estado: 'omitida', motivo: 'ASIGNACION_NO_VIGENTE', dni: '20333444', materia: 'ING02' }])
  })

  it('inscribe cursadas y explica las filas con problema', async () => {
    mocks.students.mockResolvedValue({ procesadas: 2, creadas: 1, actualizadas: 0, sin_cambios: 0, omitidas: 0, rechazadas: 1, problemas: [{ fila: '2', dni: '30222333', materia: 'ING01', estado: 'rechazada', motivo: 'ALUMNO_SIN_CUENTA' }] })
    render(<BulkRosterSection {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Inscribir cursadas (2)' }))
    expect(await screen.findByText(/todavia no tiene acceso/)).toBeInTheDocument()
    expect(screen.getByText('1 con error')).toBeInTheDocument()
  })

  it('solo lectura, sin sesion remota o sin datos: no se puede aplicar', () => {
    const { rerender } = render(<BulkRosterSection {...props} canEditWorkspace={false} />)
    expect(screen.getByRole('button', { name: /Aplicar titularidades/ })).toBeDisabled()
    rerender(<BulkRosterSection {...props} docenteMateria={[]} inscripcionesAlumnos={[]} />)
    expect(screen.getByRole('button', { name: 'Aplicar titularidades (0)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Inscribir cursadas (0)' })).toBeDisabled()
  })
})
