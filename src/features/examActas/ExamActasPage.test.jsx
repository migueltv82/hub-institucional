import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const services = vi.hoisted(() => ({
  fetchExamTablesOverview: vi.fn(),
  fetchExamActaRoster: vi.fn(),
  enrollStudentAsAdmin: vi.fn(),
}))
const pdf = vi.hoisted(() => ({ save: vi.fn(), buildExamActasPdf: vi.fn() }))

vi.mock('../../services/examActas.js', async (importOriginal) => ({ ...(await importOriginal()), ...services }))
vi.mock('../../utils/examActaPdf.js', async (importOriginal) => ({ ...(await importOriginal()), buildExamActasPdf: pdf.buildExamActasPdf }))
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const { default: ExamActasPage } = await import('./ExamActasPage.jsx')

const today = new Date().toISOString()
const mesa = (id, materia, inscriptos, extra = {}) => ({
  mesa_id: id, materia, materia_codigo: id.toUpperCase(), carrera: 'PROFESORADO DE PRUEBA UAT', anio: 1, inicio: today,
  llamado: 'Primer llamado', aula: 'A1', tribunal: { titular: 'DOCENTE Uat' }, inscriptos, tipo: 'regular', ...extra,
})

afterEach(() => vi.clearAllMocks())

describe('ExamActasPage', () => {
  it('lista las mesas del dia y no ofrece acta para las que no tienen inscriptos', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 2), mesa('uat02', 'TALLER DE PRUEBA UAT', 0)])
    render(<ExamActasPage canManage institutionId="inst-1" institutionName="Instituto" />)

    expect(await screen.findByText('MATERIA DE PRUEBA UAT')).toBeInTheDocument()
    expect(screen.getByText('PROFESORADO DE PRUEBA UAT')).toBeInTheDocument()
    expect(screen.getByText('1º año')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sin acta/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^imprimir acta$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /imprimir actas \(1\)/i })).toBeEnabled()
  })

  it('imprime solo las actas de mesas con inscriptos', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 1), mesa('uat02', 'TALLER DE PRUEBA UAT', 0)])
    services.fetchExamActaRoster.mockResolvedValue([{ apellido: 'Regular', nombres: 'Ana', dni: '11111111' }])
    pdf.buildExamActasPdf.mockResolvedValue({ save: pdf.save })
    render(<ExamActasPage canManage institutionId="inst-1" institutionName="Instituto" />)

    fireEvent.click(await screen.findByRole('button', { name: /imprimir actas \(1\)/i }))

    await waitFor(() => expect(pdf.save).toHaveBeenCalled())
    expect(services.fetchExamActaRoster).toHaveBeenCalledTimes(1)
    expect(services.fetchExamActaRoster).toHaveBeenCalledWith({ institutionId: 'inst-1', workspaceKey: 'main', examKey: 'uat01' })
    expect(pdf.buildExamActasPdf.mock.calls[0][0].actas.map((acta) => acta.mesa.mesa_id)).toEqual(['uat01'])
  })

  it('sin permiso de gestion no muestra la inscripcion especial', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 1)])
    render(<ExamActasPage institutionId="inst-1" />)

    expect(await screen.findByText('MATERIA DE PRUEBA UAT')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /inscripcion especial/i })).not.toBeInTheDocument()
  })

  it('inscripcion especial: elige un alumno de la carrera, pide motivo y recarga', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 0)])
    services.enrollStudentAsAdmin.mockResolvedValue({ estado: 'registered' })
    const students = [
      { record_id: 's1', apellido: 'Regular', nombre: 'Ana', dni: '11111111', carrera: 'PROFESORADO DE PRUEBA UAT' },
      { record_id: 's2', apellido: 'Otra', nombre: 'Carrera', dni: '22222222', carrera: 'PROFESORADO DE INGLES' },
    ]
    render(<ExamActasPage canManage institutionId="inst-1" students={students} />)

    fireEvent.click(await screen.findByRole('button', { name: /inscripcion especial/i }))
    const select = screen.getByLabelText('Alumno')
    expect([...select.options].map((option) => option.value)).toEqual(['', 's1'])
    fireEvent.change(select, { target: { value: 's1' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Certificado medico' } })
    fireEvent.click(screen.getByRole('button', { name: /^inscribir$/i }))

    await waitFor(() => expect(services.enrollStudentAsAdmin).toHaveBeenCalledWith({
      institutionId: 'inst-1', workspaceKey: 'main', examKey: 'uat01', studentRecordId: 's1', reason: 'Certificado medico',
    }))
    await waitFor(() => expect(services.fetchExamTablesOverview).toHaveBeenCalledTimes(2))
  })
})
