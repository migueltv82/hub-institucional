import { buildDateRange, getDayName } from '../normalize/dates.js'
import { normalizeText } from '../normalize/subjects.js'
import {
  calculateTeacherAssignmentLimit,
  TEACHER_ASSIGNMENT_RULE_MODES,
} from '../rules/calculateTeacherAssignmentLimit.js'
import { contarVocaliasPorDocente, cuentaComoVocalia } from '../rules/halfPlusOne.js'
import {
  buildTribunalDocenteMap,
  findTribunalDocente,
  getParticipationDocenteId,
} from '../planning/tribunals/buildTribunalCandidatePool.js'

function clean(value) {
  return String(value ?? '').trim()
}

function createIssue({ code, message, severity = 'warning', mesa = {}, docenteId = '', extra = {} }) {
  return {
    code,
    message,
    severity,
    draftMesaId: clean(mesa.draftMesaId ?? mesa.id),
    mesaId: clean(mesa.id ?? mesa.draftMesaId),
    docenteId,
    ...extra,
  }
}

function getMesaFecha(mesa = {}) {
  return clean(mesa.fechaSugerida ?? mesa.fecha)
}

function buildAllowedDateSet(config = {}) {
  if (Array.isArray(config.fechasHabiles) && config.fechasHabiles.length) {
    return new Set(config.fechasHabiles.map(clean).filter(Boolean))
  }

  const useWorkingDays = config.usarDiasHabiles ?? config.usarSoloDiasHabiles ?? true
  const workingDays = new Set(
    Array.isArray(config.diasHabiles) && config.diasHabiles.length
      ? config.diasHabiles.map(normalizeText)
      : ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  )

  return new Set(
    buildDateRange(config.fechaInicio, config.fechaFin)
      .filter((fecha) => !useWorkingDays || workingDays.has(getDayName(fecha))),
  )
}

function getVocalEntries(mesa = {}) {
  return [
    { rol: 'VOCAL_1', docenteId: clean(mesa.vocal1Id), nombre: clean(mesa.vocal1) },
    { rol: 'VOCAL_2', docenteId: clean(mesa.vocal2Id), nombre: clean(mesa.vocal2) },
  ].filter((entry) => entry.docenteId || entry.nombre)
}

function docenteEstaConLicencia(docente = {}) {
  return docente.licencia === true ||
    docente.conLicencia === true ||
    docente.onLeave === true ||
    docente.excluido === true ||
    docente.excluded === true
}

function teacherIsAvailableOnDateLoose(docente = {}, fecha = '') {
  const rawDays = [
    docente.dia,
    docente.day,
    docente.diasAsistencia,
    docente.diasDisponibles,
    docente.diasLaborales,
    docente.disponibilidad,
    docente.availability,
  ].flat()
  const day = getDayName(fecha)
  if (!day) return false
  const days = rawDays.map((entry) => {
    if (entry && typeof entry === 'object') {
      return normalizeText(entry.diaSemana ?? entry.dia ?? entry.day ?? entry.fecha ?? entry.fechaIso ?? entry.date)
    }
    return normalizeText(entry)
  }).filter(Boolean)

  return days.includes(day) && !(Array.isArray(docente.bloqueos) && docente.bloqueos.map(clean).includes(fecha))
}

function getParticipationFecha(participacion = {}) {
  return clean(participacion.fecha ?? participacion.fechaIso ?? participacion.date ?? participacion.mesa?.fecha)
}

function countDocenteParticipationsOnDate(participaciones = [], docenteId = '', fecha = '') {
  const docenteKey = normalizeText(docenteId)
  if (!docenteKey || !fecha) return 0

  return participaciones.filter((participacion) => (
    normalizeText(getParticipationDocenteId(participacion)) === docenteKey &&
    getParticipationFecha(participacion) === fecha
  )).length
}

function getParticipationLlamado(participacion = {}) {
  return clean(participacion.llamado ?? participacion.exam_call ?? participacion.callKey ?? participacion.mesa?.llamado)
}

function getUniqueVocalDocenteIds(participaciones = []) {
  return [...new Set(
    participaciones
      .filter(cuentaComoVocalia)
      .map(getParticipationDocenteId)
      .filter(Boolean),
  )]
}

function getLlamadosForDocente(participaciones = [], docenteId = '') {
  const docenteKey = normalizeText(docenteId)
  return [...new Set(
    participaciones
      .filter(cuentaComoVocalia)
      .filter((participacion) => normalizeText(getParticipationDocenteId(participacion)) === docenteKey)
      .map(getParticipationLlamado)
      .filter(Boolean),
  )]
}

