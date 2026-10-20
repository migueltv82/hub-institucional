import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), publish: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: { error: mocks.toastError, success: mocks.toastSuccess } }))
vi.mock('../../services/academicCatalogPublish.js', async (importOriginal) => ({ ...(await importOriginal()), readAcademicCatalogFile: mocks.read, publishAcademicCatalog: mocks.publish }))

import AcademicCatalogPublishSection from './AcademicCatalogPublishSection.jsx'

const props = { canPublish: true, inscripcionesAlumnos: [{ dni: '30111222', plan_id: 'ING-2024' }], institutionId: 'i1', useRemoteWorkspace: true }
const catalog = (extra = {}) => ({ errors: [], warnings: [], careers: [{}], plans: [{}], subjects: [{}, {}], planSubjects: [{}, {}], prerequisites: [{}], studentPlans: [{}], ...extra })
const file = new File(['x'], 'academica.xlsx')

function chooseFile() {
  fireEvent.change(screen.getByLabelText('Planilla académica'), { target: { files: [file] } })
}

describe('AcademicCatalogPublishSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra la vista previa y publica', async () => {
    mocks.read.mockResolvedValue(catalog())
    mocks.publish.mockResolvedValue({ carreras: 1, planes: 1, materiasEnPlanes: 2, correlativas: 0, alumnosActivos: 5, alumnosConPlan: 4 })
    render(<AcademicCatalogPublishSection {...props} />)
    chooseFile()
    expect(await screen.findByText('2 materias en planes')).toBeInTheDocument()
    expect(screen.getByText('sin correlativas')).toBeInTheDocument()
    expect(mocks.read).toHaveBeenCalledWith(file, { inscripcionesAlumnos: props.inscripcionesAlumnos, withPrerequisites: false })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar catalogo' }))
    expect(await screen.findByText('4 de 5 alumnos con plan')).toBeInTheDocument()
    expect(mocks.publish).toHaveBeenCalledWith({ institutionId: 'i1', catalog: expect.objectContaining({ errors: [] }) })
  })

  it('con correlativas lo pide al leer y las cuenta', async () => {
    mocks.read.mockResolvedValue(catalog())
    render(<AcademicCatalogPublishSection {...props} />)
    fireEvent.click(screen.getByRole('checkbox'))
    chooseFile()
    expect(await screen.findByText('1 correlativas')).toBeInTheDocument()
    expect(mocks.read).toHaveBeenCalledWith(file, expect.objectContaining({ withPrerequisites: true }))
  })

  it('con errores en la planilla no deja publicar', async () => {
    mocks.read.mockResolvedValue(catalog({ errors: ['plan_estudios: la materia X no tiene materia_nombre.'], warnings: ['fecha no reconocida'] }))
    render(<AcademicCatalogPublishSection {...props} />)
    chooseFile()
    expect(await screen.findByText(/no tiene materia_nombre/)).toBeInTheDocument()
    expect(screen.getByText('fecha no reconocida')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar catalogo' })).toBeDisabled()
  })

  it('sin rol owner/admin o sin sesion remota no se puede elegir planilla', () => {
    const { rerender } = render(<AcademicCatalogPublishSection {...props} canPublish={false} />)
    expect(screen.getByRole('button', { name: 'Elegir planilla académica' })).toBeDisabled()
    expect(screen.getByText(/Solo el owner o admin/)).toBeInTheDocument()
    rerender(<AcademicCatalogPublishSection {...props} useRemoteWorkspace={false} />)
    expect(screen.getByRole('button', { name: 'Elegir planilla académica' })).toBeDisabled()
  })
})
