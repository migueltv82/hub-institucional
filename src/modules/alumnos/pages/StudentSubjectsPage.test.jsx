import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudentStore } from '../stores/studentStore.js'
import StudentSubjectsPage from './StudentSubjectsPage.jsx'

const PROGRAM = 'Profesorado de Ingles'

function subject(code, semester, name = code) {
  return {
    id: code,
    canonical_subject_id: code,
    subject_id: code,
    code,
    name,
    canonical_program_id: PROGRAM,
    program_id: PROGRAM,
    semester,
    credits: 0,
    is_mandatory: true,
  }
}

function renderPage(props = {}) {
  return render(
    <MemoryRouter>
      <StudentSubjectsPage {...props} />
    </MemoryRouter>,
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
    currentProgram: {
      id: PROGRAM,
      canonical_program_id: PROGRAM,
      name: PROGRAM,
    },
    currentInstitution: { id: 'inst-1', name: 'Instituto' },
    subjects: [
      subject('ING01', 1, 'Lengua Inglesa I'),
      subject('ING02', 2, 'Lengua Inglesa II'),
    ],
    enrollments: [{
      id: 'enrollment-ing01',
      student_id: 'student-1',
      subject_id: 'ING01',
      canonical_subject_id: 'ING01',
      program_id: PROGRAM,
      status: 'active',
    }],
    prerequisites: [],
    grades: [],
    attendanceRecords: [],
    loading: false,
    error: null,
    ...overrides,
  })
}

describe('StudentSubjectsPage', () => {
  beforeEach(() => {
    setStore()
  })

  it('abre en cursando y permite cambiar a disponibles para inscribirse', async () => {
    const onEnroll = vi.fn(async (payload) => ({ id: 'enrollment-ing02', ...payload }))
    setStore({
      subjects: [
        subject('ING02', 2, 'Lengua Inglesa II'),
        subject('ING01', 1, 'Lengua Inglesa I'),
      ],
    })

    renderPage({ onEnroll })

    const subjectCards = screen.getAllByRole('article')
    expect(screen.getByLabelText('Filtrar materias por estado')).toHaveValue('active')
    expect(within(subjectCards[0]).getByText('Lengua Inglesa I')).toBeInTheDocument()
    expect(within(subjectCards[0]).getByText('Cursando')).toBeInTheDocument()
    expect(screen.queryByText('Lengua Inglesa II')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Filtrar materias por estado'), { target: { value: 'available' } })

    expect(screen.queryByText('Lengua Inglesa I')).not.toBeInTheDocument()
    expect(screen.getByText('Lengua Inglesa II')).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))
    fireEvent.click(screen.getByLabelText('Confirmo que revise la materia, carrera y correlatividades.'))
    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))

    await waitFor(() => {
      expect(onEnroll).toHaveBeenCalledWith(expect.objectContaining({
        profile_id: 'student-1',
        student_record_id: 'student-record-1',
        subject_id: 'ING02',
        program_id: PROGRAM,
      }), expect.any(Object))
    })
  })

  it('explica cuando la inscripcion esta bloqueada por anios previos incompletos', () => {
    setStore({
      subjects: [
        subject('ING01', 1, 'Lengua Inglesa I'),
        subject('ING03', 3, 'Lengua Inglesa III'),
      ],
      enrollments: [],
      filterStatus: 'available',
    })

    renderPage()

    const blockedCard = screen.getByText('Lengua Inglesa III').closest('article')

    expect(within(blockedCard).getByText('Anios previos pendientes')).toBeInTheDocument()
    expect(within(blockedCard).getByText(/Faltan: Lengua Inglesa I/)).toBeInTheDocument()
    expect(within(blockedCard).getByRole('button', { name: 'Inscribirme' })).toBeDisabled()
  })
})
