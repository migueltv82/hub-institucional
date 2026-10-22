import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ teachers: vi.fn(), students: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn(), toast: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(mocks.toast, { error: mocks.toastError, success: mocks.toastSuccess }) }))
vi.mock('../../services/bulkRoster.js', async (importOriginal) => ({ ...(await importOriginal()), applyTeacherAssignments: mocks.teachers, applyStudentEnrollments: mocks.students }))

import BulkRosterSection from './BulkRosterSection.jsx'

const props = {
  canEditWorkspace: true,
  docenteMateria: [{ dni: '20111222', carrera: 'P', materia: 'ING01', rol_en_materia: 'TITULAR' }],
  inscripcionesAlumnos: [{ dni: '30111222', carrera: 'P', materia_codigo: 'ING01' }, { dni: '30222333', carrera: 'P', materia_codigo: 'ING01' }],
  institutionId: 'i1',
  dataInstitutionId: 'i1',
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

  describe('AUD.I2b P2: el resultado queda atado a su institucion', () => {
    const problemReport = { procesadas: 1, creadas: 0, actualizadas: 0, sin_cambios: 0, omitidas: 0, rechazadas: 1, problemas: [{ fila: '1', dni: '30111222', materia: 'MATERIA-A', estado: 'rechazada', motivo: 'ALUMNO_SIN_CUENTA' }] }

    it('reproduccion de Codex: una carga de A que termina despues de cambiar a B no se muestra en B', async () => {
      let resolveA
      mocks.students.mockImplementation(() => new Promise((resolve) => { resolveA = resolve }))
      const { rerender } = render(<BulkRosterSection {...props} institutionId="inst-A" dataInstitutionId="inst-A" />)
      fireEvent.click(screen.getByRole('button', { name: 'Inscribir cursadas (2)' }))
      expect(mocks.students).toHaveBeenCalledWith(expect.objectContaining({ institutionId: 'inst-A' }))

      rerender(<BulkRosterSection {...props} institutionId="inst-B" dataInstitutionId="inst-B" />)
      expect(screen.getByRole('status')).toHaveTextContent('otra institucion')
      expect(screen.getByRole('button', { name: 'Inscribir cursadas (2)' })).toBeDisabled()

      resolveA(problemReport)
      await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('institucion anterior')))
      expect(mocks.toastSuccess).not.toHaveBeenCalled()
      expect(screen.queryByText('30111222')).not.toBeInTheDocument()
      expect(screen.queryByText('MATERIA-A')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Inscribir cursadas (2)' })).toBeEnabled()

      rerender(<BulkRosterSection {...props} institutionId="inst-A" dataInstitutionId="inst-A" />)
      expect(screen.getByText('30111222')).toBeInTheDocument()
    })

    it('un resultado terminado tampoco queda visible al cambiar de institucion o de workspace', async () => {
      mocks.students.mockResolvedValue(problemReport)
      const { rerender } = render(<BulkRosterSection {...props} institutionId="inst-A" dataInstitutionId="inst-A" />)
      fireEvent.click(screen.getByRole('button', { name: 'Inscribir cursadas (2)' }))
      expect(await screen.findByText('30111222')).toBeInTheDocument()
      rerender(<BulkRosterSection {...props} institutionId="inst-B" dataInstitutionId="inst-B" />)
      expect(screen.queryByText('30111222')).not.toBeInTheDocument()
      rerender(<BulkRosterSection {...props} institutionId="inst-A" dataInstitutionId="inst-A" workspaceKey="otro" />)
      expect(screen.queryByText('30111222')).not.toBeInTheDocument()
    })

    it('un error de la institucion anterior se avisa como tal', async () => {
      let rejectA
      mocks.teachers.mockImplementation(() => new Promise((_resolve, reject) => { rejectA = reject }))
      const { rerender } = render(<BulkRosterSection {...props} institutionId="inst-A" dataInstitutionId="inst-A" />)
      fireEvent.click(screen.getByRole('button', { name: 'Aplicar titularidades (1)' }))
      rerender(<BulkRosterSection {...props} institutionId="inst-B" dataInstitutionId="inst-B" />)
      rejectA(Object.assign(new Error('No se pudo completar la carga masiva.'), { partialReport: problemReport }))
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('institucion anterior')))
      expect(screen.queryByText('30111222')).not.toBeInTheDocument()
    })
  })

  describe('AUD.18 H1: no aplicar planillas de otra institucion', () => {
    it('mientras la nueva institucion carga (o si su carga fallo) los botones quedan deshabilitados y se explica', () => {
      const { rerender } = render(<BulkRosterSection {...props} institutionId="inst-B" dataInstitutionId="inst-A" />)
      expect(screen.getByRole('button', { name: /Aplicar titularidades/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Inscribir cursadas/ })).toBeDisabled()
      expect(screen.getByRole('status')).toHaveTextContent('Todavia no estan cargadas las planillas de esta institucion')
      rerender(<BulkRosterSection {...props} institutionId="inst-B" dataInstitutionId={null} />)
      expect(screen.getByRole('button', { name: /Inscribir cursadas/ })).toBeDisabled()
      rerender(<BulkRosterSection {...props} institutionId="inst-B" dataInstitutionId="inst-B" />)
      expect(screen.getByRole('button', { name: /Inscribir cursadas/ })).toBeEnabled()
    })

    it('reproduccion del auditor: con datos de A y la institucion B activa no se llama al servicio', () => {
      render(<BulkRosterSection {...props} institutionId="inst-B" dataInstitutionId="inst-A" />)
      fireEvent.click(screen.getByRole('button', { name: /Inscribir cursadas/ }))
      fireEvent.click(screen.getByRole('button', { name: /Aplicar titularidades/ }))
      expect(mocks.students).not.toHaveBeenCalled()
      expect(mocks.teachers).not.toHaveBeenCalled()
    })
  })
})
