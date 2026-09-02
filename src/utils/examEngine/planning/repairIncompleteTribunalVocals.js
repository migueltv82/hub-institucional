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
import { TEACHER_ASSIGNMENT_RULE_MODES } from '../rules/calculateTeacherAssignmentLimit.js'
import { buildTeacherSlotKey } from '../planning/dateAwareVocalSelection.js'

export const VOCAL_REPAIR_STATUS = Object.freeze({
  COMPLETE_TRIBUNAL: 'COMPLETE_TRIBUNAL',
  MINIMUM_TRIBUNAL_REVIEW: 'MINIMUM_TRIBUNAL_REVIEW',
  MANUAL_VOCAL_REVIEW: 'MANUAL_VOCAL_REVIEW',
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

function countBy(items = [], getKey = (item) => item) {
  return items.reduce((counts, item) => {
    const key = clean(getKey(item)) || 'otro'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function clonePlain(value) {
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

function buildDocenteMap(teachers = []) {
  return asArray(teachers).reduce((map, docente) => {
    getDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
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

function slotFromMesa(mesa = {}) {
  return {
    fecha: clean(mesa.fecha ?? mesa.fechaIso),
    turno: normalizeText(mesa.turno),
    llamado: normalizeLlamado(mesa.llamado),
  }
}

function getMesaRoleEntries(mesa = {}) {
  return [
    { rol: 'TITULAR', docenteId: clean(mesa.titularId) },
    { rol: 'VOCAL_1', docenteId: clean(mesa.vocal1Id) },
    { rol: 'VOCAL_2', docenteId: clean(mesa.vocal2Id) },
  ].filter((entry) => entry.docenteId)
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

function buildParticipacionesFromItems(items = []) {
  return asArray(items).flatMap((mesa) => (
    getMesaRoleEntries(mesa)
      .filter((entry) => isParticipacionVocalia({ rol: entry.rol }))
      .map((entry) => createParticipation(mesa, entry.docenteId, entry.rol))
  ))
}

function normalizeTeacherLoad(teacherLoad = []) {
  if (Array.isArray(teacherLoad)) return teacherLoad
  if (Array.isArray(teacherLoad?.participaciones)) return teacherLoad.participaciones
  if (Array.isArray(teacherLoad?.vocalias)) return teacherLoad.vocalias
  return []
}

function buildTeacherSchedule(items = []) {
  const schedule = new Set()
  asArray(items).forEach((mesa) => {
    if (!hasDate(mesa)) return
    getMesaRoleEntries(mesa).forEach((entry) => {
      schedule.add(buildTeacherSlotKey(entry.docenteId, clean(mesa.fecha ?? mesa.fechaIso), mesa.turno))
    })
  })
  return schedule
}

function markTeacherSchedule(schedule, mesa = {}, docenteId = '') {
  schedule.add(buildTeacherSlotKey(docenteId, clean(mesa.fecha ?? mesa.fechaIso), mesa.turno))
}

function teacherHasScheduleConflict(schedule = new Set(), docenteId = '', mesa = {}) {
  return schedule.has(buildTeacherSlotKey(docenteId, clean(mesa.fecha ?? mesa.fechaIso), mesa.turno))
}

function getFutureAvailabilityCount(docente = {}, calendar = [], mesa = {}) {
  const currentDate = clean(mesa.fecha ?? mesa.fechaIso)
  return asArray(calendar)
    .filter((slot) => clean(slot.fecha ?? slot.fechaIso ?? slot.date) >= currentDate)
    .filter((slot) => teacherIsAvailableOnDate(docente, clean(slot.fecha ?? slot.fechaIso ?? slot.date)))
    .length
}

function buildDemandByTeacher({ plannedItems = [], teachers = [] } = {}) {
  const counts = new Map()
  const docenteMap = buildDocenteMap(teachers)

  asArray(plannedItems)
    .filter((mesa) => hasDate(mesa) && hasTitular(mesa) && countVocales(mesa) < 2)
    .forEach((mesa) => {
      teachers.forEach((docente) => {
        const docenteId = getDocenteId(docente)
        if (!docenteId || normalizeText(docenteId) === normalizeText(mesa.titularId)) return
        const affinity = getNivelAfinidadDocenteMesa(docenteMap.get(normalizeText(docenteId)) ?? docente, mesa)
        if (!affinity.afinidadValida) return
        const key = normalizeText(docenteId)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      })
    })

  return counts
}

function getUsageRatio(docente = {}, docenteId = '', participaciones = [], llamado = '') {
  const limite = calcularLimiteVocaliasPorLlamado(docente, {
    ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
  })
  const usadas = contarVocaliasPorDocente(participaciones, docenteId, llamado)
  return limite > 0 ? usadas / limite : 999
}

function rejectReasonsToCause(reasons = []) {
  if (reasons.includes('NO_ASISTE_EN_FECHA')) return 'vocales_rechazados_por_no_asistir'
  if (reasons.includes('SUPERA_CUPO_HORAS_CATEDRA')) return 'vocales_rechazados_por_cupo'
  if (reasons.includes('DOCENTE_SUPERPUESTO')) return 'vocales_rechazados_por_superposicion'
  if (reasons.includes('SIN_AFINIDAD') || reasons.includes('CARRERA_INCOMPATIBLE')) {
    return 'vocales_rechazados_por_idoneidad'
  }
  if (reasons.includes('ES_TITULAR_DE_LA_MESA')) return 'vocales_rechazados_por_ser_titular'
  if (reasons.includes('VOCAL_DUPLICADO')) return 'vocales_rechazados_por_duplicacion'
  return 'otros_rechazos'
}

export function evaluateVocalRepairCandidates({
  mesa = {},
  teachers = [],
  calendar = [],
  participaciones = [],
  teacherSchedule = new Set(),
  demandByTeacher = new Map(),
} = {}) {
  const slot = slotFromMesa(mesa)
  const usedIds = new Set([
    mesa.titularId,
    mesa.vocal1Id,
    mesa.vocal2Id,
  ].map(normalizeText).filter(Boolean))

  return asArray(teachers)
    .map((docente) => {
      const docenteId = getDocenteId(docente)
      const reasons = []

      if (!docenteId) reasons.push('DOCENTE_NO_EXISTE')
      if (!teacherIsActive(docente)) reasons.push('DOCENTE_INACTIVO')
      if (normalizeText(docenteId) === normalizeText(mesa.titularId)) reasons.push('ES_TITULAR_DE_LA_MESA')
      if (usedIds.has(normalizeText(docenteId)) && normalizeText(docenteId) !== normalizeText(mesa.titularId)) {
        reasons.push('VOCAL_DUPLICADO')
      }
      if (!teacherIsAvailableOnDate(docente, slot.fecha)) reasons.push('NO_ASISTE_EN_FECHA')
      if (!teacherMatchesTurno(docente, slot.turno)) reasons.push('TURNO_INCOMPATIBLE')
      if (teacherHasScheduleConflict(teacherSchedule, docenteId, mesa)) reasons.push('DOCENTE_SUPERPUESTO')

      const limite = calcularLimiteVocaliasPorLlamado(docente, {
        ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
      })
      const vocaliasAsignadas = contarVocaliasPorDocente(participaciones, docenteId, slot.llamado)
      if (!(limite > 0 && vocaliasAsignadas < limite)) reasons.push('SUPERA_CUPO_HORAS_CATEDRA')

      const affinity = getNivelAfinidadDocenteMesa(docente, mesa, { requireCareerCompatibility: true })
      if (!affinity.afinidadValida) {
        reasons.push(affinity.nivelAfinidad === NIVELES_AFINIDAD.CARRERA_INCOMPATIBLE
          ? 'CARRERA_INCOMPATIBLE'
          : 'SIN_AFINIDAD')
      }

      const affinityScore = AFFINITY_SCORE[affinity.nivelAfinidad] ?? 0
      const usageRatio = getUsageRatio(docente, docenteId, participaciones, slot.llamado)
      const futureAvailability = getFutureAvailabilityCount(docente, calendar, mesa)
      const demand = numberOrZero(demandByTeacher.get(normalizeText(docenteId)))
      const valid = reasons.length === 0
      const score = (
        affinityScore * 1000 +
        futureAvailability * 20 -
        usageRatio * 200 -
        demand * 5 -
        vocaliasAsignadas * 25
      )

      return {
        docenteId,
        valid,
        reasons: [...new Set(reasons)],
        cause: valid ? '' : rejectReasonsToCause(reasons),
        affinityLevel: affinity.nivelAfinidad,
        score,
        usageRatio: Number(usageRatio.toFixed(4)),
        futureAvailability,
        demand,
        limite,
        vocaliasAsignadas,
      }
    })
    .sort((left, right) => (
      Number(right.valid) - Number(left.valid) ||
      right.score - left.score ||
      left.usageRatio - right.usageRatio ||
      right.futureAvailability - left.futureAvailability ||
      left.docenteId.localeCompare(right.docenteId)
    ))
}

function fillMissingRoles(mesa = {}, selected = []) {
  const roles = VOCAL_ROLES.filter((rol) => {
    if (rol === 'VOCAL_1') return !clean(mesa.vocal1Id)
    return !clean(mesa.vocal2Id)
  })
  const next = {
    ...mesa,
    warnings: asArray(mesa.warnings).map((warning) => ({ ...warning })),
    errors: asArray(mesa.errors).map((error) => ({ ...error })),
    metadata: {
      ...(mesa.metadata ?? {}),
    },
  }

  selected.forEach((candidate, index) => {
    const role = roles[index]
    if (role === 'VOCAL_1') next.vocal1Id = candidate.docenteId
    if (role === 'VOCAL_2') next.vocal2Id = candidate.docenteId
  })

  return next
}

function createRepairRecord({ mesa = {}, status, selected = [], attempted = 0, rejectedByCause = {} } = {}) {
  return {
    mesaId: clean(mesa.id),
    status,
    selectedCount: selected.length,
    attemptedCandidates: attempted,
    rejectedByCause,
    requiresManualReview: status !== VOCAL_REPAIR_STATUS.COMPLETE_TRIBUNAL,
  }
}

function safeCaseRow({ mesa = {}, status = '', selected = [], rejectedByCause = {} } = {}) {
  return {
    mesaId: clean(mesa.id),
    carreraKey: normalizeText(mesa.carrera || mesa.carreraId || 'sin_carrera').replaceAll(/[^a-z0-9]+/g, '_'),
    materiaKey: normalizeText(mesa.materia || mesa.materiaId || 'sin_materia').replaceAll(/[^a-z0-9]+/g, '_'),
    llamado: normalizeLlamado(mesa.llamado),
    fecha: clean(mesa.fecha ?? mesa.fechaIso),
    turno: normalizeText(mesa.turno),
    status,
    selectedCount: selected.length,
    rejectedByCause,
  }
}

function summarize({ initialPlanned, repairedItems, repairs, rejectedByCause, durationMs }) {
  return {
    totalPlannedItems: repairedItems.length,
    initialIncompleteTribunals: asArray(initialPlanned).filter((mesa) => hasDate(mesa) && hasTitular(mesa) && countVocales(mesa) < 2).length,
    finalIncompleteTribunals: repairedItems.filter((mesa) => hasDate(mesa) && hasTitular(mesa) && countVocales(mesa) < 2).length,
    repairedWithTwoVocales: repairs.filter((repair) => (
      repair.status === VOCAL_REPAIR_STATUS.COMPLETE_TRIBUNAL &&
      numberOrZero(repair.selectedCount) > 0
    )).length,
    repairedWithOneVocal: repairs.filter((repair) => (
      repair.status === VOCAL_REPAIR_STATUS.MINIMUM_TRIBUNAL_REVIEW &&
      numberOrZero(repair.selectedCount) > 0
    )).length,
    minimumReviewExistingOneVocal: repairs.filter((repair) => (
      repair.status === VOCAL_REPAIR_STATUS.MINIMUM_TRIBUNAL_REVIEW &&
      numberOrZero(repair.selectedCount) === 0
    )).length,
    manualVocalReview: repairs.filter((repair) => repair.status === VOCAL_REPAIR_STATUS.MANUAL_VOCAL_REVIEW).length,
    repairAttempts: repairs.length,
    successfulRepairs: repairs.filter((repair) => (
      repair.status !== VOCAL_REPAIR_STATUS.MANUAL_VOCAL_REVIEW &&
      numberOrZero(repair.selectedCount) > 0
    )).length,
    rejectedByCause,
    durationMs,
  }
}

export function repairIncompleteTribunalVocals({
  plannedItems = [],
  unplannedItems = [],
  teachers = [],
  calendar = [],
  teacherLoad = [],
  options = {},
} = {}) {
  const startedAt = Date.now()
  const minimumVocalCount = Number(options.minimumVocalCount) === 2 ? 2 : 1
  const repairedItems = asArray(plannedItems).map(clonePlain)
  const unplanned = asArray(unplannedItems).map(clonePlain)
  const participaciones = dedupeParticipaciones([
    ...buildParticipacionesFromItems(repairedItems),
    ...normalizeTeacherLoad(teacherLoad),
  ])
  const teacherSchedule = buildTeacherSchedule(repairedItems)
  const demandByTeacher = buildDemandByTeacher({ plannedItems: repairedItems, teachers })
  const repairs = []
  const cases = []
  const rejectedByCause = {}
  const warnings = []
  const errors = []

  repairedItems.forEach((mesa, index) => {
    if (!hasDate(mesa) || !hasTitular(mesa) || countVocales(mesa) >= 2) return

    const evaluations = evaluateVocalRepairCandidates({
      mesa,
      teachers,
      calendar,
      participaciones,
      teacherSchedule,
      demandByTeacher,
    })
    const validCandidates = evaluations.filter((candidate) => candidate.valid)
    const selected = []

    for (const candidate of validCandidates) {
      if (selected.length >= 2 - countVocales(mesa)) break
      const simulatedParticipaciones = [
        ...participaciones,
        ...selected.map((selectedCandidate, selectedIndex) => createParticipation(
          mesa,
          selectedCandidate.docenteId,
          VOCAL_ROLES.filter((rol) => (rol === 'VOCAL_1' ? !clean(mesa.vocal1Id) : !clean(mesa.vocal2Id)))[selectedIndex],
        )),
      ]
      const docente = teachers.find((teacher) => normalizeText(getDocenteId(teacher)) === normalizeText(candidate.docenteId))
      const limite = docente
        ? calcularLimiteVocaliasPorLlamado(docente, {
          ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
        })
        : 0
      const usadas = contarVocaliasPorDocente(simulatedParticipaciones, candidate.docenteId, mesa.llamado)
      if (limite > 0 && usadas < limite) selected.push(candidate)
    }

    evaluations
      .filter((candidate) => !candidate.valid)
      .forEach((candidate) => {
        rejectedByCause[candidate.cause] = (rejectedByCause[candidate.cause] ?? 0) + 1
      })

    const finalVocalCount = countVocales(mesa) + selected.length
    const canApplyRepair = finalVocalCount >= 2 || (minimumVocalCount === 1 && finalVocalCount >= 1)
    const status = finalVocalCount >= 2
      ? VOCAL_REPAIR_STATUS.COMPLETE_TRIBUNAL
      : canApplyRepair
        ? VOCAL_REPAIR_STATUS.MINIMUM_TRIBUNAL_REVIEW
        : VOCAL_REPAIR_STATUS.MANUAL_VOCAL_REVIEW

    if (canApplyRepair && selected.length) {
      const nextMesa = fillMissingRoles(mesa, selected)
      nextMesa.estado = status === VOCAL_REPAIR_STATUS.COMPLETE_TRIBUNAL
        ? 'FECHA_TENTATIVA'
        : 'FECHA_TENTATIVA_CON_ALERTAS'
      nextMesa.metadata = {
        ...(nextMesa.metadata ?? {}),
        vocalRepairStatus: status,
        requiresManualReview: status !== VOCAL_REPAIR_STATUS.COMPLETE_TRIBUNAL,
      }
      if (status === VOCAL_REPAIR_STATUS.COMPLETE_TRIBUNAL) {
        nextMesa.warnings = nextMesa.warnings.filter((warning) => ![
          'TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA',
          'MINIMUM_TRIBUNAL_REVIEW',
          'MANUAL_VOCAL_REVIEW',
        ].includes(clean(warning.code)))
      }
      if (status === VOCAL_REPAIR_STATUS.MINIMUM_TRIBUNAL_REVIEW) {
        nextMesa.warnings.push({
          code: 'MINIMUM_TRIBUNAL_REVIEW',
          severity: 'warning',
          mesaId: nextMesa.id,
          reason: 'Tribunal minimo experimental con un vocal; requiere revision institucional.',
        })
      }
      repairedItems[index] = nextMesa

      selected.forEach((candidate, selectedIndex) => {
        const role = VOCAL_ROLES.filter((rol) => (rol === 'VOCAL_1' ? !clean(mesa.vocal1Id) : !clean(mesa.vocal2Id)))[selectedIndex]
        participaciones.push(createParticipation(nextMesa, candidate.docenteId, role))
        markTeacherSchedule(teacherSchedule, nextMesa, candidate.docenteId)
      })
    } else if (status === VOCAL_REPAIR_STATUS.MINIMUM_TRIBUNAL_REVIEW) {
      mesa.estado = 'FECHA_TENTATIVA_CON_ALERTAS'
      mesa.metadata = {
        ...(mesa.metadata ?? {}),
        vocalRepairStatus: status,
        requiresManualReview: true,
      }
      mesa.warnings = [
        ...asArray(mesa.warnings),
        {
          code: 'MINIMUM_TRIBUNAL_REVIEW',
          severity: 'warning',
          mesaId: mesa.id,
          reason: 'Tribunal minimo experimental con un vocal existente; requiere revision institucional.',
        },
      ]
    } else if (status === VOCAL_REPAIR_STATUS.MANUAL_VOCAL_REVIEW) {
      mesa.metadata = {
        ...(mesa.metadata ?? {}),
        vocalRepairStatus: status,
        requiresManualReview: true,
      }
      mesa.warnings = [
        ...asArray(mesa.warnings),
        {
          code: 'MANUAL_VOCAL_REVIEW',
          severity: 'warning',
          mesaId: mesa.id,
          reason: 'No se encontraron vocales validos para reparar el tribunal.',
        },
      ]
    }

    const rejectedByCauseForMesa = countBy(evaluations.filter((candidate) => !candidate.valid), (candidate) => candidate.cause)
    const repair = createRepairRecord({
      mesa,
      status,
      selected,
      attempted: evaluations.length,
      rejectedByCause: rejectedByCauseForMesa,
    })
    repairs.push(repair)
    cases.push(safeCaseRow({
      mesa,
      status,
      selected,
      rejectedByCause: rejectedByCauseForMesa,
    }))
  })

  const durationMs = Date.now() - startedAt

  return {
    plannedItems: repairedItems,
    unplannedItems: unplanned,
    participaciones,
    repairs,
    cases,
    summary: summarize({
      initialPlanned: plannedItems,
      repairedItems,
      repairs,
      rejectedByCause,
      durationMs,
    }),
    warnings,
    errors,
  }
}
