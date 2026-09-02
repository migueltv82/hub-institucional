import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import {
  createParticipacionTribunal,
  isParticipacionVocalia,
  normalizeLlamado,
} from '../contracts.js'
import { buildFeasibilityDiagnosis } from '../diagnostics/feasibility.js'
import { normalizeText } from '../normalize/subjects.js'
import { buildExamTableCandidates } from '../planning/buildCandidates.js'
import { assignTitularesToCandidates } from '../planning/assignTitular.js'
import { buildVocalCandidatesForMesas } from '../planning/buildVocalCandidates.js'
import { generateRegularExamPlan } from '../planning/generateRegular.js'
import { getLlamadosRequeridos } from '../rules/regularCalls.js'
import { teacherIsAvailableOnDate } from '../rules/availability.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'
import {
  buildTeacherSlotKey,
  selectDateAwareVocales,
} from '../planning/dateAwareVocalSelection.js'

export const ASSIGNMENT_ORDER_MODES = Object.freeze({
  CURRENT_ORDER: 'currentOrder',
  DATE_AWARE_VOCAL_SELECTION: 'dateAwareVocalSelection',
  DATE_FIRST_THEN_VOCALS: 'dateFirstThenVocals',
  JOINT_DATE_VOCAL_SCORING: 'jointDateVocalScoring',
})

const CURRENT_FLOW_TYPE = 'VOCALS_FIRST_THEN_DATE_WITH_REPAIR_AFTER_FAILURE'
const EXPERIMENTAL_MODES = [
  ASSIGNMENT_ORDER_MODES.DATE_AWARE_VOCAL_SELECTION,
  ASSIGNMENT_ORDER_MODES.DATE_FIRST_THEN_VOCALS,
  ASSIGNMENT_ORDER_MODES.JOINT_DATE_VOCAL_SCORING,
]

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

function normalizeFechaDisponible(row = {}) {
  return {
    ...row,
    fecha: clean(row.fecha ?? row.fechaIso ?? row.date),
    diaSemana: normalizeText(row.diaSemana ?? row.dia ?? row.day),
    turno: normalizeText(row.turno ?? row.shift),
    llamado: normalizeLlamado(row.llamado ?? row.exam_call ?? row.callKey),
    disponible: row.disponible !== false && row.available !== false,
  }
}

function fechaSort(left, right) {
  return (
    clean(left.fecha).localeCompare(clean(right.fecha)) ||
    clean(left.turno).localeCompare(clean(right.turno))
  )
}

function getCandidateSlots(mesa = {}, fechasDisponibles = []) {
  const llamado = normalizeLlamado(mesa.llamado)
  const turno = normalizeText(mesa.turno)

  return fechasDisponibles
    .filter((slot) => slot.disponible && slot.fecha)
    .filter((slot) => slot.llamado === llamado)
    .filter((slot) => !turno || slot.turno === turno)
    .sort(fechaSort)
}

function teacherBusyOnSlot(teacherSchedule = new Set(), docenteId = '', slot = {}) {
  return teacherSchedule.has(buildTeacherSlotKey(docenteId, slot.fecha, slot.turno))
}

function teacherCanAttendSlot(docente = null, slot = {}) {
  return Boolean(
    docente &&
    teacherIsAvailableOnDate(docente, slot.fecha) &&
    teacherMatchesTurno(docente, slot.turno),
  )
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

function mergeCounts(target, source = {}) {
  Object.entries(source).forEach(([key, value]) => {
    target[key] = (target[key] ?? 0) + numberOrZero(value)
  })
  return target
}

function allPlanIssues(plan = {}) {
  return [
    ...asArray(plan.errors),
    ...asArray(plan.warnings),
    ...asArray(plan.plannedMesas).flatMap((mesa) => [...asArray(mesa.errors), ...asArray(mesa.warnings)]),
    ...asArray(plan.unassignedMesas).flatMap((mesa) => [...asArray(mesa.errors), ...asArray(mesa.warnings)]),
  ]
}

function countVocales(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id].filter(clean).length
}

function hasDate(mesa = {}) {
  return Boolean(clean(mesa.fecha ?? mesa.fechaIso))
}

