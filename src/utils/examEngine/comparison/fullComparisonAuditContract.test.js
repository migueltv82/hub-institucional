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

const REQUIRED_EXPORT_FIELDS = [
  'exportedAt',
  'institutionName',
  'periodLabel',
  'status',
  'title',
  'summaryText',
  'keyFindings',
  'criticalItems',
  'warnings',
  'recommendedActions',
  'metrics',
  'metadata',
]

const REQUIRED_METRIC_FIELDS = [
  'totalLegacyMesas',
  'totalNewMesas',
  'totalDiffs',
  'totalCriticalDiffs',
  'unmatchedLegacyCount',
  'unmatchedNewCount',
  'compactedNewCount',
]

function clone(value) {
  return structuredClone(value)
}

function hasUnsafeJsonValue(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return true
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)

  if (Array.isArray(value)) return value.some((entry) => hasUnsafeJsonValue(entry, seen))
  return Object.values(value).some((entry) => hasUnsafeJsonValue(entry, seen))
}

function sourceFor(paths = []) {
  return paths
    .map((sourcePath) => readFileSync(join(process.cwd(), sourcePath), 'utf8'))
    .join('\n')
}

describe('full comparison audit contract', () => {
  it('mantiene contrato estable desde snapshot stress hasta export interno serializable', () => {
    const snapshot = clone(legacyWorkspaceSnapshotStress)
    const legacyResult = clone(legacyCronogramaStressResult)
    const originalSnapshot = clone(snapshot)
    const originalLegacyResult = clone(legacyResult)

    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const originalInput = clone(input)

    const contract = buildRegularExamPreviewIntegrationContract(input, {})
    const preview = clone(contract.preview)
    const originalPreview = clone(preview)

    const comparison = buildRegularExamEngineComparison({
      legacyResult,
      newPreview: preview,
    })
    const originalComparison = clone(comparison)

    const report = buildRegularExamComparisonReport(comparison)
    const originalReport = clone(report)

    const summary = buildRegularExamComparisonAuditSummary(report)
    const originalSummary = clone(summary)

    const exported = exportRegularExamComparisonAuditSummary(summary, {
      institutionName: 'Instituto de Auditoria Interna',
      periodLabel: 'Stress julio 2026',
    })

    expect(Object.keys(exported)).toEqual(expect.arrayContaining(REQUIRED_EXPORT_FIELDS))
    expect(exported).toMatchObject({
      exportedAt: expect.any(String),
      institutionName: 'Instituto de Auditoria Interna',
      periodLabel: 'Stress julio 2026',
      status: expect.stringMatching(/^(WARNING|CRITICAL)$/),
      title: expect.any(String),
      summaryText: expect.any(String),
      keyFindings: expect.any(Array),
      criticalItems: expect.any(Array),
      warnings: expect.any(Array),
      recommendedActions: expect.any(Array),
      metrics: expect.any(Object),
      metadata: expect.any(Object),
    })
    expect(exported.summaryText.length).toBeGreaterThan(0)
    expect(exported.keyFindings.length).toBeGreaterThan(0)
    expect(exported.recommendedActions.length).toBeGreaterThan(0)
    expect(new Date(exported.exportedAt).toString()).not.toBe('Invalid Date')

    expect(Object.keys(exported.metrics)).toEqual(expect.arrayContaining(REQUIRED_METRIC_FIELDS))
    REQUIRED_METRIC_FIELDS.forEach((field) => {
      expect(Number.isFinite(exported.metrics[field])).toBe(true)
    })

    expect(hasUnsafeJsonValue(exported)).toBe(false)
    expect(() => JSON.stringify(exported)).not.toThrow()

    expect(snapshot).toEqual(originalSnapshot)
    expect(legacyResult).toEqual(originalLegacyResult)
    expect(input).toEqual(originalInput)
    expect(preview).toEqual(originalPreview)
    expect(comparison).toEqual(originalComparison)
    expect(report).toEqual(originalReport)
    expect(summary).toEqual(originalSummary)
  })

  it('mantiene el flujo completo aislado de motor viejo, adaptadores prohibidos y UI', () => {
    const source = sourceFor([
      'src/utils/examEngine/comparison/fullComparisonAuditContract.test.js',
      'src/utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotStress.fixture.js',
      'src/utils/examEngine/comparison/__fixtures__/legacyCronogramaStressResult.fixture.js',
      'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js',
      'src/utils/examEngine/comparison/buildRegularExamEngineComparison.js',
      'src/utils/examEngine/comparison/buildRegularExamComparisonReport.js',
      'src/utils/examEngine/comparison/buildRegularExamComparisonAuditSummary.js',
      'src/utils/examEngine/comparison/exportRegularExamComparisonAuditSummary.js',
      'src/utils/examEngine/preview/buildRegularExamPreviewIntegrationContract.js',
      'src/utils/examEngine/preview/buildRegularExamEnginePreview.js',
    ])
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
