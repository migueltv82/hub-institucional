const SAFETY = Object.freeze({
  SAFE_TO_COMPARE: 'SAFE_TO_COMPARE',
  AUDIT_ONLY_WEAK_KEY: 'AUDIT_ONLY_WEAK_KEY',
  LABORATORIO_MULTIPLAN_RISK: 'LABORATORIO_MULTIPLAN_RISK',
  REQUIRES_INSTITUTIONAL_REVIEW: 'REQUIRES_INSTITUTIONAL_REVIEW',
  NO_EXAM_ENGINE_EQUIVALENT: 'NO_EXAM_ENGINE_EQUIVALENT',
})

const FIELD_ALIASES = Object.freeze({
  anio: ['anio', 'año', 'ano', 'year', 'curso', 'nivel'],
  carrera: ['carrera', 'programa', 'program', 'career', 'nombreCarrera', 'carrera_nombre', 'careerName'],
  materiaCodigo: [
    'materia_codigo',
    'materiaCodigo',
    'codigo_materia',
    'codigoMateria',
    'codigo',
    'code',
    'subject_code',
    'subjectCode',
  ],
  materiaNombre: [
    'materia_nombre',
    'materiaNombre',
    'nombre_materia',
    'nombreMateria',
    'subject_name',
    'subjectName',
    'asignatura',
    'unidad_curricular',
    'espacio',
    'nombre',
    'name',
    'materia',
  ],
  planId: ['plan_id', 'planId', 'plan', 'plan_estudio', 'planEstudio', 'plan_estudio_id', 'planEstudioId'],
})

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function hasValue(value) {
  return value !== undefined && value !== null && clean(value) !== ''
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

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeFieldName(value) {
  return normalizeToken(value)
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function readField(row = {}, aliasKey) {
  if (!row || typeof row !== 'object') return undefined
  const aliases = FIELD_ALIASES[aliasKey] ?? [aliasKey]

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && hasValue(row[alias])) return row[alias]
  }

  const wanted = new Set(aliases.map(normalizeFieldName))
  const entry = Object.entries(row).find(([field, value]) => (
    wanted.has(normalizeFieldName(field)) && hasValue(value)
  ))
  return entry?.[1]
}

function getScenario(universeComparison = {}, scenarioId) {
  return universeComparison.scenarios?.[scenarioId] ?? {}
}

function getScenarioCounts(universeComparison = {}, scenarioId) {
  return getScenario(universeComparison, scenarioId).counts ?? {}
}

function getCatalog(scenario = {}) {
  return scenario.subjectSets?.catalog ?? {}
}

function getRequiredKeys(scenario = {}) {
  return new Set(scenario.subjectSets?.requiredKeys ?? [])
}

function getFinalOccurrences(scenario = {}) {
  return scenario.subjectSets?.finalOccurrences ?? {}
}

function normalizeCall(value) {
  const text = normalizeText(value)
  if (!text) return ''
  if (text.includes('segundo') || text.includes('second') || text === '2') return 'SEGUNDO_LLAMADO'
  if (text.includes('primer') || text.includes('first') || text === '1') return 'PRIMER_LLAMADO'
  if (text.includes('especial') || text.includes('special')) return 'ESPECIAL'
  return text.toUpperCase().replaceAll(' ', '_')
}

function displayCall(value) {
  const normalized = normalizeCall(value)
  if (normalized === 'PRIMER_LLAMADO') return 'Primer llamado'
  if (normalized === 'SEGUNDO_LLAMADO') return 'Segundo llamado'
  if (normalized === 'ESPECIAL') return 'Especial'
  return clean(value) || 'SIN_LLAMADO'
}

function getPlanId(row = {}) {
  return clean(readField(row, 'planId'))
}

function getMateriaCodigo(row = {}) {
  return clean(readField(row, 'materiaCodigo'))
}

function getLegacyMateriaCode(row = {}) {
  return clean(row.materia ?? row.codigo ?? row.codigoMateria ?? row.materiaCodigo)
}

