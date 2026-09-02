import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import SubjectsView from './SubjectsView.jsx'

describe('SubjectsView', () => {
  it('muestra la relacion de licencia y reemplazo en ambos portales docentes', () => {
    render(
      <MemoryRouter>
        <SubjectsView subjects={[
          {
            id: 'leave-assignment', subjectId: 'ING1', programId: 'Ingles', nombre: 'Ingles I',
            role: 'licencia', leave: { replacement_teacher_name: 'Bruno Perez', leave_ends_on: '2026-09-30' },
          },
          {
            id: 'replacement-assignment', subjectId: 'ING2', programId: 'Ingles', nombre: 'Ingles II',
            role: 'suplente', assignmentSource: 'teacher_leave_replacement',
            leave: { teacher_on_leave_name: 'Ana Diaz', leave_ends_on: '2026-10-15' },
          },
        ]} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/Te reemplaza Bruno Perez hasta 2026-09-30/)).toBeInTheDocument()
    expect(screen.getByText(/Reemplazas a Ana Diaz hasta 2026-10-15/)).toBeInTheDocument()
  })

  it('navega al detalle de materia con la ruta absoluta del portal docente', () => {
    render(
      <MemoryRouter initialEntries={['/app/materias']}>
        <SubjectsView
          subjects={[
            {
              id: 'assignment-1',
              subjectId: 'ING 13',
              programId: 'Profesorado de Ingles',
              nombre: 'Practica gramatical',
              carrera: 'Profesorado de Ingles',
              anio: '2',
            },
          ]}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: /Practica gramatical/i })).toHaveAttribute(
      'href',
      '/app/materias/ING%2013__Profesorado%20de%20Ingles',
    )
  })
})
