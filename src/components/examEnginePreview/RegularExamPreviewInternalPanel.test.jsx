import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegularExamPreviewInternalPanel from './RegularExamPreviewInternalPanel.jsx'
import { useRegularExamPreviewEngine } from '../../hooks/useRegularExamPreviewEngine'
import { buildRegularExamPreviewIntegrationContract } from '../../utils/examEngine/preview'
import {
  createExamEnginePreviewWorkerRun,
  isExamEnginePreviewWorkerSupported,
} from '../../workers/examEnginePreviewWorkerClient.js'

vi.mock('../../hooks/useRegularExamPreviewEngine', () => ({
  useRegularExamPreviewEngine: vi.fn(),
}))

vi.mock('../../utils/examEngine/preview', () => ({
  buildRegularExamPreviewIntegrationContract: vi.fn(),
}))

vi.mock('../../workers/examEnginePreviewWorkerClient.js', () => ({
  createExamEnginePreviewWorkerRun: vi.fn(),
  isExamEnginePreviewWorkerSupported: vi.fn(),
}))

function actions(overrides = {}) {
  return {
    generatePreview: vi.fn(),
    loadPreviewResult: vi.fn(),
    applyFilters: vi.fn(),
    clearFilters: vi.fn(),
    changeCompactMode: vi.fn(),
    exportJson: vi.fn(),
    resetPreview: vi.fn(),
    saveOfficialSchedule: vi.fn(),
    publishSchedule: vi.fn(),
    replaceLegacyEngine: vi.fn(),
    ...overrides,
  }
}

function hookState(overrides = {}) {
  const { actions: actionOverrides, ...stateOverrides } = overrides

  return {
    phase: 'idle',
    status: 'IDLE',
    uiDto: null,
    filteredDto: null,
    warnings: [],
    errors: [],
    actions: actions(actionOverrides),
    ...stateOverrides,
  }
}

function contract(overrides = {}) {
  return {
    phase: 'warning',
    status: 'WARNING',
    uiDto: {
      uiSummary: {
        totalMesas: 2,
        totalPlanned: 1,
        totalUnassigned: 1,
      },
    },
    metadata: {
      timings: {
        enginePreviewMs: 10,
        buildDtoMs: 2,
        validateDtoMs: 1,
        totalContractMs: 13,
        workerTotalMs: 14,
      },
    },
    warnings: [],
    errors: [],
    ...overrides,
  }
}

function props(overrides = {}) {
  return {
    alumnos: [],
    docentes: [{ id: 'doc-1', nombre: 'Docente Uno' }],
    horariosDocentes: [{
      profesor: 'Docente Uno',
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      nombreMateria: 'Ingles I',
      dia: 'lunes',
      inicio: '18:00',
      fin: '20:00',
    }],
    planesEstudio: [{
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      nombreMateria: 'Ingles I',
      anio: 1,
    }],
    correlatividades: [],
    fechaInicio: '2026-07-27',
    fechaFin: '2026-07-31',
    examType: 'REGULAR',
    generationScope: { respectCorrelativities: true },
    regularCallRanges: {
      first: { start: '2026-07-27', end: '2026-07-31' },
      second: { start: '2026-08-03', end: '2026-08-07' },
    },
    selectedSpecialSubjectKeys: [],
    env: { DEV: true },
    ...overrides,
  }
}

function many(count, factory) {
  return Array.from({ length: count }, (_, index) => factory(index))
}

function mockHook(state = hookState()) {
  useRegularExamPreviewEngine.mockReturnValue(state)
  return state
}

function mockWorkerSuccess(result = contract(), overrides = {}) {
  const cancel = vi.fn()
  createExamEnginePreviewWorkerRun.mockReturnValue({
    requestId: 'worker-1',
    promise: Promise.resolve(result),
    cancel,
    ...overrides,
  })
  return { cancel }
}

