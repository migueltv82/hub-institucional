import { describe, expect, it } from 'vitest'
import {
  AUGUST_READINESS_STATUS,
  buildAugustReadinessReport,
} from './buildAugustReadinessReport.js'

function currentAuditFiles(overrides = {}) {
  const base = {
    halfPlusOneRuleChange: {
      summary: {
        totalTeachers: 59,
        teachersWithoutTeachingHours: 1,
        legacyTotalCapacityPerCall: 105,
        teachingHoursTotalCapacityPerCall: 255,
        capacityDeltaPerCall: 150,
        ruleScope: 'COMMON_VOCALIAS_PER_CALL',
        attendanceEligibilityMaintained: true,
        currentRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
        teachingHoursSource: 'TEACHING_HOURS_INFERRED_FROM_SCHEDULE',
      },
    },
    dateVocalAssignmentOrder: {
      summary: {
        detectedFlow: 'VOCALS_FIRST_THEN_DATE_WITH_REPAIR_AFTER_FAILURE',
        currentCompletionRate: 0.4231,
        principalRegressionCause: 'VOCALS_ASSIGNED_BEFORE_DATE_AVAILABILITY',
      },
    },
    jointDateVocalPlanner: {
      summary: {
        safeToReplaceLegacy: false,
        readyForOfficialGeneration: false,
        currentCompletionRate: 0.4231,
        jointCompletionRate: 0.5896,
        completionDelta: 0.1665,
        identityV2PendingHomonymies: 34,
        readyForIdentityV2: false,
      },
      modes: [
        {
          name: 'jointDateVocalPlanner',
          totalMesas: 268,
          totalPlanned: 158,
          mesasSinFecha: 110,
          completionRate: 0.5896,
          docentesSobreutilizados: 0,
          consumoCupo: { maxUsoCupo: 0.75 },
        },
      ],
    },
    vocalRepairPass: {
      summary: {
        safeToReplaceLegacy: false,
        readyForOfficialGeneration: false,
        incompleteTribunalsInitial: 122,
        repairedWithTwoVocales: 0,
        repairedWithOneVocal: 0,
        completionAfter: 0.5896,
        identityV2PendingHomonymies: 34,
        readyForIdentityV2: false,
      },
    },
    rescheduleIncompleteTribunals: {
      summary: {
        safeToReplaceLegacy: false,
        readyForOfficialGeneration: false,
        rescheduledComplete: 0,
        rescheduledMinimumReview: 16,
        completionAfter: 0.5896,
        identityV2PendingHomonymies: 34,
        readyForIdentityV2: false,
      },
    },
    schedulingFeasibilityCapacity: {
      summary: {
        safeToReplaceLegacy: false,
        readyForOfficialGeneration: false,
        totalMesasAnalizadas: 268,
        fullFeasible: 36,
        minimumReviewFeasible: 16,
        calendarTooRestrictive: 4,
        blockedBySuperposition: 212,
        topCuello: 'BLOCKED_BY_SUPERPOSITION',
        identityV2PendingHomonymies: 34,
        readyForIdentityV2: false,
      },
    },
    calendarExpansionScenarios: {
      summary: {
        safeToReplaceLegacy: false,
        readyForOfficialGeneration: false,
        readyForAugustSupportPreview: true,
        totalMesas: 268,
        bestScenario: 'SPREAD_BY_CRITICAL_SUBJECTS',
        bestScenarioFull: 44,
        bestScenarioMinimumReview: 20,
        bestScenarioManual: 204,
        bestScenarioBlockedBySuperposition: 200,
        minimumExtraDatesForFirstImprovement: 2,
        docentesExcedidos: 0,
        maxUsoCupo: 1,
        identityV2PendingHomonymies: 34,
        readyForIdentityV2: false,
      },
      bestScenario: {
        scenario: 'SPREAD_BY_CRITICAL_SUBJECTS',
        simulatedDates: [
          {
            fecha: '2026-08-06',
            diaSemana: 'JUEVES',
            llamado: 'PRIMER_LLAMADO',
            turno: 'NOCHE',
            isSimulated: true,
          },
        ],
      },
    },
    v2SubjectCodeLowRiskConfirmed: {
      summary: {
        totalReviewRows: 134,
        correctedRows: 100,
        pendingRows: 34,
        missingFinalCode: 34,
        homonymyRiskRows: 34,
        readyForIdentityV2: false,
        readyForCompactFinalTableComparison: false,
        safeToReplaceLegacy: false,
      },
    },
  }

  return {
    ...base,
    ...overrides,
  }
}

