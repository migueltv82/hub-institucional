export const AUGUST_READINESS_STATUS = Object.freeze({
  NOT_READY: 'NOT_READY',
  READY_FOR_INTERNAL_PREVIEW_ONLY: 'READY_FOR_INTERNAL_PREVIEW_ONLY',
  READY_FOR_ASSISTED_DRAFT: 'READY_FOR_ASSISTED_DRAFT',
  READY_FOR_HUMAN_REVIEW_PILOT: 'READY_FOR_HUMAN_REVIEW_PILOT',
  READY_FOR_OFFICIAL_USE: 'READY_FOR_OFFICIAL_USE',
})

export const AUGUST_READINESS_AUDIT_INPUTS = Object.freeze({
  halfPlusOneRuleChange: 'local-audit/half_plus_one_rule_change_audit.summary.json',
  dateVocalAssignmentOrder: 'local-audit/date_vocal_assignment_order_audit.summary.json',
  jointDateVocalPlanner: 'local-audit/joint_date_vocal_planner_audit.summary.json',
  vocalRepairPass: 'local-audit/vocal_repair_pass_audit.summary.json',
  rescheduleIncompleteTribunals: 'local-audit/reschedule_incomplete_tribunals_audit.summary.json',
  schedulingFeasibilityCapacity: 'local-audit/scheduling_feasibility_capacity_audit.summary.json',
  calendarExpansionScenarios: 'local-audit/calendar_expansion_scenarios_audit.summary.json',
  v2SubjectCodeLowRiskConfirmed: 'local-audit/v2_subject_code.low_risk_confirmed.validation.summary.json',
  v2SubjectCodeHomonymiesApplied: 'local-audit/v2_subject_code.homonymies_applied.validation.summary.json',
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number))
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function readInput(auditFiles = {}, key = '') {
  if (Object.prototype.hasOwnProperty.call(auditFiles, key)) return auditFiles[key]
  const filePath = AUGUST_READINESS_AUDIT_INPUTS[key]
  if (filePath && Object.prototype.hasOwnProperty.call(auditFiles, filePath)) return auditFiles[filePath]
  return null
}

function getSummary(report = {}) {
  if (!report || typeof report !== 'object') return {}
  return report.summary && typeof report.summary === 'object' ? report.summary : report
}

function findMode(report = {}, modeName = '') {
  return asArray(report?.modes).find((mode) => clean(mode.name) === modeName) ?? {}
}

function findCalendarBest(report = {}) {
  return report?.bestScenario ?? getSummary(report)
}

function getIdentitySummary(audits = {}) {
  const homonymiesApplied = getSummary(audits.v2SubjectCodeHomonymiesApplied)
  const lowRisk = getSummary(audits.v2SubjectCodeLowRiskConfirmed)
  const selected = Object.keys(homonymiesApplied).length ? homonymiesApplied : lowRisk
  const pending = numberOrZero(
    selected.pendingRows ??
    selected.homonymyRiskRows ??
    selected.unconfirmedRows ??
    selected.missingFinalCode,
  )

  return {
    totalSubjects: numberOrZero(selected.totalReviewRows),
    correctedRows: numberOrZero(selected.correctedRows),
    pendingHomonymies: pending,
    pendingRows: numberOrZero(selected.pendingRows),
    missingFinalCode: numberOrZero(selected.missingFinalCode),
    readyForIdentityV2: selected.readyForIdentityV2 === true,
    readyForCompactFinalTableComparison: selected.readyForCompactFinalTableComparison === true,
    safeToReplaceLegacy: selected.safeToReplaceLegacy === true,
    source: Object.keys(homonymiesApplied).length
      ? 'homonymies_applied'
      : 'low_risk_confirmed',
  }
}

function buildMissingInputs(audits = {}, expectedKeys = Object.keys(AUGUST_READINESS_AUDIT_INPUTS)) {
  return expectedKeys
    .filter((key) => !audits[key])
    .map((key) => ({
      key,
      path: AUGUST_READINESS_AUDIT_INPUTS[key],
      severity: ['halfPlusOneRuleChange', 'schedulingFeasibilityCapacity', 'calendarExpansionScenarios']
        .includes(key)
        ? 'high'
        : 'medium',
    }))
}