describe('RegularExamPreviewInternalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildRegularExamPreviewIntegrationContract.mockReturnValue(contract())
    isExamEnginePreviewWorkerSupported.mockReturnValue(true)
    mockWorkerSuccess()
    mockHook()
  })

  it('no aparece si DEV y flag estan apagados', () => {
    render(<RegularExamPreviewInternalPanel {...props({ env: { DEV: false, VITE_ENABLE_EXAM_ENGINE_PREVIEW: 'false' } })} />)

    expect(screen.queryByRole('region', { name: 'Preview interno del nuevo motor' })).not.toBeInTheDocument()
  })

  it('aparece si DEV esta activo', () => {
    render(<RegularExamPreviewInternalPanel {...props({ env: { DEV: true } })} />)

    expect(screen.getByRole('region', { name: 'Preview interno del nuevo motor' })).toBeInTheDocument()
  })

  it('no aparece en produccion aunque el flag interno este activo', () => {
    render(<RegularExamPreviewInternalPanel {...props({ env: { DEV: false, VITE_ENABLE_EXAM_ENGINE_PREVIEW: 'true' } })} />)

    expect(screen.queryByRole('region', { name: 'Preview interno del nuevo motor' })).not.toBeInTheDocument()
  })

  it('no ejecuta preview automaticamente', () => {
    const state = mockHook()

    render(<RegularExamPreviewInternalPanel {...props()} />)

    expect(state.actions.generatePreview).not.toHaveBeenCalled()
    expect(createExamEnginePreviewWorkerRun).not.toHaveBeenCalled()
  })

  it('crea worker y carga resultado solo al hacer click', async () => {
    const state = mockHook(hookState({
      actions: {
        loadPreviewResult: vi.fn(),
      },
    }))

    render(<RegularExamPreviewInternalPanel {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' }))

    await waitFor(() => expect(createExamEnginePreviewWorkerRun).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(state.actions.loadPreviewResult).toHaveBeenCalledTimes(1))
    expect(state.actions.generatePreview).not.toHaveBeenCalled()
  })

  it('envia docenteMateria al worker del preview interno', async () => {
    render(<RegularExamPreviewInternalPanel {...props({
      docenteMateria: [{
        carrera: 'Profesorado de Ingles',
        materia_codigo: 'ING1',
        materia_nombre: 'Ingles I',
        docente: 'Docente Uno',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
      }],
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' }))

    await waitFor(() => expect(createExamEnginePreviewWorkerRun).toHaveBeenCalledTimes(1))

    const workerInput = createExamEnginePreviewWorkerRun.mock.calls[0][0]
    expect(workerInput.metadata.adapterDiagnostics.sourceCounts.docenteMateria).toBe(1)
    expect(workerInput.materias[0]).toMatchObject({
      titularSource: 'docente_materia',
      titularResolutionStatus: 'TITULAR_ACTIVO',
    })
  })

  it('muestra estado loading al ejecutar', () => {
    render(<RegularExamPreviewInternalPanel {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' }))

    expect(screen.getByText('Preparando preview...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview interno en ejecucion...' })).toBeDisabled()
  })

  it('no permite doble click mientras corre', async () => {
    const state = mockHook(hookState({
      actions: {
        loadPreviewResult: vi.fn(),
      },
    }))

    render(<RegularExamPreviewInternalPanel {...props()} />)
    const button = screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' })

    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'Preview interno en ejecucion...' }))

    await waitFor(() => expect(createExamEnginePreviewWorkerRun).toHaveBeenCalledTimes(1))
    expect(state.actions.generatePreview).not.toHaveBeenCalled()
  })

  it('cancelar termina el worker en curso', async () => {
    const worker = mockWorkerSuccess(contract(), {
      promise: new Promise(() => {}),
    })

    render(<RegularExamPreviewInternalPanel {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' }))
    await waitFor(() => expect(createExamEnginePreviewWorkerRun).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar / limpiar preview' }))

    expect(worker.cancel).toHaveBeenCalledTimes(1)
  })

  it('muestra resultado final del worker', async () => {
    render(<RegularExamPreviewInternalPanel {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' }))

    await waitFor(() => expect(screen.getByText('Preview finalizado')).toBeInTheDocument())
    expect(screen.getByText('Calendario actual')).toBeInTheDocument()
    expect(screen.getByText('workerTotalMs')).toBeInTheDocument()
  })

  it('considera pendientes las materias requeridas que no tienen titular', async () => {
    mockWorkerSuccess(contract({
      uiDto: {
        uiSummary: {
          totalMesas: 2,
          totalPlanned: 1,
          totalUnassigned: 1,
          cantidadLlamados: 2,
        },
      },
    }))

    render(<RegularExamPreviewInternalPanel {...props({
      planesEstudio: [
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          nombreMateria: 'Ingles I',
          anio: 1,
        },
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING2',
          nombreMateria: 'Ingles II',
          anio: 1,
        },
      ],
      horariosDocentes: [{
        profesor: 'Docente Uno',
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
        dia: 'lunes',
        inicio: '18:00',
        fin: '20:00',
      }],
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' }))

    await waitFor(() => expect(screen.getByRole('region', { name: 'Titularidad del preview interno' })).toBeInTheDocument())

    const titularidad = screen.getByRole('region', { name: 'Titularidad del preview interno' })
    expect(within(titularidad).getByText('0 materias del plan no tienen horario asociado y no fueron requeridas para mesa.')).toBeInTheDocument()
    expect(within(titularidad).getByText('mesas sin titular real')).toBeInTheDocument()
    expect(within(titularidad).getAllByText('0').length).toBeGreaterThan(0)
    expect(screen.getByText('Titulares faltantes reales')).toBeInTheDocument()
  })

  it('muestra bloque titularidad con practicas profesionales y multiples docentes', async () => {
    render(<RegularExamPreviewInternalPanel {...props({
      planesEstudio: [{
        carrera: 'Profesorado de Ingles',
        materia: 'PRA1',
        nombreMateria: 'Practica Profesional Docente I',
      }],
      horariosDocentes: [
        {
          profesor: 'Docente Uno',
          carrera: 'Profesorado de Ingles',
          materia: 'PRA1',
          nombreMateria: 'Practica Profesional Docente I',
          dia: 'lunes',
          inicio: '18:00',
          fin: '20:00',
        },
        {
          profesor: 'Docente Dos',
          carrera: 'Profesorado de Ingles',
          materia: 'PRA1',
          nombreMateria: 'Practica Profesional Docente I',
          dia: 'martes',
          inicio: '18:00',
          fin: '20:00',
        },
      ],
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' }))

    await waitFor(() => expect(screen.getByRole('region', { name: 'Titularidad del preview interno' })).toBeInTheDocument())

    const titularidad = screen.getByRole('region', { name: 'Titularidad del preview interno' })
    expect(within(titularidad).getByText('materias con multiples docentes')).toBeInTheDocument()
    expect(within(titularidad).getByText('practicas profesionales detectadas')).toBeInTheDocument()
  })

  it('muestra interpretacion automatica institucional', () => {
    mockHook(hookState({
      phase: 'warning',
      status: 'WARNING',
      uiDto: {
        uiSummary: {
          totalMesas: 10,
          totalPlanned: 5,
          totalUnassigned: 5,
        },
      },
      preview: {
        summary: {
          stageSummaries: {
            tribunals: {
              mesasCompletas: 3,
              mesasConUnVocal: 2,
              mesasSinTribunal: 5,
            },
            tentativeDates: {
              mesasSinFecha: 5,
            },
            vocales: {
              docentesEnLimite: 4,
              docentesExcedidos: 0,
            },
          },
        },
      },
      filteredDto: {
        uiTables: {
          planned: [],
          unassigned: [],
        },
      },
    }))

    render(<RegularExamPreviewInternalPanel {...props()} />)

    const interpretation = screen.getByRole('region', { name: 'Interpretacion institucional del preview' })
    expect(within(interpretation).getByText('No se recomienda usar como cronograma oficial.')).toBeInTheDocument()
    expect(within(interpretation).getByText('La regla mitad mas uno se respeta, pero limita la asignacion de vocales.')).toBeInTheDocument()
    expect(within(interpretation).getByText('Las mesas con un vocal requieren revision manual.')).toBeInTheDocument()
  })

  it('habilita el boton con los datos reales minimos del workspace', () => {
    render(<RegularExamPreviewInternalPanel {...props({
      alumnos: many(307, (index) => ({ id: `alumno-${index + 1}` })),
      docentes: many(60, (index) => ({ id: `doc-${index + 1}`, nombre: `Docente ${index + 1}` })),
      horariosDocentes: many(209, (index) => ({
        profesor: `Docente ${(index % 60) + 1}`,
        carrera: 'Profesorado de Ingles',
        materia: `MAT-${(index % 223) + 1}`,
        dia: 'lunes',
        inicio: '18:00',
        fin: '20:00',
      })),
      planesEstudio: many(223, (index) => ({
        carrera: 'Profesorado de Ingles',
        materia: `MAT-${index + 1}`,
        nombreMateria: `Materia ${index + 1}`,
      })),
      correlatividades: many(227, (index) => ({ materia: `MAT-${index + 1}` })),
    })} />)

    expect(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' })).toBeEnabled()
  })

  it('habilita el boton cuando fechaInicio y fechaFin vienen desde regularCallRanges', () => {
    render(<RegularExamPreviewInternalPanel {...props({
      alumnos: [{ id: 'alumno-1' }],
      correlatividades: [{ materia: 'ING1' }],
      fechaInicio: '',
      fechaFin: '',
      regularCallRanges: {
        first: { start: '2026-07-27', end: '2026-07-31' },
        second: { start: '2026-08-03', end: '2026-08-07' },
      },
    })} />)

    expect(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' })).toBeEnabled()
  })

  it('muestra advertencia read-only', () => {
    render(<RegularExamPreviewInternalPanel {...props()} />)

    expect(screen.getByText('Preview interno. No reemplaza el motor oficial. No guarda ni publica cronogramas.')).toBeInTheDocument()
  })

  it('marca mesas con 1 vocal como revision manual', () => {
    mockHook(hookState({
      phase: 'warning',
      status: 'WARNING',
      uiDto: {
        uiSummary: {
          totalMesas: 1,
          totalPlanned: 1,
          totalUnassigned: 0,
        },
        uiTeacherSummary: [],
      },
      filteredDto: {
        uiTables: {
          planned: [{
            id: 'mesa-1',
            materia: 'Ingles I',
            titular: { id: 'doc-1' },
            vocales: [{ id: 'doc-2' }],
            fecha: '2026-07-27',
          }],
          unassigned: [],
        },
      },
    }))

    render(<RegularExamPreviewInternalPanel {...props()} />)

    expect(screen.getByText('1 mesas marcadas con requiresManualReview=true y reason=TRIBUNAL_UN_VOCAL.')).toBeInTheDocument()
  })

  it('no llama acciones bloqueadas save publish replace', () => {
    const state = mockHook()

    render(<RegularExamPreviewInternalPanel {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar oficial bloqueado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar bloqueado' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reemplazo motor bloqueado' }))

    expect(state.actions.saveOfficialSchedule).not.toHaveBeenCalled()
    expect(state.actions.publishSchedule).not.toHaveBeenCalled()
    expect(state.actions.replaceLegacyEngine).not.toHaveBeenCalled()
  })

  it('deshabilita si planesEstudio esta vacio y explica el motivo', () => {
    render(<RegularExamPreviewInternalPanel {...props({
      docenteMateria: [{ materia_codigo: 'ING1' }],
      planesEstudio: [],
    })} />)

    const diagnostics = screen.getByRole('region', { name: 'Diagnostico de habilitacion del preview' })

    expect(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' })).toBeDisabled()
    expect(within(diagnostics).getByText('reasonDisabled')).toBeInTheDocument()
    expect(within(diagnostics).getAllByText(/PLANES_ESTUDIO_VACIO/).length).toBeGreaterThan(0)
    expect(within(diagnostics).getByText('docenteMateria count')).toBeInTheDocument()
    expect(within(diagnostics).getByText('planesEstudio count')).toBeInTheDocument()
  })

  it('deshabilita si horariosDocentes esta vacio y explica el motivo', () => {
    render(<RegularExamPreviewInternalPanel {...props({ horariosDocentes: [] })} />)

    const diagnostics = screen.getByRole('region', { name: 'Diagnostico de habilitacion del preview' })

    expect(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' })).toBeDisabled()
    expect(within(diagnostics).getAllByText(/HORARIOS_DOCENTES_VACIO/).length).toBeGreaterThan(0)
    expect(within(diagnostics).getByText('horariosDocentes count')).toBeInTheDocument()
  })

  it('habilita con alumnos vacio y lo muestra como warning', () => {
    render(<RegularExamPreviewInternalPanel {...props({ alumnos: [], correlatividades: [{ materia: 'ING1' }] })} />)

    expect(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' })).toBeEnabled()
    expect(screen.getByText(/ALUMNOS_VACIO_NO_BLOQUEANTE/)).toBeInTheDocument()
  })

  it('habilita con correlatividades vacias y lo muestra como warning', () => {
    render(<RegularExamPreviewInternalPanel {...props({ alumnos: [{ id: 'alumno-1' }], correlatividades: [] })} />)

    expect(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' })).toBeEnabled()
    expect(screen.getByText(/CORRELATIVIDADES_VACIAS_NO_BLOQUEANTE/)).toBeInTheDocument()
  })

  it('muestra reasonDisabled cuando el boton queda bloqueado', () => {
    render(<RegularExamPreviewInternalPanel {...props({ horariosDocentes: [], planesEstudio: [] })} />)

    expect(screen.getByText(/reasonDisabled: HORARIOS_DOCENTES_VACIO, PLANES_ESTUDIO_VACIO/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' })).toBeDisabled()
  })

  it('muestra error visible si el worker falla', async () => {
    let rejectWorker
    createExamEnginePreviewWorkerRun.mockReturnValue({
      requestId: 'worker-error',
      promise: new Promise((_, reject) => {
        rejectWorker = reject
      }),
      cancel: vi.fn(),
    })

    render(<RegularExamPreviewInternalPanel {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' }))
    await waitFor(() => expect(createExamEnginePreviewWorkerRun).toHaveBeenCalledTimes(1))
    rejectWorker(new Error('fallo controlado'))

    await waitFor(() => expect(screen.getByText('Error del preview interno: fallo controlado')).toBeInTheDocument())
  })

  it('si Worker no esta disponible muestra mensaje y no ejecuta', () => {
    isExamEnginePreviewWorkerSupported.mockReturnValue(false)

    render(<RegularExamPreviewInternalPanel {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ejecutar preview interno del nuevo motor' }))

    expect(screen.getByText('Error del preview interno: El preview interno requiere Web Worker para no bloquear la pantalla.')).toBeInTheDocument()
    expect(createExamEnginePreviewWorkerRun).not.toHaveBeenCalled()
  })
})
