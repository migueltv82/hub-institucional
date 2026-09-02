import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  legacyCronogramaResult,
  legacyCronogramaWithPendingTribunal,
} from './__fixtures__/legacyCronogramaResult.fixture.js'
import { legacyWorkspaceSnapshot } from './__fixtures__/legacyWorkspaceSnapshot.fixture.js'
import {
  newPreviewResult,
  newPreviewWithUnassigned,
} from './__fixtures__/newPreviewResult.fixture.js'
import { buildRegularExamEngineComparison } from './buildRegularExamEngineComparison.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from './buildRegularExamInputFromWorkspaceSnapshot.js'

function clone(value) {
  return structuredClone(value)
}

function diffTypes(result) {
  return result.diffs.map((diff) => diff.type)
}

function comparisonSources() {
  return [
    'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js',
    'src/utils/examEngine/comparison/buildRegularExamEngineComparison.js',
    'src/utils/examEngine/comparison/regularExamComparison.integration.test.js',
  ]
    .map((sourcePath) => readFileSync(join(process.cwd(), sourcePath), 'utf8'))
    .join('\n')
}

describe('regular exam comparison integration', () => {
  it('adapta el snapshot viejo y compara salidas legacy vs preview nuevo', () => {
    const snapshot = clone(legacyWorkspaceSnapshot)
    const legacyResult = clone(legacyCronogramaWithPendingTribunal)
    const newPreview = clone(newPreviewWithUnassigned)
    const originalSnapshot = clone(snapshot)
    const originalLegacyResult = clone(legacyResult)
    const originalNewPreview = clone(newPreview)

    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const comparison = buildRegularExamEngineComparison({ legacyResult, newPreview })

    expect(input).toMatchObject({
      docentes: expect.any(Array),
      materias: expect.any(Array),
      correlatividades: expect.any(Array),
      fechasDisponibles: expect.any(Array),
      config: expect.any(Object),
      options: expect.any(Object),
      metadata: expect.any(Object),
    })
    expect(input.docentes).toHaveLength(4)
    expect(input.materias.map((materia) => materia.materia)).toEqual(['ING1', 'ING2', 'PRG1', 'BD1'])
    expect(input.correlatividades).toEqual([
      expect.objectContaining({
        materia: 'ING2',
        correlativas: ['ING1'],
      }),
    ])
    expect(input.fechasDisponibles).toHaveLength(10)
    expect(input.config).toMatchObject({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 2,
    })
    expect(input.options).toMatchObject({
      compact: 'safe',
      respectCorrelativities: true,
    })
    expect(input.metadata).toMatchObject({
      source: 'legacyWorkspaceSnapshot',
      counts: {
        docentes: 4,
        materias: 4,
        correlatividades: 1,
        fechasDisponibles: 10,
      },
    })

    expect(comparison.legacySummary).toMatchObject({
      totalMesas: 4,
      totalSinTribunal: 1,
      totalSinFecha: 1,
    })
    expect(comparison.newSummary).toMatchObject({
      totalMesas: 4,
      totalPlanned: 3,
      totalUnassigned: 1,
      totalSinTribunal: 1,
      issues: {
        errors: 1,
        warnings: 0,
      },
    })
    expect(diffTypes(comparison)).toContain('TITULAR_DISTINTO')
    expect(comparison.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SIN_FECHA_VALIDA',
        severity: 'critical',
      }),
    ]))

    expect(snapshot).toEqual(originalSnapshot)
    expect(legacyResult).toEqual(originalLegacyResult)
    expect(newPreview).toEqual(originalNewPreview)
  })

  it('detecta mesas sin equivalente legacy y nuevas en una comparacion aislada', () => {
    const legacyResult = clone(legacyCronogramaResult)
    const newPreview = clone(newPreviewResult)

    legacyResult.push({
      ...legacyResult[0],
      id: 'legacy-his1-extra',
      carrera: 'Profesorado de Historia',
      materia: 'HIS1',
      nombreMateria: 'Historia I',
    })
    newPreview.plannedMesas.push({
      ...newPreview.plannedMesas[0],
      id: 'new-mat1-extra',
      carrera: 'Profesorado de Matematica',
      carreraId: 'prof-matematica',
      materia: 'MAT1',
      materiaId: 'MAT1',
      nombreMateria: 'Matematica I',
    })

    const comparison = buildRegularExamEngineComparison({ legacyResult, newPreview })

    expect(comparison.unmatchedLegacyMesas).toEqual([
      expect.objectContaining({
        id: 'legacy-his1-extra',
        materia: 'HIS1',
      }),
    ])
    expect(comparison.unmatchedNewMesas).toEqual([
      expect.objectContaining({
        id: 'new-mat1-extra',
        materia: 'MAT1',
      }),
    ])
    expect(diffTypes(comparison)).toEqual(expect.arrayContaining([
      'MESA_LEGACY_SIN_EQUIVALENTE',
      'MESA_NUEVA_SIN_EQUIVALENTE',
    ]))
  })

  it('mantiene la integracion aislada de motores, UI y adaptadores prohibidos', () => {
    const source = comparisonSources()
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const generationHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')
    const directPlanGenerator = ['generateRegular', 'ExamPlan'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(generationHook)
    expect(source).not.toContain(adapter)
    expect(source).not.toContain(directPlanGenerator)
  })
})
