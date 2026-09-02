import {
  normalizeExamPeriodConfig,
  normalizeLlamado,
  normalizeMesaExamen,
  validateExamPeriodConfig,
} from '../contracts.js'
import {
  compareIsoDates,
  getDayName,
  toIsoDate,
} from '../normalize/dates.js'
import {
  getSubjectCode,
  getSubjectCareer,
  getSubjectKey,
  getSubjectName,
  isNonGroupableSubject,
  normalizeCareerText,
  normalizeText,
} from '../normalize/subjects.js'
import { getLlamadosRequeridos } from '../rules/regularCalls.js'
import { validateTribunals } from '../validation/validateTribunals.js'

// Tentative planning proposes dates and turns without producing the final schedule.

const TENTATIVE_STATES = {
  FECHA_TENTATIVA: 'FECHA_TENTATIVA',
  FECHA_TENTATIVA_CON_ALERTAS: 'FECHA_TENTATIVA_CON_ALERTAS',
  SIN_FECHA_TENTATIVA: 'SIN_FECHA_TENTATIVA',
}

function clean(value) {
  return String(value ?? '').trim()
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlain(entry)]))
  }

  return value
}

function normalizeTurno(value) {
  return normalizeText(value).toUpperCase()
}

export function normalizeMesaForPlanning(mesa = {}) {
  const normalizedMesa = normalizeMesaExamen(mesa)

  return {
    ...clonePlain(mesa),
    ...normalizedMesa,
    fecha: '',
    fechaIso: '',
    llamado: normalizeLlamado(normalizedMesa.llamado || mesa.llamado || mesa.exam_call),
    exam_call: normalizeLlamado(normalizedMesa.llamado || mesa.exam_call || mesa.llamado),
    titularId: normalizedMesa.titularId || mesa.titularId || '',
    vocal1Id: normalizedMesa.vocal1Id || mesa.vocal1Id || '',
    vocal2Id: normalizedMesa.vocal2Id || mesa.vocal2Id || '',
    turno: clean(normalizedMesa.turno || mesa.turno),
    warnings: Array.isArray(mesa.warnings) ? [...mesa.warnings] : [],
    errors: Array.isArray(mesa.errors) ? [...mesa.errors] : [],
    metadata: {
      ...(mesa.metadata ?? {}),
    },
  }
}

export function normalizeFechaDisponible(row = {}) {
  const fecha = toIsoDate(row.fecha ?? row.fechaIso ?? row.date)
  const diaSemana = normalizeText(row.diaSemana ?? row.dia ?? row.day ?? getDayName(fecha))

  return {
    ...row,
    fecha,
    diaSemana,
    llamado: normalizeLlamado(row.llamado ?? row.exam_call ?? row.callKey),
    turno: normalizeTurno(row.turno ?? row.shift),
    disponible: row.disponible !== false && row.available !== false,
  }
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

export function buildDocenteMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    getDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
}

export function findDocente(docenteMap, docenteId = '') {
  return docenteMap.get(normalizeText(docenteId)) ?? null
}

function getMesaSubjects(mesa = {}) {
  if (Array.isArray(mesa.materiasAgrupadas) && mesa.materiasAgrupadas.length) {
    return mesa.materiasAgrupadas.map((subject) => ({
      ...subject,
      llamado: subject.llamado ?? mesa.llamado,
    }))
  }

  return [{
    id: mesa.id || mesa.materiaId,
    materiaId: mesa.materiaId,
    materiaCodigo: mesa.materiaCodigo,
    codigo: mesa.codigo ?? mesa.materiaCodigo,
    subject_code: mesa.subject_code,
    code: mesa.code,
    materia: mesa.materia,
    nombreMateria: mesa.nombreMateria ?? mesa.materia,
    carreraId: mesa.carreraId,
    carrera: mesa.carrera,
    anio: mesa.anio,
    noAgrupable: mesa.noAgrupable,
    llamado: mesa.llamado,
  }]
}

function getSubjectCarreraKey(subject = {}) {
  return normalizeText(subject.carreraId || subject.carrera || '')
}

// Cualquier docente de la carrera puede ser vocal (sin importar el anio), asi que
// el pool de vocales se comparte a nivel carrera. Se usa para preferir fechas que
// no concentren tantas materias de esa misma carrera el mismo dia.
export function getMesaCarreraKeys(mesa = {}) {
  return new Set(getMesaSubjects(mesa).map(getSubjectCarreraKey).filter(Boolean))
}

function getScopedSubjectNameAlias(subject = {}, value = '') {
  const career = normalizeCareerText(getSubjectCareer(subject) || subject.carreraId)
  const name = normalizeText(value)
  return career && name ? `${career}::${name}` : ''
}

