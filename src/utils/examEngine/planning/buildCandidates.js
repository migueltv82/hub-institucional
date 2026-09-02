import { normalizeExamPeriodConfig, validateExamPeriodConfig } from '../contracts.js'
import {
  detectarFamiliaMateria,
  FAMILIAS_AFINIDAD,
} from '../rules/affinities.js'
import { getLlamadosRequeridos } from '../rules/regularCalls.js'
import { buildRiskRanking } from '../diagnostics/riskRanking.js'
import {
  getSubjectCareer,
  getSubjectCode,
  getSubjectKey,
  getSubjectName,
  isNonGroupableSubject,
  normalizeText,
} from '../normalize/subjects.js'

// Candidate building creates possible mesa slots before assignment rules run.

const CRITICAL_FAMILIES = new Set([
  FAMILIAS_AFINIDAD.INGLES,
  FAMILIAS_AFINIDAD.INFORMATICA_TIC,
  FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA,
  FAMILIAS_AFINIDAD.PRACTICA_TECNICA,
])

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

function getTitularId(subject = {}) {
  return clean(
    subject.titular_id ??
    subject.titularId ??
    subject.presidente_id ??
    subject.profesorTitular ??
    subject.docenteTitular ??
    subject.titular?.id ??
    subject.titular?.nombre ??
    subject.titular,
  )
}

function materiaRequiereMesa(subject = {}) {
  if (subject.requiereMesa === false) return false
  if (subject.requiere_mesa === false) return false
  if (subject.requiresMesa === false) return false
  if (subject.noRequiereMesa === true) return false
  if (subject.excluida === true || subject.excluded === true) return false
  return true
}

function getAnio(subject = {}) {
  const raw = subject.anio ?? subject.año ?? subject.year ?? subject.nivel ?? ''
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : raw
}

function getMateriaId(subject = {}) {
  return clean(subject.id ?? subject.materiaId ?? subject.materia_id ?? getSubjectCode(subject) ?? getSubjectName(subject))
}

function getCarreraId(subject = {}) {
  return clean(subject.carreraId ?? subject.carrera_id ?? getSubjectCareer(subject))
}

function getRiskLevel(score) {
  if (score >= 80) return 'HIGH'
  if (score >= 35) return 'MEDIUM'
  return 'LOW'
}

function getSeverityScore(severity) {
  if (severity === 'HIGH') return 70
  if (severity === 'MEDIUM') return 35
  return 10
}

function createExcluded(subject = {}, reason, severity = 'critical') {
  return {
    materiaId: getMateriaId(subject),
    materia: getSubjectName(subject),
    carrera: getSubjectCareer(subject),
    reason,
    severity,
  }
}

function getCriticalErrorsForSubject(diagnosis = {}, subjectKey = '') {
  return (diagnosis.errors ?? []).filter((error) => (
    String(error.severity ?? '').toLowerCase() === 'critical' &&
    (
      error.entityId === subjectKey ||
      error.subjectKey === subjectKey ||
      error.materiaId === subjectKey
    )
  ))
}

function buildCorrelativityMaps(materias = [], correlatividades = []) {
  const previousBySubject = new Map()
  const nextBySubject = new Map()

  correlatividades.forEach((row) => {
    const subjectKey = getSubjectKey(row)
    const previas = Array.isArray(row.correlativas)
      ? row.correlativas
      : []

    if (!previas.length) return

    const currentPrevious = previousBySubject.get(subjectKey) ?? []
    previas.forEach((previa) => {
      const previaKey = getSubjectKey({ ...row, materia: previa, codigo: previa })
      currentPrevious.push(previa)

      const next = nextBySubject.get(previaKey) ?? []
      next.push(getSubjectName(row) || row.materia)
      nextBySubject.set(previaKey, next)
    })
    previousBySubject.set(subjectKey, currentPrevious)
  })

  materias.forEach((materia) => {
    const subjectKey = getSubjectKey(materia)
    const previas = Array.isArray(materia.correlativas) ? materia.correlativas : []
    if (!previas.length) return

    const currentPrevious = previousBySubject.get(subjectKey) ?? []
    previas.forEach((previa) => {
      currentPrevious.push(previa)
      const previaKey = getSubjectKey({ ...materia, materia: previa, codigo: previa })
      const next = nextBySubject.get(previaKey) ?? []
      next.push(getSubjectName(materia))
      nextBySubject.set(previaKey, next)
    })
    previousBySubject.set(subjectKey, currentPrevious)
  })

  return { previousBySubject, nextBySubject }
}

