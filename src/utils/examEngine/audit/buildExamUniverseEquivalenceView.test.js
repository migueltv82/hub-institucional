import { describe, expect, it } from 'vitest'
import { buildExamUniverseEquivalenceView } from './buildExamUniverseEquivalenceView.js'

function subjectLabel(overrides = {}) {
  return {
    key: 'plan:p1::materia:m1',
    keyType: 'PLAN_CODE',
    weakKey: false,
    planId: 'P1',
    materiaCodigo: 'M1',
    carrera: 'Carrera A',
    materiaNombre: 'Materia Uno',
    anio: '1',
    ...overrides,
  }
}

function universeComparison(overrides = {}) {
  return {
    scenarios: {
      legacy_raw: {
        counts: {
          requiresMesa: 1,
          totalFinalMesas: 1,
        },
        subjectSets: {
          requiredKeys: ['plan:p1::materia:m1'],
          catalog: {
            'plan:p1::materia:m1': subjectLabel(),
          },
          finalOccurrences: {
            'plan:p1::materia:m1': {
              occurrences: 1,
              calls: ['Primer llamado'],
            },
          },
        },
      },
      examEngine_raw: {
        counts: {
          requiresMesa: 1,
          totalFinalMesas: 2,
        },
        subjectSets: {
          requiredKeys: ['plan:p1::materia:m1'],
          catalog: {
            'plan:p1::materia:m1': subjectLabel(),
          },
          finalOccurrences: {
            'plan:p1::materia:m1': {
              occurrences: 2,
              calls: ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO'],
            },
          },
        },
      },
    },
    ...overrides,
  }
}

function legacyMesa(overrides = {}) {
  return {
    carrera: 'Carrera A',
    anio: '1',
    llamado: 'Primer llamado',
    profesorTitular: 'Docente Reservado Completo',
    materiasAgrupadas: [
      {
        carrera: 'Carrera A',
        anio: '1',
        plan_id: 'P1',
        materia_codigo: 'M1',
        nombreMateria: 'Materia Uno',
      },
    ],
    ...overrides,
  }
}