function buildQuotaSummary(docentes = [], participaciones = []) {
  const vocalias = asArray(participaciones).filter(isParticipacionVocalia)
  const byTeacherCall = vocalias.reduce((map, participacion) => {
    const key = [
      normalizeText(participacion.docenteId),
      normalizeLlamado(participacion.llamado),
    ].join('::')
    map.set(key, (map.get(key) ?? 0) + 1)
    return map
  }, new Map())
  let docentesEnLimite = 0
  let docentesExcedidos = 0
  let maxUso = 0

  docentes.forEach((docente) => {
    const docenteId = getDocenteId(docente)
    const limite = calcularLimiteVocaliasPorLlamado(docente)
    ;['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO', 'LLAMADO_ESPECIAL'].forEach((llamado) => {
      const usadas = contarVocaliasPorDocente(vocalias, docenteId, llamado)
      if (limite > 0) maxUso = Math.max(maxUso, usadas / limite)
      if (limite > 0 && usadas === limite) docentesEnLimite += 1
      if (usadas > limite) docentesExcedidos += 1
    })
  })

  return {
    vocaliasAsignadas: vocalias.length,
    teacherCallBuckets: byTeacherCall.size,
    docentesEnLimite,
    docentesExcedidos,
    maxUsoCupo: Number(maxUso.toFixed(4)),
  }
}

function summarizePlanLike({
  name,
  evidenceType,
  plan = {},
  input = {},
  source = {},
  issueCounts = null,
  rejectedByReason = {},
  repairs = [],
} = {}) {
  const plannedMesas = asArray(plan.plannedMesas)
  const unassignedMesas = asArray(plan.unassignedMesas)
  const allMesas = [...plannedMesas, ...unassignedMesas]
  const totalMesas = allMesas.length
  const issues = issueCounts ?? countBy(allPlanIssues(plan), issueCode)
  const quota = buildQuotaSummary(asArray(input.docentes), asArray(plan.participaciones))
  const repairRows = asArray(repairs)
  const completionRate = totalMesas > 0 ? plannedMesas.length / totalMesas : 0

  return {
    name,
    evidenceType,
    totalMesas,
    totalPlanned: plannedMesas.length,
    totalUnassigned: unassignedMesas.length,
    mesasSinFecha: allMesas.filter((mesa) => !hasDate(mesa)).length,
    completionRate: Number(completionRate.toFixed(4)),
    mesasCompletas: allMesas.filter((mesa) => countVocales(mesa) >= 2).length,
    mesasConUnVocal: allMesas.filter((mesa) => countVocales(mesa) === 1).length,
    mesasSinTribunal: allMesas.filter((mesa) => countVocales(mesa) === 0).length,
    vocalesNoDisponibles: numberOrZero(issues.VOCAL_NO_DISPONIBLE) + numberOrZero(rejectedByReason.NO_ASISTE_EN_FECHA),
    titularesNoDisponibles: numberOrZero(issues.TITULAR_NO_DISPONIBLE),
    superposicionesDocentes: numberOrZero(issues.DOCENTE_SUPERPUESTO) + numberOrZero(rejectedByReason.DOCENTE_SUPERPUESTO),
    tribunalesIncompletos: numberOrZero(issues.TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA) +
      numberOrZero(issues.MESA_SIN_VOCALES) +
      numberOrZero(issues.REPARACION_SIN_CANDIDATOS_VALIDOS),
    consumoCuotaDocente: quota,
    docentesQueSuperanCupo: quota.docentesExcedidos,
    docentesBloqueadosPorAsistencia: numberOrZero(rejectedByReason.NO_ASISTE_EN_FECHA) +
      numberOrZero(issues.VOCAL_NO_DISPONIBLE) +
      numberOrZero(issues.TITULAR_NO_DISPONIBLE),
    cantidadReparaciones: repairRows.length,
    reparacionesExitosas: repairRows.filter((repair) => repair.success).length,
    reparacionesFallidas: repairRows.filter((repair) => repair.success === false).length,
    topCausasFallo: topEntries({
      ...issues,
      ...Object.fromEntries(Object.entries(rejectedByReason).map(([key, value]) => [`RECHAZO_${key}`, value])),
    }),
    source,
  }
}