function getMateriaNombre(row = {}) {
  return clean(readField(row, 'materiaNombre') ?? getLegacyMateriaCode(row))
}

function getCarrera(row = {}) {
  return clean(readField(row, 'carrera'))
}

function getAnio(row = {}) {
  return clean(readField(row, 'anio'))
}

function subjectKeyFromParts({ plan_id = '', materia_codigo = '', carrera = '', anio = '', materia_nombre = '' } = {}) {
  if (clean(plan_id) && clean(materia_codigo)) {
    return {
      subjectKey: `plan:${normalizeToken(plan_id)}::materia:${normalizeToken(materia_codigo)}`,
      keyType: 'PLAN_CODE',
    }
  }

  return {
    subjectKey: [
      'weak',
      normalizeToken(carrera) || 'sin-carrera',
      normalizeToken(materia_nombre || materia_codigo) || 'sin-materia',
      normalizeToken(anio) || 'sin-anio',
    ].join('::'),
    keyType: 'WEAK_KEY',
  }
}

function subjectKeyFromRow(row = {}) {
  return subjectKeyFromParts({
    plan_id: getPlanId(row),
    materia_codigo: getMateriaCodigo(row),
    carrera: getCarrera(row),
    anio: getAnio(row),
    materia_nombre: getMateriaNombre(row),
  })
}

function buildPlanCatalog(snapshot = {}) {
  return asArray(snapshot.planesEstudio).reduce((catalog, plan) => {
    const career = normalizeToken(getCarrera(plan))
    const legacyCode = normalizeToken(getLegacyMateriaCode(plan))
    const name = normalizeToken(getMateriaNombre(plan))
    const year = normalizeToken(getAnio(plan))

    if (career && legacyCode) catalog.byCareerLegacyCode.set(`${career}::${legacyCode}`, plan)
    if (career && name) catalog.byCareerNameYear.set(`${career}::${name}::${year}`, plan)
    return catalog
  }, {
    byCareerLegacyCode: new Map(),
    byCareerNameYear: new Map(),
  })
}

function enrichSubjectFromPlan(subject = {}, mesa = {}, planCatalog) {
  const career = normalizeToken(getCarrera(subject) || getCarrera(mesa))
  const legacyCode = normalizeToken(getLegacyMateriaCode(subject))
  const name = normalizeToken(getMateriaNombre(subject))
  const year = normalizeToken(getAnio(subject) || getAnio(mesa))
  const plan = planCatalog.byCareerLegacyCode.get(`${career}::${legacyCode}`) ??
    planCatalog.byCareerNameYear.get(`${career}::${name}::${year}`) ??
    {}

  return {
    ...subject,
    carrera: getCarrera(subject) || getCarrera(mesa),
    anio: getAnio(subject) || getAnio(mesa),
    plan_id: getPlanId(subject) || getPlanId(plan),
    materia_codigo: getMateriaCodigo(subject) || getMateriaCodigo(plan),
    materia_nombre: getMateriaNombre(subject) || getMateriaNombre(plan),
  }
}

function getGroupedSubjects(mesa = {}, planCatalog) {
  const subjects = asArray(mesa.materiasAgrupadas).length ? asArray(mesa.materiasAgrupadas) : [mesa]
  return subjects.map((subject) => enrichSubjectFromPlan(subject, mesa, planCatalog))
}

function catalogLabel(key, catalogs = []) {
  const found = catalogs.map((catalog) => catalog?.[key]).find(Boolean) ?? {}
  return {
    subjectKey: key,
    keyType: found.keyType ?? (key.startsWith('weak::') ? 'WEAK_KEY' : 'PLAN_CODE'),
    carrera: clean(found.carrera),
    plan_id: clean(found.planId),
    materia_codigo: clean(found.materiaCodigo),
    materia_nombre: clean(found.materiaNombre),
    anio: clean(found.anio),
  }
}