describe('buildExamUniverseEquivalenceView', () => {
  it('genera vista de materia requerida', () => {
    const result = buildExamUniverseEquivalenceView({
      legacyResult: [legacyMesa()],
      universeComparison: universeComparison(),
    })

    expect(result.requiredSubjectView).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subjectKey: 'plan:p1::materia:m1',
        presentInLegacy: true,
        presentInExamEngine: true,
      }),
    ]))
  })

  it('genera vista materia + llamado', () => {
    const result = buildExamUniverseEquivalenceView({
      legacyResult: [legacyMesa()],
      universeComparison: universeComparison(),
    })

    expect(result.subjectCallView).toEqual(expect.arrayContaining([
      expect.objectContaining({
        subjectCallKey: 'plan:p1::materia:m1::call:PRIMER_LLAMADO',
        presentInLegacy: true,
        presentInExamEngine: true,
      }),
      expect.objectContaining({
        subjectCallKey: 'plan:p1::materia:m1::call:SEGUNDO_LLAMADO',
        presentInLegacy: false,
        presentInExamEngine: true,
      }),
    ]))
  })

  it('genera vista compactada', () => {
    const result = buildExamUniverseEquivalenceView({
      legacyResult: [legacyMesa()],
      universeComparison: universeComparison(),
    })

    expect(result.compactFinalTableView).toHaveLength(1)
    expect(result.compactFinalTableView[0]).toMatchObject({
      sourceLevel: 'compactFinalTable',
      legacyEquivalent: true,
      examEngineEquivalent: true,
    })
  })

  it('marca weak key si falta plan_id + materia_codigo', () => {
    const weakKey = 'weak::carreraa::materiauno::1'
    const result = buildExamUniverseEquivalenceView({
      legacyResult: [
        legacyMesa({
          materiasAgrupadas: [
            {
              carrera: 'Carrera A',
              anio: '1',
              nombreMateria: 'Materia Uno',
            },
          ],
        }),
      ],
      universeComparison: universeComparison({
        scenarios: {
          legacy_raw: {
            counts: { requiresMesa: 1 },
            subjectSets: {
              requiredKeys: [weakKey],
              catalog: {
                [weakKey]: subjectLabel({
                  key: weakKey,
                  keyType: 'WEAK_KEY',
                  weakKey: true,
                  planId: '',
                  materiaCodigo: '',
                }),
              },
              finalOccurrences: {
                [weakKey]: { occurrences: 1, calls: ['Primer llamado'] },
              },
            },
          },
          examEngine_raw: {
            counts: { requiresMesa: 1 },
            subjectSets: {
              requiredKeys: [weakKey],
              catalog: {
                [weakKey]: subjectLabel({
                  key: weakKey,
                  keyType: 'WEAK_KEY',
                  weakKey: true,
                  planId: '',
                  materiaCodigo: '',
                }),
              },
              finalOccurrences: {
                [weakKey]: { occurrences: 1, calls: ['PRIMER_LLAMADO'] },
              },
            },
          },
        },
      }),
    })

    expect(result.requiredSubjectView[0].riskFlags).toContain('WEAK_KEY')
    expect(result.summary.weakKeyCount).toBe(1)
  })

  it('detecta separacion por llamado', () => {
    const result = buildExamUniverseEquivalenceView({
      legacyResult: [legacyMesa()],
      universeComparison: universeComparison(),
    })

    const secondCall = result.subjectCallView.find((row) => row.callNumber === 'SEGUNDO_LLAMADO')
    expect(secondCall).toMatchObject({
      presentInLegacy: false,
      presentInExamEngine: true,
      difference: 1,
    })
  })

  it('detecta riesgo Laboratorio sin plan_id', () => {
    const weakKey = 'weak::tecnicaturasuperiorenlaboratorio::quimicageneral::1'
    const result = buildExamUniverseEquivalenceView({
      legacyResult: [
        legacyMesa({
          carrera: 'Tecnicatura Superior en Laboratorio',
          materiasAgrupadas: [
            {
              carrera: 'Tecnicatura Superior en Laboratorio',
              anio: '1',
              nombreMateria: 'Quimica General',
            },
          ],
        }),
      ],
      universeComparison: universeComparison({
        scenarios: {
          legacy_raw: {
            counts: { requiresMesa: 1 },
            subjectSets: {
              requiredKeys: [weakKey],
              catalog: {
                [weakKey]: subjectLabel({
                  key: weakKey,
                  keyType: 'WEAK_KEY',
                  weakKey: true,
                  carrera: 'Tecnicatura Superior en Laboratorio',
                  planId: '',
                  materiaCodigo: '',
                }),
              },
              finalOccurrences: {
                [weakKey]: { occurrences: 1, calls: ['Primer llamado'] },
              },
            },
          },
          examEngine_raw: {
            counts: { requiresMesa: 1 },
            subjectSets: {
              requiredKeys: [weakKey],
              catalog: {
                [weakKey]: subjectLabel({
                  key: weakKey,
                  keyType: 'WEAK_KEY',
                  weakKey: true,
                  carrera: 'Tecnicatura Superior en Laboratorio',
                  planId: '',
                  materiaCodigo: '',
                }),
              },
              finalOccurrences: {
                [weakKey]: { occurrences: 1, calls: ['PRIMER_LLAMADO'] },
              },
            },
          },
        },
      }),
    })

    expect(result.requiredSubjectView[0].riskFlags).toContain('LABORATORIO_MULTIPLAN_RISK')
    expect(result.summary.laboratorioRiskCount).toBe(1)
  })

  it('marca compactacion audit-only si depende de clave debil', () => {
    const result = buildExamUniverseEquivalenceView({
      legacyResult: [
        legacyMesa({
          materiasAgrupadas: [
            {
              carrera: 'Carrera A',
              anio: '1',
              nombreMateria: 'Materia Uno',
            },
          ],
        }),
      ],
      universeComparison: universeComparison({ scenarios: { legacy_raw: {}, examEngine_raw: {} } }),
    })

    expect(result.compactFinalTableView[0].safety).toBe('AUDIT_ONLY_WEAK_KEY')
  })

  it('marca safeToReplaceLegacy false si la equivalencia no esta cerrada', () => {
    const result = buildExamUniverseEquivalenceView({
      legacyResult: [legacyMesa()],
      universeComparison: universeComparison(),
    })

    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('no muta inputs', () => {
    const comparison = universeComparison()
    const legacyResult = [legacyMesa()]
    const before = JSON.stringify({ comparison, legacyResult })

    buildExamUniverseEquivalenceView({
      legacyResult,
      universeComparison: comparison,
    })

    expect(JSON.stringify({ comparison, legacyResult })).toBe(before)
  })

  it('no expone nombres completos en warnings/errors', () => {
    const result = buildExamUniverseEquivalenceView({
      snapshot: {
        docentes: [{ docente: 'Nombre Personal Reservado' }],
      },
      legacyResult: [legacyMesa()],
      universeComparison: universeComparison(),
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Nombre Personal Reservado')
    expect(serialized).not.toContain('Docente Reservado Completo')
  })
})
