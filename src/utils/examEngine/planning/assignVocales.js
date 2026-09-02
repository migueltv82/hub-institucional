import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'
import { TEACHER_ASSIGNMENT_RULE_MODES } from '../rules/calculateTeacherAssignmentLimit.js'
import {
  createParticipacionTribunal,
  isParticipacionVocalia,
  normalizeLlamado,
} from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { buildVocalCandidatesForMesas } from './buildVocalCandidates.js'

// Vocal assignment enforces affinity and half plus one quota.

export { buildVocalCandidatesForMesas } from './buildVocalCandidates.js'

const VOCAL_ROLES = ['VOCAL_1', 'VOCAL_2']
const ROLE_CREDITS = {
  VOCAL_1: 2,
  VOCAL_2: 1,
}
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
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

function getParticipationDocenteId(participacion = {}) {
  return clean(
    participacion.docenteId ??
    participacion.teacherKey ??
    participacion.teacherId ??
    participacion.docente?.id ??
    participacion.docente ??
    participacion.profesor,
  )
}

function getParticipationCredit(participacion = {}) {
  const rol = participacion.rol ?? participacion.role
  return ROLE_CREDITS[rol] ?? 0
}

function buildInitialCredits(participaciones = [], options = {}) {
  const credits = new Map()
  participaciones.forEach((participacion) => {
    if (!isParticipacionVocalia(participacion)) return
    const docenteId = getParticipationDocenteId(participacion)
    if (!docenteId) return
    credits.set(docenteId, (credits.get(docenteId) ?? 0) + getParticipationCredit(participacion))
  })

  const customCredits = options.creditosIniciales ?? options.initialCredits
  if (customCredits instanceof Map) {
    customCredits.forEach((value, key) => credits.set(clean(key), Number(value) || 0))
  } else if (customCredits && typeof customCredits === 'object') {
    Object.entries(customCredits).forEach(([key, value]) => credits.set(clean(key), Number(value) || 0))
  }

  return credits
}

function getDocenteById(docenteMap, docenteId = '') {
  return docenteMap.get(normalizeText(docenteId)) ?? null
}