function getSubjectAliases(subject = {}) {
  return [
    getSubjectKey(subject),
    getSubjectCode(subject),
    subject.materiaCodigo,
    subject.codigoMateria,
    subject.codigo_materia,
    subject.subjectCode,
    subject.subject_code,
    subject.codigo,
    subject.code,
    subject.materiaId,
    getScopedSubjectNameAlias(subject, subject.materia),
    getScopedSubjectNameAlias(subject, subject.nombreMateria),
    getScopedSubjectNameAlias(subject, getSubjectName(subject)),
  ].map(normalizeText).filter(Boolean)
}

function mesaHasCorrelativity(mesa = {}, correlatividades = []) {
  const aliases = new Set(getMesaSubjects(mesa).flatMap(getSubjectAliases))

  return correlatividades.some((row) => {
    const rowAliases = getSubjectAliases(row)
    const previas = Array.isArray(row.correlativas)
      ? row.correlativas.map(normalizeText)
      : []

    return rowAliases.some((alias) => aliases.has(alias)) || previas.some((alias) => aliases.has(alias))
  })
}

function getDocenteIdsMesa(mesa = {}) {
  return [
    { rol: 'TITULAR', docenteId: mesa.titularId, required: true },
    { rol: 'VOCAL_1', docenteId: mesa.vocal1Id, required: false },
    { rol: 'VOCAL_2', docenteId: mesa.vocal2Id, required: false },
  ].filter((entry) => clean(entry.docenteId))
}

function countInvolvedTeachers(mesa = {}) {
  return new Set(getDocenteIdsMesa(mesa).map((entry) => normalizeText(entry.docenteId))).size
}

function getAvailabilityValues(docente = {}) {
  const raw = (
    docente.diasAsistencia ??
    docente.diasDisponibles ??
    docente.disponibilidad ??
    docente.diasLaborales ??
    docente.fechasDisponibles ??
    docente.availability ??
    []
  )

  if (Array.isArray(raw)) return raw
  if (raw instanceof Set) return [...raw]
  if (typeof raw === 'number') return []
  if (raw && typeof raw === 'object') {
    const looksLikeAvailabilityEntry = [
      'fecha',
      'fechaIso',
      'date',
      'dia',
      'diaSemana',
      'day',
      'turno',
      'shift',
    ].some((key) => Object.prototype.hasOwnProperty.call(raw, key))

    if (looksLikeAvailabilityEntry) return [raw]

    return Object.entries(raw).filter(([, available]) => available).map(([key]) => key)
  }
  return [raw].filter(Boolean)
}

function availabilityEntryMatches(entry, slot) {
  if (entry && typeof entry === 'object') {
    const entryFecha = toIsoDate(entry.fecha ?? entry.fechaIso ?? entry.date)
    const entryDay = normalizeText(entry.diaSemana ?? entry.dia ?? entry.day)
    const entryTurno = normalizeTurno(entry.turno ?? entry.shift)
    const dateMatches = entryFecha ? entryFecha === slot.fecha : entryDay === slot.diaSemana
    const turnMatches = entryTurno ? entryTurno === slot.turno : true

    return dateMatches && turnMatches
  }

  const text = clean(entry)
  const dateValue = toIsoDate(text)
  if (dateValue) return dateValue === slot.fecha
  return normalizeText(text) === slot.diaSemana
}

function getTeacherTurnos(docente = {}) {
  return [
    docente.turno,
    docente.turnos,
    docente.turnosDisponibles,
    docente.disponibilidadTurnos,
    docente.shifts,
  ].flat().map(normalizeTurno).filter(Boolean)
}

function docenteDisponibleEnSlot(docente = null, slot = {}) {
  if (!docente) return false

  const bloqueos = Array.isArray(docente.bloqueos) ? docente.bloqueos.map(toIsoDate) : []
  if (bloqueos.includes(slot.fecha)) return false

  const turnos = getTeacherTurnos(docente)
  if (turnos.length && !turnos.includes(slot.turno)) return false

  const values = getAvailabilityValues(docente)
  if (values.some((entry) => availabilityEntryMatches(entry, slot))) return true

  const dia = normalizeText(docente.dia ?? docente.day)
  return Boolean(dia && dia === slot.diaSemana)
}

export function getDesiredTurnos(mesa = {}, titular = null) {
  const mesaTurno = normalizeTurno(mesa.turno)
  if (mesaTurno) return { turnos: [mesaTurno], source: 'MESA' }

  const titularTurnos = titular ? getTeacherTurnos(titular) : []
  if (titularTurnos.length) return { turnos: titularTurnos, source: 'TITULAR' }

  return { turnos: [], source: 'SIN_TURNO' }
}

