import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRegularPreviewInstitutionalFixture } from '../__fixtures__/regularPreviewInstitutionalFixture.js'
import { buildRegularExamEnginePreview } from '../preview/buildRegularExamEnginePreview.js'
import {
  applyRegularExamPreviewUiFilters,
  buildRegularExamPreviewUiFilters,
  buildRegularExamPreviewUiDto,
  validateRegularExamPreviewUiDto,
} from '../preview/index.js'

function technicalPreview(overrides = {}) {
  return {
    success: true,
    status: 'WARNING',
    plannedMesas: [
      {
        id: 'mesa-1',
        materiaId: 'MAT1',
        materia: 'Matematica I',
        carreraId: 'prof-mat',
        carrera: 'Profesorado de Matematica',
        anio: 1,
        llamado: 'PRIMER_LLAMADO',
        fecha: '2026-07-27',
        turno: 'NOCHE',
        estado: 'PLANIFICADA',
        titularId: 'doc-1',
        titularNombre: 'Ana Titular',
        vocal1Id: 'doc-2',
        vocal1Nombre: 'Bruno Vocal',
        vocal2Id: 'doc-3',
        vocal2Nombre: 'Carla Vocal',
        compactada: true,
        materiasAgrupadas: [
          {
            materiaId: 'MAT1',
            materia: 'Matematica I',
            carreraId: 'prof-mat',
            carrera: 'Profesorado de Matematica',
            anio: 1,
          },
        ],
      },
      {
        id: 'mesa-2',
        materiaId: 'MAT2',
        materia: 'Matematica II',
        carreraId: 'prof-mat',
        carrera: 'Profesorado de Matematica',
        anio: 2,
        llamado: 'PRIMER_LLAMADO',
        fecha: '2026-07-28',
        turno: 'NOCHE',
        estado: 'PLANIFICADA',
        titularId: 'doc-4',
        vocal1Id: 'doc-5',
      },
    ],
    unassignedMesas: [
      {
        id: 'mesa-3',
        materiaId: 'FIS1',
        materia: 'Fisica I',
        carreraId: 'tec-soft',
        carrera: 'Tecnicatura en Software',
        anio: 1,
        llamado: 'SEGUNDO_LLAMADO',
        estado: 'SIN_FECHA',
        reason: 'SIN_FECHA_VALIDA',
        detail: 'No hay fechas disponibles.',
      },
    ],
    summary: {},
    report: {
      status: 'WARNING',
      executiveSummary: {
        totalMesasPlanificadas: 2,
        totalMesasSinFecha: 1,
        totalErroresCriticos: 1,
        totalAdvertencias: 1,
        totalMesasCompletas: 1,
        totalMesasConUnVocal: 1,
        totalMesasSinTribunal: 0,
        totalCompactaciones: 1,
        compactMode: 'SAFE',
        cantidadLlamados: 2,
        tipoPeriodo: 'REGULAR',
      },
      criticalErrors: [
        {
          code: 'SIN_FECHA_VALIDA',
          severity: 'critical',
          message: 'No hay fecha valida.',
          mesaId: 'mesa-3',
          materia: 'Fisica I',
          carrera: 'Tecnicatura en Software',
          llamado: 'SEGUNDO_LLAMADO',
          stage: 'PLAN_TENTATIVE_DATES',
        },
        {
          code: 'SIN_FECHA_VALIDA',
          severity: 'critical',
          message: 'No hay fecha valida.',
          mesaId: 'mesa-3',
          materia: 'Fisica I',
          carrera: 'Tecnicatura en Software',
          llamado: 'SEGUNDO_LLAMADO',
          stage: 'PLAN_TENTATIVE_DATES',
        },
      ],
      warnings: [
        {
          code: 'MESA_CON_UN_VOCAL',
          severity: 'warning',
          message: 'Mesa con un vocal.',
          mesaId: 'mesa-2',
          materia: 'Matematica II',
          carrera: 'Profesorado de Matematica',
          llamado: 'PRIMER_LLAMADO',
          stage: 'VALIDATE_TRIBUNALS',
        },
      ],
      teachersSummary: [{ docenteId: 'doc-2', nombre: 'Bruno Vocal', vocalias: 1 }],
      careersSummary: [{ carrera: 'Profesorado de Matematica', totalMesas: 2 }],
      callsSummary: [{ llamado: 'PRIMER_LLAMADO', totalMesas: 2 }],
      pendingManualReview: [
        {
          type: 'MESA_CON_UN_VOCAL',
          code: 'MESA_CON_UN_VOCAL',
          mesaId: 'mesa-2',
          materia: 'Matematica II',
          severity: 'warning',
          reason: 'Mesa con un solo vocal.',
        },
      ],
      recommendations: ['Revisar mesa sin tribunal conformado.'],
      compactationSummary: {
        compactMode: 'SAFE',
        compactacionEjecutada: true,
        totalCompactaciones: 1,
      },
    },
    exportedReport: {
      metadata: { generatedAt: '2026-06-03T00:00:00.000Z' },
      raw: { shouldNotLeak: true },
    },
    exportValidation: { valid: true, errors: [], warnings: [] },
    errors: [],
    warnings: [],
    metadata: {
      cantidadLlamados: 2,
      tipoPeriodo: 'REGULAR',
      compactMode: 'SAFE',
      compactacionEjecutada: true,
    },
    ...overrides,
  }
}

