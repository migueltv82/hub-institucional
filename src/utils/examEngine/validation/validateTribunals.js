import { ROLES_PARTICIPACION } from '../constants.js'
import {
  createParticipacionTribunal,
  isParticipacionTribunalCruzado,
  isParticipacionVocalia,
  normalizeLlamado,
  normalizeMesaExamen,
  normalizeRolParticipacion,
} from '../contracts.js'
import { normalizeText } from '../normalize/subjects.js'
import { getNivelAfinidadDocenteMesa } from '../rules/affinities.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'
import { TEACHER_ASSIGNMENT_RULE_MODES } from '../rules/calculateTeacherAssignmentLimit.js'

// Post-assignment validation checks that repaired tribunals are internally consistent.

const TRIBUNAL_STATES = {
  COMPLETA: 'COMPLETA',
  CON_UN_VOCAL: 'CON_UN_VOCAL',
  SIN_TRIBUNAL_CONFORMADO: 'SIN_TRIBUNAL_CONFORMADO',
  PENDIENTE_REVISION: 'PENDIENTE_REVISION',
}

const POST_ASSIGNMENT_STATES = new Set(Object.values(TRIBUNAL_STATES))

function clean(value) {
  return String(value ?? '').trim()
}

function getMesaId(mesa = {}) {
  return clean(mesa.id ?? mesa.mesaId ?? mesa.mesa)
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

function docenteEstaActivo(docente = {}) {
  if (!('activo' in docente) && !('active' in docente) && !('isActive' in docente)) return true
  return docente.activo !== false && docente.active !== false && docente.isActive !== false
}

function buildDocenteMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    getDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
}

function normalizeMesaForTribunal(mesa = {}) {
  const normalizedMesa = normalizeMesaExamen(mesa)

  return {
    ...mesa,
    ...normalizedMesa,
    fechaIso: normalizedMesa.fecha || mesa.fechaIso || '',
    inicio: normalizedMesa.hora || mesa.inicio || '',
    exam_call: normalizeLlamado(normalizedMesa.llamado || mesa.exam_call || mesa.llamado),
    llamado: normalizeLlamado(normalizedMesa.llamado || mesa.llamado || mesa.exam_call),
    titular_id: normalizedMesa.titularId || mesa.titular_id || '',
    titularId: normalizedMesa.titularId || mesa.titularId || '',
    vocal1: normalizedMesa.vocal1Id || mesa.vocal1 || '',
    vocal2: normalizedMesa.vocal2Id || mesa.vocal2 || '',
    warnings: Array.isArray(mesa.warnings) ? [...mesa.warnings] : [],
    errors: Array.isArray(mesa.errors) ? [...mesa.errors] : [],
  }
}

function getTribunalCruzadoItems(mesa = {}) {
  const rawItems = (
    mesa.tribunalesCruzados ??
    mesa.tribunal?.tribunalesCruzados ??
    mesa.tribunalCruzado ??
    mesa.tribunal_cruzado ??
    mesa.crossTribunal
  )

  if (Array.isArray(rawItems)) return rawItems
  if (!rawItems) return []
  return [rawItems]
}

function getTribunalCruzadoDocenteId(item, mesa = {}) {
  if (typeof item === 'string') return item
  if (item === true) {
    return (
      mesa.tribunalCruzadoId ??
      mesa.docenteTribunalCruzado ??
      mesa.crossTribunalTeacherId ??
      ''
    )
  }

  return (
    item?.docenteId ??
    item?.teacherId ??
    item?.teacherKey ??
    item?.id ??
    item?.docente?.id ??
    item?.docente ??
    item?.profesor ??
    ''
  )
}

function pushParticipacion(participaciones, data) {
  const participacion = createParticipacionTribunal({
    ...data,
    rol: normalizeRolParticipacion(data.rol),
    llamado: normalizeLlamado(data.llamado),
  })

  if (participacion.docenteId && participacion.mesaId && participacion.rol) {
    participaciones.push(participacion)
  }
}

