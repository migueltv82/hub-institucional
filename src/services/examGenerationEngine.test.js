import { describe, expect, it } from 'vitest'
import {
  EXAM_GENERATION_ENGINE,
  adaptExamEngineMesaToCronograma,
  generateCronogramaFromWorkspace,
  generateCronogramaWithExamEngine,
} from './examGenerationEngine.js'

function createWorkspaceInput(overrides = {}) {
  return {
    fechaInicio: '2026-07-27',
    fechaFin: '2026-07-27',
    examType: 'regular',
    regularCallRanges: {
      callCount: 1,
      first: {
        start: '2026-07-27',
        end: '2026-07-27',
        turno: 'NOCHE',
      },
    },
    generationScope: {},
    alumnos: [],
    correlatividades: [],
    docentes: [
      { nombre: 'Ana', apellido: 'Titular', dni: '1' },
      { nombre: 'Bruno', apellido: 'Vocal', dni: '2' },
      { nombre: 'Carla', apellido: 'Vocal', dni: '3' },
    ],
    horariosDocentes: [
      { profesor: 'Ana Titular', carrera: 'Profesorado de Ingles', materia: 'ING1', dia: 'Lunes', inicio: '18:00', fin: '20:00' },
      { profesor: 'Bruno Vocal', carrera: 'Profesorado de Ingles', materia: 'ING2', dia: 'Lunes', inicio: '18:00', fin: '20:00' },
      { profesor: 'Carla Vocal', carrera: 'Profesorado de Ingles', materia: 'ING3', dia: 'Lunes', inicio: '18:00', fin: '20:00' },
    ],
    planesEstudio: [
      { carrera: 'Profesorado de Ingles', materia: 'ING1', nombre: 'Lengua Inglesa I', anio: 1 },
    ],
    ...overrides,
  }
}

