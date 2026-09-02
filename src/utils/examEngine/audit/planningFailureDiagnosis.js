import { buildExamEngineEfficiencySummary } from './efficiencySummary.js'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'

const DAY_NAMES_ES = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
]

const SCENARIO_FIELDS = [
  'totalMesas',
  'totalPlanned',
  'totalUnassigned',
  'mesasCompletas',
  'mesasConUnVocal',
  'mesasSinTribunal',
  'mesasSinFecha',
  'completionRate',
  'totalCriticalErrors',
  'totalWarnings',
]

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
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
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeKey(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function truncate(value, maxLength = 64) {
  const text = clean(value)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

function countBy(values = [], keyFn = (value) => value) {
  return values.reduce((counts, value) => {
    const key = clean(keyFn(value)) || 'sin_dato'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function topEntries(counts = {}, limit = 20) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function increment(counts, key, amount = 1) {
  const safeKey = clean(key) || 'otro'
  counts[safeKey] = (counts[safeKey] ?? 0) + amount
}

function issueCode(issue = {}) {
  return clean(issue.code ?? issue.type ?? issue.reason)
}

function allMesaIssues(mesa = {}) {
  return [
    ...asArray(mesa.errors),
    ...asArray(mesa.warnings),
  ]
}

function mesaHasCode(mesa = {}, predicate = () => false) {
  return allMesaIssues(mesa).some((issue) => predicate(issueCode(issue)))
}

function countVocales(mesa = {}) {
  if (Array.isArray(mesa.vocales)) {
    return mesa.vocales.filter((vocal) => {
      if (vocal && typeof vocal === 'object') return clean(vocal.id ?? vocal.nombre ?? vocal.label)
      return clean(vocal)
    }).length
  }

  return [
    mesa.vocal1Id,
    mesa.vocal2Id,
    mesa.vocal1,
    mesa.vocal2,
  ].filter((value) => clean(value)).length
}

function hasTitular(mesa = {}) {
  return Boolean(clean(
    mesa.titularId ??
    mesa.titular_id ??
    mesa.titularNombre ??
    mesa.profesorTitular ??
    mesa.titular?.id ??
    mesa.titular?.nombre,
  ))
}

function hasDate(mesa = {}) {
  return Boolean(clean(mesa.fecha ?? mesa.fechaIso ?? mesa.displayDate))
}

function safeCareerKey(value) {
  return truncate(normalizeKey(value) || 'sin_carrera', 72)
}

function safeSubjectKey(value) {
  return truncate(normalizeKey(value) || 'sin_materia', 72)
}

function safeMesaGroupKey(mesa = {}) {
  return [
    safeCareerKey(mesa.carrera),
    safeSubjectKey(mesa.materia || mesa.nombreMateria || mesa.materiaId),
    clean(mesa.llamado ?? mesa.exam_call) || 'sin_llamado',
  ].join('::')
}

function summarizeGroups(rows = [], limit = 20) {
  const counts = countBy(rows, safeMesaGroupKey)
  return topEntries(counts, limit).map(({ key, count }) => {
    const [carreraKey, materiaKey, llamado] = key.split('::')
    return { carreraKey, materiaKey, llamado, count }
  })
}

export function classifyDateFailure(mesa = {}) {
  const reason = issueCode({ code: mesa.reason })

  if (reason.includes('CORRELATIVIDAD') || mesaHasCode(mesa, (code) => code.includes('CORRELATIVIDAD'))) {
    return 'correlatividad_bloqueante'
  }
  if (reason === 'TITULAR_NO_DISPONIBLE' || mesaHasCode(mesa, (code) => code === 'TITULAR_NO_DISPONIBLE')) {
    return 'titular_no_disponible_en_periodo'
  }
  if (reason === 'VOCAL_NO_DISPONIBLE' || mesaHasCode(mesa, (code) => code === 'VOCAL_NO_DISPONIBLE')) {
    return 'vocales_no_disponibles'
  }
  if (mesaHasCode(mesa, (code) => code === 'TURNO_NO_DEFINIDO' || code.includes('TURNO'))) {
    return 'turno_incompatible_o_indefinido'
  }
  if (reason === 'DOCENTE_SUPERPUESTO' || mesaHasCode(mesa, (code) => code === 'DOCENTE_SUPERPUESTO')) {
    return 'limite_diario_o_docente_superpuesto'
  }
  if (reason === 'SIN_FECHA_VALIDA' || mesaHasCode(mesa, (code) => code === 'SIN_FECHA_VALIDA' || code.includes('FECHA'))) {
    return 'sin_fechas_dentro_del_rango'
  }

  return 'otro'
}

export function summarizeDateFailures(unassignedMesas = []) {
  const rows = asArray(unassignedMesas).filter((mesa) => !hasDate(mesa))
  const issueCounts = {}
  rows.forEach((mesa) => {
    allMesaIssues(mesa).forEach((issue) => increment(issueCounts, issueCode(issue)))
  })

  return {
    totalMesasSinFecha: rows.length,
    motivosPrincipales: countBy(rows, classifyDateFailure),
    codigosPrincipales: topEntries(issueCounts, 20),
    porCarreraYLlamado: topEntries(countBy(rows, (mesa) => [
      safeCareerKey(mesa.carrera),
      clean(mesa.llamado ?? mesa.exam_call) || 'sin_llamado',
    ].join('::')), 20).map(({ key, count }) => {
      const [carreraKey, llamado] = key.split('::')
      return { carreraKey, llamado, count }
    }),
  }
}

export function classifyVocalRejection(rejection = '') {
  const code = clean(rejection)
  if (!code) return 'otro'
  if (code === 'SIN_AFINIDAD' || code.includes('AFINIDAD')) return 'afinidad'
  if (code === 'SIN_DISPONIBILIDAD' || code.includes('DISPON')) return 'disponibilidad'
  if (code === 'SUPERA_LIMITE_VOCALIAS' || code.includes('LIMITE') || code.includes('MITAD')) return 'mitad_mas_uno'
  if (['ES_TITULAR_DE_LA_MESA', 'DOCENTE_DUPLICADO_EN_MESA', 'TITULAR_AS_VOCAL', 'VOCAL_DUPLICADO', 'DUPLICATED_VOCALES'].includes(code)) {
    return 'conflicto_horario_o_rol'
  }
  if (code.includes('TURNO')) return 'turno_incompatible'
  if (code.includes('CARRERA') || code.includes('MATERIA')) return 'misma_materia_o_carrera'
  return 'otro'
}

function summarizeCandidateRejections(vocalCandidateSummary = []) {
  const totals = {
    candidatosEvaluados: 0,
    candidatosValidos: 0,
    candidatosRechazados: 0,
    rechazosPorCausa: {},
    rechazosPorCodigo: {},
    mesasSinCandidatosValidos: 0,
    mesasConUnCandidatoValido: 0,
    mesasConDosOMasCandidatosValidos: 0,
  }

  asArray(vocalCandidateSummary).forEach((entry) => {
    const candidates = asArray(entry.candidatosVocales)
    const valid = candidates.filter((candidate) => candidate.valido)
    totals.candidatosEvaluados += candidates.length
    totals.candidatosValidos += valid.length
    totals.candidatosRechazados += candidates.length - valid.length
    if (valid.length === 0) totals.mesasSinCandidatosValidos += 1
    if (valid.length === 1) totals.mesasConUnCandidatoValido += 1
    if (valid.length >= 2) totals.mesasConDosOMasCandidatosValidos += 1

    candidates
      .filter((candidate) => !candidate.valido)
      .forEach((candidate) => {
        asArray(candidate.rechazos).forEach((rejection) => {
          increment(totals.rechazosPorCodigo, rejection)
          increment(totals.rechazosPorCausa, classifyVocalRejection(rejection))
        })
      })
  })

  return {
    ...totals,
    rechazosPorCodigo: topEntries(totals.rechazosPorCodigo, 20),
  }
}

export function summarizeTribunalFailures({ rows = [], plan = {} } = {}) {
  const allRows = asArray(rows)
  const noTribunalRows = allRows.filter((mesa) => !hasTitular(mesa) || countVocales(mesa) === 0)
  const oneVocalRows = allRows.filter((mesa) => hasTitular(mesa) && countVocales(mesa) === 1)
  const internalRows = [
    ...asArray(plan.plannedMesas),
    ...asArray(plan.unassignedMesas),
  ]
  const internalNoVocalRows = internalRows.filter((mesa) => hasTitular(mesa) && countVocales(mesa) === 0)
  const internalOneVocalRows = internalRows.filter((mesa) => hasTitular(mesa) && countVocales(mesa) === 1)
  const internalNoTitularRows = internalRows.filter((mesa) => !hasTitular(mesa))
  const candidateSummary = summarizeCandidateRejections(plan.metadata?.vocalCandidateSummary)
  const repairCounts = countBy(asArray(plan.metadata?.repairs), (repair) => clean(repair.action || repair.reason))
  const stageSummaries = plan.summary?.stageSummaries ?? {}

  return {
    totalMesasEvaluadas: allRows.length,
    totalMesasSinTribunal: noTribunalRows.length,
    segunDtoEficiencia: {
      unassignedContadasComoSinTribunalPorNoTraerTribunalEnDto: noTribunalRows.filter((mesa) => !hasDate(mesa)).length,
      plannedSinTribunalEnDto: noTribunalRows.filter(hasDate).length,
      plannedConUnVocalEnDto: oneVocalRows.filter(hasDate).length,
    },
    estadoInternoPlan: {
      sinTitular: internalNoTitularRows.length,
      titularOkPeroSinVocales: internalNoVocalRows.length,
      tieneUnVocalFaltaSegundo: internalOneVocalRows.length,
      mesasCompletas: internalRows.filter((mesa) => hasTitular(mesa) && countVocales(mesa) >= 2).length,
    },
    sinTitular: internalNoTitularRows.length,
    titularOkPeroSinVocales: internalNoVocalRows.length,
    tieneUnVocalFaltaSegundo: oneVocalRows.length,
    candidaturas: candidateSummary,
    reparacion: {
      totalIntentos: asArray(plan.metadata?.repairs).length,
      intentosPorAccion: topEntries(repairCounts, 20),
      resumen: stageSummaries.repairs ?? {},
    },
    porCarreraMateriaYLlamado: summarizeGroups([...noTribunalRows, ...oneVocalRows], 30),
    resumenFaseVocales: stageSummaries.vocales ?? {},
    resumenValidacionTribunales: stageSummaries.tribunals ?? {},
  }
}

export function inferCallDiagnosis({ snapshot = {}, input = {} } = {}) {
  const regularCallRanges = snapshot.regularCallRanges && typeof snapshot.regularCallRanges === 'object'
    ? Object.entries(snapshot.regularCallRanges)
    : []
  const availableCalls = [...new Set(asArray(input.fechasDisponibles).map((fecha) => clean(fecha.llamado)).filter(Boolean))]
  const source = regularCallRanges.length
    ? 'regularCallRanges'
    : (input.config?.cantidadLlamados ? 'config/default-adapter' : 'default-adapter')

  return {
    cantidadLlamados: input.config?.cantidadLlamados ?? availableCalls.length,
    source,
    examType: clean(snapshot.examType),
    generationScopeHasCalls: Boolean(snapshot.generationScope?.cantidadLlamados || snapshot.generationScope?.calls),
    regularCallRangesCount: regularCallRanges.length,
    regularCallRangeKeys: regularCallRanges.map(([key]) => key),
    availableCalls,
  }
}

export function pickScenarioMetrics(summary = {}) {
  return SCENARIO_FIELDS.reduce((metrics, field) => {
    metrics[field] = summary[field] ?? 0
    return metrics
  }, {})
}

export function createOneCallInput(input = {}) {
  const next = cloneJson(input)
  const firstCall = asArray(next.fechasDisponibles).find((fecha) => clean(fecha.llamado))?.llamado ?? 'PRIMER_LLAMADO'
  next.fechasDisponibles = asArray(next.fechasDisponibles).filter((fecha) => clean(fecha.llamado) === clean(firstCall))
  next.config = {
    ...(next.config ?? {}),
    cantidadLlamados: 1,
    fechaFin: next.fechasDisponibles.at(-1)?.fecha ?? next.config?.fechaFin,
  }
  return next
}

function parseIsoDate(value) {
  const text = clean(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function nextWeekdaysAfter(fechaIso = '', count = 5) {
  const start = parseIsoDate(fechaIso)
  if (!start) return []

  const dates = []
  const current = new Date(start)
  while (dates.length < count) {
    current.setDate(current.getDate() + 1)
    const day = current.getDay()
    if (day >= 1 && day <= 5) dates.push(new Date(current))
  }
  return dates
}

export function createExtendedDatesInput(input = {}, { extraDaysPerCall = 5 } = {}) {
  const next = cloneJson(input)
  const dates = asArray(next.fechasDisponibles)
  const byCall = dates.reduce((map, fecha) => {
    const call = clean(fecha.llamado) || 'SIN_LLAMADO'
    const current = map.get(call) ?? []
    current.push(fecha)
    map.set(call, current)
    return map
  }, new Map())
  const additions = []

  byCall.forEach((items, call) => {
    const sorted = [...items].sort((left, right) => clean(left.fecha).localeCompare(clean(right.fecha)))
    const template = sorted.at(-1) ?? {}
    nextWeekdaysAfter(template.fecha, extraDaysPerCall).forEach((date) => {
      additions.push({
        ...template,
        fecha: toIsoDate(date),
        diaSemana: DAY_NAMES_ES[date.getDay()],
        llamado: call,
        disponible: true,
      })
    })
  })

  next.fechasDisponibles = [...dates, ...additions]
    .sort((left, right) => clean(left.llamado).localeCompare(clean(right.llamado)) || clean(left.fecha).localeCompare(clean(right.fecha)))
  next.config = {
    ...(next.config ?? {}),
    fechaFin: next.fechasDisponibles.reduce((max, fecha) => clean(fecha.fecha) > clean(max) ? fecha.fecha : max, next.config?.fechaFin ?? ''),
  }

  return next
}

export function createInstitutionalAffinityFallbackInput(input = {}) {
  const next = cloneJson(input)
  next.docentes = asArray(next.docentes).map((docente) => ({
    ...docente,
    idoneidadAcademica: true,
    idoneidadAcademicaExplicita: true,
    metadata: {
      ...(docente.metadata ?? {}),
      auditScenario: 'institutional-affinity-fallback',
    },
  }))
  return next
}

export function summarizeScenario({ name, input, metadata = {}, contract = null } = {}) {
  const scenarioContract = contract ?? buildRegularExamPreviewIntegrationContract(input, {})
  const summary = buildExamEngineEfficiencySummary({
    contract: scenarioContract,
    input,
    metadata: {
      source: 'local-audit-scenario',
      readOnly: true,
      ...metadata,
    },
  })

  return {
    name,
    mode: metadata.mode ?? 'engine-run',
    metrics: pickScenarioMetrics(summary),
  }
}

export function summarizeOneVocalMinimumScenario(baseScenario = {}) {
  const metrics = { ...(baseScenario.metrics ?? {}) }
  const oneVocal = numberOrZero(metrics.mesasConUnVocal)

  metrics.mesasCompletas = numberOrZero(metrics.mesasCompletas) + oneVocal
  metrics.mesasConUnVocal = 0

  return {
    name: 'C. tribunal con 1 vocal como minimo institucional',
    mode: 'post-process-estimate',
    metrics,
    note: 'Solo reclasifica mesas que ya tenian un vocal; no mueve fechas ni repara tribunales.',
  }
}

export function buildRuleBottleneckDiagnosis({ dateFailures = {}, tribunalFailures = {}, scenarios = [] } = {}) {
  const rejections = tribunalFailures.candidaturas?.rechazosPorCausa ?? {}
  const current = scenarios.find((scenario) => scenario.name?.startsWith('A.'))?.metrics ?? {}
  const oneCall = scenarios.find((scenario) => scenario.name?.startsWith('B.'))?.metrics ?? {}
  const affinity = scenarios.find((scenario) => scenario.name?.startsWith('D.'))?.metrics ?? {}
  const extended = scenarios.find((scenario) => scenario.name?.startsWith('E.'))?.metrics ?? {}
  const improvements = {
    unLlamado: numberOrZero(oneCall.completionRate) - numberOrZero(current.completionRate),
    afinidadFallback: numberOrZero(affinity.completionRate) - numberOrZero(current.completionRate),
    fechasExtendidas: numberOrZero(extended.completionRate) - numberOrZero(current.completionRate),
  }
  const evidence = {
    totalMesasSinFecha: dateFailures.totalMesasSinFecha ?? 0,
    totalMesasSinTribunal: tribunalFailures.totalMesasSinTribunal ?? 0,
    docentesEnLimiteFaseVocales: tribunalFailures.resumenFaseVocales?.docentesEnLimite ?? 0,
    totalCandidatosValidos: tribunalFailures.candidaturas?.candidatosValidos ?? 0,
    rechazosPorCausa: rejections,
    scenarioImprovements: improvements,
  }
  const sortedImprovements = topEntries(improvements, 3)
  const main = sortedImprovements[0]?.key ?? 'sin_mejora_clara'

  return {
    cuelloPrincipal: main,
    evidencia: evidence,
    lectura: [
      rejections.mitad_mas_uno > rejections.afinidad ? 'La mitad mas uno/cuota de vocalias pesa mas que afinidad en los rechazos de candidatos.' : 'La afinidad pesa igual o mas que la cuota de vocalias en los rechazos de candidatos.',
      dateFailures.totalMesasSinFecha > 0 ? 'Las fechas tambien son cuello porque hay mesas con tribunal incompleto/no disponible que no encuentran slot.' : 'No se detectan mesas sin fecha.',
      numberOrZero(improvements.unLlamado) > numberOrZero(improvements.fechasExtendidas)
        ? 'Reducir llamados reduce mas presion que ampliar fechas en esta simulacion.'
        : 'Ampliar fechas reduce mas presion que reducir llamados en esta simulacion.',
    ],
  }
}
