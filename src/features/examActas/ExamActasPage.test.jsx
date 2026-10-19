import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const services = vi.hoisted(() => ({
  fetchExamTablesOverview: vi.fn(),
  fetchExamActaDetail: vi.fn(),
  fetchExamActaRoster: vi.fn(),
  enrollStudentAsAdmin: vi.fn(),
}))
const pdf = vi.hoisted(() => ({ doc: null, buildExamActasPdf: vi.fn() }))
const logoService = vi.hoisted(() => ({ prepareLogoDataUrl: vi.fn(), saveInstitutionLogo: vi.fn() }))

vi.mock('../../services/examActas.js', async (importOriginal) => ({ ...(await importOriginal()), ...services }))
vi.mock('../../utils/examActaPdf.js', async (importOriginal) => ({ ...(await importOriginal()), buildExamActasPdf: pdf.buildExamActasPdf }))
vi.mock('../../services/institutionLogo.js', () => logoService)
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }))

const { default: ExamActasPage } = await import('./ExamActasPage.jsx')
const { getArgentinaDateKey, shiftDateKey } = await import('../../services/examActas.js')

const today = getArgentinaDateKey(new Date().toISOString())
const tomorrow = shiftDateKey(today, 1)
// 11:00 UTC = 08:00 en Argentina: siempre cae en el mismo dia calendario.
const at = (dateKey) => `${dateKey}T11:00:00Z`
const mesa = (id, materia, inscriptos, extra = {}) => ({
  mesa_id: id, materia, materia_codigo: id.toUpperCase(), carrera: 'PROFESORADO DE PRUEBA UAT', anio: 1, inicio: at(today),
  llamado: 'Primer llamado', aula: 'A1', tribunal: { titular: 'DOCENTE Uat' }, inscriptos, tipo: 'regular', ...extra,
})

