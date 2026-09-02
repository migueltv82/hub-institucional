import { buildDateRange, getDayName } from '../normalize/dates.js'
import { normalizeText } from '../normalize/subjects.js'
import {
  calculateTeacherAssignmentLimit,
  TEACHER_ASSIGNMENT_RULE_MODES,
} from '../rules/calculateTeacherAssignmentLimit.js'
import {
  contarVocaliasPorDocente,
  cuentaComoVocalia,
} from '../rules/halfPlusOne.js'
import { getNivelAfinidadDocenteMesa, isAfinidadDebil } from '../rules/affinities.js'
import {
  buildTribunalDocenteMap,
  findTribunalDocente,
  getParticipationDocenteId,
} from '../planning/tribunals/buildTribunalCandidatePool.js'

function clean(value) {
  return String(value ?? '').trim()
}

function getDraftMesaId(mesa = {}) {
  return clean(mesa.draftMesaId ?? mesa.id ?? mesa.mesaId)
}

function getMesaFecha(mesa = {}) {
  return clean(mesa.fechaSugerida ?? mesa.fecha)
}

function createAlert({ code, message, severity = 'warning', mesa = {}, docenteId = '', extra = {} }) {
  return {
    code,
    message,
    severity,
    draftMesaId: getDraftMesaId(mesa),
    mesaId: clean(mesa.id ?? mesa.draftMesaId),
    docenteId,
    ...extra,
  }
}

function getVocalEntries(mesa = {}) {
  const entries = [
    { rol: 'VOCAL_1', docenteId: clean(mesa.vocal1Id), nombre: clean(mesa.vocal1) },
    { rol: 'VOCAL_2', docenteId: clean(mesa.vocal2Id), nombre: clean(mesa.vocal2) },
  ].filter((entry) => entry.docenteId || entry.nombre)

  return entries.map((entry) => (
    isCrossTitularVocal(mesa, entry) ? { ...entry, rol: 'TRIBUNAL_CRUZADO' } : entry
  ))
}

