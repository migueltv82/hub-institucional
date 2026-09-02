import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStudentStore } from '../stores/studentStore.js'
import StudentAcademicStatusPage from './StudentAcademicStatusPage.jsx'

const PROGRAM_ID = 'program-1'

function subject(id, name, year = 1) {
  return {
    id,
    canonical_subject_id: id,
    subject_id: id,
    code: id,
    name,
    canonical_program_id: PROGRAM_ID,
    program_id: PROGRAM_ID,
    year,
    semester: year,
    credits: 0,
    is_mandatory: true,
  }
}

function enrollment(subjectId, status, academicStatus, extra = {}) {
  return {
    id: `enrollment-${subjectId}`,
    relational_id: `rel-enrollment-${subjectId}`,
    student_id: 'student-1',
    subject_id: subjectId,
    canonical_subject_id: subjectId,
    program_id: PROGRAM_ID,
    status,
    academic_status: academicStatus,
    enrolled_at: '2026-03-10',
    ...extra,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StudentAcademicStatusPage />
    </MemoryRouter>,
  )
}

function setStore(overrides = {}) {
  useStudentStore.getState().reset()
  useStudentStore.setState({
    currentProgram: {
      id: PROGRAM_ID,
      canonical_program_id: PROGRAM_ID,
      name: 'Profesorado',
    },
    subjects: [
      subject('CURSANDO-1', 'Practica Docente I'),
      subject('REGULAR-1', 'Didactica General'),
      subject('APROBADA-1', 'Lengua Inglesa I'),
    ],
    enrollments: [
      enrollment('CURSANDO-1', 'active'),
      enrollment('REGULAR-1', 'active', 'regular', { regularity_date: '2026-07-30' }),
      enrollment('APROBADA-1', 'completed', 'approved'),
    ],
    grades: [{
      id: 'final-aprobada',
      student_id: 'student-1',
      subject_enrollment_id: 'rel-enrollment-APROBADA-1',
      subject_id: 'APROBADA-1',
      program_id: PROGRAM_ID,
      grade_type: 'final',
      grade_value: 8,
      academic_status: 'approved',
      graded_at: '2026-08-20',
    }],
    loading: false,
    error: null,
    ...overrides,
  })
}

describe('StudentAcademicStatusPage', () => {
  beforeEach(() => {
    setStore()
  })

  it('muestra todo el plan sin convertir la cursada en estado academico con fecha', () => {
    renderPage()

    expect(screen.getByText('Practica Docente I')).toBeInTheDocument()
    expect(screen.getByText('Didactica General')).toBeInTheDocument()
    expect(screen.getByText('Lengua Inglesa I')).toBeInTheDocument()
    expect(screen.queryByText('Cursando')).not.toBeInTheDocument()

    const activeRow = screen.getByText('Practica Docente I').closest('tr')
    expect(within(activeRow).getByText('Pendiente')).toBeInTheDocument()
    expect(within(activeRow).queryByText('10/03/26')).not.toBeInTheDocument()

    const regularRow = screen.getByText('Didactica General').closest('tr')
    expect(within(regularRow).getByText('30/07/26')).toBeInTheDocument()
    expect(within(regularRow).getByText('Regular')).toBeInTheDocument()

    const approvedRow = screen.getByText('Lengua Inglesa I').closest('tr')
    expect(within(approvedRow).getByText('8')).toBeInTheDocument()
    expect(within(approvedRow).getByText('20/08/26')).toBeInTheDocument()
    expect(within(approvedRow).getByText('Aprobada')).toBeInTheDocument()
  })
})