function validateMesa({ mesa, docenteMap, allowedDates, participaciones, tribunalRules, warnings, errors }) {
  const fecha = getMesaFecha(mesa)
  const titularDocente = findTribunalDocente(docenteMap, mesa.titularId || mesa.titular)
  const vocalEntries = getVocalEntries(mesa)
  const vocalKeys = vocalEntries.map((entry) => normalizeText(entry.docenteId)).filter(Boolean)
  const titularKey = normalizeText(mesa.titularId || mesa.titular)

  if (mesa.estado === 'EXCLUDED_BY_REVIEW') {
    errors.push(createIssue({
      code: 'EXCLUDED_MESA_PROCESSED',
      message: 'Una mesa excluida fue procesada por error.',
      severity: 'critical',
      mesa,
    }))
  }

  if (!clean(mesa.titularId || mesa.titular)) {
    errors.push(createIssue({
      code: 'TITULAR_MISSING',
      message: 'La mesa generada no tiene titular.',
      severity: 'critical',
      mesa,
    }))
  } else if (!titularDocente) {
    errors.push(createIssue({
      code: 'TITULAR_NOT_FOUND',
      message: 'El titular de la mesa no existe en docentes.',
      severity: 'critical',
      mesa,
      docenteId: mesa.titularId,
    }))
  }

  if (fecha && allowedDates.size && !allowedDates.has(fecha)) {
    errors.push(createIssue({
      code: 'TRIBUNAL_DATE_OUT_OF_PERIOD',
      message: 'La fecha del tribunal esta fuera del llamado.',
      severity: 'critical',
      mesa,
      extra: { fecha },
    }))
  }

  if (!vocalEntries.length) {
    errors.push(createIssue({
      code: 'MESA_WITHOUT_VOCALES',
      message: 'La mesa generada no tiene vocales.',
      severity: 'critical',
      mesa,
    }))
  }

  if (vocalKeys.some((vocalKey) => vocalKey && vocalKey === titularKey)) {
    errors.push(createIssue({
      code: 'TITULAR_AS_VOCAL',
      message: 'El titular fue asignado como vocal.',
      severity: 'critical',
      mesa,
    }))
  }

  if (vocalKeys.length >= 2 && vocalKeys[0] === vocalKeys[1]) {
    errors.push(createIssue({
      code: 'DUPLICATED_VOCAL',
      message: 'Vocal 1 y Vocal 2 son el mismo docente.',
      severity: 'critical',
      mesa,
      docenteId: vocalEntries[0]?.docenteId,
    }))
  }

  vocalEntries.forEach((entry) => {
    const docente = findTribunalDocente(docenteMap, entry.docenteId || entry.nombre)
    if (!docente) {
      errors.push(createIssue({
        code: 'VOCAL_NOT_FOUND',
        message: 'El vocal asignado no existe en docentes.',
        severity: 'critical',
        mesa,
        docenteId: entry.docenteId,
        extra: { rol: entry.rol },
      }))
      return
    }

    if (docenteEstaConLicencia(docente)) {
      errors.push(createIssue({
        code: 'VOCAL_ON_LEAVE',
        message: 'El vocal asignado esta con licencia o excluido.',
        severity: 'critical',
        mesa,
        docenteId: entry.docenteId,
        extra: { rol: entry.rol },
      }))
    }

    if (fecha && !teacherIsAvailableOnDateLoose(docente, fecha)) {
      warnings.push(createIssue({
        code: 'VOCAL_UNAVAILABLE',
        message: 'El vocal asignado no figura disponible en la fecha.',
        severity: 'warning',
        mesa,
        docenteId: entry.docenteId,
        extra: { rol: entry.rol, fecha },
      }))
    }

    const dailyCount = countDocenteParticipationsOnDate(participaciones, entry.docenteId, fecha)
    if (dailyCount > tribunalRules.maxParticipacionesDocentePorDia) {
      warnings.push(createIssue({
        code: 'TEACHER_MAX_DAILY_PARTICIPATIONS',
        message: 'El docente supera el maximo diario de participaciones.',
        severity: 'warning',
        mesa,
        docenteId: entry.docenteId,
        extra: {
          rol: entry.rol,
          fecha,
          dailyCount,
          maxParticipacionesDocentePorDia: tribunalRules.maxParticipacionesDocentePorDia,
        },
      }))
    }
  })
}

function validateHalfPlusOne({ docenteMap, participaciones, tribunalRules, warnings, errors }) {
  if (tribunalRules.aplicarMitadMasUno === false) return

  getUniqueVocalDocenteIds(participaciones).forEach((docenteId) => {
    const docente = findTribunalDocente(docenteMap, docenteId)
    if (!docente) return

    const limitResult = calculateTeacherAssignmentLimit({
      teacher: docente,
      ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
    })
    const llamados = getLlamadosForDocente(participaciones, docenteId)

    llamados.forEach((llamado) => {
      const count = contarVocaliasPorDocente(participaciones, docenteId, llamado)
      if (count > limitResult.limit) {
        errors.push({
          code: 'TEACHER_EXCEEDS_HALF_PLUS_ONE',
          message: 'El docente excede mitad mas uno en vocalias.',
          severity: 'critical',
          docenteId,
          llamado,
          vocaliasAsignadas: count,
          limite: limitResult.limit,
        })
      } else if (limitResult.limit > 0 && count === limitResult.limit) {
        warnings.push({
          code: 'TEACHER_NEAR_HALF_PLUS_ONE_LIMIT',
          message: 'El docente queda en el limite de mitad mas uno.',
          severity: 'warning',
          docenteId,
          llamado,
          vocaliasAsignadas: count,
          limite: limitResult.limit,
        })
      }
    })
  })

  getUniqueVocalDocenteIds(participaciones).forEach((docenteId) => {
    const docente = findTribunalDocente(docenteMap, docenteId)
    if (!docente) return

    const limitResult = calculateTeacherAssignmentLimit({
      teacher: docente,
      ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
    })

    if (!limitResult.valid && limitResult.warningCode) {
      warnings.push({
        code: limitResult.warningCode,
        message: 'No se pudo calcular mitad mas uno por horas catedra para el docente.',
        severity: 'warning',
        docenteId,
      })
    }
  })
}

