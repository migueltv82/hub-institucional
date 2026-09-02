const GAP_TYPES = Object.freeze({
  NEW_ENGINE_SPLITS_BY_CALL: 'NEW_ENGINE_SPLITS_BY_CALL',
  NEW_ENGINE_SPLITS_BY_SUBJECT_INSTANCE: 'NEW_ENGINE_SPLITS_BY_SUBJECT_INSTANCE',
  LEGACY_GROUPS_MULTIPLE_CALLS: 'LEGACY_GROUPS_MULTIPLE_CALLS',
  DIFFERENT_TABLE_DEFINITION: 'DIFFERENT_TABLE_DEFINITION',
  DIFFERENT_REQUIERE_MESA_CRITERIA: 'DIFFERENT_REQUIERE_MESA_CRITERIA',
  MISSING_PLAN_ID_MATERIA_CODIGO: 'MISSING_PLAN_ID_MATERIA_CODIGO',
  MISSING_DOCENTE_MATERIA_CORRECTED: 'MISSING_DOCENTE_MATERIA_CORRECTED',
  WEAK_CORRELATIVIDADES: 'WEAK_CORRELATIVIDADES',
  MATERIAS_SIN_HORARIO_NO_REQUERIDAS: 'MATERIAS_SIN_HORARIO_NO_REQUERIDAS',
  LABORATORIO_MULTIPLAN_RISK: 'LABORATORIO_MULTIPLAN_RISK',
  UNKNOWN: 'UNKNOWN',
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

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function labelForKey(key = '', catalog = {}) {
  const label = catalog[key] ?? {}
  return {
    materia_key: key,
    carrera: clean(label.carrera),
    anio: clean(label.anio),
    weak_key: Boolean(label.weakKey || key.startsWith('weak::')),
    requires_plan_id: !clean(label.planId),
    requires_materia_codigo: !clean(label.materiaCodigo),
  }
}

function getScenario(universeComparison = {}, scenarioId) {
  return universeComparison.scenarios?.[scenarioId] ?? {}
}

function scenarioCounts(universeComparison = {}, scenarioId) {
  return getScenario(universeComparison, scenarioId).counts ?? {}
}

function getSummaryValue(universeComparison = {}, key, fallback = null) {
  return universeComparison.summary?.[key] ?? universeComparison.summary?.summary?.[key] ?? fallback
}

function getLegacyCompactionSummary(legacyCompactionAudit = {}) {
  return legacyCompactionAudit.summary?.summary ?? legacyCompactionAudit.summary ?? {}
}

function getRootCauseCount(universeComparison = {}, code) {
  return asArray(universeComparison.rootCauseAnalysis)
    .filter((cause) => cause.code === code)
    .reduce((sum, cause) => sum + numberOrZero(cause.count), 0)
}

function getFinalOccurrences(scenario = {}) {
  return scenario.subjectSets?.finalOccurrences ?? {}
}

function getSubjectCatalog(scenario = {}) {
  return scenario.subjectSets?.catalog ?? {}
}

function callsForScenario(scenario = {}) {
  return unique(Object.values(getFinalOccurrences(scenario)).flatMap((entry) => asArray(entry.calls)))
}

function buildCallSplitCases({ legacyScenario, examScenario }) {
  const legacyOccurrences = getFinalOccurrences(legacyScenario)
  const examOccurrences = getFinalOccurrences(examScenario)
  const catalog = {
    ...getSubjectCatalog(legacyScenario),
    ...getSubjectCatalog(examScenario),
  }

  return Object.entries(examOccurrences).flatMap(([key, examEntry], index) => {
    const examCount = numberOrZero(examEntry.occurrences)
    const legacyCount = numberOrZero(legacyOccurrences[key]?.occurrences)
    const calls = asArray(examEntry.calls)
    const difference = Math.max(0, examCount - Math.max(legacyCount, 1))
    const possibleCallSplit = calls.length > 1 || examCount > 1
    if (!possibleCallSplit || difference <= 0) return []

    const label = labelForKey(key, catalog)
    return [{
      case_id: `gap_call_split_${String(index + 1).padStart(3, '0')}`,
      gap_type: GAP_TYPES.NEW_ENGINE_SPLITS_BY_CALL,
      legacy_count: legacyCount || 1,
      exam_engine_count: examCount,
      difference,
      carrera: label.carrera,
      anio: label.anio,
      materia_key: label.materia_key,
      weak_key: label.weak_key,
      requires_plan_id: label.requires_plan_id,
      requires_materia_codigo: label.requires_materia_codigo,
      possible_call_split: true,
      possible_subject_split: false,
      recommendation: label.weak_key
        ? 'Confirmar plan_id + materia_codigo y definir si la mesa institucional se cuenta por materia o por llamado.'
        : 'Definir si el nuevo motor debe reportar equivalencia materia-base o materia+llamado.',
    }]
  })
}

function buildRequiredMismatchCases({ legacyScenario, examScenario }) {
  const legacyRequired = new Set(legacyScenario.subjectSets?.requiredKeys ?? [])
  const examRequired = new Set(examScenario.subjectSets?.requiredKeys ?? [])
  const catalog = {
    ...getSubjectCatalog(legacyScenario),
    ...getSubjectCatalog(examScenario),
  }
  const onlyLegacy = [...legacyRequired].filter((key) => !examRequired.has(key))
  const onlyExam = [...examRequired].filter((key) => !legacyRequired.has(key))

  return [...onlyLegacy, ...onlyExam].map((key, index) => {
    const label = labelForKey(key, catalog)
    return {
      case_id: `gap_required_mismatch_${String(index + 1).padStart(3, '0')}`,
      gap_type: GAP_TYPES.DIFFERENT_REQUIERE_MESA_CRITERIA,
      legacy_count: legacyRequired.has(key) ? 1 : 0,
      exam_engine_count: examRequired.has(key) ? 1 : 0,
      difference: 1,
      carrera: label.carrera,
      anio: label.anio,
      materia_key: key,
      weak_key: label.weak_key,
      requires_plan_id: label.requires_plan_id,
      requires_materia_codigo: label.requires_materia_codigo,
      possible_call_split: false,
      possible_subject_split: false,
      recommendation: 'Alinear requiere_mesa y titularidad antes de comparar totales finales.',
    }
  })
}

function buildDefinitionGapCase({ remainingDifference, legacyCounts, examCounts, index = 1 }) {
  if (remainingDifference <= 0) return []
  return [{
    case_id: `gap_table_definition_${String(index).padStart(3, '0')}`,
    gap_type: GAP_TYPES.DIFFERENT_TABLE_DEFINITION,
    legacy_count: numberOrZero(legacyCounts.mesasBeforeCompaction),
    exam_engine_count: numberOrZero(examCounts.mesasBeforeCompaction),
    difference: remainingDifference,
    carrera: 'TODAS',
    anio: 'TODOS',
    materia_key: 'UNIVERSE_TABLE_DEFINITION',
    weak_key: true,
    requires_plan_id: true,
    requires_materia_codigo: true,
    possible_call_split: false,
    possible_subject_split: true,
    recommendation: 'Crear una vista de equivalencia: materia-base, materia+llamado y mesa final compactada.',
  }]
}

function cap(value, max) {
  return Math.max(0, Math.min(numberOrZero(value), numberOrZero(max)))
}

function buildGapBreakdown({
  explainedByLegacyCompaction,
  explainedByCallSplit,
  explainedBySubjectSplit,
  explainedByDifferentTableDefinition,
  explainedByWeakKeys,
  unexplainedGap,
}) {
  return [
    {
      cause: 'LEGACY_COMPACTION',
      count: explainedByLegacyCompaction,
      description: 'Reduccion de ocurrencias legacy por mesas agrupadas.',
      blocksFairComparison: false,
    },
    {
      cause: GAP_TYPES.NEW_ENGINE_SPLITS_BY_CALL,
      count: explainedByCallSplit,
      description: 'El nuevo motor cuenta materia + llamado como mesas separadas.',
      blocksFairComparison: true,
    },
    {
      cause: GAP_TYPES.NEW_ENGINE_SPLITS_BY_SUBJECT_INSTANCE,
      count: explainedBySubjectSplit,
      description: 'Diferencia residual por ocurrencias/instancias de materia no atribuida al llamado.',
      blocksFairComparison: true,
    },
    {
      cause: GAP_TYPES.DIFFERENT_TABLE_DEFINITION,
      count: explainedByDifferentTableDefinition,
      description: 'Los motores no reportan el mismo tipo de mesa final.',
      blocksFairComparison: true,
    },
    {
      cause: GAP_TYPES.MISSING_PLAN_ID_MATERIA_CODIGO,
      count: explainedByWeakKeys,
      description: 'Hay claves debiles que impiden comparar de forma contractual.',
      blocksFairComparison: true,
    },
    {
      cause: GAP_TYPES.UNKNOWN,
      count: unexplainedGap,
      description: 'Brecha no atribuida con la evidencia disponible.',
      blocksFairComparison: unexplainedGap > 0,
    },
  ].filter((item) => item.count > 0)
}

function buildRootCauseAnalysis({ summary, universeComparison, legacyCompactionAudit }) {
  const roots = []
  const add = (code, count, evidence, recommendation, blocksCut = true) => {
    if (!count) return
    roots.push({ code, count, evidence, recommendation, blocksCut })
  }

  add(
    GAP_TYPES.NEW_ENGINE_SPLITS_BY_CALL,
    summary.explainedByCallSplit,
    'examEngine_raw genera mesas separadas para mas de un llamado regular.',
    'Crear una metrica de equivalencia materia-base antes de comparar totales finales.',
    true,
  )
  add(
    GAP_TYPES.DIFFERENT_TABLE_DEFINITION,
    summary.explainedByDifferentTableDefinition,
    'Legacy reporta mesa final compactada; examEngine reporta ocurrencias por llamado y estado de planificacion.',
    'Reportar tres niveles: materia requerida, mesa por llamado, mesa compactada.',
    true,
  )
  add(
    GAP_TYPES.MISSING_PLAN_ID_MATERIA_CODIGO,
    summary.explainedByWeakKeys,
    'La comparacion usa claves debiles para todas o casi todas las materias.',
    'Completar plan_id + materia_codigo en plantillas v2.',
    true,
  )
  add(
    GAP_TYPES.MISSING_DOCENTE_MATERIA_CORRECTED,
    getRootCauseCount(universeComparison, 'MISSING_DOCENTE_MATERIA'),
    'La titularidad sigue dependiendo de inferencia o candidate incompleto.',
    'Completar docente_materia.corrected antes de validar reemplazo.',
    true,
  )
  add(
    GAP_TYPES.WEAK_CORRELATIVIDADES,
    getRootCauseCount(universeComparison, 'CORRELATIVIDADES_WEAK'),
    'Las correlatividades no estan en plan_id + materia_codigo.',
    'Migrar correlatividades a contrato v2.',
    true,
  )
  add(
    GAP_TYPES.MATERIAS_SIN_HORARIO_NO_REQUERIDAS,
    getRootCauseCount(universeComparison, 'MATERIAS_SIN_HORARIO'),
    'Hay materias del plan no planificables por falta de horario/docente declarado.',
    'Declarar requiere_mesa y titularidad en docente_materia.',
    true,
  )
  add(
    GAP_TYPES.LABORATORIO_MULTIPLAN_RISK,
    getRootCauseCount(universeComparison, 'LABORATORIO_MULTIPLAN_RISK'),
    'Laboratorio 2015/2024 no puede distinguirse con claves actuales.',
    'Separar LAB-2015/LAB-2024 y declarar equivalencias_planes.',
    true,
  )
  add(
    'LEGACY_COMPACTION',
    legacyCompactionAudit.summary?.legacyReductionByCompaction ?? legacyCompactionAudit.summary?.summary?.legacyReductionByCompaction,
    'Legacy compacta ocurrencias en mesas finales.',
    'No replicar compactacion hasta resolver claves fuertes y revision institucional.',
    false,
  )

  return roots
}

function buildRecommendations(summary = {}) {
  const recommendations = [
    'No comparar legacy y examEngine por total de filas finales hasta crear una vista de equivalencia.',
    'Crear un modo de equivalencia de universo: materia requerida, materia+llamado y mesa final compactada.',
    'Mantener el preview interno como auditoria; no reemplazar motor viejo.',
    'Completar plan_id + materia_codigo y docente_materia.corrected antes de repetir la comparacion.',
  ]

  if (summary.explainedByCallSplit > 0) {
    recommendations.push('Agregar una metrica explicita de mesas por llamado para que el split regular no parezca sobre-generacion.')
  }
  if (summary.unexplainedGap > 0) {
    recommendations.push('Inspeccionar casos residuales de definicion de mesa antes de ajustar algoritmo.')
  }

  return unique(recommendations)
}

function buildSummary({ universeComparison, legacyCompactionAudit }) {
  const legacyCounts = scenarioCounts(universeComparison, 'legacy_raw')
  const examCounts = scenarioCounts(universeComparison, 'examEngine_raw')
  const legacyCompactionSummary = getLegacyCompactionSummary(legacyCompactionAudit)
  const legacyFinalTables = numberOrZero(getSummaryValue(universeComparison, 'legacyMesas', legacyCounts.totalFinalMesas))
  const examEngineFinalTables = numberOrZero(getSummaryValue(universeComparison, 'examEngineRawMesas', examCounts.totalFinalMesas))
  const totalGap = Math.max(0, examEngineFinalTables - legacyFinalTables)
  const explainedByLegacyCompaction = cap(
    legacyCompactionSummary.legacyReductionByCompaction,
    totalGap,
  )
  const remainingGap = Math.max(0, totalGap - explainedByLegacyCompaction)
  const rawExtraByCall = Math.max(0, numberOrZero(examCounts.totalFinalMesas) - numberOrZero(examCounts.requiresMesa))
  const explainedByCallSplit = cap(rawExtraByCall, remainingGap)
  const gapAfterCall = Math.max(0, remainingGap - explainedByCallSplit)
  const explainedBySubjectSplit = cap(
    Math.max(0, numberOrZero(examCounts.mesasBeforeCompaction) - numberOrZero(examCounts.mesasAfterCompaction)),
    gapAfterCall,
  )
  const gapAfterSubject = Math.max(0, gapAfterCall - explainedBySubjectSplit)
  const legacyBaseDifference = Math.abs(numberOrZero(legacyCounts.mesasBeforeCompaction) - numberOrZero(examCounts.requiresMesa))
  const explainedByDifferentTableDefinition = cap(legacyBaseDifference, gapAfterSubject)
  const gapAfterDefinition = Math.max(0, gapAfterSubject - explainedByDifferentTableDefinition)
  const explainedByWeakKeys = numberOrZero(getRootCauseCount(universeComparison, 'WEAK_SUBJECT_KEYS'))
  const unexplainedGap = gapAfterDefinition
  const legacyCalls = callsForScenario(getScenario(universeComparison, 'legacy_raw'))
  const examCalls = callsForScenario(getScenario(universeComparison, 'examEngine_raw'))

  return {
    legacyFinalTables,
    examEngineFinalTables,
    totalGap,
    explainedByLegacyCompaction,
    remainingGap,
    explainedByCallSplit,
    explainedBySubjectSplit,
    explainedByDifferentTableDefinition,
    explainedByWeakKeys,
    unexplainedGap,
    safeToCompareFinalTotals: false,
    safeToReplaceLegacy: false,
    tableDefinitions: {
      legacy: {
        likelyDefinition: 'mesa final compactada con llamado y tribunal asignado',
        cantidadLlamados: legacyCounts.cantidadLlamados ?? legacyCalls.length,
        calls: legacyCalls,
        groupsMultipleSubjects: numberOrZero(legacyCompactionSummary.legacyCompactionCases),
      },
      examEngine: {
        likelyDefinition: 'materia + llamado + estado de planificacion',
        cantidadLlamados: examCounts.cantidadLlamados ?? examCalls.length,
        calls: examCalls,
        separatesByCall: explainedByCallSplit > 0,
      },
    },
    answers: {
      remainingGapMainlyCallSplit: explainedByCallSplit >= Math.max(1, remainingGap * 0.5),
      legacySingleTableWhereExamEngineOnePerCall: explainedByCallSplit > 0,
      newCountsOccurrencesOldCountsCompactedTables: explainedByLegacyCompaction > 0 || explainedByCallSplit > 0,
      needUniverseEquivalenceMode: true,
      missingDataForFairComparison: [
        'plan_id + materia_codigo',
        'docente_materia.corrected',
        'correlatividades v2 por plan_id + materia_codigo',
        'equivalencias_planes para Laboratorio 2015/2024',
        'definicion institucional de mesa: materia, materia+llamado o mesa compactada',
      ],
      safeToReplaceNow: false,
    },
  }
}

export function explainLegacyVsExamEngineGap({
  universeComparison,
  legacyCompactionAudit,
  snapshot,
  options = {},
} = {}) {
  const safeUniverseComparison = universeComparison && typeof universeComparison === 'object'
    ? cloneJson(universeComparison)
    : {}
  const safeLegacyCompactionAudit = legacyCompactionAudit && typeof legacyCompactionAudit === 'object'
    ? cloneJson(legacyCompactionAudit)
    : {}
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? cloneJson(snapshot) : {}
  const legacyScenario = getScenario(safeUniverseComparison, 'legacy_raw')
  const examScenario = getScenario(safeUniverseComparison, 'examEngine_raw')
  const legacyCounts = scenarioCounts(safeUniverseComparison, 'legacy_raw')
  const examCounts = scenarioCounts(safeUniverseComparison, 'examEngine_raw')
  const summary = buildSummary({
    universeComparison: safeUniverseComparison,
    legacyCompactionAudit: safeLegacyCompactionAudit,
  })
  const callSplitCases = buildCallSplitCases({ legacyScenario, examScenario })
  const requiredMismatchCases = buildRequiredMismatchCases({ legacyScenario, examScenario })
  const usedByCallCases = callSplitCases.reduce((sum, item) => sum + item.difference, 0)
  const definitionGap = Math.max(0, summary.remainingGap - Math.min(summary.explainedByCallSplit, usedByCallCases))
  const gapCases = [
    ...callSplitCases,
    ...requiredMismatchCases,
    ...buildDefinitionGapCase({
      remainingDifference: summary.explainedByDifferentTableDefinition || definitionGap,
      legacyCounts,
      examCounts,
    }),
  ]
  const gapBreakdown = buildGapBreakdown(summary)
  const rootCauseAnalysis = buildRootCauseAnalysis({
    summary,
    universeComparison: safeUniverseComparison,
    legacyCompactionAudit: safeLegacyCompactionAudit,
  })
  const warnings = []

  if (!Object.keys(safeUniverseComparison).length) {
    warnings.push({
      code: 'UNIVERSE_COMPARISON_MISSING',
      message: 'No se recibio compareExamUniverseLegacyVsNew; la explicacion queda incompleta.',
    })
  }
  if (!Object.keys(safeLegacyCompactionAudit).length) {
    warnings.push({
      code: 'LEGACY_COMPACTION_AUDIT_MISSING',
      message: 'No se recibio auditLegacyCompaction; no se puede restar compactacion con precision.',
    })
  }

  return {
    summary: {
      ...summary,
      snapshotCounts: {
        planesEstudio: asArray(safeSnapshot.planesEstudio).length,
        horariosDocentes: asArray(safeSnapshot.horariosDocentes).length,
        docentes: asArray(safeSnapshot.docentes).length,
        correlatividades: asArray(safeSnapshot.correlatividades).length,
      },
    },
    gapBreakdown,
    gapCases: options.includeCases === false ? [] : gapCases,
    rootCauseAnalysis,
    recommendations: buildRecommendations(summary),
    warnings,
    errors: [],
  }
}
