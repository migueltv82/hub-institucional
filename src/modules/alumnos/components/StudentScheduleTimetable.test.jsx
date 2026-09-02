import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudentScheduleTimetable from './StudentScheduleTimetable.jsx'

const mocks = vi.hoisted(() => ({
  exportarHorariosCursadaXlsx: vi.fn().mockResolvedValue({ rows: 1 }),
  imprimirHorarioCursada: vi.fn(),
}))

vi.mock('../../../utils/examEngine/scheduleExports.js', () => ({
  exportarHorariosCursadaXlsx: mocks.exportarHorariosCursadaXlsx,
  imprimirHorarioCursada: mocks.imprimirHorarioCursada,
}))

function sampleSchedules() {
  return [{
    id: 'sched-1',
    day: 'Lunes',
    start: '18:20',
    end: '19:00',
    subject_name: 'Ingles I',
    subject_code: 'ING1',
    teacher: 'Perez Ana',
    classroom: '3',
    career: 'Profesorado de Ingles',
    subject_year: '1',
  }]
}

describe('StudentScheduleTimetable', () => {
  it('muestra un mensaje vacio cuando no hay horarios', () => {
    render(<StudentScheduleTimetable schedules={[]} />)

    expect(screen.getByText('No hay horarios cargados para tus materias actuales.')).toBeInTheDocument()
  })

  it('arma la grilla (misma que el panel admin) con materia y docente', () => {
    render(
      <StudentScheduleTimetable
        schedules={sampleSchedules()}
        institutionName="Instituto San Miguel"
        studentName="Yamil Abdelhamid Campos"
      />,
    )

    expect(screen.getByText('Profesorado de Ingles')).toBeInTheDocument()
    expect(screen.getByText('Ingles I')).toBeInTheDocument()
    expect(screen.getByText('Prof. Perez Ana')).toBeInTheDocument()
    expect(screen.getByText('Aula 3')).toBeInTheDocument()
  })

  it('descarga el horario del grupo al hacer click en Descargar', async () => {
    render(<StudentScheduleTimetable schedules={sampleSchedules()} studentName="Yamil" />)

    fireEvent.click(screen.getByRole('button', { name: /descargar/i }))

    expect(mocks.exportarHorariosCursadaXlsx).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ filename: expect.stringContaining('yamil') }),
    )
  })

  it('imprime el horario del grupo al hacer click en Imprimir', () => {
    render(<StudentScheduleTimetable schedules={sampleSchedules()} institutionName="Instituto San Miguel" studentName="Yamil" />)

    fireEvent.click(screen.getByRole('button', { name: /imprimir/i }))

    expect(mocks.imprimirHorarioCursada).toHaveBeenCalledWith(
      expect.objectContaining({ carrera: 'Profesorado de Ingles' }),
      expect.objectContaining({ title: expect.stringContaining('Instituto San Miguel') }),
    )
  })
})
