import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { DashboardView, ExamsView } from './TeacherPortalModule.jsx'
import { confirmTeacherExamAssignment } from './services/teacherExamAssignments.js'

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

function assignment(overrides = {}) {
  return {
    id: 'a1',
    exam_table_id: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    role: 'VOCAL_1',
    confirmation_status: 'pending',
    teacher_notes: '',
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

  it('muestra la mesa publicada con su rol y permite confirmar', async () => {
    confirmTeacherExamAssignment.mockResolvedValue({ success: true, data: {} })
    const onRefetchExamAssignments = vi.fn()

    render(
      <ExamsView
        data={{}}
        examAssignments={[assignment()]}
        institutionId="inst-1"
        onRefetchExamAssignments={onRefetchExamAssignments}
      />,
    )

    expect(screen.getByText('Didactica General')).toBeInTheDocument()
    // Regresion: new Date('2026-08-10') sin timeZone: 'UTC' en formatDate
    // mostraba "09 de ago" en husos horarios negativos (America/Argentina).
    expect(screen.getByText(/10 de ago de 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Tu rol: Vocal 1/)).toBeInTheDocument()
    expect(screen.getByText('Pendiente de tu confirmacion')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Confirmar/ }))

    await vi.waitFor(() => {
      expect(confirmTeacherExamAssignment).toHaveBeenCalledWith({
        institutionId: 'inst-1',
        examTableId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
        confirmationStatus: 'confirmed',
        teacherNotes: '',
      })
    })
    expect(toast.success).toHaveBeenCalledWith('Mesa confirmada.')
    expect(onRefetchExamAssignments).toHaveBeenCalledTimes(1)
  })

  it('objeta una mesa con observacion y muestra el error si falla', async () => {
    confirmTeacherExamAssignment.mockResolvedValue({ success: false, error: 'No se pudo registrar la confirmacion.' })

    render(<ExamsView data={{}} examAssignments={[assignment()]} institutionId="inst-1" />)

    fireEvent.change(screen.getByPlaceholderText(/Ej: no puedo esa fecha/), {
      target: { value: 'No puedo ese dia' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Objetar/ }))

    await vi.waitFor(() => {
      expect(confirmTeacherExamAssignment).toHaveBeenCalledWith(expect.objectContaining({
        confirmationStatus: 'objected',
        teacherNotes: 'No puedo ese dia',
      }))
    })
    expect(toast.error).toHaveBeenCalledWith('No se pudo registrar la confirmacion.')
  })

  it('ofrece fechas disponibles y envia la reubicacion elegida al objetar', async () => {
    confirmTeacherExamAssignment.mockResolvedValue({ success: true, data: {} })

    render(
      <ExamsView
        data={{
          currentTeacher: {
            full_name: 'Bruno Vocal',
            raw: { id: 'doc-vocal-a', full_name: 'Bruno Vocal' },
          },
          workspaceSnapshot: {
            disponibilidadDocente: [{ docenteId: 'doc-vocal-a', fecha: '2026-08-12' }],
            cronograma: [{
              id: 'mesa-alternativa', carrera: 'Profesorado de Historia',
              materiaMesa: 'Historia Argentina', fecha: '2026-08-12',
              inicio: '18:00', fin: '20:00', titularId: 'doc-titular',
              vocal1Id: 'doc-vocal-c', vocal2Id: '',
            }],
          },
        }}
        examAssignments={[assignment()]}
        institutionId="inst-1"
      />,
    )

    const dateSelect = screen.getByLabelText('Fecha alternativa para Didactica General')
    expect(dateSelect).toHaveTextContent('12 de ago de 2026')
    fireEvent.change(dateSelect, { target: { value: 'mesa-alternativa:VOCAL_2' } })
    fireEvent.change(screen.getByPlaceholderText(/Ej: no puedo esa fecha/), {
      target: { value: 'Solicito cambio de fecha' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Objetar/ }))

    await vi.waitFor(() => {
      expect(confirmTeacherExamAssignment).toHaveBeenCalledWith(expect.objectContaining({
        confirmationStatus: 'objected',
        reassignmentOption: expect.objectContaining({
          targetExamTableId: 'mesa-alternativa', targetRole: 'VOCAL_2', fecha: '2026-08-12',
        }),
      }))
    })
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
