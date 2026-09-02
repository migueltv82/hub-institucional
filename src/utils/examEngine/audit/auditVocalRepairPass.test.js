import { describe, expect, it } from 'vitest'
import { legacyWorkspaceSnapshot } from '../comparison/__fixtures__/legacyWorkspaceSnapshot.fixture.js'
import { auditVocalRepairPass } from './auditVocalRepairPass.js'

describe('auditVocalRepairPass', () => {
  it('compara jointDateVocalPlanner apoyo contra la segunda pasada de reparacion', () => {
    const result = auditVocalRepairPass({ snapshot: legacyWorkspaceSnapshot })

    expect(result.summary).toMatchObject({
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      identityV2PendingHomonymies: 34,
      readyForIdentityV2: false,
    })
    expect(result.modes.map((mode) => mode.name)).toEqual([
      'jointDateVocalPlannerSupport',
      'jointDateVocalPlannerSupportPlusVocalRepair',
    ])
    expect(result.delta).toHaveProperty('completionRate')
    expect(result.incompleteAudit.summary).toHaveProperty('totalIncompleteTribunals')
    expect(result.repairSummary).toHaveProperty('repairAttempts')
  })

  it('mantiene metricas de cupo y revision manual en ambos modos', () => {
    const result = auditVocalRepairPass({ snapshot: legacyWorkspaceSnapshot })

    result.modes.forEach((mode) => {
      expect(mode).toEqual(expect.objectContaining({
        totalPlanned: expect.any(Number),
        tribunalesCompletosDosVocales: expect.any(Number),
        tribunalesMinimosUnVocal: expect.any(Number),
        tribunalesSoloTitular: expect.any(Number),
        mesasSinFecha: expect.any(Number),
        pendientesRevisionManual: expect.any(Number),
        docentesSobreutilizados: expect.any(Number),
        maxUsoCupo: expect.any(Number),
        superposiciones: expect.any(Number),
        reparacionesIntentadas: expect.any(Number),
        reparacionesExitosas: expect.any(Number),
      }))
      expect(mode.consumoCupo).toHaveProperty('docentesExcedidos')
    })
  })

  it('no muta el snapshot original', () => {
    const snapshot = structuredClone(legacyWorkspaceSnapshot)
    const original = structuredClone(snapshot)

    auditVocalRepairPass({ snapshot })

    expect(snapshot).toEqual(original)
  })

  it('no expone nombres personales en resumen, casos ni diagnosticos', () => {
    const result = auditVocalRepairPass({ snapshot: legacyWorkspaceSnapshot })
    const serialized = JSON.stringify({
      summary: result.summary,
      modes: result.modes,
      delta: result.delta,
      repairSummary: result.repairSummary,
      caseRows: result.caseRows,
      recommendations: result.recommendations,
      warnings: result.warnings,
      errors: result.errors,
      privacy: result.privacy,
    })

    expect(serialized).not.toContain('Ana Ingles')
    expect(serialized).not.toContain('Bruno Ingles')
    expect(serialized).not.toContain('Carla Programacion')
    expect(result.privacy.noFullTeacherNames).toBe(true)
  })
})
