import {
  createParticipacionTribunal,
  isParticipacionVocalia,
  normalizeLlamado,
} from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { teacherIsAvailableOnDate } from '../rules/availability.js'
import {
  getNivelAfinidadDocenteMesa,
  NIVELES_AFINIDAD,
} from '../rules/affinities.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'
import { buildTeacherSlotKey } from '../planning/dateAwareVocalSelection.js'

export const RESCHEDULE_TRIBUNAL_STATUS = Object.freeze({
  RESCHEDULED_COMPLETE: 'RESCHEDULED_COMPLETE',
  RESCHEDULED_MINIMUM_REVIEW: 'RESCHEDULED_MINIMUM_REVIEW',
  MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS: 'MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS',
})

const VOCAL_ROLES = ['VOCAL_1', 'VOCAL_2']
const AFFINITY_SCORE = {
  [NIVELES_AFINIDAD.MISMA_CARRERA]: 100,
  [NIVELES_AFINIDAD.MATERIA_HOMONIMA]: 96,
  [NIVELES_AFINIDAD.PRACTICA_TECNICA_MISMA_CARRERA]: 94,
  [NIVELES_AFINIDAD.FAMILIA_INGLES]: 90,
  [NIVELES_AFINIDAD.FAMILIA_INFORMATICA_TIC]: 88,
  [NIVELES_AFINIDAD.PRACTICA_PEDAGOGICA_TRANSVERSAL]: 84,
  [NIVELES_AFINIDAD.MATERIA_SIMILAR]: 78,
  [NIVELES_AFINIDAD.ESPECIALIDAD_DECLARADA]: 70,
  [NIVELES_AFINIDAD.IDONEIDAD_EXPLICITA]: 60,
  [NIVELES_AFINIDAD.SIN_AFINIDAD]: 0,
}

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

