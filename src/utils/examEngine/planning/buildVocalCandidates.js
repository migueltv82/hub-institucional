import {
  isParticipacionVocalia,
  normalizeLlamado,
} from '../contracts.js'
import { teacherIsAvailableOnDate } from '../rules/availability.js'
import {
  getNivelAfinidadDocenteMesa,
  NIVELES_AFINIDAD,
} from '../rules/affinities.js'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
} from '../rules/halfPlusOne.js'
import {
  teacherCanBeAssignedOnDate,
  TEACHER_ASSIGNMENT_RULE_MODES,
} from '../rules/calculateTeacherAssignmentLimit.js'
import { normalizeText } from '../normalize/subjects.js'

// This planning step ranks possible vocales but does not assign them yet.

const AFFINITY_SCORE = {
  [NIVELES_AFINIDAD.MISMA_CARRERA]: 100,
  [NIVELES_AFINIDAD.MATERIA_HOMONIMA]: 95,
  [NIVELES_AFINIDAD.PRACTICA_TECNICA_MISMA_CARRERA]: 92,
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

function uniqueCount(value) {
  if (Array.isArray(value)) return new Set(value.map(clean).filter(Boolean).map(normalizeText)).size
  if (value instanceof Set) return uniqueCount([...value])

  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
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

function getDocenteNombre(docente = {}) {
  if (typeof docente === 'string') return docente

  return clean(
    docente.nombre ??
    docente.full_name ??
    docente.display_name ??
    docente.profesor ??
    docente.docente ??
    getDocenteId(docente),
  )
}

function docenteEstaActivo(docente = {}) {
  if (!('activo' in docente) && !('active' in docente) && !('isActive' in docente)) return true
  return docente.activo !== false && docente.active !== false && docente.isActive !== false
}

function getDiasDisponiblesCount(docente = {}) {
  if (typeof docente === 'number') return uniqueCount(docente)

  return uniqueCount(
    docente.diasAsistencia ??
    docente.diasDisponibles ??
    docente.disponibilidad ??
    docente.diasLaborales ??
    docente.cantidadDiasAsistencia ??
    docente.cantidadDiasDisponibles,
  )
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

function turnoCoincide(docente = {}, turno = '') {
  const turnoKey = normalizeText(turno)
  if (!turnoKey) return true

  const turnosDocente = getTurnosDocente(docente)
  if (!turnosDocente.length) return true
  return turnosDocente.includes(turnoKey)
}

function getCargaTotal(docente = {}) {
  return Number(
    docente.cargaTotal ??
    docente.cargaAcumulada ??
    docente.mesasAsignadas ??
    docente.participacionesAsignadas ??
    0,
  ) || 0
}

function docenteYaFiguraComoVocal(participaciones = [], docenteId = '', mesaId = '') {
  const docenteKey = normalizeText(docenteId)
  const mesaKey = clean(mesaId)
  if (!docenteKey || !mesaKey) return false

  return participaciones.some((participacion) => (
    clean(participacion.mesaId ?? participacion.mesa_id) === mesaKey &&
    normalizeText(participacion.docenteId ?? participacion.teacherId ?? participacion.teacherKey) === docenteKey &&
    isParticipacionVocalia(participacion)
  ))
}

function getFechaAvailabilityWarning(mesa = {}) {
  return mesa.fecha
    ? null
    : 'La disponibilidad por dia se validara cuando la mesa tenga fecha.'
}

function buildMesaLikeSubject(mesa = {}) {
  return {
    ...mesa,
    id: mesa.materiaId,
    materia: mesa.materiaId,
    codigo: mesa.materiaId,
    nombreMateria: mesa.materia,
    carrera: mesa.carrera,
    carreraId: mesa.carreraId,
    familiaIdoneidad: mesa.familiaIdoneidad,
  }
}

function buildVocalCandidate({ docente, mesa, participacionesExistentes = [], requireCareerCompatibility = false }) {
  const docenteId = getDocenteId(docente)
  const rechazos = []
  const warnings = []
  const llamado = normalizeLlamado(mesa.llamado)
  const mesaAsSubject = buildMesaLikeSubject(mesa)
  const affinity = getNivelAfinidadDocenteMesa(docente, mesaAsSubject, { requireCareerCompatibility })
  const limite = calcularLimiteVocaliasPorLlamado(docente, {
    ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
  })
  const vocaliasAsignadas = contarVocaliasPorDocente(participacionesExistentes, docenteId, llamado)
  const disponibilidadWarning = getFechaAvailabilityWarning(mesa)
  const attendsInstitutionOnDate = mesa.fecha
    ? teacherIsAvailableOnDate(docente, mesa.fecha)
    : true
  const underTeachingHoursBasedLimit = limite > 0 && vocaliasAsignadas < limite
  const teacherAssignableOnDate = teacherCanBeAssignedOnDate({
    attendsInstitutionOnDate,
    underTeachingHoursBasedLimit,
  })

  if (!docenteId) rechazos.push('DOCENTE_NO_EXISTE')
  if (!docenteEstaActivo(docente)) rechazos.push('DOCENTE_INACTIVO')
  if (normalizeText(docenteId) === normalizeText(mesa.titularId)) rechazos.push('ES_TITULAR_DE_LA_MESA')
  if (!affinity.afinidadValida) {
    rechazos.push(affinity.nivelAfinidad === NIVELES_AFINIDAD.CARRERA_INCOMPATIBLE
      ? 'CARRERA_INCOMPATIBLE'
      : 'SIN_AFINIDAD')
  }
  if (!underTeachingHoursBasedLimit) rechazos.push('SUPERA_LIMITE_VOCALIAS')
  if (mesa.turno && !turnoCoincide(docente, mesa.turno)) rechazos.push('TURNO_INCOMPATIBLE')

  if (mesa.fecha && !attendsInstitutionOnDate) {
    rechazos.push('SIN_DISPONIBILIDAD')
  }

  if (docenteYaFiguraComoVocal(participacionesExistentes, docenteId, mesa.id)) {
    rechazos.push('DOCENTE_DUPLICADO_EN_MESA')
  }

  if (disponibilidadWarning) warnings.push(disponibilidadWarning)
  if (!mesa.turno) warnings.push('El turno se validara cuando este definido.')

  const puntajeAfinidad = AFFINITY_SCORE[affinity.nivelAfinidad] ?? 0

  return {
    docenteId,
    nombre: getDocenteNombre(docente),
    valido: rechazos.length === 0,
    nivelAfinidad: affinity.nivelAfinidad,
    motivoAfinidad: affinity.motivo,
    puntajeAfinidad,
    rechazos: [...new Set(rechazos)],
    warnings: [...new Set(warnings)],
    metadata: {
      limiteVocaliasPorLlamado: limite,
      vocaliasAsignadas,
      disponibilidadDias: getDiasDisponiblesCount(docente),
      cargaTotal: getCargaTotal(docente),
      teacherAssignableOnDate,
      halfPlusOneRuleMode: docente.halfPlusOneRuleMode ?? 'DAYS_BASED_HALF_PLUS_ONE',
      teachingHours: Number(docente.horasCatedra ?? docente.teachingHours) || 0,
    },
  }
}

function sortVocalCandidates(left, right) {
  if (left.valido !== right.valido) return left.valido ? -1 : 1
  if (left.valido && right.valido) {
    return (
      right.puntajeAfinidad - left.puntajeAfinidad ||
      left.metadata.vocaliasAsignadas - right.metadata.vocaliasAsignadas ||
      left.metadata.cargaTotal - right.metadata.cargaTotal ||
      right.metadata.disponibilidadDias - left.metadata.disponibilidadDias ||
      left.nombre.localeCompare(right.nombre)
    )
  }

  return left.nombre.localeCompare(right.nombre)
}

function summarize(mesasConCandidatos = []) {
  const totalCandidatosValidos = mesasConCandidatos.reduce((total, mesa) => (
    total + mesa.candidatosVocales.filter((candidate) => candidate.valido).length
  ), 0)
  const totalCandidatosRechazados = mesasConCandidatos.reduce((total, mesa) => (
    total + mesa.candidatosVocales.filter((candidate) => !candidate.valido).length
  ), 0)

  return {
    totalMesas: mesasConCandidatos.length,
    mesasSinCandidatos: mesasConCandidatos.filter((mesa) => (
      mesa.candidatosVocales.filter((candidate) => candidate.valido).length === 0
    )).length,
    mesasConUnCandidato: mesasConCandidatos.filter((mesa) => (
      mesa.candidatosVocales.filter((candidate) => candidate.valido).length === 1
    )).length,
    mesasConDosOMasCandidatos: mesasConCandidatos.filter((mesa) => (
      mesa.candidatosVocales.filter((candidate) => candidate.valido).length >= 2
    )).length,
    totalCandidatosValidos,
    totalCandidatosRechazados,
  }
}

export function buildVocalCandidatesForMesas(input = {}) {
  const mesasPreliminares = Array.isArray(input.mesasPreliminares) ? input.mesasPreliminares : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const participacionesExistentes = Array.isArray(input.participacionesExistentes)
    ? input.participacionesExistentes
    : []
  const requireCareerCompatibility = input.requireCareerCompatibility === true
  const warnings = []
  const errors = []

  const mesasConCandidatos = mesasPreliminares.map((mesa) => {
    const candidatosVocales = docentes
      .map((docente) => buildVocalCandidate({
        docente,
        mesa,
        participacionesExistentes,
        requireCareerCompatibility,
      }))
      .sort(sortVocalCandidates)
    const validos = candidatosVocales.filter((candidate) => candidate.valido)

    if (!validos.length) {
      warnings.push({
        code: 'MESA_SIN_CANDIDATOS_VOCALES',
        message: 'La mesa no tiene candidatos validos a vocal.',
        severity: 'warning',
        mesaId: mesa.id,
        materiaId: mesa.materiaId,
      })
    }

    return {
      mesaId: mesa.id,
      materiaId: mesa.materiaId,
      materia: mesa.materia,
      carreraId: mesa.carreraId,
      carrera: mesa.carrera,
      llamado: normalizeLlamado(mesa.llamado),
      titularId: mesa.titularId,
      candidatosVocales,
    }
  })

  return {
    mesasConCandidatos,
    warnings,
    errors,
    summary: summarize(mesasConCandidatos),
  }
}