export function buildCorrelationLinks(correlatividades = []) {
  return correlatividades.flatMap((row) => {
    const posteriorAliases = getSubjectAliases(row)
    const previas = Array.isArray(row.correlativas) ? row.correlativas : []

    return previas.map((previa) => ({
      posteriorAliases,
      previaAliases: [
        ...getSubjectAliases({
          carrera: row.carrera,
          carreraId: row.carreraId,
          materiaId: previa,
          materia: previa,
          nombreMateria: previa,
        }),
        normalizeText(previa),
      ].filter(Boolean),
      row,
    }))
  })
}

export function buildCorrelationDepthMap(links = []) {
  return links.reduce((map, link) => {
    link.posteriorAliases.forEach((posteriorAlias) => {
      const previas = map.get(posteriorAlias) ?? new Set()
      link.previaAliases.forEach((previaAlias) => previas.add(previaAlias))
      map.set(posteriorAlias, previas)
    })
    return map
  }, new Map())
}

function getAliasDepth(alias = '', depthMap = new Map(), memo = new Map(), visiting = new Set()) {
  if (!alias) return 0
  if (memo.has(alias)) return memo.get(alias)
  if (visiting.has(alias)) return 0

  visiting.add(alias)
  const previas = depthMap.get(alias)
  if (!previas || !previas.size) {
    memo.set(alias, 0)
    visiting.delete(alias)
    return 0
  }

  let depth = 0
  previas.forEach((previaAlias) => {
    depth = Math.max(depth, getAliasDepth(previaAlias, depthMap, memo, visiting) + 1)
  })

  memo.set(alias, depth)
  visiting.delete(alias)
  return depth
}

function getMesaCorrelationDepth(mesa = {}, depthMap = new Map()) {
  const memo = new Map()
  const aliases = getMesaSubjects(mesa).flatMap(getSubjectAliases)
  return aliases.reduce((maxDepth, alias) => Math.max(maxDepth, getAliasDepth(alias, depthMap, memo)), 0)
}

export function buildCorrelationDependentsMap(links = []) {
  return links.reduce((map, link) => {
    link.previaAliases.forEach((previaAlias) => {
      const posteriors = map.get(previaAlias) ?? new Set()
      link.posteriorAliases.forEach((posteriorAlias) => posteriors.add(posteriorAlias))
      map.set(previaAlias, posteriors)
    })
    return map
  }, new Map())
}

function getAliasDescendants(alias = '', dependentsMap = new Map(), memo = new Map(), visiting = new Set()) {
  if (!alias) return new Set()
  if (memo.has(alias)) return memo.get(alias)
  if (visiting.has(alias)) return new Set()

  visiting.add(alias)
  const direct = dependentsMap.get(alias) ?? new Set()
  const descendants = new Set(direct)
  direct.forEach((posteriorAlias) => {
    getAliasDescendants(posteriorAlias, dependentsMap, memo, visiting).forEach((alias) => descendants.add(alias))
  })

  memo.set(alias, descendants)
  visiting.delete(alias)
  return descendants
}

// Subjects that unlock many others (bottleneck previas) should be scheduled early,
// even when their own prerequisite chain is shallow.
function getMesaCorrelationFanOut(mesa = {}, dependentsMap = new Map()) {
  const memo = new Map()
  const aliases = getMesaSubjects(mesa).flatMap(getSubjectAliases)
  return aliases.reduce((maxFanOut, alias) => (
    Math.max(maxFanOut, getAliasDescendants(alias, dependentsMap, memo).size)
  ), 0)
}

function aliasesIntersect(left = [], right = []) {
  const rightSet = new Set(right)
  return left.some((alias) => rightSet.has(alias))
}

function getDirectCorrelativityOrder(left = {}, right = {}, links = []) {
  const leftAliases = getMesaSubjects(left).flatMap(getSubjectAliases)
  const rightAliases = getMesaSubjects(right).flatMap(getSubjectAliases)
  let leftBeforeRight = false
  let rightBeforeLeft = false

  links.forEach((link) => {
    const leftIsPrevia = aliasesIntersect(leftAliases, link.previaAliases)
    const leftIsPosterior = aliasesIntersect(leftAliases, link.posteriorAliases)
    const rightIsPrevia = aliasesIntersect(rightAliases, link.previaAliases)
    const rightIsPosterior = aliasesIntersect(rightAliases, link.posteriorAliases)

    if (leftIsPrevia && rightIsPosterior) leftBeforeRight = true
    if (rightIsPrevia && leftIsPosterior) rightBeforeLeft = true
  })

  // Datos ciclicos o ambiguos: no forzamos una direccion desde el comparator.
  if (leftBeforeRight === rightBeforeLeft) return 0
  return leftBeforeRight ? -1 : 1
}

