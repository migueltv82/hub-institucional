import {
  normalizeExamPeriodConfig,
  normalizeLlamado,
  normalizeMesaExamen,
  validateExamPeriodConfig,
} from '../contracts.js'
import { validateNoInvertedCorrelativities } from '../rules/correlativities.js'
import { DEFAULT_EXAM_PERIOD_CONFIG, validarCantidadLlamados } from '../rules/regularCalls.js'
import { validateMesa } from './validateMesa.js'
import { validarLimitesVocaliasPorDocente } from './validateTeacherLoad.js'
import {
  buildParticipacionesFromMesas,
  validateTribunals,
} from './validateTribunals.js'
import { validarAfinidadVocales } from './validateVocalAffinities.js'

// Cronograma validation combines table rules and cross-table rules.

export { buildParticipacionesFromMesas } from './validateTribunals.js'

function normalizeMesaForCronograma(mesa = {}) {
  const normalizedMesa = normalizeMesaExamen(mesa)

  return {
    ...mesa,
    ...normalizedMesa,
    fechaIso: normalizedMesa.fecha || mesa.fechaIso || '',
    inicio: normalizedMesa.hora || mesa.inicio || '',
    exam_call: normalizeLlamado(normalizedMesa.llamado || mesa.exam_call || mesa.llamado),
    llamado: normalizeLlamado(normalizedMesa.llamado || mesa.llamado || mesa.exam_call),
    titular_id: normalizedMesa.titularId || mesa.titular_id || '',
    titularId: normalizedMesa.titularId || mesa.titularId || '',
    vocal1: normalizedMesa.vocal1Id || mesa.vocal1 || '',
    vocal2: normalizedMesa.vocal2Id || mesa.vocal2 || '',
  }
}

function diagnosticKey(item = {}) {
  return [
    item.code,
    item.severity,
    item.mesaId,
    item.docenteId,
    item.rol,
    item.llamado,
    Array.isArray(item.missingCalls) ? item.missingCalls.join(',') : '',
  ].map((value) => String(value ?? '')).join('::')
}

function uniqueDiagnostics(items = []) {
  const seen = new Set()
  const uniqueItems = []

  items.forEach((item) => {
    const key = diagnosticKey(item)
    if (seen.has(key)) return
    seen.add(key)
    uniqueItems.push(item)
  })

  return uniqueItems
}

export function validateCronograma({
  correlatividades = [],
  cronograma = [],
  docentes = [],
  examPeriodConfig = DEFAULT_EXAM_PERIOD_CONFIG,
  materias = [],
} = {}) {
  const configValidation = validateExamPeriodConfig(examPeriodConfig)
  const normalizedConfig = normalizeExamPeriodConfig(examPeriodConfig)
  const normalizedCronograma = cronograma.map(normalizeMesaForCronograma)
  const participaciones = buildParticipacionesFromMesas(normalizedCronograma)
  const mesaValidations = normalizedCronograma.map((mesa) => validateMesa(mesa, { docentes }))

  const mesaErrors = mesaValidations.flatMap((validation) => (
    validation.errors.map((error) => ({ ...error, mesaId: error.mesaId || validation.mesaId }))
  ))
  const mesaWarnings = mesaValidations.flatMap((validation) => (
    validation.warnings.map((warning) => ({ ...warning, mesaId: warning.mesaId || validation.mesaId }))
  ))
  const callCountValidation = configValidation.valid
    ? validarCantidadLlamados(materias, normalizedCronograma, normalizedConfig)
    : { errors: [], requiredCalls: [] }
  const teacherLoadValidation = configValidation.valid
    ? validarLimitesVocaliasPorDocente(docentes, participaciones, normalizedConfig)
    : { errors: [], warnings: [], resumenDocentes: [] }
  const vocalAffinityValidation = validarAfinidadVocales(docentes, normalizedCronograma, participaciones)
  const tribunalValidation = validateTribunals({
    mesas: normalizedCronograma,
    docentes,
    participaciones,
    config: normalizedConfig,
  })
  const correlativity = validateNoInvertedCorrelativities({
    cronograma: normalizedCronograma,
    correlatividades,
  })

  const errors = uniqueDiagnostics([
    ...configValidation.errors,
    ...mesaErrors,
    ...callCountValidation.errors,
    ...teacherLoadValidation.errors,
    ...vocalAffinityValidation.errors,
    ...tribunalValidation.errors,
    ...correlativity.errors,
  ])
  const warnings = uniqueDiagnostics([
    ...mesaWarnings,
    ...teacherLoadValidation.warnings,
    ...vocalAffinityValidation.warnings,
    ...tribunalValidation.warnings,
    ...correlativity.warnings,
  ])
  const criticalErrors = errors.filter((error) => String(error.severity ?? '').toLowerCase() === 'critical')

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    criticalErrors,
    examPeriodConfig: normalizedConfig,
    normalizedCronograma,
    participaciones,
    resumenDocentes: teacherLoadValidation.resumenDocentes,
    resumenAfinidades: vocalAffinityValidation.resumenAfinidades,
    tribunalSummary: tribunalValidation.tribunalSummary,
  }
}