function riskFlagsForSubject(subject = {}) {
  const flags = []
  if (subject.keyType === 'WEAK_KEY' || subject.subjectKey?.startsWith('weak::')) {
    flags.push('WEAK_KEY')
  }
  if (!clean(subject.plan_id)) flags.push('MISSING_PLAN_ID')
  if (!clean(subject.materia_codigo)) flags.push('MISSING_MATERIA_CODIGO')
  if (looksLikeLaboratorio([subject]) && (!clean(subject.plan_id) || !clean(subject.materia_codigo))) {
    flags.push('LABORATORIO_MULTIPLAN_RISK')
  }
  return unique(flags)
}

function looksLikeLaboratorio(subjects = []) {
  return subjects.some((subject) => {
    const text = normalizeText([
      subject.carrera ?? getCarrera(subject),
      subject.plan_id ?? getPlanId(subject),
      subject.materia_codigo ?? getMateriaCodigo(subject),
      subject.materia_nombre ?? getMateriaNombre(subject),
    ].join(' '))
    return text.includes('laboratorio') || /\blab\b/.test(text)
  })
}

function buildLegacyOccurrenceIndex({ legacyResult = [], snapshot = {} }) {
  const planCatalog = buildPlanCatalog(snapshot)
  const requiredKeys = new Set()
  const subjectCalls = new Map()
  const compactTables = []

  asArray(legacyResult).forEach((mesa, index) => {
    const subjects = getGroupedSubjects(mesa, planCatalog)
    const call = normalizeCall(mesa.exam_call ?? mesa.llamado ?? mesa.llamadoNumero)
    const groupedSubjectCalls = subjects.map((subject) => {
      const keyInfo = subjectKeyFromRow(subject)
      requiredKeys.add(keyInfo.subjectKey)
      const subjectCallKey = `${keyInfo.subjectKey}::call:${call || 'SIN_LLAMADO'}`
      const current = subjectCalls.get(subjectCallKey) ?? {
        subjectCallKey,
        subjectKey: keyInfo.subjectKey,
        callNumber: call,
        llamado: displayCall(call),
        carrera: getCarrera(subject),
        plan_id: getPlanId(subject),
        materia_codigo: getMateriaCodigo(subject) || getLegacyMateriaCode(subject),
        materia_nombre: getMateriaNombre(subject),
        anio: getAnio(subject),
        legacyCount: 0,
      }
      current.legacyCount += 1
      subjectCalls.set(subjectCallKey, current)
      return {
        subjectCallKey,
        subjectKey: keyInfo.subjectKey,
        keyType: keyInfo.keyType,
        callNumber: call,
        llamado: displayCall(call),
        carrera: getCarrera(subject),
        plan_id: getPlanId(subject),
        materia_codigo: getMateriaCodigo(subject) || getLegacyMateriaCode(subject),
        materia_nombre: getMateriaNombre(subject),
        anio: getAnio(subject),
      }
    })

    compactTables.push({
      mesa,
      index,
      groupedSubjectCalls,
    })
  })

  return {
    requiredKeys,
    subjectCalls,
    compactTables,
  }
}

function subjectCallsFromScenario(scenario = {}) {
  const catalog = getCatalog(scenario)
  return Object.entries(getFinalOccurrences(scenario)).reduce((map, [subjectKey, occurrence]) => {
    const calls = asArray(occurrence.calls).length ? asArray(occurrence.calls) : ['']
    const count = numberOrZero(occurrence.occurrences)
    const perCallCount = calls.length ? Math.max(1, Math.round(count / calls.length)) : count

    calls.forEach((callValue) => {
      const call = normalizeCall(callValue)
      const label = catalogLabel(subjectKey, [catalog])
      const subjectCallKey = `${subjectKey}::call:${call || 'SIN_LLAMADO'}`
      map.set(subjectCallKey, {
        subjectCallKey,
        subjectKey,
        callNumber: call,
        llamado: displayCall(callValue),
        carrera: label.carrera,
        plan_id: label.plan_id,
        materia_codigo: label.materia_codigo,
        materia_nombre: label.materia_nombre,
        anio: label.anio,
        examEngineCount: perCallCount,
      })
    })

    return map
  }, new Map())
}

