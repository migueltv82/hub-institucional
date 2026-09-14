import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mergeAcademicWorkbookDatasets,
  mergeStudentRows,
  mergeTeacherWorkbookDatasets,
  useCronogramaFiles,
} from './useCronogramaFiles.js'

const mocks = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('react-hot-toast', () => ({
  default: { error: mocks.toastError, success: mocks.toastSuccess },
}))

function props(overrides = {}) {
  const datasets = {
    alumnos: [{ id: 'a1' }],
    correlatividades: [{ id: 'c1' }],
    docenteMateria: [{ id: 'dm1' }],
    docentes: [{ id: 'd1' }],
    disponibilidadDocente: [{ id: 'disp1' }],
    horariosDocentes: [{ id: 'h1' }],
    cargaHorariaDocente: [{ id: 'load1' }],
    planesEstudio: [{ id: 'p1' }],
  }
  return {
    activeInstitutionId: 'institution-1',
    canEditWorkspace: true,
    cronogramaLength: 1,
    fileHandlers: {
      parseTemplateV2MasterWorkbook: vi.fn().mockResolvedValue({
        datasets: {
          correlatividades: datasets.correlatividades,
          planesEstudio: datasets.planesEstudio,
        },
        summary: { alumnos: 1, docentes: 1, planesEstudio: 1 },
      }),
      parseTemplateV2StudentsWorkbook: vi.fn().mockResolvedValue({
        datasets: { alumnos: [{ alumno_id: 'a1' }] },
        summary: { alumnos: 1 },
      }),
      parseTemplateV2TeachersWorkbook: vi.fn().mockResolvedValue({
          datasets: {
            docentes: [{ docente_id: 'd2', apellido: 'Flores', nombre: 'Silvia' }],
            docenteMateria: [{ docente_id: 'd2', materia_id: 'LAB25', carrera_id: 'LAB', rol_en_materia: 'TITULAR' }],
            disponibilidadDocente: [{ docente_id: 'd2', docente: 'Flores Silvia', dia: 'LUNES', turno: 'NOCHE', hora_desde: '18:20', hora_hasta: '19:00' }],
            horariosDocentes: [{ docente_id: 'd2', docente: 'Flores Silvia', profesor: 'Flores Silvia', materia_id: 'LAB25', materia_codigo: 'LAB25', materia_nombre: 'Quimica', carrera_id: 'LAB', carrera: 'Laboratorio', dia: 'LUNES', hora_inicio: '18:20', hora_fin: '19:00', inicio: '18:20', fin: '19:00' }],
          },
        summary: { docentes: 1 },
      }),
      saveSourceFile: vi.fn().mockResolvedValue({ source: 'supabase' }),
    },
    persistWorkspaceSnapshot: vi.fn().mockResolvedValue({ source: 'supabase' }),
    setAlumnos: vi.fn(),
    setCorrelatividades: vi.fn(),
    setCargaHorariaDocente: vi.fn(),
    setDocenteMateria: vi.fn(),
    setDocentes: vi.fn(),
    setDisponibilidadDocente: vi.fn(),
    setHorariosDocentes: vi.fn(),
    setPlanesEstudio: vi.fn(),
    setRequiereRegeneracion: vi.fn(),
    setUploadedFiles: vi.fn(),
    snapshotPayload: { cronograma: [{ id: 'mesa-1' }], uploadedFiles: {} },
    uploadedFiles: {},
    useRemoteWorkspace: true,
    workspaceKey: 'main',
    ...overrides,
  }
}

