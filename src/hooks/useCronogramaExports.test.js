import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCronogramaExports } from './useCronogramaExports.js'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

function createHandlers(overrides = {}) {
  return {
    downloadStaticAsset: vi.fn(),
    downloadTemplateV2Workbook: vi.fn().mockResolvedValue({ fileName: 'plantillas-exam-engine-v2.xlsx', sheets: 12 }),
    exportarCronogramaCarrerasPdf: vi.fn().mockResolvedValue({ careers: 2 }),
    exportarCronogramaDestinatariosPdf: vi.fn().mockResolvedValue({ students: 3, teachers: 4 }),
    exportarCronogramaXlsx: vi.fn().mockResolvedValue(),
    exportarMesasConfirmadasPorCarreraXlsx: vi.fn().mockResolvedValue(),
    exportarPlacaRedes: vi.fn().mockResolvedValue(),
    ...overrides,
  }
}

describe('useCronogramaExports', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(),
      },
    })
  })

  it('exporta cronograma y reporta exito', async () => {
    const cronograma = [{ materia: 'Matematica' }]
    const exportHandlers = createHandlers()
    const { result } = renderHook(() => useCronogramaExports({ cronograma, exportHandlers }))

    await act(async () => {
      await result.current.exportarCronograma()
    })

    expect(exportHandlers.exportarCronogramaXlsx).toHaveBeenCalledWith(cronograma)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Cronograma exportado en XLSX.')
  })

  it('descarga la plantilla academica corregida desde assets publicos', async () => {
    const exportHandlers = createHandlers()
    const { result } = renderHook(() => useCronogramaExports({
      cronograma: [],
      exportHandlers,
    }))

    await act(async () => {
      await result.current.descargarKitExamEngineV2()
    })

    expect(exportHandlers.downloadStaticAsset).toHaveBeenCalledWith({
      fileName: 'plantilla-academica.xlsx',
      href: '/plantillas/plantilla-academica.xlsx',
    })
    expect(exportHandlers.downloadTemplateV2Workbook).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Plantilla descargada: Plantilla academica.')
  })

  it('descarga las plantillas de docentes y alumnos corregidas desde assets publicos', async () => {
    const exportHandlers = createHandlers()
    const { result } = renderHook(() => useCronogramaExports({
      cronograma: [],
      exportHandlers,
    }))

    await act(async () => {
      await result.current.descargarPlantillaDocentes()
      await result.current.descargarPlantillaAlumnos()
    })

    expect(exportHandlers.downloadStaticAsset).toHaveBeenCalledWith({
      fileName: 'plantilla-docentes.xlsx',
      href: '/plantillas/plantilla-docentes.xlsx',
    })
    expect(exportHandlers.downloadStaticAsset).toHaveBeenCalledWith({
      fileName: 'plantilla-alumnos.xlsx',
      href: '/plantillas/plantilla-alumnos.xlsx',
    })
    expect(exportHandlers.downloadTemplateV2Workbook).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Plantilla descargada: Plantilla de docentes.')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Plantilla descargada: Plantilla de alumnos.')
  })

  it('descarga la planilla institucional precargada desde assets publicos', async () => {
    const exportHandlers = createHandlers()
    const { result } = renderHook(() => useCronogramaExports({
      cronograma: [],
      exportHandlers,
    }))

    await act(async () => {
      await result.current.descargarPlanillaPrecargada()
    })

    expect(exportHandlers.downloadStaticAsset).toHaveBeenCalledWith({
      fileName: 'plantilla_institucional_precargada_completa.xlsx',
      href: '/plantillas/plantilla_institucional_precargada_completa.xlsx',
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Plantilla descargada: Planilla institucional precargada.')
  })

  it('exporta PDFs por carrera con institucion activa', async () => {
    const cronograma = [{ materia: 'ING01', carrera: 'Profesorado de Ingles' }]
    const careerOptions = ['Profesorado de Ingles', 'Traductorado de Ingles']
    const institution = { name: 'Instituto Demo', logo_url: 'https://example.com/logo.png' }
    const exportHandlers = createHandlers({
      exportarCronogramaCarrerasPdf: vi.fn().mockResolvedValue({ careers: 1 }),
    })
    const { result } = renderHook(() => useCronogramaExports({
      careerOptions,
      cronograma,
      exportHandlers,
      institution,
    }))

    await act(async () => {
      await result.current.exportarPdfPorCarrera()
    })

    expect(exportHandlers.exportarCronogramaCarrerasPdf).toHaveBeenCalledWith({
      careerOptions: ['Profesorado de Ingles'],
      cronograma,
      institution,
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('PDFs por carrera generados: 1.')
  })

  it('exporta PDFs personalizados para alumnos y docentes', async () => {
    const cronograma = [{ materia: 'ING01', carrera: 'Profesorado de Ingles' }]
    const alumnos = [{ email: 'ana@example.com' }]
    const docentes = [{ email: 'docente@example.com' }]
    const correlatividades = [{ materia: 'ING01', correlativas: [] }]
    const academicData = { enrollments: [] }
    const institution = { name: 'Instituto Demo' }
    const exportHandlers = createHandlers()
    const { result } = renderHook(() => useCronogramaExports({
      academicData,
      alumnos,
      correlatividades,
      cronograma,
      docentes,
      exportHandlers,
      institution,
    }))

    await act(async () => {
      await result.current.exportarPdfDestinatarios()
    })

    expect(exportHandlers.exportarCronogramaDestinatariosPdf).toHaveBeenCalledWith({
      academicData,
      alumnos,
      correlatividades,
      cronograma,
      docentes,
      institution,
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('PDFs personalizados: 3 alumnos y 4 docentes.')
  })

  it('informa la cantidad de placas PNG generadas', async () => {
    const cronograma = [{ materia: 'ING01', carrera: 'Profesorado de Ingles' }]
    const exportHandlers = createHandlers({
      exportarPlacaRedes: vi.fn().mockResolvedValue({ placas: 4 }),
    })
    const { result } = renderHook(() => useCronogramaExports({ cronograma, exportHandlers }))

    await act(async () => {
      await result.current.exportarPlaca()
    })

    expect(exportHandlers.exportarPlacaRedes).toHaveBeenCalledWith(cronograma)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Placas PNG generadas: 4.')
  })

  it('copia el texto de publicacion disponible', async () => {
    const { result } = renderHook(() => useCronogramaExports({
      cronograma: [],
      exportHandlers: createHandlers(),
    }))

    await act(async () => {
      await result.current.copiarTexto()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('CRONOGRAMA DE MESAS DE EXAMEN'),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Texto copiado al portapapeles.')
  })
})
