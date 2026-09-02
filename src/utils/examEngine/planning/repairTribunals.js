import {
  createParticipacionTribunal,
  normalizeLlamado,
} from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import {
  isAfinidadDebil,
  NIVELES_AFINIDAD,
} from '../rules/affinities.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'
import { TEACHER_ASSIGNMENT_RULE_MODES } from '../rules/calculateTeacherAssignmentLimit.js'
import { buildVocalCandidatesForMesas } from './buildVocalCandidates.js'

// Repairs only incomplete tribunals. It never moves dates or generates final schedules.

const ESTADOS_TRIBUNAL = {
  COMPLETA: 'COMPLETA',
  CON_UN_VOCAL: 'CON_UN_VOCAL',
  SIN_TRIBUNAL_CONFORMADO: 'SIN_TRIBUNAL_CONFORMADO',
  PENDIENTE_REVISION: 'PENDIENTE_REVISION',
}

const VOCAL_ROLES = ['VOCAL_1', 'VOCAL_2']
const MAX_GLOBAL_SWAP_CANDIDATES_PER_ROLE = 8
const MAX_DONORS_PER_GLOBAL_CANDIDATE = 4
const MAX_GLOBAL_SWAP_ATTEMPTS = 1200

const STRATEGIES = [
  {
    key: 'AFINIDAD_FUERTE',
    reason: 'Candidato con afinidad fuerte disponible.',
    matches: (candidate) => [
      NIVELES_AFINIDAD.MATERIA_HOMONIMA,
      NIVELES_AFINIDAD.MATERIA_SIMILAR,
      NIVELES_AFINIDAD.PRACTICA_TECNICA_MISMA_CARRERA,
    ].includes(candidate.nivelAfinidad),
  },
  {
    key: 'MISMA_CARRERA',
    reason: 'Candidato de la misma carrera disponible.',
    matches: (candidate) => candidate.nivelAfinidad === NIVELES_AFINIDAD.MISMA_CARRERA,
  },
  {
    key: 'FAMILIA_IDONEIDAD',
    reason: 'Candidato por familia de idoneidad disponible.',
    matches: (candidate) => [
      NIVELES_AFINIDAD.FAMILIA_INGLES,
      NIVELES_AFINIDAD.FAMILIA_INFORMATICA_TIC,
      NIVELES_AFINIDAD.PRACTICA_PEDAGOGICA_TRANSVERSAL,
    ].includes(candidate.nivelAfinidad),
  },
  {
    key: 'AFINIDAD_DEBIL_ACEPTABLE',
    reason: 'Candidato con afinidad debil aceptable disponible.',
    matches: (candidate) => isAfinidadDebil(candidate.nivelAfinidad),
  },
]

function clean(value) {
  return String(value ?? '').trim()
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

function buildDocenteMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    const docenteId = getDocenteId(docente)
    if (docenteId) map.set(normalizeText(docenteId), docente)
    return map
  }, new Map())
}

function getMesaVocalIds(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id].map(clean).filter(Boolean)
}

function getVocalCount(mesa = {}) {
  return new Set(getMesaVocalIds(mesa).map(normalizeText)).size
}

function getTribunalStatus(mesa = {}, errors = []) {
  if (errors.length) return ESTADOS_TRIBUNAL.PENDIENTE_REVISION

  const vocalCount = getVocalCount(mesa)
  if (vocalCount >= 2) return ESTADOS_TRIBUNAL.COMPLETA
  if (vocalCount === 1) return ESTADOS_TRIBUNAL.CON_UN_VOCAL
  return ESTADOS_TRIBUNAL.SIN_TRIBUNAL_CONFORMADO
}

function mesaNeedsRepair(mesa = {}) {
  const status = mesa.estado || getTribunalStatus(mesa)
  return (
    status === ESTADOS_TRIBUNAL.CON_UN_VOCAL ||
    status === ESTADOS_TRIBUNAL.SIN_TRIBUNAL_CONFORMADO ||
    (status === ESTADOS_TRIBUNAL.PENDIENTE_REVISION && getVocalCount(mesa) < 2)
  )
}

