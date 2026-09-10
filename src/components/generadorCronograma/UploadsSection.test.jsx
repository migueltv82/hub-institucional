import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UploadsSection from './UploadsSection.jsx'

function renderStudentUpload(props = {}) {
  return render(
    <MemoryRouter>
      <UploadsSection scope="students" {...props} />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UploadsSection', () => {
  it('permite abrir el selector para reemplazar una planilla de alumnos real', () => {
    renderStudentUpload({ uploadedFiles: { alumnosWorkbook: 'alumnos.xlsx' } })

    const input = screen.getByLabelText('Archivo de plantilla de alumnos')
    const openPicker = vi.spyOn(input, 'click').mockImplementation(() => {})
    const button = screen.getByRole('button', { name: 'Reemplazar plantilla de alumnos' })

    expect(button).toBeEnabled()
    expect(input).toBeEnabled()
    expect(screen.getByText('alumnos.xlsx')).toBeInTheDocument()

    fireEvent.click(button)

    expect(openPicker).toHaveBeenCalledTimes(1)
  })

  it('entrega el archivo seleccionado al handler de alumnos', () => {
    const onUploadStudents = vi.fn()
    const onUploadTeachers = vi.fn()
    const onUploadMaster = vi.fn()
    renderStudentUpload({ onUploadStudents, onUploadTeachers, onUploadMaster })
    const file = new File(['planilla'], 'alumnos.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    fireEvent.change(screen.getByLabelText('Archivo de plantilla de alumnos'), {
      target: { files: [file] },
    })

    expect(onUploadStudents).toHaveBeenCalledTimes(1)
    expect(onUploadStudents.mock.calls[0][0].target.files).toEqual([file])
    expect(onUploadTeachers).not.toHaveBeenCalled()
    expect(onUploadMaster).not.toHaveBeenCalled()
  })

  it('ofrece cargar una planilla cuando no se recibe metadata de archivos', () => {
    renderStudentUpload()

    expect(screen.getByRole('button', { name: 'Cargar plantilla de alumnos' })).toBeEnabled()
    expect(screen.getByLabelText('Archivo de plantilla de alumnos')).toBeEnabled()
    expect(screen.getByText('Archivo pendiente.')).toBeInTheDocument()
  })

  it('explica el bloqueo por rol y mantiene deshabilitado el selector', () => {
    renderStudentUpload({ canEditWorkspace: false })

    expect(screen.getByText('Tu rol permite consultar datos, pero no cargar planillas.')).toBeInTheDocument()
    expect(screen.getByLabelText('Archivo de plantilla de alumnos')).toBeDisabled()
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Configurar carga de planillas' })).not.toBeInTheDocument()
  })

  it('no presenta la fuente relacional como un archivo original reemplazable', () => {
    renderStudentUpload({
      canEditWorkspace: false,
      isRelationalWorkspaceSource: true,
      canManageDataSource: true,
      uploadedFiles: { alumnosWorkbook: 'schema-relacional' },
    })

    expect(screen.getByText('Datos de la institución')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Carga deshabilitada' })).toBeDisabled()
    expect(screen.getByLabelText('Archivo de plantilla de alumnos')).toBeDisabled()
    expect(screen.queryByText('schema-relacional')).not.toBeInTheDocument()
    expect(screen.queryByText(/Reemplazar/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Configurar carga de planillas' })).toHaveAttribute(
      'href',
      '/super-admin/instituciones',
    )
  })

  it('no ofrece configurar la fuente relacional a quien no administra esa configuración', () => {
    renderStudentUpload({
      canEditWorkspace: false,
      isRelationalWorkspaceSource: true,
      canManageDataSource: false,
      uploadedFiles: { alumnosWorkbook: 'schema-relacional' },
    })

    expect(screen.getByRole('button', { name: 'Carga deshabilitada' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Configurar carga de planillas' })).not.toBeInTheDocument()
  })
})