export function checkCorrelativityForSlot({ mesa, slot, plannedBySubject, links }) {
  const errors = []
  const warnings = []
  const mesaAliases = getMesaSubjects(mesa).flatMap(getSubjectAliases)

  links.forEach((link) => {
    const isPosterior = aliasesIntersect(mesaAliases, link.posteriorAliases)
    const isPrevia = aliasesIntersect(mesaAliases, link.previaAliases)

    if (isPosterior) {
      const plannedPrevia = link.previaAliases.map((alias) => plannedBySubject.get(alias)).find(Boolean)
      if (!plannedPrevia) {
        errors.push({
          code: 'CORRELATIVIDAD_CONFLICTIVA',
          message: 'La materia posterior no puede planificarse hasta que su correlativa previa tenga fecha.',
          severity: 'critical',
          previaMesaId: '',
          posteriorMesaId: mesa.id,
          mesaId: mesa.id,
          fecha: slot.fecha,
        })
        return
      }

      const order = compareIsoDates(plannedPrevia.fecha, slot.fecha)
      if (order > 0) {
        errors.push({
          code: 'CORRELATIVIDAD_CONFLICTIVA',
          message: 'La materia posterior quedaria antes que su correlativa previa.',
          severity: 'critical',
          previaMesaId: plannedPrevia.mesaId,
          posteriorMesaId: mesa.id,
          mesaId: mesa.id,
          fecha: slot.fecha,
        })
      } else if (order === 0) {
        warnings.push({
          code: 'CORRELATIVIDAD_MISMO_DIA',
          message: 'La correlativa previa y la posterior quedan el mismo dia.',
          severity: 'warning',
          previaMesaId: plannedPrevia.mesaId,
          posteriorMesaId: mesa.id,
          mesaId: mesa.id,
          fecha: slot.fecha,
        })
      }
    }

    if (isPrevia) {
      const plannedPosterior = link.posteriorAliases.map((alias) => plannedBySubject.get(alias)).find(Boolean)
      if (!plannedPosterior) return

      const order = compareIsoDates(slot.fecha, plannedPosterior.fecha)
      if (order > 0) {
        errors.push({
          code: 'CORRELATIVIDAD_CONFLICTIVA',
          message: 'La correlativa previa quedaria despues de la materia posterior.',
          severity: 'critical',
          previaMesaId: mesa.id,
          posteriorMesaId: plannedPosterior.mesaId,
          mesaId: mesa.id,
          fecha: slot.fecha,
        })
      } else if (order === 0) {
        warnings.push({
          code: 'CORRELATIVIDAD_MISMO_DIA',
          message: 'La correlativa previa y la posterior quedan el mismo dia.',
          severity: 'warning',
          previaMesaId: mesa.id,
          posteriorMesaId: plannedPosterior.mesaId,
          mesaId: mesa.id,
          fecha: slot.fecha,
        })
      }
    }
  })

  return { errors, warnings }
}

function scheduleKey(docenteId = '', fecha = '', turno = '') {
  return [normalizeText(docenteId), fecha, normalizeTurno(turno)].join('::')
}

function sameDayKey(docenteId = '', fecha = '') {
  return [normalizeText(docenteId), fecha].join('::')
}

