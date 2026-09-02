import { CANTIDADES_LLAMADOS, DOCENTE_A_DESIGNAR, TIPOS_PERIODO } from '../../constants.js'
import { normalizeLlamado, validateExamPeriodConfig } from '../../contracts.js'
import {
  buildDateRange,
  compareIsoDates,
  getDayName,
  toIsoDate,
} from '../../normalize/dates.js'
import {
  getSubjectCareer,
  getSubjectCode,
  getSubjectKey,
  getSubjectName,
  normalizeText,
} from '../../normalize/subjects.js'
import { getLlamadosRequeridos } from '../../rules/regularCalls.js'
import { getAugust2026FieldTestConfig } from '../../fieldTest/august2026FieldTestConfig.js'
import { pickDraftDateForSubject } from './planDraftScheduleDates.js'

export const GENERATE_DRAFT_EXAM_SCHEDULE_STAGE = 'GENERATE_DRAFT_EXAM_SCHEDULE'

const DEFAULT_DYNAMIC_EXAM_CALL_CONFIG = {
  tipoPeriodo: TIPOS_PERIODO.REGULAR,
  cantidadLlamados: CANTIDADES_LLAMADOS.UNO,
  usarDiasHabiles: true,
  carrerasIncluidas: 'ALL',
  excepcionesPorCarrera: [],
  estadoSalida: 'TEACHER_REVIEW',
  asignarVocales: false,
  aplicarMitadMasUno: false,
  // 'availabilityAware' (default) usa pickDraftDateForSubject para preferir
  // una fecha en la que el titular efectivamente asiste, con fallback a
  // 'roundRobin' (el comportamiento historico, ciego a la asistencia)
  // cuando no hay datos de disponibilidad. Validado el 2026-08-26 con
  // scripts/compareDraftScheduleDateStrategies.mjs contra un llamado real:
  // mismo total de mesas, carga pareja entre fechas, mesas con titular en
  // dia que no asiste bajan de 67 a 0. Forzar 'roundRobin' explicitamente en
  // examCallConfig revierte al comportamiento anterior sin deploy de codigo.
  fechaAssignmentStrategy: 'availabilityAware',
}

const DEFAULT_WORKING_DAYS = new Set([
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
])

function clean(value) {
  return String(value ?? '').trim()
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlain(entry)]))
  }

  return value
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && clean(value) !== '')
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value
  if (value instanceof Set) return [...value]
  return value === undefined || value === null ? [] : [value]
}

export function resolveDraftExamCallConfig(input = {}) {
  const providedConfig = input.examCallConfig ?? input.config ?? input.examPeriodConfig

  if (!providedConfig) {
    return getAugust2026FieldTestConfig()
  }

  return {
    ...DEFAULT_DYNAMIC_EXAM_CALL_CONFIG,
    ...providedConfig,
    usarDiasHabiles: providedConfig.usarDiasHabiles ?? providedConfig.usarSoloDiasHabiles ?? DEFAULT_DYNAMIC_EXAM_CALL_CONFIG.usarDiasHabiles,
    usarSoloDiasHabiles: providedConfig.usarSoloDiasHabiles ?? providedConfig.usarDiasHabiles ?? DEFAULT_DYNAMIC_EXAM_CALL_CONFIG.usarDiasHabiles,
    excepcionesPorCarrera: Array.isArray(providedConfig.excepcionesPorCarrera)
      ? providedConfig.excepcionesPorCarrera
      : Array.isArray(providedConfig.excepcionesCarrera)
        ? providedConfig.excepcionesCarrera
        : DEFAULT_DYNAMIC_EXAM_CALL_CONFIG.excepcionesPorCarrera,
  }
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)

  return clean(firstValue(
    docente.id,
    docente.docenteId,
    docente.teacherKey,
    docente.dni,
    docente.email,
    docente.nombre,
    docente.full_name,
    docente.profesor,
  ))
}

function getDocenteLabel(docente = {}) {
  if (typeof docente === 'string') return docente

  return clean(firstValue(
    docente.nombre,
    docente.full_name,
    docente.display_name,
    docente.profesor,
    docente.docente,
    getDocenteId(docente),
  ))
}

function getDocenteKeys(docente = {}) {
  if (typeof docente === 'string') return [normalizeText(docente)].filter(Boolean)

  return [
    docente.id,
    docente.docenteId,
    docente.teacherKey,
    docente.dni,
    docente.email,
    docente.nombre,
    docente.full_name,
    docente.profesor,
  ].map(normalizeText).filter(Boolean)
}

function buildDocenteMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    getDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
}