function buildCurrentOrderRun(input = {}) {
  const plan = generateRegularExamPlan(input)
  const summary = summarizePlanLike({
    name: ASSIGNMENT_ORDER_MODES.CURRENT_ORDER,
    evidenceType: 'engine-real',
    plan: {
      ...plan,
      participaciones: plan.metadata?.tribunalValidation?.participaciones ?? [],
    },
    input,
    repairs: plan.metadata?.repairs,
    source: {
      assignmentOrder: CURRENT_FLOW_TYPE,
      compactMode: plan.metadata?.compactMode,
      stageOrder: plan.metadata?.stageOrder,
      completedStages: plan.metadata?.completedStages,
    },
  })

  return {
    plan,
    summary: {
      ...summary,
      totalCriticalErrors: asArray(plan.errors).filter((error) => clean(error.severity).toLowerCase() === 'critical').length,
      totalWarnings: asArray(plan.warnings).length,
    },
  }
}

function buildBaseContext(input = {}) {
  const docentes = asArray(input.docentes)
  const materias = asArray(input.materias)
  const correlatividades = asArray(input.correlatividades)
  const config = input.config ?? {}
  const diagnosis = buildFeasibilityDiagnosis({
    docentes,
    materias,
    mesas: asArray(input.mesas),
    correlatividades,
    config,
  })
  const candidatesResult = buildExamTableCandidates({
    docentes,
    materias,
    correlatividades,
    config,
    diagnosis,
  })
  const titularResult = assignTitularesToCandidates({
    candidates: candidatesResult.candidates,
    docentes,
    config,
  })

  return {
    docentes,
    materias,
    correlatividades,
    fechasDisponibles: asArray(input.fechasDisponibles).map(normalizeFechaDisponible),
    config,
    diagnosis,
    candidatesResult,
    titularResult,
  }
}

function createUnassignedMesa({ mesa = {}, reason = '', detail = '', errors = [], warnings = [] } = {}) {
  return {
    ...mesa,
    estado: 'SIN_FECHA_TENTATIVA',
    fecha: '',
    fechaIso: '',
    reason,
    detail,
    errors,
    warnings,
  }
}

function createPlannedMesa({ mesa = {}, slot = {}, decision = {} } = {}) {
  const vocal1Id = decision.selected?.[0]?.docenteId ?? null
  const vocal2Id = decision.selected?.[1]?.docenteId ?? null

  return {
    ...mesa,
    fecha: slot.fecha,
    fechaIso: slot.fecha,
    diaSemana: slot.diaSemana,
    turno: slot.turno,
    vocal1Id,
    vocal2Id,
    estado: vocal1Id && vocal2Id ? 'FECHA_TENTATIVA' : 'SIN_TRIBUNAL_CONFORMADO',
    metadata: {
      ...(mesa.metadata ?? {}),
      experimentalAssignmentStrategy: 'DATE_AWARE_VOCALS',
      decisionReasons: decision.decisionReasons,
    },
  }
}

function createVocalParticipation(mesa = {}, docenteId = '', rol = '') {
  return createParticipacionTribunal({
    docenteId,
    mesaId: mesa.id,
    materiaId: mesa.materiaId,
    carreraId: mesa.carreraId,
    rol,
    llamado: mesa.llamado,
    fecha: mesa.fecha,
    turno: mesa.turno,
  })
}

function markTeacherSchedule(teacherSchedule, mesa = {}) {
  ;[mesa.titularId, mesa.vocal1Id, mesa.vocal2Id]
    .filter(clean)
    .forEach((docenteId) => teacherSchedule.add(buildTeacherSlotKey(docenteId, mesa.fecha, mesa.turno)))
}

function createCandidateEntry({ mesa = {}, slot = {}, docentes = [], participaciones = [], config = {} } = {}) {
  const result = buildVocalCandidatesForMesas({
    mesasPreliminares: [{
      ...mesa,
      fecha: slot.fecha,
      fechaIso: slot.fecha,
      turno: slot.turno,
    }],
    docentes,
    participacionesExistentes: participaciones,
    config,
  })

  return result.mesasConCandidatos[0] ?? { candidatosVocales: [] }
}

function scoreDecisionForJointMode(decision = {}, slot = {}) {
  const selectedScore = asArray(decision.selected).reduce((total, selected) => total + numberOrZero(selected.score), 0)
  return (
    Number(decision.canConfirmTribunal) * 100000 +
    numberOrZero(decision.validCandidates) * 1000 +
    selectedScore -
    Number(clean(slot.fecha).replaceAll('-', '')) / 100000000
  )
}