export function evaluateSlot({
  mesa,
  slot,
  docenteMap,
  teacherSchedule,
  teacherDaySchedule,
  plannedBySubject,
  links,
  includeIncompleteTribunalWarning = true,
}) {
  const errors = []
  const warnings = []
  const docenteEntries = getDocenteIdsMesa(mesa)

  if (includeIncompleteTribunalWarning && (!mesa.vocal1Id || !mesa.vocal2Id)) {
    warnings.push({
      code: 'TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA',
      message: 'La mesa se planifica con tribunal incompleto.',
      mesaId: mesa.id,
    })
  }

  docenteEntries.forEach(({ rol, docenteId }) => {
    const docente = findDocente(docenteMap, docenteId)
    if (!docenteDisponibleEnSlot(docente, slot)) {
      errors.push({
        code: rol === 'TITULAR' ? 'TITULAR_NO_DISPONIBLE' : 'VOCAL_NO_DISPONIBLE',
        message: 'El docente no esta disponible para la fecha tentativa.',
        severity: 'critical',
        mesaId: mesa.id,
        docenteId,
        rol,
        fecha: slot.fecha,
        turno: slot.turno,
      })
      return
    }

    if (teacherSchedule.has(scheduleKey(docenteId, slot.fecha, slot.turno))) {
      errors.push({
        code: 'DOCENTE_SUPERPUESTO',
        message: 'El docente ya tiene una mesa tentativa en la misma fecha y turno.',
        severity: 'critical',
        mesaId: mesa.id,
        docenteId,
        rol,
        fecha: slot.fecha,
        turno: slot.turno,
      })
      return
    }

    if (teacherDaySchedule.has(sameDayKey(docenteId, slot.fecha))) {
      warnings.push({
        code: 'DOCENTE_CON_VARIAS_MESAS_MISMO_DIA',
        message: 'El docente queda con mas de una mesa tentativa el mismo dia.',
        mesaId: mesa.id,
        docenteId,
        rol,
        fecha: slot.fecha,
      })
    }
  })

  const correlativity = checkCorrelativityForSlot({
    mesa,
    slot,
    plannedBySubject,
    links,
  })

  errors.push(...correlativity.errors)
  warnings.push(...correlativity.warnings)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

function getMesaSortScore(mesa = {}, correlatividades = [], docenteMap = new Map(), correlationDepthMap = new Map(), correlationDependentsMap = new Map()) {
  const docenteIds = getDocenteIdsMesa(mesa)
  const availabilityCount = docenteIds.reduce((minimum, { docenteId }) => {
    const docente = findDocente(docenteMap, docenteId)
    const count = getAvailabilityValues(docente ?? {}).length
    if (!count) return minimum
    return Math.min(minimum, count)
  }, Number.POSITIVE_INFINITY)

  return {
    riskScore: Number(mesa.riskScore ?? 0) || 0,
    noAgrupable: Boolean(mesa.noAgrupable || getMesaSubjects(mesa).some(isNonGroupableSubject)),
    hasCorrelativity: mesaHasCorrelativity(mesa, correlatividades),
    correlationFanOut: getMesaCorrelationFanOut(mesa, correlationDependentsMap),
    correlationDepth: getMesaCorrelationDepth(mesa, correlationDepthMap),
    availabilityCount: Number.isFinite(availabilityCount) ? availabilityCount : 0,
    anio: Number(mesa.anio ?? 0) || 0,
    docentes: countInvolvedTeachers(mesa),
  }
}

function compareMesasByPlanningHeuristic(left, right, correlatividades, docenteMap, correlationDepthMap, correlationDependentsMap) {
  const leftScore = getMesaSortScore(left, correlatividades, docenteMap, correlationDepthMap, correlationDependentsMap)
  const rightScore = getMesaSortScore(right, correlatividades, docenteMap, correlationDepthMap, correlationDependentsMap)

  return (
    rightScore.riskScore - leftScore.riskScore ||
    Number(rightScore.noAgrupable) - Number(leftScore.noAgrupable) ||
    Number(rightScore.hasCorrelativity) - Number(leftScore.hasCorrelativity) ||
    rightScore.correlationFanOut - leftScore.correlationFanOut ||
    leftScore.correlationDepth - rightScore.correlationDepth ||
    leftScore.availabilityCount - rightScore.availabilityCount ||
    rightScore.anio - leftScore.anio ||
    rightScore.docentes - leftScore.docentes ||
    clean(left.id).localeCompare(clean(right.id))
  )
}

function addDirectCorrelativityEdge(edgesByFrom, indegreeById, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return

  const targets = edgesByFrom.get(fromId) ?? new Set()
  if (targets.has(toId)) return

  targets.add(toId)
  edgesByFrom.set(fromId, targets)
  indegreeById.set(toId, (indegreeById.get(toId) ?? 0) + 1)
}

function sortByDirectCorrelativityGraph(mesas = [], links = []) {
  const entries = mesas.map((mesa, index) => ({
    id: `${clean(mesa.id) || 'mesa'}::${index}`,
    mesa,
    rank: index,
  }))
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
  const edgesByFrom = new Map()
  const indegreeById = new Map(entries.map((entry) => [entry.id, 0]))

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex]
      const right = entries[rightIndex]
      const directOrder = getDirectCorrelativityOrder(left.mesa, right.mesa, links)

      if (directOrder < 0) {
        addDirectCorrelativityEdge(edgesByFrom, indegreeById, left.id, right.id)
      } else if (directOrder > 0) {
        addDirectCorrelativityEdge(edgesByFrom, indegreeById, right.id, left.id)
      }
    }
  }

  const ready = entries.filter((entry) => indegreeById.get(entry.id) === 0)
  const ordered = []
  const orderedIds = new Set()

  while (ready.length) {
    ready.sort((left, right) => left.rank - right.rank)
    const current = ready.shift()
    ordered.push(current)
    orderedIds.add(current.id)

    const targetIds = [...(edgesByFrom.get(current.id) ?? [])]
    targetIds.forEach((targetId) => {
      const nextIndegree = (indegreeById.get(targetId) ?? 0) - 1
      indegreeById.set(targetId, nextIndegree)
      if (nextIndegree === 0) {
        const target = entriesById.get(targetId)
        if (target) ready.push(target)
      }
    })
  }

  const cyclicFallback = entries
    .filter((entry) => !orderedIds.has(entry.id))
    .sort((left, right) => left.rank - right.rank)

  return [...ordered, ...cyclicFallback].map((entry) => entry.mesa)
}

