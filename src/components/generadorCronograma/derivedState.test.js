import { describe, expect, it } from 'vitest'
import {
  getCronogramaViewState,
  getGenerationMessage,
  getTeacherSourceReadiness,
} from './derivedState.js'

describe('derivedState', () => {
  it('calcula flags de generacion y exportacion desde el estado del workspace', () => {
    const viewState = getCronogramaViewState({
      cronograma: [
        { id: 'mesa-1', estado: 'confirmada', ajusteManual: true },
        { id: 'mesa-2', estado: 'pendiente' },
      ],
      fechaInicio: '2026-05-01',
      fechaFin: '2026-05-31',
      horariosDocentes: [{ profesor: 'Ada', carrera: 'Profesorado', materia: 'ING1' }],
      regularCallRanges: {
        first: {
          start: '2026-05-01',
          end: '2026-05-14',
        },
        second: {
          start: '2026-05-15',
          end: '2026-05-31',
        },
      },
      rankingDocentes: [{ profesor: 'Ada', horas: 12 }],
      requiereRegeneracion: false,
      uploadedFiles: {
        masterWorkbook: 'plantilla-academica.xlsx', docentesWorkbook: 'docentes.xlsx', alumnosWorkbook: 'alumnos.xlsx',
        horarios: 'horarios.xlsx',
        planes: 'planes.xlsx',
        correlatividades: 'correlatividades.xlsx',
        alumnos: 'alumnos.xlsx',
      },
    })

    expect(viewState.puedeGenerar).toBe(true)
    expect(viewState.exportacionesHabilitadas).toBe(true)
    expect(viewState.reporteConfirmadasHabilitado).toBe(true)
    expect(viewState.mesasConfirmadas).toHaveLength(1)
    expect(viewState.mesasConAjusteManual).toHaveLength(1)
    expect(viewState.maxHorasDocente).toBe(12)
    expect(viewState.checklist.every((item) => item.done)).toBe(true)
  })

  it('readiness pasa con disponibilidad y carga horaria estructurada sin archivo de horarios', () => {
    const viewState = getCronogramaViewState({
      cronograma: [],
      docentes: [{ nombre: 'Ana Diaz', estado: 'activo' }],
      disponibilidadDocente: [{ docente: 'Ana Diaz', dia: 'Lunes', hora_desde: '18:00', hora_hasta: '20:00' }],
      cargaHorariaDocente: [{
        docente: 'Ana Diaz',
        carrera: 'Profesorado',
        materia_codigo: 'ING1',
        horasCatedra: 3,
        rol_en_materia: 'TITULAR',
      }],
      fechaInicio: '2026-05-01',
      fechaFin: '2026-05-31',
      horariosDocentes: [],
      regularCallRanges: {
        first: { start: '2026-05-01', end: '2026-05-14' },
        second: { start: '2026-05-15', end: '2026-05-31' },
      },
      rankingDocentes: [],
      requiereRegeneracion: false,
      uploadedFiles: {
        masterWorkbook: 'plantilla-academica.xlsx', docentesWorkbook: 'docentes.xlsx', alumnosWorkbook: 'alumnos.xlsx',
        horarios: null,
        planes: 'planes.xlsx',
        correlatividades: 'correlatividades.xlsx',
      },
    })

    expect(viewState.puedeGenerar).toBe(true)
    expect(viewState.teacherSourceReadiness).toMatchObject({
      source: 'structured',
      hasStructuredTeacherSource: true,
      hasLegacyTeacherScheduleSource: false,
      hasValidTeacherSource: true,
    })
    expect(viewState.mensajeGeneracion).toBe('Todo listo para armar el cronograma con la plantilla maestra.')
    expect(viewState.checklist[0]).toEqual({
      label: 'Docentes de la plantilla maestra',
      done: true,
    })
  })

  it('readiness pasa con horariosDocentes legacy como fallback', () => {
    const readiness = getTeacherSourceReadiness({
      docentes: [],
      disponibilidadDocente: [],
      cargaHorariaDocente: [],
      horariosDocentes: [{ profesor: 'Ana Diaz', carrera: 'Profesorado', materia: 'ING1' }],
    })

    expect(readiness).toMatchObject({
      source: 'legacy',
      hasStructuredTeacherSource: false,
      hasLegacyTeacherScheduleSource: true,
      hasValidTeacherSource: true,
      message: 'Usando fallback legacy: horarios docentes.',
    })
  })

  it('readiness bloquea si no hay ninguna fuente docente', () => {
    const viewState = getCronogramaViewState({
      cronograma: [],
      docentes: [],
      disponibilidadDocente: [],
      cargaHorariaDocente: [],
      horariosDocentes: [],
      fechaInicio: '2026-05-01',
      fechaFin: '2026-05-31',
      regularCallRanges: {
        first: { start: '2026-05-01', end: '2026-05-14' },
        second: { start: '2026-05-15', end: '2026-05-31' },
      },
      rankingDocentes: [],
      requiereRegeneracion: false,
      uploadedFiles: {
        masterWorkbook: 'plantilla-maestra.xlsx',
        planes: 'planes.xlsx',
        correlatividades: 'correlatividades.xlsx',
      },
    })

    expect(viewState.puedeGenerar).toBe(false)
    expect(viewState.teacherSourceReadiness.source).toBe('missing')
    expect(viewState.mensajeGeneracion).toContain('Falta fuente docente valida')
  })

  it('readiness advierte carga horaria sin disponibilidad y disponibilidad sin materias', () => {
    const loadWithoutAvailability = getTeacherSourceReadiness({
      docentes: [{ nombre: 'Ana Diaz', estado: 'activo' }],
      disponibilidadDocente: [{ docente: 'Bruno Perez', dia: 'Martes', hora_desde: '18:00', hora_hasta: '20:00' }],
      cargaHorariaDocente: [{
        docente: 'Ana Diaz',
        carrera: 'Profesorado',
        materia_codigo: 'ING1',
        horasCatedra: 3,
        rol_en_materia: 'TITULAR',
      }],
      horariosDocentes: [],
    })

    expect(loadWithoutAvailability.warnings).toEqual(expect.arrayContaining([
      'Ana Diaz: Tiene carga horaria sin disponibilidad.',
      'Bruno Perez: Tiene disponibilidad sin materias asignadas.',
    ]))
  })

  it('prioriza el mensaje de periodo invalido sobre otros estados', () => {
    expect(getGenerationMessage({
      puedeGenerar: true,
      periodoDefinido: true,
      periodoInvalido: true,
      requiereRegeneracion: true,
    })).toBe('Cada llamado debe tener una fecha desde menor o igual a la fecha hasta.')
  })
})
