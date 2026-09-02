import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudentStore } from '../stores/studentStore.js'
import StudentExamEnrollmentPage from './StudentExamEnrollmentPage.jsx'

vi.mock('../../../auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { id: 'student-1', email: 'ana@example.com' },
    isRemoteSession: false,
    isSuperAdmin: false,
  }),
}))

vi.mock('../../../hooks/useSyncData.js', () => ({
  useSyncData: () => ({ isSubscribed: false }),
}))

function renderPage(props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StudentExamEnrollmentPage {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function setStore(overrides = {}) {
  useStudentStore.getState().reset()
  useStudentStore.setState({
    currentStudent: {
      id: 'student-1',
      profile_id: 'student-1',
      record_id: 'student-record-1',
      full_name: 'Ana Perez',
    },
    currentInstitution: { id: 'inst-1', name: 'Instituto' },
    exams: [{
      id: 'exam-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      subject: { code: 'ING13', name: 'Practica gramatical' },
      subject_name: 'Practica gramatical',
      exam_date: '2099-08-10T14:00:00.000Z',
      location: 'Aula 1',
    }],
    examEnrollments: [],
    enrollments: [{
      id: 'enrollment-1',
      relational_id: 'rel-enrollment-1',
      student_id: 'student-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      status: 'active',
    }],
    grades: [{
      id: 'grade-1',
      student_id: 'student-1',
      enrollment_id: 'enrollment-1',
      subject_enrollment_id: 'rel-enrollment-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      grade_type: 'final',
      academic_status: 'regular',
      updated_at: '2026-08-01T10:00:00.000Z',
    }],
    loading: false,
    error: null,
    success: null,
    ...overrides,
  })
}

describe('StudentExamEnrollmentPage', () => {
  beforeEach(() => {
    setStore()
  })

  it('bloquea la inscripcion a mesa cuando la condicion no es regular', () => {
    setStore({
      grades: [{
        id: 'grade-1',
        student_id: 'student-1',
        enrollment_id: 'enrollment-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
        grade_type: 'final',
        academic_status: 'libre',
        updated_at: '2026-08-01T10:00:00.000Z',
      }],
    })

    renderPage()

    expect(screen.getByText('La condicion cargada es libre; esta mesa requiere regularidad.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inscribirme' })).toBeDisabled()
  })

  it('envia ids canonicos y student_record_id al registrar mesa habilitada', async () => {
    const onRegisterExam = vi.fn(async (payload) => ({
      id: 'exam-enrollment-1',
      ...payload,
    }))

    renderPage({ onRegisterExam })

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))

    await waitFor(() => {
      expect(onRegisterExam).toHaveBeenCalledWith(expect.objectContaining({
        exam_session_id: 'exam-1',
        exam_table_id: 'exam-1',
        profile_id: 'student-1',
        student_id: 'student-1',
        student_record_id: 'student-record-1',
        subject_id: 'ING13',
        program_id: 'Profesorado de Ingles',
      }), expect.any(Object))
    })
  })
})