export function sortMesasForPlanning(
  mesas = [],
  correlatividades = [],
  docenteMap = new Map(),
  correlationDepthMap = new Map(),
  correlationDependentsMap = new Map(),
  links = buildCorrelationLinks(correlatividades),
) {
  const heuristicOrdered = [...mesas].sort((left, right) => (
    compareMesasByPlanningHeuristic(left, right, correlatividades, docenteMap, correlationDepthMap, correlationDependentsMap)
  ))

  return sortByDirectCorrelativityGraph(heuristicOrdered, links)
}

function diagnosticKey(item = {}) {
  return [
    item.code,
    item.mesaId,
    item.docenteId,
    item.fecha,
    item.llamado,
    item.rol,
    item.previaMesaId,
    item.posteriorMesaId,
  ].map((value) => String(value ?? '')).join('::')
}

export function dedupeDiagnostics(items = []) {
  const seen = new Set()
  const uniqueItems = []

  items.forEach((item) => {
    const key = diagnosticKey(item)
    if (seen.has(key)) return
    seen.add(key)
    uniqueItems.push(item)
  })

  return uniqueItems
}

export function markTeacherSchedule(teacherSchedule, teacherDaySchedule, mesa = {}) {
  getDocenteIdsMesa(mesa).forEach(({ docenteId }) => {
    teacherSchedule.add(scheduleKey(docenteId, mesa.fecha, mesa.turno))
    teacherDaySchedule.add(sameDayKey(docenteId, mesa.fecha))
  })
}

export function markPlannedSubjects(plannedBySubject, mesa = {}) {
  getMesaSubjects(mesa).forEach((subject) => {
    getSubjectAliases(subject).forEach((alias) => {
      plannedBySubject.set(alias, {
        mesaId: mesa.id,
        fecha: mesa.fecha,
        llamado: mesa.llamado,
      })
    })
  })
}

export function createPlannedMesa({ mesa, slot, warnings }) {
  const tribunalCompleto = Boolean(mesa.titularId && mesa.vocal1Id && mesa.vocal2Id)
  const allWarnings = [...(mesa.warnings ?? []), ...warnings]

  return {
    ...mesa,
    fecha: slot.fecha,
    fechaIso: slot.fecha,
    diaSemana: slot.diaSemana,
    turno: slot.turno,
    estado: tribunalCompleto ? TENTATIVE_STATES.FECHA_TENTATIVA : TENTATIVE_STATES.FECHA_TENTATIVA_CON_ALERTAS,
    warnings: allWarnings,
    metadata: {
      ...(mesa.metadata ?? {}),
      estadoAnterior: mesa.estado,
      fechaTentativa: true,
    },
  }
}

export function createUnassignedMesa(mesa = {}, reason = 'SIN_FECHA_VALIDA', detail = '', errors = [], warnings = []) {
  return {
    ...mesa,
    estado: TENTATIVE_STATES.SIN_FECHA_TENTATIVA,
    fecha: '',
    fechaIso: '',
    metadata: {
      ...(mesa.metadata ?? {}),
      estadoAnterior: mesa.estado,
      fechaTentativa: false,
    },
    reason,
    detail,
    errors,
    warnings,
  }
}

function countByCall(mesas = []) {
  return mesas.reduce((summary, mesa) => {
    const llamado = normalizeLlamado(mesa.llamado)
    if (!llamado) return summary
    summary[llamado] = (summary[llamado] ?? 0) + 1
    return summary
  }, {})
}

function getReasonFromErrors(errors = [], { includeCorrelativity = true } = {}) {
  if (includeCorrelativity && errors.some((error) => error.code === 'CORRELATIVIDAD_CONFLICTIVA')) return 'CORRELATIVIDAD_CONFLICTIVA'
  if (errors.some((error) => error.code === 'DOCENTE_SUPERPUESTO')) return 'DOCENTE_SUPERPUESTO'
  if (errors.some((error) => error.code === 'TITULAR_NO_DISPONIBLE')) return 'TITULAR_NO_DISPONIBLE'
  if (errors.some((error) => error.code === 'VOCAL_NO_DISPONIBLE')) return 'VOCAL_NO_DISPONIBLE'
  return 'SIN_FECHA_VALIDA'
}

function hasCorrelativityError(errors = []) {
  return errors.some((error) => error.code === 'CORRELATIVIDAD_CONFLICTIVA')
}