function clonePlain(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function countBy(items = [], getKey = (item) => item) {
  return items.reduce((counts, item) => {
    const key = clean(getKey(item)) || 'otro'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function mergeCounts(target = {}, source = {}) {
  Object.entries(source).forEach(([key, value]) => {
    target[key] = (target[key] ?? 0) + numberOrZero(value)
  })
  return target
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)
  return clean(docente.id ?? docente.docenteId ?? docente.teacherKey ?? docente.dni ?? docente.email ?? docente.nombre)
}

function getVocalIds(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id].map(clean).filter(Boolean)
}

function countVocales(mesa = {}) {
  return getVocalIds(mesa).length
}

function hasDate(mesa = {}) {
  return Boolean(clean(mesa.fecha ?? mesa.fechaIso))
}

function hasTitular(mesa = {}) {
  return Boolean(clean(mesa.titularId ?? mesa.titular_id ?? mesa.profesorTitular))
}

function getMesaDate(mesa = {}) {
  return clean(mesa.fecha ?? mesa.fechaIso)
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

function teacherIsActive(docente = {}) {
  if (!('activo' in docente) && !('active' in docente) && !('isActive' in docente)) return true
  return docente.activo !== false && docente.active !== false && docente.isActive !== false
}

function normalizeSlot(row = {}, mesa = {}) {
  return {
    fecha: clean(row.fecha ?? row.fechaIso ?? row.date),
    diaSemana: normalizeText(row.diaSemana ?? row.dia ?? row.day),
    turno: normalizeText(row.turno ?? row.shift ?? mesa.turno),
    llamado: normalizeLlamado(row.llamado ?? row.exam_call ?? row.callKey ?? mesa.llamado),
    disponible: row.disponible !== false && row.available !== false,
  }
}

function getCandidateSlots(mesa = {}, calendar = []) {
  const llamado = normalizeLlamado(mesa.llamado)
  const turno = normalizeText(mesa.turno)

  return asArray(calendar)
    .map((row) => normalizeSlot(row, mesa))
    .filter((slot) => slot.disponible && slot.fecha)
    .filter((slot) => !llamado || slot.llamado === llamado)
    .filter((slot) => !turno || slot.turno === turno)
    .sort((left, right) => (
      clean(left.fecha).localeCompare(clean(right.fecha)) ||
      clean(left.turno).localeCompare(clean(right.turno))
    ))
}

function getMesaRoleEntries(mesa = {}) {
  return [
    { rol: 'TITULAR', docenteId: clean(mesa.titularId) },
    { rol: 'VOCAL_1', docenteId: clean(mesa.vocal1Id) },
    { rol: 'VOCAL_2', docenteId: clean(mesa.vocal2Id) },
  ].filter((entry) => entry.docenteId)
}

function createParticipation(mesa = {}, docenteId = '', rol = '') {
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

function buildParticipacionesFromItems(items = [], excludeMesaId = '') {
  return asArray(items)
    .filter((mesa) => clean(mesa.id) !== clean(excludeMesaId))
    .flatMap((mesa) => (
      getMesaRoleEntries(mesa)
        .filter((entry) => isParticipacionVocalia({ rol: entry.rol }))
        .map((entry) => createParticipation(mesa, entry.docenteId, entry.rol))
    ))
}

function normalizeTeacherLoad(teacherLoad = [], excludeMesaId = '', knownMesaIds = new Set()) {
  const rows = Array.isArray(teacherLoad)
    ? teacherLoad
    : Array.isArray(teacherLoad?.participaciones)
      ? teacherLoad.participaciones
      : Array.isArray(teacherLoad?.vocalias)
        ? teacherLoad.vocalias
        : []

  return rows.filter((row) => {
    const mesaId = clean(row.mesaId ?? row.mesa_id ?? row.idMesa)
    if (mesaId && mesaId === clean(excludeMesaId)) return false
    if (mesaId && knownMesaIds.has(mesaId)) return false
    return true
  })
}

function participationKey(participacion = {}) {
  return [
    normalizeText(participacion.docenteId),
    clean(participacion.mesaId),
    clean(participacion.rol),
    normalizeLlamado(participacion.llamado),
  ].join('::')
}

function dedupeParticipaciones(participaciones = []) {
  const seen = new Set()
  const unique = []
  asArray(participaciones).forEach((participacion) => {
    const key = participationKey(participacion)
    if (seen.has(key)) return
    seen.add(key)
    unique.push({ ...participacion })
  })
  return unique
}

function buildTeacherSchedule(items = [], excludeMesaId = '') {
  const schedule = new Set()
  asArray(items)
    .filter((mesa) => clean(mesa.id) !== clean(excludeMesaId))
    .forEach((mesa) => {
      if (!hasDate(mesa)) return
      getMesaRoleEntries(mesa).forEach((entry) => {
        schedule.add(buildTeacherSlotKey(entry.docenteId, getMesaDate(mesa), mesa.turno))
      })
    })
  return schedule
}

function teacherHasScheduleConflict(schedule = new Set(), docenteId = '', slot = {}) {
  return schedule.has(buildTeacherSlotKey(docenteId, slot.fecha, slot.turno))
}

function markTeacherSchedule(schedule, mesa = {}) {
  getMesaRoleEntries(mesa).forEach((entry) => {
    schedule.add(buildTeacherSlotKey(entry.docenteId, getMesaDate(mesa), mesa.turno))
  })
}

function slotOccupancy(schedule = new Set(), slot = {}) {
  const suffix = `::${clean(slot.fecha)}::${normalizeText(slot.turno)}`
  return [...schedule].filter((key) => key.endsWith(suffix)).length
}

function getFutureAvailabilityCount(docente = {}, calendar = [], slot = {}) {
  return asArray(calendar)
    .map((row) => normalizeSlot(row, slot))
    .filter((candidateSlot) => candidateSlot.fecha >= clean(slot.fecha))
    .filter((candidateSlot) => teacherIsAvailableOnDate(docente, candidateSlot.fecha))
    .length
}

function getUsageRatio(docente = {}, docenteId = '', participaciones = [], llamado = '') {
  const limite = calcularLimiteVocaliasPorLlamado(docente)
  const usadas = contarVocaliasPorDocente(participaciones, docenteId, llamado)
  return limite > 0 ? usadas / limite : 999
}

function rejectReasonsToCause(reasons = []) {
  if (reasons.includes('NO_ASISTE_EN_FECHA')) return 'vocales_rechazados_por_no_asistir'
  if (reasons.includes('DOCENTE_SUPERPUESTO')) return 'vocales_rechazados_por_superposicion'
  if (reasons.includes('SUPERA_CUPO_HORAS_CATEDRA')) return 'vocales_rechazados_por_cupo'
  if (reasons.includes('SIN_AFINIDAD')) return 'vocales_rechazados_por_idoneidad'
  if (reasons.includes('ES_TITULAR_DE_LA_MESA')) return 'vocales_rechazados_por_ser_titular'
  if (reasons.includes('VOCAL_DUPLICADO')) return 'vocales_rechazados_por_duplicacion'
  if (reasons.includes('TITULAR_NO_ASISTE_EN_FECHA')) return 'titulares_rechazados_por_no_asistir'
  if (reasons.includes('TITULAR_SUPERPUESTO')) return 'titulares_rechazados_por_superposicion'
  return 'otros_rechazos'
}

function evaluateVocalForSlot({
  docente = {},
  mesa = {},
  slot = {},
  participaciones = [],
  teacherSchedule = new Set(),
  selectedIds = new Set(),
  calendar = [],
} = {}) {
  const docenteId = getDocenteId(docente)
  const reasons = []

  if (!docenteId) reasons.push('DOCENTE_NO_EXISTE')
  if (!teacherIsActive(docente)) reasons.push('DOCENTE_INACTIVO')
  if (normalizeText(docenteId) === normalizeText(mesa.titularId)) reasons.push('ES_TITULAR_DE_LA_MESA')
  if (selectedIds.has(normalizeText(docenteId))) reasons.push('VOCAL_DUPLICADO')
  if (!teacherIsAvailableOnDate(docente, slot.fecha)) reasons.push('NO_ASISTE_EN_FECHA')
  if (!teacherMatchesTurno(docente, slot.turno)) reasons.push('TURNO_INCOMPATIBLE')
  if (teacherHasScheduleConflict(teacherSchedule, docenteId, slot)) reasons.push('DOCENTE_SUPERPUESTO')

  const limite = calcularLimiteVocaliasPorLlamado(docente)
  const vocaliasAsignadas = contarVocaliasPorDocente(participaciones, docenteId, slot.llamado)
  if (!(limite > 0 && vocaliasAsignadas < limite)) reasons.push('SUPERA_CUPO_HORAS_CATEDRA')

  const affinity = getNivelAfinidadDocenteMesa(docente, mesa)
  if (!affinity.afinidadValida) reasons.push('SIN_AFINIDAD')

  const usageRatio = getUsageRatio(docente, docenteId, participaciones, slot.llamado)
  const futureAvailability = getFutureAvailabilityCount(docente, calendar, slot)
  const valid = reasons.length === 0
  const affinityScore = AFFINITY_SCORE[affinity.nivelAfinidad] ?? 0

  return {
    docenteId,
    valid,
    reasons: [...new Set(reasons)],
    cause: valid ? '' : rejectReasonsToCause(reasons),
    affinityLevel: affinity.nivelAfinidad,
    affinityScore,
    usageRatio: Number(usageRatio.toFixed(4)),
    futureAvailability,
    limite,
    vocaliasAsignadas,
    score: affinityScore * 1000 + futureAvailability * 20 - usageRatio * 200 - vocaliasAsignadas * 25,
  }
}

function titularCanUseSlot({ titular = null, mesa = {}, slot = {}, teacherSchedule = new Set() } = {}) {
  if (!titular || !hasTitular(mesa)) {
    return {
      valid: false,
      reasons: ['SIN_TITULAR'],
      rejectedByCause: { sin_titular: 1 },
    }
  }

  const reasons = []
  if (!teacherIsAvailableOnDate(titular, slot.fecha)) reasons.push('TITULAR_NO_ASISTE_EN_FECHA')
  if (!teacherMatchesTurno(titular, slot.turno)) reasons.push('TITULAR_TURNO_INCOMPATIBLE')
  if (teacherHasScheduleConflict(teacherSchedule, mesa.titularId, slot)) reasons.push('TITULAR_SUPERPUESTO')

  return {
    valid: reasons.length === 0,
    reasons,
    rejectedByCause: countBy(reasons, rejectReasonsToCause),
  }
}

function selectVocalesForSlot({
  mesa = {},
  slot = {},
  teachers = [],
  participaciones = [],
  teacherSchedule = new Set(),
  calendar = [],
} = {}) {
  const selected = []
  const selectedIds = new Set()
  const rejectedByCause = {}
  const evaluations = asArray(teachers)
    .map((docente) => evaluateVocalForSlot({
      docente,
      mesa,
      slot,
      participaciones,
      teacherSchedule,
      selectedIds,
      calendar,
    }))
    .sort((left, right) => (
      Number(right.valid) - Number(left.valid) ||
      right.score - left.score ||
      left.usageRatio - right.usageRatio ||
      right.futureAvailability - left.futureAvailability ||
      left.docenteId.localeCompare(right.docenteId)
    ))

  evaluations.forEach((candidate) => {
    if (!candidate.valid || selected.length >= 2) return
    const docenteKey = normalizeText(candidate.docenteId)
    if (!docenteKey || selectedIds.has(docenteKey)) return
    selectedIds.add(docenteKey)
    selected.push({
      ...candidate,
      rol: VOCAL_ROLES[selected.length],
    })
  })

  evaluations
    .filter((candidate) => !candidate.valid)
    .forEach((candidate) => {
      rejectedByCause[candidate.cause] = (rejectedByCause[candidate.cause] ?? 0) + 1
    })

  return {
    selected,
    evaluations,
    rejectedByCause,
  }
}

function scoreDecision({ slot = {}, selected = [], teacherSchedule = new Set(), originalDate = '' } = {}) {
  const vocalCount = selected.length
  const affinity = selected.reduce((total, candidate) => total + numberOrZero(candidate.affinityScore), 0)
  const usagePenalty = selected.reduce((total, candidate) => total + numberOrZero(candidate.usageRatio), 0) * 200
  const futureAvailability = selected.reduce((total, candidate) => total + numberOrZero(candidate.futureAvailability), 0)
  const congestionPenalty = slotOccupancy(teacherSchedule, slot) * 80
  const dateChangePenalty = originalDate && clean(slot.fecha) !== clean(originalDate) ? 120 : 0
  const naturalDateBonus = originalDate && clean(slot.fecha) === clean(originalDate) ? 60 : 0

  return (
    Number(vocalCount >= 2) * 100000 +
    vocalCount * 10000 +
    affinity * 100 -
    usagePenalty +
    futureAvailability * 25 -
    congestionPenalty -
    dateChangePenalty +
    naturalDateBonus -
    Number(clean(slot.fecha).replaceAll('-', '')) / 100000000
  )
}

function chooseBestDecision({
  mesa = {},
  teachers = [],
  calendar = [],
  participaciones = [],
  teacherSchedule = new Set(),
  minimumVocalCount = 1,
} = {}) {
  const slots = getCandidateSlots(mesa, calendar)
  const originalDate = getMesaDate(mesa)
  const titular = teachers.find((docente) => normalizeText(getDocenteId(docente)) === normalizeText(mesa.titularId))
  const attempts = []
  const rejectedByCause = {}

  slots.forEach((slot) => {
    const titularDecision = titularCanUseSlot({ titular, mesa, slot, teacherSchedule })
    mergeCounts(rejectedByCause, titularDecision.rejectedByCause)

    if (!titularDecision.valid) {
      attempts.push({
        slot,
        valid: false,
        selected: [],
        rejectedByCause: titularDecision.rejectedByCause,
        reason: titularDecision.reasons[0] ?? 'TITULAR_NO_VIABLE',
        score: Number.NEGATIVE_INFINITY,
      })
      return
    }

    const vocalDecision = selectVocalesForSlot({
      mesa,
      slot,
      teachers,
      participaciones,
      teacherSchedule,
      calendar,
    })
    mergeCounts(rejectedByCause, vocalDecision.rejectedByCause)

    const valid = vocalDecision.selected.length >= minimumVocalCount
    attempts.push({
      slot,
      valid,
      selected: vocalDecision.selected,
      rejectedByCause: vocalDecision.rejectedByCause,
      reason: valid ? 'FECHA_Y_TRIBUNAL_FACTIBLE' : 'SIN_VOCALES_MINIMOS_EN_FECHA',
      score: valid
        ? scoreDecision({
            mesa,
            slot,
            selected: vocalDecision.selected,
            teacherSchedule,
            originalDate,
          })
        : Number.NEGATIVE_INFINITY,
    })
  })

  const best = attempts
    .filter((attempt) => attempt.valid)
    .sort((left, right) => right.score - left.score)[0] ?? null

  return {
    best,
    attempts,
    rejectedByCause,
  }
}

function createRescheduledMesa({ mesa = {}, decision = {}, status = '' } = {}) {
  const selected = asArray(decision.selected)
  const next = {
    ...mesa,
    fecha: decision.slot.fecha,
    fechaIso: decision.slot.fecha,
    diaSemana: decision.slot.diaSemana,
    turno: decision.slot.turno,
    vocal1Id: selected[0]?.docenteId ?? null,
    vocal2Id: selected[1]?.docenteId ?? null,
    estado: status === RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_COMPLETE
      ? 'FECHA_TENTATIVA'
      : 'FECHA_TENTATIVA_CON_ALERTAS',
    warnings: asArray(mesa.warnings).map((warning) => ({ ...warning })),
    errors: asArray(mesa.errors).map((error) => ({ ...error })),
    metadata: {
      ...(mesa.metadata ?? {}),
      rescheduleStatus: status,
      requiresManualReview: status !== RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_COMPLETE,
      rescheduleScore: decision.score,
    },
  }

  if (status === RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_MINIMUM_REVIEW) {
    next.warnings.push({
      code: RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_MINIMUM_REVIEW,
      severity: 'warning',
      mesaId: next.id,
      reason: 'Mesa reprogramada con un vocal valido; requiere revision institucional.',
    })
  }

  return next
}

function createManualMesa(mesa = {}) {
  return {
    ...mesa,
    warnings: [
      ...asArray(mesa.warnings),
      {
        code: RESCHEDULE_TRIBUNAL_STATUS.MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS,
        severity: 'warning',
        mesaId: mesa.id,
        reason: 'No se encontro combinacion factible de fecha y vocales.',
      },
    ],
    metadata: {
      ...(mesa.metadata ?? {}),
      rescheduleStatus: RESCHEDULE_TRIBUNAL_STATUS.MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS,
      requiresManualReview: true,
    },
  }
}

function normalizeCaseKey(value = '') {
  return normalizeText(value || 'sin_dato').replaceAll(/[^a-z0-9]+/g, '_')
}

function createCase({ index, mesa = {}, source = 'planned', oldDate = '', decision = null, status = '', rejectedByCause = {} } = {}) {
  const newDate = decision?.slot?.fecha ?? ''
  return {
    caseId: `RESCHEDULE-${String(index + 1).padStart(4, '0')}`,
    mesaId: clean(mesa.id),
    source,
    carreraKey: normalizeCaseKey(mesa.carrera || mesa.carreraId),
    materiaKey: normalizeCaseKey(mesa.materia || mesa.materiaId),
    llamado: normalizeLlamado(mesa.llamado),
    oldFecha: clean(oldDate),
    newFecha: clean(newDate),
    turno: normalizeText(decision?.slot?.turno ?? mesa.turno),
    status,
    selectedCount: asArray(decision?.selected).length,
    changedDate: Boolean(oldDate && newDate && clean(oldDate) !== clean(newDate)),
    rejectedByCause,
  }
}

function shouldTryPlannedMesa(mesa = {}) {
  return hasTitular(mesa) && countVocales(mesa) < 2
}

function shouldTryUnplannedMesa(mesa = {}) {
  return hasTitular(mesa)
}

function summarize({ plannedItems = [], unplannedItems = [], cases = [], rejectedByCause = {}, durationMs = 0 } = {}) {
  const statusCounts = countBy(cases, (item) => item.status)
  return {
    totalPlannedItems: plannedItems.length,
    totalUnplannedItems: unplannedItems.length,
    rescheduleAttempts: cases.length,
    rescheduledComplete: numberOrZero(statusCounts[RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_COMPLETE]),
    rescheduledMinimumReview: numberOrZero(statusCounts[RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_MINIMUM_REVIEW]),
    manualReviewNoFeasibleDateVocals: numberOrZero(statusCounts[RESCHEDULE_TRIBUNAL_STATUS.MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS]),
    successfulReschedules: cases.filter((item) => [
      RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_COMPLETE,
      RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_MINIMUM_REVIEW,
    ].includes(item.status)).length,
    dateChangesPerformed: cases.filter((item) => item.changedDate).length,
    successfulDateChanges: cases.filter((item) => item.changedDate && [
      RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_COMPLETE,
      RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_MINIMUM_REVIEW,
    ].includes(item.status)).length,
    finalIncompleteTribunals: plannedItems.filter((mesa) => hasDate(mesa) && hasTitular(mesa) && countVocales(mesa) < 2).length,
    rejectedByCause,
    durationMs,
  }
}

export function rescheduleIncompleteTribunals({
  plannedItems = [],
  unplannedItems = [],
  teachers = [],
  calendar = [],
  teacherLoad = [],
  options = {},
} = {}) {
  const startedAt = Date.now()
  const minimumVocalCount = Number(options.minimumVocalCount) === 2 ? 2 : 1
  const includeUnplanned = options.includeUnplanned === true
  const repairedItems = asArray(plannedItems).map(clonePlain)
  const remainingUnplanned = asArray(unplannedItems).map(clonePlain)
  const knownMesaIds = new Set([
    ...repairedItems,
    ...remainingUnplanned,
  ].map((mesa) => clean(mesa.id)).filter(Boolean))
  const cases = []
  const warnings = []
  const errors = []
  const rejectedByCause = {}

  repairedItems.forEach((mesa, index) => {
    if (!shouldTryPlannedMesa(mesa)) return

    const participaciones = dedupeParticipaciones([
      ...buildParticipacionesFromItems(repairedItems, mesa.id),
      ...normalizeTeacherLoad(teacherLoad, mesa.id, knownMesaIds),
    ])
    const teacherSchedule = buildTeacherSchedule(repairedItems, mesa.id)
    const decision = chooseBestDecision({
      mesa,
      teachers,
      calendar,
      participaciones,
      teacherSchedule,
      minimumVocalCount,
    })
    mergeCounts(rejectedByCause, decision.rejectedByCause)

    const selectedCount = asArray(decision.best?.selected).length
    const status = selectedCount >= 2
      ? RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_COMPLETE
      : selectedCount >= minimumVocalCount
        ? RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_MINIMUM_REVIEW
        : RESCHEDULE_TRIBUNAL_STATUS.MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS

    if (decision.best && status !== RESCHEDULE_TRIBUNAL_STATUS.MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS) {
      const nextMesa = createRescheduledMesa({ mesa, decision: decision.best, status })
      repairedItems[index] = nextMesa
      decision.best.selected.forEach((candidate) => {
        participaciones.push(createParticipation(nextMesa, candidate.docenteId, candidate.rol))
      })
      markTeacherSchedule(teacherSchedule, nextMesa)
    } else {
      repairedItems[index] = createManualMesa(mesa)
    }

    cases.push(createCase({
      index: cases.length,
      mesa,
      source: 'planned',
      oldDate: getMesaDate(mesa),
      decision: decision.best,
      status,
      rejectedByCause: decision.best?.rejectedByCause ?? decision.rejectedByCause,
    }))
  })

  if (includeUnplanned) {
    remainingUnplanned.forEach((mesa, index) => {
      if (!shouldTryUnplannedMesa(mesa)) return

      const participaciones = dedupeParticipaciones([
        ...buildParticipacionesFromItems(repairedItems),
        ...normalizeTeacherLoad(teacherLoad, mesa.id, knownMesaIds),
      ])
      const teacherSchedule = buildTeacherSchedule(repairedItems)
      const decision = chooseBestDecision({
        mesa,
        teachers,
        calendar,
        participaciones,
        teacherSchedule,
        minimumVocalCount,
      })
      mergeCounts(rejectedByCause, decision.rejectedByCause)

      const selectedCount = asArray(decision.best?.selected).length
      const status = selectedCount >= 2
        ? RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_COMPLETE
        : selectedCount >= minimumVocalCount
          ? RESCHEDULE_TRIBUNAL_STATUS.RESCHEDULED_MINIMUM_REVIEW
          : RESCHEDULE_TRIBUNAL_STATUS.MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS

      if (decision.best && status !== RESCHEDULE_TRIBUNAL_STATUS.MANUAL_REVIEW_NO_FEASIBLE_DATE_VOCALS) {
        const nextMesa = createRescheduledMesa({ mesa, decision: decision.best, status })
        repairedItems.push(nextMesa)
        remainingUnplanned[index] = null
      } else {
        remainingUnplanned[index] = createManualMesa(mesa)
      }

      cases.push(createCase({
        index: cases.length,
        mesa,
        source: 'unplanned',
        oldDate: getMesaDate(mesa),
        decision: decision.best,
        status,
        rejectedByCause: decision.best?.rejectedByCause ?? decision.rejectedByCause,
      }))
    })
  }

  const finalUnplanned = remainingUnplanned.filter(Boolean)
  const participaciones = dedupeParticipaciones([
    ...buildParticipacionesFromItems(repairedItems),
    ...normalizeTeacherLoad(teacherLoad, '', knownMesaIds),
  ])
  const durationMs = Date.now() - startedAt

  return {
    plannedItems: repairedItems,
    unplannedItems: finalUnplanned,
    participaciones,
    cases,
    summary: summarize({
      plannedItems: repairedItems,
      unplannedItems: finalUnplanned,
      cases,
      rejectedByCause,
      durationMs,
    }),
    warnings,
    errors,
    diagnostics: {
      safeToReplaceLegacy: false,
      readyForOfficialGeneration: false,
      includeUnplanned,
      minimumVocalCount,
    },
  }
}
