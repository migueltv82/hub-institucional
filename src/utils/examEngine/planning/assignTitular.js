import { teacherIsAvailableOnDate } from '../rules/availability.js'
import { normalizeText } from '../normalize/subjects.js'
import {
  mesaTieneTitular,
  obtenerTitularMesa,
} from '../rules/roleConflicts.js'
import { validarTitularObligatorio } from '../validation/validateMesa.js'

// Institutional rule: every mesa must have a titular. This phase should never silently omit it.

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

function getDocenteLabel(docente = {}) {
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

function getCandidateTurno(candidate = {}) {
  return clean(candidate.turno ?? candidate.metadata?.turno ?? candidate.materia?.turno ?? '')
}

function titularCoincideConTurno(docente = {}, turno = '') {
  const turnoKey = normalizeText(turno)
  if (!turnoKey) return true

  const turnosDocente = getTurnosDocente(docente)
  if (!turnosDocente.length) return true
  return turnosDocente.includes(turnoKey)
}

function createError({ code, message, candidate = {}, titularId = '', severity = 'critical' }) {
  return {
    code,
    message,
    severity,
    candidateId: candidate.id,
    materiaId: candidate.materiaId,
    titularId,
  }
}

function createWarning({ code, message, candidate = {}, titularId = '', llamado = null, extra = {} }) {
  return {
    code,
    message,
    severity: 'warning',
    candidateId: candidate.id,
    materiaId: candidate.materiaId,
    titularId,
    llamado,
    ...extra,
  }
}

function getMateriaTitular(materia = {}) {
  return clean(
    materia.titular_id ??
    materia.titularId ??
    materia.presidente_id ??
    materia.profesorTitular ??
    materia.docenteTitularId ??
    materia.docenteTitular ??
    materia.titular?.id ??
    materia.titular?.nombre ??
    '',
  )
}

export function findTitularCandidates({ candidate = {}, teacherRows = [] } = {}) {
  return teacherRows.filter((teacherRow) => (
    teacherIsAvailableOnDate(teacherRow, candidate.date)
  ))
}

export function assignTitularToCandidate({ candidate = {}, teacherRows = [] } = {}) {
  const titular = findTitularCandidates({ candidate, teacherRows })[0] ?? null

  if (!titular) {
    return {
      ...candidate,
      titular: null,
      errors: [
        ...(candidate.errors ?? []),
        { code: 'TITULAR_REQUIRED', message: 'No titular candidate available.' },
      ],
    }
  }

  return {
    ...candidate,
    titular,
  }
}

export function asignarTitularDesdeMateria(mesa = {}, materia = {}, docentes = []) {
  const titularActual = obtenerTitularMesa(mesa)
  const titularMateria = getMateriaTitular(materia)
  const mesaConTitular = mesaTieneTitular(mesa) || !titularMateria
    ? { ...mesa }
    : {
        ...mesa,
        titular_id: mesa.titular_id ?? titularMateria,
        titularId: mesa.titularId ?? titularMateria,
        profesorTitular: mesa.profesorTitular ?? titularMateria,
      }
  const validation = validarTitularObligatorio(mesaConTitular, docentes)

  if (!validation.valid) {
    return {
      ...mesaConTitular,
      titular_id: mesaConTitular.titular_id ?? titularActual,
      titularError: {
        code: validation.error,
        severity: 'critical',
        titularId: validation.titularId,
      },
    }
  }

  return {
    ...mesaConTitular,
    titularError: null,
  }
}

function buildPreliminaryMesa({ candidate, llamado, titular, turno, warnings = [] }) {
  return {
    id: `mesa-preliminar:${candidate.id}:${llamado}`,
    candidateId: candidate.id,
    materiaId: candidate.materiaId,
    materiaCodigo: candidate.materiaCodigo,
    codigo: candidate.codigo ?? candidate.materiaCodigo,
    materia: candidate.materia,
    carreraId: candidate.carreraId,
    carrera: candidate.carrera,
    anio: candidate.anio,
    llamado,
    titularId: candidate.titularId,
    titularNombre: getDocenteLabel(titular),
    estado: 'PENDIENTE_FECHA',
    vocal1Id: null,
    vocal2Id: null,
    fecha: null,
    hora: null,
    turno: turno || null,
    noAgrupable: Boolean(candidate.noAgrupable),
    familiaIdoneidad: candidate.familiaIdoneidad,
    correlativasPrevias: [...(candidate.correlativasPrevias ?? [])],
    correlativasPosteriores: [...(candidate.correlativasPosteriores ?? [])],
    riskScore: candidate.riskScore ?? 0,
    riskLevel: candidate.riskLevel ?? 'LOW',
    warnings,
    errors: [],
    metadata: {
      ...(candidate.metadata ?? {}),
      sourceCandidateId: candidate.id,
      titularidadNoConsumeHalfPlusOne: true,
    },
  }
}

function summarizeAssignment(candidates = [], mesasPreliminares = [], errors = []) {
  const mesasPorLlamado = {}
  mesasPreliminares.forEach((mesa) => {
    mesasPorLlamado[mesa.llamado] = (mesasPorLlamado[mesa.llamado] ?? 0) + 1
  })

  return {
    totalCandidates: candidates.length,
    totalMesasPreliminares: mesasPreliminares.length,
    totalTitularesAsignados: mesasPreliminares.filter((mesa) => mesa.titularId).length,
    totalSinTitular: errors.filter((error) => error.code === 'TITULAR_REQUIRED').length,
    mesasPorLlamado,
  }
}

export function assignTitularesToCandidates(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const docenteMap = buildDocenteMap(docentes)
  const mesasPreliminares = []
  const errors = []
  const warnings = []
  const titularMesaCounts = new Map()

  candidates.forEach((candidate) => {
    const titularId = clean(candidate.titularId)

    if (!titularId) {
      errors.push(createError({
        code: 'TITULAR_REQUIRED',
        message: 'El candidato no tiene titular asignado.',
        candidate,
      }))
      return
    }

    const titular = docenteMap.get(normalizeText(titularId))
    if (!titular) {
      errors.push(createError({
        code: 'TITULAR_NOT_FOUND',
        message: 'El titular del candidato no existe en docentes.',
        candidate,
        titularId,
      }))
      return
    }

    if (!docenteEstaActivo(titular)) {
      errors.push(createError({
        code: 'TITULAR_INACTIVE',
        message: 'El titular del candidato esta inactivo.',
        candidate,
        titularId,
      }))
      return
    }

    const llamados = Array.isArray(candidate.llamadosRequeridos) ? candidate.llamadosRequeridos : []
    const turno = getCandidateTurno(candidate)
    const candidateWarnings = []

    if (!getDiasDisponiblesCount(titular)) {
      candidateWarnings.push(createWarning({
        code: 'TITULAR_SIN_DISPONIBILIDAD',
        message: 'El titular no tiene disponibilidad cargada.',
        candidate,
        titularId,
      }))
    }

    if (!turno) {
      candidateWarnings.push(createWarning({
        code: 'TURNO_NO_DEFINIDO',
        message: 'Falta turno para la mesa preliminar.',
        candidate,
        titularId,
      }))
    } else if (!titularCoincideConTurno(titular, turno)) {
      candidateWarnings.push(createWarning({
        code: 'TITULAR_TURNO_NO_COINCIDE',
        message: 'El turno del candidato no coincide con los turnos declarados del titular.',
        candidate,
        titularId,
        extra: { turno },
      }))
    }

    const newMesaCount = llamados.length
    const currentMesaCount = titularMesaCounts.get(titularId) ?? 0
    const totalTitularMesas = currentMesaCount + newMesaCount
    titularMesaCounts.set(titularId, totalTitularMesas)

    if (totalTitularMesas >= 3) {
      candidateWarnings.push(createWarning({
        code: 'TITULAR_MUCHAS_MESAS_PROPIAS',
        message: 'El titular acumula muchas mesas propias.',
        candidate,
        titularId,
        extra: { totalMesasPropias: totalTitularMesas },
      }))
    }

    warnings.push(...candidateWarnings)

    llamados.forEach((llamado) => {
      const mesaWarnings = candidateWarnings.map((warning) => ({
        ...warning,
        llamado,
      }))

      mesasPreliminares.push(buildPreliminaryMesa({
        candidate,
        llamado,
        titular,
        turno,
        warnings: mesaWarnings,
      }))
    })
  })

  return {
    mesasPreliminares,
    errors,
    warnings,
    summary: summarizeAssignment(candidates, mesasPreliminares, errors),
  }
}
