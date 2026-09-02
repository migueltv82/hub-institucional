import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RegularExamPreviewScreen from './RegularExamPreviewScreen.jsx'
import { useRegularExamPreviewEngine } from '../../hooks/useRegularExamPreviewEngine'

vi.mock('../../hooks/useRegularExamPreviewEngine', () => ({
  useRegularExamPreviewEngine: vi.fn(),
}))

function buildActions(overrides = {}) {
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

function buildHookState(overrides = {}) {
  const { actions, ...stateOverrides } = overrides

  return {
    phase: 'idle',
    status: 'IDLE',
    uiDto: null,
    filteredDto: null,
    canExportJson: false,
    errors: [],
    warnings: [],
    actions: buildActions(actions),
    ...stateOverrides,
  }
}

function buildPreviewState(overrides = {}) {
  return buildHookState({
    phase: 'warning',
    status: 'WARNING',
    canExportJson: true,
    uiDto: {
      uiSummary: {
        totalPlanned: 2,
        totalUnassigned: 1,
        totalCriticalErrors: 0,
        totalWarnings: 1,
        totalPendingManualReview: 1,
        totalCompactadas: 1,
        cantidadLlamados: 2,
        compactMode: 'safe',
      },
    },
    filteredDto: {
      uiTables: {
        planned: [
          {
            id: 'planned-1',
            alertLevel: 'WARNING',
            materia: 'Matematica I',
            carrera: 'Profesorado de Matematica',
            anio: 1,
            llamado: 'PRIMER_LLAMADO',
            displayDate: '2026-07-27',
            turno: 'NOCHE',
            displayStatus: 'Planificada',
            titular: { id: 'doc-1', nombre: 'Ana Titular' },
            vocales: [
              { id: 'doc-2', nombre: 'Bruno Vocal', rol: 'VOCAL_1' },
              { id: 'doc-3', nombre: 'Carla Vocal', rol: 'VOCAL_2' },
            ],
            compactada: true,
            warningsCount: 1,
            errorsCount: 0,
            reviewRequired: true,
          },
        ],
        unassigned: [
          {
            id: 'pending-1',
            alertLevel: 'CRITICAL',
            materia: 'Fisica I',
            carrera: 'Tecnicatura en Software',
            anio: 1,
            llamado: 'SEGUNDO_LLAMADO',
            estado: 'SIN_FECHA',
            reason: 'SIN_FECHA_VALIDA',
            message: 'No hay fechas disponibles.',
            suggestedAction: 'Revisar fechas institucionales.',
            warningsCount: 0,
            errorsCount: 1,
            reviewRequired: true,
          },
        ],
      },
      uiAlerts: [
        {
          id: 'alert-1',
          severity: 'warning',
          message: 'Mesa con un vocal.',
          materia: 'Matematica I',
          carrera: 'Profesorado de Matematica',
          llamado: 'PRIMER_LLAMADO',
          fecha: '2026-07-27',
          docenteNombre: 'Bruno Vocal',
          suggestedAction: 'Asignar segundo vocal.',
        },
      ],
    },
    ...overrides,
  })
}

function mockHook(state) {
  useRegularExamPreviewEngine.mockReturnValue(state)
  return state
}

function many(count, factory) {
  return Array.from({ length: count }, (_, index) => factory(index))
}

describe('RegularExamPreviewScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHook(buildHookState())
  })

  it('renderiza titulo', () => {
    render(<RegularExamPreviewScreen />)

    expect(screen.getByRole('heading', { name: 'Preview de Mesas de Exámenes' })).toBeInTheDocument()
  })

  it('muestra aclaracion de preview', () => {
    render(<RegularExamPreviewScreen />)

    expect(screen.getByText('Este preview no reemplaza el cronograma oficial.')).toBeInTheDocument()
  })

  it('genera preview al hacer click', () => {
    const input = { docentes: [], materias: [] }
    const state = mockHook(buildHookState())

    render(<RegularExamPreviewScreen input={input} />)
    fireEvent.click(screen.getByRole('button', { name: 'Generar preview' }))

    expect(state.actions.generatePreview).toHaveBeenCalledWith(input)
  })

  it('muestra cards si hay uiSummary', () => {
    mockHook(buildPreviewState())

    render(<RegularExamPreviewScreen />)

    const summary = screen.getByRole('region', { name: 'Resumen del preview' })
    expect(within(summary).getByText('Mesas planificadas')).toBeInTheDocument()
    expect(within(summary).getByText('Mesas pendientes')).toBeInTheDocument()
    expect(within(summary).getByText('Errores criticos')).toBeInTheDocument()
    expect(within(summary).getByText('Modo compactacion')).toBeInTheDocument()
    expect(within(summary).getByText('safe')).toBeInTheDocument()
  })

  it('muestra tabla de planificadas', () => {
    mockHook(buildPreviewState())

    render(<RegularExamPreviewScreen />)

    const planned = screen.getByRole('region', { name: 'Mesas planificadas' })
    expect(within(planned).getByRole('table')).toBeInTheDocument()
    expect(within(planned).getByText('Matematica I')).toBeInTheDocument()
    expect(within(planned).getByText('Ana Titular')).toBeInTheDocument()
  })

  it('muestra pendientes', () => {
    mockHook(buildPreviewState())

    render(<RegularExamPreviewScreen />)

    const pending = screen.getByRole('region', { name: 'Mesas pendientes' })
    expect(within(pending).getByRole('table')).toBeInTheDocument()
    expect(within(pending).getByText('Fisica I')).toBeInTheDocument()
    expect(within(pending).getByText('No hay fechas disponibles.')).toBeInTheDocument()
  })

  it('muestra alertas', () => {
    mockHook(buildPreviewState())

    render(<RegularExamPreviewScreen />)

    const alerts = screen.getByRole('region', { name: 'Alertas' })
    expect(within(alerts).getByText('Mesa con un vocal.', { exact: false })).toBeInTheDocument()
    expect(within(alerts).getByText('Asignar segundo vocal.', { exact: false })).toBeInTheDocument()
  })

  it('limita warnings visibles y permite ver mas', () => {
    mockHook(buildHookState({
      warnings: many(25, (index) => ({
        code: `WARN_${index + 1}`,
        message: `Warning visible ${index + 1}`,
      })),
    }))

    render(<RegularExamPreviewScreen />)

    expect(screen.getByText('Mostrando 20 de 25.', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Warning visible 20')).toBeInTheDocument()
    expect(screen.queryByText('Warning visible 21')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver mas advertencias' }))

    expect(screen.getByText('Warning visible 21')).toBeInTheDocument()
  })

  it('botones oficiales estan disabled', () => {
    render(<RegularExamPreviewScreen />)

    expect(screen.getByRole('button', { name: 'Guardar cronograma oficial' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Publicar cronograma' })).toBeDisabled()
  })

  it('no importa motor viejo', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/examEnginePreview/RegularExamPreviewScreen.jsx'),
      'utf8',
    )
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const legacy = ['legacy', 'Adapter'].join('')
    const directPlanGenerator = ['generateRegular', 'ExamPlan'].join('')

    expect(source).toContain("import { useRegularExamPreviewEngine } from '../../hooks/useRegularExamPreviewEngine'")
    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(legacy)
    expect(source).not.toContain(directPlanGenerator)
  })

  it('no importa el hook de generacion anterior', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/examEnginePreview/RegularExamPreviewScreen.jsx'),
      'utf8',
    )
    const oldHook = ['useCronograma', 'Generation'].join('')

    expect(source).not.toContain(oldHook)
  })
})