function isCrossTitularVocal(mesa = {}, entry = {}) {
  const crossTitulares = mesa.metadata?.crossTitularVocales ?? mesa.crossTitularVocales ?? []
  const entryKey = normalizeText(entry.docenteId || entry.nombre)
  if (!entryKey || !Array.isArray(crossTitulares)) return false

  return crossTitulares.some((item) => normalizeText(
    item?.docenteId ?? item?.id ?? item?.nombre ?? item,
  ) === entryKey)
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

function docenteEstaConLicencia(docente = {}) {
  return docente.licencia === true ||
    docente.conLicencia === true ||
    docente.onLeave === true ||
    docente.excluido === true ||
    docente.excluded === true
}

function docenteEstaActivo(docente = {}) {
  if (!('activo' in docente) && !('active' in docente) && !('isActive' in docente)) return true
  return docente.activo !== false && docente.active !== false && docente.isActive !== false
}

function docenteDisponibleEnFecha(docente = {}, fecha = '') {
  const day = getDayName(fecha)
  if (!day) return false

  const rawDays = [
    docente.dia,
    docente.day,
    docente.diasAsistencia,
    docente.diasDisponibles,
    docente.diasLaborales,
    docente.disponibilidad,
    docente.availability,
  ].flat()
  const days = rawDays.map((entry) => {
    if (entry && typeof entry === 'object') {
      return normalizeText(entry.diaSemana ?? entry.dia ?? entry.day ?? entry.fecha ?? entry.fechaIso ?? entry.date)
    }
    return normalizeText(entry)
  }).filter(Boolean)

  return days.includes(day) && !(Array.isArray(docente.bloqueos) && docente.bloqueos.map(clean).includes(fecha))
}

function buildMesaAsSubject(mesa = {}) {
  return {
    ...mesa,
    materia: mesa.materiaMesa ?? mesa.materia,
    nombreMateria: mesa.materiaMesa ?? mesa.materia,
    carrera: mesa.carrera,
    carreraId: mesa.carreraId,
  }
}

function getParticipationFecha(participacion = {}) {
  return clean(participacion.fecha ?? participacion.fechaIso ?? participacion.date ?? participacion.mesa?.fecha)
}

function getParticipationLlamado(participacion = {}) {
  return clean(participacion.llamado ?? participacion.exam_call ?? participacion.callKey ?? participacion.mesa?.llamado)
}

function createFinalParticipacion(mesa = {}, entry = {}) {
  return {
    docenteId: entry.docenteId,
    mesaId: getDraftMesaId(mesa),
    materiaId: mesa.materiaId,
    carreraId: mesa.carreraId,
    rol: entry.rol,
    llamado: mesa.llamado ?? 'PRIMER_LLAMADO',
    fecha: getMesaFecha(mesa),
    turno: mesa.turno,
  }
}

function buildFinalParticipaciones(finalTribunals = [], teacherAssignments = []) {
  const participaciones = [...teacherAssignments]

  finalTribunals
    .filter((mesa) => mesa.estadoFinal !== 'FINAL_EXCLUDED' && mesa.excluidaFinal !== true)
    .forEach((mesa) => {
      getVocalEntries(mesa)
        .filter((entry) => entry.docenteId)
        .forEach((entry) => participaciones.push(createFinalParticipacion(mesa, entry)))
    })

  return participaciones
}

function countDocenteParticipationsOnDate(participaciones = [], docenteId = '', fecha = '') {
  const docenteKey = normalizeText(docenteId)
  if (!docenteKey || !fecha) return 0

  return participaciones.filter((participacion) => (
    normalizeText(getParticipationDocenteId(participacion)) === docenteKey &&
    getParticipationFecha(participacion) === fecha
  )).length
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

function validateMesaDocentes({ mesa, docenteMap, allowedDates, participaciones, tribunalRules, alerts }) {
  if (mesa.excluidaFinal === true || mesa.estadoFinal === 'FINAL_EXCLUDED') {
    alerts.push(createAlert({
      code: 'FINAL_EXCLUDED_BY_INSTITUTION',
      message: 'La mesa fue excluida por revision institucional final.',
      severity: 'info',
      mesa,
    }))
    return
  }

  const fecha = getMesaFecha(mesa)
  const titular = findTribunalDocente(docenteMap, mesa.titularId || mesa.titular)
  const titularKey = normalizeText(mesa.titularId || mesa.titular)
  const vocalEntries = getVocalEntries(mesa)
  const vocalKeys = vocalEntries.map((entry) => normalizeText(entry.docenteId || entry.nombre)).filter(Boolean)

  if (!clean(mesa.titularId || mesa.titular) || !titular) {
    alerts.push(createAlert({
      code: 'FINAL_TITULAR_NOT_FOUND',
      message: 'El titular final no existe o no esta informado.',
      severity: 'critical',
      mesa,
      docenteId: mesa.titularId,
    }))
  }

  if (fecha && allowedDates.size && !allowedDates.has(fecha)) {
    alerts.push(createAlert({
      code: 'FINAL_DATE_OUT_OF_PERIOD',
      message: 'La fecha final esta fuera del llamado.',
      severity: 'critical',
      mesa,
      extra: { fecha },
    }))
  }

  if (!vocalEntries.length) {
    alerts.push(createAlert({
      code: 'FINAL_TRIBUNAL_INCOMPLETE',
      message: 'El tribunal final no tiene vocales.',
      severity: 'warning',
      mesa,
    }))
  }

  if (vocalEntries.length === 1 && mesa.tribunalMinimoAceptado === true) {
    alerts.push(createAlert({
      code: 'FINAL_TRIBUNAL_MINIMUM_ACCEPTED',
      message: 'La institucion acepto tribunal minimo.',
      severity: 'info',
      mesa,
      docenteId: vocalEntries[0].docenteId,
    }))
  } else if (vocalEntries.length === 1) {
    alerts.push(createAlert({
      code: 'FINAL_TRIBUNAL_INCOMPLETE',
      message: 'El tribunal final tiene un solo vocal y no fue aceptado como minimo.',
      severity: 'warning',
      mesa,
      docenteId: vocalEntries[0].docenteId,
    }))
  }

  if (vocalKeys.some((vocalKey) => vocalKey && vocalKey === titularKey)) {
    alerts.push(createAlert({
      code: 'FINAL_TITULAR_REPEATED_AS_VOCAL',
      message: 'El titular fue repetido como vocal.',
      severity: 'critical',
      mesa,
    }))
  }

  if (vocalKeys.length >= 2 && vocalKeys[0] === vocalKeys[1]) {
    alerts.push(createAlert({
      code: 'FINAL_DUPLICATED_VOCALS',
      message: 'Vocal 1 y Vocal 2 son el mismo docente.',
      severity: 'critical',
      mesa,
      docenteId: vocalEntries[0]?.docenteId,
    }))
  }

  vocalEntries.forEach((entry) => {
    const docente = findTribunalDocente(docenteMap, entry.docenteId || entry.nombre)
    if (!docente) {
      alerts.push(createAlert({
        code: 'FINAL_VOCAL_NOT_FOUND',
        message: 'El vocal final no existe en docentes.',
        severity: 'critical',
        mesa,
        docenteId: entry.docenteId || entry.nombre,
        extra: { rol: entry.rol },
      }))
      return
    }

    if (!docenteEstaActivo(docente) || docenteEstaConLicencia(docente)) {
      alerts.push(createAlert({
        code: 'FINAL_VOCAL_NOT_AVAILABLE',
        message: 'El vocal final esta inactivo, excluido o con licencia.',
        severity: 'critical',
        mesa,
        docenteId: entry.docenteId,
        extra: { rol: entry.rol },
      }))
    }

    if (fecha && !docenteDisponibleEnFecha(docente, fecha)) {
      alerts.push(createAlert({
        code: 'FINAL_VOCAL_UNAVAILABLE',
        message: 'El vocal final no figura disponible en la fecha.',
        severity: 'warning',
        mesa,
        docenteId: entry.docenteId,
        extra: { rol: entry.rol, fecha },
      }))
    }

    if (!isCrossTitularVocal(mesa, entry)) {
      const affinity = getNivelAfinidadDocenteMesa(docente, buildMesaAsSubject(mesa))
      if (!affinity.afinidadValida || isAfinidadDebil(affinity.nivelAfinidad)) {
        alerts.push(createAlert({
          code: 'FINAL_MANUAL_OVERRIDE_REQUIRES_REVIEW',
          message: affinity.afinidadValida
            ? 'El vocal final tiene afinidad debil.'
            : 'El vocal final no tiene afinidad academica detectada.',
          severity: affinity.afinidadValida ? 'warning' : 'critical',
          mesa,
          docenteId: entry.docenteId,
          extra: {
            rol: entry.rol,
            nivelAfinidad: affinity.nivelAfinidad,
          },
        }))
      }
    }

    const dailyCount = countDocenteParticipationsOnDate(participaciones, entry.docenteId, fecha)
    if (dailyCount > tribunalRules.maxParticipacionesDocentePorDia) {
      alerts.push(createAlert({
        code: 'FINAL_MAX_DAILY_PARTICIPATIONS_EXCEEDED',
        message: 'El docente supera el maximo diario de participaciones.',
        severity: 'critical',
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

  if (Object.values(mesa.finalManualOverrides ?? {}).some(Boolean)) {
    alerts.push(createAlert({
      code: 'FINAL_MANUAL_OVERRIDE_REQUIRES_REVIEW',
      message: 'La mesa contiene cambios manuales finales.',
      severity: 'warning',
      mesa,
      extra: { finalManualOverrides: mesa.finalManualOverrides },
    }))
  }
}

function validateHalfPlusOne({ docenteMap, participaciones, tribunalRules, alerts }) {
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
      const vocaliasAsignadas = contarVocaliasPorDocente(participaciones, docenteId, llamado)
      if (vocaliasAsignadas > limitResult.limit) {
        participaciones
          .filter(cuentaComoVocalia)
          .filter((participacion) => normalizeText(getParticipationDocenteId(participacion)) === normalizeText(docenteId))
          .filter((participacion) => getParticipationLlamado(participacion) === llamado)
          .forEach((participacion) => {
            alerts.push({
              code: 'FINAL_TEACHER_EXCEEDS_HALF_PLUS_ONE',
              message: 'El docente excede mitad mas uno luego de la revision final.',
              severity: 'critical',
              docenteId,
              llamado,
              draftMesaId: clean(participacion.mesaId),
              mesaId: clean(participacion.mesaId),
              vocaliasAsignadas,
              limite: limitResult.limit,
            })
          })
      }
    })
  })
}

function alertKey(alert = {}) {
  return [
    alert.code,
    alert.severity,
    alert.draftMesaId,
    alert.docenteId,
    alert.llamado,
    alert.rol,
  ].map((value) => String(value ?? '')).join('::')
}

function dedupeAlerts(alerts = []) {
  const seen = new Set()
  const unique = []

  alerts.forEach((alert) => {
    const key = alertKey(alert)
    if (seen.has(key)) return
    seen.add(key)
    unique.push(alert)
  })

  return unique
}

export function validateFinalTribunals(input = {}) {
  const finalTribunals = Array.isArray(input.finalTribunals) ? input.finalTribunals : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const teacherAssignments = Array.isArray(input.teacherAssignments) ? input.teacherAssignments : []
  const examCallConfig = input.examCallConfig ?? input.config ?? {}
  const tribunalRules = {
    maxParticipacionesDocentePorDia: 2,
    aplicarMitadMasUno: true,
    mitadMasUnoSoloVocalias: true,
    ...(input.tribunalRules ?? {}),
  }
  const docenteMap = buildTribunalDocenteMap(docentes)
  const allowedDates = buildAllowedDateSet(examCallConfig)
  const participaciones = buildFinalParticipaciones(finalTribunals, teacherAssignments)
  const alerts = []

  finalTribunals.forEach((mesa) => {
    validateMesaDocentes({
      mesa,
      docenteMap,
      allowedDates,
      participaciones,
      tribunalRules,
      alerts,
    })
  })

  validateHalfPlusOne({
    docenteMap,
    participaciones,
    tribunalRules,
    alerts,
  })

  const finalAlerts = dedupeAlerts(alerts)
  const errors = finalAlerts.filter((alert) => alert.severity === 'critical')
  const warnings = finalAlerts.filter((alert) => alert.severity !== 'critical')

  return {
    valid: errors.length === 0,
    alerts: finalAlerts,
    errors,
    warnings,
    participaciones,
    summary: {
      totalMesas: finalTribunals.length,
      totalAlertas: finalAlerts.length,
      totalErrores: errors.length,
      totalWarnings: warnings.length,
      totalParticipaciones: participaciones.length,
    },
  }
}