function docenteEstaActivo(docente = {}) {
  if (!('activo' in docente) && !('active' in docente) && !('isActive' in docente)) return true
  return docente.activo !== false && docente.active !== false && docente.isActive !== false
}

function getMateriaId(materia = {}) {
  return clean(firstValue(
    materia.id,
    materia.materiaId,
    materia.materia_id,
    materia.subject_id,
    getSubjectCode(materia),
    getSubjectName(materia),
  ))
}

function getCarreraId(materia = {}) {
  return clean(firstValue(
    materia.carreraId,
    materia.carrera_id,
    materia.program_id,
    materia.programaId,
    getSubjectCareer(materia),
  ))
}

function getAnio(materia = {}) {
  const raw = firstValue(
    materia.anio,
    materia.year,
    materia.nivel,
    materia.level,
    materia.curso,
    materia['a\u00f1o'],
  )
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) return numeric

  const numericText = clean(raw).match(/\d+/)?.[0]
  const parsedNumericText = Number(numericText)
  return Number.isFinite(parsedNumericText) ? parsedNumericText : clean(raw)
}

function getTitularId(materia = {}) {
  return clean(firstValue(
    materia.titular_id,
    materia.titularId,
    materia.presidente_id,
    materia.profesorTitular,
    materia.docenteTitularId,
    materia.docenteTitular,
    materia.titular?.id,
    materia.titular?.nombre,
    materia.titular,
  ))
}

function materiaRequiereMesa(materia = {}) {
  if (materia.requiereMesa === false) return false
  if (materia.requiere_mesa === false) return false
  if (materia.requiresMesa === false) return false
  if (materia.noRequiereMesa === true) return false
  if (materia.excluida === true || materia.excluded === true) return false
  return true
}

function getMateriaCareerKey(materia = {}) {
  return normalizeText(firstValue(
    materia.carrera,
    materia.programa,
    materia.program,
    materia.career,
    materia.carreraNombre,
    materia.nombreCarrera,
  ))
}

function careerExceptionApplies(exception = {}, materia = {}) {
  const subjectCareer = getMateriaCareerKey(materia)
  const exceptionCareers = normalizeArray(exception.carreras).length
    ? normalizeArray(exception.carreras).map(normalizeText)
    : [normalizeText(exception.carrera ?? exception.carreraId ?? exception.career)]

  if (!subjectCareer) return false
  return exceptionCareers.filter(Boolean).some((exceptionCareer) => (
    subjectCareer === exceptionCareer ||
    subjectCareer.includes(exceptionCareer) ||
    exceptionCareer.includes(subjectCareer)
  ))
}

function getCareerExceptions(materia = {}, config = {}) {
  const exceptions = [
    ...normalizeArray(config.excepcionesPorCarrera),
    ...normalizeArray(config.excepcionesCarrera),
  ]

  return exceptions.filter((exception) => careerExceptionApplies(exception, materia))
}

function materiaAlcanzadaPorConfig(materia = {}, config = {}) {
  if (!materiaRequiereMesa(materia)) {
    return {
      included: false,
      reason: 'MATERIA_NO_REQUIERE_MESA',
      message: 'La materia no requiere mesa.',
    }
  }

  const carrerasIncluidas = config.carrerasIncluidas
  if (Array.isArray(carrerasIncluidas) && carrerasIncluidas.length) {
    const carreraKey = normalizeText(getSubjectCareer(materia) || materia.carreraId)
    const includedCareerKeys = carrerasIncluidas.map(normalizeText)
    if (!includedCareerKeys.includes(carreraKey)) {
      return {
        included: false,
        reason: 'CARRERA_NO_INCLUIDA',
        message: 'La carrera no esta incluida en el llamado.',
      }
    }
  }

  const careerExceptions = getCareerExceptions(materia, config)
  for (const careerException of careerExceptions) {
    const excludedYears = normalizeArray(careerException.aniosExcluidos).map(Number).filter(Number.isFinite)
    const anio = Number(getAnio(materia))
    if (excludedYears.includes(anio)) {
      return {
        included: false,
        reason: careerException.reasonCode ?? 'CARRERA_ANIO_EXCLUIDO',
        message: careerException.reason ?? 'La carrera y el anio fueron excluidos de este llamado.',
      }
    }
    const allowedYears = normalizeArray(careerException.soloAnios).map(Number).filter(Number.isFinite)
    if (allowedYears.length && !allowedYears.includes(anio)) {
      return {
        included: false,
        reason: careerException.reasonCode ?? 'CARRERA_SOLO_ANIOS_CONFIGURADOS',
        message: careerException.reason ?? 'La carrera solo genera mesas de los anios configurados en este llamado.',
      }
    }
  }

  return { included: true }
}

