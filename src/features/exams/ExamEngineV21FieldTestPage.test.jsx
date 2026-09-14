import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMocks = vi.hoisted(() => ({
  fetchExamTeacherAssignmentsForReview: vi.fn(),
  publishExamTeacherAssignmentsForReview: vi.fn(),
  resetExamProcessForWorkspace: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('../../services/examTeacherAssignments.js', () => serviceMocks)

import ExamEngineV21FieldTestPage from './ExamEngineV21FieldTestPage.jsx'

function scheduleRowsForTeacher(profesor, materia, nombreMateria) {
  return ['viernes', 'lunes', 'martes', 'miercoles'].map((dia, index) => ({
    id: `${profesor}-${materia}-${index}`,
    profesor,
    carrera: 'Profesorado de Geografia',
    materia,
    nombreMateria,
    dia,
    inicio: '18:00',
    fin: '20:40',
  }))
}

function buildWorkspaceSnapshot() {
  return {
    fechaInicio: '2026-07-30',
    fechaFin: '2026-08-12',
    docentes: [],
    docenteMateria: [],
    horariosDocentes: [
      ...scheduleRowsForTeacher('Ana Titular', 'GEO4A', 'Geografia Regional'),
      ...scheduleRowsForTeacher('Bruno Titular', 'GEO4B', 'Cartografia Aplicada'),
    ],
    planesEstudio: [
      {
        id: 'GEO4A',
        carrera: 'Profesorado de Geografia',
        materia: 'GEO4A',
        nombreMateria: 'Geografia Regional',
        anio: 4,
      },
      {
        id: 'GEO4B',
        carrera: 'Profesorado de Geografia',
        materia: 'GEO4B',
        nombreMateria: 'Cartografia Aplicada',
        anio: 4,
      },
    ],
    correlatividades: [],
    cronograma: [],
  }
}

describe('ExamEngineV21FieldTestPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMocks.fetchExamTeacherAssignmentsForReview.mockResolvedValue({ success: true, rows: [] })
    serviceMocks.publishExamTeacherAssignmentsForReview.mockResolvedValue({
      success: true,
      published: 0,
      skippedNoEmail: [],
      skippedNoAccount: [],
    })
    serviceMocks.resetExamProcessForWorkspace.mockResolvedValue({ success: true, summary: {} })
  })

  it('regular: generar precronograma muestra combinar y tribunales juntos en "Armar mesas", con el precronograma colapsado', async () => {
    render(
      <ExamEngineV21FieldTestPage
        dataReady
        uploadedFiles={{ horarios: true, planes: true, correlatividades: true }}
        workspaceSnapshot={buildWorkspaceSnapshot()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Generar precronograma' }))

    // Combinar mesas y completar tribunales ya no son pasos separados: se
    // ven juntos apenas se genera el precronograma, sin boton intermedio.
    await waitFor(() => {
      expect(screen.getByText(/tribunales combinando mesas compatibles/)).toBeInTheDocument()
    })
    expect(screen.getByText('Seleccion de vocales')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios y preparar envio' })).toBeEnabled()

    // El precronograma detallado vive colapsado dentro del mismo paso (el
    // panel de vocales ya muestra los nombres de materia igual); confirmamos
    // que el toggle esta ahi y que la tabla completa responde al exportar.
    expect(screen.getByText('Ver precronograma detallado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportar borrador' })).toBeEnabled()

    // Volver a "Configurar llamado" no reinicia nada del progreso.
    fireEvent.click(screen.getByRole('button', { name: /Configurar llamado/ }))
    expect(screen.getByRole('button', { name: 'Volver al paso actual' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al paso actual' }))
    expect(screen.getByText('Seleccion de vocales')).toBeInTheDocument()
  })

  it('restaura el precronograma generado desde el snapshot despues de refrescar', async () => {
    const onExamEngineStateChange = vi.fn(() => true)
    const firstRender = render(
      <ExamEngineV21FieldTestPage
        dataReady
        onExamEngineStateChange={onExamEngineStateChange}
        uploadedFiles={{ horarios: true, planes: true, correlatividades: true }}
        workspaceSnapshot={buildWorkspaceSnapshot()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Generar precronograma' }))

    await waitFor(() => {
      expect(onExamEngineStateChange).toHaveBeenCalledWith(expect.objectContaining({
        version: 1,
        uiState: 'REVIEWED_IMPORTED',
        draftResult: expect.any(Object),
        reviewedResult: expect.any(Object),
      }))
    })

    const persistedState = onExamEngineStateChange.mock.calls.at(-1)[0]
    firstRender.unmount()

    render(
      <ExamEngineV21FieldTestPage
        dataReady
        uploadedFiles={{ horarios: true, planes: true, correlatividades: true }}
        workspaceSnapshot={{
          ...buildWorkspaceSnapshot(),
          examEngineV21State: persistedState,
        }}
      />,
    )

    expect(screen.getByText('Seleccion de vocales')).toBeInTheDocument()
    expect(screen.getByText('Ver precronograma detallado')).toBeInTheDocument()
  })
  it('especial: arma mesas a mano y llegan a "EnvÃƒÆ’Ã‚Â­o a docentes" sin pasar por el generador automÃƒÆ’Ã‚Â¡tico', () => {
    render(
      <ExamEngineV21FieldTestPage
        dataReady
        uploadedFiles={{ horarios: true, planes: true, correlatividades: true }}
        workspaceSnapshot={buildWorkspaceSnapshot()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Tipo de llamado'), { target: { value: 'ESPECIAL' } })
    expect(screen.queryByLabelText('Carrera a generar')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar a armar mesas' }))

    fireEvent.change(screen.getByLabelText('Materia'), { target: { value: 'Coloquio final ad-hoc' } })
    fireEvent.change(screen.getByLabelText('Titular'), { target: { value: 'Ana Titular' } })
    fireEvent.click(screen.getByRole('button', { name: /Agregar mesa/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continuar a env.o a docentes/ }))

    expect(screen.getByText('Coloquio final ad-hoc')).toBeInTheDocument()
  })

  it('reiniciar proceso limpia el estado local y avisa al contenedor para borrar el cronograma persistido', async () => {
    const onResetExamProcess = vi.fn(() => true)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <ExamEngineV21FieldTestPage
        dataReady
        institutionId="inst-1"
        onResetExamProcess={onResetExamProcess}
        uploadedFiles={{ horarios: true, planes: true, correlatividades: true }}
        workspaceKey="mesa-tests"
        workspaceSnapshot={buildWorkspaceSnapshot()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Generar precronograma' }))

    await waitFor(() => {
      expect(screen.getByText('Seleccion de vocales')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar proceso' }))

    await waitFor(() => {
      expect(serviceMocks.resetExamProcessForWorkspace).toHaveBeenCalledWith({
        institutionId: 'inst-1',
        workspaceKey: 'mesa-tests',
      })
    })
    expect(onResetExamProcess).toHaveBeenCalledWith({ summary: {} })
    expect(screen.getByRole('button', { name: 'Generar precronograma' })).toBeInTheDocument()
    expect(screen.queryByText('Seleccion de vocales')).not.toBeInTheDocument()

    confirmSpy.mockRestore()
  })
})
