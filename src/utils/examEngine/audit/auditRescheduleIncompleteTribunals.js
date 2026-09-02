import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { isParticipacionVocalia, normalizeLlamado } from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { planWithJointDateVocalPlanner } from '../experimental/jointDateVocalPlanner.js'
import { repairIncompleteTribunalVocals } from '../planning/repairIncompleteTribunalVocals.js'
import { rescheduleIncompleteTribunals } from '../experimental/rescheduleIncompleteTribunals.js'
import { auditIncompleteTribunals } from './auditIncompleteTribunals.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'

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

function performanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundMs(value) {
  return Math.round(numberOrZero(value) * 100) / 100
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)
  return clean(docente.id ?? docente.docenteId ?? docente.teacherKey ?? docente.dni ?? docente.email ?? docente.nombre)
}

function countVocales(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id].filter(clean).length
}

function hasDate(mesa = {}) {
  return Boolean(clean(mesa.fecha ?? mesa.fechaIso))
}

function buildQuotaSummary(docentes = [], participaciones = []) {
  const vocalias = asArray(participaciones).filter(isParticipacionVocalia)
  let docentesEnLimite = 0
  let docentesExcedidos = 0
  let maxUsoCupo = 0

  asArray(docentes).forEach((docente) => {
    const docenteId = getDocenteId(docente)
    const limite = calcularLimiteVocaliasPorLlamado(docente)
    ;['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO', 'LLAMADO_ESPECIAL'].forEach((llamado) => {
      const usadas = contarVocaliasPorDocente(vocalias, docenteId, llamado)
      if (limite > 0) maxUsoCupo = Math.max(maxUsoCupo, usadas / limite)
      if (limite > 0 && usadas === limite) docentesEnLimite += 1
      if (usadas > limite) docentesExcedidos += 1
    })
  })

  return {
    vocaliasAsignadas: vocalias.length,
    docentesEnLimite,
    docentesExcedidos,
    maxUsoCupo: Number(maxUsoCupo.toFixed(4)),
  }
}

function countSuperpositions(plannedItems = []) {
  const seen = new Set()
  let duplicated = 0

  asArray(plannedItems).forEach((mesa) => {
    if (!hasDate(mesa)) return
    ;[
      mesa.titularId,
      mesa.vocal1Id,
      mesa.vocal2Id,
    ].filter(clean).forEach((docenteId) => {
      const key = [
        normalizeText(docenteId),
        clean(mesa.fecha ?? mesa.fechaIso),
        normalizeText(mesa.turno),
      ].join('::')
      if (seen.has(key)) duplicated += 1
      seen.add(key)
    })
  })

  return duplicated
}

function topEntries(counts = {}, limit = 12) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function mergeCounts(...sources) {
  return sources.reduce((target, source = {}) => {
    Object.entries(source).forEach(([key, value]) => {
      target[key] = (target[key] ?? 0) + numberOrZero(value)
    })
    return target
  }, {})
}

function summarizeMode({ name, plannedItems, unplannedItems, docentes, participaciones, rejectedByCause = {}, operationSummary = {}, durationMs = 0 } = {}) {
  const planned = asArray(plannedItems)
  const unplanned = asArray(unplannedItems)
  const totalMesas = planned.length + unplanned.length
  const completionRate = totalMesas > 0 ? planned.length / totalMesas : 0
  const quota = buildQuotaSummary(docentes, participaciones)
  const complete = planned.filter((mesa) => countVocales(mesa) >= 2).length
  const oneVocal = planned.filter((mesa) => countVocales(mesa) === 1).length
  const onlyTitular = planned.filter((mesa) => countVocales(mesa) === 0).length
  const incomplete = planned.filter((mesa) => hasDate(mesa) && countVocales(mesa) < 2).length

  return {
    name,
    totalMesas,
    totalPlanned: planned.length,
    tribunalesCompletosDosVocales: complete,
    tribunalesMinimosUnVocal: oneVocal,
    tribunalesSoloTitular: onlyTitular,
    mesasSinFecha: unplanned.length,
    completionRate: Number(completionRate.toFixed(4)),
    pendientesRevisionManual: planned.filter((mesa) => (
      countVocales(mesa) < 2 ||
      mesa.metadata?.requiresManualReview === true ||
      asArray(mesa.warnings).some((warning) => [
        'MINIMUM_TRIBUNAL_REVIEW',
        'MANUAL_VOCAL_REVIEW',
        'RESCHEDULED_MINIMUM_REVIEW',
        'MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS',
      ].includes(warning.code))
    )).length,
    tribunalesIncompletos: incomplete,
    superposiciones: countSuperpositions(planned),
    docentesExcedidos: quota.docentesExcedidos,
    maxUsoCupo: quota.maxUsoCupo,
    consumoCupo: quota,
    vocalesRechazadosPorAsistencia: numberOrZero(rejectedByCause.vocales_rechazados_por_no_asistir),
    vocalesRechazadosPorSuperposicion: numberOrZero(rejectedByCause.vocales_rechazados_por_superposicion),
    vocalesRechazadosPorCupo: numberOrZero(rejectedByCause.vocales_rechazados_por_cupo),
    vocalesRechazadosPorIdoneidad: numberOrZero(rejectedByCause.vocales_rechazados_por_idoneidad),
    cambiosFechaRealizados: numberOrZero(operationSummary.dateChangesPerformed),
    cambiosFechaExitosos: numberOrZero(operationSummary.successfulDateChanges),
    reparacionesIntentadas: numberOrZero(operationSummary.repairAttempts ?? operationSummary.rescheduleAttempts),
    reparacionesExitosas: numberOrZero(operationSummary.successfulRepairs ?? operationSummary.successfulReschedules),
    durationMs,
  }
}

