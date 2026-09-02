import { describe, expect, it } from 'vitest'
import { legacyWorkspaceSnapshot } from '../comparison/__fixtures__/legacyWorkspaceSnapshot.fixture.js'
import { auditRescheduleIncompleteTribunals } from './auditRescheduleIncompleteTribunals.js'

describe('auditRescheduleIncompleteTribunals', () => {
  it('compara base, reparacion de fecha fija y reprogramacion fecha+vocales', () => {
    const result = auditRescheduleIncompleteTribunals({ snapshot: legacyWorkspaceSnapshot })

    expect(result.summary).toMatchObject({
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      identityV2PendingHomonymies: 34,
      readyForIdentityV2: false,
    })
    expect(result.modes.map((mode) => mode.name)).toEqual([
      'jointDateVocalPlannerSupport',
      'jointDateVocalPlannerPlusFixedDateVocalRepair',
      'jointDateVocalPlannerPlusDateAndVocalReschedule',
    ])
    expect(result.delta).toHaveProperty('rescheduleVsBase')
    expect(result.rescheduleSummary).toHaveProperty('rescheduleAttempts')
  })

  it('expone metricas institucionales de cupo, fechas y revision manual', () => {
    const result = auditRescheduleIncompleteTribunals({ snapshot: legacyWorkspaceSnapshot })

    result.modes.forEach((mode) => {
      expect(mode).toEqual(expect.objectContaining({
        totalPlanned: expect.any(Number),
        tribunalesCompletosDosVocales: expect.any(Number),
        tribunalesMinimosUnVocal: expect.any(Number),
        tribunalesSoloTitular: expect.any(Number),
        mesasSinFecha: expect.any(Number),
        pendientesRevisionManual: expect.any(Number),
        tribunalesIncompletos: expect.any(Number),
        superposiciones: expect.any(Number),
        docentesExcedidos: expect.any(Number),
        maxUsoCupo: expect.any(Number),
        cambiosFechaRealizados: expect.any(Number),
        cambiosFechaExitosos: expect.any(Number),
      }))
    })
  })

  it('no muta el snapshot original', () => {
    const snapshot = structuredClone(legacyWorkspaceSnapshot)
    const original = structuredClone(snapshot)

    auditRescheduleIncompleteTribunals({ snapshot })

    expect(snapshot).toEqual(original)
  })

  it('no expone nombres personales en resumen, casos ni diagnosticos', () => {
    const result = auditRescheduleIncompleteTribunals({ snapshot: legacyWorkspaceSnapshot })
    const serialized = JSON.stringify({
      summary: result.summary,
      modes: result.modes,
      delta: result.delta,
      fixedRepairSummary: result.fixedRepairSummary,
      rescheduleSummary: result.rescheduleSummary,
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
