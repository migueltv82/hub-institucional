import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { isParticipacionVocalia, normalizeLlamado } from '../contracts.js'
import { generateRegularExamPlan } from '../planning/generateRegular.js'
import {
  JOINT_DATE_VOCAL_PLANNER_NAME,
  planWithJointDateVocalPlanner,
} from '../experimental/jointDateVocalPlanner.js'
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

function hasDate(mesa = {}) {
  return Boolean(clean(mesa.fecha ?? mesa.fechaIso))
}

function countVocales(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id].filter(clean).length
}

function issueCode(issue = {}) {
  return clean(issue.code ?? issue.reason ?? issue.type)
}

function countBy(items = [], getKey = (item) => item) {
  return items.reduce((counts, item) => {
    const key = clean(getKey(item)) || 'OTRO'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function topEntries(counts = {}, limit = 12) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function allIssues(plan = {}) {
  return [
    ...asArray(plan.errors),
    ...asArray(plan.warnings),
    ...asArray(plan.plannedMesas).flatMap((mesa) => [...asArray(mesa.errors), ...asArray(mesa.warnings)]),
    ...asArray(plan.unassignedMesas).flatMap((mesa) => [...asArray(mesa.errors), ...asArray(mesa.warnings)]),
  ]
}

function buildQuotaSummary(docentes = [], participaciones = []) {
  const vocalias = asArray(participaciones).filter(isParticipacionVocalia)
  let docentesEnLimite = 0
  let docentesExcedidos = 0
  let maxUsoCupo = 0

  docentes.forEach((docente) => {
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

function summarizeCurrentOrder(plan = {}, input = {}) {
  const plannedMesas = asArray(plan.plannedMesas)
  const unassignedMesas = asArray(plan.unassignedMesas)
  const allMesas = [...plannedMesas, ...unassignedMesas]
  const totalMesas = allMesas.length
  const issueCounts = countBy(allIssues(plan), issueCode)
  const participaciones = plan.metadata?.tribunalValidation?.participaciones ?? []
  const completionRate = totalMesas > 0 ? plannedMesas.length / totalMesas : 0

  return {
    name: 'currentOrder',
    evidenceType: 'engine-real',
    totalMesas,
    totalPlanned: plannedMesas.length,
    totalUnassigned: unassignedMesas.length,
    mesasSinFecha: allMesas.filter((mesa) => !hasDate(mesa)).length,
    completionRate: Number(completionRate.toFixed(4)),
    mesasCompletas: allMesas.filter((mesa) => countVocales(mesa) >= 2).length,
    mesasConUnVocal: allMesas.filter((mesa) => countVocales(mesa) === 1).length,
    mesasSinTribunal: allMesas.filter((mesa) => countVocales(mesa) === 0).length,
    vocalesNoDisponibles: numberOrZero(issueCounts.VOCAL_NO_DISPONIBLE),
    titularesNoDisponibles: numberOrZero(issueCounts.TITULAR_NO_DISPONIBLE),
    superposicionesDocentes: numberOrZero(issueCounts.DOCENTE_SUPERPUESTO),
    tribunalesIncompletos: numberOrZero(issueCounts.TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA) +
      numberOrZero(issueCounts.MESA_SIN_VOCALES) +
      numberOrZero(issueCounts.REPARACION_SIN_CANDIDATOS_VALIDOS),
    docentesSobreutilizados: buildQuotaSummary(input.docentes, participaciones).docentesExcedidos,
    consumoCupo: buildQuotaSummary(input.docentes, participaciones),
    reparacionesLocalesIntentadas: asArray(plan.metadata?.repairs).length,
    reparacionesLocalesExitosas: asArray(plan.metadata?.repairs).filter((repair) => repair.success).length,
    casosCompactables: asArray(plan.metadata?.compactaciones).length,
    durationMs: null,
    topCausasFallo: topEntries(issueCounts),
  }
}

function buildDelta(current = {}, joint = {}) {
  return {
    completionRate: Number((numberOrZero(joint.completionRate) - numberOrZero(current.completionRate)).toFixed(4)),
    totalPlanned: numberOrZero(joint.totalPlanned) - numberOrZero(current.totalPlanned),
    mesasSinFecha: numberOrZero(joint.mesasSinFecha) - numberOrZero(current.mesasSinFecha),
    vocalesNoDisponibles: numberOrZero(joint.vocalesNoDisponibles) - numberOrZero(current.vocalesNoDisponibles),
    titularesNoDisponibles: numberOrZero(joint.titularesNoDisponibles) - numberOrZero(current.titularesNoDisponibles),
    superposicionesDocentes: numberOrZero(joint.superposicionesDocentes) - numberOrZero(current.superposicionesDocentes),
    tribunalesIncompletos: numberOrZero(joint.tribunalesIncompletos) - numberOrZero(current.tribunalesIncompletos),
  }
}

function chooseRecommendation(current = {}, joint = {}) {
  if (numberOrZero(joint.completionRate) > numberOrZero(current.completionRate)) {
    return 'El prototipo conjunto mejora el completion read-only en modo apoyo, pero requiere revision manual por tribunales incompletos; no reemplazar legacy.'
  }

  return 'El prototipo conjunto no mejora el currentOrder; mantenerlo aislado y revisar scoring/compactacion antes de cualquier integracion.'
}

function sanitizeCaseRows(rows = []) {
  return asArray(rows).map((row) => ({
    caseId: clean(row.caseId),
    mode: JOINT_DATE_VOCAL_PLANNER_NAME,
    carreraKey: clean(row.carreraKey),
    materiaKey: clean(row.materiaKey),
    llamado: normalizeLlamado(row.llamado),
    reason: clean(row.reason),
    fecha: clean(row.fecha),
    turno: clean(row.turno),
    vocalesAsignados: numberOrZero(row.vocalesAsignados),
    attemptedSlots: numberOrZero(row.attemptedSlots),
  }))
}

export function auditJointDateVocalPlanner({ snapshot, options = {} } = {}) {
  const safeSnapshot = cloneJson(snapshot ?? {})
  const input = buildRegularExamInputFromWorkspaceSnapshot(safeSnapshot)
  const currentPlan = generateRegularExamPlan(input)
  const currentSummary = summarizeCurrentOrder(currentPlan, input)
  const supportPlan = planWithJointDateVocalPlanner(input, {
    minimumVocalesToPlan: 0,
    ...options.plannerOptions,
  })
  const supportSummary = {
    ...supportPlan.summary,
    name: 'jointDateVocalPlanner',
    mode: 'support-preview',
    note: 'Planifica si el titular tiene fecha viable; vocales faltantes quedan para revision manual.',
  }
  const oneVocalPlan = planWithJointDateVocalPlanner(input, {
    minimumVocalesToPlan: 1,
    ...(options.oneVocalPlannerOptions ?? {}),
  })
  const oneVocalSummary = {
    ...oneVocalPlan.summary,
    name: 'jointDateVocalPlannerOneVocalMinimum',
    mode: 'one-vocal-minimum',
    note: 'Planifica solo si hay al menos un vocal valido en fecha.',
  }
  const jointSummary = supportSummary
  const delta = buildDelta(currentSummary, jointSummary)

  return {
    summary: {
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      currentCompletionRate: currentSummary.completionRate,
      jointCompletionRate: jointSummary.completionRate,
      oneVocalMinimumCompletionRate: oneVocalSummary.completionRate,
      completionDelta: delta.completionRate,
      plannedDelta: delta.totalPlanned,
      sinFechaDelta: delta.mesasSinFecha,
      improvesCurrentOrder: jointSummary.completionRate > currentSummary.completionRate,
      reachesPreviousDaysModeReference: jointSummary.completionRate >= 0.5984,
      recommendation: chooseRecommendation(currentSummary, jointSummary),
      identityV2PendingHomonymies: 34,
      readyForIdentityV2: false,
    },
    modes: [
      currentSummary,
      jointSummary,
      oneVocalSummary,
    ],
    delta,
    jointPlannerDiagnostics: supportPlan.diagnostics,
    oneVocalMinimumDiagnostics: oneVocalPlan.diagnostics,
    compactableCases: supportPlan.compactableCases,
    caseRows: sanitizeCaseRows(supportPlan.caseRows).slice(0, options.maxCases ?? 500),
    recommendations: [
      'Mantener mitad mas uno por horas catedra.',
      'Mantener asistencia por dia como elegibilidad obligatoria.',
      'Usar el prototipo solo como apoyo de preview/auditoria.',
      'Cerrar las 34 homonimias de identidad v2 antes de una comparacion compactada final.',
      'Mantener safeToReplaceLegacy en false.',
    ],
    warnings: [
      'El prototipo puede planificar mesas con un vocal y marcarlas para revision manual.',
      'No guarda ni publica cronogramas.',
      'No reemplaza el motor viejo.',
    ],
    errors: [],
    privacy: {
      consoleSafe: true,
      caseRowsUseNormalizedKeys: true,
      noFullTeacherNames: true,
    },
  }
}
