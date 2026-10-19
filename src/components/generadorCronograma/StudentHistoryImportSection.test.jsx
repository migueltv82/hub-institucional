import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  importHistory: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: mocks.toastError, success: mocks.toastSuccess } }))
vi.mock('../../services/studentHistoryImport.js', async (importOriginal) => ({
  ...(await importOriginal()),
  parseStudentHistoryWorkbook: mocks.parse,
  importStudentHistory: mocks.importHistory,
}))

import StudentHistoryImportSection from './StudentHistoryImportSection.jsx'

function upload() {
  const input = screen.getByLabelText('Archivo de historia academica')
  fireEvent.change(input, { target: { files: [new File(['x'], 'historia.xlsx')] } })
}

describe('StudentHistoryImportSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('importa la planilla y muestra el resumen con los motivos en castellano', async () => {
    mocks.parse.mockResolvedValue([{ fila: '2' }, { fila: '3' }])
    mocks.importHistory.mockResolvedValue({
      procesadas: 2, importadas: 1, actualizadas: 0, omitidas: 0, rechazadas: 1,
      problemas: [{ fila: '3', dni: '30111222', materia: 'ING02', estado: 'rechazada', motivo: 'ALUMNO_SIN_CUENTA' }],
    })
    render(<StudentHistoryImportSection canEditWorkspace institutionId="inst-1" useRemoteWorkspace workspaceKey="main" />)

    upload()

    expect(await screen.findByText('1 nuevas')).toBeInTheDocument()
    expect(screen.getByText('1 con error')).toBeInTheDocument()
    expect(screen.getByText(/todavia no tiene acceso/)).toBeInTheDocument()
    expect(mocks.importHistory).toHaveBeenCalledWith(expect.objectContaining({ institutionId: 'inst-1', workspaceKey: 'main', rows: [{ fila: '2' }, { fila: '3' }] }))
    expect(mocks.toastSuccess).toHaveBeenCalled()
  })

  it('si un lote falla muestra lo ya importado y el error', async () => {
    mocks.parse.mockResolvedValue([{ fila: '2' }])
    const failure = new Error('Solo el owner, admin o editor de la institucion puede importar historia academica.')
    failure.partialReport = { procesadas: 0, importadas: 0, actualizadas: 0, omitidas: 0, rechazadas: 0, problemas: [] }
    mocks.importHistory.mockRejectedValue(failure)
    render(<StudentHistoryImportSection canEditWorkspace institutionId="inst-1" useRemoteWorkspace />)

    upload()

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(failure.message))
    expect(screen.getByText('0 nuevas')).toBeInTheDocument()
  })

  it('el rol de solo lectura o sin sesion remota no puede importar', () => {
    const { rerender } = render(<StudentHistoryImportSection canEditWorkspace={false} institutionId="inst-1" useRemoteWorkspace />)
    expect(screen.getByRole('button', { name: /Importar historia/ })).toBeDisabled()
    rerender(<StudentHistoryImportSection canEditWorkspace institutionId="inst-1" useRemoteWorkspace={false} />)
    expect(screen.getByRole('button', { name: /Importar historia/ })).toBeDisabled()
    expect(screen.getByText(/iniciar sesion remota/)).toBeInTheDocument()
  })
})