function isCompleteValidMesa(mesa = {}) {
  if (getVocalCount(mesa) < 2) return false

  const titularKey = normalizeText(mesa.titularId)
  const vocalKeys = getMesaVocalIds(mesa).map(normalizeText)
  if (vocalKeys.some((vocalKey) => vocalKey === titularKey)) return false

  return new Set(vocalKeys).size === vocalKeys.length
}

function cloneMesa(mesa = {}) {
  return {
    ...mesa,
    warnings: Array.isArray(mesa.warnings) ? [...mesa.warnings] : [],
    errors: Array.isArray(mesa.errors) ? [...mesa.errors] : [],
    metadata: {
      ...(mesa.metadata ?? {}),
    },
  }
}

function hasMatchingParticipation(participaciones = [], participacion = {}) {
  const docenteKey = normalizeText(participacion.docenteId)
  const mesaKey = clean(participacion.mesaId)
  const rolKey = clean(participacion.rol)
  const llamadoKey = normalizeLlamado(participacion.llamado)

  return participaciones.some((current) => (
    normalizeText(current.docenteId ?? current.teacherKey ?? current.teacherId) === docenteKey &&
    clean(current.mesaId ?? current.mesa_id) === mesaKey &&
    clean(current.rol ?? current.role) === rolKey &&
    normalizeLlamado(current.llamado ?? current.callKey ?? current.exam_call) === llamadoKey
  ))
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

function ensureExistingVocalParticipation(participaciones = [], mesa = {}, rol = '') {
  const docenteId = rol === 'VOCAL_1' ? mesa.vocal1Id : mesa.vocal2Id
  if (!docenteId) return participaciones

  const participacion = createVocalParticipation(mesa, docenteId, rol)
  if (hasMatchingParticipation(participaciones, participacion)) return participaciones
  participaciones.push(participacion)
  return participaciones
}

function ensureMesaVocalParticipations(participaciones = [], mesa = {}) {
  VOCAL_ROLES.forEach((rol) => ensureExistingVocalParticipation(participaciones, mesa, rol))
  return participaciones
}

function createWarning({ code, message, mesa = {}, docenteId = '', rol = '', extra = {} }) {
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

function createError({ code, message, mesa = {}, docenteId = '', rol = '', extra = {} }) {
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

function createRepair({
  mesa,
  beforeStatus,
  action,
  assignedDocenteId = '',
  assignedRol = '',
  reason = '',
  success = false,
  warnings = [],
  extra = {},
}) {
  return {
    mesaId: mesa.id,
    beforeStatus,
    afterStatus: getTribunalStatus(mesa, mesa.errors),
    action,
    assignedDocenteId,
    assignedRol,
    reason,
    success,
    warnings,
    ...extra,
  }
}

function getVacantRoles(mesa = {}) {
  return VOCAL_ROLES.filter((rol) => {
    if (rol === 'VOCAL_1') return !mesa.vocal1Id
    return !mesa.vocal2Id
  })
}

function filterAssignableCandidates(candidates = [], mesa = {}) {
  const usedIds = new Set([
    mesa.titularId,
    mesa.vocal1Id,
    mesa.vocal2Id,
  ].map(normalizeText).filter(Boolean))

  return candidates.filter((candidate) => (
    candidate.valido &&
    !usedIds.has(normalizeText(candidate.docenteId))
  ))
}

function selectRepairCandidate(candidates = []) {
  for (const strategy of STRATEGIES) {
    const selected = candidates.find(strategy.matches)
    if (selected) {
      return {
        candidate: selected,
        strategy,
      }
    }
  }

  return {
    candidate: candidates[0] ?? null,
    strategy: null,
  }
}

function getRoleDocenteId(mesa = {}, rol = '') {
  if (rol === 'VOCAL_1') return clean(mesa.vocal1Id)
  if (rol === 'VOCAL_2') return clean(mesa.vocal2Id)
  return ''
}

function setRoleDocenteId(mesa = {}, rol = '', docenteId = '') {
  if (rol === 'VOCAL_1') mesa.vocal1Id = docenteId || null
  if (rol === 'VOCAL_2') mesa.vocal2Id = docenteId || null
}

function removeMatchingParticipation(participaciones = [], { mesa = {}, docenteId = '', rol = '' } = {}) {
  const index = participaciones.findIndex((participacion) => (
    normalizeText(participacion.docenteId ?? participacion.teacherKey ?? participacion.teacherId) === normalizeText(docenteId) &&
    clean(participacion.mesaId ?? participacion.mesa_id) === clean(mesa.id) &&
    clean(participacion.rol ?? participacion.role) === clean(rol) &&
    normalizeLlamado(participacion.llamado ?? participacion.callKey ?? participacion.exam_call) === normalizeLlamado(mesa.llamado)
  ))

  if (index >= 0) participaciones.splice(index, 1)
}

function candidateHasOnlyQuotaRejection(candidate = {}) {
  const blockingRejections = (candidate.rechazos ?? [])
    .filter((rejection) => rejection !== 'SUPERA_LIMITE_VOCALIAS')
  return blockingRejections.length === 0
}

function filterCandidatesForGlobalSwap(candidates = [], mesa = {}) {
  const usedIds = new Set([
    mesa.titularId,
    mesa.vocal1Id,
    mesa.vocal2Id,
  ].map(normalizeText).filter(Boolean))

  return candidates.filter((candidate) => (
    !usedIds.has(normalizeText(candidate.docenteId)) &&
    !candidate.valido &&
    candidateHasOnlyQuotaRejection(candidate)
  ))
}

function getCandidatesForMesa({ mesa, docentes, participaciones, config }) {
  const candidateResult = buildVocalCandidatesForMesas({
    mesasPreliminares: [mesa],
    docentes,
    participacionesExistentes: participaciones,
    config,
  })

  return candidateResult.mesasConCandidatos[0]?.candidatosVocales ?? []
}

function donorIndexKey(llamado = '', docenteId = '') {
  return [normalizeLlamado(llamado), normalizeText(docenteId)].join('::')
}

function buildDonorIndex(mesas = []) {
  return mesas.reduce((index, mesa) => {
    if (getTribunalStatus(mesa, mesa.errors) !== ESTADOS_TRIBUNAL.COMPLETA) return index
    if (!isCompleteValidMesa(mesa)) return index

    VOCAL_ROLES.forEach((rol) => {
      const docenteId = getRoleDocenteId(mesa, rol)
      if (!docenteId) return
      const key = donorIndexKey(mesa.llamado, docenteId)
      const rows = index.get(key) ?? []
      rows.push({ donorMesa: mesa, donorRol: rol })
      index.set(key, rows)
    })

    return index
  }, new Map())
}

function findDonorForCandidate({
  targetMesa,
  candidate,
  donorIndex,
  docentes,
  participaciones,
  config,
}) {
  const candidateId = clean(candidate.docenteId)
  const targetLlamado = normalizeLlamado(targetMesa.llamado)
  const donorRows = (donorIndex.get(donorIndexKey(targetLlamado, candidateId)) ?? [])
    .slice(0, MAX_DONORS_PER_GLOBAL_CANDIDATE)

  for (const { donorMesa, donorRol } of donorRows) {
    if (clean(donorMesa.id) === clean(targetMesa.id)) continue
    if (getTribunalStatus(donorMesa, donorMesa.errors) !== ESTADOS_TRIBUNAL.COMPLETA) continue
    if (!isCompleteValidMesa(donorMesa)) continue

    const simulatedParticipaciones = participaciones
      .filter((participacion) => !(
        normalizeText(participacion.docenteId ?? participacion.teacherKey ?? participacion.teacherId) === normalizeText(candidateId) &&
        clean(participacion.mesaId ?? participacion.mesa_id) === clean(donorMesa.id) &&
        clean(participacion.rol ?? participacion.role) === clean(donorRol) &&
        normalizeLlamado(participacion.llamado ?? participacion.callKey ?? participacion.exam_call) === normalizeLlamado(donorMesa.llamado)
      ))
    const donorWithoutCandidate = cloneMesa(donorMesa)
    setRoleDocenteId(donorWithoutCandidate, donorRol, null)
    const targetUsedIds = new Set([
      targetMesa.titularId,
      targetMesa.vocal1Id,
      targetMesa.vocal2Id,
    ].map(normalizeText).filter(Boolean))
    const donorCandidates = filterAssignableCandidates(
      getCandidatesForMesa({
        mesa: donorWithoutCandidate,
        docentes,
        participaciones: simulatedParticipaciones,
        config,
      }),
      donorWithoutCandidate,
    ).filter((replacement) => (
      normalizeText(replacement.docenteId) !== normalizeText(candidateId) &&
      !targetUsedIds.has(normalizeText(replacement.docenteId))
    ))
    const { candidate: replacement, strategy } = selectRepairCandidate(donorCandidates)

    if (replacement) {
      return {
        donorMesa,
        donorRol,
        replacement,
        strategy,
      }
    }
  }

  return null
}

function removeStaleIncompleteWarnings(mesa = {}) {
  const staleCodes = new Set([
    'REPARACION_QUEDA_CON_UN_VOCAL',
    'REPARACION_SIN_CANDIDATOS_VALIDOS',
  ])
  mesa.warnings = (mesa.warnings ?? []).filter((warning) => !staleCodes.has(warning.code))
}

function repairByGlobalVocalSwaps({
  mesas = [],
  docentes = [],
  participaciones = [],
  config = {},
} = {}) {
  const repairs = []
  const warnings = []
  const repairedMesaIds = new Set()
  const failedMesaIds = new Set()
  let donorIndex = buildDonorIndex(mesas)
  let globalSwapAttempts = 0

  const targets = mesas
    .filter(mesaNeedsRepair)
    .sort((left, right) => getVocalCount(left) - getVocalCount(right))

  targets.forEach((targetMesa) => {
    getVacantRoles(targetMesa).forEach((targetRol) => {
      if (!mesaNeedsRepair(targetMesa)) return

      const targetCandidates = filterCandidatesForGlobalSwap(
        getCandidatesForMesa({
          mesa: targetMesa,
          docentes,
          participaciones,
          config,
        }),
        targetMesa,
      ).filter((candidate) => donorIndex.has(donorIndexKey(targetMesa.llamado, candidate.docenteId)))
        .slice(0, MAX_GLOBAL_SWAP_CANDIDATES_PER_ROLE)

      for (const candidate of targetCandidates) {
        if (globalSwapAttempts >= MAX_GLOBAL_SWAP_ATTEMPTS) {
          failedMesaIds.add(clean(targetMesa.id))
          return
        }
        globalSwapAttempts += 1
        const donor = findDonorForCandidate({
          targetMesa,
          candidate,
          donorIndex,
          docentes,
          participaciones,
          config,
        })

        if (!donor) continue

        const targetBeforeStatus = getTribunalStatus(targetMesa, targetMesa.errors)
        const donorBeforeStatus = getTribunalStatus(donor.donorMesa, donor.donorMesa.errors)
        removeMatchingParticipation(participaciones, {
          mesa: donor.donorMesa,
          docenteId: candidate.docenteId,
          rol: donor.donorRol,
        })
        setRoleDocenteId(donor.donorMesa, donor.donorRol, donor.replacement.docenteId)
        participaciones.push(createVocalParticipation(donor.donorMesa, donor.replacement.docenteId, donor.donorRol))
        setRoleDocenteId(targetMesa, targetRol, candidate.docenteId)
        participaciones.push(createVocalParticipation(targetMesa, candidate.docenteId, targetRol))
        donor.donorMesa.estado = getTribunalStatus(donor.donorMesa, donor.donorMesa.errors)
        targetMesa.estado = getTribunalStatus(targetMesa, targetMesa.errors)
        removeStaleIncompleteWarnings(targetMesa)

        repairs.push(createRepair({
          mesa: targetMesa,
          beforeStatus: targetBeforeStatus,
          action: targetMesa.estado === ESTADOS_TRIBUNAL.COMPLETA
            ? 'REASIGNACION_GLOBAL_COMPLETAR_TRIBUNAL'
            : `REASIGNACION_GLOBAL_${targetRol}`,
          assignedDocenteId: candidate.docenteId,
          assignedRol: targetRol,
          reason: 'Reasignacion global: se movio un vocal desde una mesa completa con reemplazo valido.',
          success: true,
          extra: {
            relatedMesaId: donor.donorMesa.id,
            donorBeforeStatus,
            donorAfterStatus: donor.donorMesa.estado,
            donorRol: donor.donorRol,
            replacementDocenteId: donor.replacement.docenteId,
            replacementReason: donor.strategy?.reason ?? 'Candidato valido disponible.',
          },
        }))
        repairedMesaIds.add(clean(targetMesa.id))
        donorIndex = buildDonorIndex(mesas)
        return
      }

      failedMesaIds.add(clean(targetMesa.id))
    })
  })

  failedMesaIds.forEach((mesaId) => {
    if (repairedMesaIds.has(mesaId)) return
    const mesa = mesas.find((current) => clean(current.id) === mesaId)
    if (!mesa || !mesaNeedsRepair(mesa)) return
    repairs.push(createRepair({
      mesa,
      beforeStatus: getTribunalStatus(mesa, mesa.errors),
      action: 'NO_GLOBAL_SWAP_AVAILABLE',
      reason: 'No se encontro intercambio global que mantenga completo el tribunal donante.',
      success: false,
    }))
  })

  return {
    repairs,
    warnings,
    repairedMesaIds,
  }
}

function shouldWarnDocenteAtLimit(docente = null, participaciones = [], docenteId = '', llamado = '') {
  if (!docente) return null

  const limite = calcularLimiteVocaliasPorLlamado(docente, {
    ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
  })
  const vocaliasAsignadas = contarVocaliasPorDocente(participaciones, docenteId, llamado)
  if (limite > 0 && vocaliasAsignadas === limite) {
    return {
      limite,
      vocaliasAsignadas,
    }
  }

  return null
}

function countByStatus(mesas = [], status) {
  return mesas.filter((mesa) => getTribunalStatus(mesa, mesa.errors) === status).length
}

function summarize({ initialMesas = [], finalMesas = [], repairs = [] }) {
  return {
    totalMesas: finalMesas.length,
    mesasCompletasIniciales: countByStatus(initialMesas, ESTADOS_TRIBUNAL.COMPLETA),
    mesasConUnVocalIniciales: countByStatus(initialMesas, ESTADOS_TRIBUNAL.CON_UN_VOCAL),
    mesasSinVocalesIniciales: countByStatus(initialMesas, ESTADOS_TRIBUNAL.SIN_TRIBUNAL_CONFORMADO),
    mesasReparadas: repairs.filter((repair) => repair.success).length,
    mesasCompletasFinales: countByStatus(finalMesas, ESTADOS_TRIBUNAL.COMPLETA),
    mesasConUnVocalFinales: countByStatus(finalMesas, ESTADOS_TRIBUNAL.CON_UN_VOCAL),
    mesasSinVocalesFinales: countByStatus(finalMesas, ESTADOS_TRIBUNAL.SIN_TRIBUNAL_CONFORMADO),
    reparacionesFallidas: repairs.filter((repair) => !repair.success).length,
  }
}

export function createCrossTribunalRecord({ mesaId, reason = '', relatedMesaIds = [], teachers = [] } = {}) {
  return {
    type: 'crossTribunal',
    mesaId,
    reason,
    relatedMesaIds,
    teachers,
  }
}

export function repairIncompleteTribunals(input = {}) {
  const mesas = Array.isArray(input.mesas) ? input.mesas : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const config = input.config ?? {}
  const docenteMap = buildDocenteMap(docentes)
  const initialMesas = mesas.map(cloneMesa)
  const participaciones = Array.isArray(input.participaciones)
    ? input.participaciones.map((participacion) => ({ ...participacion }))
    : []
  const repairs = []
  const errors = []
  const warnings = []

  initialMesas.forEach((mesa) => ensureMesaVocalParticipations(participaciones, mesa))

  const mesasReparadas = initialMesas.map((mesaOriginal) => {
    const mesa = cloneMesa(mesaOriginal)
    const beforeStatus = getTribunalStatus(mesa, mesa.errors)

    if (beforeStatus === ESTADOS_TRIBUNAL.COMPLETA && isCompleteValidMesa(mesa)) {
      return mesa
    }

    if (!mesaNeedsRepair(mesa)) {
      return {
        ...mesa,
        estado: getTribunalStatus(mesa, mesa.errors),
      }
    }

    getVacantRoles(mesa).forEach((rol) => {
      // Repair recalculates candidates per vacant role because participations
      // are updated after initial vocal assignment and each repair attempt.
      const candidateResult = buildVocalCandidatesForMesas({
        mesasPreliminares: [mesa],
        docentes,
        participacionesExistentes: participaciones,
        config,
      })
      const candidateEntry = candidateResult.mesasConCandidatos[0] ?? { candidatosVocales: [] }
      const candidates = filterAssignableCandidates(candidateEntry.candidatosVocales, mesa)
      const { candidate, strategy } = selectRepairCandidate(candidates)

      if (!candidate) return

      if (normalizeText(candidate.docenteId) === normalizeText(mesa.titularId)) {
        const error = createError({
          code: 'TITULAR_AS_VOCAL_REPAIR',
          message: 'La reparacion intento asignar al titular como vocal.',
          mesa,
          docenteId: candidate.docenteId,
          rol,
        })
        mesa.errors.push(error)
        errors.push(error)
        return
      }

      if (getMesaVocalIds(mesa).map(normalizeText).includes(normalizeText(candidate.docenteId))) {
        const error = createError({
          code: 'VOCAL_DUPLICADO_REPAIR',
          message: 'La reparacion intento duplicar un vocal en la misma mesa.',
          mesa,
          docenteId: candidate.docenteId,
          rol,
        })
        mesa.errors.push(error)
        errors.push(error)
        return
      }

      const participacion = createVocalParticipation(mesa, candidate.docenteId, rol)
      participaciones.push(participacion)

      if (rol === 'VOCAL_1') mesa.vocal1Id = candidate.docenteId
      if (rol === 'VOCAL_2') mesa.vocal2Id = candidate.docenteId

      const repairWarnings = []
      if (strategy?.key === 'AFINIDAD_DEBIL_ACEPTABLE') {
        const warning = createWarning({
          code: 'REPARACION_AFINIDAD_DEBIL',
          message: 'La reparacion uso una afinidad debil aceptable.',
          mesa,
          docenteId: candidate.docenteId,
          rol,
          extra: {
            nivelAfinidad: candidate.nivelAfinidad,
            motivoAfinidad: candidate.motivoAfinidad,
          },
        })
        warnings.push(warning)
        mesa.warnings.push(warning)
        repairWarnings.push(warning)
      }

      const docente = docenteMap.get(normalizeText(candidate.docenteId))
      const limiteWarning = shouldWarnDocenteAtLimit(docente, participaciones, candidate.docenteId, mesa.llamado)
      if (limiteWarning) {
        const warning = createWarning({
          code: 'DOCENTE_ALCANZA_LIMITE_VOCALIAS_REPAIR',
          message: 'El docente reparado queda justo en el limite de vocalias.',
          mesa,
          docenteId: candidate.docenteId,
          rol,
          extra: limiteWarning,
        })
        warnings.push(warning)
        mesa.warnings.push(warning)
        repairWarnings.push(warning)
      }

      mesa.estado = getTribunalStatus(mesa, mesa.errors)

      repairs.push(createRepair({
        mesa,
        beforeStatus,
        action: mesa.estado === ESTADOS_TRIBUNAL.COMPLETA ? 'COMPLETAR_TRIBUNAL' : `ASIGNAR_${rol}`,
        assignedDocenteId: candidate.docenteId,
        assignedRol: rol,
        reason: strategy?.reason ?? 'Candidato valido disponible.',
        success: true,
        warnings: repairWarnings,
      }))
    })

    mesa.estado = getTribunalStatus(mesa, mesa.errors)

    if (mesa.estado === ESTADOS_TRIBUNAL.CON_UN_VOCAL) {
      const warning = createWarning({
        code: 'REPARACION_QUEDA_CON_UN_VOCAL',
        message: 'La mesa queda con un solo vocal y requiere revision institucional.',
        mesa,
      })
      mesa.warnings.push(warning)
      warnings.push(warning)
      repairs.push(createRepair({
        mesa,
        beforeStatus,
        action: 'REQUIERE_REVISION_MANUAL',
        reason: 'No se consiguio segundo vocal valido.',
        success: false,
        warnings: [warning],
      }))
    }

    if (mesa.estado === ESTADOS_TRIBUNAL.SIN_TRIBUNAL_CONFORMADO) {
      const warning = createWarning({
        code: 'REPARACION_SIN_CANDIDATOS_VALIDOS',
        message: 'No hay candidatos validos para reparar el tribunal.',
        mesa,
      })
      mesa.warnings.push(warning)
      warnings.push(warning)
      repairs.push(createRepair({
        mesa,
        beforeStatus,
        action: 'NO_HAY_CANDIDATOS_VALIDOS',
        reason: 'No se consiguieron vocales validos.',
        success: false,
        warnings: [warning],
      }))
    }

    return mesa
  })

  const globalRepair = repairByGlobalVocalSwaps({
    mesas: mesasReparadas,
    docentes,
    participaciones,
    config,
  })
  const globallyCompletedMesaIds = new Set([...globalRepair.repairedMesaIds].filter((mesaId) => {
    const mesa = mesasReparadas.find((current) => clean(current.id) === mesaId)
    return mesa && !mesaNeedsRepair(mesa)
  }))
  const staleActions = new Set(['REQUIERE_REVISION_MANUAL', 'NO_HAY_CANDIDATOS_VALIDOS'])
  const staleWarningCodes = new Set(['REPARACION_QUEDA_CON_UN_VOCAL', 'REPARACION_SIN_CANDIDATOS_VALIDOS'])
  const finalRepairs = [
    ...repairs.filter((repair) => !(
      globallyCompletedMesaIds.has(clean(repair.mesaId)) &&
      !repair.success &&
      staleActions.has(repair.action)
    )),
    ...globalRepair.repairs,
  ]
  const finalWarnings = [
    ...warnings.filter((warning) => !(
      globallyCompletedMesaIds.has(clean(warning.mesaId)) &&
      staleWarningCodes.has(warning.code)
    )),
    ...globalRepair.warnings,
  ]

  return {
    mesasReparadas,
    participaciones,
    repairs: finalRepairs,
    errors,
    warnings: finalWarnings,
    summary: {
      ...summarize({ initialMesas, finalMesas: mesasReparadas, repairs: finalRepairs }),
      reparacionesGlobales: globalRepair.repairs.filter((repair) => repair.success).length,
      reparacionesGlobalesFallidas: globalRepair.repairs.filter((repair) => !repair.success).length,
    },
  }
}

export function repairTribunals({ crossTribunals = [], ...input } = {}) {
  return {
    ...repairIncompleteTribunals(input),
    crossTribunals,
  }
}
