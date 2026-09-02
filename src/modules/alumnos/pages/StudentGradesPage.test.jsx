import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStudentStore } from '../stores/studentStore.js'
import StudentGradesPage from './StudentGradesPage.jsx'

function setStore(overrides = {}) {
  useStudentStore.getState().reset()
  useStudentStore.setState({
    enrollments: [{
      id: 'enrollment-ing06',
      relational_id: 'rel-enrollment-ing06',
      student_id: 'student-1',
      subject_id: 'ING06',
      program_id: 'Profesorado de Ingles',
      subject_name: 'FONETICA Y FONOLOGIA INGLESA I',
      subject_code: 'ING06',
      status: 'active',
    }],
    grades: [],
    loading: false,
    error: null,
    ...overrides,
  })
}

describe('StudentGradesPage', () => {
  beforeEach(() => {
    setStore()
  })

  it('muestra los parciales ordenados por numero de intento', () => {
    setStore({
      grades: [
        {
          id: 'partial-2',
          student_id: 'student-1',
          subject_enrollment_id: 'rel-enrollment-ing06',
          subject_id: 'ING06',
          program_id: 'Profesorado de Ingles',
          grade_type: 'partial',
          attempt_number: 2,
          grade_value: 5,
        },
        {
          id: 'partial-1',
          student_id: 'student-1',
          subject_enrollment_id: 'rel-enrollment-ing06',
          subject_id: 'ING06',
          program_id: 'Profesorado de Ingles',
          grade_type: 'partial',
          attempt_number: 1,
          grade_value: 6,
        },
        {
          id: 'final-1',
          student_id: 'student-1',
          subject_enrollment_id: 'rel-enrollment-ing06',
          subject_id: 'ING06',
          program_id: 'Profesorado de Ingles',
          grade_type: 'final',
          attempt_number: 1,
          grade_value: 5.5,
          academic_status: 'regular',
        },
      ],
    })

    render(<StudentGradesPage />)

    const row = screen.getByText('FONETICA Y FONOLOGIA INGLESA I').closest('tr')
    expect(within(row).getByText('6 / 5')).toBeInTheDocument()
    expect(within(row).getByText('5.5')).toBeInTheDocument()
    expect(within(row).getByText('Regular')).toBeInTheDocument()
  })

  it('no muestra materias cuya inscripcion fue dada de baja aunque conserven notas historicas', () => {
    setStore({
      enrollments: [{
        id: 'enrollment-dropped',
        relational_id: 'rel-enrollment-dropped',
        student_id: 'student-1',
        subject_id: 'ING06',
        program_id: 'Profesorado de Ingles',
        subject_name: 'FONETICA Y FONOLOGIA INGLESA I',
        subject_code: 'ING06',
        status: 'dropped',
      }],
      grades: [{
        id: 'final-dropped',
        student_id: 'student-1',
        subject_enrollment_id: 'rel-enrollment-dropped',
        subject_id: 'ING06',
        program_id: 'Profesorado de Ingles',
        grade_type: 'final',
        grade_value: 5.5,
        academic_status: 'failed',
      }],
    })

    render(<StudentGradesPage />)

    expect(screen.queryByText('FONETICA Y FONOLOGIA INGLESA I')).not.toBeInTheDocument()
    expect(screen.getByText('No hay calificaciones cargadas.')).toBeInTheDocument()
  })
})
