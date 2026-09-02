import {
  CANTIDADES_LLAMADOS,
  EXAM_CALLS,
  REGULAR_CALL_DEFINITIONS,
  TIPOS_PERIODO,
} from '../constants.js'
import {
  createDefaultExamPeriodConfig,
  normalizeLlamado,
  normalizeTipoPeriodo,
  validateExamPeriodConfig,
} from '../contracts.js'
import { getSubjectKey } from '../normalize/subjects.js'

// Institutional rule: the required amount of calls is configured per exam period.
// A regular period can require one or two calls depending on institutional decision.
// The second call should replicate first-call logic only when the config requires it.

export const DEFAULT_EXAM_PERIOD_CONFIG = createDefaultExamPeriodConfig()

export {
  createDefaultExamPeriodConfig,
  normalizeExamPeriodConfig,
  normalizeTipoPeriodo,
  validateExamPeriodConfig,
} from '../contracts.js'

export function getRegularCallDefinitions() {
  return REGULAR_CALL_DEFINITIONS.map((definition) => ({ ...definition }))
}

export function getRegularCallKey(value) {
  return normalizeLlamado(value)
}

export function getLlamadosRequeridos(config = {}) {
  const { config: normalizedConfig, errors } = validateExamPeriodConfig(config)
  if (errors.length) return []

  if (normalizedConfig.tipoPeriodo === TIPOS_PERIODO.ESPECIAL) {
    return normalizedConfig.cantidadLlamados === CANTIDADES_LLAMADOS.UNO
      ? [EXAM_CALLS.SPECIAL]
      : [EXAM_CALLS.FIRST, EXAM_CALLS.SECOND]
  }

  return normalizedConfig.cantidadLlamados === CANTIDADES_LLAMADOS.UNO
    ? [EXAM_CALLS.FIRST]
    : [EXAM_CALLS.FIRST, EXAM_CALLS.SECOND]
}

export function validarLlamadosMateria(materia = {}, mesas = [], config = DEFAULT_EXAM_PERIOD_CONFIG) {
  return validarCantidadLlamados([materia], mesas, config)
}

export function requiereSegundoLlamado(config = {}) {
  return getLlamadosRequeridos(config).includes(EXAM_CALLS.SECOND)
}

function getMesaCallKey(mesa = {}, config = DEFAULT_EXAM_PERIOD_CONFIG) {
  const rawCall = mesa.exam_call ?? mesa.llamado
  const callKey = getRegularCallKey(rawCall)

  if (!callKey && normalizeTipoPeriodo(config.tipoPeriodo) === TIPOS_PERIODO.ESPECIAL) {
    return EXAM_CALLS.SPECIAL
  }

  return callKey
}

function getSubjectKeysFromMaterias(materias = []) {
  return materias
    .map(getSubjectKey)
    .filter((subjectKey) => subjectKey && subjectKey !== '::')
}

function getSubjectKeysFromMesas(mesas = []) {
  return mesas
    .map(getSubjectKey)
    .filter((subjectKey) => subjectKey && subjectKey !== '::')
}

export function validarCantidadLlamados(materias = [], mesas = [], config = DEFAULT_EXAM_PERIOD_CONFIG) {
  const configValidation = validateExamPeriodConfig(config)
  if (!configValidation.valid) {
    return {
      valid: false,
      errors: configValidation.errors,
      requiredCalls: [],
    }
  }

  const normalizedConfig = configValidation.config
  const requiredCalls = getLlamadosRequeridos(normalizedConfig)
  const subjectKeys = new Set(
    getSubjectKeysFromMaterias(materias).length
      ? getSubjectKeysFromMaterias(materias)
      : getSubjectKeysFromMesas(mesas),
  )
  const callsBySubject = new Map()

  mesas
    .filter((mesa) => {
      if (normalizedConfig.tipoPeriodo === TIPOS_PERIODO.ESPECIAL) {
        return mesa.exam_type === 'special' || mesa.tipoPeriodo === TIPOS_PERIODO.ESPECIAL || requiredCalls.includes(getMesaCallKey(mesa, normalizedConfig))
      }

      return mesa.exam_type !== 'special'
    })
    .forEach((mesa) => {
      const subjectKey = getSubjectKey(mesa)
      if (!subjectKey || subjectKey === '::') return

      subjectKeys.add(subjectKey)
      const calls = callsBySubject.get(subjectKey) ?? new Set()
      calls.add(getMesaCallKey(mesa, normalizedConfig))
      callsBySubject.set(subjectKey, calls)
    })

  const errors = []
  subjectKeys.forEach((subjectKey) => {
    const calls = callsBySubject.get(subjectKey) ?? new Set()
    const missingCalls = requiredCalls.filter((call) => !calls.has(call))

    if (!missingCalls.length) return

    errors.push({
      code: 'SUBJECT_WITHOUT_REQUIRED_CALLS',
      message: 'Subject does not have the calls required by the exam period configuration.',
      severity: 'critical',
      subjectKey,
      requiredCalls,
      missingCalls,
    })
  })

  return {
    valid: errors.length === 0,
    errors,
    requiredCalls,
  }
}

export function validateRegularTwoCalls(cronograma = []) {
  return validarCantidadLlamados([], cronograma, {
    ...DEFAULT_EXAM_PERIOD_CONFIG,
    tipoPeriodo: TIPOS_PERIODO.REGULAR,
    cantidadLlamados: CANTIDADES_LLAMADOS.DOS,
  })
}

export function shouldReplicateSecondCall(firstCallMesa, secondCallCandidate, config = DEFAULT_EXAM_PERIOD_CONFIG) {
  if (!requiereSegundoLlamado(config)) return false
  if (!firstCallMesa || !secondCallCandidate) return false
  return getSubjectKey(firstCallMesa) === getSubjectKey(secondCallCandidate)
}