function buildRequiredSubjectView({ legacyScenario, examScenario, legacyIndex }) {
  const legacyRequired = new Set([
    ...getRequiredKeys(legacyScenario),
    ...legacyIndex.requiredKeys,
  ])
  const examRequired = getRequiredKeys(examScenario)
  const catalogs = [getCatalog(legacyScenario), getCatalog(examScenario)]
  const allKeys = unique([...legacyRequired, ...examRequired])

  return allKeys.map((key) => {
    const label = catalogLabel(key, catalogs)
    const presentInLegacy = legacyRequired.has(key)
    const presentInExamEngine = examRequired.has(key)
    const row = {
      ...label,
      requiresMesa: presentInLegacy || presentInExamEngine,
      presentInLegacy,
      presentInExamEngine,
      legacyCount: presentInLegacy ? 1 : 0,
      examEngineCount: presentInExamEngine ? 1 : 0,
    }
    return {
      ...row,
      riskFlags: riskFlagsForSubject(row),
    }
  }).sort((left, right) => left.subjectKey.localeCompare(right.subjectKey))
}

function buildSubjectCallView({ legacyIndex, examScenario }) {
  const examCalls = subjectCallsFromScenario(examScenario)
  const allKeys = unique([...legacyIndex.subjectCalls.keys(), ...examCalls.keys()])

  return allKeys.map((subjectCallKey) => {
    const legacy = legacyIndex.subjectCalls.get(subjectCallKey)
    const exam = examCalls.get(subjectCallKey)
    const source = exam ?? legacy ?? {}
    const row = {
      subjectCallKey,
      subjectKey: source.subjectKey,
      callNumber: source.callNumber,
      llamado: source.llamado,
      carrera: source.carrera,
      plan_id: source.plan_id,
      materia_codigo: source.materia_codigo,
      materia_nombre: source.materia_nombre,
      anio: source.anio,
      presentInLegacy: Boolean(legacy),
      presentInExamEngine: Boolean(exam),
      legacyCount: numberOrZero(legacy?.legacyCount),
      examEngineCount: numberOrZero(exam?.examEngineCount),
    }
    return {
      ...row,
      difference: row.examEngineCount - row.legacyCount,
      riskFlags: riskFlagsForSubject({
        subjectKey: row.subjectKey,
        keyType: row.subjectKey?.startsWith('weak::') ? 'WEAK_KEY' : 'PLAN_CODE',
        carrera: row.carrera,
        plan_id: row.plan_id,
        materia_codigo: row.materia_codigo,
        materia_nombre: row.materia_nombre,
      }),
    }
  }).sort((left, right) => left.subjectCallKey.localeCompare(right.subjectCallKey))
}

function compactSafety({ groupedSubjectCalls, examEquivalent }) {
  const weakKey = groupedSubjectCalls.some((subject) => subject.keyType === 'WEAK_KEY')
  const laboratorio = looksLikeLaboratorio(groupedSubjectCalls)
  const distinctSubjects = unique(groupedSubjectCalls.map((subject) => subject.subjectKey)).length > 1

  if (laboratorio && weakKey) return SAFETY.LABORATORIO_MULTIPLAN_RISK
  if (weakKey) return SAFETY.AUDIT_ONLY_WEAK_KEY
  if (!examEquivalent) return SAFETY.NO_EXAM_ENGINE_EQUIVALENT
  if (distinctSubjects) return SAFETY.REQUIRES_INSTITUTIONAL_REVIEW
  return SAFETY.SAFE_TO_COMPARE
}

function recommendationForCompact(safety) {
  if (safety === SAFETY.LABORATORIO_MULTIPLAN_RISK) {
    return 'No comparar como mesa compactada hasta separar Laboratorio por plan_id.'
  }
  if (safety === SAFETY.AUDIT_ONLY_WEAK_KEY) {
    return 'Vista solo auditable: faltan plan_id + materia_codigo para replicar compactacion.'
  }
  if (safety === SAFETY.REQUIRES_INSTITUTIONAL_REVIEW) {
    return 'Requiere validar institucionalmente la compactacion de materias distintas.'
  }
  if (safety === SAFETY.NO_EXAM_ENGINE_EQUIVALENT) {
    return 'Falta una equivalencia clara en examEngine para esta mesa final.'
  }
  return 'Comparable a nivel auditoria; mantener trazabilidad antes de cualquier integracion.'
}

