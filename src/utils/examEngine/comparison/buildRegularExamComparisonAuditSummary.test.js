import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  legacyCronogramaResult,
  legacyCronogramaWithPendingTribunal,
} from './__fixtures__/legacyCronogramaResult.fixture.js'
import { legacyCronogramaStressResult } from './__fixtures__/legacyCronogramaStressResult.fixture.js'
import { legacyWorkspaceSnapshotStress } from './__fixtures__/legacyWorkspaceSnapshotStress.fixture.js'
import {
  newPreviewResult,
  newPreviewWithUnassigned,
} from './__fixtures__/newPreviewResult.fixture.js'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { buildRegularExamComparisonAuditSummary } from './buildRegularExamComparisonAuditSummary.js'
import { buildRegularExamComparisonReport } from './buildRegularExamComparisonReport.js'
import { buildRegularExamEngineComparison } from './buildRegularExamEngineComparison.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from './buildRegularExamInputFromWorkspaceSnapshot.js'

function clone(value) {
  return structuredClone(value)
}

function compare({
  legacyResult = legacyCronogramaResult,
  newPreview = newPreviewResult,
} = {}) {
  return buildRegularExamEngineComparison({ legacyResult, newPreview })
}

function reportFor(input = {}) {
  return buildRegularExamComparisonReport(compare(input))
}

function summaryFor(input = {}) {
  return buildRegularExamComparisonAuditSummary(reportFor(input))
}

function stressReport() {
  const input = buildRegularExamInputFromWorkspaceSnapshot(clone(legacyWorkspaceSnapshotStress))
  const contract = buildRegularExamPreviewIntegrationContract(input, {})
  const comparison = buildRegularExamEngineComparison({
    legacyResult: clone(legacyCronogramaStressResult),
    newPreview: contract.preview,
  })

  return buildRegularExamComparisonReport(comparison)
}

describe('buildRegularExamComparisonAuditSummary', () => {
  it('genera resumen OK si el reporte no tiene diferencias', () => {
    const summary = summaryFor()

    expect(summary).toMatchObject({
      status: 'OK',
      title: 'Resumen de auditoria comparativa - OK',
      metrics: {
        totalLegacyMesas: 3,
        totalNewMesas: 3,
        totalDiffs: 0,
        totalCriticalDiffs: 0,
        unmatchedLegacyCount: 0,
        unmatchedNewCount: 0,
        compactedNewCount: 0,
      },
    })
    expect(summary.summaryText).toContain('estado OK')
    expect(summary.summaryText.split('\n\n')).toHaveLength(1)
    expect(summary.keyFindings).toEqual([
      expect.objectContaining({
        type: 'SIN_DIFERENCIAS_RELEVANTES',
      }),
    ])
    expect(summary.criticalItems).toEqual([])
  })

  it('genera resumen WARNING si hay diferencias menores', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas[0].vocal2Nombre = 'Vocal Externo Nuevo'

    const summary = summaryFor({ newPreview })

    expect(summary.status).toBe('WARNING')
    expect(summary.summaryText).toContain('estado WARNING')
    expect(summary.keyFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'DIFERENCIAS_VOCALES',
        severity: 'warning',
        count: 1,
      }),
    ]))
    expect(summary.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'VOCALES_DISTINTOS',
      }),
    ]))
  })

  it('genera resumen CRITICAL si hay diferencias criticas', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas[0].titularNombre = 'Titular Diferente'

    const summary = summaryFor({ newPreview })

    expect(summary.status).toBe('CRITICAL')
    expect(summary.summaryText).toContain('estado CRITICAL')
    expect(summary.keyFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'DIFERENCIAS_TITULARES',
        severity: 'critical',
      }),
    ]))
    expect(summary.criticalItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'TITULAR_DISTINTO',
      }),
    ]))
  })

  it('incluye keyFindings', () => {
    const report = reportFor({
      legacyResult: legacyCronogramaWithPendingTribunal,
      newPreview: newPreviewWithUnassigned,
    })
    const summary = buildRegularExamComparisonAuditSummary(report)

    expect(summary.keyFindings.length).toBeGreaterThan(0)
    expect(summary.keyFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'MESAS_SIN_TRIBUNAL',
      }),
    ]))
  })

  it('incluye recommendedActions', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas[0].titularNombre = 'Titular Diferente'

    const summary = summaryFor({ newPreview })

    expect(summary.recommendedActions).toEqual(expect.arrayContaining([
      'Revisar titulares asignados antes de avanzar.',
      'Revisar reglas de asignacion de titulares.',
    ]))
  })

  it('incluye metrics', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas.push({
      ...newPreview.plannedMesas[0],
      id: 'new-extra-metrics',
      carrera: 'Profesorado de Historia',
      materia: 'HIS1',
      materiaId: 'HIS1',
      nombreMateria: 'Historia I',
    })

    const summary = summaryFor({ newPreview })

    expect(summary.metrics).toMatchObject({
      totalLegacyMesas: 3,
      totalNewMesas: 4,
      totalDiffs: expect.any(Number),
      totalCriticalDiffs: expect.any(Number),
      unmatchedLegacyCount: 0,
      unmatchedNewCount: 1,
      compactedNewCount: 0,
    })
  })

  it('no muta input', () => {
    const report = reportFor({
      legacyResult: legacyCronogramaWithPendingTribunal,
      newPreview: newPreviewWithUnassigned,
    })
    const originalReport = clone(report)

    buildRegularExamComparisonAuditSummary(report)

    expect(report).toEqual(originalReport)
  })

  it('funciona con stressComparisonReport', () => {
    const report = stressReport()
    const summary = buildRegularExamComparisonAuditSummary(report)

    expect(summary.status).toMatch(/^(WARNING|CRITICAL)$/)
    expect(summary.metrics.totalDiffs).toBeGreaterThan(0)
    expect(summary.keyFindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'DIFERENCIAS_TITULARES' }),
      expect.objectContaining({ type: 'DIFERENCIAS_VOCALES' }),
      expect.objectContaining({ type: 'DIFERENCIAS_FECHAS' }),
      expect.objectContaining({ type: 'MESAS_SIN_EQUIVALENTE' }),
    ]))
    expect(summary.recommendedActions.length).toBeGreaterThan(0)
    expect(summary.summaryText.split('\n\n').length).toBeLessThanOrEqual(3)
  })

  it('no importa motor viejo ni adaptador legacy', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/examEngine/comparison/buildRegularExamComparisonAuditSummary.js'),
      'utf8',
    )
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')
    const routerPackage = ['react', '-', 'router', '-', 'dom'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(adapter)
    expect(source).not.toMatch(/from\s+['"].*components/)
    expect(source).not.toContain(routerPackage)
  })
})
