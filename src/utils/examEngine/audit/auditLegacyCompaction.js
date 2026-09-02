const COMPACTION_CLASSIFICATIONS = Object.freeze({
  SAME_SUBJECT_MULTIPLE_CALLS: 'SAME_SUBJECT_MULTIPLE_CALLS',
  SAME_SUBJECT_MULTIPLE_STUDENTS: 'SAME_SUBJECT_MULTIPLE_STUDENTS',
  SAME_TEACHER_MULTIPLE_SUBJECTS: 'SAME_TEACHER_MULTIPLE_SUBJECTS',
  SAME_COURSE_OR_YEAR: 'SAME_COURSE_OR_YEAR',
  EQUIVALENT_SUBJECT_NAMES: 'EQUIVALENT_SUBJECT_NAMES',
  SHARED_TRIBUNAL: 'SHARED_TRIBUNAL',
  PRACTICA_OR_SPECIAL_SUBJECT: 'PRACTICA_OR_SPECIAL_SUBJECT',
  UNKNOWN_COMPACTION: 'UNKNOWN_COMPACTION',
})

const SAFETY = Object.freeze({
  SAFE_TO_REPLICATE: 'SAFE_TO_REPLICATE',
  REQUIRES_INSTITUTIONAL_REVIEW: 'REQUIRES_INSTITUTIONAL_REVIEW',
  DO_NOT_REPLICATE_WITHOUT_PLAN_ID: 'DO_NOT_REPLICATE_WITHOUT_PLAN_ID',
  UNKNOWN: 'UNKNOWN',
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
  teacher: [
    'docente',
    'profesor',
    'profesorTitular',
    'titular',
    'apellido_nombre',
    'nombreDocente',
    'docenteNombre',
    'full_name',
    'fullName',
    'display_name',
    'nombreCompleto',
  ],
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

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
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

function hasStrongSubjectKey(row = {}) {
  return Boolean(getPlanId(row) && getMateriaCodigo(row))
}

function buildSubjectKey(row = {}) {
  const planId = getPlanId(row)
  const materiaCodigo = getMateriaCodigo(row)
  const carrera = getCarrera(row)
  const materiaNombre = getMateriaNombre(row)
  const anio = getAnio(row)

  if (planId && materiaCodigo) {
    return {
      key: `plan:${normalizeToken(planId)}::materia:${normalizeToken(materiaCodigo)}`,
      keyType: 'PLAN_CODE',
      weakKey: false,
      planId,
      materiaCodigo,
      carrera,
      materiaNombre,
      anio,
    }
  }

  return {
    key: [
      'weak',
      normalizeToken(carrera) || 'sin-carrera',
      normalizeToken(materiaNombre || getLegacyMateriaCode(row)) || 'sin-materia',
      normalizeToken(anio) || 'sin-anio',
    ].join('::'),
    keyType: 'WEAK_KEY',
    weakKey: true,
    planId,
    materiaCodigo: materiaCodigo || getLegacyMateriaCode(row),
    carrera,
    materiaNombre,
    anio,
  }
}

function buildPlanCatalog(snapshot = {}) {
  return asArray(snapshot.planesEstudio).reduce((catalog, plan) => {
    const career = normalizeToken(getCarrera(plan))
    const legacyCode = normalizeToken(getLegacyMateriaCode(plan))
    if (career && legacyCode) {
      catalog.byCareerLegacyCode.set(`${career}::${legacyCode}`, plan)
    }
    const name = normalizeToken(getMateriaNombre(plan))
    const year = normalizeToken(getAnio(plan))
    if (career && name) {
      catalog.byCareerNameYear.set(`${career}::${name}::${year}`, plan)
    }
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

function normalizeLegacyResult(result) {
  if (Array.isArray(result)) return result
  if (!result || typeof result !== 'object') return []
  return asArray(result.cronograma ?? result.mesas ?? result.data)
}

function getGroupedSubjects(mesa = {}, planCatalog) {
  const subjects = asArray(mesa.materiasAgrupadas).length
    ? asArray(mesa.materiasAgrupadas)
    : [mesa]

  return subjects.map((subject) => enrichSubjectFromPlan(subject, mesa, planCatalog))
}

function isDiscursivePractice(subject = {}) {
  const text = normalizeText(getMateriaNombre(subject))
  return text.includes('practicas discursivas iii') || text.includes('practicas discursivas iv')
}

function isProfessionalPractice(subject = {}) {
  if (isDiscursivePractice(subject)) return false
  const text = normalizeText(getMateriaNombre(subject))
  return [
    'practica profesional',
    'practicas profesionales',
    'practica docente',
    'residencia',
    'practica profesionalizante',
  ].some((token) => text.includes(token))
}

function looksLikeLaboratorio(subjects = []) {
  return subjects.some((subject) => {
    const text = normalizeText([
      getCarrera(subject),
      getPlanId(subject),
      getMateriaCodigo(subject),
      getMateriaNombre(subject),
    ].join(' '))
    return text.includes('laboratorio') || /\blab\b/.test(text)
  })
}

function teacherKey(subject = {}, mesa = {}) {
  return normalizeText(readField(subject, 'teacher') ?? readField(mesa, 'teacher'))
}

function subjectNameTokens(subject = {}) {
  return normalizeText(getMateriaNombre(subject)).split(' ').filter(Boolean)
}

function subjectsHaveEquivalentNames(subjects = []) {
  if (subjects.length < 2) return false
  const names = subjects.map((subject) => normalizeText(getMateriaNombre(subject))).filter(Boolean)
  if (new Set(names).size === 1) return true

  return subjects.some((subject, index) => subjects.slice(index + 1).some((other) => {
    const left = subjectNameTokens(subject)
    const right = subjectNameTokens(other)
    if (!left.length || !right.length) return false
    const intersection = left.filter((token) => right.includes(token)).length
    const shortest = Math.min(left.length, right.length)
    return shortest > 0 && intersection / shortest >= 0.75
  }))
}

function classifyCompaction({ subjects, mesa }) {
  const subjectKeys = unique(subjects.map((subject) => buildSubjectKey(subject).key))
  const calls = unique([mesa.exam_call, mesa.llamado, mesa.llamadoNumero])
  const teachers = unique(subjects.map((subject) => teacherKey(subject, mesa)))
  const careers = unique(subjects.map(getCarrera))
  const years = unique(subjects.map(getAnio))
  const hasPractice = subjects.some(isProfessionalPractice)

  if (subjectKeys.length === 1 && calls.length > 1) return COMPACTION_CLASSIFICATIONS.SAME_SUBJECT_MULTIPLE_CALLS
  if (subjectKeys.length === 1) return COMPACTION_CLASSIFICATIONS.SAME_SUBJECT_MULTIPLE_STUDENTS
  if (hasPractice) return COMPACTION_CLASSIFICATIONS.PRACTICA_OR_SPECIAL_SUBJECT
  if (teachers.length === 1 && teachers[0]) return COMPACTION_CLASSIFICATIONS.SAME_TEACHER_MULTIPLE_SUBJECTS
  if (careers.length === 1 && years.length === 1 && years[0]) return COMPACTION_CLASSIFICATIONS.SAME_COURSE_OR_YEAR
  if (subjectsHaveEquivalentNames(subjects)) return COMPACTION_CLASSIFICATIONS.EQUIVALENT_SUBJECT_NAMES
  if (clean(mesa.vocal1) || clean(mesa.vocal2) || asArray(mesa.vocales).length) {
    return COMPACTION_CLASSIFICATIONS.SHARED_TRIBUNAL
  }
  return COMPACTION_CLASSIFICATIONS.UNKNOWN_COMPACTION
}

function safetyForCase({ subjects, classification }) {
  const weakKeyRisk = subjects.some((subject) => !hasStrongSubjectKey(subject))
  const laboratorioMultiplanRisk = looksLikeLaboratorio(subjects) && weakKeyRisk
  const distinctSubjects = unique(subjects.map((subject) => buildSubjectKey(subject).key)).length > 1

  if (laboratorioMultiplanRisk || weakKeyRisk) {
    return SAFETY.DO_NOT_REPLICATE_WITHOUT_PLAN_ID
  }
  if (classification === COMPACTION_CLASSIFICATIONS.SAME_TEACHER_MULTIPLE_SUBJECTS || distinctSubjects) {
    return SAFETY.REQUIRES_INSTITUTIONAL_REVIEW
  }
  if (classification === COMPACTION_CLASSIFICATIONS.SAME_SUBJECT_MULTIPLE_CALLS) {
    return SAFETY.REQUIRES_INSTITUTIONAL_REVIEW
  }
  if (classification === COMPACTION_CLASSIFICATIONS.UNKNOWN_COMPACTION) return SAFETY.UNKNOWN
  return SAFETY.SAFE_TO_REPLICATE
}

function recommendationForCase({ safety, classification, weakKeyRisk, laboratorioMultiplanRisk }) {
  if (laboratorioMultiplanRisk) {
    return 'No replicar esta compactacion hasta separar plan_id LAB-2015/LAB-2024 y materia_codigo.'
  }
  if (weakKeyRisk) {
    return 'No replicar automaticamente hasta tener plan_id + materia_codigo en las fuentes v2.'
  }
  if (safety === SAFETY.REQUIRES_INSTITUTIONAL_REVIEW) {
    return classification === COMPACTION_CLASSIFICATIONS.SAME_TEACHER_MULTIPLE_SUBJECTS
      ? 'Revisar institucionalmente si compartir titular/tribunal habilita compactar materias distintas.'
      : 'Revisar institucionalmente antes de convertir esta regla en automatica.'
  }
  if (safety === SAFETY.SAFE_TO_REPLICATE) {
    return 'Puede modelarse como regla candidata de compactacion, manteniendo auditoria y trazabilidad.'
  }
  return 'Conservar como caso observado hasta contar con mas evidencia.'
}

function compareExamEngineBehavior(subjects = [], universeComparison = {}) {
  const scenarios = universeComparison.scenarios ?? {}
  const raw = scenarios.examEngine_raw ?? {}
  const finalOccurrences = raw.subjectSets?.finalOccurrences ?? {}
  const required = new Set(raw.subjectSets?.requiredKeys ?? [])
  const notRequired = new Set(raw.subjectSets?.notRequiredKeys ?? [])
  const keys = unique(subjects.map((subject) => buildSubjectKey(subject).key))
  const matches = keys.map((key) => ({
    key,
    required: required.has(key),
    notRequired: notRequired.has(key),
    occurrences: numberOrZero(finalOccurrences[key]?.occurrences),
    calls: asArray(finalOccurrences[key]?.calls),
  }))
  const included = matches.filter((match) => match.occurrences > 0)

  if (!Object.keys(scenarios).length) {
    return {
      code: 'NO_UNIVERSE_COMPARISON_AVAILABLE',
      label: 'No hay comparacion previa disponible.',
      details: matches,
    }
  }
  if (!included.length) {
    return {
      code: matches.some((match) => match.notRequired) ? 'NOT_INCLUDED_AS_NOT_REQUIRED' : 'NOT_INCLUDED',
      label: matches.some((match) => match.notRequired)
        ? 'El nuevo motor no lo incluye porque lo considera no requerido/no planificable.'
        : 'El nuevo motor no lo incluye en mesas finales detectadas.',
      details: matches,
    }
  }

  const splitByCall = included.some((match) => match.occurrences > 1 || match.calls.length > 1)
  const splitBySubject = keys.length > 1 && included.length > 1
  if (splitByCall && splitBySubject) {
    return {
      code: 'SEPARATES_BY_CALL_AND_SUBJECT',
      label: 'El nuevo motor lo separa por llamado y por materia.',
      details: matches,
    }
  }
  if (splitByCall) {
    return {
      code: 'SEPARATES_BY_CALL',
      label: 'El nuevo motor lo separa por llamado.',
      details: matches,
    }
  }
  if (splitBySubject) {
    return {
      code: 'SEPARATES_BY_SUBJECT',
      label: 'El nuevo motor lo separa por materia.',
      details: matches,
    }
  }
  if (keys.some((key) => key.startsWith('weak::'))) {
    return {
      code: 'INCLUDES_WITH_WEAK_KEYS',
      label: 'El nuevo motor lo incluye, pero con claves debiles.',
      details: matches,
    }
  }

  return {
    code: 'INCLUDES_EQUIVALENTLY',
    label: 'El nuevo motor lo incluye de forma equivalente.',
    details: matches,
  }
}

function displaySubject(subject = {}) {
  return {
    key: buildSubjectKey(subject).key,
    keyType: buildSubjectKey(subject).keyType,
    weakKey: buildSubjectKey(subject).weakKey,
    planId: getPlanId(subject),
    materiaCodigo: getMateriaCodigo(subject) || getLegacyMateriaCode(subject),
    carrera: getCarrera(subject),
    anio: getAnio(subject),
    materiaNombre: getMateriaNombre(subject),
  }
}

function buildCompactionCase({ mesa, index, planCatalog, universeComparison }) {
  const subjects = getGroupedSubjects(mesa, planCatalog)
  const classification = classifyCompaction({ subjects, mesa })
  const weakKeyRisk = subjects.some((subject) => !hasStrongSubjectKey(subject))
  const laboratorioMultiplanRisk = looksLikeLaboratorio(subjects) && weakKeyRisk
  const safety = safetyForCase({ subjects, classification })
  const examEngineBehavior = compareExamEngineBehavior(subjects, universeComparison)
  const legacyOccurrences = subjects.length

  return {
    case_id: `legacy_compaction_${String(index + 1).padStart(3, '0')}`,
    classification,
    safety,
    carrera: unique(subjects.map(getCarrera)).join(' / '),
    anio: unique(subjects.map(getAnio)).join(' / '),
    materias: subjects.map(displaySubject),
    materias_involucradas: unique(subjects.map(getMateriaNombre)).join(' | '),
    legacy_occurrences: legacyOccurrences,
    legacy_final_tables: 1,
    reduction: Math.max(0, legacyOccurrences - 1),
    exam_engine_behavior: examEngineBehavior.code,
    exam_engine_behavior_label: examEngineBehavior.label,
    weak_key_risk: weakKeyRisk,
    laboratorio_multiplan_risk: laboratorioMultiplanRisk,
    recommendation: recommendationForCase({
      safety,
      classification,
      weakKeyRisk,
      laboratorioMultiplanRisk,
    }),
    notes: [
      weakKeyRisk ? 'Clave debil: falta plan_id + materia_codigo.' : '',
      laboratorioMultiplanRisk ? 'Riesgo multipan Laboratorio.' : '',
      classification === COMPACTION_CLASSIFICATIONS.SAME_TEACHER_MULTIPLE_SUBJECTS
        ? 'Compacta materias distintas por aparente titular/tribunal compartido.'
        : '',
    ].filter(Boolean).join(' '),
  }
}

function aggregateCases(cases = []) {
  const byKey = new Map()

  cases.forEach((item) => {
    const key = [
      item.classification,
      item.safety,
      item.carrera || 'SIN_CARRERA',
      item.anio || 'SIN_ANIO',
    ].join('::')
    const group = byKey.get(key) ?? {
      classification: item.classification,
      safety: item.safety,
      carrera: item.carrera,
      anio: item.anio,
      cases: 0,
      legacyOccurrences: 0,
      legacyFinalTables: 0,
      reduction: 0,
      weakKeyRisk: false,
      laboratorioMultiplanRisk: false,
    }
    group.cases += 1
    group.legacyOccurrences += item.legacy_occurrences
    group.legacyFinalTables += item.legacy_final_tables
    group.reduction += item.reduction
    group.weakKeyRisk = group.weakKeyRisk || item.weak_key_risk
    group.laboratorioMultiplanRisk = group.laboratorioMultiplanRisk || item.laboratorio_multiplan_risk
    byKey.set(key, group)
  })

  return [...byKey.values()].sort((left, right) => right.reduction - left.reduction || right.cases - left.cases)
}

function countCases(cases = [], predicate) {
  return cases.filter(predicate).length
}

function buildRootCauseAnalysis({ summary, universeComparison }) {
  const legacyMesas = universeComparison.summary?.legacyMesas ?? universeComparison.summary?.summary?.legacyMesas ?? summary.legacyFinalTables
  const newMesas = universeComparison.summary?.examEngineRawMesas ?? universeComparison.summary?.summary?.examEngineRawMesas ?? null
  const totalDiff = newMesas === null ? null : Math.max(0, newMesas - legacyMesas)

  return [
    {
      code: 'LEGACY_COMPACTION_REDUCTION',
      count: summary.legacyReductionByCompaction,
      evidence: `Legacy reduce ${summary.legacyPreCompactionOccurrences} ocurrencias a ${summary.legacyFinalTables} mesas finales.`,
      recommendation: 'No comparar solo total de filas finales; separar ocurrencia pedagogica de mesa compactada.',
      blocksCut: false,
    },
    {
      code: 'WEAK_KEYS_BLOCK_SAFE_REPLICATION',
      count: summary.doNotReplicateWithoutPlanId,
      evidence: 'Las compactaciones observadas no tienen plan_id + materia_codigo confiable en todos los sujetos.',
      recommendation: 'Completar templates v2 antes de replicar reglas de compactacion.',
      blocksCut: true,
    },
    {
      code: 'INSTITUTIONAL_REVIEW_REQUIRED',
      count: summary.requiresInstitutionalReview,
      evidence: 'Algunos grupos compactan materias distintas o criterios no triviales.',
      recommendation: 'Validar reglas institucionales antes de automatizar compactacion compatible.',
      blocksCut: true,
    },
    {
      code: 'COMPACTION_DOES_NOT_EXPLAIN_FULL_DIFF',
      count: totalDiff === null ? 0 : Math.max(0, totalDiff - summary.legacyReductionByCompaction),
      evidence: totalDiff === null
        ? 'No hay total nuevo disponible para medir la brecha.'
        : `La brecha legacy vs examEngine raw es ${totalDiff}; la compactacion legacy explica ${summary.legacyReductionByCompaction}.`,
      recommendation: 'Analizar tambien split por llamados, fechas, tribunales y datos contractuales faltantes.',
      blocksCut: false,
    },
  ].filter((cause) => cause.count > 0 || cause.code === 'COMPACTION_DOES_NOT_EXPLAIN_FULL_DIFF')
}

function buildRecommendations(summary = {}) {
  const recommendations = [
    'No replicar compactacion legacy de forma ciega en el examEngine.',
    'Crear, si se decide avanzar, un modo de compactacion compatible solo en preview/auditoria y con trazabilidad del motivo.',
    'Exigir plan_id + materia_codigo antes de habilitar compactacion automatica.',
    'Separar en el reporte: ocurrencias pedagogicas, mesas por llamado y mesas finales compactadas.',
  ]

  if (summary.requiresInstitutionalReview > 0) {
    recommendations.push('Pedir definicion institucional para compactaciones de materias distintas por titular o tribunal compartido.')
  }
  if (summary.laboratorioMultiplanRisk > 0) {
    recommendations.push('No compactar casos Laboratorio hasta declarar LAB-2015/LAB-2024 y equivalencias_planes.')
  }
  if (summary.safeToReplicate === 0) {
    recommendations.push('Con los datos actuales no hay compactaciones suficientemente seguras para replicar automaticamente.')
  }

  return unique(recommendations)
}

function buildSummary({ legacyRows, compactionCases, universeComparison }) {
  const legacyFinalTables = legacyRows.length
  const legacyPreCompactionOccurrences = legacyRows.reduce((sum, mesa) => (
    sum + Math.max(1, asArray(mesa.materiasAgrupadas).length || 1)
  ), 0)
  const legacyReductionByCompaction = Math.max(0, legacyPreCompactionOccurrences - legacyFinalTables)
  const legacyMesas = universeComparison.summary?.legacyMesas ?? universeComparison.summary?.summary?.legacyMesas ?? legacyFinalTables
  const examEngineRawMesas = universeComparison.summary?.examEngineRawMesas ?? universeComparison.summary?.summary?.examEngineRawMesas ?? null
  const finalDiff = examEngineRawMesas === null ? null : Math.max(0, examEngineRawMesas - legacyMesas)
  const compactionExplainsMostDifference = finalDiff ? legacyReductionByCompaction / finalDiff >= 0.5 : false
  const safeToReplicate = countCases(compactionCases, (item) => item.safety === SAFETY.SAFE_TO_REPLICATE)
  const requiresInstitutionalReview = countCases(compactionCases, (item) => (
    item.safety === SAFETY.REQUIRES_INSTITUTIONAL_REVIEW ||
    item.classification === COMPACTION_CLASSIFICATIONS.SAME_TEACHER_MULTIPLE_SUBJECTS ||
    unique(item.materias.map((subject) => subject.key)).length > 1
  ))
  const doNotReplicateWithoutPlanId = countCases(compactionCases, (item) => (
    item.safety === SAFETY.DO_NOT_REPLICATE_WITHOUT_PLAN_ID
  ))

  return {
    legacyFinalTables,
    legacyPreCompactionOccurrences,
    legacyCompactionCases: compactionCases.length,
    legacyReductionByCompaction,
    safeToReplicate,
    requiresInstitutionalReview,
    doNotReplicateWithoutPlanId,
    unknownSafety: countCases(compactionCases, (item) => item.safety === SAFETY.UNKNOWN),
    weakKeyRisk: countCases(compactionCases, (item) => item.weak_key_risk),
    laboratorioMultiplanRisk: countCases(compactionCases, (item) => item.laboratorio_multiplan_risk),
    compactionExplainsMostDifference,
    finalDiffLegacyVsExamEngineRaw: finalDiff,
    shouldCreateExamEngineCompatibleCompactionMode: doNotReplicateWithoutPlanId === 0 && requiresInstitutionalReview === 0,
    safeToReplaceLegacy: false,
    answers: {
      howManyCompactions: legacyReductionByCompaction,
      howManyCompactionGroups: compactionCases.length,
      howManySafe: safeToReplicate,
      howManyRequireInstitutionalReview: requiresInstitutionalReview,
      howManyDoNotReplicateWithoutPlanId: doNotReplicateWithoutPlanId,
      doesCompactionExplainMostDifference: compactionExplainsMostDifference,
      shouldReplicateInExamEngine: doNotReplicateWithoutPlanId === 0
        ? 'Solo como modo compatible auditable, despues de revision institucional.'
        : 'No todavia; faltan plan_id + materia_codigo para replicarla con seguridad.',
      missingDataBeforeReplication: [
        'plan_id',
        'materia_codigo',
        'docente_materia corrected',
        'equivalencias_planes para Laboratorio 2015/2024',
        'regla institucional explicita de compactacion',
      ],
      safeToReplaceOldEngine: false,
    },
  }
}

export function auditLegacyCompaction({ snapshot, legacyResult, universeComparison, options = {} } = {}) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? cloneJson(snapshot) : {}
  const safeUniverseComparison = universeComparison && typeof universeComparison === 'object'
    ? cloneJson(universeComparison)
    : {}
  const legacyRows = normalizeLegacyResult(legacyResult).map((row) => cloneJson(row))
  const planCatalog = buildPlanCatalog(safeSnapshot)
  const compactedRows = legacyRows.filter((mesa) => asArray(mesa.materiasAgrupadas).length > 1)
  const compactionCases = compactedRows.map((mesa, index) => buildCompactionCase({
    mesa,
    index,
    planCatalog,
    universeComparison: safeUniverseComparison,
  }))
  const summary = buildSummary({
    legacyRows,
    compactionCases,
    universeComparison: safeUniverseComparison,
  })
  const compactionGroups = aggregateCases(compactionCases)
  const rootCauseAnalysis = buildRootCauseAnalysis({
    cases: compactionCases,
    summary,
    universeComparison: safeUniverseComparison,
  })

  return {
    summary,
    compactionGroups,
    compactionCases: options.includeCases === false ? [] : compactionCases,
    rootCauseAnalysis,
    recommendations: buildRecommendations(summary),
    warnings: legacyRows.length
      ? []
      : [{ code: 'LEGACY_RESULT_EMPTY', message: 'No se recibieron mesas legacy para auditar compactacion.' }],
    errors: [],
  }
}
