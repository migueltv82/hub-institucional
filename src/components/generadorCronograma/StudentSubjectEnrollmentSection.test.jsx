import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react'
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
})
