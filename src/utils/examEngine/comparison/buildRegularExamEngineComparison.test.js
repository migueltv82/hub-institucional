import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  legacyCronogramaResult,
  legacyCronogramaWithPendingTribunal,
} from './__fixtures__/legacyCronogramaResult.fixture.js'
import {
  newPreviewResult,
  newPreviewWithCompaction,
  newPreviewWithUnassigned,
} from './__fixtures__/newPreviewResult.fixture.js'
import { buildRegularExamEngineComparison } from './buildRegularExamEngineComparison.js'

function compare({
  legacyResult = legacyCronogramaResult,
  newPreview = newPreviewResult,
} = {}) {
  return buildRegularExamEngineComparison({ legacyResult, newPreview })
}

function clone(value) {
  return structuredClone(value)
}

function diffTypes(result) {
  return result.diffs.map((diff) => diff.type)
}

describe('buildRegularExamEngineComparison', () => {
  it('devuelve summaries legacy y nuevo', () => {
    const result = compare()

    expect(result).toMatchObject({
      legacySummary: {
        totalMesas: 3,
        totalSinTribunal: 0,
        totalSinFecha: 0,
        totalCompactadas: 0,
        llamados: ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'],
      },
      newSummary: {
        totalMesas: 3,
        totalPlanned: 3,
        totalUnassigned: 0,
        totalSinTribunal: 0,
        totalSinFecha: 0,
        totalCompactadas: 0,
        totalCompactaciones: 0,
        llamados: ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'],
      },
      metadata: {
        matchStrategy: 'carrera + materia/codigo + llamado',
        matchedMesas: 3,
        totalLegacyMesas: 3,
        totalNewMesas: 3,
        diffCount: 0,
      },
    })
  })

  it('detecta misma mesa sin diff', () => {
    const result = compare()

    expect(result.diffs).toEqual([])
    expect(result.unmatchedLegacyMesas).toEqual([])
    expect(result.unmatchedNewMesas).toEqual([])
    expect(result.recommendations).toEqual([])
  })

  it('compara filas nuevas ya adaptadas al contrato legacy de la UI', () => {
    const uiShapedNewResult = {
      plannedMesas: legacyCronogramaResult.map((mesa) => ({
        ...mesa,
        origenMotor: 'examEngine',
      })),
    }

    const result = compare({ newPreview: uiShapedNewResult })

    expect(result.diffs).toEqual([])
    expect(result.metadata).toMatchObject({
      matchedMesas: 3,
      totalLegacyMesas: 3,
      totalNewMesas: 3,
    })
  })

  it('prefiere el codigo de materia sobre materiaId UUID al comparar filas nuevas', () => {
    const legacyResult = [legacyCronogramaResult[0]]
    const newPreview = {
      plannedMesas: [{
        ...newPreviewResult.plannedMesas[0],
        materia: legacyCronogramaResult[0].materia,
        materiaId: '71cf4b19-ec93-42fb-bbc0-e7aeb5260c8a',
      }],
    }

    const result = compare({ legacyResult, newPreview })

    expect(result.unmatchedLegacyMesas).toEqual([])
    expect(result.unmatchedNewMesas).toEqual([])
    expect(result.diffs).toEqual([])
  })

  it('detecta titular distinto', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas[0].titularNombre = 'Titular Diferente'

    const result = compare({ newPreview })

    expect(result.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'TITULAR_DISTINTO',
        legacyValue: 'Ana Ingles I',
        newValue: 'Titular Diferente',
      }),
    ]))
    expect(result.recommendations).toContain('Revisar reglas de asignacion de titulares.')
  })

  it('detecta vocales distintos como set', () => {
    const sameSetDifferentOrder = compare()
    expect(sameSetDifferentOrder.diffs).toEqual([])

    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas[0].vocal2Nombre = 'Vocal Externo Nuevo'

    const result = compare({ newPreview })

    expect(result.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'VOCALES_DISTINTOS',
        legacyValue: ['Carla Programacion', 'Diego Base de Datos'],
        newValue: ['Carla Programacion', 'Vocal Externo Nuevo'],
      }),
    ]))
    expect(result.recommendations).toContain('Comparar afinidades e idoneidad usadas para vocalias.')
  })

  it('detecta fecha distinta', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas[1].fecha = '2026-07-30'

    const result = compare({ newPreview })

    expect(result.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'FECHA_DISTINTA',
        legacyValue: '2026-07-28',
        newValue: '2026-07-30',
      }),
    ]))
  })

  it('detecta llamado distinto', () => {
    const legacyResult = clone(legacyCronogramaResult)
    legacyResult[2].exam_call = 'first'
    legacyResult[2].llamado = 'Primer llamado'

    const result = compare({ legacyResult })

    expect(result.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'MESA_LEGACY_SIN_EQUIVALENTE',
        legacyMesaId: 'legacy-prg1-second',
      }),
      expect.objectContaining({
        type: 'MESA_NUEVA_SIN_EQUIVALENTE',
        newMesaId: 'new-prg1-second',
      }),
    ]))
  })

  it('detecta mesa legacy sin equivalente nuevo', () => {
    const legacyResult = clone(legacyCronogramaResult)
    legacyResult.push({
      ...legacyResult[0],
      id: 'legacy-extra',
      materia: 'HIS1',
      nombreMateria: 'Historia I',
      carrera: 'Profesorado de Historia',
    })

    const result = compare({ legacyResult })

    expect(result.unmatchedLegacyMesas).toHaveLength(1)
    expect(result.unmatchedLegacyMesas[0]).toMatchObject({
      id: 'legacy-extra',
      materia: 'HIS1',
    })
    expect(diffTypes(result)).toContain('MESA_LEGACY_SIN_EQUIVALENTE')
  })

  it('detecta mesa nueva sin equivalente legacy', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas.push({
      ...newPreview.plannedMesas[0],
      id: 'new-extra',
      materia: 'HIS1',
      materiaId: 'HIS1',
      nombreMateria: 'Historia I',
      carrera: 'Profesorado de Historia',
    })

    const result = compare({ newPreview })

    expect(result.unmatchedNewMesas).toHaveLength(1)
    expect(result.unmatchedNewMesas[0]).toMatchObject({
      id: 'new-extra',
      materia: 'HIS1',
    })
    expect(diffTypes(result)).toContain('MESA_NUEVA_SIN_EQUIVALENTE')
  })

  it('detecta compactacion nueva', () => {
    const result = compare({ newPreview: newPreviewWithCompaction })

    expect(result.newSummary).toMatchObject({
      totalCompactadas: 1,
      totalCompactaciones: 1,
    })
    expect(result.diffs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'COMPACTACION_NUEVA',
        legacyValue: 0,
        newValue: 1,
      }),
    ]))
    expect(result.recommendations).toContain('Revisar compactaciones del nuevo motor por separado.')
  })

  it('detecta mesa sin tribunal', () => {
    const result = compare({
      legacyResult: legacyCronogramaWithPendingTribunal,
      newPreview: newPreviewWithUnassigned,
    })

    expect(result.legacySummary.totalSinTribunal).toBe(1)
    expect(result.legacySummary.totalSinFecha).toBe(1)
    expect(result.newSummary.totalSinTribunal).toBe(1)
    expect(result.newSummary.totalUnassigned).toBe(1)
    expect(result.newSummary.issues).toMatchObject({
      errors: 1,
      warnings: 0,
      bySeverity: {
        critical: 1,
      },
    })
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SIN_FECHA_VALIDA',
        severity: 'critical',
      }),
    ]))
  })

  it('no muta inputs', () => {
    const legacyResult = clone(legacyCronogramaResult)
    const newPreview = clone(newPreviewResult)
    const legacySnapshot = clone(legacyResult)
    const newSnapshot = clone(newPreview)

    buildRegularExamEngineComparison({ legacyResult, newPreview })

    expect(legacyResult).toEqual(legacySnapshot)
    expect(newPreview).toEqual(newSnapshot)
  })

  it('no importa motor viejo ni adaptador legacy', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/examEngine/comparison/buildRegularExamEngineComparison.js'),
      'utf8',
    )
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const adapter = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(adapter)
  })

  it('no llama el generador directo del plan regular', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/examEngine/comparison/buildRegularExamEngineComparison.js'),
      'utf8',
    )
    const directPlanGenerator = ['generateRegular', 'ExamPlan'].join('')

    expect(source).not.toContain(directPlanGenerator)
  })
})
