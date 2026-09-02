import {
  CALENDAR_EXPANSION_SCENARIOS,
  simulateCalendarExpansion,
} from '../experimental/simulateCalendarExpansion.js'

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

function roundRate(value) {
  return Number(numberOrZero(value).toFixed(4))
}

function buildDelta(current = {}, reference = {}) {
  return {
    full: numberOrZero(current.full) - numberOrZero(reference.full),
    minimumReview: numberOrZero(current.minimumReview) - numberOrZero(reference.minimumReview),
    manual: numberOrZero(current.manual) - numberOrZero(reference.manual),
    mesasSinFecha: numberOrZero(current.mesasSinFecha) - numberOrZero(reference.mesasSinFecha),
    blockedBySuperposition: numberOrZero(current.blockedBySuperposition) -
      numberOrZero(reference.blockedBySuperposition),
    blockedByCalendar: numberOrZero(current.blockedByCalendar) - numberOrZero(reference.blockedByCalendar),
    blockedByIdoneity: numberOrZero(current.blockedByIdoneity) - numberOrZero(reference.blockedByIdoneity),
    completionRate: roundRate(numberOrZero(current.completionRate) - numberOrZero(reference.completionRate)),
    feasibleTotal: (
      numberOrZero(current.full) + numberOrZero(current.minimumReview) -
      numberOrZero(reference.full) - numberOrZero(reference.minimumReview)
    ),
  }
}

function scenarioScore(result = {}) {
  return (
    numberOrZero(result.full) * 1000 +
    numberOrZero(result.minimumReview) * 400 -
    numberOrZero(result.manual) * 250 -
    numberOrZero(result.blockedBySuperposition) * 80 -
    numberOrZero(result.docentesExcedidos) * 500 -
    numberOrZero(result.integrity?.superpositionsInPlan) * 1000
  )
}

function scenarioRecommendation(result = {}, baseline = {}) {
  const delta = buildDelta(result, baseline)
  if (numberOrZero(result.docentesExcedidos) > 0 || numberOrZero(result.integrity?.superpositionsInPlan) > 0) {
    return 'No usar: viola cupo o superposicion en la simulacion.'
  }
  if (delta.feasibleTotal > 0 && delta.blockedBySuperposition < 0) {
    return 'Escenario util para preview de apoyo: mejora factibilidad sin tocar produccion.'
  }
  if (delta.feasibleTotal > 0) {
    return 'Mejora parcial; revisar si reduce suficientes casos manuales.'
  }
  return 'No mejora frente al baseline actual.'
}

function normalizeScenarioResult(result = {}, baseline = {}, addOne = {}) {
  const normalized = {
    scenario: result.scenario,
    strategy: result.strategy,
    totalMesas: numberOrZero(result.totalMesas),
    full: numberOrZero(result.full),
    minimumReview: numberOrZero(result.minimumReview),
    manual: numberOrZero(result.manual),
    totalPlanned: numberOrZero(result.totalPlanned),
    totalUnassigned: numberOrZero(result.totalUnassigned),
    completionRate: numberOrZero(result.completionRate),
    mesasSinFecha: numberOrZero(result.mesasSinFecha),
    blockedBySuperposition: numberOrZero(result.blockedBySuperposition),
    blockedByCalendar: numberOrZero(result.blockedByCalendar),
    blockedByIdoneity: numberOrZero(result.blockedByIdoneity),
    docentesExcedidos: numberOrZero(result.docentesExcedidos),
    maxUsoCupo: numberOrZero(result.maxUsoCupo),
    fechasUsadas: numberOrZero(result.fechasUsadas),
    fechasDisponibles: numberOrZero(result.fechasDisponibles),
    fechasSimuladas: numberOrZero(result.fechasSimuladas),
    simulatedDateIds: asArray(result.simulatedDateIds),
    simulatedDates: asArray(result.simulatedDates),
    strategyWeekdays: asArray(result.strategyWeekdays),
    callRanking: asArray(result.callRanking),
    superpositionsInPlan: numberOrZero(result.integrity?.superpositionsInPlan),
    titularAsVocal: numberOrZero(result.integrity?.titularAsVocal),
    duplicateVocales: numberOrZero(result.integrity?.duplicateVocales),
    safeToReplaceLegacy: false,
    readyForOfficialGeneration: false,
  }

  return {
    ...normalized,
    improvementVsBaseline: buildDelta(normalized, baseline),
    improvementVsAddOneExtraDate: addOne?.scenario
      ? buildDelta(normalized, addOne)
      : buildDelta(normalized, normalized),
    score: scenarioScore(normalized),
    recommendation: scenarioRecommendation(normalized, baseline),
  }
}