function buildRiskContext({ materia, docentes = [], diagnosis = {}, riskBySubject = new Map(), previous = [], next = [] }) {
  const reasons = []
  const warnings = []
  let score = 0

  const subjectKey = getSubjectKey(materia)
  const noAgrupable = isNonGroupableSubject(materia)
  const titularId = getTitularId(materia)
  const titular = buildDocenteMap(docentes).get(normalizeText(titularId))
  const family = detectarFamiliaMateria(materia)
  const subjectRisks = riskBySubject.get(subjectKey) ?? []

  if (noAgrupable) {
    score += 100
    reasons.push('Materia no agrupable por regla institucional')
  }

  if (previous.length || next.length) {
    score += 35
    reasons.push('Materia con correlatividades')
  }

  if (titular && getDiasDisponiblesCount(titular) <= 1) {
    score += 30
    reasons.push('Titular con baja disponibilidad')
  }

  if (titular?.estrategico === true || titular?.docenteEstrategico === true) {
    score += 25
    reasons.push('Materia de docente estrategico')
  }

  subjectRisks.forEach((risk) => {
    score += getSeverityScore(risk.severity)
    reasons.push(risk.reason)
    if (risk.severity !== 'HIGH') warnings.push(risk.reason)
  })

  if (CRITICAL_FAMILIES.has(family)) {
    score += 20
    reasons.push(`Materia de familia critica: ${family}`)
  }

  const anio = Number(getAnio(materia))
  if (Number.isFinite(anio) && anio >= 4) {
    score += 10
    reasons.push('Materia de anio superior')
  }

  ;(diagnosis.warnings ?? [])
    .filter((warning) => warning.entityId === subjectKey || warning.subjectKey === subjectKey)
    .forEach((warning) => warnings.push(warning.message ?? warning.code))

  return {
    noAgrupable,
    family,
    reasons: [...new Set(reasons)],
    warnings: [...new Set(warnings)],
    score,
  }
}

function buildRiskBySubject(riskRanking = []) {
  return riskRanking.reduce((map, risk) => {
    if (risk.entityType !== 'MATERIA') return map
    const risks = map.get(risk.entityId) ?? []
    risks.push(risk)
    map.set(risk.entityId, risks)
    return map
  }, new Map())
}

function summarize(candidates = [], excluded = []) {
  const candidatesByCareer = {}
  const candidatesByCall = {}

  candidates.forEach((candidate) => {
    candidatesByCareer[candidate.carrera] = (candidatesByCareer[candidate.carrera] ?? 0) + 1
    candidate.llamadosRequeridos.forEach((llamado) => {
      candidatesByCall[llamado] = (candidatesByCall[llamado] ?? 0) + 1
    })
  })

  return {
    totalMaterias: candidates.length + excluded.length,
    totalCandidates: candidates.length,
    totalExcluded: excluded.length,
    highRiskCandidates: candidates.filter((candidate) => candidate.riskLevel === 'HIGH').length,
    nonGroupableCandidates: candidates.filter((candidate) => candidate.noAgrupable).length,
    candidatesByCareer,
    candidatesByCall,
  }
}

export function buildMesaCandidate({ call = null, date = '', subject = {} } = {}) {
  return {
    call,
    date,
    subject,
    subjectKey: getSubjectKey(subject),
    titular: null,
    vocales: [],
    score: 0,
    reasons: [],
  }
}

export function buildMesaCandidates({ calls = [], datesByCall = new Map(), subjects = [] } = {}) {
  return calls.flatMap((call) => {
    const dates = datesByCall.get(call.key) ?? []

    return subjects.flatMap((subject) => (
      dates.map((date) => buildMesaCandidate({ call, date, subject }))
    ))
  })
}

