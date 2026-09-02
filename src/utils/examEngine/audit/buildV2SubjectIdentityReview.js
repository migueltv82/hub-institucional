const CAREER_ID_RULES = Object.freeze([
  { id: 'ING', tokens: ['profesorado', 'ingles'] },
  { id: 'GEO', tokens: ['profesorado', 'geografia'] },
  { id: 'QUI', tokens: ['profesorado', 'quimica'] },
  { id: 'LAB', tokens: ['laboratorio'] },
  { id: 'TUR', tokens: ['turismo'] },
  { id: 'TRA', tokens: ['traduccion'] },
  { id: 'TRA', tokens: ['traductorado'] },
])

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

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function inferCareerId(carrera = '') {
  const normalized = normalizeText(carrera)
  const rule = CAREER_ID_RULES.find((candidate) => (
    candidate.tokens.every((token) => normalized.includes(token))
  ))
  return rule?.id ?? ''
}

function suggestPlanId({ carreraId = '', currentPlanId = '' } = {}) {
  if (clean(currentPlanId)) return clean(currentPlanId)
  if (carreraId === 'LAB') return 'LAB-2015|LAB-2024'
  if (!carreraId) return ''
  return `${carreraId}-PLAN-ACTUAL`
}

function shortNameCode(name = '') {
  const stopwords = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'a', 'i', 'ii', 'iii', 'iv'])
  const romanSuffix = normalizeText(name).match(/\b(i|ii|iii|iv|v|vi)\b$/)?.[1]?.toUpperCase() ?? ''
  const tokens = normalizeText(name)
    .split(' ')
    .filter((token) => token && !stopwords.has(token))
    .slice(0, 4)
  const base = tokens.map((token) => token.slice(0, 4).toUpperCase()).join('')
  return `${base || 'MATERIA'}${romanSuffix}`.slice(0, 18)
}

function suggestSubjectCode({ carreraId = '', anio = '', materiaNombre = '', planIdSuggestion = '' } = {}) {
  const year = clean(anio) || 'X'
  const subject = shortNameCode(materiaNombre)

  if (carreraId === 'LAB' && planIdSuggestion.includes('|')) {
    return planIdSuggestion
      .split('|')
      .map((planId) => `${planId}-${year}-${subject}`)
      .join('|')
  }

  if (!carreraId) return `${year}-${subject}`
  return `${carreraId}-${year}-${subject}`
}

function isLaboratorio(carrera = '') {
  const normalized = normalizeText(carrera)
  return normalized.includes('laboratorio') || /\blab\b/.test(normalized)
}

function buildDetectedCalls(subjectCallView = []) {
  return asArray(subjectCallView).reduce((map, row) => {
    const key = clean(row.subjectKey)
    if (!key) return map
    const values = map.get(key) ?? new Set()
    if (clean(row.llamado)) values.add(clean(row.llamado))
    if (clean(row.callNumber)) values.add(clean(row.callNumber))
    map.set(key, values)
    return map
  }, new Map())
}

function buildDuplicateNameIndex(requiredRows = []) {
  return requiredRows.reduce((map, row) => {
    const nameKey = normalizeToken(row.materia_nombre)
    if (!nameKey) return map
    const rows = map.get(nameKey) ?? []
    rows.push(row)
    map.set(nameKey, rows)
    return map
  }, new Map())
}

function duplicateRisk(row = {}, duplicateIndex = new Map()) {
  const rows = duplicateIndex.get(normalizeToken(row.materia_nombre)) ?? []
  if (rows.length <= 1) return false

  const careers = unique(rows.map((item) => item.carrera))
  const years = unique(rows.map((item) => item.anio))
  const plans = unique(rows.map((item) => item.plan_id))
  const subjectCodes = unique(rows.map((item) => item.materia_codigo))

  return careers.length > 1 || years.length > 1 || plans.length > 1 || subjectCodes.length > 1 || rows.length > 1
}

function reviewReason(risks = []) {
  if (!risks.length) return ''
  return risks.join('|')
}

