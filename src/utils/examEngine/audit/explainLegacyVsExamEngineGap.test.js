import { describe, expect, it } from 'vitest'
import { explainLegacyVsExamEngineGap } from './explainLegacyVsExamEngineGap.js'

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
    summary: {
      legacyMesas: 2,
      examEngineRawMesas: 5,
      fairComparison: false,
    },
    scenarios: {
      legacy_raw: {
        counts: {
          requiresMesa: 3,
          totalFinalMesas: 2,
          mesasBeforeCompaction: 3,
          mesasAfterCompaction: 2,
          cantidadLlamados: 2,
        },
        subjectSets: {
          requiredKeys: ['plan:p1::materia:m1', 'plan:p1::materia:m2', 'plan:p1::materia:m3'],
          notRequiredKeys: [],
          catalog: {
            'plan:p1::materia:m1': subjectLabel(),
            'plan:p1::materia:m2': subjectLabel({ key: 'plan:p1::materia:m2', materiaCodigo: 'M2' }),
            'plan:p1::materia:m3': subjectLabel({ key: 'plan:p1::materia:m3', materiaCodigo: 'M3' }),
          },
          finalOccurrences: {
            'plan:p1::materia:m1': { occurrences: 1, calls: ['Primer llamado'] },
            'plan:p1::materia:m2': { occurrences: 1, calls: ['Primer llamado'] },
          },
        },
      },
      examEngine_raw: {
        counts: {
          requiresMesa: 3,
          totalFinalMesas: 5,
          mesasBeforeCompaction: 5,
          mesasAfterCompaction: 5,
          cantidadLlamados: 2,
        },
        subjectSets: {
          requiredKeys: ['plan:p1::materia:m1', 'plan:p1::materia:m2', 'plan:p1::materia:m3'],
          notRequiredKeys: [],
          catalog: {
            'plan:p1::materia:m1': subjectLabel(),
            'plan:p1::materia:m2': subjectLabel({ key: 'plan:p1::materia:m2', materiaCodigo: 'M2' }),
            'plan:p1::materia:m3': subjectLabel({ key: 'plan:p1::materia:m3', materiaCodigo: 'M3' }),
          },
          finalOccurrences: {
            'plan:p1::materia:m1': { occurrences: 2, calls: ['Primer llamado', 'Segundo llamado'] },
            'plan:p1::materia:m2': { occurrences: 2, calls: ['Primer llamado', 'Segundo llamado'] },
            'plan:p1::materia:m3': { occurrences: 1, calls: ['Primer llamado'] },
          },
        },
      },
    },
    rootCauseAnalysis: [
      { code: 'WEAK_SUBJECT_KEYS', count: 0 },
      { code: 'MISSING_DOCENTE_MATERIA', count: 3 },
    ],
    ...overrides,
  }
}

function compactionAudit(overrides = {}) {
  return {
    summary: {
      legacyReductionByCompaction: 1,
      legacyCompactionCases: 1,
      doNotReplicateWithoutPlanId: 0,
      ...overrides,
    },
  }
}

describe('explainLegacyVsExamEngineGap', () => {
  it('calcula brecha total', () => {
    const result = explainLegacyVsExamEngineGap({
      universeComparison: universeComparison(),
      legacyCompactionAudit: compactionAudit(),
    })

    expect(result.summary.totalGap).toBe(3)
  })

  it('resta compactacion legacy', () => {
    const result = explainLegacyVsExamEngineGap({
      universeComparison: universeComparison(),
      legacyCompactionAudit: compactionAudit(),
    })

    expect(result.summary.explainedByLegacyCompaction).toBe(1)
    expect(result.summary.remainingGap).toBe(2)
  })

  it('detecta brecha restante', () => {
    const result = explainLegacyVsExamEngineGap({
      universeComparison: universeComparison(),
      legacyCompactionAudit: compactionAudit({ legacyReductionByCompaction: 0 }),
    })

    expect(result.summary.remainingGap).toBe(3)
  })

  it('clasifica separacion por llamados', () => {
    const result = explainLegacyVsExamEngineGap({
      universeComparison: universeComparison(),
      legacyCompactionAudit: compactionAudit(),
    })

    expect(result.summary.explainedByCallSplit).toBe(2)
    expect(result.gapCases).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gap_type: 'NEW_ENGINE_SPLITS_BY_CALL',
        possible_call_split: true,
      }),
    ]))
  })

  it('clasifica diferencia por definicion de mesa', () => {
    const result = explainLegacyVsExamEngineGap({
      universeComparison: universeComparison({
        summary: {
          legacyMesas: 2,
          examEngineRawMesas: 4,
        },
        scenarios: {
          legacy_raw: {
            counts: {
              requiresMesa: 2,
              totalFinalMesas: 2,
              mesasBeforeCompaction: 2,
            },
            subjectSets: {
              requiredKeys: [],
              catalog: {},
              finalOccurrences: {},
            },
          },
          examEngine_raw: {
            counts: {
              requiresMesa: 4,
              totalFinalMesas: 4,
              mesasBeforeCompaction: 4,
              mesasAfterCompaction: 4,
            },
            subjectSets: {
              requiredKeys: [],
              catalog: {},
              finalOccurrences: {},
            },
          },
        },
      }),
      legacyCompactionAudit: compactionAudit({ legacyReductionByCompaction: 0 }),
    })

    expect(result.summary.explainedByDifferentTableDefinition).toBe(2)
    expect(result.gapBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ cause: 'DIFFERENT_TABLE_DEFINITION' }),
    ]))
  })

  it('marca comparacion final como injusta si los universos finales no son equivalentes', () => {
    const result = explainLegacyVsExamEngineGap({
      universeComparison: universeComparison(),
      legacyCompactionAudit: compactionAudit(),
    })

    expect(result.summary.safeToCompareFinalTotals).toBe(false)
  })

  it('marca safeToReplaceLegacy false si queda brecha sin explicar', () => {
    const result = explainLegacyVsExamEngineGap({
      universeComparison: universeComparison({
        summary: {
          legacyMesas: 2,
          examEngineRawMesas: 6,
        },
      }),
      legacyCompactionAudit: compactionAudit({ legacyReductionByCompaction: 1 }),
    })

    expect(result.summary.unexplainedGap).toBeGreaterThanOrEqual(0)
    expect(result.summary.safeToReplaceLegacy).toBe(false)
  })

  it('no muta inputs', () => {
    const comparison = universeComparison()
    const compaction = compactionAudit()
    const before = JSON.stringify({ comparison, compaction })

    explainLegacyVsExamEngineGap({
      universeComparison: comparison,
      legacyCompactionAudit: compaction,
    })

    expect(JSON.stringify({ comparison, compaction })).toBe(before)
  })

  it('no expone nombres completos en warnings/errors', () => {
    const result = explainLegacyVsExamEngineGap({
      snapshot: {
        docentes: [{ docente: 'Nombre Personal Reservado' }],
      },
      universeComparison: universeComparison(),
      legacyCompactionAudit: compactionAudit(),
    })
    const serialized = JSON.stringify({
      warnings: result.warnings,
      errors: result.errors,
      rootCauseAnalysis: result.rootCauseAnalysis,
    })

    expect(serialized).not.toContain('Nombre Personal Reservado')
  })
})
