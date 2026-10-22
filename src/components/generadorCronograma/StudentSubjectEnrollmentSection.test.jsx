import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudentSubjectEnrollmentSection from './StudentSubjectEnrollmentSection.jsx'

const mocks = vi.hoisted(() => ({
  createSubjectEnrollment: vi.fn(),
  dropSubjectEnrollment: vi.fn(),
  fetchSubjectEnrollments: vi.fn(),
  resolveStudentProfile: vi.fn(),
  resolveStudentRecordId: vi.fn(),
}))

vi.mock('../../services/subjectEnrollments.js', () => mocks)

function renderSection(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <StudentSubjectEnrollmentSection
        activeInstitution={{ id: 'inst-1', name: 'Instituto' }}
        alumnos={[{ id: 'student-1', nombre: 'Ana', apellido: 'Perez', email: 'ana@example.com' }]}
        canEditWorkspace
        planesEstudio={[{ carrera: 'Profesorado', materia: 'MAT1', nombreMateria: 'Matematica I' }]}
        {...props}
      />
    </QueryClientProvider>,
  )
}

describe('StudentSubjectEnrollmentSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchSubjectEnrollments.mockResolvedValue([])
    mocks.resolveStudentProfile.mockResolvedValue({ success: true, profile: { user_id: 'user-1' } })
  })

  it('no monta el modulo ni consulta subject_enrollments cuando el workspace viene del schema relacional nuevo', () => {
    const { container } = renderSection({ isRelationalWorkspaceSource: true })

    expect(container).toBeEmptyDOMElement()
    expect(mocks.fetchSubjectEnrollments).not.toHaveBeenCalled()
    expect(mocks.resolveStudentProfile).not.toHaveBeenCalled()
  })

  it('mantiene la lectura legacy cuando la institucion usa workspace_snapshots', async () => {
    renderSection()

    await waitFor(() => {
      expect(mocks.fetchSubjectEnrollments).toHaveBeenCalledWith({
        institutionId: 'inst-1',
        workspaceKey: 'main',
      })
    })
  })

  it('D1 P3: sin cursadas cargadas, explica que la planilla trae inscripciones pendientes de aplicar', async () => {
    renderSection({ inscripcionesAlumnos: [
      { dni: '30111222', carrera: 'Profesorado', materia_codigo: 'MAT1' },
      { dni: '30111223', carrera: 'Profesorado', materia_codigo: 'MAT1' },
    ] })

    expect(await screen.findByText('No hay inscripciones cargadas.')).toBeInTheDocument()
    expect(screen.getByText(/La planilla de alumnos trae 2 inscripciones a materias\./)).toBeInTheDocument()
    expect(screen.getByText(/«Inscribir cursadas»/)).toBeInTheDocument()
  })

  it('sin planilla no agrega la explicacion', async () => {
    renderSection()

    expect(await screen.findByText('No hay inscripciones cargadas.')).toBeInTheDocument()
    expect(screen.queryByText(/La planilla de alumnos trae/)).not.toBeInTheDocument()
  })
})