describe('buildAugustReadinessReport', () => {
  it('clasifica READY_FOR_INTERNAL_PREVIEW_ONLY con datos actuales', () => {
    const report = buildAugustReadinessReport({ auditFiles: currentAuditFiles() })

    expect(report.readinessStatus).toBe(AUGUST_READINESS_STATUS.READY_FOR_INTERNAL_PREVIEW_ONLY)
    expect(report.summary.readyForOfficialGeneration).toBe(false)
    expect(report.recommendedUse).toContain('Preview interno')
  })

  it('no permite READY_FOR_OFFICIAL_USE si safeToReplaceLegacy es false', () => {
    const report = buildAugustReadinessReport({
      auditFiles: currentAuditFiles({
        calendarExpansionScenarios: {
          summary: {
            safeToReplaceLegacy: false,
            readyForOfficialGeneration: true,
            readyForAugustSupportPreview: true,
            totalMesas: 10,
            bestScenarioFull: 10,
            bestScenarioMinimumReview: 0,
            bestScenarioManual: 0,
            bestScenarioBlockedBySuperposition: 0,
            docentesExcedidos: 0,
            readyForIdentityV2: true,
          },
        },
        v2SubjectCodeLowRiskConfirmed: {
          summary: {
            totalReviewRows: 10,
            correctedRows: 10,
            pendingRows: 0,
            homonymyRiskRows: 0,
            readyForIdentityV2: true,
            readyForCompactFinalTableComparison: true,
            safeToReplaceLegacy: false,
          },
        },
      }),
    })

    expect(report.readinessStatus).not.toBe(AUGUST_READINESS_STATUS.READY_FOR_OFFICIAL_USE)
    expect(report.summary.safeToReplaceLegacy).toBe(false)
  })

  it('marca identidad v2 pendiente si hay 34 homonimias', () => {
    const report = buildAugustReadinessReport({ auditFiles: currentAuditFiles() })

    expect(report.identityV2Status.pendingHomonymies).toBe(34)
    expect(report.identityV2Status.readyForIdentityV2).toBe(false)
    expect(report.blockers.map((blocker) => blocker.code)).toContain('IDENTITY_V2_PENDING_HOMONYMIES')
  })

  it('detecta superposicion como blocker dominante', () => {
    const report = buildAugustReadinessReport({ auditFiles: currentAuditFiles() })

    expect(report.blockers.map((blocker) => blocker.code)).toContain('SUPERPOSITION_DOMINANT_BLOCKER')
    expect(report.summary.dominantBlocker).toBe('SUPERPOSITION_DOMINANT_BLOCKER')
    expect(report.riskMatrix.find((risk) => risk.code === 'SUPERPOSITION_DOMINANT_BLOCKER'))
      .toEqual(expect.objectContaining({ level: 'critico' }))
  })

  it('genera matriz de riesgos y acciones siguientes', () => {
    const report = buildAugustReadinessReport({ auditFiles: currentAuditFiles() })

    expect(report.riskMatrix.map((risk) => risk.code)).toEqual(expect.arrayContaining([
      'IDENTITY_V2_PENDING_HOMONYMIES',
      'SUPERPOSITION_DOMINANT_BLOCKER',
      'CALENDAR_COMPRESSION',
      'INCOMPLETE_TRIBUNALS',
      'MANUAL_CASES_TOO_HIGH',
      'NOT_LEGACY_EQUIVALENT',
      'HOURS_CHAIR_INFERRED_NOT_EXPLICIT',
      'PREVIEW_ONLY_NOT_OFFICIAL',
    ]))
    expect(report.nextActions.length).toBeGreaterThan(0)
  })

  it('tolera archivos faltantes', () => {
    const report = buildAugustReadinessReport({
      auditFiles: {
        calendarExpansionScenarios: currentAuditFiles().calendarExpansionScenarios,
      },
    })

    expect(report.missingInputs.length).toBeGreaterThan(0)
    expect(report.warnings.join(' ')).toContain('Falta insumo')
  })

  it('no muta inputs', () => {
    const auditFiles = currentAuditFiles()
    const original = structuredClone(auditFiles)

    buildAugustReadinessReport({ auditFiles })

    expect(auditFiles).toEqual(original)
  })

  it('no expone nombres completos en warnings/errors', () => {
    const report = buildAugustReadinessReport({
      auditFiles: currentAuditFiles({
        halfPlusOneRuleChange: {
          summary: {
            currentRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
            attendanceEligibilityMaintained: true,
            teachingHoursSource: 'TEACHING_HOURS_INFERRED_FROM_SCHEDULE',
            teachersWithoutTeachingHours: 1,
            note: 'Nombre Personal Sensible',
          },
        },
      }),
    })
    const serialized = JSON.stringify({
      warnings: report.warnings,
      errors: report.errors,
      summary: report.summary,
    })

    expect(serialized).not.toContain('Nombre Personal Sensible')
    expect(report.privacy.noFullTeacherNames).toBe(true)
  })
})