const ROOT_KEYS = [
  'audit',
  'status',
  'success',
  'uiAlerts',
  'uiCallSummary',
  'uiCareerSummary',
  'uiPendingReview',
  'uiRecommendations',
  'uiSummary',
  'uiTables',
  'uiTeacherSummary',
]

const UI_SUMMARY_KEYS = [
  'cantidadLlamados',
  'compactMode',
  'compactacionEjecutada',
  'exportValid',
  'tipoPeriodo',
  'totalCompactadas',
  'totalCriticalErrors',
  'totalMesas',
  'totalPendingManualReview',
  'totalPlanned',
  'totalUnassigned',
  'totalWarnings',
]

const PLANNED_ROW_KEYS = [
  'alertLevel',
  'anio',
  'carrera',
  'carreraId',
  'compactada',
  'displayDate',
  'displayStatus',
  'errorsCount',
  'estado',
  'fecha',
  'id',
  'llamado',
  'materia',
  'materiaId',
  'materiasAgrupadas',
  'reviewRequired',
  'titular',
  'turno',
  'vocales',
  'warningsCount',
]

const UNASSIGNED_ROW_KEYS = [
  'alertLevel',
  'anio',
  'carrera',
  'carreraId',
  'errorsCount',
  'estado',
  'id',
  'llamado',
  'materia',
  'materiaId',
  'message',
  'reason',
  'reviewRequired',
  'suggestedAction',
  'warningsCount',
]

