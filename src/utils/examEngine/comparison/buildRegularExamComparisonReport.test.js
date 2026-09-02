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
import { buildRegularExamComparisonReport } from './buildRegularExamComparisonReport.js'

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

function expectReportItemShape(item) {
  expect(item).toMatchObject({
    severity: expect.any(String),
    type: expect.any(String),
    mesaKey: expect.any(String),
    materia: expect.any(String),
    carrera: expect.any(String),
    llamado: expect.any(String),
    message: expect.any(String),
    suggestedAction: expect.any(String),
  })
  expect(item).toHaveProperty('legacyValue')
  expect(item).toHaveProperty('newValue')
}

describe('buildRegularExamComparisonReport', () => {
  it('devuelve reporte OK si no hay diffs', () => {
    const report = reportFor()

    expect(report.status).toBe('OK')
    expect(report.executiveSummary).toMatchObject({
      totalLegacyMesas: 3,
      totalNewMesas: 3,
      totalDiffs: 0,
      totalCriticalDiffs: 0,
      totalWarnings: 0,
      unmatchedLegacyCount: 0,
      unmatchedNewCount: 0,
      compactedNewCount: 0,
    })
    expect(report.sections.resumenGeneral).toHaveLength(1)
    expectReportItemShape(report.sections.resumenGeneral[0])
    expect(report.criticalDiffs).toEqual([])
    expect(report.recommendations).toEqual([])
  })

  it('devuelve reporte WARNING si hay diffs menores', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas[0].vocal2Nombre = 'Vocal Externo Nuevo'

    const report = reportFor({ newPreview })

    expect(report.status).toBe('WARNING')
    expect(report.sections.diferenciasVocales).toEqual([
      expect.objectContaining({
        severity: 'warning',
        type: 'VOCALES_DISTINTOS',
        legacyValue: ['Carla Programacion', 'Diego Base de Datos'],
        newValue: ['Carla Programacion', 'Vocal Externo Nuevo'],
      }),
    ])
    expectReportItemShape(report.sections.diferenciasVocales[0])
  })

  it('devuelve reporte CRITICAL si hay titular distinto', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas[0].titularNombre = 'Titular Diferente'

    const report = reportFor({ newPreview })

    expect(report.status).toBe('CRITICAL')
    expect(report.sections.diferenciasTitulares).toEqual([
      expect.objectContaining({
        severity: 'critical',
        type: 'TITULAR_DISTINTO',
        legacyValue: 'Ana Ingles I',
        newValue: 'Titular Diferente',
      }),
    ])
    expect(report.criticalDiffs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'TITULAR_DISTINTO',
      }),
    ]))
  })

  it('devuelve reporte CRITICAL si hay mesa sin tribunal', () => {
    const report = reportFor({
      legacyResult: legacyCronogramaWithPendingTribunal,
      newPreview: newPreviewWithUnassigned,
    })

    expect(report.status).toBe('CRITICAL')
    expect(report.sections.mesasSinTribunal).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'critical',
        type: 'MESAS_SIN_TRIBUNAL',
        legacyValue: 1,
        newValue: 1,
      }),
    ]))
    expect(report.sections.mesasSinFecha).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'critical',
        type: 'MESAS_SIN_FECHA',
        legacyValue: 1,
        newValue: 1,
      }),
    ]))
  })

  it('incluye mesas legacy sin equivalente', () => {
    const legacyResult = clone(legacyCronogramaResult)
    legacyResult.push({
      ...legacyResult[0],
      id: 'legacy-historia-extra',
      carrera: 'Profesorado de Historia',
      materia: 'HIS1',
      nombreMateria: 'Historia I',
    })

    const report = reportFor({ legacyResult })

    expect(report.status).toBe('CRITICAL')
    expect(report.executiveSummary.unmatchedLegacyCount).toBe(1)
    expect(report.sections.mesasSinEquivalente).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'critical',
        type: 'MESA_LEGACY_SIN_EQUIVALENTE',
        materia: 'his1',
        carrera: 'profesorado de historia',
      }),
    ]))
  })

  it('incluye mesas nuevas sin equivalente', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas.push({
      ...newPreview.plannedMesas[0],
      id: 'new-historia-extra',
      carrera: 'Profesorado de Historia',
      carreraId: 'prof-historia',
      materia: 'HIS1',
      materiaId: 'HIS1',
      nombreMateria: 'Historia I',
    })

    const report = reportFor({ newPreview })

    expect(report.status).toBe('CRITICAL')
    expect(report.executiveSummary.unmatchedNewCount).toBe(1)
    expect(report.sections.mesasSinEquivalente).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'critical',
        type: 'MESA_NUEVA_SIN_EQUIVALENTE',
        materia: 'his1',
        carrera: 'profesorado de historia',
      }),
    ]))
  })

  it('incluye compactaciones', () => {
    const report = reportFor({ newPreview: newPreviewWithCompaction })

    expect(report.executiveSummary.compactedNewCount).toBe(1)
    expect(report.sections.compactaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'COMPACTACIONES_NUEVAS',
        legacyValue: 0,
        newValue: 1,
      }),
      expect.objectContaining({
        type: 'COMPACTACION_NUEVA',
        legacyValue: 0,
        newValue: 1,
      }),
    ]))
  })

  it('genera recomendaciones', () => {
    const newPreview = clone(newPreviewResult)
    newPreview.plannedMesas[0].titularNombre = 'Titular Diferente'

    const report = reportFor({ newPreview })

    expect(report.recommendations).toContain('Revisar reglas de asignacion de titulares.')
    expect(report.sections.recomendaciones).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'RECOMMENDATION',
        message: 'Revisar reglas de asignacion de titulares.',
      }),
    ]))
  })

  it('no muta input', () => {
    const comparison = compare({ newPreview: newPreviewWithUnassigned })
    const originalComparison = clone(comparison)

    buildRegularExamComparisonReport(comparison)

    expect(comparison).toEqual(originalComparison)
  })

  it('no importa motor viejo ni adaptador legacy', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/examEngine/comparison/buildRegularExamComparisonReport.js'),
      'utf8',
    )
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const adapter = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(adapter)
  })
})