export function getUnassignedReason(errors = [], attemptedSlots = []) {
  const failedAttempts = attemptedSlots.filter((attempt) => attempt.errors.length)
  const attemptsWithoutCorrelativity = failedAttempts.filter((attempt) => !hasCorrelativityError(attempt.errors))

  if (attemptsWithoutCorrelativity.length) {
    const reason = getReasonFromErrors(
      attemptsWithoutCorrelativity.flatMap((attempt) => attempt.errors),
      { includeCorrelativity: false },
    )
    if (reason !== 'SIN_FECHA_VALIDA') return reason
  }

  if (failedAttempts.length && failedAttempts.every((attempt) => hasCorrelativityError(attempt.errors))) {
    return 'CORRELATIVIDAD_CONFLICTIVA'
  }

  return getReasonFromErrors(errors)
}

export function buildCandidateSlotsForMesa({
  mesa = {},
  fechasDisponibles = [],
  titular = null,
  mesasPorFecha = new Map(),
  mesasPorFechaCarrera = new Map(),
} = {}) {
  const llamado = normalizeLlamado(mesa.llamado)
  const desiredTurnos = getDesiredTurnos(mesa, titular)
  const mesaCarreraKeys = getMesaCarreraKeys(mesa)
  const getCarreraLoad = (fecha) => {
    let max = 0
    mesaCarreraKeys.forEach((key) => {
      max = Math.max(max, mesasPorFechaCarrera.get(`${fecha}::${key}`) ?? 0)
    })
    return max
  }

  const slots = fechasDisponibles
    .filter((slot) => slot.llamado === llamado)
    .filter((slot) => !desiredTurnos.turnos.length || desiredTurnos.turnos.includes(slot.turno))
    .sort((left, right) => (
      getCarreraLoad(left.fecha) - getCarreraLoad(right.fecha) ||
      (mesasPorFecha.get(left.fecha) ?? 0) - (mesasPorFecha.get(right.fecha) ?? 0) ||
      compareIsoDates(left.fecha, right.fecha) ||
      left.turno.localeCompare(right.turno)
    ))

  return {
    desiredTurnos,
    mesaCarreraKeys,
    slots,
  }
}