describe('examEngine preview: buildRegularExamPreviewUiDto', () => {
  it('genera uiSummary', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())

    expect(dto.uiSummary).toMatchObject({
      totalPlanned: 2,
      totalUnassigned: 1,
      totalMesas: 3,
      totalCriticalErrors: 1,
      totalWarnings: 1,
      totalPendingManualReview: 1,
      totalCompactadas: 1,
      cantidadLlamados: 2,
      tipoPeriodo: 'REGULAR',
      compactMode: 'SAFE',
      compactacionEjecutada: true,
      exportValid: true,
    })
  })

  it('genera uiTables.planned', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())

    expect(dto.uiTables.planned[0]).toMatchObject({
      id: 'mesa-1',
      materiaId: 'MAT1',
      materia: 'Matematica I',
      carreraId: 'prof-mat',
      carrera: 'Profesorado de Matematica',
      anio: 1,
      llamado: 'PRIMER_LLAMADO',
      fecha: '2026-07-27',
      displayDate: '2026-07-27',
      turno: 'NOCHE',
      estado: 'PLANIFICADA',
      displayStatus: 'Planificada',
      titular: { id: 'doc-1', nombre: 'Ana Titular' },
      compactada: true,
      alertLevel: 'OK',
      warningsCount: 0,
      errorsCount: 0,
      reviewRequired: false,
    })
    expect(dto.uiTables.planned[0].vocales).toEqual([
      { id: 'doc-2', nombre: 'Bruno Vocal', rol: 'VOCAL_1' },
      { id: 'doc-3', nombre: 'Carla Vocal', rol: 'VOCAL_2' },
    ])
    expect(dto.uiTables.planned[0].materiasAgrupadas).toEqual([
      {
        materiaId: 'MAT1',
        materia: 'Matematica I',
        carreraId: 'prof-mat',
        carrera: 'Profesorado de Matematica',
        anio: 1,
        llamado: 'PRIMER_LLAMADO',
      },
    ])
  })

  it('genera uiTables.unassigned', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())

    expect(dto.uiTables.unassigned[0]).toMatchObject({
      id: 'mesa-3',
      materiaId: 'FIS1',
      materia: 'Fisica I',
      carreraId: 'tec-soft',
      carrera: 'Tecnicatura en Software',
      anio: 1,
      llamado: 'SEGUNDO_LLAMADO',
      estado: 'SIN_FECHA',
      reason: 'SIN_FECHA_VALIDA',
      message: 'No hay fechas disponibles.',
      alertLevel: 'CRITICAL',
      errorsCount: 1,
      reviewRequired: true,
    })
  })

  it('genera uiAlerts deduplicadas', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())

    expect(dto.uiAlerts).toHaveLength(2)
    expect(dto.uiAlerts.map((alert) => alert.code)).toEqual([
      'SIN_FECHA_VALIDA',
      'MESA_CON_UN_VOCAL',
    ])
  })

  it('incluye audit sin raw', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())

    expect(dto.audit).toMatchObject({
      exportedReport: {
        metadata: { generatedAt: '2026-06-03T00:00:00.000Z' },
      },
      exportValidation: { valid: true, errors: [], warnings: [] },
      metadata: {
        cantidadLlamados: 2,
        tipoPeriodo: 'REGULAR',
      },
    })
    expect(dto.audit.exportedReport).not.toHaveProperty('raw')
  })

  it('calcula alertLevel por mesa', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())

    expect(dto.uiTables.planned.find((mesa) => mesa.id === 'mesa-1').alertLevel).toBe('OK')
    expect(dto.uiTables.planned.find((mesa) => mesa.id === 'mesa-2').alertLevel).toBe('WARNING')
    expect(dto.uiTables.unassigned.find((mesa) => mesa.id === 'mesa-3').alertLevel).toBe('CRITICAL')
  })

  it('marca reviewRequired cuando corresponde', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())

    expect(dto.uiTables.planned.find((mesa) => mesa.id === 'mesa-1').reviewRequired).toBe(false)
    expect(dto.uiTables.planned.find((mesa) => mesa.id === 'mesa-2').reviewRequired).toBe(true)
    expect(dto.uiTables.unassigned.find((mesa) => mesa.id === 'mesa-3').reviewRequired).toBe(true)
  })

  it('funciona con regularPreviewInstitutionalFixture', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const dto = buildRegularExamPreviewUiDto(preview)

    expect(dto).toMatchObject({
      success: expect.any(Boolean),
      status: expect.any(String),
      uiSummary: expect.any(Object),
      uiTables: {
        planned: expect.any(Array),
        unassigned: expect.any(Array),
      },
      uiAlerts: expect.any(Array),
      uiTeacherSummary: expect.any(Array),
      uiCareerSummary: expect.any(Array),
      uiCallSummary: expect.any(Array),
      uiPendingReview: expect.any(Array),
      uiRecommendations: expect.any(Array),
      audit: expect.any(Object),
    })
    expect(dto.uiTables.planned.length).toBeGreaterThan(0)
    expect(dto.uiSummary.totalMesas).toBe(dto.uiSummary.totalPlanned + dto.uiSummary.totalUnassigned)
    expect(dto.audit.exportedReport).not.toHaveProperty('raw')
  })

  it('mantiene contrato estable de raiz con fixture institucional', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const dto = buildRegularExamPreviewUiDto(preview)

    expect(Object.keys(dto).sort()).toEqual(ROOT_KEYS)
  })

  it('mantiene contrato estable de uiSummary con fixture institucional', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const dto = buildRegularExamPreviewUiDto(preview)

    expect(Object.keys(dto.uiSummary).sort()).toEqual(UI_SUMMARY_KEYS)
    expect(dto.uiSummary).toMatchObject({
      totalPlanned: expect.any(Number),
      totalUnassigned: expect.any(Number),
      totalMesas: expect.any(Number),
      totalCriticalErrors: expect.any(Number),
      totalWarnings: expect.any(Number),
      totalPendingManualReview: expect.any(Number),
      totalCompactadas: expect.any(Number),
      compactacionEjecutada: expect.any(Boolean),
      exportValid: true,
    })
  })

  it('mantiene contrato estable de uiTables con fixture institucional', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const dto = buildRegularExamPreviewUiDto(preview)

    expect(Object.keys(dto.uiTables).sort()).toEqual(['planned', 'unassigned'])
    expect(dto.uiTables.planned).toEqual(expect.any(Array))
    expect(dto.uiTables.unassigned).toEqual(expect.any(Array))
  })

  it('mantiene contrato estable de filas planned con fixture institucional', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const dto = buildRegularExamPreviewUiDto(preview)

    expect(dto.uiTables.planned.length).toBeGreaterThan(0)
    dto.uiTables.planned.forEach((row) => {
      expect(Object.keys(row).sort()).toEqual(PLANNED_ROW_KEYS)
      expect(row).toMatchObject({
        id: expect.any(String),
        materia: expect.any(String),
        carrera: expect.any(String),
        llamado: expect.any(String),
        displayDate: expect.any(String),
        displayStatus: expect.any(String),
        titular: expect.any(Object),
        vocales: expect.any(Array),
        compactada: expect.any(Boolean),
        materiasAgrupadas: expect.any(Array),
        alertLevel: expect.stringMatching(/^(OK|WARNING|CRITICAL)$/),
        warningsCount: expect.any(Number),
        errorsCount: expect.any(Number),
        reviewRequired: expect.any(Boolean),
      })
      expect(Object.keys(row.titular).sort()).toEqual(['id', 'nombre'])
      row.vocales.forEach((vocal) => {
        expect(Object.keys(vocal).sort()).toEqual(['id', 'nombre', 'rol'])
      })
    })
  })

  it('mantiene contrato estable de filas unassigned con fixture institucional cuando existen pendientes', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const dto = buildRegularExamPreviewUiDto(preview)

    dto.uiTables.unassigned.forEach((row) => {
      expect(Object.keys(row).sort()).toEqual(UNASSIGNED_ROW_KEYS)
      expect(row).toMatchObject({
        id: expect.any(String),
        materia: expect.any(String),
        carrera: expect.any(String),
        estado: expect.any(String),
        message: expect.any(String),
        alertLevel: expect.stringMatching(/^(OK|WARNING|CRITICAL)$/),
        warningsCount: expect.any(Number),
        errorsCount: expect.any(Number),
        reviewRequired: true,
        suggestedAction: expect.any(String),
      })
    })
  })

  it('mantiene audit sin raw y exportValidation valido con fixture institucional', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const dto = buildRegularExamPreviewUiDto(preview)

    expect(dto.audit).toEqual({
      exportedReport: expect.any(Object),
      exportValidation: expect.objectContaining({ valid: true }),
      metadata: expect.any(Object),
    })
    expect(dto.audit.exportedReport).not.toHaveProperty('raw')
    expect(dto.audit.exportValidation.valid).toBe(true)
  })

  it('validateRegularExamPreviewUiDto acepta DTO valido', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())

    expect(validateRegularExamPreviewUiDto(dto)).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    })
  })

  it('validateRegularExamPreviewUiDto falla si falta uiSummary', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    delete dto.uiSummary

    const result = validateRegularExamPreviewUiDto(dto)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_ROOT_FIELD', path: 'dto.uiSummary' }),
    ]))
  })

  it('validateRegularExamPreviewUiDto falla si falta uiTables', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    delete dto.uiTables

    const result = validateRegularExamPreviewUiDto(dto)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_ROOT_FIELD', path: 'dto.uiTables' }),
      expect.objectContaining({ code: 'INVALID_UI_TABLES', path: 'uiTables' }),
    ]))
  })

  it('validateRegularExamPreviewUiDto falla con planned row incompleta', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    delete dto.uiTables.planned[0].materia

    const result = validateRegularExamPreviewUiDto(dto)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MISSING_PLANNED_ROW_FIELD',
        path: 'uiTables.planned[0].materia',
      }),
    ]))
  })

  it('validateRegularExamPreviewUiDto falla con audit.raw', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    dto.audit.raw = { leak: true }

    const result = validateRegularExamPreviewUiDto(dto)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AUDIT_RAW_NOT_ALLOWED', path: 'audit.raw' }),
    ]))
  })

  it('validateRegularExamPreviewUiDto falla con funcion', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    dto.uiSummary.compute = () => 1

    const result = validateRegularExamPreviewUiDto(dto)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FUNCTION_VALUE', path: 'dto.uiSummary.compute' }),
    ]))
  })

  it('validateRegularExamPreviewUiDto falla con undefined', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    dto.uiSummary.totalPlanned = undefined

    const result = validateRegularExamPreviewUiDto(dto)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNDEFINED_VALUE', path: 'dto.uiSummary.totalPlanned' }),
    ]))
  })

  it('validateRegularExamPreviewUiDto funciona con regularPreviewInstitutionalFixture', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const dto = buildRegularExamPreviewUiDto(preview)

    expect(validateRegularExamPreviewUiDto(dto)).toMatchObject({
      valid: true,
      errors: [],
    })
  })

  it('no muta input', () => {
    const preview = technicalPreview()
    const snapshot = structuredClone(preview)

    buildRegularExamPreviewUiDto(preview)

    expect(preview).toEqual(snapshot)
  })

  it('validateRegularExamPreviewUiDto no muta input', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const snapshot = structuredClone(dto)

    validateRegularExamPreviewUiDto(dto)

    expect(dto).toEqual(snapshot)
  })

  it('buildRegularExamPreviewUiFilters genera filtros desde fixture institucional', () => {
    const preview = buildRegularExamEnginePreview(buildRegularPreviewInstitutionalFixture())
    const dto = buildRegularExamPreviewUiDto(preview)
    const filters = buildRegularExamPreviewUiFilters(dto)

    expect(filters).toMatchObject({
      carreras: expect.any(Array),
      llamados: expect.any(Array),
      estados: expect.any(Array),
      alertLevels: expect.any(Array),
      anios: expect.any(Array),
      turnos: expect.any(Array),
      docentes: expect.any(Array),
      compactadas: expect.any(Array),
      revisionManual: expect.any(Array),
      conFecha: expect.any(Array),
    })
    expect(filters.carreras.length).toBeGreaterThan(0)
    expect(filters.llamados.length).toBeGreaterThan(0)
    expect(filters.docentes.length).toBeGreaterThan(0)
  })

  it('buildRegularExamPreviewUiFilters deduplica carreras', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const filters = buildRegularExamPreviewUiFilters(dto)
    const matematica = filters.carreras.find((option) => option.value === 'Profesorado de Matematica')

    expect(filters.carreras.filter((option) => option.value === 'Profesorado de Matematica')).toHaveLength(1)
    expect(matematica.count).toBe(3)
  })

  it('buildRegularExamPreviewUiFilters deduplica llamados', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const filters = buildRegularExamPreviewUiFilters(dto)
    const primero = filters.llamados.find((option) => option.value === 'PRIMER_LLAMADO')
    const segundo = filters.llamados.find((option) => option.value === 'SEGUNDO_LLAMADO')

    expect(filters.llamados.filter((option) => option.value === 'PRIMER_LLAMADO')).toHaveLength(1)
    expect(primero.count).toBe(3)
    expect(segundo.count).toBe(2)
  })

  it('buildRegularExamPreviewUiFilters incluye docentes titulares y vocales', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const filters = buildRegularExamPreviewUiFilters(dto)
    const docenteIds = filters.docentes.map((option) => option.value)

    expect(docenteIds).toEqual(expect.arrayContaining([
      'doc-1',
      'doc-2',
      'doc-3',
      'doc-4',
      'doc-5',
    ]))
  })

  it('buildRegularExamPreviewUiFilters contabiliza counts', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const filters = buildRegularExamPreviewUiFilters(dto)

    expect(filters.estados.find((option) => option.value === 'PLANIFICADA').count).toBe(2)
    expect(filters.estados.find((option) => option.value === 'SIN_FECHA').count).toBe(1)
    expect(filters.alertLevels.find((option) => option.value === 'OK').count).toBe(1)
    expect(filters.alertLevels.find((option) => option.value === 'WARNING').count).toBe(2)
    expect(filters.alertLevels.find((option) => option.value === 'CRITICAL').count).toBe(2)
  })

  it('buildRegularExamPreviewUiFilters incluye compactadas, revisionManual y conFecha', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const filters = buildRegularExamPreviewUiFilters(dto)

    expect(filters.compactadas).toEqual([
      { value: true, label: 'Compactadas', count: 1 },
      { value: false, label: 'No compactadas', count: 2 },
    ])
    expect(filters.revisionManual).toEqual([
      { value: true, label: 'Requieren revision', count: 2 },
      { value: false, label: 'Sin revision requerida', count: 1 },
    ])
    expect(filters.conFecha).toEqual([
      { value: true, label: 'Con fecha', count: 2 },
      { value: false, label: 'Sin fecha', count: 1 },
    ])
  })

  it('buildRegularExamPreviewUiFilters funciona con DTO vacio', () => {
    expect(buildRegularExamPreviewUiFilters({})).toEqual({
      carreras: [],
      llamados: [],
      estados: [],
      alertLevels: [],
      anios: [],
      turnos: [],
      docentes: [],
      compactadas: [
        { value: true, label: 'Compactadas', count: 0 },
        { value: false, label: 'No compactadas', count: 0 },
      ],
      revisionManual: [
        { value: true, label: 'Requieren revision', count: 0 },
        { value: false, label: 'Sin revision requerida', count: 0 },
      ],
      conFecha: [
        { value: true, label: 'Con fecha', count: 0 },
        { value: false, label: 'Sin fecha', count: 0 },
      ],
    })
  })

  it('buildRegularExamPreviewUiFilters no muta input', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const snapshot = structuredClone(dto)

    buildRegularExamPreviewUiFilters(dto)

    expect(dto).toEqual(snapshot)
  })

  it('applyRegularExamPreviewUiFilters sin filtros devuelve todo', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, {})

    expect(result.uiTables.planned).toHaveLength(2)
    expect(result.uiTables.unassigned).toHaveLength(1)
    expect(result.uiAlerts).toHaveLength(2)
    expect(result.filteredSummary).toEqual({
      plannedVisible: 2,
      unassignedVisible: 1,
      alertsVisible: 2,
      totalVisible: 3,
    })
  })

  it('applyRegularExamPreviewUiFilters filtra por carrera', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, { carreras: ['Tecnicatura en Software'] })

    expect(result.uiTables.planned).toHaveLength(0)
    expect(result.uiTables.unassigned.map((row) => row.id)).toEqual(['mesa-3'])
    expect(result.uiAlerts.map((alert) => alert.mesaId)).toEqual(['mesa-3'])
  })

  it('applyRegularExamPreviewUiFilters filtra por llamado', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, { llamados: ['SEGUNDO_LLAMADO'] })

    expect(result.uiTables.planned).toHaveLength(0)
    expect(result.uiTables.unassigned.map((row) => row.id)).toEqual(['mesa-3'])
    expect(result.uiAlerts.map((alert) => alert.llamado)).toEqual(['SEGUNDO_LLAMADO'])
  })

  it('applyRegularExamPreviewUiFilters filtra por estado', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, { estados: ['SIN_FECHA'] })

    expect(result.uiTables.planned).toHaveLength(0)
    expect(result.uiTables.unassigned.map((row) => row.estado)).toEqual(['SIN_FECHA'])
  })

  it('applyRegularExamPreviewUiFilters filtra por alertLevel', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, { alertLevels: ['WARNING'] })

    expect(result.uiTables.planned.map((row) => row.id)).toEqual(['mesa-2'])
    expect(result.uiTables.unassigned).toHaveLength(0)
    expect(result.uiAlerts.map((alert) => alert.code)).toEqual(['MESA_CON_UN_VOCAL'])
  })

  it('applyRegularExamPreviewUiFilters filtra por docente', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, { docentes: ['doc-2'] })

    expect(result.uiTables.planned.map((row) => row.id)).toEqual(['mesa-1'])
    expect(result.uiTables.unassigned).toHaveLength(0)
  })

  it('applyRegularExamPreviewUiFilters filtra por compactada', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, { compactadas: [true] })

    expect(result.uiTables.planned.map((row) => row.id)).toEqual(['mesa-1'])
    expect(result.uiTables.unassigned).toHaveLength(0)
  })

  it('applyRegularExamPreviewUiFilters filtra por revision manual', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, { revisionManual: [true] })

    expect(result.uiTables.planned.map((row) => row.id)).toEqual(['mesa-2'])
    expect(result.uiTables.unassigned.map((row) => row.id)).toEqual(['mesa-3'])
  })

  it('applyRegularExamPreviewUiFilters filtra por conFecha', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, { conFecha: [false] })

    expect(result.uiTables.planned).toHaveLength(0)
    expect(result.uiTables.unassigned.map((row) => row.id)).toEqual(['mesa-3'])
  })

  it('applyRegularExamPreviewUiFilters search encuentra materia carrera y docente', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())

    expect(applyRegularExamPreviewUiFilters(dto, { search: 'MAT1' }).uiTables.planned.map((row) => row.id)).toEqual(['mesa-1'])
    expect(applyRegularExamPreviewUiFilters(dto, { search: 'Software' }).uiTables.unassigned.map((row) => row.id)).toEqual(['mesa-3'])
    expect(applyRegularExamPreviewUiFilters(dto, { search: 'Carla' }).uiTables.planned.map((row) => row.id)).toEqual(['mesa-1'])
  })

  it('applyRegularExamPreviewUiFilters filtra uiAlerts', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const result = applyRegularExamPreviewUiFilters(dto, { search: 'un vocal' })

    expect(result.uiAlerts).toHaveLength(1)
    expect(result.uiAlerts[0]).toMatchObject({
      code: 'MESA_CON_UN_VOCAL',
      mesaId: 'mesa-2',
    })
  })

  it('applyRegularExamPreviewUiFilters no muta input', () => {
    const dto = buildRegularExamPreviewUiDto(technicalPreview())
    const snapshot = structuredClone(dto)

    applyRegularExamPreviewUiFilters(dto, { carreras: ['Tecnicatura en Software'], search: 'fecha' })

    expect(dto).toEqual(snapshot)
  })

  it('applyRegularExamPreviewUiFilters funciona con DTO vacio', () => {
    expect(applyRegularExamPreviewUiFilters({}, {})).toEqual({
      uiTables: {
        planned: [],
        unassigned: [],
      },
      uiAlerts: [],
      filteredSummary: {
        plannedVisible: 0,
        unassignedVisible: 0,
        alertsVisible: 0,
        totalVisible: 0,
      },
    })
  })

  it('no importa motor viejo/UI', () => {
    const source = readFileSync(join(process.cwd(), 'src/utils/examEngine/preview/buildRegularExamPreviewUiDto.js'), 'utf8')
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const legacy = ['legacy', 'Adapter'].join('')
    const uiComponents = ['compo', 'nents'].join('')
    const uiHooks = ['ho', 'oks'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(legacy)
    expect(source).not.toContain(uiComponents)
    expect(source).not.toContain(uiHooks)
  })
})