function validateLockedData({ generatedTribunals, reviewedSchedule, errors }) {
  const reviewedById = new Map(
    reviewedSchedule
      .filter((mesa) => mesa.lockedForTribunalGeneration)
      .map((mesa) => [clean(mesa.draftMesaId ?? mesa.id), mesa]),
  )

  generatedTribunals.forEach((mesa) => {
    const original = reviewedById.get(clean(mesa.draftMesaId ?? mesa.id))
    if (!original) return

    const checks = [
      ['fecha', getMesaFecha(original), getMesaFecha(mesa)],
      ['carrera', clean(original.carrera), clean(mesa.carrera)],
      ['anio', clean(original.anio), clean(mesa.anio)],
      ['materiaMesa', clean(original.materiaMesa ?? original.materia), clean(mesa.materiaMesa ?? mesa.materia)],
      ['titularId', clean(original.titularId), clean(mesa.titularId)],
    ]

    checks.forEach(([field, before, after]) => {
      if (before && after && before !== after) {
        errors.push(createIssue({
          code: 'LOCKED_DATA_CHANGED',
          message: 'Un dato bloqueado del cronograma revisado fue alterado.',
          severity: 'critical',
          mesa,
          extra: { field, before, after },
        }))
      }
    })
  })
}

function issueKey(issue = {}) {
  return [
    issue.code,
    issue.severity,
    issue.draftMesaId,
    issue.docenteId,
    issue.fecha,
    issue.field,
    issue.llamado,
  ].map((value) => String(value ?? '')).join('::')
}

function dedupeIssues(issues = []) {
  const seen = new Set()
  const unique = []

  issues.forEach((issue) => {
    const key = issueKey(issue)
    if (seen.has(key)) return
    seen.add(key)
    unique.push(issue)
  })

  return unique
}

export function validateGeneratedTribunals(input = {}) {
  const generatedTribunals = Array.isArray(input.generatedTribunals)
    ? input.generatedTribunals
    : Array.isArray(input.tribunales)
      ? input.tribunales
      : []
  const reviewedSchedule = Array.isArray(input.reviewedSchedule) ? input.reviewedSchedule : []
  const skippedMesas = Array.isArray(input.skippedMesas) ? input.skippedMesas : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const participaciones = Array.isArray(input.participaciones) ? input.participaciones : []
  const tribunalRules = input.tribunalRules ?? {}
  const config = input.examCallConfig ?? input.config ?? {}
  const docenteMap = buildTribunalDocenteMap(docentes)
  const allowedDates = buildAllowedDateSet(config)
  const errors = []
  const warnings = []

  generatedTribunals.forEach((mesa) => {
    validateMesa({
      mesa,
      docenteMap,
      allowedDates,
      participaciones,
      tribunalRules,
      warnings,
      errors,
    })
  })

  validateHalfPlusOne({
    docenteMap,
    participaciones,
    tribunalRules,
    warnings,
    errors,
  })
  validateLockedData({
    generatedTribunals,
    reviewedSchedule,
    errors,
  })

  skippedMesas.forEach((mesa) => {
    if (mesa.reason === 'MESA_EXCLUDED_SKIPPED') {
      warnings.push({
        code: 'MESA_EXCLUDED_SKIPPED',
        message: 'La mesa excluida fue omitida correctamente.',
        severity: 'info',
        draftMesaId: mesa.draftMesaId,
      })
    }
  })

  const finalErrors = dedupeIssues(errors)
  const finalWarnings = dedupeIssues(warnings)

  return {
    valid: finalErrors.length === 0,
    errors: finalErrors,
    warnings: finalWarnings,
    summary: {
      totalTribunals: generatedTribunals.length,
      totalSkipped: skippedMesas.length,
      totalErrors: finalErrors.length,
      totalWarnings: finalWarnings.length,
      totalIncomplete: generatedTribunals.filter((mesa) => mesa.estado === 'TRIBUNAL_INCOMPLETE').length,
      totalMinimum: generatedTribunals.filter((mesa) => mesa.estado === 'TRIBUNAL_MINIMUM').length,
    },
  }
}
