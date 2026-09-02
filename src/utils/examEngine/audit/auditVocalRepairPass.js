import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { isParticipacionVocalia, normalizeLlamado } from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { planWithJointDateVocalPlanner } from '../experimental/jointDateVocalPlanner.js'
import { repairIncompleteTribunalVocals } from '../planning/repairIncompleteTribunalVocals.js'
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
      { docenteId: mesa.titularId, rol: 'TITULAR' },
      { docenteId: mesa.vocal1Id, rol: 'VOCAL_1' },
      { docenteId: mesa.vocal2Id, rol: 'VOCAL_2' },
    ].filter((entry) => clean(entry.docenteId)).forEach((entry) => {
      const key = [
        normalizeText(entry.docenteId),
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

function summarizeMode({ name, plannedItems, unplannedItems, docentes, participaciones, rejectedByCause = {}, repairSummary = {}, durationMs = 0 } = {}) {
  const planned = asArray(plannedItems)
  const unplanned = asArray(unplannedItems)
  const totalMesas = planned.length + unplanned.length
  const completionRate = totalMesas > 0 ? planned.length / totalMesas : 0
  const quota = buildQuotaSummary(docentes, participaciones)
  const complete = planned.filter((mesa) => countVocales(mesa) >= 2).length
  const oneVocal = planned.filter((mesa) => countVocales(mesa) === 1).length
  const onlyTitular = planned.filter((mesa) => countVocales(mesa) === 0).length

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
      asArray(mesa.warnings).some((warning) => ['MINIMUM_TRIBUNAL_REVIEW', 'MANUAL_VOCAL_REVIEW'].includes(warning.code))
    )).length,
    docentesSobreutilizados: quota.docentesExcedidos,
    maxUsoCupo: quota.maxUsoCupo,
    consumoCupo: quota,
    superposiciones: countSuperpositions(planned),
    vocalesRechazadosPorAsistencia: numberOrZero(rejectedByCause.vocales_rechazados_por_no_asistir),
    vocalesRechazadosPorCupo: numberOrZero(rejectedByCause.vocales_rechazados_por_cupo),
    vocalesRechazadosPorSuperposicion: numberOrZero(rejectedByCause.vocales_rechazados_por_superposicion),
    vocalesRechazadosPorIdoneidad: numberOrZero(rejectedByCause.vocales_rechazados_por_idoneidad),
    reparacionesIntentadas: numberOrZero(repairSummary.repairAttempts),
    reparacionesExitosas: numberOrZero(repairSummary.successfulRepairs),
    durationMs,
  }
}

function createCaseRows(repairResult = {}) {
  return asArray(repairResult.cases).map((row, index) => ({
    caseId: `VOCAL-REPAIR-${String(index + 1).padStart(4, '0')}`,
    mesaId: clean(row.mesaId),
    carreraKey: clean(row.carreraKey),
    materiaKey: clean(row.materiaKey),
    llamado: normalizeLlamado(row.llamado),
    fecha: clean(row.fecha),
    turno: clean(row.turno),
    status: clean(row.status),
    selectedCount: numberOrZero(row.selectedCount),
    rejectedByCause: row.rejectedByCause ?? {},
  }))
}

function buildDelta(before = {}, after = {}) {
  return {
    completionRate: Number((numberOrZero(after.completionRate) - numberOrZero(before.completionRate)).toFixed(4)),
    tribunalesCompletosDosVocales: numberOrZero(after.tribunalesCompletosDosVocales) - numberOrZero(before.tribunalesCompletosDosVocales),
    tribunalesMinimosUnVocal: numberOrZero(after.tribunalesMinimosUnVocal) - numberOrZero(before.tribunalesMinimosUnVocal),
    tribunalesSoloTitular: numberOrZero(after.tribunalesSoloTitular) - numberOrZero(before.tribunalesSoloTitular),
    pendientesRevisionManual: numberOrZero(after.pendientesRevisionManual) - numberOrZero(before.pendientesRevisionManual),
    superposiciones: numberOrZero(after.superposiciones) - numberOrZero(before.superposiciones),
  }
}

