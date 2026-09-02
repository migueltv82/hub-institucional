import { createParticipacionTribunal } from '../../contracts.js'
import { teacherIsAvailableOnDate } from '../../rules/availability.js'
import {
  buildTribunalCandidatePool,
  findTribunalDocente,
  getTribunalDocenteId,
  getTribunalDocenteLabel,
} from './buildTribunalCandidatePool.js'

export const GENERATED_TRIBUNAL_STATUSES = {
  TRIBUNAL_COMPLETE: 'TRIBUNAL_COMPLETE',
  TRIBUNAL_MINIMUM: 'TRIBUNAL_MINIMUM',
  TRIBUNAL_INCOMPLETE: 'TRIBUNAL_INCOMPLETE',
  NEEDS_INSTITUTIONAL_REVIEW: 'NEEDS_INSTITUTIONAL_REVIEW',
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

function createAlert(code, message, severity = 'warning', extra = {}) {
  return {
    code,
    message,
    severity,
    ...extra,
  }
}

function resolveTitular(mesa = {}, docenteMap = new Map()) {
  const rawTitular = clean(mesa.titularId || mesa.titular)
  const docente = findTribunalDocente(docenteMap, rawTitular)

  if (docente) {
    return {
      titularId: getTribunalDocenteId(docente),
      titular: getTribunalDocenteLabel(docente),
      docente,
      found: true,
    }
  }

  return {
    titularId: clean(mesa.titularId),
    titular: clean(mesa.titular),
    docente: null,
    found: false,
  }
}

function validateLockedTitular({ mesa, titular }) {
  const alertas = []
  if (!clean(titular.titularId || titular.titular)) {
    alertas.push(createAlert('TITULAR_MISSING', 'La mesa no tiene titular confirmado.', 'critical'))
    return alertas
  }

  if (!titular.found) {
    alertas.push(createAlert('TITULAR_NOT_FOUND', 'El titular confirmado no existe en docentes.', 'critical', {
      titularId: titular.titularId,
      titular: titular.titular,
    }))
    return alertas
  }

  const fecha = clean(mesa.fechaSugerida ?? mesa.fecha)
  if (fecha && !teacherIsAvailableOnDate(titular.docente, fecha)) {
    alertas.push(createAlert('TITULAR_UNAVAILABLE', 'El titular confirmado no figura disponible en la fecha revisada.', 'warning', {
      titularId: titular.titularId,
      fecha,
    }))
  }

  return alertas
}

function createVocalParticipation(mesa = {}, candidate = {}, rol = '') {
  return createParticipacionTribunal({
    docenteId: candidate.docenteId,
    mesaId: mesa.draftMesaId ?? mesa.id,
    materiaId: mesa.materiaId,
    carreraId: mesa.carreraId,
    rol,
    llamado: mesa.llamado,
    fecha: mesa.fechaSugerida ?? mesa.fecha,
    turno: mesa.turno,
  })
}

function selectedToFields(selected = []) {
  const [vocal1, vocal2] = selected

  return {
    vocal1: vocal1?.nombre ?? '',
    vocal1Id: vocal1?.docenteId ?? '',
    vocal2: vocal2?.nombre ?? '',
    vocal2Id: vocal2?.docenteId ?? '',
  }
}

export function getEstado({ selected = [], titularAlerts = [], rules = {} }) {
  if (titularAlerts.some((alert) => alert.severity === 'critical')) {
    return GENERATED_TRIBUNAL_STATUSES.NEEDS_INSTITUTIONAL_REVIEW
  }

  if (selected.length >= rules.idealVocales) return GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_COMPLETE
  if (selected.length >= rules.minimoVocales && rules.permitirTribunalMinimo) return GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_MINIMUM
  return GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_INCOMPLETE
}

// Prepares everything about a mesa that does not depend on which vocales get
// picked: locked titular resolution, alerts and the full candidate pool for
// the current `participaciones` snapshot. Shared by the automatic assigner
// and by interactive, human-driven selection (both need the same rules).
export function prepareTribunalMesaContext({
  mesa = {},
  docentes = [],
  docenteMap = new Map(),
  participaciones = [],
  tribunalRules = {},
} = {}) {
  const baseMesa = clonePlain(mesa)
  const titular = resolveTitular(baseMesa, docenteMap)
  const titularAlerts = validateLockedTitular({ mesa: baseMesa, titular })
  const decisionTrace = []
  const alertas = [
    ...(Array.isArray(baseMesa.alertas) ? baseMesa.alertas : []),
    ...titularAlerts,
  ]

  if (baseMesa.lockedForTribunalGeneration) {
    decisionTrace.push('Fecha, materia y titular respetados desde cronograma revisado.')
    alertas.push(createAlert('LOCKED_DATA_RESPECTED', 'Se respetaron los datos bloqueados del cronograma revisado.', 'info'))
  }

  const candidatePool = buildTribunalCandidatePool({
    mesa: {
      ...baseMesa,
      titularId: titular.titularId || baseMesa.titularId,
      titular: titular.titular || baseMesa.titular,
    },
    docentes,
    participaciones,
    tribunalRules,
  })

  return {
    baseMesa,
    titular,
    titularAlerts,
    alertas,
    decisionTrace,
    candidatePool,
    tribunalRules,
  }
}

// Closes a mesa given an already decided list of selected candidates (0-2,
// in vocal1/vocal2 order). Used both by the automatic top-N picker and by
// interactive selection, where a human chooses among `candidatePool.validCandidates`.
export function finalizeTribunalMesaSelection({ context, selected = [] } = {}) {
  const { baseMesa, titular, titularAlerts, candidatePool, tribunalRules } = context
  const decisionTrace = [...context.decisionTrace]
  const alertas = [...context.alertas]
  const assignedParticipaciones = []

  selected.forEach((candidate, index) => {
    const positionalRol = index === 0 ? 'VOCAL_1' : 'VOCAL_2'
    const rol = candidate.lockedCrossTitular === true ? 'TRIBUNAL_CRUZADO' : positionalRol
    assignedParticipaciones.push(createVocalParticipation(baseMesa, candidate, rol))
    decisionTrace.push(`${positionalRol === 'VOCAL_1' ? 'Vocal 1' : 'Vocal 2'} asignado: ${candidate.nombre} (${candidate.nivelAfinidad}).`)
    alertas.push(...candidate.alertas)
  })

  const crossTitularVocales = selected
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.lockedCrossTitular === true)
    .map(({ candidate, index }) => ({
      docenteId: candidate.docenteId,
      nombre: candidate.nombre,
      rol: index === 0 ? 'VOCAL_1' : 'VOCAL_2',
      sourceMesaId: candidate.sourceMesaId,
    }))

  if (!selected.length) {
    alertas.push(createAlert('NO_VOCAL_CANDIDATES', 'No se encontraron vocales validos para la mesa.', 'critical'))
  } else if (selected.length === 1) {
    alertas.push(createAlert('TRIBUNAL_MINIMUM_ONLY', 'La mesa queda con tribunal minimo.', 'warning'))
    alertas.push(createAlert('ONLY_ONE_VOCAL_ASSIGNED', 'Solo se pudo asignar un vocal.', 'warning'))
  }

  const estado = getEstado({
    selected,
    titularAlerts,
    rules: tribunalRules,
  })

  return {
    mesa: {
      ...baseMesa,
      fecha: clean(baseMesa.fechaSugerida ?? baseMesa.fecha),
      fechaSugerida: clean(baseMesa.fechaSugerida ?? baseMesa.fecha),
      titularId: titular.titularId || baseMesa.titularId,
      titular: titular.titular || baseMesa.titular,
      ...selectedToFields(selected),
      estado,
      alertas,
      lockedForTribunalGeneration: baseMesa.lockedForTribunalGeneration === true,
      reviewSource: baseMesa.reviewSource,
      decisionTrace,
      metadata: {
        ...(baseMesa.metadata ?? {}),
        ...(crossTitularVocales.length ? { crossTitularVocales } : {}),
        tribunalCandidatePool: candidatePool.candidates.map((candidate) => ({
          docenteId: candidate.docenteId,
          nombre: candidate.nombre,
          valido: candidate.valido,
          score: candidate.score,
          nivelAfinidad: candidate.nivelAfinidad,
          rechazos: candidate.rechazos,
        })),
      },
    },
    participaciones: assignedParticipaciones,
    candidatePool,
  }
}

// Greedy top-N pick used by automatic assignment. Extracted so interactive
// "auto-complete" can pre-fill selections mesa by mesa while still letting a
// human override any single pick afterwards.
export function pickAutomaticVocalSelection(candidatePool = { validCandidates: [] }, tribunalRules = {}) {
  const selected = []

  for (const candidate of candidatePool.validCandidates) {
    if (selected.length >= tribunalRules.idealVocales) break
    if (selected.some((item) => item.docenteId === candidate.docenteId)) continue

    selected.push(candidate)
  }

  return selected
}

export function assignVocalesForReviewedMesa({
  mesa = {},
  docentes = [],
  docenteMap = new Map(),
  participaciones = [],
  tribunalRules = {},
} = {}) {
  const context = prepareTribunalMesaContext({
    mesa,
    docentes,
    docenteMap,
    participaciones,
    tribunalRules,
  })
  const selected = pickAutomaticVocalSelection(context.candidatePool, tribunalRules)

  return finalizeTribunalMesaSelection({ context, selected })
}
