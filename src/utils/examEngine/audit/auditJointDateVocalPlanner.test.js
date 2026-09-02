import { describe, expect, it } from 'vitest'
import { legacyWorkspaceSnapshot } from '../comparison/__fixtures__/legacyWorkspaceSnapshot.fixture.js'
import { auditJointDateVocalPlanner } from './auditJointDateVocalPlanner.js'

describe('auditJointDateVocalPlanner', () => {
  it('compara currentOrder con jointDateVocalPlanner y mantiene safeToReplaceLegacy false', () => {
    const result = auditJointDateVocalPlanner({ snapshot: legacyWorkspaceSnapshot })

    expect(result.summary.safeToReplaceLegacy).toBe(false)
    expect(result.summary.readyForOfficialGeneration).toBe(false)
    expect(result.modes.map((mode) => mode.name)).toEqual(expect.arrayContaining([
      'currentOrder',
      'jointDateVocalPlanner',
      'jointDateVocalPlannerOneVocalMinimum',
    ]))
    expect(result.delta).toHaveProperty('completionRate')
  })

  it('expone estado pendiente de identidad v2', () => {
    const result = auditJointDateVocalPlanner({ snapshot: legacyWorkspaceSnapshot })

    expect(result.summary).toMatchObject({
      identityV2PendingHomonymies: 34,
      readyForIdentityV2: false,
    })
  })

  it('no muta el snapshot original', () => {
    const snapshot = structuredClone(legacyWorkspaceSnapshot)
    const original = structuredClone(snapshot)

    auditJointDateVocalPlanner({ snapshot })

    expect(snapshot).toEqual(original)
  })

  it('no expone nombres personales en casos ni diagnosticos', () => {
    const result = auditJointDateVocalPlanner({ snapshot: legacyWorkspaceSnapshot })
    const serialized = JSON.stringify({
      summary: result.summary,
      delta: result.delta,
      caseRows: result.caseRows,
      diagnostics: result.jointPlannerDiagnostics,
      warnings: result.warnings,
      errors: result.errors,
    })

    expect(serialized).not.toContain('Ana Ingles')
    expect(serialized).not.toContain('Bruno Ingles')
    expect(result.privacy.noFullTeacherNames).toBe(true)
  })
})