describe('examGenerationEngine service', () => {
  it('usa examEngine como unica ruta de generacion', () => {
    const result = generateCronogramaFromWorkspace(createWorkspaceInput())

    expect(result.cronograma).toHaveLength(1)
    expect(result.cronograma[0]).toMatchObject({
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      nombreMateria: 'Lengua Inglesa I',
      profesorTitular: 'Ana Titular',
      vocal1: 'Bruno Vocal',
      vocal2: 'Carla Vocal',
      fechaIso: '2026-07-27',
      fecha: '27/07/2026',
      estado: 'pendiente',
      exam_type: 'regular',
      exam_call: 'first',
      origenMotor: EXAM_GENERATION_ENGINE.EXAM_ENGINE,
    })
    expect(result.reporteGeneracion.metricas.engine).toBe(EXAM_GENERATION_ENGINE.EXAM_ENGINE)
  })

  it('respeta el alcance regular por carrera y anio antes de generar mesas', () => {
    const result = generateCronogramaFromWorkspace(createWorkspaceInput({
      generationScope: {
        careers: ['Profesorado de Ingles'],
        year: '1',
      },
      planesEstudio: [
        { carrera: 'Profesorado de Ingles', materia: 'ING1', nombre: 'Lengua Inglesa I', anio: 1 },
        { carrera: 'Profesorado de Ingles', materia: 'ING2', nombre: 'Lengua Inglesa II', anio: 2 },
        { carrera: 'Profesorado de Historia', materia: 'HIS1', nombre: 'Historia I', anio: 1 },
      ],
    }))
    const plan = result.reporteGeneracion.examEnginePlan

    expect(result.cronograma).toHaveLength(1)
    expect(result.cronograma[0]).toMatchObject({
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
    })
    expect(plan.summary.totalMaterias).toBe(1)
    expect(plan.candidates.map((candidate) => candidate.codigo)).toEqual(['ING1'])
  })

  it('deja fuera Geografia 1, 2 y 3 en el generador principal', () => {
    const result = generateCronogramaFromWorkspace(createWorkspaceInput({
      generationScope: {
        careers: ['Profesorado de Geografia'],
      },
      horariosDocentes: [
        { profesor: 'Ana Titular', carrera: 'Profesorado de Geografia', materia: 'GEO1', dia: 'Lunes', inicio: '18:00', fin: '20:00' },
        { profesor: 'Ana Titular', carrera: 'Profesorado de Geografia', materia: 'GEO2', dia: 'Lunes', inicio: '18:00', fin: '20:00' },
        { profesor: 'Ana Titular', carrera: 'Profesorado de Geografia', materia: 'GEO3', dia: 'Lunes', inicio: '18:00', fin: '20:00' },
        { profesor: 'Ana Titular', carrera: 'Profesorado de Geografia', materia: 'GEO4', dia: 'Lunes', inicio: '18:00', fin: '20:00' },
        { profesor: 'Bruno Vocal', carrera: 'Profesorado de Geografia', materia: 'GEOX', dia: 'Lunes', inicio: '18:00', fin: '20:00' },
        { profesor: 'Carla Vocal', carrera: 'Profesorado de Geografia', materia: 'GEOY', dia: 'Lunes', inicio: '18:00', fin: '20:00' },
      ],
      planesEstudio: [
        { id: 'geo-1', carrera: 'Profesorado de Geografia', materia: 'GEO1', nombre: 'Geografia I', anio: 1 },
        { id: 'geo-2', carrera: 'Profesorado de Geografia', materia: 'GEO2', nombre: 'Geografia II', anio: 2 },
        { id: 'geo-3', carrera: 'Profesorado de Geografia', materia: 'GEO3', nombre: 'Geografia III', anio: 3 },
        { id: 'geo-4', carrera: 'Profesorado de Geografia', materia: 'GEO4', nombre: 'Geografia IV', anio: 4 },
      ],
    }))
    const plan = result.reporteGeneracion.examEnginePlan

    expect(result.cronograma.map((mesa) => mesa.materia)).toEqual(['GEO4'])
    expect(plan.candidates.map((candidate) => candidate.codigo)).toEqual(['GEO4'])
    expect(result.reporteGeneracion.metricas.adapterDiagnostics.adaptedCounts)
      .toMatchObject({ materiasExcluidasManualInstitucional: 3 })
    expect(plan.metadata.candidateExclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        materiaId: 'geo-1',
        reason: 'La materia no requiere mesa',
        severity: 'info',
      }),
    ]))
  })

  it('tolera el contrato dateAware de punta a punta sin alterar el adaptador de UI', () => {
    const result = generateCronogramaFromWorkspace(createWorkspaceInput({
      generationEngine: EXAM_GENERATION_ENGINE.EXAM_ENGINE,
      generationScope: {
        vocalPlanningMode: 'dateAware',
      },
    }))
    const plan = result.reporteGeneracion.examEnginePlan

    expect(result.cronograma).toHaveLength(1)
    expect(result.cronograma[0]).toMatchObject({
      materia: 'ING1',
      fechaIso: '2026-07-27',
      profesorTitular: 'Ana Titular',
      vocal1: 'Bruno Vocal',
      vocal2: 'Carla Vocal',
      origenMotor: EXAM_GENERATION_ENGINE.EXAM_ENGINE,
    })
    expect(plan.metadata).toMatchObject({
      vocalPlanningMode: 'dateAware',
      dateAwareCompatibility: {
        mesasConVocales: 'plannedMesasBeforeRepair',
        mesasReparadas: 'repairOutputPreservingAssignedDates',
        finalMesas: 'compactResultAfterRepair',
      },
    })
    expect(plan.mesasConVocales).toHaveLength(1)
    expect(plan.mesasReparadas).toHaveLength(1)
    expect(plan.plannedMesas).toHaveLength(1)
    expect(plan.unassignedMesas).toEqual([])
    expect(plan.report).toMatchObject({
      executiveSummary: expect.any(Object),
      datePlanningSummary: expect.any(Object),
    })
  })

  it('adapta una mesa del examEngine al contrato que consume la UI actual', () => {
    const teacherNameById = new Map([
      ['doc-1', 'Ana Titular'],
      ['doc-2', 'Bruno Vocal'],
      ['doc-3', 'Carla Vocal'],
    ])
    const subjectById = new Map([
      ['subject-1', { codigo: 'ING1', nombreMateria: 'Lengua Inglesa I' }],
    ])

    const row = adaptExamEngineMesaToCronograma({
      id: 'mesa-engine-1',
      materiaId: 'subject-1',
      materia: 'Lengua Inglesa I',
      carrera: 'Profesorado de Ingles',
      fecha: '2026-07-27',
      llamado: 'PRIMER_LLAMADO',
      titularId: 'doc-1',
      vocal1Id: 'doc-2',
      vocal2Id: 'doc-3',
      warnings: [{ code: 'TEST_WARNING', message: 'Revisar dato' }],
    }, 0, { teacherNameById, subjectById })

    expect(row).toMatchObject({
      id: 'mesa-engine-1',
      mesa: 1,
      materia: 'ING1',
      nombreMateria: 'Lengua Inglesa I',
      fechaIso: '2026-07-27',
      fecha: '27/07/2026',
      profesorTitular: 'Ana Titular',
      vocal1: 'Bruno Vocal',
      vocal2: 'Carla Vocal',
      aula: 'A definir',
      estado: 'pendiente',
      exam_call: 'first',
      llamadoNumero: 1,
      observacionManual: 'Revisar dato',
    })
  })

  it('genera mesas especiales seleccionadas con el nuevo motor', () => {
    const result = generateCronogramaWithExamEngine(createWorkspaceInput({
      examType: 'special',
      fechaInicio: '2026-07-27',
      fechaFin: '2026-07-27',
      selectedSpecialSubjectKeys: ['profesorado de ingles::ing1'],
    }))

    expect(result.cronograma).toHaveLength(1)
    expect(result.cronograma[0]).toMatchObject({
      materia: 'ING1',
      exam_type: 'special',
      exam_call: 'special',
      llamado: 'Llamado especial',
      llamadoNumero: 1,
    })
  })
})