export function planTentativeDates(input = {}) {
  const mesas = Array.isArray(input.mesas) ? input.mesas.map(normalizeMesaForPlanning) : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const correlatividades = Array.isArray(input.correlatividades) ? input.correlatividades : []
  const fechasDisponibles = Array.isArray(input.fechasDisponibles)
    ? input.fechasDisponibles.map(normalizeFechaDisponible).filter((slot) => slot.fecha && slot.disponible)
    : []
  const configValidation = validateExamPeriodConfig(input.config ?? {})
  const config = normalizeExamPeriodConfig(input.config ?? {})
  const requiredCalls = configValidation.valid ? getLlamadosRequeridos(config) : []
  const docenteMap = buildDocenteMap(docentes)
  const links = buildCorrelationLinks(correlatividades)
  const correlationDepthMap = buildCorrelationDepthMap(links)
  const correlationDependentsMap = buildCorrelationDependentsMap(links)
  const plannedMesas = []
  const unassignedMesas = []
  const errors = configValidation.valid ? [] : [...configValidation.errors]
  const warnings = []
  const teacherSchedule = new Set()
  const teacherDaySchedule = new Set()
  const plannedBySubject = new Map()
  const mesasPorFecha = new Map()
  const mesasPorFechaCarrera = new Map()

  const tribunalValidation = validateTribunals({
    mesas,
    docentes,
    config,
  })
  const tribunalErrorsByMesa = tribunalValidation.errors.reduce((map, error) => {
    const mesaId = clean(error.mesaId)
    if (!mesaId) return map
    const current = map.get(mesaId) ?? []
    current.push(error)
    map.set(mesaId, current)
    return map
  }, new Map())

  sortMesasForPlanning(mesas, correlatividades, docenteMap, correlationDepthMap, correlationDependentsMap, links).forEach((mesa) => {
    const mesaTribunalErrors = tribunalErrorsByMesa.get(mesa.id) ?? []
    if (mesaTribunalErrors.length) {
      errors.push(...mesaTribunalErrors)
      unassignedMesas.push(createUnassignedMesa(
        mesa,
        'TRIBUNAL_INVALIDO',
        'La mesa no se planifica porque el tribunal no valida.',
        mesaTribunalErrors,
      ))
      return
    }

    const llamado = normalizeLlamado(mesa.llamado)
    if (!requiredCalls.includes(llamado)) {
      const warning = {
        code: 'LLAMADO_NO_REQUERIDO',
        message: 'La mesa pertenece a un llamado que no se planifica para esta configuracion.',
        severity: 'warning',
        mesaId: mesa.id,
        llamado,
      }
      warnings.push(warning)
      unassignedMesas.push(createUnassignedMesa(
        mesa,
        'LLAMADO_NO_REQUERIDO',
        'El llamado no corresponde a la configuracion del periodo.',
        [],
        [warning],
      ))
      return
    }

    const titular = findDocente(docenteMap, mesa.titularId)
    const {
      desiredTurnos,
      mesaCarreraKeys,
      slots: candidateSlots,
    } = buildCandidateSlotsForMesa({
      mesa,
      fechasDisponibles,
      titular,
      mesasPorFecha,
      mesasPorFechaCarrera,
    })
    const mesaPlanningWarnings = []
    if (desiredTurnos.source === 'SIN_TURNO') {
      const warning = {
        code: 'TURNO_NO_DEFINIDO',
        message: 'La mesa no tiene turno y el titular no permite inferirlo.',
        severity: 'warning',
        mesaId: mesa.id,
      }
      mesaPlanningWarnings.push(warning)
      warnings.push(warning)
    }

    let selected = null
    const attemptedErrors = []
    const attemptedWarnings = []
    const attemptedSlots = []

    for (const slot of candidateSlots) {
      const evaluation = evaluateSlot({
        mesa,
        slot,
        docenteMap,
        teacherSchedule,
        teacherDaySchedule,
        plannedBySubject,
        links,
      })

      attemptedErrors.push(...evaluation.errors)
      attemptedWarnings.push(...evaluation.warnings)
      attemptedSlots.push({
        slot,
        errors: evaluation.errors,
        warnings: evaluation.warnings,
      })

      if (evaluation.valid) {
        selected = {
          slot,
          warnings: evaluation.warnings,
        }
        break
      }
    }

    if (!selected) {
      const reason = candidateSlots.length ? getUnassignedReason(attemptedErrors, attemptedSlots) : 'SIN_FECHA_VALIDA'
      const localErrors = candidateSlots.length
        ? attemptedErrors
        : [{
          code: 'SIN_FECHA_VALIDA',
          message: 'No hay fechas disponibles para llamado y turno.',
          severity: 'critical',
          mesaId: mesa.id,
          llamado,
        }]
      errors.push(...localErrors)
      warnings.push(...attemptedWarnings)
      unassignedMesas.push(createUnassignedMesa(
        mesa,
        reason,
        candidateSlots.length ? 'No se encontro una fecha tentativa valida.' : 'No hay fechas disponibles para llamado y turno.',
        localErrors,
        [...mesaPlanningWarnings, ...attemptedWarnings],
      ))
      return
    }

    const plannedMesa = createPlannedMesa({
      mesa,
      slot: selected.slot,
      warnings: [...mesaPlanningWarnings, ...selected.warnings],
    })
    plannedMesas.push(plannedMesa)
    warnings.push(...selected.warnings)
    markTeacherSchedule(teacherSchedule, teacherDaySchedule, plannedMesa)
    markPlannedSubjects(plannedBySubject, plannedMesa)
    mesasPorFecha.set(plannedMesa.fecha, (mesasPorFecha.get(plannedMesa.fecha) ?? 0) + 1)
    mesaCarreraKeys.forEach((key) => {
      const dayKey = `${plannedMesa.fecha}::${key}`
      mesasPorFechaCarrera.set(dayKey, (mesasPorFechaCarrera.get(dayKey) ?? 0) + 1)
    })
  })

  const conflictosDisponibilidad = unassignedMesas.filter((mesa) => (
    ['TITULAR_NO_DISPONIBLE', 'VOCAL_NO_DISPONIBLE', 'SIN_FECHA_VALIDA', 'DOCENTE_SUPERPUESTO'].includes(mesa.reason)
  )).length
  const finalErrors = dedupeDiagnostics(errors)
  const finalWarnings = dedupeDiagnostics(warnings)
  const conflictosCorrelatividad = dedupeDiagnostics([
    ...finalErrors,
    ...finalWarnings,
    ...unassignedMesas.flatMap((mesa) => [...(mesa.errors ?? []), ...(mesa.warnings ?? [])]),
  ]).filter((item) => String(item.code ?? '').includes('CORRELATIVIDAD')).length

  return {
    plannedMesas,
    unassignedMesas,
    errors: finalErrors,
    warnings: finalWarnings,
    summary: {
      totalMesas: mesas.length,
      mesasConFechaTentativa: plannedMesas.length,
      mesasSinFecha: unassignedMesas.length,
      mesasPorLlamado: countByCall(plannedMesas),
      conflictosDisponibilidad,
      conflictosCorrelatividad,
      advertencias: finalWarnings.length,
    },
  }
}
