import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { legacyCronogramaInstitutionalResult } from './__fixtures__/legacyCronogramaInstitutionalResult.fixture.js'
import { legacyWorkspaceSnapshotInstitutional } from './__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js'
import {
  buildRegularExamComparisonAuditSummary,
  buildRegularExamComparisonReport,
  buildRegularExamEngineComparison,
  buildRegularExamInputFromWorkspaceSnapshot,
  exportRegularExamComparisonAuditSummary,
} from './index.js'

function clone(value) {
  return structuredClone(value)
}

function sourceFor(paths = []) {
  return paths
    .map((sourcePath) => readFileSync(join(process.cwd(), sourcePath), 'utf8'))
    .join('\n')
}

function hasUnsafeJsonValue(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return true
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)

  if (Array.isArray(value)) return value.some((entry) => hasUnsafeJsonValue(entry, seen))
  return Object.values(value).some((entry) => hasUnsafeJsonValue(entry, seen))
}

function datesInRange(rows = [], start, end) {
  const startTime = Date.parse(start)
  const endTime = Date.parse(end)

  return rows.every((row) => {
    const time = Date.parse(row.fechaIso)
    return time >= startTime && time <= endTime
  })
}

describe('institutional comparison report integration', () => {
  it('compara legacy institucional controlado contra preview nuevo institucional', () => {
    const snapshot = clone(legacyWorkspaceSnapshotInstitutional)
    const legacyResult = clone(legacyCronogramaInstitutionalResult)
    const originalSnapshot = clone(snapshot)
    const originalLegacyResult = clone(legacyResult)

    expect(new Set(legacyResult.map((mesa) => mesa.carrera))).toEqual(new Set([
      'Profesorado de Ingles',
      'Tecnicatura Superior en Desarrollo de Software',
      'Profesorado de Educacion Primaria',
    ]))
    expect(legacyResult.map((mesa) => mesa.materia)).toEqual(expect.arrayContaining([
      'inst-plan-ing-transversal',
      'inst-plan-tic-1',
      'inst-plan-practica-pedagogica-3',
      'inst-plan-practica-tecnica-2',
      'inst-plan-discursivas-3',
    ]))
    expect(legacyResult.some((mesa) => mesa.vocal1 && mesa.vocal2 && mesa.vocal2 !== 'A designar')).toBe(true)
    expect(legacyResult.some((mesa) => mesa.vocal1 && (!mesa.vocal2 || mesa.vocal2 === 'A designar'))).toBe(true)
    expect(datesInRange(legacyResult, '2026-07-27', '2026-08-07')).toBe(true)
    expect(legacyResult.every((mesa) => mesa.profesorTitular.startsWith('Docente '))).toBe(true)

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

    const auditSummary = buildRegularExamComparisonAuditSummary(report)
    const originalAuditSummary = clone(auditSummary)

    const exported = exportRegularExamComparisonAuditSummary(auditSummary, {
      institutionName: 'Instituto de Auditoria Interna',
      periodLabel: 'Fixture institucional julio-agosto 2026',
    })

    expect(comparison.legacySummary).toEqual(expect.any(Object))
    expect(comparison.newSummary).toEqual(expect.any(Object))
    expect(comparison.diffs.length).toBeGreaterThan(0)

    expect(report.status).toMatch(/^(OK|WARNING|CRITICAL)$/)
    expect(report.executiveSummary).toEqual(expect.any(Object))
    expect(report.executiveSummary.totalDiffs).toBe(comparison.diffs.length)

    expect(auditSummary.status).toBe(report.status)
    expect(auditSummary.summaryText).toEqual(expect.any(String))
    expect(auditSummary.summaryText.length).toBeGreaterThan(0)
    expect(auditSummary.metrics).toEqual(expect.any(Object))

    expect(exported).toMatchObject({
      exportedAt: expect.any(String),
      institutionName: 'Instituto de Auditoria Interna',
      periodLabel: 'Fixture institucional julio-agosto 2026',
      status: auditSummary.status,
      summaryText: auditSummary.summaryText,
      metrics: expect.any(Object),
    })
    expect(hasUnsafeJsonValue(exported)).toBe(false)
    expect(() => JSON.stringify(exported)).not.toThrow()

    expect(snapshot).toEqual(originalSnapshot)
    expect(legacyResult).toEqual(originalLegacyResult)
    expect(input).toEqual(originalInput)
    expect(preview).toEqual(originalPreview)
    expect(comparison).toEqual(originalComparison)
    expect(report).toEqual(originalReport)
    expect(auditSummary).toEqual(originalAuditSummary)
  })

  it('mantiene la comparacion institucional aislada de motor viejo, hooks productivos y UI', () => {
    const source = sourceFor([
      'src/utils/examEngine/comparison/institutionalComparisonReport.integration.test.js',
      'src/utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js',
      'src/utils/examEngine/comparison/__fixtures__/legacyCronogramaInstitutionalResult.fixture.js',
      'src/utils/examEngine/comparison/index.js',
      'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js',
      'src/utils/examEngine/comparison/buildRegularExamEngineComparison.js',
      'src/utils/examEngine/comparison/buildRegularExamComparisonReport.js',
      'src/utils/examEngine/comparison/buildRegularExamComparisonAuditSummary.js',
      'src/utils/examEngine/comparison/exportRegularExamComparisonAuditSummary.js',
      'src/utils/examEngine/preview/buildRegularExamPreviewIntegrationContract.js',
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