function buildCompactFinalTableView({ legacyIndex, subjectCallView }) {
  const examSubjectCalls = new Set(
    subjectCallView.filter((row) => row.presentInExamEngine).map((row) => row.subjectCallKey),
  )

  return legacyIndex.compactTables.map((entry) => {
    const groupedSubjectCalls = entry.groupedSubjectCalls
    const examEngineEquivalent = groupedSubjectCalls.every((subject) => examSubjectCalls.has(subject.subjectCallKey))
    const safety = compactSafety({ groupedSubjectCalls, examEquivalent: examEngineEquivalent })
    const calls = unique(groupedSubjectCalls.map((subject) => subject.llamado))
    const materias = unique(groupedSubjectCalls.map((subject) => subject.materia_nombre))
    const carrera = unique(groupedSubjectCalls.map((subject) => subject.carrera)).join(' / ')
    const planIds = unique(groupedSubjectCalls.map((subject) => subject.plan_id))
    const materiaCodigos = unique(groupedSubjectCalls.map((subject) => subject.materia_codigo))

    return {
      compactTableKey: `legacy_final_table_${String(entry.index + 1).padStart(3, '0')}`,
      sourceLevel: 'compactFinalTable',
      groupedSubjectCalls,
      carrera,
      plan_id: planIds.join(' / '),
      materia_codigo: materiaCodigos.join(' / '),
      materias_involucradas: materias.join(' | '),
      llamados_involucrados: calls.join(' / '),
      legacyEquivalent: true,
      examEngineEquivalent,
      compactedCount: groupedSubjectCalls.length,
      safety,
      recommendation: recommendationForCompact(safety),
    }
  })
}

function countRows(rows = [], predicate) {
  return rows.filter(predicate).length
}

function buildSummary({
  requiredSubjectView,
  subjectCallView,
  compactFinalTableView,
  universeComparison,
  gapExplanation,
}) {
  const legacyCounts = getScenarioCounts(universeComparison, 'legacy_raw')
  const examCounts = getScenarioCounts(universeComparison, 'examEngine_raw')
  const weakKeyCount = countRows(requiredSubjectView, (row) => row.riskFlags.includes('WEAK_KEY'))
  const laboratorioRiskCount = countRows(requiredSubjectView, (row) => row.riskFlags.includes('LABORATORIO_MULTIPLAN_RISK'))
  const requiresInstitutionalReviewCount = countRows(compactFinalTableView, (row) => (
    row.safety === SAFETY.REQUIRES_INSTITUTIONAL_REVIEW ||
    row.safety === SAFETY.AUDIT_ONLY_WEAK_KEY ||
    row.safety === SAFETY.LABORATORIO_MULTIPLAN_RISK ||
    row.safety === SAFETY.NO_EXAM_ENGINE_EQUIVALENT
  ))
  const subjectLevelEquivalent = requiredSubjectView.every((row) => row.presentInLegacy === row.presentInExamEngine)
  const subjectCallEquivalent = subjectCallView.every((row) => row.presentInLegacy === row.presentInExamEngine)
  const compactEquivalent = compactFinalTableView.every((row) => (
    row.legacyEquivalent && row.examEngineEquivalent && row.safety === SAFETY.SAFE_TO_COMPARE
  ))
  const hasDocenteMateriaCorrected = Boolean(gapExplanation?.source?.docenteMateriaCorrected)

  return {
    totalRequiredSubjectsLegacy: numberOrZero(legacyCounts.requiresMesa) ||
      countRows(requiredSubjectView, (row) => row.presentInLegacy),
    totalRequiredSubjectsExamEngine: numberOrZero(examCounts.requiresMesa) ||
      countRows(requiredSubjectView, (row) => row.presentInExamEngine),
    totalSubjectCallsLegacy: subjectCallView.reduce((sum, row) => sum + numberOrZero(row.legacyCount), 0),
    totalSubjectCallsExamEngine: subjectCallView.reduce((sum, row) => sum + numberOrZero(row.examEngineCount), 0),
    totalCompactFinalTablesLegacy: compactFinalTableView.length,
    totalCompactFinalTablesExamEngineEquivalent: countRows(compactFinalTableView, (row) => row.examEngineEquivalent),
    weakKeyCount,
    laboratorioRiskCount,
    requiresInstitutionalReviewCount,
    safeToCompareAtRequiredSubjectLevel: subjectLevelEquivalent,
    safeToCompareAtSubjectCallLevel: subjectCallEquivalent && weakKeyCount === 0,
    safeToCompareAtCompactFinalTableLevel: compactEquivalent,
    safeToReplaceLegacy: false,
    equivalenceSignals: {
      subjectLevelEquivalent,
      subjectCallEquivalent,
      compactEquivalent,
      gapExplanationSafeToReplace: gapExplanation?.summary?.safeToReplaceLegacy === true,
      hasDocenteMateriaCorrected,
    },
  }
}