function requiredAction(risks = []) {
  if (!risks.length) return 'SIN_ACCION'
  if (risks.includes('LABORATORIO_MULTIPLAN_REQUIERE_CONFIRMACION')) {
    return 'CONFIRMAR_PLAN_LABORATORIO_Y_CODIGO_OFICIAL'
  }
  if (risks.includes('UNKNOWN_CARRERA')) return 'CONFIRMAR_CARRERA_ID'
  if (risks.includes('DUPLICATE_SUBJECT_NAME')) return 'VALIDAR_HOMONIMIAS_Y_CODIGO_OFICIAL'
  if (risks.includes('MISSING_PLAN_ID') || risks.includes('MISSING_MATERIA_CODIGO')) {
    return 'COMPLETAR_PLAN_ID_Y_MATERIA_CODIGO_OFICIAL'
  }
  return 'REVISION_INSTITUCIONAL'
}

function normalizeRequiredRows(equivalenceView = {}) {
  return asArray(equivalenceView.requiredSubjectView).filter((row) => row.requiresMesa !== false)
}

function buildReviewRow({ row, index, duplicateIndex, callsBySubject }) {
  const carrera = clean(row.carrera)
  const careerIdActual = clean(row.carrera_id_actual ?? row.carrera_id)
  const careerIdSuggested = careerIdActual || inferCareerId(carrera)
  const currentPlanId = clean(row.plan_id)
  const currentSubjectCode = clean(row.materia_codigo)
  const planIdSuggested = suggestPlanId({
    carreraId: careerIdSuggested,
    currentPlanId,
  })
  const subjectCodeSuggested = currentSubjectCode || suggestSubjectCode({
    carreraId: careerIdSuggested,
    anio: row.anio,
    materiaNombre: row.materia_nombre,
    planIdSuggestion: planIdSuggested,
  })
  const weakKey = clean(row.keyType) === 'WEAK_KEY' || clean(row.subjectKey).startsWith('weak::')
  const missingPlanId = !currentPlanId
  const missingSubjectCode = !currentSubjectCode
  const laboratorioRisk = isLaboratorio(carrera) && missingPlanId
  const duplicate = duplicateRisk(row, duplicateIndex)
  const risks = [
    weakKey ? 'WEAK_KEY' : '',
    missingPlanId ? 'MISSING_PLAN_ID' : '',
    missingSubjectCode ? 'MISSING_MATERIA_CODIGO' : '',
    duplicate ? 'DUPLICATE_SUBJECT_NAME' : '',
    laboratorioRisk ? 'LABORATORIO_MULTIPLAN_REQUIERE_CONFIRMACION' : '',
    !careerIdSuggested ? 'UNKNOWN_CARRERA' : '',
    missingSubjectCode ? 'REQUIERE_CODIGO_OFICIAL' : '',
  ].filter(Boolean)
  const calls = [...(callsBySubject.get(row.subjectKey) ?? new Set())]

  return {
    review_id: `v2_subject_${String(index + 1).padStart(3, '0')}`,
    carrera,
    carrera_id_actual: careerIdActual,
    carrera_id_sugerido: careerIdSuggested,
    anio: clean(row.anio),
    materia_nombre: clean(row.materia_nombre),
    materia_key_actual: clean(row.subjectKey),
    plan_id_actual: currentPlanId,
    plan_id_sugerido: planIdSuggested,
    materia_codigo_actual: currentSubjectCode,
    materia_codigo_sugerido: subjectCodeSuggested,
    requiere_mesa: row.requiresMesa === false ? 'NO' : 'SI',
    presentInLegacy: row.presentInLegacy === true ? 'SI' : 'NO',
    presentInExamEngine: row.presentInExamEngine === true ? 'SI' : 'NO',
    legacyCount: numberOrZero(row.legacyCount),
    examEngineCount: numberOrZero(row.examEngineCount),
    llamados_detectados: calls.join('|'),
    keyType: clean(row.keyType),
    riesgo_clave_debil: weakKey ? 'SI' : 'NO',
    riesgo_nombre_duplicado: duplicate ? 'SI' : 'NO',
    riesgo_laboratorio_multiplan: laboratorioRisk ? 'SI' : 'NO',
    requiere_revision: risks.length ? 'SI' : 'NO',
    motivo_revision: reviewReason(risks),
    accion_requerida: requiredAction(risks),
    observaciones_revision: currentSubjectCode
      ? ''
      : 'Codigo sugerido para revision; no es codigo oficial confirmado.',
  }
}

