import { describe, expect, it } from 'vitest'
import { buildExamEngineEfficiencySummary } from './efficiencySummary.js'

function inputFixture() {
  return {
    materias: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    docentes: [{ id: 'd1' }, { id: 'd2' }],
    fechasDisponibles: [{ fecha: '2026-07-27' }, { fecha: '2026-07-28' }],
    config: {
      cantidadLlamados: 1,
      tipoPeriodo: 'REGULAR',
    },
    options: {
      compact: 'safe',
    },
  }
}

function contractFixture(overrides = {}) {
  const planned = [
    {
      id: 'mesa-1',
      fecha: '2026-07-27',
      titular: { id: 'd1', nombre: 'Docente Real Uno' },
      vocales: [{ id: 'd2', nombre: 'Docente Real Dos' }, { id: 'd3', nombre: 'Docente Real Tres' }],
    },
    {
      id: 'mesa-2',
      fecha: '2026-07-28',
      titular: { id: 'd1', nombre: 'Docente Real Uno' },
      vocales: [{ id: 'd2', nombre: 'Docente Real Dos' }],
    },
  ]
  const unassigned = [
    {
      id: 'mesa-3',
      materia: 'Materia Secreta',
      carrera: 'Carrera A',
      estado: 'SIN_FECHA',
      vocales: [],
    },
  ]

  return {
    phase: 'warning',
    status: 'WARNING',
    filteredDto: {
      uiTables: {
        planned,
        unassigned,
      },
    },
    uiDto: {
      uiSummary: {
        totalPlanned: 2,
        totalUnassigned: 1,
        totalMesas: 3,
        totalCriticalErrors: 1,
        totalWarnings: 2,
        totalPendingManualReview: 1,
        totalCompactadas: 1,
        cantidadLlamados: 1,
        tipoPeriodo: 'REGULAR',
        compactMode: 'safe',
      },
      uiTeacherSummary: [
        { docente: 'Docente Real Uno', enLimite: true, excedido: false },
        { docente: 'Docente Real Dos', enLimite: false, excedido: true },
      ],
      uiCareerSummary: [
        { carrera: 'Carrera A', totalMesas: 2, errores: 1, advertencias: 2, sinFecha: 1 },
        { carrera: 'Carrera B', totalMesas: 1, errores: 0, advertencias: 1, sinFecha: 0 },
      ],
      uiCallSummary: [
        { llamado: 'PRIMER_LLAMADO', totalMesas: 3, errores: 1, advertencias: 2, sinFecha: 1 },
      ],
      uiAlerts: [
        { code: 'TITULAR_REQUIRED' },
        { code: 'SIN_FECHA_VALIDA' },
        { code: 'VOCAL_SIN_AFINIDAD' },
        { code: 'DOCENTE_EXCEDE_LIMITE_VOCALIAS' },
        { code: 'CORRELATIVIDAD_CONFLICTIVA' },
        { code: 'TITULAR_NO_DISPONIBLE' },
      ],
    },
    errors: [{ code: 'TITULAR_REQUIRED' }],
    warnings: [{ code: 'VOCAL_SIN_AFINIDAD' }],
    payload: { secret: true },
    raw: { hidden: true },
    ...overrides,
  }
}