function parseIsoDate(value) {
  const text = clean(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function dayFromIsoDate(value) {
  const date = parseIsoDate(value)
  return date ? DAY_NAMES[date.getDay()] : ''
}

function normalizeTurno(value) {
  return normalizeText(value).toUpperCase()
}

function getTurnosDocente(docente = {}) {
  return [
    docente.turno,
    docente.turnos,
    docente.turnosDisponibles,
    docente.disponibilidadTurnos,
    docente.shifts,
  ].flat().map(normalizeText).filter(Boolean)
}

function normalizeFechaDisponible(row = {}) {
  const fecha = clean(row.fecha ?? row.fechaIso ?? row.date)
  const diaSemana = normalizeText(row.diaSemana ?? row.dia ?? row.day ?? dayFromIsoDate(fecha))

  return {
    fecha,
    diaSemana,
    llamado: normalizeLlamado(row.llamado ?? row.exam_call ?? row.callKey),
    turno: normalizeTurno(row.turno ?? row.shift),
    disponible: row.disponible !== false && row.available !== false,
  }
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

function availabilityEntryMatchesSlot(entry, slot) {
  if (entry && typeof entry === 'object') {
    const entryFecha = clean(entry.fecha ?? entry.fechaIso ?? entry.date)
    const entryDay = normalizeText(entry.diaSemana ?? entry.dia ?? entry.day ?? dayFromIsoDate(entryFecha))
    const entryTurno = normalizeTurno(entry.turno ?? entry.shift)
    const dateMatches = entryFecha ? entryFecha === slot.fecha : entryDay === slot.diaSemana
    const turnMatches = entryTurno ? entryTurno === slot.turno : true

    return dateMatches && turnMatches
  }

  const text = clean(entry)
  const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
  if (dateValue) return dateValue === slot.fecha
  return normalizeText(text) === slot.diaSemana
}

function docenteDisponibleEnSlot(docente = null, slot = {}) {
  if (!docente) return false

  const bloqueos = asArray(docente.bloqueos).map(clean)
  if (bloqueos.includes(slot.fecha)) return false

  const turnos = getTurnosDocente(docente)
  if (turnos.length && !turnos.includes(normalizeText(slot.turno))) return false

  return getAvailabilityValues(docente).some((entry) => availabilityEntryMatchesSlot(entry, slot))
}

function getDesiredTurnos(mesa = {}, titular = null) {
  const mesaTurno = normalizeTurno(mesa.turno)
  if (mesaTurno) return [mesaTurno]
  return titular ? getTurnosDocente(titular).map(normalizeTurno) : []
}

function getCompatibleSlotCount(candidate = {}, context = null) {
  if (!context?.fechasDisponibles?.length) return null

  const titular = getDocenteById(context.docenteMap, context.mesa.titularId)
  const candidateDocente = getDocenteById(context.docenteMap, candidate.docenteId)
  if (!titular || !candidateDocente) return 0

  const assignedDocentes = [...(context.assignedIds ?? new Set())]
    .map((docenteId) => getDocenteById(context.docenteMap, docenteId))
    .filter(Boolean)
  const requiredDocentes = [titular, ...assignedDocentes, candidateDocente]
  const llamado = normalizeLlamado(context.mesa.llamado)
  const desiredTurnos = getDesiredTurnos(context.mesa, titular)
  const slots = context.fechasDisponibles
    .map(normalizeFechaDisponible)
    .filter((slot) => slot.fecha && slot.disponible)
    .filter((slot) => slot.llamado === llamado)
    .filter((slot) => !desiredTurnos.length || desiredTurnos.includes(slot.turno))

  return slots.filter((slot) => requiredDocentes.every((docente) => docenteDisponibleEnSlot(docente, slot))).length
}

function getDocenteCredit(credits, docenteId = '') {
  return credits.get(clean(docenteId)) ?? 0
}

function addDocenteCredit(credits, docenteId = '', rol = '') {
  credits.set(clean(docenteId), getDocenteCredit(credits, docenteId) + (ROLE_CREDITS[rol] ?? 0))
}

function countDocenteUsageInCall(participaciones = [], docenteId = '', llamado = '') {
  return contarVocaliasPorDocente(participaciones, docenteId, normalizeLlamado(llamado))
}

function getCandidateCoverage(candidateCoverage = new Map(), docenteId = '') {
  return candidateCoverage.get(normalizeText(docenteId)) ?? 0
}

function getCandidateAvailabilityDays(candidate = {}) {
  return Number(candidate.metadata?.disponibilidadDias ?? 0) || 0
}

function sortAssignableCandidates(
  candidates = [],
  credits = new Map(),
  participaciones = [],
  llamado = '',
  candidateCoverage = new Map(),
  dateContext = null,
) {
  const compatibleSlotCounts = new Map()
  const compatibleSlotCount = (candidate) => {
    const docenteId = clean(candidate.docenteId)
    if (!compatibleSlotCounts.has(docenteId)) {
      compatibleSlotCounts.set(docenteId, getCompatibleSlotCount(candidate, dateContext))
    }
    return compatibleSlotCounts.get(docenteId)
  }

  return [...candidates].sort((left, right) => (
    Number(compatibleSlotCount(right) > 0) - Number(compatibleSlotCount(left) > 0) ||
    right.puntajeAfinidad - left.puntajeAfinidad ||
    getDocenteCredit(credits, left.docenteId) - getDocenteCredit(credits, right.docenteId) ||
    countDocenteUsageInCall(participaciones, left.docenteId, llamado) - countDocenteUsageInCall(participaciones, right.docenteId, llamado) ||
    left.metadata.vocaliasAsignadas - right.metadata.vocaliasAsignadas ||
    (compatibleSlotCount(right) ?? 0) - (compatibleSlotCount(left) ?? 0) ||
    getCandidateAvailabilityDays(right) - getCandidateAvailabilityDays(left) ||
    getCandidateCoverage(candidateCoverage, left.docenteId) - getCandidateCoverage(candidateCoverage, right.docenteId) ||
    left.metadata.cargaTotal - right.metadata.cargaTotal ||
    left.nombre.localeCompare(right.nombre)
  ))
}

function normalizePrebuiltCandidateEntries(input = {}) {
  const rawEntries = (
    Array.isArray(input.mesasConCandidatos)
      ? input.mesasConCandidatos
      : Array.isArray(input.vocalCandidates)
        ? input.vocalCandidates
        : Array.isArray(input.vocalCandidateResult?.mesasConCandidatos)
          ? input.vocalCandidateResult.mesasConCandidatos
          : []
  )

  return rawEntries.reduce((map, entry = {}) => {
    const mesaId = clean(entry.mesaId ?? entry.id)
    if (!mesaId) return map
    map.set(mesaId, {
      ...entry,
      candidatosVocales: Array.isArray(entry.candidatosVocales) ? entry.candidatosVocales : [],
    })
    return map
  }, new Map())
}

function buildFallbackCandidateEntry({ mesa, docentes, participaciones, config }) {
  const candidateResult = buildVocalCandidatesForMesas({
    mesasPreliminares: [mesa],
    docentes,
    participacionesExistentes: participaciones,
    config,
  })

  return candidateResult.mesasConCandidatos[0] ?? { candidatosVocales: [] }
}

function candidateWithinCurrentQuota(candidate = {}, docenteMap = new Map(), participaciones = [], llamado = '') {
  const docente = getDocenteById(docenteMap, candidate.docenteId)
  if (!docente) return true

  const limite = calcularLimiteVocaliasPorLlamado(docente, {
    ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
  })
  if (limite <= 0) return false
  return contarVocaliasPorDocente(participaciones, candidate.docenteId, llamado) < limite
}

function getValidCandidatesForRole({
  entry = {},
  assignedIds = new Set(),
  credits = new Map(),
  docenteMap = new Map(),
  participaciones = [],
  llamado = '',
  candidateCoverage = new Map(),
  mesa = {},
  fechasDisponibles = [],
} = {}) {
  const candidates = entry.candidatosVocales ?? []
  const dateContext = {
    mesa,
    assignedIds,
    docenteMap,
    fechasDisponibles,
  }

  return sortAssignableCandidates(
    candidates
      .filter((candidate) => candidate.valido)
      .filter((candidate) => !assignedIds.has(normalizeText(candidate.docenteId)))
      .filter((candidate) => candidateWithinCurrentQuota(candidate, docenteMap, participaciones, llamado)),
    credits,
    participaciones,
    llamado,
    candidateCoverage,
    dateContext,
  )
}

function createMesaWarning({ code, message, mesa = {}, docenteId = '', rol = '', extra = {} }) {
  return {
    code,
    message,
    severity: 'warning',
    mesaId: mesa.id,
    materiaId: mesa.materiaId,
    docenteId,
    rol,
    ...extra,
  }
}

function createMesaError({ code, message, mesa = {}, docenteId = '', rol = '', extra = {} }) {
  return {
    code,
    message,
    severity: 'critical',
    mesaId: mesa.id,
    materiaId: mesa.materiaId,
    docenteId,
    rol,
    ...extra,
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

function getMesaStatus(vocal1Id, vocal2Id, errors = []) {
  if (errors.length) return 'PENDIENTE_REVISION'
  if (vocal1Id && vocal2Id) return 'COMPLETA'
  if (vocal1Id) return 'CON_UN_VOCAL'
  return 'SIN_TRIBUNAL_CONFORMADO'
}

function getValidCandidateCount(entry = {}, docenteMap = new Map(), participaciones = [], llamado = '') {
  return (entry.candidatosVocales ?? [])
    .filter((candidate) => candidate.valido)
    .filter((candidate) => candidateWithinCurrentQuota(candidate, docenteMap, participaciones, llamado))
    .length
}

function buildCandidateCoverage(entries = []) {
  const coverage = new Map()

  entries.forEach((entry) => {
    ;(entry.candidatosVocales ?? [])
      .filter((candidate) => candidate.valido)
      .forEach((candidate) => {
        const key = normalizeText(candidate.docenteId)
        if (!key) return
        coverage.set(key, (coverage.get(key) ?? 0) + 1)
      })
  })

  return coverage
}

function mesaDifficultyScore({ mesa = {}, entry = {}, docenteMap = new Map(), participaciones = [] } = {}) {
  return {
    validCandidates: getValidCandidateCount(entry, docenteMap, participaciones, mesa.llamado),
    riskScore: Number(mesa.riskScore ?? 0) || 0,
    year: Number(mesa.anio ?? 0) || 0,
  }
}

function sortAssignmentContexts(contexts = [], docenteMap = new Map(), participaciones = []) {
  return [...contexts].sort((left, right) => {
    const leftScore = mesaDifficultyScore({
      mesa: left.mesa,
      entry: left.baseCandidateEntry,
      docenteMap,
      participaciones,
    })
    const rightScore = mesaDifficultyScore({
      mesa: right.mesa,
      entry: right.baseCandidateEntry,
      docenteMap,
      participaciones,
    })

    return (
      leftScore.validCandidates - rightScore.validCandidates ||
      rightScore.riskScore - leftScore.riskScore ||
      rightScore.year - leftScore.year ||
      left.originalIndex - right.originalIndex
    )
  })
}

function getDocentesExcedidos(docentes = [], participaciones = []) {
  return docentes.filter((docente) => {
    const docenteId = getDocenteId(docente)
    const limite = calcularLimiteVocaliasPorLlamado(docente, {
      ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
    })
    const llamados = ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO', 'LLAMADO_ESPECIAL']
    return llamados.some((llamado) => contarVocaliasPorDocente(participaciones, docenteId, llamado) > limite)
  }).map(getDocenteId)
}

function getDocentesEnLimite(docentes = [], participaciones = []) {
  return docentes.filter((docente) => {
    const docenteId = getDocenteId(docente)
    const limite = calcularLimiteVocaliasPorLlamado(docente, {
      ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
    })
    if (limite <= 0) return false
    const llamados = ['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO', 'LLAMADO_ESPECIAL']
    return llamados.some((llamado) => contarVocaliasPorDocente(participaciones, docenteId, llamado) === limite)
  }).map(getDocenteId)
}

function summarizeAssignment(mesasConVocales = [], assignedParticipaciones = [], docentes = [], participaciones = []) {
  const docentesUsados = new Set(assignedParticipaciones.map((participacion) => participacion.docenteId).filter(Boolean))

  return {
    totalMesas: mesasConVocales.length,
    mesasCompletas: mesasConVocales.filter((mesa) => mesa.estado === 'COMPLETA').length,
    mesasConUnVocal: mesasConVocales.filter((mesa) => mesa.estado === 'CON_UN_VOCAL').length,
    mesasSinVocales: mesasConVocales.filter((mesa) => mesa.estado === 'SIN_TRIBUNAL_CONFORMADO').length,
    vocalesAsignados: assignedParticipaciones.length,
    docentesUsadosComoVocal: docentesUsados.size,
    docentesEnLimite: getDocentesEnLimite(docentes, participaciones).length,
    docentesExcedidos: getDocentesExcedidos(docentes, participaciones).length,
  }
}

export function assignVocalesToMesas(input = {}) {
  const mesasPreliminares = Array.isArray(input.mesasPreliminares) ? input.mesasPreliminares : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const participacionesExistentes = Array.isArray(input.participacionesExistentes)
    ? input.participacionesExistentes
    : []
  const options = input.options ?? {}
  const fechasDisponibles = Array.isArray(input.fechasDisponibles) ? input.fechasDisponibles : []
  const docenteMap = buildDocenteMap(docentes)
  const credits = buildInitialCredits(participacionesExistentes, options)
  const participaciones = [...participacionesExistentes]
  const assignedParticipaciones = []
  const warnings = []
  const errors = []
  const prebuiltCandidateEntries = normalizePrebuiltCandidateEntries(input)
  let prebuiltCandidatesUsed = 0
  let fallbackCandidatesBuilt = 0

  const assignmentContexts = mesasPreliminares.map((mesa, originalIndex) => {
    const prebuiltEntry = prebuiltCandidateEntries.get(clean(mesa.id))
    const baseCandidateEntry = prebuiltEntry ?? buildFallbackCandidateEntry({
      mesa,
      docentes,
      participaciones,
      config: input.config,
    })

    if (prebuiltEntry) prebuiltCandidatesUsed += 1
    else fallbackCandidatesBuilt += 1

    return {
      mesa,
      originalIndex,
      prebuiltEntry,
      baseCandidateEntry,
    }
  })
  const candidateCoverage = buildCandidateCoverage(assignmentContexts.map((context) => context.baseCandidateEntry))
  const mesasByOriginalIndex = new Map()

  sortAssignmentContexts(assignmentContexts, docenteMap, participaciones).forEach((context) => {
    const { mesa, prebuiltEntry, baseCandidateEntry, originalIndex } = context
    const mesaWarnings = [...(mesa.warnings ?? [])]
    const mesaErrors = [...(mesa.errors ?? [])]
    let vocal1Id = null
    let vocal2Id = null

    const initialValidCandidates = baseCandidateEntry.candidatosVocales.filter((candidate) => (
      candidate.valido &&
      candidateWithinCurrentQuota(candidate, docenteMap, participaciones, mesa.llamado)
    ))

    if (initialValidCandidates.length < 2) {
      const warning = createMesaWarning({
        code: 'POCOS_CANDIDATOS_VOCALES',
        message: 'La mesa tiene menos de dos candidatos validos a vocal.',
        mesa,
        extra: { candidatosValidos: initialValidCandidates.length },
      })
      warnings.push(warning)
      mesaWarnings.push(warning)
    }

    VOCAL_ROLES.forEach((rol) => {
      const assignedIds = new Set([vocal1Id, vocal2Id].filter(Boolean).map(normalizeText))
      const selected = getValidCandidatesForRole({
        entry: baseCandidateEntry,
        assignedIds,
        credits,
        docenteMap,
        participaciones,
        llamado: mesa.llamado,
        candidateCoverage,
        mesa,
        fechasDisponibles,
      })[0]

      if (!selected) return

      if (normalizeText(selected.docenteId) === normalizeText(mesa.titularId)) {
        const error = createMesaError({
          code: 'TITULAR_AS_VOCAL',
          message: 'Se intento asignar al titular como vocal.',
          mesa,
          docenteId: selected.docenteId,
          rol,
        })
        errors.push(error)
        mesaErrors.push(error)
        return
      }

      if (assignedIds.has(normalizeText(selected.docenteId))) {
        const error = createMesaError({
          code: 'VOCAL_DUPLICADO',
          message: 'Se intento duplicar vocal en la misma mesa.',
          mesa,
          docenteId: selected.docenteId,
          rol,
        })
        errors.push(error)
        mesaErrors.push(error)
        return
      }

      if (selected.rechazos.includes('SIN_AFINIDAD')) {
        const error = createMesaError({
          code: 'VOCAL_SIN_AFINIDAD',
          message: 'Se intento asignar vocal sin afinidad.',
          mesa,
          docenteId: selected.docenteId,
          rol,
        })
        errors.push(error)
        mesaErrors.push(error)
        return
      }

      if (selected.rechazos.includes('SUPERA_LIMITE_VOCALIAS')) {
        const error = createMesaError({
          code: 'VOCAL_SUPERA_LIMITE_VOCALIAS',
          message: 'Se intento asignar vocal que supera mitad mas uno.',
          mesa,
          docenteId: selected.docenteId,
          rol,
        })
        errors.push(error)
        mesaErrors.push(error)
        return
      }

      const participacion = createVocalParticipation(mesa, selected.docenteId, rol)
      participaciones.push(participacion)
      assignedParticipaciones.push(participacion)
      addDocenteCredit(credits, selected.docenteId, rol)

      if (rol === 'VOCAL_1') vocal1Id = selected.docenteId
      if (rol === 'VOCAL_2') vocal2Id = selected.docenteId

      const docente = getDocenteById(docenteMap, selected.docenteId)
      if (docente) {
        const limite = calcularLimiteVocaliasPorLlamado(docente, {
          ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
        })
        const vocaliasAsignadas = contarVocaliasPorDocente(participaciones, selected.docenteId, mesa.llamado)
        if (limite > 0 && vocaliasAsignadas === limite) {
          const warning = createMesaWarning({
            code: 'DOCENTE_ALCANZA_LIMITE_VOCALIAS',
            message: 'El docente asignado queda justo en el limite de vocalias.',
            mesa,
            docenteId: selected.docenteId,
            rol,
            extra: {
              limite,
              vocaliasAsignadas,
            },
          })
          warnings.push(warning)
          mesaWarnings.push(warning)
        }
      }
    })

    if (vocal1Id && !vocal2Id) {
      const warning = createMesaWarning({
        code: 'MESA_CON_UN_VOCAL',
        message: 'Solo se pudo asignar un vocal.',
        mesa,
      })
      warnings.push(warning)
      mesaWarnings.push(warning)
    }

    if (!vocal1Id && !vocal2Id) {
      const warning = createMesaWarning({
        code: 'MESA_SIN_VOCALES',
        message: 'No se pudo asignar ningun vocal.',
        mesa,
      })
      warnings.push(warning)
      mesaWarnings.push(warning)
    }

    const estado = getMesaStatus(vocal1Id, vocal2Id, mesaErrors)
    if (estado === 'PENDIENTE_REVISION') {
      const warning = createMesaWarning({
        code: 'MESA_PENDIENTE_REVISION',
        message: 'La mesa queda pendiente de revision por errores de asignacion.',
        mesa,
      })
      warnings.push(warning)
      mesaWarnings.push(warning)
    }

    mesasByOriginalIndex.set(originalIndex, {
      ...mesa,
      vocal1Id,
      vocal2Id,
      estado,
      warnings: mesaWarnings,
      errors: mesaErrors,
      metadata: {
        ...(mesa.metadata ?? {}),
        vocalAssignmentCredits: {
          vocal1: vocal1Id ? ROLE_CREDITS.VOCAL_1 : 0,
          vocal2: vocal2Id ? ROLE_CREDITS.VOCAL_2 : 0,
        },
        vocalCandidateSource: prebuiltEntry ? 'prebuilt' : 'fallback',
        vocalAssignmentStrategy: 'global-balanced',
        vocalAssignmentDifficulty: mesaDifficultyScore({
          mesa,
          entry: baseCandidateEntry,
          docenteMap,
          participaciones: participacionesExistentes,
        }),
      },
    })
  })
  const mesasConVocales = assignmentContexts.map((context) => mesasByOriginalIndex.get(context.originalIndex))

  const summary = summarizeAssignment(mesasConVocales, assignedParticipaciones, docentes, participaciones)

  return {
    mesasConVocales,
    participaciones,
    errors,
    warnings,
    summary: {
      ...summary,
      prebuiltCandidatesUsed,
      fallbackCandidatesBuilt,
      assignmentStrategy: 'global-balanced',
    },
  }
}
