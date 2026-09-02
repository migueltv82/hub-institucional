import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizarResultadoGeneracion,
  toggleMesaConfirmacion,
  useCronogramaGeneration,
} from './useCronogramaGeneration.js'

const mocks = vi.hoisted(() => ({
  generateCronogramaFromWorkspace: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('../services/examGenerationEngine.js', () => ({
  generateCronogramaFromWorkspace: mocks.generateCronogramaFromWorkspace,
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

function createProps(overrides = {}) {
  return {
    correlatividades: [{ id: 'correlativa-1' }],
    cronograma: [{ id: 'mesa-1' }],
    examType: 'regular',
    fechaFin: '2026-05-31',
    fechaInicio: '2026-05-01',
    generationScope: { careers: ['Profesorado'], year: '1' },
    horariosDocentes: [{ id: 'horario-1' }],
    disponibilidadDocente: [],
    cargaHorariaDocente: [],
    docentes: [{ id: 'docente-1' }],
    docenteMateria: [{ id: 'docente-materia-1' }],
    planesEstudio: [{ id: 'plan-1' }],
    regularCallRanges: {
      first: {
        start: '2026-06-24',
        end: '2026-07-05',
      },
      second: {
        start: '2026-08-03',
        end: '2026-08-14',
      },
    },
    selectedSpecialSubjectKeys: [],
    alumnos: [{ id: 'alumno-1' }],
    resetEdicionMesa: vi.fn(),
    setCorrelatividades: vi.fn(),
    setCronograma: vi.fn(),
    setDocentes: vi.fn(),
    setDocenteMateria: vi.fn(),
    setFechaFin: vi.fn(),
    setFechaInicio: vi.fn(),
    setExamType: vi.fn(),
    setGenerationScope: vi.fn(),
    setHorariosDocentes: vi.fn(),
    setDisponibilidadDocente: vi.fn(),
    setCargaHorariaDocente: vi.fn(),
    setPlanesEstudio: vi.fn(),
    setRegularCallRanges: vi.fn(),
    setRequiereRegeneracion: vi.fn(),
    setSelectedSpecialSubjectKeys: vi.fn(),
    setUploadedFiles: vi.fn(),
    ...overrides,
  }
}

describe('useCronogramaGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateCronogramaFromWorkspace.mockReturnValue([{ id: 'mesa-generada' }])
  })

  it('alterna confirmacion de mesa', () => {
    const original = [
      { id: 'mesa-1', estado: 'pendiente', confirmadaEn: '' },
      { id: 'mesa-2', estado: 'confirmada', confirmadaEn: 'ayer' },
    ]
    const originalSnapshot = structuredClone(original)
    const result = toggleMesaConfirmacion(original, 'mesa-1', 'hoy')

    expect(result[0]).toMatchObject({
      estado: 'confirmada',
      confirmadaEn: 'hoy',
    })
    expect(result).not.toBe(original)
    expect(result[0]).not.toBe(original[0])
    expect(result[1]).toBe(original[1])
    expect(original).toEqual(originalSnapshot)
    expect(toggleMesaConfirmacion(result, 'mesa-1')[0]).toMatchObject({
      estado: 'pendiente',
      confirmadaEn: '',
    })
  })

  it('preserva las demas mesas al confirmar desde el contrato publico del hook', () => {
    const cronograma = [
      { id: 'mesa-1', estado: 'pendiente', materia: 'Materia A' },
      { id: 'mesa-2', estado: 'pendiente', materia: 'Materia B' },
    ]
    const setCronograma = vi.fn((updater) => updater(cronograma))
    const props = createProps({ cronograma, setCronograma })
    const { result } = renderHook(() => useCronogramaGeneration(props))

    act(() => {
      result.current.alternarConfirmacionMesa('mesa-1')
    })

    const updated = setCronograma.mock.results[0].value
    expect(updated[0]).toMatchObject({ id: 'mesa-1', estado: 'confirmada' })
    expect(updated[1]).toBe(cronograma[1])
    expect(cronograma[0].estado).toBe('pendiente')
  })

  it('genera el cronograma y limpia la marca de regeneracion', () => {
    const props = createProps()
    const { result } = renderHook(() => useCronogramaGeneration(props))

    act(() => {
      result.current.generar()
    })

    expect(mocks.generateCronogramaFromWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      alumnos: props.alumnos,
      horariosDocentes: props.horariosDocentes,
      disponibilidadDocente: props.disponibilidadDocente,
      cargaHorariaDocente: props.cargaHorariaDocente,
      docentes: props.docentes,
      docenteMateria: props.docenteMateria,
      planesEstudio: props.planesEstudio,
      correlatividades: props.correlatividades,
      fechaInicio: '2026-05-01',
      fechaFin: '2026-05-31',
      examType: 'regular',
      generationScope: props.generationScope,
      regularCallRanges: props.regularCallRanges,
      selectedSpecialSubjectKeys: [],
    }))
    expect(props.setCronograma).toHaveBeenCalledWith([{ id: 'mesa-generada' }])
    expect(props.setRequiereRegeneracion).toHaveBeenCalledWith(false)
    expect(props.resetEdicionMesa).toHaveBeenCalledTimes(1)
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Cronograma generado. Listo para revisar, confirmar y exportar.',
    )
  })

  it('no muta los datos de entrada entregados al generador', () => {
    const props = createProps({
      alumnos: [{ id: 'alumno-1', materias: ['Materia A'] }],
      horariosDocentes: [{ id: 'horario-1', dias: ['lunes'] }],
      docentes: [{ id: 'docente-1', nombre: 'Docente Test' }],
    })
    const before = structuredClone({
      alumnos: props.alumnos,
      horariosDocentes: props.horariosDocentes,
      docentes: props.docentes,
      generationScope: props.generationScope,
      regularCallRanges: props.regularCallRanges,
    })
    const { result } = renderHook(() => useCronogramaGeneration(props))

    act(() => {
      result.current.generar()
    })

    expect({
      alumnos: props.alumnos,
      horariosDocentes: props.horariosDocentes,
      docentes: props.docentes,
      generationScope: props.generationScope,
      regularCallRanges: props.regularCallRanges,
    }).toEqual(before)
  })

  it('captura el error actual, informa su mensaje y no reemplaza el cronograma', () => {
    const generationError = new Error('Fallo controlado del generador')
    generationError.cause = new Error('Causa original')
    mocks.generateCronogramaFromWorkspace.mockImplementation(() => {
      throw generationError
    })
    const props = createProps()
    const { result } = renderHook(() => useCronogramaGeneration(props))

    expect(() => {
      act(() => {
        result.current.generar()
      })
    }).not.toThrow()

    expect(mocks.toastError).toHaveBeenCalledWith('Fallo controlado del generador')
    expect(generationError.cause.message).toBe('Causa original')
    expect(props.setCronograma).not.toHaveBeenCalled()
    expect(props.setRequiereRegeneracion).not.toHaveBeenCalled()
    expect(props.resetEdicionMesa).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it.each([null, undefined, false, 'resultado-invalido'])(
    'normaliza el resultado invalido %s como cronograma vacio',
    (invalidResult) => {
      mocks.generateCronogramaFromWorkspace.mockReturnValue(invalidResult)
      const props = createProps()
      const { result } = renderHook(() => useCronogramaGeneration(props))

      act(() => {
        result.current.generar()
      })

      expect(props.setCronograma).toHaveBeenCalledWith([])
      expect(props.setRequiereRegeneracion).toHaveBeenCalledWith(false)
      expect(mocks.toastSuccess).toHaveBeenCalledTimes(1)
    },
  )

  it('entrega el modelo docente estructurado al generador sin convertirlo en la UI', () => {
    const props = createProps({
      horariosDocentes: [],
      cargaHorariaDocente: [{
        id: 'load-1',
        docente: 'Ana Diaz',
        carrera: 'Profesorado',
        materia_codigo: 'ING1',
        materia_nombre: 'Ingles I',
        horasCatedra: 3,
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
      }],
      disponibilidadDocente: [{
        id: 'disp-1',
        docente: 'Ana Diaz',
        dia: 'Lunes',
        turno: 'NOCHE',
        hora_desde: '18:00',
        hora_hasta: '20:00',
      }],
    })
    const { result } = renderHook(() => useCronogramaGeneration(props))

    act(() => {
      result.current.generar()
    })

    expect(mocks.generateCronogramaFromWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      horariosDocentes: [],
      cargaHorariaDocente: props.cargaHorariaDocente,
      disponibilidadDocente: props.disponibilidadDocente,
    }))
  })

  it('conserva reportes cuando el motor devuelve un array con metadatos', () => {
    const cronograma = [{ id: 'mesa-generada' }]
    const reporteGeneracion = {
      exclusiones: [{ motivo: 'No hay docente disponible' }],
      advertencias: [],
      conflictos: [],
      metricas: { exclusiones: 1 },
    }
    Object.defineProperty(cronograma, 'reporteGeneracion', {
      value: reporteGeneracion,
      enumerable: false,
    })
    mocks.generateCronogramaFromWorkspace.mockReturnValue(cronograma)
    const props = createProps()
    const { result } = renderHook(() => useCronogramaGeneration(props))

    act(() => {
      result.current.generar()
    })

    expect(props.setCronograma).toHaveBeenCalledWith(cronograma)
    expect(props.setCronograma.mock.calls[0][0].reporteGeneracion).toBe(reporteGeneracion)
  })

  it('normaliza un resultado objeto sin romper el array que consume la UI', () => {
    const resultado = normalizarResultadoGeneracion({
      cronograma: [{ id: 'mesa-generada' }],
      exclusiones: [{ motivo: 'No alcanza mitad más uno' }],
      advertencias: [{ motivo: 'Excepcion aplicada' }],
      conflictos: [],
      metricas: { mesasGeneradas: 1 },
    })

    expect(Array.isArray(resultado)).toBe(true)
    expect(resultado).toHaveLength(1)
    expect(resultado.reporteGeneracion).toMatchObject({
      exclusiones: [{ motivo: 'No alcanza mitad más uno' }],
      advertencias: [{ motivo: 'Excepcion aplicada' }],
      conflictos: [],
      metricas: { mesasGeneradas: 1 },
    })
  })

  it('acepta un resultado objeto del motor y guarda solo el cronograma normalizado', () => {
    mocks.generateCronogramaFromWorkspace.mockReturnValue({
      cronograma: [{ id: 'mesa-generada' }],
      exclusiones: [{ motivo: 'No hay docente disponible' }],
      advertencias: [],
      metricas: { exclusiones: 1 },
    })
    const props = createProps()
    const { result } = renderHook(() => useCronogramaGeneration(props))

    act(() => {
      result.current.generar()
    })

    const cronogramaGuardado = props.setCronograma.mock.calls[0][0]
    expect(Array.isArray(cronogramaGuardado)).toBe(true)
    expect(cronogramaGuardado).toEqual([{ id: 'mesa-generada' }])
    expect(cronogramaGuardado.reporteGeneracion.exclusiones).toEqual([
      { motivo: 'No hay docente disponible' },
    ])
  })

  it('marca regeneracion al cambiar periodo si ya existe cronograma', () => {
    const props = createProps()
    const { result } = renderHook(() => useCronogramaGeneration(props))

    act(() => {
      result.current.cambiarFechaInicio('2026-06-01')
    })

    expect(props.setRequiereRegeneracion).toHaveBeenCalledWith(true)
    expect(props.setFechaInicio).toHaveBeenCalledWith('2026-06-01')
  })

  it('limpia todo el workspace operativo', () => {
    const props = createProps()
    const { result } = renderHook(() => useCronogramaGeneration(props))

    act(() => {
      result.current.limpiarTodo()
    })

    expect(props.setHorariosDocentes).toHaveBeenCalledWith([])
    expect(props.setDisponibilidadDocente).toHaveBeenCalledWith([])
    expect(props.setCargaHorariaDocente).toHaveBeenCalledWith([])
    expect(props.setPlanesEstudio).toHaveBeenCalledWith([])
    expect(props.setCorrelatividades).toHaveBeenCalledWith([])
    expect(props.setDocentes).toHaveBeenCalledWith([])
    expect(props.setDocenteMateria).toHaveBeenCalledWith([])
    expect(props.setUploadedFiles).toHaveBeenCalledWith({
      masterWorkbook: null,
      docentesWorkbook: null,
      alumnosWorkbook: null,
      horarios: null,
      planes: null,
      correlatividades: null,
      alumnos: null,
      docentes: null,
      docenteMateria: null,
    })
    expect(props.setFechaInicio).toHaveBeenCalledWith('')
    expect(props.setFechaFin).toHaveBeenCalledWith('')
    expect(props.setRegularCallRanges).toHaveBeenCalledWith({
      callCount: 2,
      first: {
        start: '',
        end: '',
      },
      second: {
        start: '',
        end: '',
      },
    })
    expect(props.setExamType).toHaveBeenCalledWith('regular')
    expect(props.setGenerationScope).toHaveBeenCalledWith({ careers: [], year: '', respectCorrelativities: true })
    expect(props.setSelectedSpecialSubjectKeys).toHaveBeenCalledWith([])
    expect(props.setCronograma).toHaveBeenCalledWith([])
    expect(props.setRequiereRegeneracion).toHaveBeenCalledWith(false)
    expect(props.resetEdicionMesa).toHaveBeenCalledTimes(1)
  })

  it('borra solo el cronograma generado y conserva la carga', () => {
    const props = createProps()
    const { result } = renderHook(() => useCronogramaGeneration(props))

    act(() => {
      result.current.borrarCronograma()
    })

    expect(props.setCronograma).toHaveBeenCalledWith([])
    expect(props.setRequiereRegeneracion).toHaveBeenCalledWith(false)
    expect(props.resetEdicionMesa).toHaveBeenCalledTimes(1)
    expect(props.setHorariosDocentes).not.toHaveBeenCalled()
    expect(props.setPlanesEstudio).not.toHaveBeenCalled()
    expect(props.setCorrelatividades).not.toHaveBeenCalled()
    expect(props.setUploadedFiles).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Cronograma de mesas borrado. Los archivos cargados se conservaron.',
    )
  })
})
