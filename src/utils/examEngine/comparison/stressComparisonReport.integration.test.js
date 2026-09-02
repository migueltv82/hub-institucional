import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { legacyCronogramaStressResult } from './__fixtures__/legacyCronogramaStressResult.fixture.js'
import { legacyWorkspaceSnapshotStress } from './__fixtures__/legacyWorkspaceSnapshotStress.fixture.js'
import { buildRegularExamComparisonReport } from './buildRegularExamComparisonReport.js'
import { buildRegularExamEngineComparison } from './buildRegularExamEngineComparison.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from './buildRegularExamInputFromWorkspaceSnapshot.js'

function clone(value) {
  return structuredClone(value)
}

function diffTypes(comparison = {}) {
  return comparison.diffs.map((diff) => diff.type)
}

function sourceFor(paths = []) {
  return paths
    .map((sourcePath) => readFileSync(join(process.cwd(), sourcePath), 'utf8'))
    .join('\n')
}

describe('stress comparison report integration', () => {
  it('compara legacy stress contra preview nuevo generado desde snapshot stress adaptado', () => {
    const snapshot = clone(legacyWorkspaceSnapshotStress)
    const legacyResult = clone(legacyCronogramaStressResult)
    const originalSnapshot = clone(snapshot)
    const originalLegacyResult = clone(legacyResult)

    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const originalInput = clone(input)
    const contract = buildRegularExamPreviewIntegrationContract(input, {})
    const newPreview = clone(contract.preview)
    const originalNewPreview = clone(newPreview)

    const comparison = buildRegularExamEngineComparison({
      legacyResult,
      newPreview,
    })
    const originalComparison = clone(comparison)
    const report = buildRegularExamComparisonReport(comparison)
    const types = diffTypes(comparison)

    expect(contract.phase).toMatch(/^(warning|critical)$/)
    expect(report.status).toMatch(/^(WARNING|CRITICAL)$/)
    expect(comparison.diffs.length).toBeGreaterThan(0)
    expect(report.executiveSummary.totalDiffs).toBeGreaterThan(0)
    expect(report.recommendations.length).toBeGreaterThan(0)

    expect(types).toEqual(expect.arrayContaining([
      'TITULAR_DISTINTO',
      'VOCALES_DISTINTOS',
      'FECHA_DISTINTA',
    ]))
    expect(comparison.unmatchedLegacyMesas.length).toBeGreaterThan(0)
    expect(comparison.unmatchedLegacyMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'legacy-stress-his1-extra',
        materia: 'HIS1',
      }),
    ]))
    expect(comparison.unmatchedNewMesas.length).toBeGreaterThan(0)
    expect(types).toContain('MESA_NUEVA_SIN_EQUIVALENTE')

    expect(report.sections.diferenciasTitulares.length).toBeGreaterThan(0)
    expect(report.sections.diferenciasVocales.length).toBeGreaterThan(0)
    expect(report.sections.diferenciasFechas.length).toBeGreaterThan(0)
    expect(report.sections.mesasSinEquivalente.length).toBeGreaterThan(0)

    expect(snapshot).toEqual(originalSnapshot)
    expect(input).toEqual(originalInput)
    expect(legacyResult).toEqual(originalLegacyResult)
    expect(newPreview).toEqual(originalNewPreview)
    expect(comparison).toEqual(originalComparison)
  })

  it('mantiene la comparacion stress aislada de motores viejos, hooks productivos y UI', () => {
    const source = sourceFor([
      'src/utils/examEngine/comparison/stressComparisonReport.integration.test.js',
      'src/utils/examEngine/comparison/__fixtures__/legacyCronogramaStressResult.fixture.js',
      'src/utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotStress.fixture.js',
      'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js',
      'src/utils/examEngine/comparison/buildRegularExamEngineComparison.js',
      'src/utils/examEngine/comparison/buildRegularExamComparisonReport.js',
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