function chooseBestScenario(results = []) {
  return [...results]
    .filter((result) => result.scenario !== CALENDAR_EXPANSION_SCENARIOS.BASELINE_CURRENT)
    .sort((left, right) => (
      right.score - left.score ||
      right.full - left.full ||
      right.minimumReview - left.minimumReview ||
      left.manual - right.manual
    ))[0] ?? results[0] ?? null
}

function estimateMinimumExtraDates(results = [], baseline = {}) {
  const incremental = [
    CALENDAR_EXPANSION_SCENARIOS.ADD_1_DATE,
    CALENDAR_EXPANSION_SCENARIOS.ADD_2_DATES,
    CALENDAR_EXPANSION_SCENARIOS.ADD_3_DATES,
  ].map((scenarioName, index) => ({
    extraDates: index + 1,
    result: results.find((result) => result.scenario === scenarioName),
  }))

  return incremental.find(({ result }) => (
    result &&
    result.improvementVsBaseline.feasibleTotal > 0 &&
    result.blockedBySuperposition < numberOrZero(baseline.blockedBySuperposition)
  )) ?? null
}

function buildCases(simulation = {}) {
  return asArray(simulation.scenarios).flatMap((scenarioRun) => (
    asArray(scenarioRun.audit?.examFeasibilityCases).map((row) => ({
      scenario: scenarioRun.scenario,
      caseId: row.caseId,
      mesaId: row.mesaId,
      source: row.source,
      carreraKey: row.carreraKey,
      materiaKey: row.materiaKey,
      anio: row.anio,
      llamado: row.llamado,
      classification: row.classification,
      fechasCandidatasTotales: row.fechasCandidatasTotales,
      fechasTitularAsiste: row.fechasTitularAsiste,
      vocalesIdoneosTotales: row.vocalesIdoneosTotales,
      fechasRealesConUnVocal: row.fechasRealesConUnVocal,
      fechasRealesConDosVocales: row.fechasRealesConDosVocales,
      blockedBy: row.blockedBy,
    }))
  ))
}

function slotKey(slot = {}) {
  return [slot.fecha, slot.llamado, slot.turno].map(clean).join('::')
}

function buildByDate(simulation = {}) {
  return asArray(simulation.scenarios).flatMap((scenarioRun) => {
    const simulatedKeys = new Set(asArray(scenarioRun.simulatedDates).map(slotKey))
    return asArray(scenarioRun.audit?.dateCapacity).map((row) => ({
      scenario: scenarioRun.scenario,
      fecha: row.fecha,
      llamado: row.llamado,
      turno: row.turno,
      isSimulated: simulatedKeys.has(slotKey(row)),
      mesasCandidatas: row.mesasCandidatas,
      titularesDisponibles: row.titularesDisponibles,
      vocalesDisponibles: row.vocalesDisponibles,
      docentesUnicosDisponibles: row.docentesUnicosDisponibles,
      docentesYaOcupados: row.docentesYaOcupados,
      capacidadVocalPotencial: row.capacidadVocalPotencial,
      demandaVocales: row.demandaVocales,
      brechaVocales: row.brechaVocales,
      carrerasConcentradas: row.carrerasConcentradas,
      aniosConcentrados: row.aniosConcentrados,
    }))
  })
}

function sanitizeTeacherBottlenecks(simulation = {}, bestScenario = null) {
  const selectedRun = asArray(simulation.scenarios)
    .find((scenarioRun) => scenarioRun.scenario === bestScenario?.scenario) ??
    asArray(simulation.scenarios)[0]

  return asArray(selectedRun?.audit?.teacherBottlenecks)
    .slice(0, 25)
    .map((row) => ({
      scenario: selectedRun.scenario,
      docenteAnonId: row.docenteAnonId,
      diasAsistencia: row.diasAsistencia,
      horasCatedra: row.horasCatedra,
      cupoVocaliasHorasCatedra: row.cupoVocaliasHorasCatedra,
      usoActualCupo: row.usoActualCupo,
      requeridoComoTitular: row.requeridoComoTitular,
      requeridoComoVocalPosible: row.requeridoComoVocalPosible,
      bloqueosPorNoAsistir: row.bloqueosPorNoAsistir,
      bloqueosPorSuperposicion: row.bloqueosPorSuperposicion,
      bloqueosPorIdoneidad: row.bloqueosPorIdoneidad,
      cuelloDeBotella: row.cuelloDeBotella,
      bottleneckScore: row.bottleneckScore,
    }))
}