beforeEach(() => {
  pdf.doc = { save: vi.fn(), autoPrint: vi.fn(), output: vi.fn(() => 'blob:acta') }
  pdf.buildExamActasPdf.mockImplementation(async () => pdf.doc)
  vi.spyOn(window, 'open').mockReturnValue({})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('ExamActasPage', () => {
  it('muestra las mesas de hoy por carrera y anio, con el resumen del dia', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([
      mesa('uat01', 'MATERIA DE PRUEBA UAT', 2),
      mesa('uat02', 'TALLER DE PRUEBA UAT', 0),
      mesa('uat03', 'SEMINARIO DE MAÑANA', 1, { inicio: at(tomorrow) }),
    ])
    render(<ExamActasPage canManage institutionId="inst-1" institutionName="Instituto" />)

    expect(await screen.findByText('MATERIA DE PRUEBA UAT')).toBeInTheDocument()
    expect(screen.queryByText('SEMINARIO DE MAÑANA')).not.toBeInTheDocument()
    expect(screen.getByText('1º año')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sin acta/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^imprimir acta$/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /imprimir actas \(1\)/i })).toBeEnabled()
    const stat = (label) => screen.getByText(label).nextSibling.textContent
    expect([stat('Mesas'), stat('Actas a imprimir'), stat('Sin inscriptos'), stat('Alumnos')]).toEqual(['2', '1', '1', '2'])
  })

  it('cambia de dia con las fechas que tienen mesas y con las flechas', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([
      mesa('uat01', 'MATERIA DE PRUEBA UAT', 2),
      mesa('uat03', 'SEMINARIO DE MAÑANA', 1, { inicio: at(tomorrow) }),
    ])
    render(<ExamActasPage institutionId="inst-1" />)
    await screen.findByText('MATERIA DE PRUEBA UAT')

    const chips = screen.getByText('Fechas con mesas').nextSibling
    expect(within(chips).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(chips).getAllByRole('button')[1])
    expect(screen.getByText('SEMINARIO DE MAÑANA')).toBeInTheDocument()
    expect(screen.queryByText('MATERIA DE PRUEBA UAT')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dia anterior' }))
    expect(screen.getByText('MATERIA DE PRUEBA UAT')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dia siguiente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hoy' }))
    expect(screen.getByText('MATERIA DE PRUEBA UAT')).toBeInTheDocument()
  })

  it('filtra por carrera y por busqueda', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([
      mesa('uat01', 'MATERIA DE PRUEBA UAT', 2),
      mesa('ing01', 'FONETICA INGLESA', 1, { carrera: 'PROFESORADO DE INGLES', tribunal: { titular: 'Corbalan Miguel' } }),
    ])
    render(<ExamActasPage institutionId="inst-1" />)
    await screen.findByText('MATERIA DE PRUEBA UAT')

    fireEvent.change(screen.getByLabelText('Carrera'), { target: { value: 'PROFESORADO DE INGLES' } })
    expect(screen.queryByText('MATERIA DE PRUEBA UAT')).not.toBeInTheDocument()
    expect(screen.getByText('FONETICA INGLESA')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Carrera'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'corbalan' } })
    expect(screen.queryByText('MATERIA DE PRUEBA UAT')).not.toBeInTheDocument()
    expect(screen.getByText('FONETICA INGLESA')).toBeInTheDocument()
  })

  it('imprime solo las actas de mesas con inscriptos y abre el dialogo de impresion', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 1), mesa('uat02', 'TALLER DE PRUEBA UAT', 0)])
    services.fetchExamActaRoster.mockResolvedValue([{ apellido: 'Regular', nombres: 'Ana', dni: '11111111' }])
    render(<ExamActasPage canManage institutionId="inst-1" institutionName="Instituto" />)

    fireEvent.click(await screen.findByRole('button', { name: /imprimir actas \(1\)/i }))

    await waitFor(() => expect(window.open).toHaveBeenCalledWith('blob:acta', '_blank'))
    expect(pdf.doc.autoPrint).toHaveBeenCalled()
    expect(services.fetchExamActaRoster).toHaveBeenCalledTimes(1)
    expect(services.fetchExamActaRoster).toHaveBeenCalledWith({ institutionId: 'inst-1', workspaceKey: 'main', examKey: 'uat01' })
    expect(pdf.buildExamActasPdf.mock.calls[0][0].actas.map((acta) => acta.mesa.mesa_id)).toEqual(['uat01'])
  })

  it('si el navegador bloquea la ventana, descarga el PDF', async () => {
    window.open.mockReturnValue(null)
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 1)])
    services.fetchExamActaRoster.mockResolvedValue([{ apellido: 'Regular', nombres: 'Ana', dni: '11111111' }])
    render(<ExamActasPage institutionId="inst-1" />)

    fireEvent.click(await screen.findByRole('button', { name: /^imprimir acta$/i }))
    await waitFor(() => expect(pdf.doc.save).toHaveBeenCalled())
  })

  it('muestra los inscriptos de una mesa', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 1)])
    services.fetchExamActaDetail.mockResolvedValue({ alumnos: [{ apellido: 'Regular', nombres: 'Ana', dni: '11111111', inscripcion_especial: true }], actaCerrada: false, puedeCargarNotas: false })
    render(<ExamActasPage institutionId="inst-1" />)

    fireEvent.click(await screen.findByRole('button', { name: /ver inscriptos/i }))
    expect(await screen.findByText('Regular')).toBeInTheDocument()
    expect(screen.getByText('Especial (admin)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cargar notas' })).not.toBeInTheDocument()
  })

  it('F1a: desde el dia del examen secretaria carga notas y ve el resultado de cada alumno', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 1)])
    services.fetchExamActaDetail.mockResolvedValue({
      alumnos: [{ inscripcion_id: 'e1', apellido: 'Regular', nombres: 'Ana', nombre: 'Ana Regular', dni: '11111111', resultado: 'approved', nota: 8 }],
      actaCerrada: true,
      puedeCargarNotas: false,
    })
    render(<ExamActasPage institutionId="inst-1" />)

    fireEvent.click(await screen.findByRole('button', { name: /ver inscriptos/i }))
    expect(await screen.findByText('Aprobado (8)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Corregir acta (cerrada)' }))
    expect(screen.getByLabelText('Motivo de la correccion')).toBeInTheDocument()
    expect(screen.getByLabelText('Nota final de Ana Regular')).not.toBeDisabled()
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

  it('explica si la base todavia no tiene la seccion', async () => {
    services.fetchExamTablesOverview.mockRejectedValue(new Error('Falta actualizar la base de datos para usar Mesas y actas. Avisale al responsable tecnico.'))
    render(<ExamActasPage institutionId="inst-1" />)
    expect(await screen.findByText(/Falta actualizar la base de datos/)).toBeInTheDocument()
  })

  it('el admin carga el logo y las actas lo usan', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 1)])
    services.fetchExamActaRoster.mockResolvedValue([{ apellido: 'Regular', nombres: 'Ana', dni: '11111111' }])
    logoService.prepareLogoDataUrl.mockResolvedValue('data:image/png;base64,AAA=')
    logoService.saveInstitutionLogo.mockResolvedValue('data:image/png;base64,AAA=')
    const onLogoChange = vi.fn()
    const { rerender } = render(<ExamActasPage canChangeLogo institutionId="inst-1" onLogoChange={onLogoChange} />)

    expect(await screen.findByText('Sin logo')).toBeInTheDocument()
    const file = new File(['x'], 'logo.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Archivo del logo'), { target: { files: [file] } })
    await waitFor(() => expect(onLogoChange).toHaveBeenCalledWith('data:image/png;base64,AAA='))
    expect(logoService.saveInstitutionLogo).toHaveBeenCalledWith({ institutionId: 'inst-1', logoDataUrl: 'data:image/png;base64,AAA=' })

    rerender(<ExamActasPage canChangeLogo institutionId="inst-1" institutionLogoUrl="data:image/png;base64,AAA=" onLogoChange={onLogoChange} />)
    expect(screen.getByAltText('Logo del colegio')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^imprimir acta$/i }))
    await waitFor(() => expect(pdf.buildExamActasPdf).toHaveBeenCalled())
    expect(pdf.buildExamActasPdf.mock.calls[0][0].institutionLogo).toBe('data:image/png;base64,AAA=')
  })

  it('sin permiso para cambiar el logo y sin logo cargado, no muestra la tarjeta', async () => {
    services.fetchExamTablesOverview.mockResolvedValue([mesa('uat01', 'MATERIA DE PRUEBA UAT', 1)])
    render(<ExamActasPage canManage institutionId="inst-1" />)
    await screen.findByText('MATERIA DE PRUEBA UAT')
    expect(screen.queryByText('Logo del colegio')).not.toBeInTheDocument()
  })
})
