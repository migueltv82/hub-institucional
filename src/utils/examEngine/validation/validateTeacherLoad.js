import { LLAMADOS } from '../constants.js'
import {
  isParticipacionTitular,
  isParticipacionTribunalCruzado,
  isParticipacionVocalia,
  normalizeExamPeriodConfig,
  normalizeLlamado,
  validateExamPeriodConfig,
} from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import {
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'
import {
  calculateTeacherAssignmentLimit,
  getTeacherTeachingHours,
  TEACHER_ASSIGNMENT_RULE_MODES,
} from '../rules/calculateTeacherAssignmentLimit.js'
import { getLlamadosRequeridos } from '../rules/regularCalls.js'

const LLAMADOS_RESUMEN = Object.values(LLAMADOS)

function clean(value) {
  return String(value ?? '').trim()
}

function uniqueCount(value) {
  if (Array.isArray(value)) {
    return new Set(value.map(clean).filter(Boolean).map(normalizeText)).size
  }

  if (value instanceof Set) return uniqueCount([...value])

  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)

  return clean(
    docente.id ??
    docente.docenteId ??
    docente.teacherKey ??
    docente.dni ??
    docente.email ??
    docente.nombre,
  )
}

function getDocenteNombre(docente = {}) {
  if (typeof docente === 'string') return docente

  return clean(
    docente.nombre ??
    docente.full_name ??
    docente.display_name ??
    docente.profesor ??
    docente.docente ??
    getDocenteId(docente),
  )
}

function getDiasAsistenciaCount(docente = {}) {
  if (typeof docente === 'number') return uniqueCount(docente)

  return uniqueCount(
    docente.diasAsistencia ??
    docente.diasDisponibles ??
    docente.disponibilidad ??
    docente.diasLaborales ??
    docente.cantidadDiasAsistencia ??
    docente.cantidadDiasDisponibles,
  )
}

function createEmptyCallCounter() {
  return LLAMADOS_RESUMEN.reduce((counter, llamado) => {
    counter[llamado] = 0
    return counter
  }, {})
}

function getParticipacionDocenteId(participacion = {}) {
  return clean(
    participacion.docenteId ??
    participacion.teacherKey ??
    participacion.teacherId ??
    participacion.docente?.id ??
    participacion.docente ??
    participacion.profesor,
  )
}

function countParticipacionesPorLlamado(participaciones = [], docenteId = '', llamado = '', predicate = () => false) {
  const docenteKey = normalizeText(docenteId)
  const llamadoKey = normalizeLlamado(llamado)
  if (!docenteKey || !llamadoKey) return 0

  return participaciones.filter((participacion) => (
    normalizeText(getParticipacionDocenteId(participacion)) === docenteKey &&
    normalizeLlamado(participacion.llamado ?? participacion.callKey ?? participacion.exam_call) === llamadoKey &&
    predicate(participacion)
  )).length
}

function buildResumenDocente(docente, participaciones = [], llamadosAValidar = []) {
  const docenteId = getDocenteId(docente)
  const limitResult = calculateTeacherAssignmentLimit({
    teacher: docente,
    ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
  })
  const limite = limitResult.limit
  const vocaliasPorLlamado = createEmptyCallCounter()
  const titularidadesPorLlamado = createEmptyCallCounter()
  const tribunalesCruzadosPorLlamado = createEmptyCallCounter()

  LLAMADOS_RESUMEN.forEach((llamado) => {
    vocaliasPorLlamado[llamado] = contarVocaliasPorDocente(participaciones, docenteId, llamado)
    titularidadesPorLlamado[llamado] = countParticipacionesPorLlamado(
      participaciones,
      docenteId,
      llamado,
      isParticipacionTitular,
    )
    tribunalesCruzadosPorLlamado[llamado] = countParticipacionesPorLlamado(
      participaciones,
      docenteId,
      llamado,
      isParticipacionTribunalCruzado,
    )
  })

  return {
    docenteId,
    nombre: getDocenteNombre(docente),
    diasAsistencia: getDiasAsistenciaCount(docente),
    horasCatedra: getTeacherTeachingHours(docente) ?? 0,
    horasCatedraSource: docente.horasCatedraSource ?? '',
    halfPlusOneRuleMode: limitResult.ruleMode,
    halfPlusOneLimitBaseValue: limitResult.baseValue,
    halfPlusOneLimitWarningCode: limitResult.warningCode,
    limiteVocaliasPorLlamado: limite,
    vocaliasPorLlamado,
    titularidadesPorLlamado,
    tribunalesCruzadosPorLlamado,
    excedido: llamadosAValidar.some((llamado) => vocaliasPorLlamado[llamado] > limite),
  }
}

export function validarLimitesVocaliasPorDocente(docentes = [], participaciones = [], config = {}) {
  const configValidation = validateExamPeriodConfig(config)
  const normalizedConfig = normalizeExamPeriodConfig(config)
  const llamadosAValidar = configValidation.valid ? getLlamadosRequeridos(normalizedConfig) : []
  const errors = []
  const warnings = []
  const resumenDocentes = []

  if (!configValidation.valid) {
    return {
      valid: false,
      errors: configValidation.errors,
      warnings,
      resumenDocentes,
    }
  }

  docentes.forEach((docente) => {
    const docenteId = getDocenteId(docente)
    if (!docenteId) return

    const resumen = buildResumenDocente(docente, participaciones, llamadosAValidar)
    resumenDocentes.push(resumen)

    llamadosAValidar.forEach((llamado) => {
      const vocaliasAsignadas = resumen.vocaliasPorLlamado[llamado] ?? 0
      const limite = resumen.limiteVocaliasPorLlamado

      if (vocaliasAsignadas > limite) {
        errors.push({
          code: 'DOCENTE_EXCEDE_LIMITE_VOCALIAS',
          message: 'El docente excede el limite de vocalias para el llamado.',
          severity: 'critical',
          docenteId,
          nombre: resumen.nombre,
          llamado,
          limite,
          vocaliasAsignadas,
          ruleMode: resumen.halfPlusOneRuleMode,
          limitBaseValue: resumen.halfPlusOneLimitBaseValue,
        })
        return
      }

      if (limite > 0 && vocaliasAsignadas === limite) {
        warnings.push({
          code: 'DOCENTE_ALCANZA_LIMITE_VOCALIAS',
          message: 'El docente alcanzo el limite de vocalias para el llamado.',
          severity: 'warning',
          docenteId,
          nombre: resumen.nombre,
          llamado,
          limite,
          vocaliasAsignadas,
          ruleMode: resumen.halfPlusOneRuleMode,
          limitBaseValue: resumen.halfPlusOneLimitBaseValue,
        })
      }
    })
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    resumenDocentes,
  }
}

export function countVocaliasRealesPorDocente(participaciones = [], docenteId = '', llamado = '') {
  return countParticipacionesPorLlamado(participaciones, docenteId, llamado, isParticipacionVocalia)
}