function createCaseRows(rescheduleResult = {}) {
  return asArray(rescheduleResult.cases).map((row, index) => ({
    caseId: `RESCHEDULE-AUDIT-${String(index + 1).padStart(4, '0')}`,
    mesaId: clean(row.mesaId),
    source: clean(row.source),
    carreraKey: clean(row.carreraKey),
    materiaKey: clean(row.materiaKey),
    llamado: normalizeLlamado(row.llamado),
    oldFecha: clean(row.oldFecha),
    newFecha: clean(row.newFecha),
    turno: clean(row.turno),
    status: clean(row.status),
    selectedCount: numberOrZero(row.selectedCount),
    changedDate: row.changedDate === true,
    rejectedByCause: row.rejectedByCause ?? {},
  }))
}

function buildDelta(before = {}, after = {}) {
  return {
    completionRate: Number((numberOrZero(after.completionRate) - numberOrZero(before.completionRate)).toFixed(4)),
    totalPlanned: numberOrZero(after.totalPlanned) - numberOrZero(before.totalPlanned),
    mesasSinFecha: numberOrZero(after.mesasSinFecha) - numberOrZero(before.mesasSinFecha),
    tribunalesCompletosDosVocales: numberOrZero(after.tribunalesCompletosDosVocales) - numberOrZero(before.tribunalesCompletosDosVocales),
    tribunalesMinimosUnVocal: numberOrZero(after.tribunalesMinimosUnVocal) - numberOrZero(before.tribunalesMinimosUnVocal),
    tribunalesSoloTitular: numberOrZero(after.tribunalesSoloTitular) - numberOrZero(before.tribunalesSoloTitular),
    pendientesRevisionManual: numberOrZero(after.pendientesRevisionManual) - numberOrZero(before.pendientesRevisionManual),
    superposiciones: numberOrZero(after.superposiciones) - numberOrZero(before.superposiciones),
    docentesExcedidos: numberOrZero(after.docentesExcedidos) - numberOrZero(before.docentesExcedidos),
  }
}

function chooseRecommendation(base = {}, reschedule = {}) {
  if (numberOrZero(reschedule.completionRate) > numberOrZero(base.completionRate)) {
    return 'Mover fecha y vocales juntos mejora el preview read-only, pero sigue siendo experimental; no reemplazar legacy.'
  }
  return 'Mover fecha y vocales juntos no mejora lo suficiente; revisar calendario, disponibilidad e identidad v2 antes de integrar.'
}

