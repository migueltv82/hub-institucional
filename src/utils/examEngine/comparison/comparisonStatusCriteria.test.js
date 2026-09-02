import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRegularExamComparisonAuditSummary } from './buildRegularExamComparisonAuditSummary.js'
import { buildRegularExamComparisonReport } from './buildRegularExamComparisonReport.js'

function clone(value) {
  return structuredClone(value)
}

const baseComparison = {
  legacySummary: {
    totalMesas: 3,
    totalSinTribunal: 0,
    totalSinFecha: 0,
    totalCompactadas: 0,
  },
  newSummary: {
    totalMesas: 3,
    totalSinTribunal: 0,
    totalSinFecha: 0,
    totalCompactadas: 0,
  },
  diffs: [],
  unmatchedLegacyMesas: [],
  unmatchedNewMesas: [],
  warnings: [],
  recommendations: [],
  metadata: {
    source: 'comparisonStatusCriteria.controlled',
  },
}

function buildComparison(overrides = {}) {
  return {
    ...clone(baseComparison),
    ...clone(overrides),
    legacySummary: {
      ...baseComparison.legacySummary,
      ...(overrides.legacySummary ?? {}),
    },
    newSummary: {
      ...baseComparison.newSummary,
      ...(overrides.newSummary ?? {}),
    },
    diffs: clone(overrides.diffs ?? []),
    unmatchedLegacyMesas: clone(overrides.unmatchedLegacyMesas ?? []),
    unmatchedNewMesas: clone(overrides.unmatchedNewMesas ?? []),
    warnings: clone(overrides.warnings ?? []),
    recommendations: clone(overrides.recommendations ?? []),
    metadata: {
      ...baseComparison.metadata,
      ...(overrides.metadata ?? {}),
    },
  }
}

function diff(overrides = {}) {
  return {
    type: 'VOCALES_DISTINTOS',
    severity: 'warning',
    matchKey: 'profesorado-ingles::ing1::first',
    materia: 'Ingles I',
    carrera: 'Profesorado de Ingles',
    llamado: 'first',
    legacyValue: null,
    newValue: null,
    ...overrides,
  }
}

function warning(overrides = {}) {
  return {
    code: 'WARNING',
    severity: 'warning',
    matchKey: 'profesorado-ingles::ing1::first',
    materia: 'Ingles I',
    carrera: 'Profesorado de Ingles',
    llamado: 'first',
    message: 'Advertencia institucional revisable.',
    suggestedAction: 'Revisar antes de avanzar.',
    ...overrides,
  }
}

function reportAndSummary(comparison) {
  const report = buildRegularExamComparisonReport(comparison)
  const summary = buildRegularExamComparisonAuditSummary(report)

  return { report, summary }
}