export function buildParticipacionesFromMesas(mesas = []) {
  const participaciones = []

  mesas.map(normalizeMesaForTribunal).forEach((mesa) => {
    const baseData = {
      mesaId: mesa.id,
      materiaId: mesa.materiaId,
      carreraId: mesa.carreraId,
      llamado: mesa.llamado,
      fecha: mesa.fecha,
      turno: mesa.turno,
    }

    if (mesa.titularId) {
      pushParticipacion(participaciones, {
        ...baseData,
        docenteId: mesa.titularId,
        rol: ROLES_PARTICIPACION.TITULAR,
      })
    }

    if (mesa.vocal1Id) {
      pushParticipacion(participaciones, {
        ...baseData,
        docenteId: mesa.vocal1Id,
        rol: ROLES_PARTICIPACION.VOCAL_1,
      })
    }

    if (mesa.vocal2Id) {
      pushParticipacion(participaciones, {
        ...baseData,
        docenteId: mesa.vocal2Id,
        rol: ROLES_PARTICIPACION.VOCAL_2,
      })
    }

    getTribunalCruzadoItems(mesa).forEach((item) => {
      const docenteId = getTribunalCruzadoDocenteId(item, mesa)
      if (!docenteId) return

      pushParticipacion(participaciones, {
        ...baseData,
        docenteId,
        rol: ROLES_PARTICIPACION.TRIBUNAL_CRUZADO,
      })
    })
  })

  return participaciones
}

function normalizeParticipacion(participacion = {}) {
  return createParticipacionTribunal({
    ...participacion,
    rol: normalizeRolParticipacion(participacion.rol ?? participacion.role),
    llamado: normalizeLlamado(participacion.llamado ?? participacion.callKey ?? participacion.exam_call),
  })
}

function participacionKey(participacion = {}) {
  return [
    normalizeText(participacion.docenteId),
    clean(participacion.mesaId),
    normalizeRolParticipacion(participacion.rol),
    normalizeLlamado(participacion.llamado),
  ].join('::')
}

function dedupeParticipaciones(participaciones = []) {
  const seen = new Set()
  const unique = []

  participaciones.map(normalizeParticipacion).forEach((participacion) => {
    const key = participacionKey(participacion)
    if (seen.has(key)) return
    seen.add(key)
    unique.push(participacion)
  })

  return unique
}

function findDuplicateParticipaciones(participaciones = []) {
  const seen = new Set()
  const duplicated = new Set()

  participaciones.map(normalizeParticipacion).forEach((participacion) => {
    const key = participacionKey(participacion)
    if (seen.has(key)) duplicated.add(key)
    seen.add(key)
  })

  return [...duplicated]
}

function hasMatchingParticipation(participaciones = [], { docenteId = '', mesaId = '', rol = '', llamado = '' } = {}) {
  const expected = participacionKey({
    docenteId,
    mesaId,
    rol: normalizeRolParticipacion(rol),
    llamado: normalizeLlamado(llamado),
  })

  return participaciones.some((participacion) => participacionKey(participacion) === expected)
}

function createError({ code, message, mesa = {}, docenteId = '', rol = '', extra = {} }) {
  return {
    code,
    message,
    severity: 'critical',
    mesaId: getMesaId(mesa),
    docenteId,
    rol,
    ...extra,
  }
}

function createWarning({ code, message, mesa = {}, docenteId = '', rol = '', extra = {} }) {
  return {
    code,
    message,
    severity: 'warning',
    mesaId: getMesaId(mesa),
    docenteId,
    rol,
    ...extra,
  }
}

function getVocalEntries(mesa = {}) {
  return [
    { rol: ROLES_PARTICIPACION.VOCAL_1, docenteId: clean(mesa.vocal1Id) },
    { rol: ROLES_PARTICIPACION.VOCAL_2, docenteId: clean(mesa.vocal2Id) },
  ].filter((entry) => entry.docenteId)
}

function getExpectedStatus(mesa = {}) {
  const vocalCount = getVocalEntries(mesa).length
  if (vocalCount >= 2) return TRIBUNAL_STATES.COMPLETA
  if (vocalCount === 1) return TRIBUNAL_STATES.CON_UN_VOCAL
  return TRIBUNAL_STATES.SIN_TRIBUNAL_CONFORMADO
}