export function auditRescheduleIncompleteTribunals({ snapshot, input, options = {} } = {}) {
  const startedAt = performanceNow()
  const safeInput = input ?? buildRegularExamInputFromWorkspaceSnapshot(cloneJson(snapshot ?? {}))
  const basePlan = planWithJointDateVocalPlanner(safeInput, { minimumVocalesToPlan: 0 })
  const incompleteAudit = auditIncompleteTribunals({
    plannedItems: basePlan.plannedMesas,
    teachers: safeInput.docentes,
    calendar: safeInput.fechasDisponibles,
    options: {
      participaciones: basePlan.participaciones,
    },
  })
  const baseSummary = summarizeMode({
    name: 'jointDateVocalPlannerSupport',
    plannedItems: basePlan.plannedMesas,
    unplannedItems: basePlan.unassignedMesas,
    docentes: safeInput.docentes,
    participaciones: basePlan.participaciones,
    rejectedByCause: incompleteAudit.groupedByCause,
    durationMs: basePlan.summary.durationMs,
  })

  const fixedRepairResult = repairIncompleteTribunalVocals({
    plannedItems: basePlan.plannedMesas,
    unplannedItems: basePlan.unassignedMesas,
    teachers: safeInput.docentes,
    calendar: safeInput.fechasDisponibles,
    teacherLoad: basePlan.participaciones,
    options: {
      minimumVocalCount: 1,
      ...options.fixedRepairOptions,
    },
  })
  const fixedRepairSummary = summarizeMode({
    name: 'jointDateVocalPlannerPlusFixedDateVocalRepair',
    plannedItems: fixedRepairResult.plannedItems,
    unplannedItems: fixedRepairResult.unplannedItems,
    docentes: safeInput.docentes,
    participaciones: fixedRepairResult.participaciones,
    rejectedByCause: fixedRepairResult.summary.rejectedByCause,
    operationSummary: fixedRepairResult.summary,
    durationMs: fixedRepairResult.summary.durationMs,
  })

  const rescheduleResult = rescheduleIncompleteTribunals({
    plannedItems: basePlan.plannedMesas,
    unplannedItems: basePlan.unassignedMesas,
    teachers: safeInput.docentes,
    calendar: safeInput.fechasDisponibles,
    teacherLoad: basePlan.participaciones,
    options: {
      minimumVocalCount: 1,
      includeUnplanned: true,
      ...options.rescheduleOptions,
    },
  })
  const rescheduleSummary = summarizeMode({
    name: 'jointDateVocalPlannerPlusDateAndVocalReschedule',
    plannedItems: rescheduleResult.plannedItems,
    unplannedItems: rescheduleResult.unplannedItems,
    docentes: safeInput.docentes,
    participaciones: rescheduleResult.participaciones,
    rejectedByCause: rescheduleResult.summary.rejectedByCause,
    operationSummary: rescheduleResult.summary,
    durationMs: rescheduleResult.summary.durationMs,
  })
  const topPendingCauses = topEntries(mergeCounts(rescheduleResult.summary.rejectedByCause))

  return {
    summary: {
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      incompleteTribunalsInitial: incompleteAudit.summary.totalIncompleteTribunals,
      rescheduledComplete: rescheduleResult.summary.rescheduledComplete,
      rescheduledMinimumReview: rescheduleResult.summary.rescheduledMinimumReview,
      manualReviewNoFeasibleDateVocals: rescheduleResult.summary.manualReviewNoFeasibleDateVocals,
      onlyTitularAfterReschedule: rescheduleSummary.tribunalesSoloTitular,
      sinFechaBefore: baseSummary.mesasSinFecha,
      sinFechaAfter: rescheduleSummary.mesasSinFecha,
      completionBefore: baseSummary.completionRate,
      completionAfter: rescheduleSummary.completionRate,
      dateChangesPerformed: rescheduleResult.summary.dateChangesPerformed,
      successfulDateChanges: rescheduleResult.summary.successfulDateChanges,
      successfulReschedules: rescheduleResult.summary.successfulReschedules,
      topPendingCauses,
      durationMs: roundMs(performanceNow() - startedAt),
      recommendation: chooseRecommendation(baseSummary, rescheduleSummary),
      identityV2PendingHomonymies: 34,
      readyForIdentityV2: false,
    },
    modes: [
      baseSummary,
      fixedRepairSummary,
      rescheduleSummary,
    ],
    delta: {
      fixedRepairVsBase: buildDelta(baseSummary, fixedRepairSummary),
      rescheduleVsBase: buildDelta(baseSummary, rescheduleSummary),
      rescheduleVsFixedRepair: buildDelta(fixedRepairSummary, rescheduleSummary),
    },
    incompleteAudit,
    fixedRepairSummary: fixedRepairResult.summary,
    rescheduleSummary: rescheduleResult.summary,
    caseRows: createCaseRows(rescheduleResult),
    recommendations: [
      'Mantener mitad mas uno por horas catedra.',
      'Mantener asistencia por dia como requisito obligatorio.',
      'Tratar las mesas minimas con un vocal como revision institucional, no como oficial.',
      'Usar esta capa solo para preview/auditoria local read-only.',
      'Cerrar las 34 homonimias de identidad v2 antes de una comparacion final seria.',
      'Mantener safeToReplaceLegacy en false.',
    ],
    warnings: [
      'La reprogramacion puede mover fecha solo dentro del mismo llamado y turno.',
      'No guarda ni publica cronogramas.',
      'No reemplaza el motor viejo.',
    ],
    errors: [],
    privacy: {
      consoleSafe: true,
      noFullTeacherNames: true,
      normalizedCaseKeys: true,
    },
  }
}