function buildRuleComplianceStatus(audits = {}) {
  const half = getSummary(audits.halfPlusOneRuleChange)
  const calendar = getSummary(audits.calendarExpansionScenarios)
  const supportMode = findMode(audits.jointDateVocalPlanner, 'jointDateVocalPlanner')
  const calendarBest = findCalendarBest(audits.calendarExpansionScenarios)
  const docentesExcedidos = numberOrZero(
    calendar.docentesExcedidos ??
    calendarBest.docentesExcedidos ??
    supportMode.docentesSobreutilizados,
  )
  const maxUsoCupo = numberOrZero(calendarBest.maxUsoCupo ?? supportMode.consumoCupo?.maxUsoCupo)

  return {
    halfPlusOneMode: half.currentRuleMode ?? 'TEACHING_HOURS_HALF_PLUS_ONE',
    ruleScope: half.ruleScope ?? 'COMMON_VOCALIAS_PER_CALL',
    attendanceEligibilityMaintained: half.attendanceEligibilityMaintained === true,
    teachingHoursSource: half.teachingHoursSource ?? '',
    teachersWithoutTeachingHours: numberOrZero(half.teachersWithoutTeachingHours),
    docentesExcedidos,
    maxUsoCupo,
    compliant: (
      (half.currentRuleMode === 'TEACHING_HOURS_HALF_PLUS_ONE' || !half.currentRuleMode) &&
      half.attendanceEligibilityMaintained !== false &&
      docentesExcedidos === 0
    ),
  }
}

function buildOperationalBuckets({ feasibility = {}, calendar = {}, identity = {} } = {}) {
  const total = numberOrZero(calendar.totalMesas ?? feasibility.totalMesasAnalizadas)
  const full = numberOrZero(calendar.bestScenarioFull ?? calendar.baselineFull ?? feasibility.fullFeasible)
  const minimum = numberOrZero(
    calendar.bestScenarioMinimumReview ??
    calendar.baselineMinimumReview ??
    feasibility.minimumReviewFeasible,
  )
  const manual = numberOrZero(calendar.bestScenarioManual ?? calendar.baselineManual)
  const calendarDecision = numberOrZero(
    calendar.bestScenarioBlockedBySuperposition ??
    calendar.baselineBlockedBySuperposition ??
    feasibility.blockedBySuperposition,
  ) + numberOrZero(feasibility.calendarTooRestrictive)
  const identityBlocked = identity.readyForIdentityV2 ? 0 : identity.pendingHomonymies

  return [
    {
      bucket: 'AUTO_FULL_CANDIDATES',
      count: full,
      percentage: total > 0 ? Number((full / total).toFixed(4)) : 0,
      description: 'Mesas full factibles con titular y dos vocales validos.',
      recommendedAction: 'Usar solo como preview interno; validar contra legacy antes de cualquier uso oficial.',
    },
    {
      bucket: 'MINIMUM_REVIEW_CANDIDATES',
      count: minimum,
      percentage: total > 0 ? Number((minimum / total).toFixed(4)) : 0,
      description: 'Mesas minimas con un vocal o revision institucional.',
      recommendedAction: 'Revisar manualmente criterio de tribunal minimo.',
    },
    {
      bucket: 'MANUAL_REQUIRED',
      count: manual,
      percentage: total > 0 ? Number((manual / total).toFixed(4)) : 0,
      description: 'Casos que no quedan listos bajo restricciones actuales.',
      recommendedAction: 'Exportar casos manuales y resolver calendario, disponibilidad o vocales.',
    },
    {
      bucket: 'CALENDAR_DECISION_REQUIRED',
      count: calendarDecision,
      percentage: total > 0 ? Number((calendarDecision / total).toFixed(4)) : 0,
      description: 'Casos dominados por superposicion/calendario.',
      recommendedAction: 'Revisar calendario agosto y docentes cuello de botella.',
    },
    {
      bucket: 'IDENTITY_V2_BLOCKED',
      count: identityBlocked,
      percentage: identity.totalSubjects > 0 ? Number((identityBlocked / identity.totalSubjects).toFixed(4)) : 0,
      description: 'Materias con identidad v2 pendiente de confirmacion.',
      recommendedAction: 'Cerrar homonimias antes de comparacion final compactada.',
    },
  ]
}

