// Institutional rule: half plus one applies only to common vocalias.
// Titularidades do not consume this quota.
// Cross tribunals are recorded separately and are not common vocalias.
// The calculation base is explicit: historical attendance days or current teaching hours.

import {
  isParticipacionTribunalCruzado,
  isParticipacionVocalia,
  normalizeLlamado,
} from '../contracts.js'
import {
  calculateTeacherAssignmentLimit,
  teacherCanBeAssignedOnDate,
  TEACHER_ASSIGNMENT_RULE_MODES,
} from './calculateTeacherAssignmentLimit.js'

export const ROLES_VOCALIA_COMUN = ['VOCAL_1', 'VOCAL_2', 'VOCAL_EXTERNO']
export const ROL_TITULAR = 'TITULAR'
export const ROL_TRIBUNAL_CRUZADO = 'TRIBUNAL_CRUZADO'

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
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

function getParticipacionDocenteId(participacion = {}) {
  if (typeof participacion === 'string') return ''

  return clean(
    participacion.docenteId ??
    participacion.teacherKey ??
    participacion.teacherId ??
    participacion.docente?.id ??
    participacion.docente ??
    participacion.profesor,
  )
}

function getParticipacionRol(participacion = {}) {
  if (typeof participacion === 'string') return participacion

  return (
    participacion.rol ??
    participacion.role ??
    participacion.tipoParticipacion ??
    participacion.tipo ??
    ''
  )
}

function getParticipacionLlamado(participacion = {}) {
  return (
    participacion.llamado ??
    participacion.callKey ??
    participacion.exam_call ??
    participacion.mesa?.llamado ??
    participacion.mesa?.exam_call ??
    ''
  )
}

export function calcularLimiteVocaliasPorLlamado(docente = {}, options = {}) {
  return calculateTeacherAssignmentLimit({
    teacher: docente,
    ruleMode: options.ruleMode,
    attendanceDays: options.attendanceDays,
    teachingHours: options.teachingHours,
    fallbackRuleMode: options.fallbackRuleMode,
  }).limit
}

export function cuentaComoVocalia(participacion = {}) {
  return isParticipacionVocalia({ rol: getParticipacionRol(participacion) })
}

export function esTribunalCruzado(participacion = {}) {
  return isParticipacionTribunalCruzado({ rol: getParticipacionRol(participacion) })
}

export function contarVocaliasPorDocente(participaciones = [], docenteId = '', llamado = '') {
  const docenteKey = normalizeText(docenteId)
  const llamadoKey = normalizeLlamado(llamado)
  if (!docenteKey || !llamadoKey) return 0

  return participaciones.filter((participacion) => (
    cuentaComoVocalia(participacion) &&
    normalizeText(getParticipacionDocenteId(participacion)) === docenteKey &&
    normalizeLlamado(getParticipacionLlamado(participacion)) === llamadoKey
  )).length
}

export function validarLimiteVocalias(docente = {}, participaciones = [], llamado = '', options = {}) {
  const docenteId = getDocenteId(docente)
  const limitResult = calculateTeacherAssignmentLimit({
    teacher: docente,
    ruleMode: options.ruleMode,
    attendanceDays: options.attendanceDays,
    teachingHours: options.teachingHours,
    fallbackRuleMode: options.fallbackRuleMode,
  })
  const limite = limitResult.limit
  const vocaliasAsignadas = contarVocaliasPorDocente(participaciones, docenteId, llamado)
  const excedido = vocaliasAsignadas > limite
  const disponible = Math.max(0, limite - vocaliasAsignadas)
  let mensaje = 'El docente puede asumir vocalias en este llamado.'

  if (!limite) {
    mensaje = limitResult.ruleMode === TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE
      ? 'El docente no tiene horas catedra disponibles para calcular vocalias.'
      : 'El docente no tiene dias de asistencia disponibles para calcular vocalias.'
  } else if (excedido) {
    mensaje = 'El docente excede el limite de vocalias para este llamado.'
  } else if (disponible === 0) {
    mensaje = 'El docente alcanzo el limite de vocalias para este llamado.'
  }

  return {
    docenteId,
    limite,
    vocaliasAsignadas,
    excedido,
    disponible,
    mensaje,
    ruleMode: limitResult.ruleMode,
    limitBaseValue: limitResult.baseValue,
    limitWarningCode: limitResult.warningCode,
    usedFallback: limitResult.usedFallback,
  }
}

export function puedeAsignarseComoVocal(docente = {}, participaciones = [], llamado = '', options = {}) {
  const validacion = validarLimiteVocalias(docente, participaciones, llamado, options)
  return validacion.limite > 0 && validacion.vocaliasAsignadas < validacion.limite
}

// Backward-compatible names used by the initial engine skeleton.
export function calculateVocaliaLimit(diasAsistencia) {
  return calcularLimiteVocaliasPorLlamado(
    { diasAsistencia },
    { ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.DAYS_BASED_HALF_PLUS_ONE },
  )
}

export function consumesHalfPlusOneQuota(role) {
  return cuentaComoVocalia({ rol: role })
}

export function countVocaliasByCall(assignments = [], teacherKey, callKey) {
  return contarVocaliasPorDocente(assignments, teacherKey, callKey)
}

export function countVocaliaDaysByCall(assignments = [], teacherKey, callKey) {
  return contarVocaliasPorDocente(assignments, teacherKey, callKey)
}

export function canAssignVocalia({
  assignments = [],
  attendsInstitutionOnDate = true,
  callKey = '',
  diasAsistencia = 0,
  teachingHours,
  teacherKey = '',
  ruleMode = TEACHER_ASSIGNMENT_RULE_MODES.DAYS_BASED_HALF_PLUS_ONE,
} = {}) {
  const docente = {
    id: teacherKey,
    diasAsistencia,
    horasCatedra: teachingHours,
    halfPlusOneRuleMode: ruleMode,
  }
  const validacion = validarLimiteVocalias(docente, assignments, callKey, { ruleMode })
  const underTeachingHoursBasedLimit = validacion.limite > 0 &&
    validacion.vocaliasAsignadas < validacion.limite

  return {
    allowed: teacherCanBeAssignedOnDate({
      attendsInstitutionOnDate,
      underTeachingHoursBasedLimit,
    }),
    currentDays: validacion.vocaliasAsignadas,
    currentVocalias: validacion.vocaliasAsignadas,
    limit: validacion.limite,
    ruleMode: validacion.ruleMode,
  }
}