export function buildExamTableCandidates(input = {}) {
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const materias = Array.isArray(input.materias) ? input.materias : []
  const correlatividades = Array.isArray(input.correlatividades) ? input.correlatividades : []
  const config = input.config ?? input.examPeriodConfig ?? input.diagnosis?.examPeriodConfig ?? {}
  const diagnosis = input.diagnosis ?? {}
  const configValidation = validateExamPeriodConfig(config)
  const normalizedConfig = normalizeExamPeriodConfig(config)
  const llamadosRequeridos = configValidation.valid ? getLlamadosRequeridos(normalizedConfig) : []
  const docenteMap = buildDocenteMap(docentes)
  const riskRanking = Array.isArray(diagnosis.riskRanking) && diagnosis.riskRanking.length
    ? diagnosis.riskRanking
    : buildRiskRanking({ docentes, materias })
  const riskBySubject = buildRiskBySubject(riskRanking)
  const { previousBySubject, nextBySubject } = buildCorrelativityMaps(materias, correlatividades)
  const candidates = []
  const excluded = []
  const warnings = []
  const errors = []

  if (!configValidation.valid) {
    errors.push(...configValidation.errors)
  }

  materias.forEach((materia) => {
    const materiaId = getMateriaId(materia)
    const materiaCodigo = getSubjectCode(materia)
    const materiaNombre = getSubjectName(materia)
    const carrera = getSubjectCareer(materia)
    const subjectKey = getSubjectKey(materia)
    const titularId = getTitularId(materia)

    if (!materiaRequiereMesa(materia)) {
      excluded.push(createExcluded(materia, 'La materia no requiere mesa', 'info'))
      return
    }

    if (!materiaId || !materiaNombre || !carrera) {
      excluded.push(createExcluded(materia, 'Datos minimos incompletos', 'critical'))
      return
    }

    const criticalErrors = getCriticalErrorsForSubject(diagnosis, subjectKey)
    if (criticalErrors.length) {
      excluded.push(createExcluded(materia, criticalErrors[0].message ?? criticalErrors[0].code, 'critical'))
      return
    }

    if (!titularId) {
      excluded.push(createExcluded(materia, 'Materia sin titular', 'critical'))
      return
    }

    const titular = docenteMap.get(normalizeText(titularId))
    if (!titular) {
      excluded.push(createExcluded(materia, 'Titular inexistente', 'critical'))
      return
    }

    if (!docenteEstaActivo(titular)) {
      excluded.push(createExcluded(materia, 'Titular inactivo', 'critical'))
      return
    }

    if (!configValidation.valid || !llamadosRequeridos.length) {
      excluded.push(createExcluded(materia, 'Configuracion de periodo invalida', 'critical'))
      return
    }

    const correlativasPrevias = previousBySubject.get(subjectKey) ?? []
    const correlativasPosteriores = nextBySubject.get(subjectKey) ?? []
    const riskContext = buildRiskContext({
      materia,
      docentes,
      diagnosis,
      riskBySubject,
      previous: correlativasPrevias,
      next: correlativasPosteriores,
    })
    const riskScore = riskContext.score
    const candidateWarnings = [...riskContext.warnings]
    if (riskContext.noAgrupable) {
      candidateWarnings.push('Materia no agrupable por regla institucional')
    }

    candidates.push({
      id: `candidate:${subjectKey}`,
      materiaId,
      materiaCodigo,
      codigo: materiaCodigo,
      materia: materiaNombre,
      carreraId: getCarreraId(materia),
      carrera,
      anio: getAnio(materia),
      titularId,
      titularNombre: getDocenteLabel(titular),
      requiereMesa: true,
      llamadosRequeridos: [...llamadosRequeridos],
      noAgrupable: riskContext.noAgrupable,
      familiaIdoneidad: riskContext.family,
      correlativasPrevias: [...new Set(correlativasPrevias)],
      correlativasPosteriores: [...new Set(correlativasPosteriores)],
      riskScore,
      riskLevel: getRiskLevel(riskScore),
      reasons: riskContext.reasons,
      warnings: [...new Set(candidateWarnings)],
      metadata: {
        subjectKey,
        materiaCodigo,
        originalIndex: candidates.length,
      },
    })
  })

  candidates.sort((left, right) => (
    Number(right.noAgrupable) - Number(left.noAgrupable) ||
    right.riskScore - left.riskScore ||
    Number(right.anio || 0) - Number(left.anio || 0) ||
    left.materia.localeCompare(right.materia)
  ))

  return {
    candidates,
    excluded,
    warnings,
    errors,
    summary: summarize(candidates, excluded),
  }
}