function mesaHasExistingAlert(mesa = {}) {
  return Boolean(
    (Array.isArray(mesa.warnings) && mesa.warnings.length) ||
    (Array.isArray(mesa.alertas) && mesa.alertas.length) ||
    (Array.isArray(mesa.errors) && mesa.errors.length)
  )
}

function validateEstadoCoherente(mesa = {}) {
  const errors = []
  const warnings = []
  const estado = clean(mesa.estado)
  const expectedStatus = getExpectedStatus(mesa)

  if (estado && !POST_ASSIGNMENT_STATES.has(estado)) {
    return { errors, warnings, expectedStatus }
  }

  if (estado === TRIBUNAL_STATES.COMPLETA && expectedStatus !== TRIBUNAL_STATES.COMPLETA) {
    errors.push(createError({
      code: 'ESTADO_COMPLETA_SIN_TRIBUNAL_COMPLETO',
      message: 'La mesa figura COMPLETA pero no tiene titular, vocal1 y vocal2 completos.',
      mesa,
      extra: { estado, expectedStatus },
    }))
    return { errors, warnings, expectedStatus }
  }

  if (expectedStatus === TRIBUNAL_STATES.COMPLETA && estado && estado !== TRIBUNAL_STATES.COMPLETA) {
    warnings.push(createWarning({
      code: 'ESTADO_MESA_INCOHERENTE',
      message: 'La mesa tiene tribunal completo pero el estado no figura COMPLETA.',
      mesa,
      extra: { estado, expectedStatus },
    }))
  }

  if (
    expectedStatus === TRIBUNAL_STATES.CON_UN_VOCAL &&
    ![TRIBUNAL_STATES.CON_UN_VOCAL, TRIBUNAL_STATES.PENDIENTE_REVISION].includes(estado)
  ) {
    warnings.push(createWarning({
      code: 'ESTADO_MESA_INCOHERENTE',
      message: 'La mesa tiene un solo vocal y deberia quedar CON_UN_VOCAL o PENDIENTE_REVISION.',
      mesa,
      extra: { estado, expectedStatus },
    }))
  }

  if (
    expectedStatus === TRIBUNAL_STATES.SIN_TRIBUNAL_CONFORMADO &&
    ![TRIBUNAL_STATES.SIN_TRIBUNAL_CONFORMADO, TRIBUNAL_STATES.PENDIENTE_REVISION].includes(estado)
  ) {
    warnings.push(createWarning({
      code: 'ESTADO_MESA_INCOHERENTE',
      message: 'La mesa no tiene vocales y deberia quedar SIN_TRIBUNAL_CONFORMADO o PENDIENTE_REVISION.',
      mesa,
      extra: { estado, expectedStatus },
    }))
  }

  if (estado === TRIBUNAL_STATES.SIN_TRIBUNAL_CONFORMADO && expectedStatus === TRIBUNAL_STATES.COMPLETA) {
    warnings.push(createWarning({
      code: 'ESTADO_SIN_TRIBUNAL_CON_VOCALES',
      message: 'La mesa figura sin tribunal pero tiene dos vocales asignados.',
      mesa,
      extra: { estado, expectedStatus },
    }))
  }

  if (
    expectedStatus !== TRIBUNAL_STATES.COMPLETA &&
    !mesaHasExistingAlert(mesa)
  ) {
    warnings.push(createWarning({
      code: 'MESA_INCOMPLETA_SIN_ALERTA',
      message: 'La mesa esta incompleta y no tiene alerta previa de revision.',
      mesa,
      extra: { estado, expectedStatus },
    }))
  }

  return { errors, warnings, expectedStatus }
}

function validateDocenteExistsAndActive({ docenteMap, docenteId, mesa, rol, missingCode, inactiveCode, errors }) {
  const docente = docenteMap.get(normalizeText(docenteId))
  if (!docente) {
    errors.push(createError({
      code: missingCode,
      message: 'El docente asignado al tribunal no existe en la lista de docentes.',
      mesa,
      docenteId,
      rol,
    }))
    return null
  }

  if (!docenteEstaActivo(docente)) {
    errors.push(createError({
      code: inactiveCode,
      message: 'El docente asignado al tribunal esta inactivo.',
      mesa,
      docenteId,
      rol,
    }))
  }

  return docente
}