function risk(code, level, evidence, recommendedAction) {
  return { code, level, evidence, recommendedAction }
}

function buildRiskMatrix({ identity = {}, feasibility = {}, calendar = {}, repair = {}, rule = {} } = {}) {
  const manual = numberOrZero(calendar.bestScenarioManual ?? calendar.baselineManual)
  const total = numberOrZero(calendar.totalMesas ?? feasibility.totalMesasAnalizadas)
  const manualRatio = total > 0 ? manual / total : 1
  const superposition = numberOrZero(
    calendar.bestScenarioBlockedBySuperposition ??
    calendar.baselineBlockedBySuperposition ??
    feasibility.blockedBySuperposition,
  )
  const incomplete = numberOrZero(repair.incompleteTribunalsInitial ?? repair.finalIncompleteTribunals)

  return [
    risk(
      'IDENTITY_V2_PENDING_HOMONYMIES',
      identity.pendingHomonymies > 0 ? 'alto' : 'bajo',
      `${identity.pendingHomonymies} homonimias/codigos pendientes; readyForIdentityV2=${identity.readyForIdentityV2}.`,
      'Cerrar codigos finales y confirmar homonimias.',
    ),
    risk(
      'SUPERPOSITION_DOMINANT_BLOCKER',
      superposition >= total * 0.5 ? 'critico' : superposition > 0 ? 'alto' : 'bajo',
      `${superposition} casos siguen bloqueados por superposicion/calendario.`,
      'Revisar calendario y docentes cuello de botella.',
    ),
    risk(
      'CALENDAR_COMPRESSION',
      numberOrZero(calendar.minimumExtraDatesForFirstImprovement) > 0 ? 'alto' : 'medio',
      `Mejora incremental desde ${calendar.minimumExtraDatesForFirstImprovement ?? 'sin'} fechas extra; mejor escenario=${calendar.bestScenario ?? ''}.`,
      'Evaluar fechas simuladas sugeridas y calendario agosto realista.',
    ),
    risk(
      'INCOMPLETE_TRIBUNALS',
      incomplete > 100 ? 'alto' : incomplete > 0 ? 'medio' : 'bajo',
      `${incomplete} tribunales incompletos o con revision manual.`,
      'Revisar vocales, disponibilidad e idoneidad.',
    ),
    risk(
      'MANUAL_CASES_TOO_HIGH',
      manualRatio > 0.5 ? 'critico' : manualRatio > 0.25 ? 'alto' : 'medio',
      `${manual} de ${total} mesas quedan manuales en el mejor escenario consolidado.`,
      'Generar export de casos manuales y resolver por calendario/vocales.',
    ),
    risk(
      'NOT_LEGACY_EQUIVALENT',
      'alto',
      'No existe comparacion final compactada contra legacy; safeToReplaceLegacy permanece false.',
      'Comparar contra legacy compactado antes de uso oficial.',
    ),
    risk(
      'HOURS_CHAIR_INFERRED_NOT_EXPLICIT',
      rule.teachingHoursSource === 'TEACHING_HOURS_INFERRED_FROM_SCHEDULE' ? 'medio' : 'bajo',
      `${rule.teachersWithoutTeachingHours} docentes sin horas detectables; fuente=${rule.teachingHoursSource}.`,
      'Agregar horas catedra explicitas en plantilla docente.',
    ),
    risk(
      'PREVIEW_ONLY_NOT_OFFICIAL',
      'alto',
      'El reporte habilita solo preview interno, no generacion oficial.',
      'Mantener detras de auditoria local/read-only.',
    ),
  ]
}

function buildCalendarRecommendations(calendarReport = {}) {
  const summary = getSummary(calendarReport)
  const best = calendarReport.bestScenario ?? {}
  const simulatedDates = asArray(best.simulatedDates)

  return {
    bestScenario: summary.bestScenario ?? best.scenario ?? '',
    minimumExtraDatesForFirstImprovement: summary.minimumExtraDatesForFirstImprovement ?? null,
    suggestedSimulatedDates: simulatedDates.map((date) => ({
      fecha: date.fecha,
      diaSemana: date.diaSemana,
      llamado: date.llamado,
      turno: date.turno,
      isSimulated: date.isSimulated === true,
    })),
    recommendation: 'Usar estas fechas solo como insumo para decidir calendario institucional de agosto.',
  }
}