describe('useCronogramaFiles', () => {
  beforeEach(() => vi.clearAllMocks())

  it('acumula ingresantes y actualiza coincidencias sin borrar el padron anterior', () => {
    const result = mergeStudentRows(
      [{ alumno_id: '1', nombre: 'Ana' }, { alumno_id: '2', nombre: 'Luis' }],
      [{ alumno_id: '2', nombre: 'Luis Alberto' }, { alumno_id: '3', nombre: 'Marta' }],
    )
    expect(result).toMatchObject({ created: 1, updated: 1, preserved: 1 })
    expect(result.rows).toEqual([
      { alumno_id: '1', nombre: 'Ana' },
      { alumno_id: '2', nombre: 'Luis Alberto' },
      { alumno_id: '3', nombre: 'Marta' },
    ])
  })

  it('actualiza el mismo alumno por DNI aunque la nueva planilla traiga otro id', () => {
    const result = mergeStudentRows(
      [{
        id: 'student-record-1',
        profile_id: 'profile-1',
        email: 'ana.viejo@example.com',
        nombre: 'Ana',
        apellido: 'Perez',
        dni: '30111222',
        carrera: 'PROFESORADO DE INGLES',
        anio: '1',
      }],
      [{
        id: 'xlsx-random-id',
        email: 'ana.nuevo@example.com',
        nombre: 'Ana Maria',
        dni: '30.111.222',
        carrera: 'PROFESORADO DE INGLES',
        anio: '2',
      }],
    )

    expect(result).toMatchObject({ created: 0, updated: 1, preserved: 0 })
    expect(result.rows).toEqual([{
      id: 'student-record-1',
      profile_id: 'profile-1',
      email: 'ana.nuevo@example.com',
      nombre: 'Ana Maria',
      apellido: 'Perez',
      dni: '30.111.222',
      carrera: 'PROFESORADO DE INGLES',
      anio: '2',
    }])
  })

  it('no borra datos existentes cuando la planilla anual trae celdas vacias', () => {
    const result = mergeStudentRows(
      [{
        record_id: 'record-1',
        email: 'luis@example.com',
        nombre: 'Luis',
        apellido: 'Gomez',
        dni: '28111222',
        legajo: 'L-100',
        telefono: '381555111',
        carrera: 'TECNICO SUPERIOR EN TURISMO',
        anio: '1',
      }],
      [{
        email: 'luis@example.com',
        nombre: 'Luis Alberto',
        apellido: '',
        dni: '',
        legajo: '',
        telefono: '',
        carrera: 'TECNICO SUPERIOR EN TURISMO',
        anio: '2',
      }],
    )

    expect(result).toMatchObject({ created: 0, updated: 1, preserved: 0 })
    expect(result.rows).toEqual([{
      record_id: 'record-1',
      email: 'luis@example.com',
      nombre: 'Luis Alberto',
      apellido: 'Gomez',
      dni: '28111222',
      legajo: 'L-100',
      telefono: '381555111',
      carrera: 'TECNICO SUPERIOR EN TURISMO',
      anio: '2',
    }])
  })

  it('acumula docentes, titularidades y horarios sin borrar el padron anterior', () => {
    const result = mergeTeacherWorkbookDatasets(
      {
        docentes: [
          { docente_id: 'd1', apellido: 'Diaz', nombre: 'Ana', telefono: '111' },
          { docente_id: 'd2', apellido: 'Flores', nombre: 'Silvia' },
        ],
        docenteMateria: [
          { docente_id: 'd1', materia_id: 'ING01', carrera_id: 'ING', rol_en_materia: 'TITULAR', observaciones: 'anterior' },
        ],
        disponibilidadDocente: [
          { docente_id: 'd1', docente: 'Diaz Ana', dia: 'LUNES', turno: 'NOCHE', hora_desde: '18:20', hora_hasta: '19:00', observaciones: 'anterior' },
        ],
        horariosDocentes: [
          { docente_id: 'd1', docente: 'Diaz Ana', profesor: 'Diaz Ana', materia_id: 'ING01', materia_codigo: 'ING01', materia_nombre: 'Ingles I', carrera_id: 'ING', carrera: 'Profesorado', dia: 'LUNES', hora_inicio: '18:20', hora_fin: '19:00', aula: '1' },
        ],
      },
      {
        docentes: [
          { docente_id: 'd1', apellido: 'Diaz', nombre: 'Ana', telefono: '222' },
          { docente_id: 'd3', apellido: 'Luna', nombre: 'Martin' },
        ],
        docenteMateria: [
          { docente_id: 'd1', materia_id: 'ING01', carrera_id: 'ING', rol_en_materia: 'TITULAR', observaciones: 'actualizada' },
          { docente_id: 'd3', materia_id: 'LAB20', carrera_id: 'LAB', rol_en_materia: 'TITULAR' },
        ],
        disponibilidadDocente: [
          { docente_id: 'd1', docente: 'Diaz Ana', dia: 'LUNES', turno: 'NOCHE', hora_desde: '18:20', hora_hasta: '19:00', observaciones: 'actualizada' },
          { docente_id: 'd3', docente: 'Luna Martin', dia: 'MARTES', turno: 'NOCHE', hora_desde: '20:30', hora_hasta: '21:10' },
        ],
        horariosDocentes: [
          { docente_id: 'd1', docente: 'Diaz Ana', profesor: 'Diaz Ana', materia_id: 'ING01', materia_codigo: 'ING01', materia_nombre: 'Ingles I', carrera_id: 'ING', carrera: 'Profesorado', dia: 'LUNES', hora_inicio: '18:20', hora_fin: '19:00', aula: '2' },
          { docente_id: 'd3', docente: 'Luna Martin', profesor: 'Luna Martin', materia_id: 'LAB20', materia_codigo: 'LAB20', materia_nombre: 'Biologia', carrera_id: 'LAB', carrera: 'Laboratorio', dia: 'MARTES', hora_inicio: '20:30', hora_fin: '21:10' },
        ],
      },
    )

    expect(result.created).toEqual({
      cargaHorariaDocente: 2,
      disponibilidadDocente: 1,
      docentes: 1,
      docenteMateria: 1,
      horariosDocentes: 1,
    })
    expect(result.updated).toEqual({
      cargaHorariaDocente: 0,
      disponibilidadDocente: 1,
      docentes: 1,
      docenteMateria: 1,
      horariosDocentes: 1,
    })
    expect(result.datasets.docentes).toEqual([
      { docente_id: 'd1', apellido: 'Diaz', nombre: 'Ana', telefono: '222' },
      { docente_id: 'd2', apellido: 'Flores', nombre: 'Silvia' },
      { docente_id: 'd3', apellido: 'Luna', nombre: 'Martin' },
    ])
    expect(result.datasets.docenteMateria).toEqual([
      { docente_id: 'd1', materia_id: 'ING01', carrera_id: 'ING', rol_en_materia: 'TITULAR', observaciones: 'actualizada' },
      { docente_id: 'd3', materia_id: 'LAB20', carrera_id: 'LAB', rol_en_materia: 'TITULAR' },
    ])
    expect(result.datasets.disponibilidadDocente).toEqual([
      expect.objectContaining({ docente_id: 'd1', observaciones: 'actualizada' }),
      expect.objectContaining({ docente_id: 'd3', dia: 'MARTES' }),
    ])
    expect(result.datasets.horariosDocentes).toEqual([
      expect.objectContaining({ docente_id: 'd1', materia_id: 'ING01', aula: '2' }),
      expect.objectContaining({ docente_id: 'd3', materia_id: 'LAB20', dia: 'MARTES' }),
    ])
    expect(result.datasets.cargaHorariaDocente).toEqual([
      expect.objectContaining({ docente: 'Diaz Ana', materia_codigo: 'ING01', horasCatedra: 1, source: 'horarios_docentes' }),
      expect.objectContaining({ docente: 'Luna Martin', materia_codigo: 'LAB20', horasCatedra: 1, source: 'horarios_docentes' }),
    ])
  })

  it('reemplaza la carrera academica importada y conserva las demas', () => {
    const result = mergeAcademicWorkbookDatasets(
      {
        planesEstudio: [
          { id: 'old-lab-1', carrera: 'TECNICO SUP EN LABORATORIO', materia: 'LAB01', nombre: 'Vieja' },
          { id: 'ing-1', carrera: 'PROFESORADO DE INGLES', materia: 'ING01', nombre: 'Ingles I' },
        ],
        correlatividades: [
          { carrera: 'TECNICO SUP EN LABORATORIO', materia: 'LAB02', correlativa_codigo: 'LAB01' },
          { carrera: 'PROFESORADO DE INGLES', materia: 'ING02', correlativa_codigo: 'ING01' },
        ],
      },
      {
        planesEstudio: [
          { materia_id: 'lab-2015-01', carrera_id: 'LAB', carrera: 'TECNICO SUP EN LABORATORIO', materia_codigo: 'LAB2015-01', materia_nombre: 'Cultura' },
          { materia_id: 'lab-2024-01', carrera_id: 'LAB', carrera: 'TECNICO SUP EN LABORATORIO', materia_codigo: 'LAB2024-01', materia_nombre: 'Tecnicas' },
        ],
        correlatividades: [],
      },
    )

    expect(result.datasets.planesEstudio).toEqual([
      { id: 'ing-1', carrera: 'PROFESORADO DE INGLES', materia: 'ING01', nombre: 'Ingles I' },
      { materia_id: 'lab-2015-01', carrera_id: 'LAB', carrera: 'TECNICO SUP EN LABORATORIO', materia_codigo: 'LAB2015-01', materia_nombre: 'Cultura' },
      { materia_id: 'lab-2024-01', carrera_id: 'LAB', carrera: 'TECNICO SUP EN LABORATORIO', materia_codigo: 'LAB2024-01', materia_nombre: 'Tecnicas' },
    ])
    expect(result.datasets.correlatividades).toEqual([
      { carrera: 'PROFESORADO DE INGLES', materia: 'ING02', correlativa_codigo: 'ING01' },
    ])
  })

  it('persiste inmediatamente la plantilla academica sin borrar personas', async () => {
    const settings = props()
    const file = new File(['contenido'], 'plantilla-maestra.xlsx')
    const event = { target: { files: [file], value: 'selected' } }
    const { result } = renderHook(() => useCronogramaFiles(settings))

    await act(async () => result.current.onUploadMaster(event))

    expect(settings.fileHandlers.saveSourceFile).toHaveBeenCalledWith(expect.objectContaining({
      datasetKey: 'masterWorkbook', file,
    }))
    expect(settings.persistWorkspaceSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      planesEstudio: [{ id: 'p1' }],
      correlatividades: [{ id: 'c1' }],
      uploadedFiles: { masterWorkbook: 'plantilla-maestra.xlsx' },
      requiereRegeneracion: true,
    }))
    expect(settings.setAlumnos).not.toHaveBeenCalled()
    expect(settings.setDocentes).not.toHaveBeenCalled()
    expect(settings.setUploadedFiles).toHaveBeenCalledWith({ masterWorkbook: 'plantilla-maestra.xlsx' })
    expect(event.target.value).toBe('')
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Carga maestra guardada: 1 materias importadas, 1 materias totales.',
    )
  })

  it('puede cargar una plantilla maestra completa con datos academicos, docentes y alumnos', async () => {
    const settings = props({
      fileHandlers: {
        parseTemplateV2MasterWorkbook: vi.fn().mockResolvedValue({
          datasets: {
            alumnos: [{ alumno_id: 'a2', nombre: 'Marta' }],
            correlatividades: [{ id: 'c2' }],
            docenteMateria: [{ docente_id: 'd2', materia_id: 'LAB-2024-01', carrera_id: 'LAB', rol_en_materia: 'TITULAR' }],
            docentes: [{ docente_id: 'd2', apellido: 'Orozco', nombre: 'Elizabeth' }],
            disponibilidadDocente: [{ docente_id: 'd2', docente: 'Orozco Elizabeth', dia: 'LUNES', turno: 'NOCHE', hora_desde: '19:40', hora_hasta: '21:10' }],
            horariosDocentes: [{ docente_id: 'd2', docente: 'Orozco Elizabeth', profesor: 'Orozco Elizabeth', materia_id: 'LAB-2024-01', materia_codigo: 'LAB2024-01', materia_nombre: 'Tecnicas', carrera_id: 'LAB', carrera: 'Laboratorio', dia: 'LUNES', hora_inicio: '19:40', hora_fin: '21:10', inicio: '19:40', fin: '21:10' }],
            planesEstudio: [{ materia_id: 'LAB-2024-01', carrera_id: 'LAB', materia_codigo: 'LAB2024-01' }],
          },
          summary: { alumnos: 1, docentes: 1, planesEstudio: 1 },
        }),
        saveSourceFile: vi.fn().mockResolvedValue({ source: 'supabase' }),
      },
      snapshotPayload: {
        alumnos: [{ alumno_id: 'a1', nombre: 'Ana' }],
        correlatividades: [],
        docenteMateria: [],
        docentes: [{ docente_id: 'd1', apellido: 'Diaz', nombre: 'Ana' }],
        disponibilidadDocente: [],
        horariosDocentes: [],
        cargaHorariaDocente: [],
        planesEstudio: [{ materia_id: 'ING01', carrera_id: 'ING', materia_codigo: 'ING01' }],
        uploadedFiles: {},
      },
    })
    const file = new File(['contenido'], 'completa.xlsx')
    const event = { target: { files: [file], value: 'selected' } }
    const { result } = renderHook(() => useCronogramaFiles(settings))

    await act(async () => result.current.onUploadMaster(event))

    expect(settings.persistWorkspaceSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      alumnos: [{ alumno_id: 'a1', nombre: 'Ana' }, { alumno_id: 'a2', nombre: 'Marta' }],
      docentes: [{ docente_id: 'd1', apellido: 'Diaz', nombre: 'Ana' }, { docente_id: 'd2', apellido: 'Orozco', nombre: 'Elizabeth' }],
      docenteMateria: [{ docente_id: 'd2', materia_id: 'LAB-2024-01', carrera_id: 'LAB', rol_en_materia: 'TITULAR' }],
      disponibilidadDocente: [
        { docente_id: 'd2', docente: 'Orozco Elizabeth', dia: 'LUNES', turno: 'NOCHE', hora_desde: '19:40', hora_hasta: '21:10' },
      ],
      horariosDocentes: [expect.objectContaining({ docente_id: 'd2', materia_id: 'LAB-2024-01', carrera: 'Laboratorio' })],
      cargaHorariaDocente: [expect.objectContaining({ docente: 'Orozco Elizabeth', materia_codigo: 'LAB2024-01', horasCatedra: 2, source: 'horarios_docentes' })],
      planesEstudio: [
        { materia_id: 'ING01', carrera_id: 'ING', materia_codigo: 'ING01' },
        { materia_id: 'LAB-2024-01', carrera_id: 'LAB', materia_codigo: 'LAB2024-01' },
      ],
    }))
    expect(settings.setAlumnos).toHaveBeenCalledWith([{ alumno_id: 'a1', nombre: 'Ana' }, { alumno_id: 'a2', nombre: 'Marta' }])
    expect(settings.setDocentes).toHaveBeenCalledWith([{ docente_id: 'd1', apellido: 'Diaz', nombre: 'Ana' }, { docente_id: 'd2', apellido: 'Orozco', nombre: 'Elizabeth' }])
    expect(settings.setDisponibilidadDocente).toHaveBeenCalledWith([
      { docente_id: 'd2', docente: 'Orozco Elizabeth', dia: 'LUNES', turno: 'NOCHE', hora_desde: '19:40', hora_hasta: '21:10' },
    ])
    expect(settings.setCargaHorariaDocente).toHaveBeenCalledWith([
      expect.objectContaining({ docente: 'Orozco Elizabeth', materia_codigo: 'LAB2024-01', horasCatedra: 2 }),
    ])
  })

  it('persiste la plantilla docente como carga acumulativa', async () => {
    const settings = props({
      snapshotPayload: {
        cronograma: [{ id: 'mesa-1' }],
        uploadedFiles: {},
        docentes: [{ docente_id: 'd1', apellido: 'Diaz', nombre: 'Ana' }],
        docenteMateria: [{ docente_id: 'd1', materia_id: 'ING01', carrera_id: 'ING', rol_en_materia: 'TITULAR' }],
        disponibilidadDocente: [],
        horariosDocentes: [{ docente_id: 'd1', docente: 'Diaz Ana', profesor: 'Diaz Ana', materia_id: 'ING01', materia_codigo: 'ING01', materia_nombre: 'Ingles I', carrera_id: 'ING', carrera: 'Profesorado', dia: 'LUNES', hora_inicio: '18:20', hora_fin: '19:00', inicio: '18:20', fin: '19:00' }],
        cargaHorariaDocente: [],
      },
    })
    const file = new File(['contenido'], 'laboratorio-docentes.xlsx')
    const event = { target: { files: [file], value: 'selected' } }
    const { result } = renderHook(() => useCronogramaFiles(settings))

    await act(async () => result.current.onUploadTeachers(event))

    expect(settings.persistWorkspaceSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      docentes: [
        { docente_id: 'd1', apellido: 'Diaz', nombre: 'Ana' },
        { docente_id: 'd2', apellido: 'Flores', nombre: 'Silvia' },
      ],
      docenteMateria: [
        { docente_id: 'd1', materia_id: 'ING01', carrera_id: 'ING', rol_en_materia: 'TITULAR' },
        { docente_id: 'd2', materia_id: 'LAB25', carrera_id: 'LAB', rol_en_materia: 'TITULAR' },
      ],
      disponibilidadDocente: [
        { docente_id: 'd2', docente: 'Flores Silvia', dia: 'LUNES', turno: 'NOCHE', hora_desde: '18:20', hora_hasta: '19:00' },
      ],
      horariosDocentes: [
        expect.objectContaining({ docente_id: 'd1', materia_id: 'ING01', carrera: 'Profesorado' }),
        expect.objectContaining({ docente_id: 'd2', materia_id: 'LAB25', carrera: 'Laboratorio' }),
      ],
      cargaHorariaDocente: [
        expect.objectContaining({ docente: 'Diaz Ana', materia_codigo: 'ING01', horasCatedra: 1 }),
        expect.objectContaining({ docente: 'Flores Silvia', materia_codigo: 'LAB25', horasCatedra: 1 }),
      ],
      uploadedFiles: { docentesWorkbook: 'laboratorio-docentes.xlsx' },
      requiereRegeneracion: true,
    }))
    expect(settings.setDocentes).toHaveBeenCalledWith([
      { docente_id: 'd1', apellido: 'Diaz', nombre: 'Ana' },
      { docente_id: 'd2', apellido: 'Flores', nombre: 'Silvia' },
    ])
    expect(settings.setDocenteMateria).toHaveBeenCalledWith([
      { docente_id: 'd1', materia_id: 'ING01', carrera_id: 'ING', rol_en_materia: 'TITULAR' },
      { docente_id: 'd2', materia_id: 'LAB25', carrera_id: 'LAB', rol_en_materia: 'TITULAR' },
    ])
    expect(settings.setHorariosDocentes).toHaveBeenCalledWith([
      expect.objectContaining({ docente_id: 'd1', materia_id: 'ING01', carrera: 'Profesorado' }),
      expect.objectContaining({ docente_id: 'd2', materia_id: 'LAB25', carrera: 'Laboratorio' }),
    ])
    expect(settings.setDisponibilidadDocente).toHaveBeenCalledWith([
      { docente_id: 'd2', docente: 'Flores Silvia', dia: 'LUNES', turno: 'NOCHE', hora_desde: '18:20', hora_hasta: '19:00' },
    ])
    expect(settings.setCargaHorariaDocente).toHaveBeenCalledWith([
      expect.objectContaining({ docente: 'Diaz Ana', materia_codigo: 'ING01', horasCatedra: 1 }),
      expect.objectContaining({ docente: 'Flores Silvia', materia_codigo: 'LAB25', horasCatedra: 1 }),
    ])
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Carga docente acumulativa guardada: 1 docentes nuevos, 1 titularidades nuevas, 1 horarios nuevos. Total: 2 docentes.',
    )
  })

  it('no modifica el estado si falla la persistencia remota', async () => {
    const settings = props({
      persistWorkspaceSnapshot: vi.fn().mockRejectedValue(new Error('fallo de base')),
    })
    const event = { target: { files: [new File(['x'], 'plantilla.xlsx')], value: 'selected' } }
    const { result } = renderHook(() => useCronogramaFiles(settings))

    await act(async () => result.current.onUploadMaster(event))

    expect(settings.setAlumnos).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(
      'No se pudo cargar la plantilla maestra: fallo de base',
    )
  })
})