describe('criterios institucionales de auditoria comparativa', () => {
  it('clasifica OK si no hay diferencias criticas, mesas sin tribunal ni unmatched relevantes', () => {
    const comparison = buildComparison({
      recommendations: [
        'Revisar una muestra representativa.',
        'Aprobar como comparable para auditoria interna.',
      ],
    })

    const { report, summary } = reportAndSummary(comparison)

    expect(report.status).toBe('OK')
    expect(report.criticalDiffs).toEqual([])
    expect(report.executiveSummary).toMatchObject({
      totalDiffs: 0,
      totalCriticalDiffs: 0,
      unmatchedLegacyCount: 0,
      unmatchedNewCount: 0,
    })
    expect(report.sections.mesasSinTribunal).toEqual([])
    expect(summary.status).toBe(report.status)
    expect(summary.recommendedActions).toEqual(expect.arrayContaining([
      'Revisar una muestra representativa.',
      'Aprobar como comparable para auditoria interna.',
    ]))
  })

  it('clasifica WARNING con fecha no critica, vocal distinto valido y compactacion justificada', () => {
    const comparison = buildComparison({
      legacySummary: {
        totalMesas: 3,
      },
      newSummary: {
        totalMesas: 2,
        totalCompactadas: 1,
      },
      diffs: [
        diff({
          type: 'VOCALES_DISTINTOS',
          legacyValue: ['Docente Vocal A', 'Docente Vocal B'],
          newValue: ['Docente Vocal A', 'Docente Vocal C'],
        }),
        diff({
          type: 'COMPACTACION_NUEVA',
          legacyValue: 0,
          newValue: 1,
        }),
      ],
      warnings: [
        warning({
          code: 'FECHA_NO_CRITICA',
          message: 'La fecha difiere, pero se mantiene dentro del rango institucional permitido.',
          suggestedAction: 'Validar fechas.',
        }),
        warning({
          code: 'MESA_CON_UN_VOCAL',
          message: 'La mesa tiene un vocal y requiere revision menor.',
          suggestedAction: 'Revisar vocales asignados.',
        }),
        warning({
          code: 'DISPONIBILIDAD_DOCENTE',
          message: 'Hay una advertencia de disponibilidad docente.',
          suggestedAction: 'Revisar docentes en limite.',
        }),
        warning({
          code: 'REVISION_MANUAL_MENOR',
          message: 'Queda una revision manual menor pendiente.',
          suggestedAction: 'Revisar diferencias detectadas.',
        }),
      ],
      recommendations: [
        'Revisar diferencias detectadas.',
        'Validar compactaciones.',
        'Revisar docentes en limite.',
        'Validar fechas.',
      ],
    })

    const { report, summary } = reportAndSummary(comparison)

    expect(report.status).toBe('WARNING')
    expect(report.criticalDiffs).toEqual([])
    expect(report.executiveSummary).toMatchObject({
      compactedNewCount: 1,
      totalCriticalDiffs: 0,
    })
    expect(report.sections.diferenciasVocales).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'warning',
        type: 'VOCALES_DISTINTOS',
      }),
    ]))
    expect(report.sections.compactaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'warning',
        type: 'COMPACTACION_NUEVA',
      }),
    ]))
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'FECHA_NO_CRITICA' }),
      expect.objectContaining({ type: 'MESA_CON_UN_VOCAL' }),
      expect.objectContaining({ type: 'DISPONIBILIDAD_DOCENTE' }),
    ]))
    expect(summary.status).toBe(report.status)
    expect(summary.recommendedActions).toEqual(expect.arrayContaining([
      'Validar compactaciones.',
      'Revisar docentes en limite.',
      'Validar fechas.',
    ]))
  })

  it('clasifica CRITICAL con titular conflictivo, materia sin titular, mesa sin tribunal y llamado incorrecto', () => {
    const comparison = buildComparison({
      legacySummary: {
        totalSinTribunal: 1,
      },
      newSummary: {
        totalSinTribunal: 1,
      },
      diffs: [
        diff({
          type: 'TITULAR_DISTINTO',
          severity: 'critical',
          legacyValue: 'Titular Legacy',
          newValue: 'Titular Nuevo',
        }),
        diff({
          type: 'TRIBUNAL_DISTINTO',
          severity: 'critical',
          legacyValue: 'tribunal completo',
          newValue: 'tribunal incompleto',
        }),
        diff({
          type: 'LLAMADO_DISTINTO',
          severity: 'critical',
          legacyValue: 'first',
          newValue: 'missing',
        }),
      ],
      warnings: [
        warning({
          code: 'MATERIA_SIN_TITULAR',
          severity: 'critical',
          message: 'La materia no tiene titular asignado.',
          suggestedAction: 'Revisar titularidades.',
        }),
        warning({
          code: 'CORRELATIVIDAD_CONFLICTIVA',
          severity: 'critical',
          message: 'La correlatividad informada contradice el orden institucional esperado.',
          suggestedAction: 'Revisar correlatividades.',
        }),
      ],
      recommendations: [
        'No usar el resultado como cronograma.',
        'Corregir datos de entrada.',
        'Revisar titularidades.',
        'Revisar disponibilidad.',
        'Volver a generar preview.',
      ],
    })

    const { report, summary } = reportAndSummary(comparison)

    expect(report.status).toBe('CRITICAL')
    expect(report.sections.diferenciasTitulares).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'critical',
        type: 'TITULAR_DISTINTO',
      }),
    ]))
    expect(report.sections.mesasSinTribunal).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'critical',
        type: 'MESAS_SIN_TRIBUNAL',
      }),
      expect.objectContaining({
        severity: 'critical',
        type: 'TRIBUNAL_DISTINTO',
      }),
    ]))
    expect(report.sections.diferenciasLlamados).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'critical',
        type: 'LLAMADO_DISTINTO',
      }),
    ]))
    expect(report.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'critical', type: 'MATERIA_SIN_TITULAR' }),
      expect.objectContaining({ severity: 'critical', type: 'CORRELATIVIDAD_CONFLICTIVA' }),
    ]))
    expect(summary.status).toBe(report.status)
    expect(summary.recommendedActions).toEqual(expect.arrayContaining([
      'No usar el resultado como cronograma.',
      'Corregir datos de entrada.',
      'Revisar titularidades.',
      'Revisar disponibilidad.',
      'Volver a generar preview.',
    ]))
  })

  it('mantiene CRITICAL como lectura institucional y no como error tecnico', () => {
    const comparison = buildComparison({
      diffs: [
        diff({
          type: 'TITULAR_DISTINTO',
          severity: 'critical',
          legacyValue: 'Titular Legacy',
          newValue: 'Titular Nuevo',
        }),
      ],
      recommendations: [
        'No usar el resultado como cronograma.',
        'Corregir datos de entrada.',
        'Volver a generar preview.',
      ],
    })

    const { report, summary } = reportAndSummary(comparison)

    expect(report.status).toBe('CRITICAL')
    expect(summary.status).toBe('CRITICAL')
    expect(summary.title).toBe('Resumen de auditoria comparativa - CRITICAL')
    expect(summary.summaryText).toContain('estado CRITICAL')
    expect(summary.summaryText).toContain('Requiere revision manual')
    expect(summary.summaryText.toLowerCase()).not.toContain('error tecnico')
    expect(summary.recommendedActions).toEqual(expect.arrayContaining([
      'No usar el resultado como cronograma.',
      'Corregir datos de entrada.',
      'Volver a generar preview.',
    ]))
  })

  it('no muta comparaciones ni reportes controlados', () => {
    const comparison = buildComparison({
      diffs: [
        diff({
          type: 'VOCALES_DISTINTOS',
          legacyValue: ['Vocal A', 'Vocal B'],
          newValue: ['Vocal A', 'Vocal C'],
        }),
      ],
      warnings: [
        warning({
          code: 'FECHA_NO_CRITICA',
          message: 'Fecha revisable dentro de rango.',
        }),
      ],
    })
    const originalComparison = clone(comparison)
    const report = buildRegularExamComparisonReport(comparison)
    const originalReport = clone(report)

    buildRegularExamComparisonAuditSummary(report)

    expect(comparison).toEqual(originalComparison)
    expect(report).toEqual(originalReport)
  })

  it('mantiene el test aislado de motores, adaptadores legacy y UI', () => {
    const files = [
      'src/utils/examEngine/comparison/comparisonStatusCriteria.test.js',
      'src/utils/examEngine/comparison/buildRegularExamComparisonReport.js',
      'src/utils/examEngine/comparison/buildRegularExamComparisonAuditSummary.js',
    ]
    const source = files
      .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
      .join('\n')
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')
    const generator = ['generate', 'RegularExamPlan'].join('')
    const routerPackage = ['react', '-', 'router', '-', 'dom'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(adapter)
    expect(source).not.toContain(generator)
    expect(source).not.toMatch(/from\s+['"].*components/)
    expect(source).not.toContain(routerPackage)
  })
})