function selectSlotDecision({
  mode,
  mesa,
  slots,
  docentes,
  docenteMap,
  participaciones,
  teacherSchedule,
  config,
  rejectedByReason,
  candidateEntryCache,
} = {}) {
  const titular = getDocenteById(docenteMap, mesa.titularId)
  const attempted = []
  const titularErrors = []

  for (const slot of slots) {
    if (!teacherCanAttendSlot(titular, slot)) {
      titularErrors.push('TITULAR_NO_DISPONIBLE')
      continue
    }
    if (teacherBusyOnSlot(teacherSchedule, mesa.titularId, slot)) {
      titularErrors.push('DOCENTE_SUPERPUESTO')
      continue
    }

    const cacheKey = [clean(mesa.id), clean(slot.fecha), clean(slot.turno)].join('::')
    const entry = candidateEntryCache.get(cacheKey) ?? createCandidateEntry({
      mesa,
      slot,
      docentes,
      participaciones: [],
      config,
    })
    candidateEntryCache.set(cacheKey, entry)
    const decision = selectDateAwareVocales({
      mesa,
      fechaCandidata: slot,
      docentes,
      candidatosVocales: entry.candidatosVocales,
      participaciones,
      teacherSchedule,
    })
    mergeCounts(rejectedByReason, decision.rejectedByReason)
    attempted.push({ slot, decision })

    if (mode === ASSIGNMENT_ORDER_MODES.DATE_FIRST_THEN_VOCALS) {
      return { slot, decision, titularErrors, attempted }
    }

    if (mode === ASSIGNMENT_ORDER_MODES.DATE_AWARE_VOCAL_SELECTION && decision.canConfirmTribunal) {
      return { slot, decision, titularErrors, attempted }
    }
  }

  if (mode === ASSIGNMENT_ORDER_MODES.JOINT_DATE_VOCAL_SCORING) {
    const selected = attempted
      .filter((entry) => entry.decision.canConfirmTribunal)
      .sort((left, right) => scoreDecisionForJointMode(right.decision, right.slot) - scoreDecisionForJointMode(left.decision, left.slot))[0]
    if (selected) return { ...selected, titularErrors, attempted }
  }

  return {
    slot: null,
    decision: attempted.sort((left, right) => (
      numberOrZero(right.decision.validCandidates) - numberOrZero(left.decision.validCandidates)
    ))[0]?.decision ?? null,
    titularErrors,
    attempted,
  }
}

function safeCaseRow({ index, mode, mesa = {}, reason = '', detail = '', slot = null } = {}) {
  return {
    caseId: `CASE-${String(index + 1).padStart(4, '0')}`,
    mode,
    carreraKey: normalizeText(mesa.carrera || mesa.carreraId || 'sin_carrera').replaceAll(/[^a-z0-9]+/g, '_'),
    materiaKey: normalizeText(mesa.materia || mesa.materiaId || 'sin_materia').replaceAll(/[^a-z0-9]+/g, '_'),
    llamado: normalizeLlamado(mesa.llamado),
    reason,
    detail,
    fecha: slot?.fecha ?? '',
    turno: slot?.turno ?? '',
  }
}

