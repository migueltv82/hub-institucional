import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as comparison from './index.js'

const EXPECTED_EXPORTS = [
  'buildRegularExamInputFromWorkspaceSnapshot',
  'buildRegularExamEngineComparison',
  'buildRegularExamComparisonReport',
  'buildRegularExamComparisonAuditSummary',
  'exportRegularExamComparisonAuditSummary',
]

function sortedKeys(value = {}) {
  return Object.keys(value).sort()
}

describe('comparison public index', () => {
  it('exporta exactamente la superficie publica controlada', () => {
    expect(sortedKeys(comparison)).toEqual([...EXPECTED_EXPORTS].sort())
    EXPECTED_EXPORTS.forEach((exportName) => {
      expect(comparison[exportName]).toEqual(expect.any(Function))
    })
  })

  it('no exporta fixtures ni resultados de prueba', () => {
    const forbiddenFixtureExports = [
      'legacyWorkspaceSnapshot',
      'legacyWorkspaceSnapshotStress',
      'legacyCronogramaResult',
      'legacyCronogramaStressResult',
      'newPreviewResult',
      'newPreviewWithCompaction',
      'newPreviewWithUnassigned',
    ]

    forbiddenFixtureExports.forEach((exportName) => {
      expect(comparison).not.toHaveProperty(exportName)
    })
    expect(sortedKeys(comparison).some((exportName) => exportName.toLowerCase().includes('fixture'))).toBe(false)
  })

  it('no exporta adaptadores legacy, motor viejo ni preview integration', () => {
    const forbiddenExports = [
      ['legacy', 'Adapter'].join(''),
      ['cronograma', 'Inteligente'].join(''),
      ['generar', 'Cronograma', 'Desde', 'Archivos'].join(''),
      ['generate', 'RegularExamPlan'].join(''),
      ['buildRegularExamPreview', 'IntegrationContract'].join(''),
    ]

    forbiddenExports.forEach((exportName) => {
      expect(comparison).not.toHaveProperty(exportName)
    })
  })

  it('no exporta hooks, UI ni acciones oficiales', () => {
    const forbiddenExports = [
      ['useCronograma', 'Generation'].join(''),
      ['useRegularExamPreview', 'Engine'].join(''),
      ['RegularExamPreview', 'Screen'].join(''),
      ['RegularExamPreview', 'Harness'].join(''),
      ['Generador', 'Cronograma'].join(''),
      'guardarCronogramaOficial',
      'publicarCronograma',
      'exportarCronogramaOficial',
    ]

    forbiddenExports.forEach((exportName) => {
      expect(comparison).not.toHaveProperty(exportName)
    })
  })

  it('mantiene index aislado de imports prohibidos', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/examEngine/comparison/index.js'),
      'utf8',
    )
    const forbiddenSourceTokens = [
      ['legacy', 'Adapter'].join(''),
      ['cronograma', 'Inteligente'].join(''),
      ['useCronograma', 'Generation'].join(''),
      ['Generador', 'Cronograma'].join(''),
      ['buildRegularExamPreview', 'IntegrationContract'].join(''),
      ['react', '-', 'router', '-', 'dom'].join(''),
    ]

    forbiddenSourceTokens.forEach((token) => {
      expect(source).not.toContain(token)
    })
    expect(source).not.toMatch(/from\s+['"].*components/)
    expect(source).not.toMatch(/from\s+['"].*hooks/)
    expect(source).not.toMatch(/from\s+['"].*__fixtures__/)
  })
})
