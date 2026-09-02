import {
  createParticipacionTribunal,
  normalizeExamPeriodConfig,
  normalizeLlamado,
  validateExamPeriodConfig,
} from '../contracts.js'
import { getLlamadosRequeridos } from '../rules/regularCalls.js'
import { selectDateAwareVocales } from './dateAwareVocalSelection.js'
import {
  buildCandidateSlotsForMesa,
  buildCorrelationDependentsMap,
  buildCorrelationDepthMap,
  buildCorrelationLinks,
  buildDocenteMap,
  createPlannedMesa,
  createUnassignedMesa,
  dedupeDiagnostics,
  evaluateSlot,
  findDocente,
  getUnassignedReason,
  markPlannedSubjects,
  markTeacherSchedule,
  normalizeFechaDisponible,
  normalizeMesaForPlanning,
  sortMesasForPlanning,
} from './planTentativeDates.js'

function clean(value) {
  return String(value ?? '').trim()
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function getCandidateRows(input = {}) {
  if (Array.isArray(input.mesasConCandidatos)) return input.mesasConCandidatos
  if (Array.isArray(input.vocalCandidates)) return input.vocalCandidates
  if (Array.isArray(input.vocalCandidateResult?.mesasConCandidatos)) {
    return input.vocalCandidateResult.mesasConCandidatos
  }
  if (Array.isArray(input.candidatosVocales?.mesasConCandidatos)) {
    return input.candidatosVocales.mesasConCandidatos
  }
  return []
}

function buildCandidateIndex(input = {}) {
  return getCandidateRows(input).reduce((index, entry = {}) => {
    index.set(clean(entry.mesaId), asArray(entry.candidatosVocales))
    return index
  }, new Map())
}

function createVocalParticipation(mesa = {}, vocal = {}) {
  return createParticipacionTribunal({
    docenteId: vocal.docenteId,
    mesaId: mesa.id,
    materiaId: mesa.materiaId,
    carreraId: mesa.carreraId,
    rol: vocal.rol,
    llamado: mesa.llamado,
    fecha: mesa.fecha,
    turno: mesa.turno,
  })
}

function buildIncompleteTribunalWarning(mesa = {}) {
  return {
    code: 'TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA',
    message: 'La mesa se planifica con tribunal incompleto y requiere revision.',
    severity: 'warning',
    mesaId: mesa.id,
  }
}

function countByCall(mesas = []) {
  return mesas.reduce((summary, mesa) => {
    const llamado = normalizeLlamado(mesa.llamado)
    if (llamado) summary[llamado] = (summary[llamado] ?? 0) + 1
    return summary
  }, {})
}

export function planDatesAndVocales(input = {}) {
  const mesas = asArray(input.mesas).map(normalizeMesaForPlanning)
  const docentes = asArray(input.docentes)
  const correlatividades = asArray(input.correlatividades)
  const fechasDisponibles = asArray(input.fechasDisponibles)
    .map(normalizeFechaDisponible)
    .filter((slot) => slot.fecha && slot.disponible)
  const configValidation = validateExamPeriodConfig(input.config ?? {})
  const config = normalizeExamPeriodConfig(input.config ?? {})
  const requiredCalls = configValidation.valid ? getLlamadosRequeridos(config) : []
  const docenteMap = buildDocenteMap(docentes)
  const links = buildCorrelationLinks(correlatividades)
  const correlationDepthMap = buildCorrelationDepthMap(links)
  const correlationDependentsMap = buildCorrelationDependentsMap(links)
  const candidateIndex = buildCandidateIndex(input)
  const plannedMesas = []
  const unassignedMesas = []
  const errors = configValidation.valid ? [] : [...configValidation.errors]
  const warnings = []
  const participaciones = [...asArray(input.participacionesExistentes)]
  const teacherSchedule = new Set()
  const teacherDaySchedule = new Set()
  const plannedBySubject = new Map()
  const mesasPorFecha = new Map()
  const mesasPorFechaCarrera = new Map()

  sortMesasForPlanning(
    mesas,
    correlatividades,
    docenteMap,
    correlationDepthMap,
    correlationDependentsMap,
    links,
  ).forEach((mesa) => {
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

    const attemptedErrors = []
    const attemptedWarnings = []
    const attemptedSlots = []
    let selected = null

    for (const slot of candidateSlots) {
      const evaluation = evaluateSlot({
        mesa,
        slot,
        docenteMap,
        teacherSchedule,
        teacherDaySchedule,
        plannedBySubject,
        links,
        includeIncompleteTribunalWarning: false,
      })
      attemptedErrors.push(...evaluation.errors)
      attemptedWarnings.push(...evaluation.warnings)
      attemptedSlots.push({ slot, errors: evaluation.errors, warnings: evaluation.warnings })
      if (!evaluation.valid) continue

      const vocalDecision = selectDateAwareVocales({
        mesa,
        fechaCandidata: slot,
        docentes,
        candidatosVocales: candidateIndex.get(clean(mesa.id)) ?? [],
        participaciones,
        teacherSchedule,
        candidateCostByDocenteId: input.candidateCostByDocenteId,
      })
      selected = { slot, evaluation, vocalDecision }
      break
    }

    if (!selected) {
      const reason = candidateSlots.length
        ? getUnassignedReason(attemptedErrors, attemptedSlots)
        : 'SIN_FECHA_VALIDA'
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

    const selectedVocales = selected.vocalDecision.selected
    const mesaWithVocales = {
      ...mesa,
      vocal1Id: selectedVocales[0]?.docenteId ?? '',
      vocal2Id: selectedVocales[1]?.docenteId ?? '',
    }
    const incomplete = selectedVocales.length < 2
    const localWarnings = [
      ...mesaPlanningWarnings,
      ...selected.evaluation.warnings,
      ...(incomplete ? [buildIncompleteTribunalWarning(mesa)] : []),
    ]
    const plannedMesa = createPlannedMesa({
      mesa: mesaWithVocales,
      slot: selected.slot,
      warnings: localWarnings,
    })
    plannedMesa.metadata = {
      ...plannedMesa.metadata,
      dateAwareVocalSelection: true,
      requiresManualReview: incomplete,
      validVocalCandidatesOnDate: selected.vocalDecision.validCandidates,
    }
    plannedMesas.push(plannedMesa)
    warnings.push(...selected.evaluation.warnings)
    if (incomplete) warnings.push(localWarnings.at(-1))
    markTeacherSchedule(teacherSchedule, teacherDaySchedule, plannedMesa)
    markPlannedSubjects(plannedBySubject, plannedMesa)
    selectedVocales.forEach((vocal) => participaciones.push(createVocalParticipation(plannedMesa, vocal)))
    mesasPorFecha.set(plannedMesa.fecha, (mesasPorFecha.get(plannedMesa.fecha) ?? 0) + 1)
    mesaCarreraKeys.forEach((key) => {
      const dayKey = `${plannedMesa.fecha}::${key}`
      mesasPorFechaCarrera.set(dayKey, (mesasPorFechaCarrera.get(dayKey) ?? 0) + 1)
    })
  })

  const finalErrors = dedupeDiagnostics(errors)
  const finalWarnings = dedupeDiagnostics(warnings)

  return {
    plannedMesas,
    unassignedMesas,
    errors: finalErrors,
    warnings: finalWarnings,
    participaciones,
    summary: {
      totalMesas: mesas.length,
      mesasConFechaTentativa: plannedMesas.length,
      mesasSinFecha: unassignedMesas.length,
      mesasPorLlamado: countByCall(plannedMesas),
      conflictosDisponibilidad: unassignedMesas.filter((mesa) => (
        ['TITULAR_NO_DISPONIBLE', 'SIN_FECHA_VALIDA', 'DOCENTE_SUPERPUESTO'].includes(mesa.reason)
      )).length,
      conflictosCorrelatividad: finalErrors.filter((item) => String(item.code ?? '').includes('CORRELATIVIDAD')).length,
      tribunalesIncompletos: plannedMesas.filter((mesa) => mesa.metadata?.requiresManualReview).length,
      advertencias: finalWarnings.length,
    },
  }
}