function buildBlockers({ identity = {}, feasibility = {}, calendar = {}, repair = {}, missingInputs = [] } = {}) {
  const blockers = []
  if (identity.pendingHomonymies > 0) {
    blockers.push({
      code: 'IDENTITY_V2_PENDING_HOMONYMIES',
      severity: 'high',
      evidence: `${identity.pendingHomonymies} homonimias pendientes.`,
    })
  }
  if (numberOrZero(calendar.bestScenarioBlockedBySuperposition ?? feasibility.blockedBySuperposition) > 0) {
    blockers.push({
      code: 'SUPERPOSITION_DOMINANT_BLOCKER',
      severity: 'critical',
      evidence: `${numberOrZero(calendar.bestScenarioBlockedBySuperposition ?? feasibility.blockedBySuperposition)} casos bloqueados por superposicion.`,
    })
  }
  if (numberOrZero(calendar.bestScenarioManual ?? calendar.baselineManual) > 0) {
    blockers.push({
      code: 'MANUAL_CASES_TOO_HIGH',
      severity: 'critical',
      evidence: `${numberOrZero(calendar.bestScenarioManual ?? calendar.baselineManual)} casos manuales en el mejor escenario.`,
    })
  }
  if (numberOrZero(repair.incompleteTribunalsInitial) > 0) {
    blockers.push({
      code: 'INCOMPLETE_TRIBUNALS',
      severity: 'high',
      evidence: `${numberOrZero(repair.incompleteTribunalsInitial)} tribunales incompletos iniciales.`,
    })
  }
  if (missingInputs.length) {
    blockers.push({
      code: 'MISSING_AUDIT_INPUTS',
      severity: 'medium',
      evidence: `${missingInputs.length} insumos de auditoria faltantes.`,
    })
  }
  blockers.push({
    code: 'NOT_LEGACY_EQUIVALENT',
    severity: 'high',
    evidence: 'No hay comparacion final compactada contra legacy; safeToReplaceLegacy=false.',
  })
  return blockers
}

function hasAnySafeToReplaceLegacy(audits = {}) {
  return Object.values(audits).some((audit) => getSummary(audit).safeToReplaceLegacy === true)
}

function computeReadinessScore({ rule = {}, identity = {}, calendar = {}, blockers = [], missingInputs = [] } = {}) {
  let score = 20
  if (rule.compliant) score += 20
  if (calendar.readyForAugustSupportPreview === true) score += 15
  if (numberOrZero(calendar.bestScenarioFull ?? calendar.baselineFull) > 0) score += 10
  if (numberOrZero(calendar.bestScenarioMinimumReview ?? calendar.baselineMinimumReview) > 0) score += 5
  if (numberOrZero(calendar.docentesExcedidos) === 0) score += 10
  if (identity.readyForIdentityV2) score += 10
  if (identity.pendingHomonymies > 0) score -= 15
  if (numberOrZero(calendar.bestScenarioManual ?? calendar.baselineManual) > 100) score -= 15
  if (blockers.some((blocker) => blocker.severity === 'critical')) score -= 5
  score -= missingInputs.filter((item) => item.severity === 'high').length * 8
  score -= missingInputs.filter((item) => item.severity === 'medium').length * 3
  return clamp(Math.round(score), 0, 100)
}

