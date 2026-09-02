import { buildFeasibilityDiagnosis } from '../diagnostics/feasibility.js'
import {
  createParticipacionTribunal,
  isParticipacionVocalia,
  normalizeLlamado,
} from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { assignTitularesToCandidates } from '../planning/assignTitular.js'
import { buildExamTableCandidates } from '../planning/buildCandidates.js'
import { buildVocalCandidatesForMesas } from '../planning/buildVocalCandidates.js'
import { teacherIsAvailableOnDate } from '../rules/availability.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'
import { getLlamadosRequeridos } from '../rules/regularCalls.js'
import {
  buildTeacherSlotKey,
  selectDateAwareVocales,
} from '../planning/dateAwareVocalSelection.js'

export const JOINT_DATE_VOCAL_PLANNER_NAME = 'jointDateVocalPlanner'

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

function normalizeCaseKey(value = '') {
  return normalizeText(value || 'sin_dato').replaceAll(/[^a-z0-9]+/g, '_')
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

function getMesaVocalIds(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id].map(clean).filter(Boolean)
}

function countVocales(mesa = {}) {
  return getMesaVocalIds(mesa).length
}

function hasDate(mesa = {}) {
  return Boolean(clean(mesa.fecha ?? mesa.fechaIso))
}

function buildVocalCandidateIndex(mesas = [], docentes = [], config = {}) {
  const result = buildVocalCandidatesForMesas({
    mesasPreliminares: mesas,
    docentes,
    participacionesExistentes: [],
    config,
  })

  return result.mesasConCandidatos.reduce((map, entry = {}) => {
    map.set(clean(entry.mesaId), entry)
    return map
  }, new Map())
}

function buildCandidateCostByDocenteId(vocalCandidateIndex = new Map(), docentes = []) {
  const demand = new Map()
  vocalCandidateIndex.forEach((entry) => {
    asArray(entry.candidatosVocales)
      .filter((candidate) => candidate.valido)
      .forEach((candidate) => {
        const key = normalizeText(candidate.docenteId)
        if (!key) return
        demand.set(key, (demand.get(key) ?? 0) + 1)
      })
  })

  const costs = new Map()
  const docenteMap = buildDocenteMap(docentes)
  demand.forEach((candidateDemand, docenteKey) => {
    const docente = docenteMap.get(docenteKey)
    const limit = docente ? calcularLimiteVocaliasPorLlamado(docente) : 0
    costs.set(docenteKey, limit > 0 ? candidateDemand / limit : candidateDemand + 100)
  })
  return costs
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
    config,
    fechasDisponibles: asArray(input.fechasDisponibles).map(normalizeFechaDisponible),
    diagnosis,
    candidatesResult,
    titularResult,
  }
}

function getMesaDifficulty(mesa = {}, entry = null, slots = []) {
  const validCandidates = asArray(entry?.candidatosVocales).filter((candidate) => candidate.valido).length
  return {
    slotCount: slots.length,
    validCandidates,
    riskScore: numberOrZero(mesa.riskScore),
    anio: numberOrZero(mesa.anio),
  }
}

function sortMesasForJointPlanning(mesas = [], vocalCandidateIndex = new Map(), fechasDisponibles = []) {
  return [...mesas].sort((left, right) => {
    const leftScore = getMesaDifficulty(left, vocalCandidateIndex.get(clean(left.id)), getCandidateSlots(left, fechasDisponibles))
    const rightScore = getMesaDifficulty(right, vocalCandidateIndex.get(clean(right.id)), getCandidateSlots(right, fechasDisponibles))

    return (
      leftScore.slotCount - rightScore.slotCount ||
      leftScore.validCandidates - rightScore.validCandidates ||
      rightScore.riskScore - leftScore.riskScore ||
      rightScore.anio - leftScore.anio ||
      clean(left.id).localeCompare(clean(right.id))
    )
  })
}

function slotOccupancy(teacherSchedule = new Set(), slot = {}) {
  const suffix = `::${clean(slot.fecha)}::${normalizeText(slot.turno)}`
  return [...teacherSchedule].filter((key) => key.endsWith(suffix)).length
}

