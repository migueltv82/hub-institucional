import { buildRegularExamInputFromWorkspaceSnapshot } from '../../utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { buildRegularExamPreviewIntegrationContract } from '../../utils/examEngine/preview'

const PRIORITY_DAYS = ['lunes', 'martes', 'jueves']
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']
const REGULAR_EXAM_TYPE_TOKENS = new Set(['regular'])
const SPECIAL_EXAM_TYPE_TOKENS = new Set(['special', 'especial'])
const MAX_VISIBLE_OBSERVATIONS = 20
const PROFESSIONAL_PRACTICE_TOKENS = [
  'practica profesional',
  'practicas profesionales',
  'practica docente',
  'residencia',
  'practica profesionalizante',
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function parseIsoDate(value) {
  const text = clean(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function normalizeDay(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function normalizeToken(value) {
  return normalizeDay(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeText(value) {
  return normalizeDay(value)
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeExamType(value) {
  const token = normalizeToken(value)
  if (REGULAR_EXAM_TYPE_TOKENS.has(token)) return 'regular'
  if (SPECIAL_EXAM_TYPE_TOKENS.has(token)) return 'special'
  return ''
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeRegularCallRangeKey(key) {
  const token = normalizeToken(key)
  if (['first', 'primer', 'primero', 'primerllamado', '1'].includes(token)) return 'first'
  if (['second', 'segundo', 'segundollamado', '2'].includes(token)) return 'second'
  if (['special', 'especial', 'llamadoespecial'].includes(token)) return 'special'
  return clean(key)
}

function firstRangeValue(range = {}, fields = []) {
  for (const field of fields) {
    if (clean(range[field])) return clean(range[field])
  }

  const wanted = new Set(fields.map(normalizeToken))
  const match = Object.entries(range).find(([key, value]) => wanted.has(normalizeToken(key)) && clean(value))
  return match ? clean(match[1]) : ''
}

export function normalizeRegularCallRanges(regularCallRanges = {}) {
  if (!isPlainObject(regularCallRanges)) return {}

  return Object.entries(regularCallRanges).reduce((normalized, [key, range]) => {
    if (!isPlainObject(range)) return normalized

    const normalizedKey = normalizeRegularCallRangeKey(key)
    if (!normalizedKey) return normalized

    normalized[normalizedKey] = {
      ...range,
      start: firstRangeValue(range, ['start', 'inicio', 'desde', 'fechaInicio', 'from']),
      end: firstRangeValue(range, ['end', 'fin', 'hasta', 'fechaFin', 'to']),
      turno: firstRangeValue(range, ['turno', 'shift']) || range.turno,
    }
    return normalized
  }, {})
}

function isValidIsoDate(value) {
  return Boolean(parseIsoDate(value))
}

function isValidDateRange(range = {}) {
  const start = parseIsoDate(range.start)
  const end = parseIsoDate(range.end)
  return Boolean(start && end && start <= end)
}

function getValidRegularCallRangeEntries(regularCallRanges = {}) {
  return Object.entries(regularCallRanges).filter(([, range]) => isValidDateRange(range))
}

function hasInvalidPresentRegularCallRange(regularCallRanges = {}) {
  return Object.values(regularCallRanges).some((range = {}) => (
    clean(range.start) || clean(range.end)
  ) && !isValidDateRange(range))
}

function resolvePreviewDateRange({ fechaInicio, fechaFin, regularCallRanges, preferRegularRanges = false } = {}) {
  const topLevelStart = clean(fechaInicio)
  const topLevelEnd = clean(fechaFin)
  const validRanges = getValidRegularCallRangeEntries(regularCallRanges)
  const rangeStarts = validRanges.map(([, range]) => clean(range.start)).filter(Boolean).sort()
  const rangeEnds = validRanges.map(([, range]) => clean(range.end)).filter(Boolean).sort()

  if (preferRegularRanges && validRanges.length) {
    return {
      fechaInicio: rangeStarts[0] || topLevelStart,
      fechaFin: rangeEnds.at(-1) || topLevelEnd,
    }
  }

  return {
    fechaInicio: topLevelStart || rangeStarts[0] || '',
    fechaFin: topLevelEnd || rangeEnds.at(-1) || '',
  }
}

function dateSlotCall(slot = {}) {
  return clean(slot.llamado ?? slot.exam_call ?? slot.callKey) || 'PRIMER_LLAMADO'
}

function dateSlotTurn(slot = {}) {
  return clean(slot.turno ?? slot.shift) || 'NOCHE'
}

function firstValue(...values) {
  return values.find((value) => clean(value))
}

function subjectCode(row = {}) {
  return clean(firstValue(
    row.materia,
    row.codigo,
    row.code,
    row.materiaCodigo,
    row.codigoMateria,
    row.subjectCode,
    row.subject_code,
    row.materiaId,
    row.materia_id,
    row.id,
  ))
}

function subjectName(row = {}) {
  return clean(firstValue(
    row.nombreMateria,
    row.materiaNombre,
    row.subjectName,
    row.subject_name,
    row.asignatura,
    row.nombreAsignatura,
    row.nombre,
    row.name,
    subjectCode(row),
  ))
}

function subjectCareer(row = {}) {
  return clean(firstValue(row.carrera, row.programa, row.program, row.career, row.nombreCarrera, row.careerName))
}

function subjectKey(row = {}) {
  return [
    normalizeToken(subjectCareer(row)),
    normalizeToken(subjectCode(row) || subjectName(row)),
  ].join('::')
}

function teacherKey(row = {}) {
  return normalizeText(firstValue(
    row.docenteId,
    row.docente_id,
    row.teacherId,
    row.teacher_id,
    row.profesorId,
    row.profesor_id,
    row.profesor,
    row.docente,
    row.docenteNombre,
    row.nombreDocente,
    row.teacherName,
    row.teacher_name,
    row.full_name,
    row.fullName,
    row.nombreCompleto,
    row.apellidoNombre,
  ))
}

function isProfessionalPracticeSubject(row = {}) {
  const name = normalizeText(subjectName(row))
  if (!name) return false
  if (name.includes('practicas discursivas iii') || name.includes('practicas discursivas iv')) return false
  return PROFESSIONAL_PRACTICE_TOKENS.some((token) => name.includes(token))
}

function buildSubjectTeacherAssignments(snapshot = {}) {
  return asArray(snapshot.horariosDocentes).reduce((map, row) => {
    const key = subjectKey(row)
    const teacher = teacherKey(row)
    if (!key || !teacher) return map
    const teachers = map.get(key) ?? new Set()
    teachers.add(teacher)
    map.set(key, teachers)
    return map
  }, new Map())
}

function countIssueCodes(contract = {}, codes = []) {
  const wanted = new Set(codes)
  const summaryCounts = asArray(contract.metadata?.issueSummary?.topByCode)
    .filter((item) => wanted.has(clean(item.code)))
    .reduce((total, item) => total + Number(item.count ?? 0), 0)
  const visibleCounts = [...asArray(contract.errors), ...asArray(contract.warnings)]
    .filter((item) => wanted.has(clean(item.code ?? item.reason ?? item.message)))
    .length

  return Math.max(summaryCounts, visibleCounts)
}

function buildTitularidadSummary({ input = {}, snapshot = {}, contract = {} } = {}) {
  const materias = asArray(input.materias)
  const assignments = buildSubjectTeacherAssignments(snapshot)
  const totalMesas = Number(contract.uiDto?.uiSummary?.totalMesas ?? 0)
  const cantidadLlamados = Number(contract.uiDto?.uiSummary?.cantidadLlamados ?? input.config?.cantidadLlamados ?? 1) || 1
  const materiasQueRequierenMesa = materias.filter((materia) => materia.requiereMesa !== false)
  const materiasSinHorarioNoRequeridas = materias.filter((materia) => (
    materia.requiereMesa === false && materia.requiereMesaSource === 'sinHorarioDocente'
  ))
  const materiasConTitular = materias.filter((materia) => clean(materia.titularId ?? materia.titular_id))
  const materiasQueRequierenMesaSinTitular = materiasQueRequierenMesa.filter((materia) => !clean(materia.titularId ?? materia.titular_id))
  const materiasConUnSoloDocenteAsignado = materias.filter((materia) => assignments.get(subjectKey(materia))?.size === 1).length
  const materiasConMasDeUnDocenteAsignado = materias.filter((materia) => assignments.get(subjectKey(materia))?.size > 1).length
  const practicasProfesionalesDetectadas = materias.filter(isProfessionalPracticeSubject).length
  const mesasSinTitularPorMateriasRequeridas = materiasQueRequierenMesaSinTitular.length * cantidadLlamados
  const mesasSinTitularPorErrores = countIssueCodes(contract, ['MESA_SIN_TITULAR', 'TITULAR_REQUIRED', 'TITULAR_NOT_FOUND'])
  const mesasSinTitularReal = Math.max(mesasSinTitularPorMateriasRequeridas, mesasSinTitularPorErrores)

  return {
    totalMateriasPlan: materias.length,
    materiasQueRequierenMesa: materiasQueRequierenMesa.length,
    materiasSinHorarioNoRequeridas: materiasSinHorarioNoRequeridas.length,
    titularesInferidos: materiasConTitular.length,
    titularesFaltantesReales: materiasQueRequierenMesaSinTitular.length,
    titularesFaltantesNoRequeridos: materiasSinHorarioNoRequeridas.filter((materia) => !clean(materia.titularId ?? materia.titular_id)).length,
    mesasConTitular: Math.max(0, totalMesas - mesasSinTitularReal),
    mesasSinTitularReal,
    materiasConUnSoloDocenteAsignado,
    materiasConMasDeUnDocenteAsignado,
    practicasProfesionalesDetectadas,
  }
}

function sortDateSlots(slots = []) {
  return [...slots].sort((left, right) => (
    dateSlotCall(left).localeCompare(dateSlotCall(right)) ||
    clean(left.fecha).localeCompare(clean(right.fecha)) ||
    dateSlotTurn(left).localeCompare(dateSlotTurn(right))
  ))
}

function nextDateForPriorityDays(fechaIso = '', existingKeys = new Set(), call = '', turno = '') {
  const start = parseIsoDate(fechaIso)
  if (!start) return null

  const current = new Date(start)
  let guard = 0

  while (guard < 240) {
    current.setDate(current.getDate() + 1)
    guard += 1
    const day = DAY_NAMES[current.getDay()]
    const iso = toIsoDate(current)
    const key = [call, iso, turno].join('::')
    if (PRIORITY_DAYS.includes(day) && !existingKeys.has(key)) return new Date(current)
  }

  return null
}

export function isRegularExamPreviewInternalEnabled(env = import.meta.env) {
  return env?.DEV === true
}

export function buildWorkspaceSnapshotFromPreviewProps(props = {}) {
  const regularCallRanges = normalizeRegularCallRanges(props.regularCallRanges)
  const examType = normalizeExamType(props.examType)
  const dateRange = resolvePreviewDateRange({
    fechaInicio: props.fechaInicio,
    fechaFin: props.fechaFin,
    regularCallRanges,
    preferRegularRanges: examType !== 'special',
  })

  return {
    alumnos: asArray(props.alumnos),
    horariosDocentes: asArray(props.horariosDocentes),
    docenteMateria: asArray(props.docenteMateria),
    docentes: asArray(props.docentes),
    planesEstudio: asArray(props.planesEstudio),
    correlatividades: asArray(props.correlatividades),
    fechaInicio: dateRange.fechaInicio,
    fechaFin: dateRange.fechaFin,
    examType: props.examType,
    generationScope: props.generationScope ?? {},
    regularCallRanges,
    selectedSpecialSubjectKeys: asArray(props.selectedSpecialSubjectKeys),
  }
}

export function buildPreviewReadiness(snapshot = {}) {
  const normalizedSnapshot = buildWorkspaceSnapshotFromPreviewProps(snapshot)
  const alumnosCount = asArray(normalizedSnapshot.alumnos).length
  const docentesCount = asArray(normalizedSnapshot.docentes).length
  const docenteMateriaCount = asArray(normalizedSnapshot.docenteMateria).length
  const horariosDocentesCount = asArray(normalizedSnapshot.horariosDocentes).length
  const planesEstudioCount = asArray(normalizedSnapshot.planesEstudio).length
  const correlatividadesCount = asArray(normalizedSnapshot.correlatividades).length
  const selectedSpecialSubjectKeysCount = asArray(normalizedSnapshot.selectedSpecialSubjectKeys).length
  const regularCallRangesKeys = Object.keys(normalizedSnapshot.regularCallRanges ?? {})
  const examType = normalizeExamType(normalizedSnapshot.examType)
  const validRegularRangesCount = getValidRegularCallRangeEntries(normalizedSnapshot.regularCallRanges).length
  const blockingReasons = []
  const warnings = []

  if (!horariosDocentesCount) blockingReasons.push('HORARIOS_DOCENTES_VACIO')
  if (!planesEstudioCount) blockingReasons.push('PLANES_ESTUDIO_VACIO')
  if (!docentesCount && !horariosDocentesCount) blockingReasons.push('DOCENTES_VACIO_SIN_DERIVACION')
  if (!docentesCount && horariosDocentesCount) warnings.push('DOCENTES_DERIVABLES_DESDE_HORARIOS')
  if (!isValidIsoDate(normalizedSnapshot.fechaInicio) || !isValidIsoDate(normalizedSnapshot.fechaFin)) {
    blockingReasons.push('FECHA_INICIO_O_FIN_INEXISTENTE')
  }
  if (!examType) blockingReasons.push('EXAM_TYPE_INVALIDO')
  if (examType === 'regular') {
    if (regularCallRangesKeys.length && hasInvalidPresentRegularCallRange(normalizedSnapshot.regularCallRanges)) {
      blockingReasons.push('REGULAR_CALL_RANGES_INVALIDO')
    }
    if (regularCallRangesKeys.length && !validRegularRangesCount) {
      blockingReasons.push('REGULAR_CALL_RANGES_SIN_RANGOS_VALIDOS')
    }
    if (!regularCallRangesKeys.length && (!isValidIsoDate(normalizedSnapshot.fechaInicio) || !isValidIsoDate(normalizedSnapshot.fechaFin))) {
      blockingReasons.push('REGULAR_CALL_RANGES_INVALIDO')
    }
  }

  if (!alumnosCount) warnings.push('ALUMNOS_VACIO_NO_BLOQUEANTE')
  if (!correlatividadesCount) warnings.push('CORRELATIVIDADES_VACIAS_NO_BLOQUEANTE')
  if (examType === 'regular' && validRegularRangesCount === 1) warnings.push('REGULAR_CALL_RANGES_UN_SOLO_LLAMADO')

  const canRunPreview = blockingReasons.length === 0
  const reasonDisabled = canRunPreview ? 'READY' : [...new Set(blockingReasons)].join(', ')

  return {
    canRunPreview,
    reasonDisabled,
    blockingReasons: [...new Set(blockingReasons)],
    warnings: [...new Set(warnings)],
    diagnostics: {
      canRunPreview,
      reasonDisabled,
      alumnosCount,
      docentesCount,
      docenteMateriaCount,
      horariosDocentesCount,
      planesEstudioCount,
      correlatividadesCount,
      fechaInicio: normalizedSnapshot.fechaInicio,
      fechaFin: normalizedSnapshot.fechaFin,
      examType: clean(normalizedSnapshot.examType),
      generationScope: normalizedSnapshot.generationScope,
      regularCallRangesKeys,
      selectedSpecialSubjectKeysCount,
    },
  }
}

export function hasEnoughPreviewData(snapshot = {}) {
  return buildPreviewReadiness(snapshot).canRunPreview
}

export function buildPreviewInputFromProps(props = {}) {
  const snapshot = buildWorkspaceSnapshotFromPreviewProps(props)
  return {
    snapshot,
    input: buildRegularExamInputFromWorkspaceSnapshot(snapshot),
  }
}

export function getCompletionRate(summary = {}) {
  const totalMesas = Number(summary.totalMesas ?? 0)
  if (!totalMesas) return 0
  return Number(((Number(summary.totalPlanned ?? 0) || 0) / totalMesas).toFixed(4))
}

export function countVocales(row = {}) {
  if (Array.isArray(row.vocales)) return row.vocales.filter(Boolean).length
  return [row.vocal1Id, row.vocal2Id, row.vocal1, row.vocal2].filter(Boolean).length
}

function rowId(row = {}) {
  return clean(row.id ?? row.mesaId ?? row.mesa_id)
}

export function markOneVocalRowsForManualReview(rows = [], oneVocalIds = new Set()) {
  return asArray(rows).map((row) => {
    const markedByRawPreview = oneVocalIds.has(rowId(row))
    if (!markedByRawPreview && countVocales(row) !== 1) return row
    return {
      ...row,
      requiresManualReview: true,
      reviewRequired: true,
      reason: 'TRIBUNAL_UN_VOCAL',
    }
  })
}

export function getPreviewRowsWithManualReview(contract = {}) {
  const planned = asArray(contract.filteredDto?.uiTables?.planned)
  const unassigned = asArray(contract.filteredDto?.uiTables?.unassigned)
  const rawRows = [
    ...asArray(contract.preview?.plannedMesas),
    ...asArray(contract.preview?.unassignedMesas),
  ]
  const oneVocalIds = new Set(rawRows.filter((row) => countVocales(row) === 1).map(rowId).filter(Boolean))

  return {
    planned: markOneVocalRowsForManualReview(planned, oneVocalIds),
    unassigned: markOneVocalRowsForManualReview(unassigned, oneVocalIds),
  }
}

export function buildRecommendedCalendarInput(input = {}, targetTotalDates = 35) {
  const next = cloneJson(input) ?? {}
  const fechas = sortDateSlots(asArray(next.fechasDisponibles))
  const target = Math.max(Number(targetTotalDates) || fechas.length, fechas.length)
  if (!fechas.length || fechas.length >= target) return next

  const byCall = fechas.reduce((map, slot) => {
    const call = dateSlotCall(slot)
    const rows = map.get(call) ?? []
    rows.push(slot)
    map.set(call, rows)
    return map
  }, new Map())
  const calls = [...byCall.keys()].sort()
  const existingKeys = new Set(fechas.map((slot) => [dateSlotCall(slot), clean(slot.fecha), dateSlotTurn(slot)].join('::')))
  const additions = []

  while (fechas.length + additions.length < target && calls.length) {
    const call = calls[additions.length % calls.length]
    const callDates = [...asArray(byCall.get(call)), ...additions.filter((slot) => dateSlotCall(slot) === call)]
      .sort((left, right) => clean(left.fecha).localeCompare(clean(right.fecha)))
    const template = callDates.at(-1)
    if (!template) break

    const nextDate = nextDateForPriorityDays(template.fecha, existingKeys, call, dateSlotTurn(template))
    if (!nextDate) break

    const slot = {
      ...template,
      fecha: toIsoDate(nextDate),
      diaSemana: normalizeDay(DAY_NAMES[nextDate.getDay()]).toUpperCase(),
      disponible: true,
    }
    additions.push(slot)
    existingKeys.add([dateSlotCall(slot), clean(slot.fecha), dateSlotTurn(slot)].join('::'))
  }

  next.fechasDisponibles = sortDateSlots([...fechas, ...additions])
  next.config = {
    ...(next.config ?? {}),
    fechaFin: next.fechasDisponibles.reduce((max, slot) => clean(slot.fecha) > clean(max) ? slot.fecha : max, next.config?.fechaFin ?? ''),
  }
  return next
}

export function buildScenarioMetric({ name, input, targetTotalDates = null } = {}) {
  const scenarioInput = targetTotalDates ? buildRecommendedCalendarInput(input, targetTotalDates) : input
  const contract = buildRegularExamPreviewIntegrationContract(scenarioInput, {})
  const summary = contract.uiDto?.uiSummary ?? {}
  const completionRate = getCompletionRate(summary)

  return {
    name,
    totalFechasDisponibles: asArray(scenarioInput.fechasDisponibles).length,
    totalMesas: summary.totalMesas ?? 0,
    totalPlanned: summary.totalPlanned ?? 0,
    totalUnassigned: summary.totalUnassigned ?? 0,
    completionRate,
    supera80: completionRate >= 0.8,
  }
}

export function buildScenarioMetricFromContract({ name, input = {}, contract = {} } = {}) {
  const summary = contract.uiDto?.uiSummary ?? {}
  const completionRate = getCompletionRate(summary)

  return {
    name,
    totalFechasDisponibles: asArray(input.fechasDisponibles).length,
    totalMesas: summary.totalMesas ?? 0,
    totalPlanned: summary.totalPlanned ?? 0,
    totalUnassigned: summary.totalUnassigned ?? 0,
    completionRate,
    supera80: completionRate >= 0.8,
  }
}

export function buildRecommendedDateScenarios(input = {}) {
  return [
    buildScenarioMetric({ name: 'Calendario actual', input }),
    buildScenarioMetric({ name: '35 fechas recomendadas', input, targetTotalDates: 35 }),
    buildScenarioMetric({ name: '55 fechas recomendadas', input, targetTotalDates: 55 }),
  ]
}

export function buildObservationSummary(input = {}, contract = {}, { maxCauses = MAX_VISIBLE_OBSERVATIONS, snapshot = {} } = {}) {
  const docentes = asArray(input.docentes)
  const diagnostics = input.metadata?.adapterDiagnostics?.adaptedCounts ?? {}
  const warnings = asArray(contract.warnings)
  const errors = asArray(contract.errors)
  const workerCodeCounts = asArray(contract.metadata?.issueSummary?.topByCode)
  const codeCounts = [...warnings, ...errors].reduce((counts, item) => {
    const code = clean(item.code ?? item.reason ?? item.message) || 'SIN_CODIGO'
    counts[code] = (counts[code] ?? 0) + 1
    return counts
  }, {})
  const titularidad = buildTitularidadSummary({ input, snapshot, contract })

  return {
    totalMateriasPlan: titularidad.totalMateriasPlan,
    materiasQueRequierenMesa: titularidad.materiasQueRequierenMesa,
    materiasSinHorarioNoRequeridas: diagnostics.materiasSinHorarioDocente ?? titularidad.materiasSinHorarioNoRequeridas,
    titularesInferidos: diagnostics.materiasConTitular ?? titularidad.titularesInferidos,
    titularesFaltantes: titularidad.titularesFaltantesReales,
    titularesFaltantesReales: titularidad.titularesFaltantesReales,
    titularesFaltantesNoRequeridos: titularidad.titularesFaltantesNoRequeridos,
    titularidad,
    docentesSinDisponibilidad: docentes.filter((docente) => asArray(docente.diasAsistencia).length === 0 && asArray(docente.availability).length === 0).length,
    causasPrincipales: (workerCodeCounts.length
      ? workerCodeCounts
      : Object.entries(codeCounts).map(([code, count]) => ({ code, count })))
      .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
      .slice(0, maxCauses),
  }
}

export { PRIORITY_DAYS }
