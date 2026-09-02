import { describe, expect, it } from 'vitest'
import { legacyWorkspaceSnapshot } from '../comparison/__fixtures__/legacyWorkspaceSnapshot.fixture.js'
import {
  ASSIGNMENT_ORDER_MODES,
  auditDateVocalAssignmentOrder,
} from './auditDateVocalAssignmentOrder.js'

describe('auditDateVocalAssignmentOrder', () => {
  it('detecta el flujo actual como vocales antes de fecha con reparacion posterior', () => {
    const result = auditDateVocalAssignmentOrder({ snapshot: legacyWorkspaceSnapshot })

    expect(result.summary.detectedFlow).toBe('VOCALS_FIRST_THEN_DATE_WITH_REPAIR_AFTER_FAILURE')
    expect(result.flowDiagnostics.classification).toEqual([
      'VOCALS_FIRST_THEN_DATE',
      'REPAIR_AFTER_FAILURE',
    ])
    expect(result.modes.map((mode) => mode.name)).toEqual(expect.arrayContaining([
      ASSIGNMENT_ORDER_MODES.CURRENT_ORDER,
      ASSIGNMENT_ORDER_MODES.DATE_AWARE_VOCAL_SELECTION,
      ASSIGNMENT_ORDER_MODES.DATE_FIRST_THEN_VOCALS,
      ASSIGNMENT_ORDER_MODES.JOINT_DATE_VOCAL_SCORING,
    ]))
  })

  it('mantiene current strategy disponible y marca experimentos como simulacion', () => {
    const result = auditDateVocalAssignmentOrder({ snapshot: legacyWorkspaceSnapshot })
    const current = result.modes.find((mode) => mode.name === ASSIGNMENT_ORDER_MODES.CURRENT_ORDER)
    const experimental = result.modes.filter((mode) => mode.name !== ASSIGNMENT_ORDER_MODES.CURRENT_ORDER)

    expect(current).toMatchObject({
      evidenceType: 'engine-real',
    })
    expect(experimental.every((mode) => mode.evidenceType === 'experimental-simulation')).toBe(true)
  })

  it('no muta el snapshot original', () => {
    const snapshot = structuredClone(legacyWorkspaceSnapshot)
    const original = structuredClone(snapshot)

    auditDateVocalAssignmentOrder({ snapshot })

    expect(snapshot).toEqual(original)
  })

  it('no expone nombres personales en warnings/errors ni casos', () => {
    const result = auditDateVocalAssignmentOrder({ snapshot: legacyWorkspaceSnapshot })
    const serialized = JSON.stringify({
      summary: result.summary,
      modes: result.modes,
      caseRows: result.caseRows,
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Ana Ingles')
    expect(serialized).not.toContain('Bruno Ingles')
  })
})
