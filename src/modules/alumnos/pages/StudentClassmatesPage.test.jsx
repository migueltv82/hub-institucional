import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStudentStore } from '../stores/studentStore.js'
import StudentClassmatesPage from './StudentClassmatesPage.jsx'

const PROGRAM = 'Profesorado de Ingles'

function Layout({ data }) {
  return <Outlet context={{ data }} />
}

function renderPage(data = {}) {
  return render(
    <MemoryRouter initialEntries={["/app/companeros"]}>
      <Routes>
        <Route element={<Layout data={data} />}>
          <Route path="/app/companeros" element={<StudentClassmatesPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function setStore(overrides = {}) {
  useStudentStore.getState().reset()
  useStudentStore.setState({
    currentStudent: {
      id: 'student-1',
      profile_id: 'student-1',
      email: 'maria@example.com',
      full_name: 'Maria Gonzalez Lelong',
    },
    subjects: [{
      id: 'ING01',
      canonical_subject_id: 'ING01',
      subject_id: 'ING01',
      code: 'ING01',
      name: 'Lengua Inglesa I',
      program_id: PROGRAM,
      canonical_program_id: PROGRAM,
    }],
    enrollments: [{
      id: 'enrollment-1',
      student_id: 'student-1',
      subject_id: 'ING01',
      program_id: PROGRAM,
      status: 'active',
    }],
    loading: false,
    error: null,
    ...overrides,
  })
}

describe('StudentClassmatesPage', () => {
  beforeEach(() => {
    setStore()
  })

  it('muestra companieros por materia desde el snapshot', () => {
    renderPage({
      workspaceSnapshot: {
        enrollments: [
          { student_id: 'student-1', email: 'maria@example.com', full_name: 'Maria Gonzalez Lelong', subject_id: 'ING01', program_id: PROGRAM, status: 'active' },
          { student_id: 'student-2', full_name: 'Ana Perez', subject_id: 'ING01', program_id: PROGRAM, status: 'active' },
        ],
      },
    })

    expect(screen.getByRole('heading', { name: 'Compañeros' })).toBeInTheDocument()
    const card = screen.getByRole('article')
    expect(within(card).getByText('Lengua Inglesa I')).toBeInTheDocument()
    expect(within(card).getByText('Ana Perez')).toBeInTheDocument()
  })

  it('renderiza companieros cuando llegan desde la RPC segura', () => {
    renderPage({
      workspaceSnapshot: {
        courseClassmates: [{
          subject_id: 'ING01',
          program_id: PROGRAM,
          classmates: [{ id: 'student-2', full_name: 'Ana Perez' }],
        }],
      },
    })

    expect(screen.getByText('Lengua Inglesa I')).toBeInTheDocument()
    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
  })

  it('muestra estado vacio cuando la materia no tiene otros companieros', () => {
    renderPage({ workspaceSnapshot: { enrollments: [] } })

    expect(screen.getByText('Todavía no hay otros compañeros activos en esta materia.')).toBeInTheDocument()
  })
})


