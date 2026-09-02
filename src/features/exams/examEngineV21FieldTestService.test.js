import { describe, expect, it } from 'vitest'
import {
  buildDataWarnings,
  buildExamCallConfigFromForm,
  buildExamEngineV21DataFromWorkspace,
  buildPublishedCronogramaFromFinalTribunals,
  buildUnresolvedTitularRows,
  createConfirmedFinalReviewRows,
  createConfirmedTeacherReviewRows,
  createDefaultExamCallConfigForm,
  rowsToCsv,
  runDraftScheduleStep,
  runFinalReviewStep,
  runReviewedScheduleStep,
  runTribunalGenerationStep,
  summarizeTeacherReviewStatus,
  validateExamCallConfigForm,
} from './examEngineV21FieldTestService.js'

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

function workspaceSnapshot() {
  return {
    fechaInicio: '2026-11-27',
    fechaFin: '2026-12-02',
    docentes: [],
    docenteMateria: [
      {
        docente: 'Ana Titular',
        carrera: 'Profesorado de Geografia',
        materia_codigo: 'GEO4A',
        materia_nombre: 'Geografia Regional',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
      },
      {
        docente: 'Bruno Vocal',
        carrera: 'Profesorado de Geografia',
        materia_codigo: 'GEO4B',
        materia_nombre: 'Cartografia Aplicada',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
      },
    ],
    horariosDocentes: [
      ...scheduleRowsForTeacher('Ana Titular', 'GEO4A', 'Geografia Regional'),
      ...scheduleRowsForTeacher('Bruno Vocal', 'GEO4B', 'Cartografia Aplicada'),
      ...scheduleRowsForTeacher('Carla Vocal', 'GEO4A', 'Geografia Regional'),
      ...scheduleRowsForTeacher('Dario Vocal', 'GEO4B', 'Cartografia Aplicada'),
    ],
    planesEstudio: [
      {
        id: 'GEO3',
        carrera: 'Profesorado de Geografia',
        materia: 'GEO3',
        nombreMateria: 'Geografia Argentina',
        anio: 3,
        requiereMesa: false,
      },
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

describe('examEngineV21FieldTestService', () => {
  it('valida y construye examCallConfig desde el formulario', () => {
    const invalid = validateExamCallConfigForm({
      fechaInicio: '2026-12-02',
      fechaFin: '2026-11-27',
    })

    expect(invalid.ok).toBe(false)
    expect(invalid.errors).toEqual(expect.arrayContaining([
      'La fecha de fin debe ser posterior o igual a la fecha de inicio.',
    ]))

    const form = createDefaultExamCallConfigForm({
      fechaInicio: '2026-11-27',
      fechaFin: '2026-12-02',
    })
    const config = buildExamCallConfigFromForm(form)

    expect(config).toMatchObject({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 1,
      fechaInicio: '2026-11-27',
      fechaFin: '2026-12-02',
      usarDiasHabiles: true,
      carrerasIncluidas: 'ALL',
      estadoSalida: 'TEACHER_REVIEW',
    })
    expect(form).toMatchObject({
      alcanceCarrera: 'ALL',
      alcanceAnios: [],
    })
    expect(config.excepcionesPorCarrera).toEqual([])

    const configWithScope = buildExamCallConfigFromForm({
      ...form,
      alcanceCarrera: 'Profesorado de Geografia',
      alcanceAnios: [4],
    })
    expect(configWithScope).toMatchObject({
      carrerasIncluidas: ['Profesorado de Geografia'],
      excepcionesPorCarrera: [{
        carrera: 'Profesorado de Geografia',
        soloAnios: [4],
      }],
    })

    const configWithExclusions = buildExamCallConfigFromForm({
      ...form,
      excepcionesPorCarrera: [{
        carreras: ['Profesorado de Geografia', 'Profesorado de Quimica'],
        aniosExcluidos: [1, 4],
      }],
    })
    expect(configWithExclusions.excepcionesPorCarrera).toEqual([{
      carreras: ['Profesorado de Geografia', 'Profesorado de Quimica'],
      aniosExcluidos: [1, 4],
    }])
  })

  it('corre el circuito frontend por pasos con datos adaptados del workspace', () => {
    const form = createDefaultExamCallConfigForm({
      fechaInicio: '2026-11-27',
      fechaFin: '2026-12-02',
    })
    const examCallConfig = buildExamCallConfigFromForm(form)
    const data = buildExamEngineV21DataFromWorkspace({
      workspaceSnapshot: workspaceSnapshot(),
      examCallConfig,
    })

    expect(data.docentes.length).toBeGreaterThanOrEqual(4)
    expect(data.materias).toHaveLength(3)

    const draft = runDraftScheduleStep({
      docentes: data.docentes,
      materias: data.materias,
      examCallConfig,
      generatedAt: '2026-06-30',
    })

    expect(draft.draftResult.metadata.fechasHabiles).toEqual([
      '2026-11-27',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ])
    expect(draft.draftExport.rows).toHaveLength(2)
    draft.draftExport.rows.forEach((row) => {
      expect(row).not.toHaveProperty('vocal1')
      expect(row).not.toHaveProperty('vocal2')
    })

    const reviewed = runReviewedScheduleStep({
      originalDraftSchedule: draft.draftResult.draftSchedule,
      reviewedRows: createConfirmedTeacherReviewRows(draft.draftExport.rows),
      docentes: data.docentes,
      examCallConfig,
    })

    expect(reviewed.summary).toMatchObject({
      totalMesas: 2,
      listasParaTribunal: 2,
      excluidas: 0,
      pendientesRevision: 0,
    })

    const tribunals = runTribunalGenerationStep({
      reviewedSchedule: reviewed.reviewedResult.reviewedSchedule,
      docentes: data.docentes,
      materias: data.materias,
      teacherAssignments: data.teacherAssignments,
      examCallConfig,
      generatedAt: '2026-06-30',
    })

    expect(tribunals.tribunalResult.generatedTribunals).toHaveLength(2)
    expect(tribunals.tribunalReviewExport.rows).toHaveLength(2)

    const final = runFinalReviewStep({
      generatedTribunals: tribunals.tribunalResult.generatedTribunals,
      finalReviewedRows: createConfirmedFinalReviewRows(tribunals.tribunalReviewExport.rows),
      docentes: data.docentes,
      teacherAssignments: data.teacherAssignments,
      examCallConfig,
      generatedAt: '2026-06-30',
    })

    expect(final.summary).toMatchObject({
      confirmados: 2,
      bloqueados: 0,
      pendientes: 0,
    })
    expect(final.officialExport.rows).toHaveLength(2)
    expect(Array.isArray(final.finalAlertsExport.rows)).toBe(true)
  })

  it('mantiene rangos independientes para dos llamados regulares', () => {
    const form = {
      ...createDefaultExamCallConfigForm(),
      cantidadLlamados: 2,
      fechaInicio: '2026-07-30',
      fechaFin: '2026-07-31',
      fechaInicioSegundoLlamado: '2026-08-10',
      fechaFinSegundoLlamado: '2026-08-12',
    }
    const examCallConfig = buildExamCallConfigFromForm(form)
    const data = buildExamEngineV21DataFromWorkspace({
      workspaceSnapshot: workspaceSnapshot(),
      examCallConfig,
    })
    const draft = runDraftScheduleStep({
      docentes: data.docentes,
      materias: data.materias,
      examCallConfig,
    })
    const firstDates = draft.draftExport.rows
      .filter((row) => row.llamado === 'PRIMER_LLAMADO')
      .map((row) => row.fecha)
    const secondDates = draft.draftExport.rows
      .filter((row) => row.llamado === 'SEGUNDO_LLAMADO')
      .map((row) => row.fecha)

    expect(firstDates.every((date) => date >= '2026-07-30' && date <= '2026-07-31')).toBe(true)
    expect(secondDates.every((date) => date >= '2026-08-10' && date <= '2026-08-12')).toBe(true)
  })

  it('expone las correlatividades adaptadas para la sesion interactiva de tribunales', () => {
    const snapshot = workspaceSnapshot()
    snapshot.correlatividades = [{
      carrera: 'Profesorado de Geografia',
      materia: 'GEO4B',
      nombreMateria: 'Cartografia Aplicada',
      correlativas: ['GEO4A'],
    }]
    const examCallConfig = buildExamCallConfigFromForm(createDefaultExamCallConfigForm())
    const data = buildExamEngineV21DataFromWorkspace({
      workspaceSnapshot: snapshot,
      examCallConfig,
    })

    expect(data.correlatividades).toEqual([{
      carreraId: expect.any(String),
      carrera: 'Profesorado de Geografia',
      materia: 'GEO4B',
      nombreMateria: 'Cartografia Aplicada',
      correlativas: ['GEO4A'],
    }])
  })

  it('cruza el precronograma publicado con el estado real de confirmacion docente por rol', () => {
    const reviewRows = [
      { draftMesaId: 'draft:1', materiaMesa: 'Didactica General', carrera: 'Profesorado de Historia', fecha: '2026-08-10' },
      { draftMesaId: 'draft:2', materiaMesa: 'Historia Antigua', carrera: 'Profesorado de Historia', fecha: '2026-08-11' },
    ]
    const assignmentRows = [
      { exam_table_id: 'draft:1', role: 'TITULAR', confirmation_status: 'confirmed', teacher_notes: '', confirmed_at: '2026-08-01', metadata: { titular: 'Ana Titular' } },
      { exam_table_id: 'draft:1', role: 'VOCAL_1', confirmation_status: 'objected', teacher_notes: 'No puedo ese dia', confirmed_at: null, metadata: { vocal1: 'Bruno Vocal' } },
      { exam_table_id: 'draft:2', role: 'TITULAR', confirmation_status: 'pending', teacher_notes: '', confirmed_at: null, metadata: { titular: 'Carla Titular' } },
    ]

    const summary = summarizeTeacherReviewStatus(reviewRows, assignmentRows)

    expect(summary.mesas).toEqual([
      expect.objectContaining({
        draftMesaId: 'draft:1',
        titular: expect.objectContaining({ nombre: 'Ana Titular', status: 'confirmed', notas: '', confirmedAt: '2026-08-01' }),
        vocal1: expect.objectContaining({ nombre: 'Bruno Vocal', status: 'objected', notas: 'No puedo ese dia', confirmedAt: null }),
        vocal2: null,
      }),
      expect.objectContaining({
        draftMesaId: 'draft:2',
        titular: expect.objectContaining({ nombre: 'Carla Titular', status: 'pending', notas: '', confirmedAt: null }),
        vocal1: null,
        vocal2: null,
      }),
    ])
    expect(summary.counts).toEqual({ confirmed: 1, pending: 1, objected: 1, total: 3 })
  })

  it('mesas sin ninguna asignacion publicada quedan con los tres roles en null y no suman al conteo', () => {
    const summary = summarizeTeacherReviewStatus(
      [{ draftMesaId: 'draft:sin-publicar', materiaMesa: 'Sin publicar', carrera: 'X', fecha: '2026-08-10' }],
      [],
    )

    expect(summary.mesas).toEqual([
      expect.objectContaining({ titular: null, vocal1: null, vocal2: null }),
    ])
    expect(summary.counts).toEqual({ confirmed: 0, pending: 0, objected: 0, total: 0 })
  })

  it('serializa filas normalizadas como CSV descargable', () => {
    const csv = rowsToCsv([
      { fecha: '2026-11-27', materiaMesa: 'Geografia, Regional' },
    ], [
      { key: 'fecha' },
      { key: 'materiaMesa' },
    ])

    expect(csv).toBe('fecha,materiaMesa\n2026-11-27,"Geografia, Regional"')
  })

  it('convierte tribunales finales confirmados en cronograma publicable para portales', () => {
    const cronograma = buildPublishedCronogramaFromFinalTribunals([{
      id: 'mesa-ing06',
      draftMesaId: 'mesa-ing06',
      carrera: 'PROFESORADO DE INGLES',
      anio: 1,
      materiaId: 'ING06',
      materiaMesa: 'FONETICA Y FONOLOGIA INGLESA I',
      fechaSugerida: '2026-08-26',
      inicio: '19:00',
      fin: '21:00',
      titular: 'CORBALAN MIGUEL',
      titularId: 'doc-corbalan',
      vocal1: 'VILLAGRA MIGUEL',
      vocal1Id: 'doc-villagra',
      vocal2: 'DONADIO MYRIAM',
      vocal2Id: 'doc-donadio',
      estadoFinal: 'FINAL_CONFIRMED',
      llamado: 'PRIMER_LLAMADO',
    }, {
      id: 'mesa-bloqueada',
      carrera: 'PROFESORADO DE INGLES',
      materiaId: 'ING07',
      materiaMesa: 'LECTURA, ESCRITURA Y ORALIDAD',
      fechaSugerida: '2026-08-28',
      estadoFinal: 'FINAL_BLOCKED_BY_VALIDATION',
    }], {
      generatedAt: '2026-08-21T22:30:00.000Z',
    })

    expect(cronograma).toEqual([
      expect.objectContaining({
        id: 'exam-engine-v21-mesa-ing06-2026-08-26',
        carrera: 'PROFESORADO DE INGLES',
        materia: 'ING06',
        nombreMateria: 'FONETICA Y FONOLOGIA INGLESA I',
        fechaIso: '2026-08-26',
        fecha: '26/08/2026',
        inicio: '19:00',
        estado: 'confirmada',
        estadoFinal: 'FINAL_CONFIRMED',
        exam_call: 'first',
        llamado: 'Primer llamado',
        inscription_mode: 'student_self_service',
      }),
    ])
  })

  it('usa etiquetas de columna cuando estan disponibles', () => {
    const csv = rowsToCsv([
      { estadoVisible: 'Revision docente', estado: 'TEACHER_REVIEW' },
    ], [
      { key: 'estadoVisible', label: 'Estado' },
      { key: 'estado', label: 'Estado interno' },
    ])

    expect(csv).toBe('Estado,Estado interno\nRevision docente,TEACHER_REVIEW')
  })

  it('detalla motivos y ejemplos cuando faltan titulares', () => {
    const warnings = buildDataWarnings({
      materias: [
        {
          carrera: 'Laboratorio',
          materia: 'LAB1',
          nombreMateria: 'Quimica',
          titularId: '',
          requiereMesaSource: 'sinHorarioDocente',
        },
        {
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          nombreMateria: 'Lengua Inglesa I',
          titularId: '',
          requiereMesaSource: 'sinHorarioDocente',
        },
      ],
      draftResult: {
        summary: { totalSinTitular: 1 },
        draftSchedule: [{
          metadata: {
            sourceSubjectKey: 'laboratorio::lab1',
            sourceMateria: {
              carrera: 'Laboratorio',
              materia: 'LAB1',
            },
          },
        }],
      },
    })

    expect(warnings).toEqual(expect.arrayContaining([
      'Hay 1 mesas sin titular.',
      'Diagnostico de titulares: sinHorarioDocente: 1.',
      'Ejemplos sin titular: Laboratorio / LAB1 / Quimica.',
    ]))
    expect(warnings.join(' ')).not.toContain('ING1')
  })

  it('muestra materias sin titular solo si estan afectadas en el precronograma', () => {
    const rows = buildUnresolvedTitularRows([
      {
        carrera: 'Profesorado de Ingles',
        materia: 'ING1',
        nombreMateria: 'Lengua Inglesa I',
        titularId: '',
        requiereMesaSource: 'sinHorarioDocente',
      },
      {
        carrera: 'Profesorado de Ingles',
        materia: 'ING2',
        nombreMateria: 'Lengua Inglesa II',
        titularId: '',
        requiereMesaSource: 'sinHorarioDocente',
      },
      {
        carrera: 'Profesorado de Quimica',
        materia: 'ING1',
        nombreMateria: 'Codigo compartido en otra carrera',
        titularId: '',
        requiereMesaSource: 'sinHorarioDocente',
      },
    ], {
      draftSchedule: [{
        metadata: {
          sourceSubjectKey: 'profesorado de ingles::ing1',
          sourceMateria: {
            carrera: 'Profesorado de Ingles',
            materia: 'ING1',
          },
        },
      }],
    })

    expect(rows).toEqual([
      expect.objectContaining({
        carrera: 'Profesorado de Ingles',
        codigo: 'ING1',
      }),
    ])
  })
})
