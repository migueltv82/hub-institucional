import {
  createParticipacionTribunal,
  isParticipacionVocalia,
  normalizeLlamado,
} from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { teacherIsAvailableOnDate } from '../rules/availability.js'
import { buildTeacherSlotKey } from '../planning/dateAwareVocalSelection.js'
import { evaluateVocalRepairCandidates } from '../planning/repairIncompleteTribunalVocals.js'

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function countBy(items = [], getKey = (item) => item) {
  return items.reduce((counts, item) => {
    const key = clean(getKey(item)) || 'otro'
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
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

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)
  return clean(docente.id ?? docente.docenteId ?? docente.teacherKey ?? docente.dni ?? docente.email ?? docente.nombre)
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
  return asArray(teachers).reduce((map, teacher) => {
    getDocenteKeys(teacher).forEach((key) => map.set(key, teacher))
    return map
  }, new Map())
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

function titularViable(mesa = {}, docenteMap = new Map()) {
  const titular = docenteMap.get(normalizeText(mesa.titularId))
  if (!titular || !hasDate(mesa)) return false
  return teacherIsAvailableOnDate(titular, clean(mesa.fecha ?? mesa.fechaIso)) &&
    teacherMatchesTurno(titular, mesa.turno)
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

function buildParticipaciones(items = []) {
  return asArray(items).flatMap((mesa) => ([
    { rol: 'VOCAL_1', docenteId: mesa.vocal1Id },
    { rol: 'VOCAL_2', docenteId: mesa.vocal2Id },
  ].filter((entry) => clean(entry.docenteId)).map((entry) => createParticipation(mesa, entry.docenteId, entry.rol))))
}

function buildTeacherSchedule(items = []) {
  const schedule = new Set()
  asArray(items).forEach((mesa) => {
    if (!hasDate(mesa)) return
    ;[
      mesa.titularId,
      mesa.vocal1Id,
      mesa.vocal2Id,
    ].filter(clean).forEach((docenteId) => {
      schedule.add(buildTeacherSlotKey(docenteId, clean(mesa.fecha ?? mesa.fechaIso), mesa.turno))
    })
  })
  return schedule
}

function buildDemandByTeacher(plannedItems = [], teachers = []) {
  const demand = new Map()
  asArray(plannedItems)
    .filter((mesa) => hasDate(mesa) && hasTitular(mesa) && countVocales(mesa) < 2)
    .forEach((mesa) => {
      asArray(teachers).forEach((teacher) => {
        const docenteId = getDocenteId(teacher)
        if (!docenteId || normalizeText(docenteId) === normalizeText(mesa.titularId)) return
        demand.set(normalizeText(docenteId), (demand.get(normalizeText(docenteId)) ?? 0) + 1)
      })
    })
  return demand
}

function normalizeCaseKey(value = '') {
  return normalizeText(value || 'sin_dato').replaceAll(/[^a-z0-9]+/g, '_')
}

function classifyMissingVocales(mesa = {}) {
  const faltaVocal1 = !clean(mesa.vocal1Id)
  const faltaVocal2 = !clean(mesa.vocal2Id)
  if (faltaVocal1 && faltaVocal2) return 'faltan_ambos_vocales'
  if (faltaVocal1) return 'falta_vocal_1'
  if (faltaVocal2) return 'falta_vocal_2'
  return 'tribunal_completo'
}

function buildCase({ mesa = {}, index = 0, evaluations = [], docenteMap = new Map() } = {}) {
  const missing = classifyMissingVocales(mesa)
  const validCandidates = evaluations.filter((candidate) => candidate.valid)
  const rejectedByCause = countBy(evaluations.filter((candidate) => !candidate.valid), (candidate) => candidate.cause)
  const hasDateValue = hasDate(mesa)
  const hasTitularValue = hasTitular(mesa)
  const titularViableValue = hasDateValue && hasTitularValue ? titularViable(mesa, docenteMap) : false
  const repairOpportunity = validCandidates.length >= (2 - countVocales(mesa))
    ? 'COMPLETAR_DOS_VOCALES'
    : validCandidates.length >= 1
      ? 'COMPLETAR_UN_VOCAL'
      : 'REVISION_MANUAL'

  return {
    caseId: `INCOMPLETE-${String(index + 1).padStart(4, '0')}`,
    mesaId: clean(mesa.id),
    carreraKey: normalizeCaseKey(mesa.carrera || mesa.carreraId),
    materiaKey: normalizeCaseKey(mesa.materia || mesa.materiaId),
    llamado: normalizeLlamado(mesa.llamado),
    fecha: clean(mesa.fecha ?? mesa.fechaIso),
    turno: normalizeText(mesa.turno),
    missing,
    hasTitular: hasTitularValue,
    hasDate: hasDateValue,
    titularViable: titularViableValue,
    hasDateButTitularNotViable: hasDateValue && hasTitularValue && !titularViableValue,
    validVocalCandidates: validCandidates.length,
    rejectedByCause,
    repairOpportunity,
    requiresManualReview: repairOpportunity !== 'COMPLETAR_DOS_VOCALES',
  }
}

function summarize(cases = []) {
  const groupedByCause = countBy(cases.flatMap((item) => [
    item.missing,
    ...(item.hasDateButTitularNotViable ? ['fecha_con_titular_no_viable'] : []),
    ...Object.entries(item.rejectedByCause).flatMap(([cause, count]) => Array.from({ length: count }, () => cause)),
    ...(item.validVocalCandidates === 0 ? ['sin_candidatos_vocales_disponibles'] : []),
    ...(item.requiresManualReview ? ['requiere_revision_manual'] : []),
  ]))
  const repairOpportunities = countBy(cases, (item) => item.repairOpportunity)

  return {
    totalIncompleteTribunals: cases.length,
    faltaVocal1: cases.filter((item) => item.missing === 'falta_vocal_1').length,
    faltaVocal2: cases.filter((item) => item.missing === 'falta_vocal_2').length,
    faltanAmbosVocales: cases.filter((item) => item.missing === 'faltan_ambos_vocales').length,
    withTitularAndDate: cases.filter((item) => item.hasTitular && item.hasDate).length,
    withDateButTitularNotViable: cases.filter((item) => item.hasDateButTitularNotViable).length,
    sinCandidatosVocalesDisponibles: cases.filter((item) => item.validVocalCandidates === 0).length,
    requiresManualReview: cases.filter((item) => item.requiresManualReview).length,
    groupedByCause,
    repairOpportunities,
  }
}

export function auditIncompleteTribunals({
  plannedItems = [],
  teachers = [],
  calendar = [],
  options = {},
} = {}) {
  const incomplete = asArray(plannedItems).filter((mesa) => hasDate(mesa) && hasTitular(mesa) && countVocales(mesa) < 2)
  const docenteMap = buildDocenteMap(teachers)
  const participaciones = asArray(options.participaciones).length
    ? asArray(options.participaciones).filter(isParticipacionVocalia)
    : buildParticipaciones(plannedItems)
  const teacherSchedule = buildTeacherSchedule(plannedItems)
  const demandByTeacher = buildDemandByTeacher(plannedItems, teachers)
  const cases = incomplete.map((mesa, index) => {
    const evaluations = evaluateVocalRepairCandidates({
      mesa,
      teachers,
      calendar,
      participaciones,
      teacherSchedule,
      demandByTeacher,
    })
    return buildCase({ mesa, index, evaluations, docenteMap })
  })
  const summary = summarize(cases)

  return {
    summary,
    cases,
    groupedByCause: summary.groupedByCause,
    repairOpportunities: summary.repairOpportunities,
    warnings: [],
    errors: [],
  }
}