function buildRecommendations({ baseline = {}, bestScenario = {}, minimumExtraDates = null } = {}) {
  const recommendations = [
    'Mantener mitad mas uno por horas catedra.',
    'Mantener asistencia por dia como restriccion obligatoria.',
    'Usar fechas simuladas solo para decidir calendario institucional; no son fechas oficiales.',
    'Mantener safeToReplaceLegacy en false.',
    'Cerrar las 34 homonimias de identidad v2 antes de una comparacion compactada final.',
  ]

  if (minimumExtraDates) {
    recommendations.push(`La primera mejora incremental aparece con ${minimumExtraDates.extraDates} fecha(s) simulada(s).`)
  } else {
    recommendations.push('Agregar hasta 3 fechas simuladas no alcanza para una mejora incremental clara.')
  }

  if (bestScenario?.scenario) {
    recommendations.push(`Mejor escenario simulado: ${bestScenario.scenario}.`)
  }

  if (numberOrZero(bestScenario.blockedBySuperposition) < numberOrZero(baseline.blockedBySuperposition)) {
    recommendations.push('La expansion/redistribucion reduce el bloqueo por superposicion global.')
  } else {
    recommendations.push('La superposicion global sigue siendo el cuello principal.')
  }

  return recommendations
}

function canServeAsAugustPreview(bestScenario = {}, baseline = {}) {
  return Boolean(
    bestScenario &&
    bestScenario.improvementVsBaseline?.feasibleTotal > 0 &&
    numberOrZero(bestScenario.docentesExcedidos) === 0 &&
    numberOrZero(bestScenario.superpositionsInPlan) === 0 &&
    numberOrZero(bestScenario.full) >= numberOrZero(baseline.full),
  )
}

export function auditCalendarExpansionScenarios({ snapshot, baseCalendar, options = {} } = {}) {
  const simulation = simulateCalendarExpansion({ snapshot, baseCalendar, options })
  const baselineRaw = simulation.scenarioResults
    .find((result) => result.scenario === CALENDAR_EXPANSION_SCENARIOS.BASELINE_CURRENT) ?? {}
  const addOneRaw = simulation.scenarioResults
    .find((result) => result.scenario === CALENDAR_EXPANSION_SCENARIOS.ADD_1_DATE) ?? baselineRaw
  const baseline = normalizeScenarioResult(baselineRaw, baselineRaw, addOneRaw)
  const addOne = normalizeScenarioResult(addOneRaw, baseline, addOneRaw)
  const scenarioResults = simulation.scenarioResults.map((result) => (
    normalizeScenarioResult(result, baseline, addOne)
  ))
  const bestScenario = chooseBestScenario(scenarioResults)
  const minimumExtraDates = estimateMinimumExtraDates(scenarioResults, baseline)
  const previewSupport = canServeAsAugustPreview(bestScenario, baseline)
  const recommendations = buildRecommendations({ baseline, bestScenario, minimumExtraDates })

  return {
    summary: {
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      readyForAugustSupportPreview: previewSupport,
      totalMesas: baseline.totalMesas,
      baselineScenario: baseline.scenario,
      baselineFull: baseline.full,
      baselineMinimumReview: baseline.minimumReview,
      baselineManual: baseline.manual,
      baselineBlockedBySuperposition: baseline.blockedBySuperposition,
      bestScenario: bestScenario?.scenario ?? '',
      bestScenarioFull: bestScenario?.full ?? 0,
      bestScenarioMinimumReview: bestScenario?.minimumReview ?? 0,
      bestScenarioManual: bestScenario?.manual ?? 0,
      bestScenarioBlockedBySuperposition: bestScenario?.blockedBySuperposition ?? 0,
      minimumExtraDatesForFirstImprovement: minimumExtraDates?.extraDates ?? null,
      blockedBySuperpositionDelta: bestScenario
        ? numberOrZero(bestScenario.blockedBySuperposition) - numberOrZero(baseline.blockedBySuperposition)
        : 0,
      fullDelta: bestScenario ? numberOrZero(bestScenario.full) - numberOrZero(baseline.full) : 0,
      minimumReviewDelta: bestScenario
        ? numberOrZero(bestScenario.minimumReview) - numberOrZero(baseline.minimumReview)
        : 0,
      docentesExcedidos: bestScenario?.docentesExcedidos ?? 0,
      superpositionsInPlan: bestScenario?.superpositionsInPlan ?? 0,
      identityV2PendingHomonymies: 34,
      readyForIdentityV2: false,
    },
    scenarioResults,
    bestScenario,
    cases: buildCases(simulation),
    byDate: buildByDate(simulation),
    teacherBottlenecks: sanitizeTeacherBottlenecks(simulation, bestScenario),
    recommendations,
    warnings: [
      ...asArray(simulation.warnings),
      'Auditoria local/read-only; no modifica datos reales.',
      'Las fechas simuladas deben validarse institucionalmente antes de cualquier uso operativo.',
    ],
    errors: asArray(simulation.errors),
    privacy: {
      consoleSafe: true,
      noFullTeacherNames: true,
      normalizedCaseKeys: true,
    },
  }
}