function normalizeFecha(value = {}) {
  const fecha = toIsoDate(value.fecha ?? value.fechaIso ?? value.date ?? value)
  if (!fecha) return null

  return {
    fecha,
    diaSemana: clean(value.diaSemana ?? value.dia ?? value.day ?? getDayName(fecha)),
    disponible: value.disponible !== false && value.available !== false,
    llamado: normalizeLlamado(value.llamado ?? value.callKey ?? value.exam_call),
  }
}

function normalizeFechas(input = {}, config = {}) {
  const configuredRanges = config.rangosLlamados && typeof config.rangosLlamados === 'object'
    ? Object.entries(config.rangosLlamados).flatMap(([llamado, range = {}]) => (
      buildDateRange(range.inicio ?? range.start, range.fin ?? range.end).map((fecha) => ({
        fecha,
        llamado,
      }))
    ))
    : []
  const explicitFechas = Array.isArray(input.fechasHabiles)
    ? input.fechasHabiles
    : Array.isArray(input.fechasDisponibles)
      ? input.fechasDisponibles
      : Array.isArray(config.fechasHabiles)
        ? config.fechasHabiles
        : []
  const useWorkingDays = config.usarDiasHabiles ?? config.usarSoloDiasHabiles ?? true
  const workingDays = new Set(
    normalizeArray(config.diasHabiles).length
      ? normalizeArray(config.diasHabiles).map(normalizeText)
      : [...DEFAULT_WORKING_DAYS],
  )
  const rawFechas = explicitFechas.length
    ? explicitFechas
    : configuredRanges.length
      ? configuredRanges
      : buildDateRange(config.fechaInicio, config.fechaFin)
      .filter((fecha) => !useWorkingDays || workingDays.has(getDayName(fecha)))

  const seen = new Set()

  return rawFechas
    .map(normalizeFecha)
    .filter((fecha) => fecha?.fecha && fecha.disponible)
    .filter((fecha) => !useWorkingDays || workingDays.has(normalizeText(fecha.diaSemana)))
    .filter((fecha) => {
      const key = `${fecha.llamado || 'TODOS'}::${fecha.fecha}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((left, right) => compareIsoDates(left.fecha, right.fecha))
}

function createAlert({ code, message, severity = 'warning', extra = {} }) {
  return {
    code,
    message,
    severity,
    ...extra,
  }
}

function buildAlerts({ materia, titularId, titular, fecha }) {
  const alerts = []
  const materiaNombre = getSubjectName(materia)
  const carrera = getSubjectCareer(materia)
  const anio = getAnio(materia)

  if (!getMateriaId(materia) || !materiaNombre) {
    alerts.push(createAlert({
      code: 'MATERIA_SIN_IDENTIFICACION',
      message: 'Falta identificacion o nombre de materia.',
      severity: 'critical',
    }))
  }

  if (!carrera) {
    alerts.push(createAlert({
      code: 'CARRERA_NO_DEFINIDA',
      message: 'Falta carrera para la mesa preliminar.',
    }))
  }

  if (anio === '') {
    alerts.push(createAlert({
      code: 'ANIO_NO_DEFINIDO',
      message: 'Falta anio para la mesa preliminar.',
    }))
  }

  if (!titularId) {
    alerts.push(createAlert({
      code: 'TITULAR_REQUIRED',
      message: 'Falta titular para revision docente.',
      severity: 'critical',
    }))
  } else if (!titular) {
    alerts.push(createAlert({
      code: 'TITULAR_NOT_FOUND',
      message: 'El titular informado no existe en docentes.',
      severity: 'critical',
      extra: { titularId },
    }))
  } else if (!docenteEstaActivo(titular)) {
    alerts.push(createAlert({
      code: 'TITULAR_INACTIVE',
      message: 'El titular informado esta inactivo.',
      severity: 'critical',
      extra: { titularId },
    }))
  }

  if (!fecha) {
    alerts.push(createAlert({
      code: 'SIN_FECHA_SUGERIDA',
      message: 'No hay fechas habiles configuradas para sugerir mesa.',
      severity: 'critical',
    }))
  }

  return alerts
}

function getMesaLabel(materia = {}) {
  if (Array.isArray(materia.materiasAgrupadas) && materia.materiasAgrupadas.length) {
    return materia.materiasAgrupadas
      .map((subject) => getSubjectName(subject) || subject.materia || subject.nombreMateria)
      .map(clean)
      .filter(Boolean)
      .join(' / ')
  }

  return getSubjectName(materia)
}

function getMateriasAgrupadas(materia = {}) {
  if (Array.isArray(materia.materiasAgrupadas) && materia.materiasAgrupadas.length) {
    return materia.materiasAgrupadas.map((subject) => ({
      materiaId: getMateriaId(subject),
      materia: getSubjectName(subject),
      carreraId: getCarreraId(subject),
      carrera: getSubjectCareer(subject),
      anio: getAnio(subject),
    }))
  }

  return []
}

function observacionesFromAlerts(alerts = []) {
  return alerts
    .filter((alert) => alert.severity !== 'info')
    .map((alert) => alert.message)
    .filter(Boolean)
    .join(' ')
}

function sortDraftMesas(left = {}, right = {}) {
  return (
    clean(left.carrera).localeCompare(clean(right.carrera)) ||
    Number(left.anio || 0) - Number(right.anio || 0) ||
    clean(left.materiaMesa).localeCompare(clean(right.materiaMesa)) ||
    clean(left.llamado).localeCompare(clean(right.llamado)) ||
    clean(left.id).localeCompare(clean(right.id))
  )
}

function createDraftMesa({
  materia,
  llamado,
  fecha,
  dateIndex,
  mesaIndex,
  docenteMap,
  config,
}) {
  const materiaId = getMateriaId(materia)
  const titularId = getTitularId(materia)
  const titular = docenteMap.get(normalizeText(titularId)) ?? null
  const alerts = buildAlerts({
    materia,
    titularId,
    titular,
    fecha: fecha?.fecha,
    config,
  })
  const subjectKey = getSubjectKey(materia)
  const draftMesaId = `draft:${subjectKey || materiaId || mesaIndex}:${normalizeLlamado(llamado) || 'SIN_LLAMADO'}`

  return {
    id: draftMesaId,
    draftMesaId,
    materiaId,
    carreraId: getCarreraId(materia),
    carrera: getSubjectCareer(materia),
    anio: getAnio(materia),
    materiaMesa: getMesaLabel(materia),
    materia: getMesaLabel(materia),
    materiasAgrupadas: getMateriasAgrupadas(materia),
    llamado: normalizeLlamado(llamado),
    fechaSugerida: fecha?.fecha ?? '',
    fecha: fecha?.fecha ?? '',
    diaSemana: fecha?.diaSemana ?? '',
    titularId,
    titular: titular ? getDocenteLabel(titular) : clean(titularId) || DOCENTE_A_DESIGNAR,
    estado: config.estadoSalida,
    observaciones: observacionesFromAlerts(alerts),
    alertas: alerts,
    metadata: {
      source: GENERATE_DRAFT_EXAM_SCHEDULE_STAGE,
      draftMesaId,
      sourceSubjectKey: subjectKey,
      sourceMateria: clonePlain(materia),
      dateIndex,
      mesaIndex,
      teacherReviewOnly: true,
      vocalesPendientes: true,
    },
  }
}

function countBy(items = [], keyGetter) {
  return items.reduce((summary, item) => {
    const key = keyGetter(item)
    if (!key) return summary
    summary[key] = (summary[key] ?? 0) + 1
    return summary
  }, {})
}

function dedupeDiagnostics(items = []) {
  const seen = new Set()
  const unique = []

  items.forEach((item) => {
    const key = [
      item.code,
      item.materiaId,
      item.carrera,
      item.message,
      item.reason,
    ].map((value) => String(value ?? '')).join('::')
    if (seen.has(key)) return
    seen.add(key)
    unique.push(item)
  })

  return unique
}

function buildSummary({ materias, includedMaterias, excluded, mesas, fechas }) {
  const criticalAlerts = mesas.flatMap((mesa) => mesa.alertas ?? [])
    .filter((alert) => alert.severity === 'critical')

  return {
    totalMateriasInput: materias.length,
    totalMateriasAlcanzadas: includedMaterias.length,
    totalMateriasExcluidas: excluded.length,
    totalMesas: mesas.length,
    totalConTitular: mesas.filter((mesa) => clean(mesa.titularId)).length,
    totalSinTitular: mesas.filter((mesa) => !clean(mesa.titularId)).length,
    totalAlertas: mesas.reduce((total, mesa) => total + (mesa.alertas?.length ?? 0), 0),
    totalAlertasCriticas: criticalAlerts.length,
    totalFechasHabiles: fechas.length,
    mesasPorFecha: countBy(mesas, (mesa) => mesa.fechaSugerida),
    mesasPorCarrera: countBy(mesas, (mesa) => mesa.carrera),
    excludedByReason: countBy(excluded, (item) => item.reason),
  }
}

export function generateDraftExamSchedule(input = {}) {
  const config = resolveDraftExamCallConfig(input)
  const materias = Array.isArray(input.materias)
    ? input.materias
    : Array.isArray(input.catedras)
      ? input.catedras
      : Array.isArray(input.subjects)
        ? input.subjects
        : []
  const docentes = Array.isArray(input.docentes)
    ? input.docentes
    : Array.isArray(input.teachers)
      ? input.teachers
      : []
  const docenteMap = buildDocenteMap(docentes)
  const configValidation = validateExamPeriodConfig(config)
  const fechas = normalizeFechas(input, config)
  const requiredCalls = configValidation.valid ? getLlamadosRequeridos(config) : []
  const errors = configValidation.valid ? [] : [...configValidation.errors]
  const warnings = []
  const excluded = []

  if (!fechas.length) {
    errors.push({
      code: 'DRAFT_SCHEDULE_WITHOUT_WORKING_DATES',
      message: 'El precronograma no tiene fechas habiles configuradas.',
      severity: 'critical',
    })
  }

  const includedMaterias = materias.filter((materia) => {
    const inclusion = materiaAlcanzadaPorConfig(materia, config)
    if (inclusion.included) return true

    excluded.push({
      materiaId: getMateriaId(materia),
      materia: getSubjectName(materia),
      carrera: getSubjectCareer(materia),
      anio: getAnio(materia),
      reason: inclusion.reason,
      message: inclusion.message,
    })
    return false
  })

  const sortedSubjects = includedMaterias
    .map((materia, originalIndex) => ({ materia, originalIndex }))
    .sort((left, right) => (
      clean(getSubjectCareer(left.materia)).localeCompare(clean(getSubjectCareer(right.materia))) ||
      Number(getAnio(left.materia) || 0) - Number(getAnio(right.materia) || 0) ||
      clean(getMesaLabel(left.materia)).localeCompare(clean(getMesaLabel(right.materia))) ||
      left.originalIndex - right.originalIndex
    ))

  const availabilityAware = config.fechaAssignmentStrategy === 'availabilityAware'
  const dateLoad = new Map()
  const rawMesas = []
  sortedSubjects.forEach(({ materia }, subjectIndex) => {
    requiredCalls.forEach((llamado, callIndex) => {
      const mesaIndex = rawMesas.length
      const callDates = fechas.filter((fecha) => !fecha.llamado || fecha.llamado === llamado)
      const titularId = getTitularId(materia)
      const titular = availabilityAware ? (docenteMap.get(normalizeText(titularId)) ?? null) : null
      const { fecha, dateIndex } = pickDraftDateForSubject({
        callDates,
        titular: availabilityAware ? titular : null,
        dateLoad,
        subjectIndex,
        callIndex,
      })

      if (fecha) dateLoad.set(fecha.fecha, (dateLoad.get(fecha.fecha) ?? 0) + 1)

      rawMesas.push(createDraftMesa({
        materia,
        llamado,
        fecha,
        dateIndex,
        mesaIndex,
        docenteMap,
        config,
      }))
    })
  })

  rawMesas.forEach((mesa) => {
    warnings.push(...(mesa.alertas ?? []).filter((alert) => alert.severity !== 'critical').map((alert) => ({
      ...alert,
      materiaId: mesa.materiaId,
      mesaId: mesa.id,
    })))
    errors.push(...(mesa.alertas ?? []).filter((alert) => alert.severity === 'critical').map((alert) => ({
      ...alert,
      materiaId: mesa.materiaId,
      mesaId: mesa.id,
    })))
  })

  const draftSchedule = rawMesas.sort(sortDraftMesas)
  const finalErrors = dedupeDiagnostics(errors)
  const finalWarnings = dedupeDiagnostics(warnings)

  return {
    success: finalErrors.length === 0,
    stage: GENERATE_DRAFT_EXAM_SCHEDULE_STAGE,
    draftSchedule,
    precronograma: draftSchedule,
    mesas: draftSchedule,
    excluded,
    errors: finalErrors,
    warnings: finalWarnings,
    summary: buildSummary({
      materias,
      includedMaterias,
      excluded,
      mesas: draftSchedule,
      fechas,
    }),
    metadata: {
      config,
      fechasHabiles: fechas.map((fecha) => fecha.fecha),
      requiredCalls,
      vocalesAsignados: false,
      mitadMasUnoAplicada: false,
    },
  }
}
