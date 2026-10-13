import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardView, ExamsView } from './TeacherPortalModule.jsx'
import { confirmTeacherExamAssignment } from './services/teacherExamAssignments.js'
import { getTeacherVisibleEmail, isTeacherTechnicalEmail } from './services/teacherContactDisplay.js'

// Huso horario negativo a proposito: reproduce el bug real de formatDate()
// mostrando el dia calendario anterior cuando new Date('2026-08-10') se
// formatea sin timeZone: 'UTC'.
process.env.TZ = 'America/Argentina/Buenos_Aires'

vi.mock('./services/teacherExamAssignments.js', () => ({
  confirmTeacherExamAssignment: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('TeacherPortalModule - datos visibles del docente', () => {
  it('oculta emails tecnicos internos del portal docente', () => {
    expect(isTeacherTechnicalEmail('29541016@docentes.3f9dd1a0-19b8-462f-bdd8-7e849d90ae04.local')).toBe(true)
    expect(getTeacherVisibleEmail('29541016@docentes.3f9dd1a0-19b8-462f-bdd8-7e849d90ae04.local')).toBe('')
  })

  it('mantiene emails reales cargados por el docente', () => {
    expect(isTeacherTechnicalEmail('miguel.corbalan@example.edu')).toBe(false)
    expect(getTeacherVisibleEmail('miguel.corbalan@example.edu')).toBe('miguel.corbalan@example.edu')
  })
})

function assignment(overrides = {}) {
  return {
    id: 'a1',
    exam_table_id: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    role: 'VOCAL_1',
    confirmation_status: 'pending',
    metadata: {
      fecha: '2026-08-10',
      materia: 'Didactica General',
      carrera: 'Profesorado de Historia',
      titular: 'Ana Titular',
      vocal1: 'Bruno Vocal',
      vocal2: '',
    },
    ...overrides,
  }
}

describe('DashboardView - grilla horaria', () => {
  it('muestra una grilla por materia a partir de los horarios del docente', () => {
    render(
      <DashboardView
        data={{
          schedules: [
            {
              subjectId: 'ING06',
              programId: 'PROFESORADO DE INGLES',
              carrera: 'PROFESORADO DE INGLES',
              nombreMateria: 'FONETICA Y FONOLOGIA INGLESA I',
              anio: '1',
              dia: 'Martes',
              inicio: '18:20',
              fin: '19:40',
            },
          ],
        }}
      />,
    )

    expect(screen.getByText('FONETICA Y FONOLOGIA INGLESA I')).toBeInTheDocument()
    expect(screen.getByText('PROFESORADO DE INGLES')).toBeInTheDocument()
    expect(screen.getByText('1° Año')).toBeInTheDocument()
  })

  it('sin horarios cargados muestra el estado vacio', () => {
    render(<DashboardView data={{ schedules: [] }} />)

    expect(screen.getByText('No hay horarios cargados para este docente.')).toBeInTheDocument()
  })
})

describe('ExamsView - precronograma en revision', () => {
  it('sin mesas publicadas muestra el estado vacio', () => {
    render(<ExamsView data={{}} examAssignments={[]} institutionId="inst-1" />)

    expect(screen.getByText('No hay mesas publicadas para tu revision por el momento.')).toBeInTheDocument()
  })

  it('muestra la mesa publicada con su rol y estado sin controles de decision', () => {
    render(<ExamsView data={{}} examAssignments={[assignment()]} />)

    expect(screen.getByText('Didactica General')).toBeInTheDocument()
    // Conserva el dia calendario en husos horarios negativos.
    expect(screen.getByText(/10 de ago de 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Tu rol: Vocal 1/)).toBeInTheDocument()
    expect(screen.getByText('Pendiente de tu confirmacion')).toBeInTheDocument()
    expect(screen.getByText('La gestion de decisiones sobre mesas no esta habilitada en esta version.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(confirmTeacherExamAssignment).not.toHaveBeenCalled()
  })

  it('muestra el motivo canonico de una objecion como informacion de solo lectura', () => {
    render(<ExamsView data={{}} examAssignments={[assignment({ confirmation_status: 'objected', objection_reason: 'Conflicto horario' })]} />)

    expect(screen.getByText('Objetada')).toBeInTheDocument()
    expect(screen.getByText('Motivo de objecion:')).toBeInTheDocument()
    expect(screen.getByText(/Conflicto horario/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(confirmTeacherExamAssignment).not.toHaveBeenCalled()
  })

  it('no habilita reubicacion aunque existan alternativas publicadas', () => {
    const current = assignment()
    current.metadata.reassignment_options = [{ targetExamTableId: 'mesa-alternativa', targetRole: 'VOCAL_2', fecha: '2026-08-12' }]
    render(<ExamsView data={{ workspaceSnapshot: { cronograma: [{ id: 'mesa-alternativa', fecha: '2026-08-12' }] } }} examAssignments={[current]} />)

    expect(screen.getByText('Didactica General')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(confirmTeacherExamAssignment).not.toHaveBeenCalled()
  })

  it('sigue mostrando la lista de mesas asignadas de solo lectura', () => {
    render(
      <ExamsView
        data={{ exams: [{ id: 'e1', carrera: 'Profesorado de Ingles', materia: 'Ingles I', profesorTitular: 'Ana' }] }}
        examAssignments={[]}
        institutionId="inst-1"
      />,
    )

    expect(screen.getByText('Ingles I')).toBeInTheDocument()
  })

  it('normaliza mesas publicadas por el motor nuevo en la lista docente', () => {
    render(
      <ExamsView
        data={{
          exams: [{
            id: 'mesa-ing06',
            carrera: 'PROFESORADO DE INGLES',
            materiaId: 'ING06',
            materiaMesa: 'FONETICA Y FONOLOGIA INGLESA I',
            fechaSugerida: '2026-08-26',
            inicio: '19:40',
            titular: 'CORBALAN MIGUEL',
            vocal1: 'VILLAGRA MIGUEL',
            vocal2: 'DONADIO MYRIAM',
            estado: 'TRIBUNAL_COMPLETE',
          }],
        }}
        examAssignments={[]}
        institutionId="inst-1"
      />,
    )

    expect(screen.getByText('FONETICA Y FONOLOGIA INGLESA I')).toBeInTheDocument()
    expect(screen.getByText(/26 de ago de 2026/)).toBeInTheDocument()
    expect(screen.getByText('confirmada')).toBeInTheDocument()
    expect(screen.getByText(/CORBALAN MIGUEL/)).toBeInTheDocument()
  })
})