function buildRecommendations(summary = {}) {
  const recommendations = [
    'Usar requiredSubjectView para validar si ambos motores toman el mismo universo base.',
    'Usar subjectCallView para comparar planificacion regular por llamado.',
    'Usar compactFinalTableView solo como auditoria hasta tener claves fuertes y revision institucional.',
    'No reemplazar legacy hasta cerrar equivalencia de mesa final compactada.',
  ]

  if (summary.weakKeyCount > 0) {
    recommendations.push('Completar plan_id + materia_codigo antes de comparar a nivel contractual.')
  }
  if (summary.requiresInstitutionalReviewCount > 0) {
    recommendations.push('Revisar institucionalmente las compactaciones antes de replicarlas en examEngine.')
  }
  if (!summary.safeToCompareAtSubjectCallLevel) {
    recommendations.push('Crear una metrica explicita materia+llamado para evitar confundir split regular con sobre-generacion.')
  }

  return unique(recommendations)
}

export function buildExamUniverseEquivalenceView({
  snapshot,
  legacyResult,
  examEngineResult,
  universeComparison,
  gapExplanation,
  options = {},
} = {}) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? cloneJson(snapshot) : {}
  const safeLegacyResult = cloneJson(asArray(legacyResult))
  const safeUniverseComparison = universeComparison && typeof universeComparison === 'object'
    ? cloneJson(universeComparison)
    : {}
  const safeGapExplanation = gapExplanation && typeof gapExplanation === 'object'
    ? cloneJson(gapExplanation)
    : {}
  const legacyScenario = getScenario(safeUniverseComparison, 'legacy_raw')
  const examScenario = examEngineResult?.scenario ?? getScenario(safeUniverseComparison, 'examEngine_raw')
  const legacyIndex = buildLegacyOccurrenceIndex({
    legacyResult: safeLegacyResult,
    snapshot: safeSnapshot,
  })
  const requiredSubjectView = buildRequiredSubjectView({
    legacyScenario,
    examScenario,
    legacyIndex,
  })
  const subjectCallView = buildSubjectCallView({
    legacyIndex,
    examScenario,
  })
  const compactFinalTableView = buildCompactFinalTableView({
    legacyIndex,
    subjectCallView,
  })
  const summary = buildSummary({
    requiredSubjectView,
    subjectCallView,
    compactFinalTableView,
    universeComparison: safeUniverseComparison,
    gapExplanation: safeGapExplanation,
  })

  return {
    requiredSubjectView: options.includeViews === false ? [] : requiredSubjectView,
    subjectCallView: options.includeViews === false ? [] : subjectCallView,
    compactFinalTableView: options.includeViews === false ? [] : compactFinalTableView,
    summary,
    recommendations: buildRecommendations(summary),
    warnings: [],
    errors: [],
  }
}