export function auditVocalRepairPass({ snapshot, input, options = {} } = {}) {
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
  const before = summarizeMode({
    name: 'jointDateVocalPlannerSupport',
    plannedItems: basePlan.plannedMesas,
    unplannedItems: basePlan.unassignedMesas,
    docentes: safeInput.docentes,
    participaciones: basePlan.participaciones,
    rejectedByCause: incompleteAudit.groupedByCause,
    repairSummary: {},
    durationMs: basePlan.summary.durationMs,
  })
  const repairResult = repairIncompleteTribunalVocals({
    plannedItems: basePlan.plannedMesas,
    unplannedItems: basePlan.unassignedMesas,
    teachers: safeInput.docentes,
    calendar: safeInput.fechasDisponibles,
    teacherLoad: basePlan.participaciones,
    options: {
      minimumVocalCount: 1,
      ...options.repairOptions,
    },
  })
  const after = summarizeMode({
    name: 'jointDateVocalPlannerSupportPlusVocalRepair',
    plannedItems: repairResult.plannedItems,
    unplannedItems: repairResult.unplannedItems,
    docentes: safeInput.docentes,
    participaciones: repairResult.participaciones,
    rejectedByCause: repairResult.summary.rejectedByCause,
    repairSummary: repairResult.summary,
    durationMs: repairResult.summary.durationMs,
  })
  const delta = buildDelta(before, after)
  const topPendingCauses = topEntries(repairResult.summary.rejectedByCause)

  return {
    summary: {
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      incompleteTribunalsInitial: incompleteAudit.summary.totalIncompleteTribunals,
      repairedWithTwoVocales: repairResult.summary.repairedWithTwoVocales,
      repairedWithOneVocal: repairResult.summary.repairedWithOneVocal,
      minimumReviewExistingOneVocal: repairResult.summary.minimumReviewExistingOneVocal,
      oneVocalAfterRepair: after.tribunalesMinimosUnVocal,
      manualVocalReview: repairResult.summary.manualVocalReview,
      onlyTitularAfterRepair: after.tribunalesSoloTitular,
      sinFecha: after.mesasSinFecha,
      completionBefore: before.completionRate,
      completionAfter: after.completionRate,
      topPendingCauses,
      durationMs: roundMs(performanceNow() - startedAt),
      recommendation: repairResult.summary.repairedWithTwoVocales > 0 || repairResult.summary.repairedWithOneVocal > 0
        ? 'La segunda pasada aporta reparaciones para preview interno, pero sigue requiriendo revision humana; no reemplazar legacy.'
        : 'La segunda pasada no logra reparar vocales en cantidad suficiente; revisar afinidades/disponibilidad antes de integrar.',
      identityV2PendingHomonymies: 34,
      readyForIdentityV2: false,
    },
    modes: [
      before,
      after,
    ],
    delta,
    incompleteAudit,
    repairSummary: repairResult.summary,
    caseRows: createCaseRows(repairResult),
    recommendations: [
      'Mantener mitad mas uno por horas catedra.',
      'Mantener asistencia por dia como requisito obligatorio.',
      'Usar la reparacion de vocales solo como preview/auditoria read-only.',
      'No considerar mesas con un vocal como oficiales sin decision institucional.',
      'Mantener safeToReplaceLegacy en false.',
    ],
    warnings: [
      'La segunda pasada no mueve fechas.',
      'Las mesas con un vocal quedan como MINIMUM_TRIBUNAL_REVIEW.',
      'Las mesas sin vocal valido quedan como MANUAL_VOCAL_REVIEW.',
    ],
    errors: [],
    privacy: {
      consoleSafe: true,
      noFullTeacherNames: true,
      normalizedCaseKeys: true,
    },
  }
}
