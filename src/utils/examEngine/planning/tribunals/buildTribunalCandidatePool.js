import { normalizeLlamado } from '../../contracts.js'
import { getDayName } from '../../normalize/dates.js'
import { normalizeText } from '../../normalize/subjects.js'
import {
  canServiceEnglishTeacherBeVocalForMesa,
  getNivelAfinidadDocenteMesa,
  isAfinidadDebil,
  NIVELES_AFINIDAD,
} from '../../rules/affinities.js'
import { teacherIsAvailableOnDate } from '../../rules/availability.js'
import {
  calculateTeacherAssignmentLimit,
  TEACHER_ASSIGNMENT_RULE_MODES,
} from '../../rules/calculateTeacherAssignmentLimit.js'
import { contarVocaliasPorDocente } from '../../rules/halfPlusOne.js'
import { scoreTribunalCandidate } from './scoreTribunalCandidate.js'

function clean(value) {
  return String(value ?? '').trim()
}

function uniqueCount(value) {
  if (Array.isArray(value)) return new Set(value.map(clean).filter(Boolean).map(normalizeText)).size
  if (value instanceof Set) return uniqueCount([...value])

  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

export function getTribunalDocenteId(docente = {}) {
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

export function getTribunalDocenteLabel(docente = {}) {
  if (typeof docente === 'string') return docente

  return clean(
    docente.nombre ??
    docente.full_name ??
    docente.display_name ??
    docente.profesor ??
    docente.docente ??
    getTribunalDocenteId(docente),
  )
}

export function getTribunalDocenteKeys(docente = {}) {
  if (typeof docente === 'string') return [normalizeText(docente)].filter(Boolean)

  return [
    docente.id,
    docente.docenteId,
    docente.teacherKey,
    docente.dni,
    docente.email,
    docente.nombre,
    docente.full_name,
    docente.display_name,
    docente.profesor,
    docente.docente,
  ].map(normalizeText).filter(Boolean)
}

export function buildTribunalDocenteMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    getTribunalDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
}

export function findTribunalDocente(docenteMap = new Map(), value = '') {
  return docenteMap.get(normalizeText(value)) ?? null
}

function docenteEstaActivo(docente = {}) {
  if (!('activo' in docente) && !('active' in docente) && !('isActive' in docente)) return true
  return docente.activo !== false && docente.active !== false && docente.isActive !== false
}

function docenteEstaConLicencia(docente = {}) {
  return docente.licencia === true ||
    docente.conLicencia === true ||
    docente.onLeave === true ||
    docente.excluido === true ||
    docente.excluded === true
}

function getDiasDisponiblesCount(docente = {}) {
  return uniqueCount(
    docente.diasAsistencia ??
    docente.diasDisponibles ??
    docente.disponibilidad ??
    docente.diasLaborales ??
    docente.cantidadDiasAsistencia ??
    docente.cantidadDiasDisponibles,
  )
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

export function getParticipationDocenteId(participacion = {}) {
  return clean(
    participacion.docenteId ??
    participacion.teacherKey ??
    participacion.teacherId ??
    participacion.docente?.id ??
    participacion.docente ??
    participacion.profesor,
  )
}

function getParticipationFecha(participacion = {}) {
  return clean(participacion.fecha ?? participacion.fechaIso ?? participacion.date ?? participacion.mesa?.fecha)
}

function countParticipacionesMismoDia(participaciones = [], docenteId = '', fecha = '') {
  const docenteKey = normalizeText(docenteId)
  if (!docenteKey || !fecha) return 0

  return participaciones.filter((participacion) => (
    normalizeText(getParticipationDocenteId(participacion)) === docenteKey &&
    getParticipationFecha(participacion) === fecha
  )).length
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

function calculateVocalLimit(docente = {}, rules = {}) {
  if (rules.aplicarMitadMasUno === false) {
    return {
      limit: Number.POSITIVE_INFINITY,
      valid: true,
      baseValue: null,
      ruleMode: 'DISABLED',
      warningCode: '',
    }
  }

  return calculateTeacherAssignmentLimit({
    teacher: docente,
    ruleMode: TEACHER_ASSIGNMENT_RULE_MODES.TEACHING_HOURS_HALF_PLUS_ONE,
    fallbackRuleMode: rules.fallbackADiasAsistencia === true
      ? TEACHER_ASSIGNMENT_RULE_MODES.DAYS_BASED_HALF_PLUS_ONE
      : '',
  })
}

function createCandidate({ docente, mesa, participaciones, rules }) {
  const docenteId = getTribunalDocenteId(docente)
  const docenteNombre = getTribunalDocenteLabel(docente)
  const rechazos = []
  const alertas = []
  const llamado = normalizeLlamado(mesa.llamado)
  const fecha = clean(mesa.fechaSugerida ?? mesa.fecha)
  const mesaAsSubject = buildMesaAsSubject(mesa)
  const titularesInvolucrados = new Set([
    mesa.titularId,
    ...(Array.isArray(mesa.titularesInvolucrados) ? mesa.titularesInvolucrados : []),
  ].map(normalizeText).filter(Boolean))
  const affinity = getNivelAfinidadDocenteMesa(docente, mesaAsSubject, { requireCareerCompatibility: true })
  const limitResult = calculateVocalLimit(docente, rules)
  const vocaliasAsignadas = rules.aplicarMitadMasUno === false
    ? 0
    : contarVocaliasPorDocente(participaciones, docenteId, llamado)
  const withinHalfPlusOne = rules.aplicarMitadMasUno === false ||
    (limitResult.limit > 0 && vocaliasAsignadas < limitResult.limit)
  const participacionesMismoDia = countParticipacionesMismoDia(participaciones, docenteId, fecha)
  const withinDailyMax = participacionesMismoDia < rules.maxParticipacionesDocentePorDia
  const available = fecha ? teacherIsAvailableOnDate(docente, fecha) : true
  const serviceEnglishVocalAllowed = canServiceEnglishTeacherBeVocalForMesa(docente, mesaAsSubject)

  if (!docenteId) rechazos.push('DOCENTE_NO_EXISTE')
  if (!docenteEstaActivo(docente)) rechazos.push('DOCENTE_INACTIVO')
  if (docenteEstaConLicencia(docente)) rechazos.push('DOCENTE_CON_LICENCIA')
  if (titularesInvolucrados.has(normalizeText(docenteId))) rechazos.push('ES_TITULAR_DE_LA_MESA')
  if (!serviceEnglishVocalAllowed) rechazos.push('DOCENTE_INGLES_SERVICIO_SOLO_MESAS_INGLES')
  if (!affinity.afinidadValida) {
    rechazos.push(affinity.nivelAfinidad === NIVELES_AFINIDAD.CARRERA_INCOMPATIBLE
      ? 'CARRERA_INCOMPATIBLE'
      : 'SIN_AFINIDAD')
  }
  if (!available) rechazos.push('SIN_DISPONIBILIDAD')
  if (!withinHalfPlusOne) rechazos.push('SUPERA_MITAD_MAS_UNO')
  if (!withinDailyMax) rechazos.push('SUPERA_MAXIMO_DIARIO')

  if (isAfinidadDebil(affinity.nivelAfinidad)) {
    alertas.push({
      code: 'WEAK_AFFINITY',
      message: 'El candidato tiene afinidad debil y requiere revision institucional.',
      severity: 'warning',
      docenteId,
    })
  }

  if (limitResult.warningCode) {
    alertas.push({
      code: limitResult.warningCode,
      message: 'No se pudo calcular completamente el cupo de vocalias del docente.',
      severity: 'warning',
      docenteId,
    })
  }

  const candidate = {
    docente,
    docenteId,
    nombre: docenteNombre,
    valido: rechazos.length === 0,
    rechazos: [...new Set(rechazos)],
    alertas,
    nivelAfinidad: affinity.nivelAfinidad,
    motivoAfinidad: affinity.motivo,
    vocaliasAsignadas,
    limiteVocalias: limitResult.limit,
    limitBaseValue: limitResult.baseValue,
    ruleMode: limitResult.ruleMode,
    participacionesMismoDia,
    disponibilidadDias: getDiasDisponiblesCount(docente),
    cargaTotal: getCargaTotal(docente),
    fecha,
    diaSemana: getDayName(fecha),
  }

  return {
    ...candidate,
    score: scoreTribunalCandidate(candidate),
  }
}

function sortCandidates(left = {}, right = {}) {
  if (left.valido !== right.valido) return left.valido ? -1 : 1

  return (
    Number(right.score ?? 0) - Number(left.score ?? 0) ||
    Number(left.vocaliasAsignadas ?? 0) - Number(right.vocaliasAsignadas ?? 0) ||
    Number(left.participacionesMismoDia ?? 0) - Number(right.participacionesMismoDia ?? 0) ||
    clean(left.nombre).localeCompare(clean(right.nombre)) ||
    clean(left.docenteId).localeCompare(clean(right.docenteId))
  )
}

export function buildTribunalCandidatePool({
  mesa = {},
  docentes = [],
  participaciones = [],
  tribunalRules = {},
} = {}) {
  const candidates = docentes
    .map((docente) => createCandidate({
      docente,
      mesa,
      participaciones,
      rules: tribunalRules,
    }))
    .sort(sortCandidates)

  return {
    mesaId: mesa.draftMesaId ?? mesa.id,
    candidates,
    validCandidates: candidates.filter((candidate) => candidate.valido),
    rejectedCandidates: candidates.filter((candidate) => !candidate.valido),
  }
}