describe('buildExamEngineEfficiencySummary', () => {
  it('devuelve metricas principales sin datos sensibles', () => {
    const summary = buildExamEngineEfficiencySummary({
      contract: contractFixture(),
      input: inputFixture(),
      metadata: {
        snapshotId: 'snapshot-1',
        createdAt: '2026-06-05T12:00:00.000Z',
        institutionId: 'institution-1',
        readOnly: true,
      },
      durationMs: 42.7,
    })

    expect(summary).toMatchObject({
      snapshotId: 'snapshot-1',
      createdAt: '2026-06-05T12:00:00.000Z',
      institutionId: 'institution-1',
      phase: 'warning',
      status: 'WARNING',
      totalMaterias: 3,
      totalDocentes: 2,
      totalFechasDisponibles: 2,
      totalPlanned: 2,
      totalUnassigned: 1,
      totalMesas: 3,
      totalCriticalErrors: 1,
      totalWarnings: 2,
      totalPendingManualReview: 1,
      totalCompactadas: 1,
      cantidadLlamados: 1,
      tipoPeriodo: 'REGULAR',
      compactMode: 'safe',
      mesasCompletas: 1,
      mesasConUnVocal: 1,
      mesasSinTribunal: 1,
      mesasSinFecha: 1,
      docentesEnLimite: 1,
      docentesExcedidos: 1,
      readOnly: true,
      durationMs: 43,
    })
    expect(summary).not.toHaveProperty('payload')
    expect(summary).not.toHaveProperty('raw')
    expect(JSON.stringify(summary)).not.toContain('Docente Real')
    expect(JSON.stringify(summary)).not.toContain('Materia Secreta')
  })

  it('incluye carreras y llamados con mas problemas sin detalle sensible de mesas', () => {
    const summary = buildExamEngineEfficiencySummary({
      contract: contractFixture(),
      input: inputFixture(),
      metadata: { readOnly: true },
    })

    expect(summary.carrerasConMasProblemas[0]).toMatchObject({
      label: 'Carrera A',
      problemas: expect.any(Number),
      errores: 1,
      advertencias: 2,
      sinFecha: 1,
    })
    expect(summary.llamadosConMasProblemas[0]).toMatchObject({
      label: 'PRIMER_LLAMADO',
      problemas: expect.any(Number),
    })
  })

  it('clasifica como EFICIENTE con al menos 85% resuelto y sin criticos graves', () => {
    const contract = contractFixture({
      phase: 'success',
      status: 'OK',
      filteredDto: {
        uiTables: {
          planned: Array.from({ length: 9 }, (_, index) => ({
            id: `mesa-${index}`,
            fecha: '2026-07-27',
            titular: { id: 'd1' },
            vocales: [{ id: 'd2' }, { id: 'd3' }],
          })),
          unassigned: [{ id: 'mesa-10', titular: { id: 'd1' }, vocales: [{ id: 'd2' }, { id: 'd3' }] }],
        },
      },
      uiDto: {
        uiSummary: {
          totalPlanned: 9,
          totalUnassigned: 1,
          totalMesas: 10,
          totalCriticalErrors: 0,
          totalWarnings: 0,
        },
        uiTeacherSummary: [],
        uiCareerSummary: [],
        uiCallSummary: [],
        uiAlerts: [],
      },
      errors: [],
      warnings: [],
    })

    const summary = buildExamEngineEfficiencySummary({
      contract,
      input: inputFixture(),
      metadata: { readOnly: true },
    })

    expect(summary.conclusion).toBe('EFICIENTE')
    expect(summary.completionRate).toBeGreaterThanOrEqual(0.85)
  })

  it('clasifica como PARCIALMENTE EFICIENTE entre 60% y 84%', () => {
    const contract = contractFixture({
      filteredDto: {
        uiTables: {
          planned: Array.from({ length: 7 }, (_, index) => ({
            id: `mesa-${index}`,
            fecha: '2026-07-27',
            titular: { id: 'd1' },
            vocales: [{ id: 'd2' }, { id: 'd3' }],
          })),
          unassigned: Array.from({ length: 3 }, (_, index) => ({ id: `sin-${index}`, vocales: [] })),
        },
      },
      uiDto: {
        uiSummary: {
          totalPlanned: 7,
          totalUnassigned: 3,
          totalMesas: 10,
          totalCriticalErrors: 1,
          totalWarnings: 1,
        },
        uiTeacherSummary: [],
        uiCareerSummary: [],
        uiCallSummary: [],
        uiAlerts: [],
      },
    })

    const summary = buildExamEngineEfficiencySummary({
      contract,
      input: inputFixture(),
      metadata: { readOnly: true },
    })

    expect(summary.conclusion).toBe('PARCIALMENTE EFICIENTE')
    expect(summary.completionRate).toBeGreaterThanOrEqual(0.6)
  })

  it('clasifica como NO EFICIENTE con menos de 60% o muchos criticos', () => {
    const contract = contractFixture({
      filteredDto: {
        uiTables: {
          planned: [{ id: 'mesa-1', fecha: '2026-07-27', titular: { id: 'd1' }, vocales: [{ id: 'd2' }] }],
          unassigned: Array.from({ length: 9 }, (_, index) => ({ id: `sin-${index}`, vocales: [] })),
        },
      },
      uiDto: {
        uiSummary: {
          totalPlanned: 1,
          totalUnassigned: 9,
          totalMesas: 10,
          totalCriticalErrors: 4,
          totalWarnings: 1,
        },
        uiTeacherSummary: [],
        uiCareerSummary: [],
        uiCallSummary: [],
        uiAlerts: [],
      },
    })

    const summary = buildExamEngineEfficiencySummary({
      contract,
      input: inputFixture(),
      metadata: { readOnly: true },
    })

    expect(summary.conclusion).toBe('NO EFICIENTE')
  })

  it('genera recomendaciones institucionales', () => {
    const summary = buildExamEngineEfficiencySummary({
      contract: contractFixture(),
      input: inputFixture(),
      metadata: { readOnly: true },
    })

    expect(summary.recommendations).toEqual(expect.arrayContaining([
      'Cargar titulares faltantes.',
      'Cargar disponibilidad docente.',
      'Revisar correlatividades.',
      'Agregar fechas disponibles.',
      'Revisar vocales sin afinidad.',
      'Revisar compactaciones.',
      'Revisar docentes excedidos.',
    ]))
  })
})
