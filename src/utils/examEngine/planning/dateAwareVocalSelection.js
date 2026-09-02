import { normalizeLlamado } from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { teacherIsAvailableOnDate } from '../rules/availability.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'
import { TEACHER_ASSIGNMENT_RULE_MODES } from '../rules/calculateTeacherAssignmentLimit.js'

export const ASSIGNMENT_STRATEGIES = Object.freeze({
  CURRENT: 'CURRENT',
  DATE_AWARE_VOCALS: 'DATE_AWARE_VOCALS',
})

const VOCAL_ROLES = ['VOCAL_1', 'VOCAL_2']
const HARD_CANDIDATE_REJECTIONS = new Set([
  'DOCENTE_NO_EXISTE',
  'DOCENTE_INACTIVO',
  'ES_TITULAR_DE_LA_MESA',
  'SIN_AFINIDAD',
  'CARRERA_INCOMPATIBLE',
  'TURNO_INCOMPATIBLE',
  'DOCENTE_DUPLICADO_EN_MESA',
])

function clean(value) {
  return String(value ?? '').trim()
}

export function resolveAssignmentStrategy(value = '') {
  const key = clean(value).toUpperCase()
  if (key === ASSIGNMENT_STRATEGIES.DATE_AWARE_VOCALS) return ASSIGNMENT_STRATEGIES.DATE_AWARE_VOCALS
  return ASSIGNMENT_STRATEGIES.CURRENT
}