function validateVocalAffinity({ docente, docenteId, mesa, rol, errors, options }) {
  if (!docente) return

  const affinity = getNivelAfinidadDocenteMesa(docente, mesa, {
    ...options,
    requireCareerCompatibility: options.requireCareerCompatibility === true ||
      options.vocalPlanningMode === 'dateAware',
  })
  if (!affinity.afinidadValida) {
    errors.push(createError({
      code: 'VOCAL_SIN_AFINIDAD',
      message: 'El vocal no tiene afinidad o idoneidad academica con la mesa.',
      mesa,
      docenteId,
      rol,
      extra: {
        nivelAfinidad: affinity.nivelAfinidad,
        motivo: affinity.motivo,
      },
    }))
  }
}

function validateHalfPlusOne({ docenteMap, docentes, participaciones, errors }) {
  if (!docentes.length) return

  const docenteIds = new Set(
    participaciones
      .filter((participacion) => isParticipacionVocalia(participacion) && !isParticipacionTribunalCruzado(participacion))
      .map((participacion) => normalizeText(participacion.docenteId))
      .filter(Boolean),
  )

  docenteIds.forEach((docenteKey) => {
    const docente = docenteMap.get(docenteKey)
    if (!docente) return

    const docenteId = getDocenteId(docente)
    const limite = calcularLimiteVocaliasPorLlamado(docente, {
      ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
    })
    ;['PRIMER_LLAMADO', 'SEGUNDO_LLAMADO', 'LLAMADO_ESPECIAL'].forEach((llamado) => {
      const vocaliasAsignadas = contarVocaliasPorDocente(participaciones, docenteId, llamado)
      if (vocaliasAsignadas > limite) {
        errors.push({
          code: 'DOCENTE_EXCEDE_LIMITE_VOCALIAS',
          message: 'El docente excede el limite de vocalias para el llamado.',
          severity: 'critical',
          docenteId,
          mesaId: '',
          rol: '',
          llamado,
          limite,
          vocaliasAsignadas,
        })
      }
    })
  })
}

function countByExpectedStatus(summaries = [], status) {
  return summaries.filter((summary) => summary.expectedStatus === status).length
}