function classifyReadiness({ audits = {}, identity = {}, calendar = {}, readinessScore = 0 } = {}) {
  const allSafeToReplace = hasAnySafeToReplaceLegacy(audits)
  const manual = numberOrZero(calendar.bestScenarioManual ?? calendar.baselineManual)
  const total = numberOrZero(calendar.totalMesas)
  const manualRatio = total > 0 ? manual / total : 1

  if (
    allSafeToReplace &&
    identity.readyForIdentityV2 &&
    manualRatio <= 0.05 &&
    calendar.readyForOfficialGeneration === true
  ) {
    return AUGUST_READINESS_STATUS.READY_FOR_OFFICIAL_USE
  }
  if (identity.readyForIdentityV2 && manualRatio <= 0.25 && readinessScore >= 75) {
    return AUGUST_READINESS_STATUS.READY_FOR_HUMAN_REVIEW_PILOT
  }
  if (identity.readyForIdentityV2 && manualRatio <= 0.4 && readinessScore >= 65) {
    return AUGUST_READINESS_STATUS.READY_FOR_ASSISTED_DRAFT
  }
  if (calendar.readyForAugustSupportPreview === true || numberOrZero(calendar.bestScenarioFull ?? calendar.baselineFull) > 0) {
    return AUGUST_READINESS_STATUS.READY_FOR_INTERNAL_PREVIEW_ONLY
  }
  return AUGUST_READINESS_STATUS.NOT_READY
}

function buildNextActions({ identity = {}, calendarRecommendations = {} } = {}) {
  const dates = asArray(calendarRecommendations.suggestedSimulatedDates)
    .map((date) => `${date.fecha} ${date.diaSemana} ${date.llamado}`)
    .join('; ')

  return [
    {
      order: 1,
      action: 'Usar v2 solo como preview interno de apoyo para agosto.',
      owner: 'equipo interno',
      requiredFor: 'AUGUST_PREVIEW',
    },
    {
      order: 2,
      action: 'Generar export de casos manuales y revisar por carrera/materia.',
      owner: 'equipo academico',
      requiredFor: 'AUGUST_PREVIEW',
    },
    {
      order: 3,
      action: dates
        ? `Evaluar calendario con fechas simuladas sugeridas: ${dates}.`
        : 'Evaluar calendario agosto realista con fechas adicionales.',
      owner: 'institucion',
      requiredFor: 'AUGUST_PREVIEW',
    },
    {
      order: 4,
      action: `Cerrar ${identity.pendingHomonymies} homonimias de identidad v2.`,
      owner: 'institucion',
      requiredFor: 'OFFICIAL_USE',
    },
    {
      order: 5,
      action: 'Comparar contra legacy compactado final antes de reemplazar cualquier flujo.',
      owner: 'equipo interno',
      requiredFor: 'OFFICIAL_USE',
    },
  ]
}

function buildWarnings(missingInputs = []) {
  return [
    'Reporte consolidado read-only; no guarda ni publica cronogramas.',
    'safeToReplaceLegacy debe permanecer false.',
    ...missingInputs.map((input) => `Falta insumo ${input.key}: ${input.path}`),
  ]
}

function selectDominantBlocker(blockers = []) {
  return blockers.find((blocker) => blocker.code === 'SUPERPOSITION_DOMINANT_BLOCKER') ??
    blockers.find((blocker) => blocker.severity === 'critical') ??
    blockers[0] ??
    null
}