function runExperimentalMode({ mode, input } = {}) {
  const base = buildBaseContext(input)
  const docenteMap = buildDocenteMap(base.docentes)
  const requiredCalls = getLlamadosRequeridos(base.config)
  const mesas = base.titularResult.mesasPreliminares
    .filter((mesa) => requiredCalls.includes(normalizeLlamado(mesa.llamado)))
    .sort((left, right) => (
      numberOrZero(right.riskScore) - numberOrZero(left.riskScore) ||
      numberOrZero(right.anio) - numberOrZero(left.anio) ||
      clean(left.id).localeCompare(clean(right.id))
    ))
  const plannedMesas = []
  const unassignedMesas = []
  const participaciones = []
  const teacherSchedule = new Set()
  const candidateEntryCache = new Map()
  const errors = []
  const warnings = []
  const rejectedByReason = {}
  const cases = []

  mesas.forEach((mesa, index) => {
    const slots = getCandidateSlots(mesa, base.fechasDisponibles)
    if (!slots.length) {
      const error = {
        code: 'SIN_FECHA_VALIDA',
        severity: 'critical',
        mesaId: mesa.id,
      }
      errors.push(error)
      unassignedMesas.push(createUnassignedMesa({
        mesa,
        reason: 'SIN_FECHA_VALIDA',
        detail: 'No hay fechas disponibles para llamado y turno.',
        errors: [error],
      }))
      cases.push(safeCaseRow({ index, mode, mesa, reason: 'SIN_FECHA_VALIDA' }))
      return
    }

    const selected = selectSlotDecision({
      mode,
      mesa,
      slots,
      docentes: base.docentes,
      docenteMap,
      participaciones,
      teacherSchedule,
      config: base.config,
      rejectedByReason,
      candidateEntryCache,
    })

    if (selected.slot && selected.decision?.canConfirmTribunal) {
      const plannedMesa = createPlannedMesa({
        mesa,
        slot: selected.slot,
        decision: selected.decision,
      })
      plannedMesas.push(plannedMesa)
      markTeacherSchedule(teacherSchedule, plannedMesa)
      selected.decision.selected.forEach((vocal) => {
        participaciones.push(createVocalParticipation(plannedMesa, vocal.docenteId, vocal.rol))
      })
      return
    }

    const reason = selected.titularErrors.includes('TITULAR_NO_DISPONIBLE')
      ? 'TITULAR_NO_DISPONIBLE'
      : selected.titularErrors.includes('DOCENTE_SUPERPUESTO')
        ? 'DOCENTE_SUPERPUESTO'
        : 'SIN_DOS_VOCALES_VALIDOS_EN_FECHA'
    const error = {
      code: reason,
      severity: 'critical',
      mesaId: mesa.id,
    }
    errors.push(error)
    unassignedMesas.push(createUnassignedMesa({
      mesa,
      reason,
      detail: 'La simulacion experimental no encontro fecha con tribunal completo.',
      errors: [error],
    }))
    cases.push(safeCaseRow({
      index,
      mode,
      mesa,
      reason,
      detail: selected.decision?.decisionReasons?.[0] ?? '',
      slot: selected.slot,
    }))
  })

  const plan = {
    plannedMesas,
    unassignedMesas,
    participaciones,
    errors,
    warnings,
  }
  const summary = summarizePlanLike({
    name: mode,
    evidenceType: 'experimental-simulation',
    plan,
    input,
    rejectedByReason,
    source: {
      assignmentOrder: mode,
      compactacionEjecutada: false,
      repairExecuted: false,
      note: 'Simulacion aislada: no reemplaza motor, no reproduce reparacion/compactacion completa.',
    },
  })

  return {
    mode,
    plan,
    summary,
    cases,
    rejectedByReason,
  }
}

function buildFlowDiagnostics() {
  return {
    detectedFlow: CURRENT_FLOW_TYPE,
    classification: [
      'VOCALS_FIRST_THEN_DATE',
      'REPAIR_AFTER_FAILURE',
    ],
    steps: [
      { order: 1, stage: 'BUILD_CANDIDATES', file: 'src/utils/examEngine/planning/buildCandidates.js', decision: 'materias y llamados requeridos' },
      { order: 2, stage: 'ASSIGN_TITULARES', file: 'src/utils/examEngine/planning/assignTitular.js', decision: 'titular obligatorio' },
      { order: 3, stage: 'BUILD_VOCAL_CANDIDATES', file: 'src/utils/examEngine/planning/buildVocalCandidates.js', decision: 'candidatos vocales sin fecha cuando mesa.fecha esta vacia' },
      { order: 4, stage: 'ASSIGN_VOCALES', file: 'src/utils/examEngine/planning/assignVocales.js', decision: 'asigna vocales y consume cupo mitad mas uno' },
      { order: 5, stage: 'REPAIR_TRIBUNALS', file: 'src/utils/examEngine/planning/repairTribunals.js', decision: 'intenta completar tribunales antes de fechar' },
      { order: 6, stage: 'VALIDATE_TRIBUNALS', file: 'src/utils/examEngine/validation/validateTribunals.js', decision: 'valida tribunal y cupo asignado' },
      { order: 7, stage: 'COMPACT_MESAS', file: 'src/utils/examEngine/planning/compactMesas.js', decision: 'compacta antes de fechas' },
      { order: 8, stage: 'PLAN_TENTATIVE_DATES', file: 'src/utils/examEngine/planning/planTentativeDates.js', decision: 'elige fecha y detecta disponibilidad/superposicion' },
    ],
    warningEmissionPoints: {
      VOCAL_NO_DISPONIBLE: 'src/utils/examEngine/planning/planTentativeDates.js:evaluateSlot',
      TITULAR_NO_DISPONIBLE: 'src/utils/examEngine/planning/planTentativeDates.js:evaluateSlot',
      DOCENTE_SUPERPUESTO: 'src/utils/examEngine/planning/planTentativeDates.js:evaluateSlot',
      TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA: 'src/utils/examEngine/planning/planTentativeDates.js:evaluateSlot',
      SIN_FECHA_VALIDA: 'src/utils/examEngine/planning/planTentativeDates.js',
      POCOS_CANDIDATOS_VOCALES: 'src/utils/examEngine/planning/assignVocales.js',
      REPARACION_SIN_CANDIDATOS_VALIDOS: 'src/utils/examEngine/planning/repairTribunals.js',
    },
  }
}