function getDocenteKeys(docente = {}) {
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

function getDocenteById(docenteMap, docenteId = '') {
  return docenteMap.get(normalizeText(docenteId)) ?? null
}

function normalizeSlot(fechaCandidata = {}, mesa = {}) {
  return {
    fecha: clean(fechaCandidata.fecha ?? fechaCandidata.fechaIso ?? fechaCandidata.date),
    diaSemana: normalizeText(fechaCandidata.diaSemana ?? fechaCandidata.dia ?? fechaCandidata.day),
    turno: normalizeText(fechaCandidata.turno ?? fechaCandidata.shift ?? mesa.turno),
    llamado: normalizeLlamado(fechaCandidata.llamado ?? fechaCandidata.exam_call ?? mesa.llamado),
  }
}

export function buildTeacherSlotKey(docenteId = '', fecha = '', turno = '') {
  return [
    normalizeText(docenteId),
    clean(fecha),
    normalizeText(turno),
  ].join('::')
}

function teacherHasScheduleConflict(teacherSchedule = new Set(), docenteId = '', slot = {}) {
  return teacherSchedule.has(buildTeacherSlotKey(docenteId, slot.fecha, slot.turno))
}

function getTeacherTurnos(docente = {}) {
  return [
    docente.turno,
    docente.turnos,
    docente.turnosDisponibles,
    docente.disponibilidadTurnos,
    docente.shifts,
  ].flat().map(normalizeText).filter(Boolean)
}

function teacherMatchesTurno(docente = {}, turno = '') {
  const turnoKey = normalizeText(turno)
  if (!turnoKey) return true

  const turnos = getTeacherTurnos(docente)
  if (!turnos.length) return true
  return turnos.includes(turnoKey)
}

function countBy(values = []) {
  return values.reduce((counts, value) => {
    const key = clean(value) || 'OTRO'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function getCandidateScore(candidate = {}) {
  return Number(candidate.puntajeAfinidad ?? candidate.score ?? 0) || 0
}

function getCandidateCurrentLoad(candidate = {}) {
  return Number(candidate.metadata?.vocaliasAsignadas ?? candidate.vocaliasAsignadas ?? 0) || 0
}

function getCandidateAvailabilityDays(candidate = {}) {
  return Number(candidate.metadata?.disponibilidadDias ?? 0) || 0
}

function getCandidatePlanningCost(candidate = {}, candidateCostByDocenteId = new Map()) {
  if (!candidateCostByDocenteId || typeof candidateCostByDocenteId.get !== 'function') return 0
  return Number(candidateCostByDocenteId.get(normalizeText(candidate.docenteId)) ?? 0) || 0
}

function getBlockingCandidateRejections(candidate = {}) {
  return (Array.isArray(candidate.rechazos) ? candidate.rechazos : [])
    .map(clean)
    .filter((rejection) => HARD_CANDIDATE_REJECTIONS.has(rejection))
}

function evaluateCandidate({
  candidate = {},
  docente = null,
  mesa = {},
  slot = {},
  participaciones = [],
  teacherSchedule = new Set(),
  candidateCostByDocenteId = new Map(),
} = {}) {
  const docenteId = clean(candidate.docenteId)
  const reasons = []

  if (!docenteId || !docente) reasons.push('DOCENTE_NO_EXISTE')
  if (normalizeText(docenteId) === normalizeText(mesa.titularId)) reasons.push('ES_TITULAR_DE_LA_MESA')
  reasons.push(...getBlockingCandidateRejections(candidate))

  if (docente) {
    if (!teacherIsAvailableOnDate(docente, slot.fecha)) reasons.push('NO_ASISTE_EN_FECHA')
    if (!teacherMatchesTurno(docente, slot.turno)) reasons.push('TURNO_INCOMPATIBLE')
    if (teacherHasScheduleConflict(teacherSchedule, docenteId, slot)) reasons.push('DOCENTE_SUPERPUESTO')

    const limite = calcularLimiteVocaliasPorLlamado(docente, {
      ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
    })
    const vocaliasAsignadas = contarVocaliasPorDocente(participaciones, docenteId, slot.llamado)
    if (!(limite > 0 && vocaliasAsignadas < limite)) reasons.push('SUPERA_CUPO_HORAS_CATEDRA')
  }

  return {
    docenteId,
    valido: reasons.length === 0,
    reasons: [...new Set(reasons)],
    score: getCandidateScore(candidate),
    currentLoad: getCandidateCurrentLoad(candidate),
    availabilityDays: getCandidateAvailabilityDays(candidate),
    planningCost: getCandidatePlanningCost(candidate, candidateCostByDocenteId),
  }
}

function sortEvaluatedCandidates(left, right) {
  return (
    Number(right.valido) - Number(left.valido) ||
    right.score - left.score ||
    left.planningCost - right.planningCost ||
    left.currentLoad - right.currentLoad ||
    right.availabilityDays - left.availabilityDays ||
    left.docenteId.localeCompare(right.docenteId)
  )
}

export function selectDateAwareVocales({
  mesa = {},
  fechaCandidata = {},
  docentes = [],
  candidatosVocales = [],
  participaciones = [],
  teacherSchedule = new Set(),
  candidateCostByDocenteId = new Map(),
} = {}) {
  const slot = normalizeSlot(fechaCandidata, mesa)
  const docenteMap = buildDocenteMap(Array.isArray(docentes) ? docentes : [])
  const evaluated = (Array.isArray(candidatosVocales) ? candidatosVocales : [])
    .map((candidate) => evaluateCandidate({
      candidate,
      docente: getDocenteById(docenteMap, candidate.docenteId),
      mesa,
      slot,
      participaciones,
      teacherSchedule,
      candidateCostByDocenteId,
    }))
    .sort(sortEvaluatedCandidates)

  const selected = []
  const selectedIds = new Set()

  evaluated.forEach((candidate) => {
    if (selected.length >= VOCAL_ROLES.length) return
    if (!candidate.valido) return
    const docenteKey = normalizeText(candidate.docenteId)
    if (!docenteKey || selectedIds.has(docenteKey)) return
    selectedIds.add(docenteKey)
    selected.push({
      docenteId: candidate.docenteId,
      rol: VOCAL_ROLES[selected.length],
      score: candidate.score,
      planningCost: candidate.planningCost,
      reasons: [],
    })
  })

  const rejectionReasons = evaluated
    .filter((candidate) => !candidate.valido)
    .flatMap((candidate) => candidate.reasons)

  return {
    strategy: ASSIGNMENT_STRATEGIES.DATE_AWARE_VOCALS,
    slot,
    canConfirmTribunal: selected.length === VOCAL_ROLES.length,
    selected,
    candidatesEvaluated: evaluated.length,
    validCandidates: evaluated.filter((candidate) => candidate.valido).length,
    rejectedCandidates: evaluated.filter((candidate) => !candidate.valido).length,
    rejectedByReason: countBy(rejectionReasons),
    decisionReasons: selected.length === VOCAL_ROLES.length
      ? ['TRIBUNAL_COMPLETO_EN_FECHA']
      : ['SIN_DOS_VOCALES_VALIDOS_EN_FECHA'],
  }
}
