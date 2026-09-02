import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { legacyCronogramaStressResult } from './__fixtures__/legacyCronogramaStressResult.fixture.js'
import { legacyWorkspaceSnapshotStress } from './__fixtures__/legacyWorkspaceSnapshotStress.fixture.js'
import { buildRegularExamComparisonAuditSummary } from './buildRegularExamComparisonAuditSummary.js'
import { buildRegularExamComparisonReport } from './buildRegularExamComparisonReport.js'
import { buildRegularExamEngineComparison } from './buildRegularExamEngineComparison.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from './buildRegularExamInputFromWorkspaceSnapshot.js'
import { exportRegularExamComparisonAuditSummary } from './exportRegularExamComparisonAuditSummary.js'

function clone(value) {
  return structuredClone(value)
}

function stressSummary() {
  const input = buildRegularExamInputFromWorkspaceSnapshot(clone(legacyWorkspaceSnapshotStress))
  const contract = buildRegularExamPreviewIntegrationContract(input, {})
  const comparison = buildRegularExamEngineComparison({
    legacyResult: clone(legacyCronogramaStressResult),
    newPreview: contract.preview,
  })
  const report = buildRegularExamComparisonReport(comparison)

  return buildRegularExamComparisonAuditSummary(report)
}

function basicSummary(overrides = {}) {
  return {
    status: 'OK',
    title: 'Resumen de auditoria comparativa - OK',
    summaryText: 'La comparacion no tiene diferencias relevantes.',
    keyFindings: [],
    criticalItems: [],
    warnings: [],
    recommendedActions: [],
    metrics: {
      totalLegacyMesas: 1,
      totalNewMesas: 1,
      totalDiffs: 0,
      totalCriticalDiffs: 0,
      unmatchedLegacyCount: 0,
      unmatchedNewCount: 0,
      compactedNewCount: 0,
    },
    metadata: {
      source: 'test',
    },
    ...overrides,
  }
}

describe('exportRegularExamComparisonAuditSummary', () => {
  it('exporta objeto serializable', () => {
    const exported = exportRegularExamComparisonAuditSummary(basicSummary())

    expect(exported).toMatchObject({
      exportedAt: expect.any(String),
      status: 'OK',
      title: 'Resumen de auditoria comparativa - OK',
      summaryText: 'La comparacion no tiene diferencias relevantes.',
      keyFindings: [],
      criticalItems: [],
      warnings: [],
      recommendedActions: [],
      metrics: {
        totalLegacyMesas: 1,
      },
      metadata: {
        source: 'test',
      },
    })
    expect(() => JSON.stringify(exported)).not.toThrow()
    expect(typeof exported).toBe('object')
    expect(Array.isArray(exported)).toBe(false)
  })

  it('incluye institutionName y periodLabel si se pasan', () => {
    const exported = exportRegularExamComparisonAuditSummary(basicSummary(), {
      institutionName: 'Instituto Demo',
      periodLabel: 'Julio 2026',
    })

    expect(exported).toMatchObject({
      institutionName: 'Instituto Demo',
      periodLabel: 'Julio 2026',
    })
  })

  it('no muta input', () => {
    const summary = basicSummary({
      keyFindings: [{ type: 'A', nested: { value: 1 } }],
    })
    const originalSummary = clone(summary)

    exportRegularExamComparisonAuditSummary(summary)

    expect(summary).toEqual(originalSummary)
  })

  it('elimina undefined, functions y symbols', () => {
    const exported = exportRegularExamComparisonAuditSummary(basicSummary({
      keyFindings: [
        {
          type: 'FINDING',
          removeUndefined: undefined,
          removeFunction: () => 'no exportar',
          removeSymbol: Symbol('no-exportar'),
          keep: 'ok',
        },
      ],
      metadata: {
        removeUndefined: undefined,
        removeFunction: () => 'no exportar',
        removeSymbol: Symbol('no-exportar'),
        keep: 'ok',
      },
    }))

    expect(exported.keyFindings[0]).toEqual({
      type: 'FINDING',
      keep: 'ok',
    })
    expect(exported.metadata).toEqual({
      keep: 'ok',
    })
    expect(() => JSON.stringify(exported)).not.toThrow()
  })

  it('maneja circular', () => {
    const summary = basicSummary()
    summary.metadata.self = summary.metadata
    summary.keyFindings.push({
      type: 'CIRCULAR_FINDING',
      self: summary,
    })

    const exported = exportRegularExamComparisonAuditSummary(summary)

    expect(exported.metadata.self).toBe('[Circular]')
    expect(exported.keyFindings[0].self.metadata.self).toBe('[Circular]')
    expect(() => JSON.stringify(exported)).not.toThrow()
  })

  it('respeta includeMetadata false', () => {
    const exported = exportRegularExamComparisonAuditSummary(basicSummary(), {
      includeMetadata: false,
    })

    expect(exported).not.toHaveProperty('metadata')
  })

  it('funciona con summary generado desde stressComparisonReport', () => {
    const summary = stressSummary()
    const exported = exportRegularExamComparisonAuditSummary(summary, {
      institutionName: 'Instituto Stress',
      periodLabel: 'Stress julio 2026',
    })

    expect(exported).toMatchObject({
      institutionName: 'Instituto Stress',
      periodLabel: 'Stress julio 2026',
      status: expect.stringMatching(/^(WARNING|CRITICAL)$/),
      keyFindings: expect.any(Array),
      criticalItems: expect.any(Array),
      warnings: expect.any(Array),
      recommendedActions: expect.any(Array),
      metrics: {
        totalDiffs: expect.any(Number),
      },
    })
    expect(exported.metrics.totalDiffs).toBeGreaterThan(0)
    expect(() => JSON.stringify(exported)).not.toThrow()
  })

  it('no importa motor viejo ni adaptador legacy', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/examEngine/comparison/exportRegularExamComparisonAuditSummary.js'),
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