function chooseRecommendation(current = {}, experimental = []) {
  const best = [...experimental].sort((left, right) => (
    numberOrZero(right.summary.completionRate) - numberOrZero(left.summary.completionRate)
  ))[0]
  const currentRate = numberOrZero(current.summary?.completionRate)
  const bestRate = numberOrZero(best?.summary?.completionRate)

  if (best && bestRate > currentRate) {
    return 'Mantener la regla por horas catedra y avanzar con una estrategia date-aware en modo preview interno/auditoria antes de integrarla.'
  }

  return 'Mantener la regla por horas catedra, pero no integrar aun la estrategia experimental: auditar scoring conjunto con compactacion/reparacion antes de cambiar el motor.'
}

export function auditDateVocalAssignmentOrder({ snapshot, options = {} } = {}) {
  const safeSnapshot = cloneJson(snapshot ?? {})
  const input = buildRegularExamInputFromWorkspaceSnapshot(safeSnapshot)
  const current = buildCurrentOrderRun(input)
  const experimentalRuns = EXPERIMENTAL_MODES.map((mode) => runExperimentalMode({ mode, input }))
  const cases = experimentalRuns.flatMap((run) => run.cases).slice(0, options.maxCases ?? 500)
  const bestExperimental = experimentalRuns
    .map((run) => run.summary)
    .sort((left, right) => numberOrZero(right.completionRate) - numberOrZero(left.completionRate))[0]
  const plannedDelta = numberOrZero(bestExperimental?.totalPlanned) - numberOrZero(current.summary.totalPlanned)
  const sinFechaDelta = numberOrZero(bestExperimental?.mesasSinFecha) - numberOrZero(current.summary.mesasSinFecha)

  return {
    summary: {
      detectedFlow: CURRENT_FLOW_TYPE,
      currentCompletionRate: current.summary.completionRate,
      bestExperimentalMode: bestExperimental?.name ?? '',
      bestExperimentalCompletionRate: bestExperimental?.completionRate ?? 0,
      plannedDeltaVsCurrent: plannedDelta,
      sinFechaDeltaVsCurrent: sinFechaDelta,
      principalRegressionCause: 'VOCALS_ASSIGNED_BEFORE_DATE_AVAILABILITY',
      recommendation: chooseRecommendation(current, experimentalRuns),
    },
    flowDiagnostics: buildFlowDiagnostics(),
    modes: [
      current.summary,
      ...experimentalRuns.map((run) => run.summary),
    ],
    caseRows: cases,
    recommendations: [
      'No revertir la regla normativa por horas catedra.',
      'Mantener asistencia por dia como filtro obligatorio de elegibilidad.',
      'Mover la seleccion de vocales hacia una estrategia condicionada por fecha candidata.',
      'Antes de integrar, reproducir compactacion y reparacion dentro de la simulacion date-aware.',
    ],
    warnings: [
      'Los modos experimentales son simulaciones aisladas y no reemplazan el pipeline real.',
      'La comparacion puede diferir por no ejecutar compactacion/reparacion completa en los modos experimentales.',
    ],
    errors: [],
  }
}