export function buildAugustReadinessReport({ auditFiles = {}, options = {} } = {}) {
  const sourceFiles = cloneJson(auditFiles ?? {})
  const audits = Object.fromEntries(
    Object.keys(AUGUST_READINESS_AUDIT_INPUTS).map((key) => [key, readInput(sourceFiles, key)]),
  )
  const expectedKeys = options.expectedKeys ?? Object.keys(AUGUST_READINESS_AUDIT_INPUTS)
  const missingInputs = buildMissingInputs(audits, expectedKeys)

  const half = getSummary(audits.halfPlusOneRuleChange)
  const dateVocal = getSummary(audits.dateVocalAssignmentOrder)
  const joint = getSummary(audits.jointDateVocalPlanner)
  const repair = getSummary(audits.vocalRepairPass)
  const reschedule = getSummary(audits.rescheduleIncompleteTribunals)
  const feasibility = getSummary(audits.schedulingFeasibilityCapacity)
  const calendar = getSummary(audits.calendarExpansionScenarios)
  const identity = getIdentitySummary(audits)
  const ruleComplianceStatus = buildRuleComplianceStatus(audits)
  const operationalBuckets = buildOperationalBuckets({ feasibility, calendar, identity })
  const calendarRecommendations = buildCalendarRecommendations(audits.calendarExpansionScenarios)
  const blockers = buildBlockers({ identity, feasibility, calendar, repair, missingInputs })
  const riskMatrix = buildRiskMatrix({ identity, feasibility, calendar, repair, rule: ruleComplianceStatus })
  const readinessScore = computeReadinessScore({
    rule: ruleComplianceStatus,
    identity,
    calendar,
    blockers,
    missingInputs,
  })
  const readinessStatus = classifyReadiness({
    audits,
    identity,
    calendar,
    readinessScore,
  })
  const nextActions = buildNextActions({ identity, calendarRecommendations })
  const recommendedUse = readinessStatus === AUGUST_READINESS_STATUS.READY_FOR_INTERNAL_PREVIEW_ONLY
    ? 'Preview interno de apoyo para agosto; no usar como cronograma oficial.'
    : 'No usar para generacion oficial hasta cerrar blockers.'

  return {
    summary: {
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      generatedFrom: 'local-audit summaries',
      totalMesas: numberOrZero(calendar.totalMesas ?? feasibility.totalMesasAnalizadas),
      readinessStatus,
      readinessScore,
      recommendedUse,
      dominantBlocker: selectDominantBlocker(blockers)?.code ?? '',
      identityV2PendingHomonymies: identity.pendingHomonymies,
      readyForIdentityV2: identity.readyForIdentityV2,
      bestCalendarScenario: calendar.bestScenario ?? '',
      bestScenarioFull: numberOrZero(calendar.bestScenarioFull),
      bestScenarioMinimumReview: numberOrZero(calendar.bestScenarioMinimumReview),
      bestScenarioManual: numberOrZero(calendar.bestScenarioManual),
      bestScenarioBlockedBySuperposition: numberOrZero(calendar.bestScenarioBlockedBySuperposition),
      ruleCompliant: ruleComplianceStatus.compliant,
      docentesExcedidos: ruleComplianceStatus.docentesExcedidos,
      maxUsoCupo: ruleComplianceStatus.maxUsoCupo,
      missingInputs: missingInputs.length,
    },
    readinessScore,
    readinessStatus,
    blockers,
    recommendedUse,
    requiredBeforeAugustPreview: [
      'Mantener el uso detras de auditoria local/read-only.',
      'Validar calendario agosto con fechas tentativas institucionales.',
      'Exportar y revisar casos manuales antes de compartir resultados.',
      'Aclarar que las mesas minimas con un vocal requieren revision humana.',
    ],
    requiredBeforeOfficialUse: [
      'Cerrar 34 homonimias de identidad v2.',
      'Completar comparacion final compactada contra legacy.',
      'Reducir casos manuales y superposicion dominante.',
      'Definir institucionalmente tratamiento de tribunales minimos.',
      'Mantener safeToReplaceLegacy en false hasta validacion final.',
    ],
    operationalBuckets,
    calendarRecommendations,
    identityV2Status: identity,
    ruleComplianceStatus,
    riskMatrix,
    nextActions,
    missingInputs,
    sourceSnapshot: {
      halfPlusOneRule: {
        capacityDeltaPerCall: numberOrZero(half.capacityDeltaPerCall),
        teachersWithoutTeachingHours: numberOrZero(half.teachersWithoutTeachingHours),
        teachingHoursSource: half.teachingHoursSource ?? '',
      },
      dateVocalFlow: {
        detectedFlow: dateVocal.detectedFlow ?? '',
        currentCompletionRate: numberOrZero(dateVocal.currentCompletionRate),
        principalRegressionCause: dateVocal.principalRegressionCause ?? '',
      },
      jointPlanner: {
        currentCompletionRate: numberOrZero(joint.currentCompletionRate),
        jointCompletionRate: numberOrZero(joint.jointCompletionRate),
        completionDelta: numberOrZero(joint.completionDelta),
      },
      repairs: {
        vocalRepairCompletionAfter: numberOrZero(repair.completionAfter),
        rescheduleCompletionAfter: numberOrZero(reschedule.completionAfter),
        rescheduledComplete: numberOrZero(reschedule.rescheduledComplete),
        rescheduledMinimumReview: numberOrZero(reschedule.rescheduledMinimumReview),
      },
    },
    warnings: buildWarnings(missingInputs),
    errors: [],
    privacy: {
      consoleSafe: true,
      noFullTeacherNames: true,
      normalizedCaseKeys: true,
    },
  }
}