function scoreSlotDecision({
  decision = {},
  slot = {},
  teacherSchedule = new Set(),
  minimumVocalesToPlan = 1,
} = {}) {
  const selected = asArray(decision.selected)
  const selectedScore = selected.reduce((total, vocal) => total + numberOrZero(vocal.score), 0)
  const selectedCost = selected.reduce((total, vocal) => total + numberOrZero(vocal.planningCost), 0)
  const vocalCount = selected.length
  const enoughVocales = vocalCount >= minimumVocalesToPlan

  return (
    Number(vocalCount >= 2) * 100000 +
    Number(enoughVocales) * 50000 +
    vocalCount * 10000 +
    numberOrZero(decision.validCandidates) * 250 +
    selectedScore -
    selectedCost * 40 -
    slotOccupancy(teacherSchedule, slot) * 20 -
    Number(clean(slot.fecha).replaceAll('-', '')) / 100000000
  )
}

function selectBestJointDecision({
  mesa = {},
  slots = [],
  docentes = [],
  docenteMap = new Map(),
  participaciones = [],
  teacherSchedule = new Set(),
  vocalCandidateIndex = new Map(),
  candidateCostByDocenteId = new Map(),
  minimumVocalesToPlan = 1,
} = {}) {
  const titular = getDocenteById(docenteMap, mesa.titularId)
  const baseEntry = vocalCandidateIndex.get(clean(mesa.id)) ?? { candidatosVocales: [] }
  const attempted = []
  const rejectedByReason = {}

  slots.forEach((slot) => {
    if (!teacherCanAttendSlot(titular, slot)) {
      attempted.push({
        slot,
        valid: false,
        reason: 'TITULAR_NO_DISPONIBLE',
        score: Number.NEGATIVE_INFINITY,
      })
      return
    }

    if (teacherBusyOnSlot(teacherSchedule, mesa.titularId, slot)) {
      attempted.push({
        slot,
        valid: false,
        reason: 'DOCENTE_SUPERPUESTO',
        score: Number.NEGATIVE_INFINITY,
      })
      return
    }

    const decision = selectDateAwareVocales({
      mesa,
      fechaCandidata: slot,
      docentes,
      candidatosVocales: baseEntry.candidatosVocales,
      participaciones,
      teacherSchedule,
      candidateCostByDocenteId,
    })
    mergeCounts(rejectedByReason, decision.rejectedByReason)
    const vocalCount = asArray(decision.selected).length
    const valid = vocalCount >= minimumVocalesToPlan
    attempted.push({
      slot,
      decision,
      valid,
      reason: valid ? 'FECHA_Y_VOCALES_FACTIBLES' : 'SIN_VOCALES_MINIMOS_EN_FECHA',
      score: scoreSlotDecision({
        decision,
        slot,
        teacherSchedule,
        minimumVocalesToPlan,
      }),
    })
  })

  const selected = attempted
    .filter((entry) => entry.valid)
    .sort((left, right) => right.score - left.score)[0]

  return {
    selected: selected ?? null,
    attempted,
    rejectedByReason,
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

function createPlannedMesa({ mesa = {}, selected = {} } = {}) {
  const selectedVocales = asArray(selected.decision?.selected)
  const vocal1Id = selectedVocales[0]?.docenteId ?? null
  const vocal2Id = selectedVocales[1]?.docenteId ?? null
  const vocalCount = [vocal1Id, vocal2Id].filter(clean).length

  return {
    ...mesa,
    fecha: selected.slot.fecha,
    fechaIso: selected.slot.fecha,
    diaSemana: selected.slot.diaSemana,
    turno: selected.slot.turno,
    vocal1Id,
    vocal2Id,
    estado: vocalCount >= 2 ? 'FECHA_TENTATIVA' : 'FECHA_TENTATIVA_CON_ALERTAS',
    warnings: [
      ...asArray(mesa.warnings),
      ...(vocalCount < 2
        ? [{
            code: 'JOINT_PLANNER_TRIBUNAL_INCOMPLETO',
            severity: 'warning',
            mesaId: mesa.id,
            reason: 'La mesa tiene fecha y requiere revision por tribunal incompleto.',
          }]
        : []),
    ],
    errors: asArray(mesa.errors),
    metadata: {
      ...(mesa.metadata ?? {}),
      experimentalPlanner: JOINT_DATE_VOCAL_PLANNER_NAME,
      requiresManualReview: vocalCount < 2,
      selectedScore: selected.score,
      validCandidatesOnDate: selected.decision?.validCandidates ?? 0,
    },
  }
}

function createUnassignedMesa({ mesa = {}, reason = '', detail = '', attempted = [] } = {}) {
  return {
    ...mesa,
    estado: 'SIN_FECHA_TENTATIVA',
    fecha: '',
    fechaIso: '',
    reason,
    detail,
    errors: [{
      code: reason,
      severity: 'critical',
      mesaId: mesa.id,
    }],
    warnings: asArray(mesa.warnings),
    metadata: {
      ...(mesa.metadata ?? {}),
      experimentalPlanner: JOINT_DATE_VOCAL_PLANNER_NAME,
      attemptedSlots: attempted.length,
    },
  }
}

function createSafeCaseRow({ index, mesa = {}, reason = '', selected = null, attempted = [] } = {}) {
  return {
    caseId: `JOINT-${String(index + 1).padStart(4, '0')}`,
    carreraKey: normalizeCaseKey(mesa.carrera || mesa.carreraId),
    materiaKey: normalizeCaseKey(mesa.materia || mesa.materiaId),
    llamado: normalizeLlamado(mesa.llamado),
    reason,
    fecha: selected?.slot?.fecha ?? '',
    turno: selected?.slot?.turno ?? '',
    vocalesAsignados: selected?.decision?.selected?.length ?? 0,
    attemptedSlots: attempted.length,
  }
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

function detectCompactableCases(plannedMesas = []) {
  const groups = new Map()
  plannedMesas.forEach((mesa) => {
    const vocales = getMesaVocalIds(mesa).map(normalizeText).sort().join('+')
    const key = [
      normalizeLlamado(mesa.llamado),
      clean(mesa.fecha),
      normalizeText(mesa.turno),
      normalizeText(mesa.titularId),
      vocales,
    ].join('::')
    const rows = groups.get(key) ?? []
    rows.push(mesa)
    groups.set(key, rows)
  })

  return [...groups.values()]
    .filter((rows) => rows.length >= 2)
    .map((rows, index) => ({
      compactableId: `COMPACTABLE-${String(index + 1).padStart(3, '0')}`,
      count: rows.length,
      llamado: normalizeLlamado(rows[0].llamado),
      fecha: rows[0].fecha,
      turno: rows[0].turno,
      vocales: countVocales(rows[0]),
      reason: 'MISMO_TITULAR_FECHA_TURNO_Y_TRIBUNAL',
    }))
}

function summarizeResult({ plannedMesas, unassignedMesas, participaciones, docentes, rejectedByReason, localRepairs, compactableCases, durationMs }) {
  const allMesas = [...plannedMesas, ...unassignedMesas]
  const totalMesas = allMesas.length
  const completionRate = totalMesas > 0 ? plannedMesas.length / totalMesas : 0
  const issueCounts = countBy([
    ...plannedMesas.flatMap((mesa) => [...asArray(mesa.errors), ...asArray(mesa.warnings)]),
    ...unassignedMesas.flatMap((mesa) => [...asArray(mesa.errors), ...asArray(mesa.warnings)]),
  ], (issue) => clean(issue.code ?? issue.reason))
  const quota = buildQuotaSummary(docentes, participaciones)

  return {
    name: JOINT_DATE_VOCAL_PLANNER_NAME,
    evidenceType: 'experimental-planner',
    totalMesas,
    totalPlanned: plannedMesas.length,
    totalUnassigned: unassignedMesas.length,
    mesasSinFecha: allMesas.filter((mesa) => !hasDate(mesa)).length,
    completionRate: Number(completionRate.toFixed(4)),
    mesasCompletas: allMesas.filter((mesa) => countVocales(mesa) >= 2).length,
    mesasConUnVocal: allMesas.filter((mesa) => countVocales(mesa) === 1).length,
    mesasSinTribunal: allMesas.filter((mesa) => countVocales(mesa) === 0).length,
    vocalesNoDisponibles: numberOrZero(rejectedByReason.NO_ASISTE_EN_FECHA),
    titularesNoDisponibles: numberOrZero(issueCounts.TITULAR_NO_DISPONIBLE),
    superposicionesDocentes: numberOrZero(issueCounts.DOCENTE_SUPERPUESTO) + numberOrZero(rejectedByReason.DOCENTE_SUPERPUESTO),
    tribunalesIncompletos: numberOrZero(issueCounts.JOINT_PLANNER_TRIBUNAL_INCOMPLETO),
    docentesSobreutilizados: quota.docentesExcedidos,
    consumoCupo: quota,
    reparacionesLocalesIntentadas: localRepairs.attempted,
    reparacionesLocalesExitosas: localRepairs.successful,
    casosCompactables: compactableCases.length,
    durationMs: roundMs(durationMs),
    topCausasFallo: topEntries({
      ...issueCounts,
      ...Object.fromEntries(Object.entries(rejectedByReason).map(([key, value]) => [`RECHAZO_${key}`, value])),
    }),
  }
}

export function planWithJointDateVocalPlanner(input = {}, options = {}) {
  const startedAt = performanceNow()
  const minimumVocalesToPlan = Number.isFinite(Number(options.minimumVocalesToPlan))
    ? Number(options.minimumVocalesToPlan)
    : 1
  const base = buildBaseContext(input)
  const docenteMap = buildDocenteMap(base.docentes)
  const requiredCalls = getLlamadosRequeridos(base.config)
  const preliminaryMesas = base.titularResult.mesasPreliminares
    .filter((mesa) => requiredCalls.includes(normalizeLlamado(mesa.llamado)))
  const vocalCandidateIndex = buildVocalCandidateIndex(preliminaryMesas, base.docentes, base.config)
  const candidateCostByDocenteId = buildCandidateCostByDocenteId(vocalCandidateIndex, base.docentes)
  const mesas = sortMesasForJointPlanning(preliminaryMesas, vocalCandidateIndex, base.fechasDisponibles)
  const plannedMesas = []
  const unassignedMesas = []
  const participaciones = []
  const teacherSchedule = new Set()
  const rejectedByReason = {}
  const caseRows = []
  const localRepairs = {
    attempted: 0,
    successful: 0,
  }

  mesas.forEach((mesa, index) => {
    const slots = getCandidateSlots(mesa, base.fechasDisponibles)
    if (!slots.length) {
      const unassigned = createUnassignedMesa({
        mesa,
        reason: 'SIN_FECHA_VALIDA',
        detail: 'No hay fechas disponibles para llamado y turno.',
        attempted: [],
      })
      unassignedMesas.push(unassigned)
      caseRows.push(createSafeCaseRow({ index, mesa, reason: unassigned.reason }))
      return
    }

    const selection = selectBestJointDecision({
      mesa,
      slots,
      docentes: base.docentes,
      docenteMap,
      participaciones,
      teacherSchedule,
      vocalCandidateIndex,
      candidateCostByDocenteId,
      minimumVocalesToPlan,
    })
    mergeCounts(rejectedByReason, selection.rejectedByReason)

    if (selection.selected) {
      const plannedMesa = createPlannedMesa({ mesa, selected: selection.selected })
      const vocalCount = countVocales(plannedMesa)
      if (vocalCount < 2) localRepairs.attempted += 1
      if (vocalCount >= minimumVocalesToPlan && vocalCount < 2) localRepairs.successful += 1
      plannedMesas.push(plannedMesa)
      markTeacherSchedule(teacherSchedule, plannedMesa)
      asArray(selection.selected.decision?.selected).forEach((vocal) => {
        participaciones.push(createVocalParticipation(plannedMesa, vocal.docenteId, vocal.rol))
      })
      caseRows.push(createSafeCaseRow({
        index,
        mesa,
        reason: plannedMesa.metadata.requiresManualReview ? 'PLANIFICADA_CON_REVISION' : 'PLANIFICADA',
        selected: selection.selected,
        attempted: selection.attempted,
      }))
      return
    }

    const firstReason = selection.attempted.find((attempt) => attempt.reason === 'TITULAR_NO_DISPONIBLE')?.reason ??
      selection.attempted.find((attempt) => attempt.reason === 'DOCENTE_SUPERPUESTO')?.reason ??
      'SIN_VOCALES_MINIMOS_EN_FECHA'
    const unassigned = createUnassignedMesa({
      mesa,
      reason: firstReason,
      detail: 'El planificador conjunto no encontro fecha con vocales minimos.',
      attempted: selection.attempted,
    })
    unassignedMesas.push(unassigned)
    caseRows.push(createSafeCaseRow({
      index,
      mesa,
      reason: firstReason,
      attempted: selection.attempted,
    }))
  })

  const compactableCases = detectCompactableCases(plannedMesas)
  const durationMs = performanceNow() - startedAt
  const summary = summarizeResult({
    plannedMesas,
    unassignedMesas,
    participaciones,
    docentes: base.docentes,
    rejectedByReason,
    localRepairs,
    compactableCases,
    durationMs,
  })

  return {
    planner: JOINT_DATE_VOCAL_PLANNER_NAME,
    plannedMesas,
    unassignedMesas,
    participaciones,
    localRepairs,
    compactableCases,
    caseRows,
    rejectedByReason,
    summary,
    diagnostics: {
      minimumVocalesToPlan,
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      notes: [
        'Prototipo experimental read-only.',
        'No reemplaza el motor actual.',
        minimumVocalesToPlan > 0
          ? 'Planifica con al menos un vocal valido y marca revision manual si el tribunal queda incompleto.'
          : 'Planifica con titular disponible aunque falten vocales y marca revision manual si el tribunal queda incompleto.',
      ],
    },
  }
}