export function validateTribunals(input = {}) {
  const mesasInput = Array.isArray(input.mesas) ? input.mesas : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const providedParticipaciones = Array.isArray(input.participaciones) ? input.participaciones : []
  const options = input.options ?? {}
  const docenteMap = buildDocenteMap(docentes)
  const mesas = mesasInput.map(normalizeMesaForTribunal)
  const mesaParticipaciones = buildParticipacionesFromMesas(mesas)
  const normalizedProvidedParticipaciones = providedParticipaciones.map(normalizeParticipacion)
  const participaciones = dedupeParticipaciones([
    ...normalizedProvidedParticipaciones,
    ...mesaParticipaciones,
  ])
  const errors = []
  const warnings = []
  const tribunalSummary = []

  findDuplicateParticipaciones(normalizedProvidedParticipaciones).forEach((duplicateKey) => {
    warnings.push({
      code: 'PARTICIPACION_DUPLICADA',
      message: 'Hay participaciones duplicadas en el tribunal.',
      severity: 'warning',
      duplicateKey,
    })
  })

  mesas.forEach((mesa) => {
    const mesaErrors = []
    const mesaWarnings = []
    const titularId = clean(mesa.titularId)
    const titularKey = normalizeText(titularId)
    const vocalEntries = getVocalEntries(mesa)

    if (!titularId) {
      mesaErrors.push(createError({
        code: 'TITULAR_REQUIRED',
        message: 'La mesa debe tener titular asignado.',
        mesa,
      }))
    } else if (docentes.length) {
      validateDocenteExistsAndActive({
        docenteMap,
        docenteId: titularId,
        mesa,
        rol: ROLES_PARTICIPACION.TITULAR,
        missingCode: 'TITULAR_NOT_FOUND',
        inactiveCode: 'TITULAR_INACTIVE',
        errors: mesaErrors,
      })
    }

    if (
      mesa.vocal1Id &&
      mesa.vocal2Id &&
      normalizeText(mesa.vocal1Id) === normalizeText(mesa.vocal2Id)
    ) {
      mesaErrors.push(createError({
        code: 'DUPLICATED_VOCALES',
        message: 'Vocal1 y vocal2 no pueden ser el mismo docente.',
        mesa,
        docenteId: mesa.vocal1Id,
      }))
    }

    vocalEntries.forEach(({ rol, docenteId }) => {
      if (titularKey && normalizeText(docenteId) === titularKey) {
        mesaErrors.push(createError({
          code: 'TITULAR_AS_VOCAL',
          message: 'El titular no puede aparecer como vocal de su propia mesa.',
          mesa,
          docenteId,
          rol,
        }))
      }

      let docente = null
      if (docentes.length) {
        docente = validateDocenteExistsAndActive({
          docenteMap,
          docenteId,
          mesa,
          rol,
          missingCode: 'VOCAL_NOT_FOUND',
          inactiveCode: 'VOCAL_INACTIVE',
          errors: mesaErrors,
        })
      }

      validateVocalAffinity({
        docente,
        docenteId,
        mesa,
        rol,
        errors: mesaErrors,
        warnings: mesaWarnings,
        options,
      })

      if (!hasMatchingParticipation(participaciones, {
        docenteId,
        mesaId: mesa.id,
        rol,
        llamado: mesa.llamado,
      })) {
        mesaWarnings.push(createWarning({
          code: 'PARTICIPACION_VOCAL_RECONSTRUIDA',
          message: 'La participacion del vocal no estaba presente y fue reconstruida desde la mesa.',
          mesa,
          docenteId,
          rol,
        }))
      }
    })

    participaciones
      .filter((participacion) => (
        clean(participacion.mesaId) === mesa.id &&
        isParticipacionVocalia(participacion) &&
        normalizeText(participacion.docenteId) === titularKey
      ))
      .forEach((participacion) => {
        mesaErrors.push(createError({
          code: 'PARTICIPACION_TITULAR_COMO_VOCAL',
          message: 'Hay una participacion de vocal registrada para el titular de la mesa.',
          mesa,
          docenteId: participacion.docenteId,
          rol: participacion.rol,
        }))
      })

    const stateValidation = validateEstadoCoherente(mesa)
    mesaErrors.push(...stateValidation.errors)
    mesaWarnings.push(...stateValidation.warnings)
    errors.push(...mesaErrors)
    warnings.push(...mesaWarnings)

    tribunalSummary.push({
      mesaId: mesa.id,
      estado: mesa.estado,
      expectedStatus: stateValidation.expectedStatus,
      titularId,
      vocal1Id: clean(mesa.vocal1Id),
      vocal2Id: clean(mesa.vocal2Id),
      vocalesAsignados: vocalEntries.length,
      complete: stateValidation.expectedStatus === TRIBUNAL_STATES.COMPLETA && mesaErrors.length === 0,
      errors: mesaErrors,
      warnings: mesaWarnings,
    })
  })

  validateHalfPlusOne({
    docenteMap,
    docentes,
    participaciones,
    errors,
  })

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalMesas: mesas.length,
      mesasCompletas: countByExpectedStatus(tribunalSummary, TRIBUNAL_STATES.COMPLETA),
      mesasConUnVocal: countByExpectedStatus(tribunalSummary, TRIBUNAL_STATES.CON_UN_VOCAL),
      mesasSinTribunal: countByExpectedStatus(tribunalSummary, TRIBUNAL_STATES.SIN_TRIBUNAL_CONFORMADO),
      mesasPendientesRevision: tribunalSummary.filter((summary) => summary.estado === TRIBUNAL_STATES.PENDIENTE_REVISION).length,
      erroresCriticos: errors.filter((error) => String(error.severity).toLowerCase() === 'critical').length,
      advertencias: warnings.length,
    },
    tribunalSummary,
    participaciones,
  }
}