function groupRowsByCareer(reviewRows = []) {
  return reviewRows.reduce((groups, row) => {
    const key = row.carrera || 'SIN_CARRERA'
    const current = groups[key] ?? {
      carrera: key,
      total: 0,
      requiresInstitutionalReview: 0,
      weakKeys: 0,
      missingPlanId: 0,
      missingMateriaCodigo: 0,
      duplicateNameRisks: 0,
      laboratorioMultiPlanSubjects: 0,
    }
    current.total += 1
    if (row.requiere_revision === 'SI') current.requiresInstitutionalReview += 1
    if (row.riesgo_clave_debil === 'SI') current.weakKeys += 1
    if (!row.plan_id_actual) current.missingPlanId += 1
    if (!row.materia_codigo_actual) current.missingMateriaCodigo += 1
    if (row.riesgo_nombre_duplicado === 'SI') current.duplicateNameRisks += 1
    if (row.riesgo_laboratorio_multiplan === 'SI') current.laboratorioMultiPlanSubjects += 1
    groups[key] = current
    return groups
  }, {})
}

function countRows(rows = [], predicate) {
  return rows.filter(predicate).length
}

function buildSummary(reviewRows = []) {
  const weakKeySubjects = countRows(reviewRows, (row) => row.riesgo_clave_debil === 'SI')
  const missingPlanId = countRows(reviewRows, (row) => !row.plan_id_actual)
  const missingMateriaCodigo = countRows(reviewRows, (row) => !row.materia_codigo_actual)
  const requiresInstitutionalReview = countRows(reviewRows, (row) => row.requiere_revision === 'SI')

  return {
    totalRequiredSubjects: reviewRows.length,
    strongKeySubjects: reviewRows.length - weakKeySubjects,
    weakKeySubjects,
    missingPlanId,
    missingMateriaCodigo,
    laboratorioMultiPlanSubjects: countRows(reviewRows, (row) => row.riesgo_laboratorio_multiplan === 'SI'),
    duplicateNameRisks: countRows(reviewRows, (row) => row.riesgo_nombre_duplicado === 'SI'),
    requiresInstitutionalReview,
    readyForCompactFinalTableComparison: weakKeySubjects === 0,
    safeToReplaceLegacy: false,
  }
}

function buildRecommendations(summary = {}) {
  const recommendations = [
    'Completar plan_id y materia_codigo oficiales para todas las materias requeridas.',
    'Usar este CSV como paquete de revision institucional antes de compactar mesas.',
    'No reemplazar legacy mientras haya claves debiles o codigos sugeridos sin confirmar.',
  ]

  if (summary.laboratorioMultiPlanSubjects > 0) {
    recommendations.push('Resolver Laboratorio con LAB-2015 o LAB-2024 antes de cualquier equivalencia automatica.')
  }
  if (summary.duplicateNameRisks > 0) {
    recommendations.push('Revisar homonimias: una misma materia_nombre puede corresponder a carreras, años o planes distintos.')
  }

  return unique(recommendations)
}

export function buildV2SubjectIdentityReview({ snapshot, equivalenceView, readinessReport, options = {} } = {}) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? cloneJson(snapshot) : {}
  const safeEquivalenceView = equivalenceView && typeof equivalenceView === 'object' ? cloneJson(equivalenceView) : {}
  const safeReadinessReport = readinessReport && typeof readinessReport === 'object' ? cloneJson(readinessReport) : {}
  const requiredRows = normalizeRequiredRows(safeEquivalenceView)
  const callsBySubject = buildDetectedCalls(safeEquivalenceView.subjectCallView)
  const duplicateIndex = buildDuplicateNameIndex(requiredRows)
  const reviewRows = requiredRows.map((row, index) => buildReviewRow({
    row,
    index,
    duplicateIndex,
    callsBySubject,
  }))
  const groupedByCareer = groupRowsByCareer(reviewRows)
  const summary = buildSummary(reviewRows)

  return {
    reviewRows: options.includeRows === false ? [] : reviewRows,
    groupedByCareer,
    summary: {
      ...summary,
      sourceCounts: {
        planesEstudio: asArray(safeSnapshot.planesEstudio).length,
        equivalenceRequiredSubjects: requiredRows.length,
        readinessMissingFields: asArray(safeReadinessReport.missingFields).length,
      },
    },
    recommendations: buildRecommendations(summary),
    warnings: [],
    errors: [],
  }
}
