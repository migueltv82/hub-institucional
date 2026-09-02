import { buildFeasibilityDiagnosis } from '../diagnostics/feasibility.js'
import { validateCronograma } from '../validation/validateCronograma.js'
import { validateTribunals } from '../validation/validateTribunals.js'
import { assignTitularesToCandidates } from '../planning/assignTitular.js'
import { assignVocalesToMesas } from '../planning/assignVocales.js'
import { buildExamTableCandidates } from '../planning/buildCandidates.js'
import { buildVocalCandidatesForMesas } from '../planning/buildVocalCandidates.js'
import { compactCompatibleMesas } from '../planning/compactMesas.js'
import { planTentativeDates } from '../planning/planTentativeDates.js'
import { repairIncompleteTribunals } from '../planning/repairTribunals.js'
import {
  detectarFamiliaMateria,
  FAMILIAS_AFINIDAD,
  NIVELES_AFINIDAD,
} from '../rules/affinities.js'
import { normalizeText } from '../normalize/subjects.js'

const DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
]

const DAY_ALIASES = {
  lunes: 'lunes',
  martes: 'martes',
  miercoles: 'miercoles',
  jueves: 'jueves',
  viernes: 'viernes',
  sabado: 'sabado',
  domingo: 'domingo',
}

const FALLBACK_MODES = {
  NONE: 'none',
  FAMILY_IF_ZERO: 'family-if-zero',
  TRANSVERSAL_ENGLISH_IT: 'transversal-english-it',
  PEDAGOGIC: 'pedagogic',
  TECHNICAL: 'technical',
  SAFE_COMBO: 'safe-combo',
}

const FALLBACK_SCORE = 58

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function cloneJson(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function normalizeAcademicText(value) {
  return normalizeText(value)
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

function normalizeToken(value) {
  return normalizeAcademicText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function normalizeDay(value) {
  return DAY_ALIASES[normalizeToken(value)] ?? ''
}

function parseIsoDate(value) {
  const text = clean(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function dateSlotCall(slot = {}) {
  return clean(slot.llamado ?? slot.exam_call ?? slot.callKey) || 'SIN_LLAMADO'
}

function dateSlotTurn(slot = {}) {
  return clean(slot.turno ?? slot.shift) || 'SIN_TURNO'
}

function increment(counts, key, amount = 1) {
  const safeKey = clean(key) || 'sin_dato'
  counts[safeKey] = (counts[safeKey] ?? 0) + amount
}

function topEntries(counts = {}, limit = 20) {
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit)
}

function uniqueValues(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))]
}

function getDocenteId(docente = {}) {
  if (typeof docente === 'string') return clean(docente)
  return clean(docente.id ?? docente.docenteId ?? docente.teacherKey ?? docente.dni ?? docente.email ?? docente.nombre)
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
    const id = getDocenteId(docente)
    if (id) map.set(normalizeText(id), docente)
    return map
  }, new Map())
}

function findDocente(docenteMap, docenteId = '') {
  return docenteMap.get(normalizeText(docenteId)) ?? null
}

function getVocalIds(mesa = {}) {
  return [mesa.vocal1Id, mesa.vocal2Id].map(clean).filter(Boolean)
}

function getVocalCount(mesa = {}) {
  return new Set(getVocalIds(mesa).map(normalizeText)).size
}

function hasTitular(mesa = {}) {
  return Boolean(clean(mesa.titularId ?? mesa.titular_id ?? mesa.titularNombre))
}

function hasDate(mesa = {}) {
  return Boolean(clean(mesa.fecha ?? mesa.fechaIso ?? mesa.displayDate))
}

function isTribunalComplete(mesa = {}) {
  return hasTitular(mesa) && getVocalCount(mesa) >= 2
}

function getMesaSubject(mesa = {}) {
  return {
    id: mesa.materiaId || mesa.id,
    materia: mesa.materiaId || mesa.materia,
    codigo: mesa.materiaId,
    nombreMateria: mesa.materia,
    carrera: mesa.carrera,
    carreraId: mesa.carreraId,
    familiaIdoneidad: mesa.familiaIdoneidad,
    anio: mesa.anio,
  }
}

function subjectText(value = {}) {
  return normalizeAcademicText([
    value.carrera,
    value.carreraId,
    value.materia,
    value.codigo,
    value.nombreMateria,
    value.nombre,
    value.name,
    value.especialidad,
    value.familiasIdoneidad,
    value.idoneidades,
  ].flat().join(' '))
}

function isProfesorado(value = {}) {
  return subjectText(value).includes('profesorado')
}

function isTechnicalCareer(value = {}) {
  const text = subjectText(value)
  return text.includes('tecnicatura') || text.includes('tecnico') || text.includes('tecnica')
}

function isProtectedDiscursivePractice(value = {}) {
  const text = subjectText(value)
  return text.includes('practicas discursivas iii') || text.includes('practicas discursivas iv')
}

function customFamily(value = {}) {
  const text = subjectText(value)
  if (isProtectedDiscursivePractice(value)) return 'PROTEGIDA'
  if (text.includes('ingles') || text.includes('inglesa')) return FAMILIAS_AFINIDAD.INGLES
  if (text.includes('informatica') || text.includes('programacion') || text.includes('tic') || text.includes('computacion')) {
    return FAMILIAS_AFINIDAD.INFORMATICA_TIC
  }
  if (
    text.includes('pedagog') ||
    text.includes('didactica') ||
    text.includes('ensenanza') ||
    text.includes('residencia') ||
    (isProfesorado(value) && text.includes('practica'))
  ) {
    return FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA
  }
  if (isTechnicalCareer(value) && text.includes('practica')) return FAMILIAS_AFINIDAD.PRACTICA_TECNICA
  if (text.includes('quimica') || text.includes('laboratorio') || text.includes('biologia') || text.includes('fisica')) {
    return 'QUIMICA_LABORATORIO'
  }
  if (text.includes('turismo') || text.includes('geografia') || text.includes('territorio') || text.includes('patrimonio')) {
    return 'TURISMO_GEOGRAFIA'
  }
  return detectarFamiliaMateria(value)
}

function sameCustomFamily(left = {}, right = {}) {
  const leftFamily = customFamily(left)
  const rightFamily = customFamily(right)
  return leftFamily !== FAMILIAS_AFINIDAD.GENERAL && leftFamily !== 'PROTEGIDA' && leftFamily === rightFamily
}

export function classifyVocalRejectionCause(rejection = '') {
  const code = clean(rejection).toUpperCase()
  if (!code) return 'otro'
  if (code.includes('AFINIDAD')) return 'afinidad'
  if (code.includes('DISPON')) return 'disponibilidad'
  if (code.includes('LIMITE') || code.includes('MITAD')) return 'mitad_mas_uno'
  if (code.includes('TITULAR') || code.includes('ROL')) return 'conflicto_rol_titular'
  if (code.includes('SUPERPUESTO') || code.includes('HORARIO')) return 'superposicion_horaria'
  if (code.includes('DUPLICADO')) return 'mismo_docente'
  if (code.includes('MATERIA') || code.includes('ESPACIO')) return 'mismo_espacio_materia'
  if (code.includes('CARRERA')) return 'carrera_incompatible'
  if (code.includes('TURNO')) return 'turno_incompatible'
  return 'otro'
}

function fallbackMatches({ docente = {}, mesa = {}, mode = FALLBACK_MODES.NONE } = {}) {
  if (mode === FALLBACK_MODES.NONE) return null
  if (isProtectedDiscursivePractice(mesa) || isProtectedDiscursivePractice(docente)) return null

  const mesaFamily = customFamily(mesa)
  const docenteFamily = customFamily(docente)
  const sameFamily = sameCustomFamily(docente, mesa)
  const englishOrIt = [
    FAMILIAS_AFINIDAD.INGLES,
    FAMILIAS_AFINIDAD.INFORMATICA_TIC,
  ].includes(mesaFamily) && mesaFamily === docenteFamily
  const pedagogic = mesaFamily === FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA &&
    docenteFamily === FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA &&
    isProfesorado(mesa) &&
    isProfesorado(docente)
  const technical = mesaFamily === FAMILIAS_AFINIDAD.PRACTICA_TECNICA &&
    docenteFamily === FAMILIAS_AFINIDAD.PRACTICA_TECNICA &&
    isTechnicalCareer(mesa) &&
    isTechnicalCareer(docente)

  if (mode === FALLBACK_MODES.FAMILY_IF_ZERO && sameFamily) return `familia:${mesaFamily}`
  if (mode === FALLBACK_MODES.TRANSVERSAL_ENGLISH_IT && englishOrIt) return `transversal:${mesaFamily}`
  if (mode === FALLBACK_MODES.PEDAGOGIC && pedagogic) return 'pedagogico_profesorados'
  if (mode === FALLBACK_MODES.TECHNICAL && technical) return 'tecnico_tecnicaturas'
  if (mode === FALLBACK_MODES.SAFE_COMBO && (englishOrIt || pedagogic || technical)) {
    if (englishOrIt) return `transversal:${mesaFamily}`
    if (pedagogic) return 'pedagogico_profesorados'
    return 'tecnico_tecnicaturas'
  }

  return null
}

function candidateCanBecomeFallback(candidate = {}) {
  const rejections = asArray(candidate.rechazos)
  if (!rejections.includes('SIN_AFINIDAD')) return false
  return rejections.filter((rejection) => rejection !== 'SIN_AFINIDAD').length === 0
}

function createFallbackCandidate(candidate = {}, fallbackReason = '') {
  return {
    ...candidate,
    valido: true,
    rechazos: asArray(candidate.rechazos).filter((rejection) => rejection !== 'SIN_AFINIDAD'),
    nivelAfinidad: NIVELES_AFINIDAD.IDONEIDAD_EXPLICITA,
    motivoAfinidad: `Fallback institucional auditado: ${fallbackReason}.`,
    puntajeAfinidad: Math.max(Number(candidate.puntajeAfinidad ?? 0), FALLBACK_SCORE),
    metadata: {
      ...(candidate.metadata ?? {}),
      fallbackAffinity: true,
      requiresManualReview: true,
      reason: 'FALLBACK_AFINIDAD',
      fallbackReason,
    },
  }
}

function fallbackPairKey(mesaId = '', docenteId = '') {
  return [clean(mesaId), normalizeText(docenteId)].join('::')
}

export function applyVocalFallbackToCandidateEntries({
  entries = [],
  docentes = [],
  mode = FALLBACK_MODES.NONE,
  onlyWhenNoValidCandidates = false,
} = {}) {
  const docenteMap = buildDocenteMap(docentes)
  const fallbackPairs = new Map()
  let fallbackCandidatesAdded = 0
  let mesasConFallback = 0

  const nextEntries = asArray(entries).map((entry) => {
    const validCount = asArray(entry.candidatosVocales).filter((candidate) => candidate.valido).length
    if (mode === FALLBACK_MODES.NONE) return entry
    if (onlyWhenNoValidCandidates ? validCount > 0 : validCount >= 2) return entry

    const mesa = getMesaSubject(entry)
    const nextCandidates = asArray(entry.candidatosVocales).map((candidate) => {
      if (!candidateCanBecomeFallback(candidate)) return candidate
      const docente = findDocente(docenteMap, candidate.docenteId)
      if (!docente) return candidate
      const fallbackReason = fallbackMatches({ docente, mesa, mode })
      if (!fallbackReason) return candidate

      const fallbackCandidate = createFallbackCandidate(candidate, fallbackReason)
      fallbackPairs.set(fallbackPairKey(entry.mesaId, candidate.docenteId), {
        mesaId: entry.mesaId,
        docenteId: candidate.docenteId,
        materia: entry.materia,
        materiaId: entry.materiaId,
        carrera: entry.carrera,
        fallbackReason,
      })
      fallbackCandidatesAdded += 1
      return fallbackCandidate
    })

    const nextValidCount = nextCandidates.filter((candidate) => candidate.valido).length
    if (nextValidCount > validCount) mesasConFallback += 1

    return {
      ...entry,
      candidatosVocales: nextCandidates.sort((left, right) => (
        Number(right.valido) - Number(left.valido) ||
        (right.puntajeAfinidad ?? 0) - (left.puntajeAfinidad ?? 0)
      )),
    }
  })

  return {
    entries: nextEntries,
    fallbackPairs,
    summary: {
      mode,
      fallbackCandidatesAdded,
      mesasConFallback,
    },
  }
}

function addExplicitFallbackAffinities(docentes = [], fallbackPairs = new Map()) {
  const byDocente = new Map()
  fallbackPairs.forEach((pair) => {
    const current = byDocente.get(normalizeText(pair.docenteId)) ?? []
    current.push(pair.materia, pair.materiaId)
    byDocente.set(normalizeText(pair.docenteId), current)
  })

  if (!byDocente.size) return docentes

  return docentes.map((docente) => {
    const values = byDocente.get(normalizeText(getDocenteId(docente)))
    if (!values?.length) return docente

    return {
      ...docente,
      materiasAfines: uniqueValues([
        ...asArray(docente.materiasAfines),
        ...asArray(docente.materias_afines),
        ...values,
      ]),
      metadata: {
        ...(docente.metadata ?? {}),
        auditFallbackAffinity: true,
      },
    }
  })
}

function collectFallbackAssignments(mesas = [], fallbackPairs = new Map()) {
  const assignments = []
  asArray(mesas).forEach((mesa) => {
    getVocalIds(mesa).forEach((docenteId) => {
      const pair = fallbackPairs.get(fallbackPairKey(mesa.id, docenteId))
      if (!pair) return
      assignments.push({
        mesaId: mesa.id,
        docenteId,
        carrera: mesa.carrera,
        materia: mesa.materia,
        fallbackReason: pair.fallbackReason,
      })
    })
  })
  return assignments
}

function markFallbackReview(mesas = [], fallbackPairs = new Map()) {
  return asArray(mesas).map((mesa) => {
    const fallbackAssignments = getVocalIds(mesa)
      .map((docenteId) => fallbackPairs.get(fallbackPairKey(mesa.id, docenteId)))
      .filter(Boolean)

    if (!fallbackAssignments.length) return mesa

    const warning = {
      code: 'FALLBACK_AFINIDAD',
      message: 'Vocal asignado por fallback institucional de afinidad.',
      severity: 'warning',
      mesaId: mesa.id,
      requiresManualReview: true,
      reason: 'FALLBACK_AFINIDAD',
      fallbackCount: fallbackAssignments.length,
    }

    return {
      ...mesa,
      warnings: [...asArray(mesa.warnings), warning],
      metadata: {
        ...(mesa.metadata ?? {}),
        requiresManualReview: true,
        fallbackAffinityAssignments: fallbackAssignments.map((assignment) => ({
          reason: assignment.fallbackReason,
        })),
      },
    }
  })
}

function diagnosticKey(item = {}) {
  return [
    item.stage,
    item.code,
    item.severity,
    item.entityType,
    item.entityId,
    item.candidateId,
    item.materiaId,
    item.mesaId,
    item.docenteId,
    item.rol,
    item.llamado,
    item.fecha,
    item.reason,
  ].map((value) => String(value ?? '')).join('::')
}

function dedupeDiagnostics(items = []) {
  const seen = new Set()
  const unique = []
  items.forEach((item) => {
    const key = diagnosticKey(item)
    if (seen.has(key)) return
    seen.add(key)
    unique.push(item)
  })
  return unique
}

function cloneStageDiagnostic(item = {}, stage = '') {
  return {
    ...item,
    stage: item.stage ?? stage,
  }
}

function collectStageDiagnostics(stage, stageResult, errors, warnings) {
  asArray(stageResult?.errors).forEach((error) => errors.push(cloneStageDiagnostic(error, stage)))
  asArray(stageResult?.warnings).forEach((warning) => warnings.push(cloneStageDiagnostic(warning, stage)))
}

function buildPlanSummary({
  docentes,
  materias,
  candidatesResult,
  titularResult,
  vocalCandidateResult,
  vocalAssignmentResult,
  repairResult,
  tribunalValidation,
  compactResult,
  planResult,
  cronogramaValidation,
  errors,
  warnings,
}) {
  return {
    totalDocentes: docentes.length,
    totalMaterias: materias.length,
    totalCandidates: candidatesResult.candidates.length,
    totalMesasPreliminares: titularResult.mesasPreliminares.length,
    totalMesasConVocales: vocalAssignmentResult.mesasConVocales.length,
    totalMesasReparadas: repairResult.mesasReparadas.length,
    totalMesasCompactadas: compactResult.mesasCompactadas.length,
    totalPlannedMesas: planResult.plannedMesas.length,
    totalUnassignedMesas: planResult.unassignedMesas.length,
    totalErrors: errors.length,
    totalWarnings: warnings.length,
    compactMode: 'safe',
    totalCompactaciones: compactResult.compactaciones.length,
    totalMesasAntesCompactacion: repairResult.mesasReparadas.length,
    totalMesasDespuesCompactacion: compactResult.mesasCompactadas.length,
    stageSummaries: {
      candidates: candidatesResult.summary,
      titulares: titularResult.summary,
      vocalCandidates: vocalCandidateResult.summary,
      vocales: vocalAssignmentResult.summary,
      repairs: repairResult.summary,
      tribunals: tribunalValidation.summary,
      compaction: compactResult.summary,
      tentativeDates: planResult.summary,
      cronogramaValidation: {
        valid: cronogramaValidation.valid,
        errors: cronogramaValidation.errors.length,
        warnings: cronogramaValidation.warnings.length,
      },
    },
  }
}

export function runVocalAuditPlan(input = {}, {
  fallbackMode = FALLBACK_MODES.NONE,
  onlyWhenNoValidCandidates = false,
} = {}) {
  const docentes = asArray(input.docentes)
  const materias = asArray(input.materias)
  const correlatividades = asArray(input.correlatividades)
  const fechasDisponibles = asArray(input.fechasDisponibles)
  const config = input.config ?? {}
  const options = input.options ?? {}
  const errors = []
  const warnings = []

  const diagnosis = buildFeasibilityDiagnosis({ docentes, materias, mesas: [], correlatividades, config })
  collectStageDiagnostics('DIAGNOSIS', diagnosis, errors, warnings)
  const candidatesResult = buildExamTableCandidates({ docentes, materias, correlatividades, config, diagnosis })
  collectStageDiagnostics('BUILD_CANDIDATES', candidatesResult, errors, warnings)
  const titularResult = assignTitularesToCandidates({ candidates: candidatesResult.candidates, docentes, config })
  collectStageDiagnostics('ASSIGN_TITULARES', titularResult, errors, warnings)
  const baseVocalCandidateResult = buildVocalCandidatesForMesas({
    mesasPreliminares: titularResult.mesasPreliminares,
    docentes,
    participacionesExistentes: [],
    config,
  })
  const fallbackResult = applyVocalFallbackToCandidateEntries({
    entries: baseVocalCandidateResult.mesasConCandidatos,
    docentes,
    mode: fallbackMode,
    onlyWhenNoValidCandidates,
  })
  const vocalCandidateResult = {
    ...baseVocalCandidateResult,
    mesasConCandidatos: fallbackResult.entries,
  }
  collectStageDiagnostics('BUILD_VOCAL_CANDIDATES', vocalCandidateResult, errors, warnings)

  const docentesWithFallbackAffinities = addExplicitFallbackAffinities(docentes, fallbackResult.fallbackPairs)
  const vocalAssignmentResult = assignVocalesToMesas({
    mesasPreliminares: titularResult.mesasPreliminares,
    docentes: docentesWithFallbackAffinities,
    participacionesExistentes: [],
    mesasConCandidatos: vocalCandidateResult.mesasConCandidatos,
    config,
    options,
  })
  vocalAssignmentResult.mesasConVocales = markFallbackReview(vocalAssignmentResult.mesasConVocales, fallbackResult.fallbackPairs)
  collectStageDiagnostics('ASSIGN_VOCALES', vocalAssignmentResult, errors, warnings)

  const repairResult = repairIncompleteTribunals({
    mesas: vocalAssignmentResult.mesasConVocales,
    docentes: docentesWithFallbackAffinities,
    participaciones: vocalAssignmentResult.participaciones,
    config,
    options,
  })
  repairResult.mesasReparadas = markFallbackReview(repairResult.mesasReparadas, fallbackResult.fallbackPairs)
  collectStageDiagnostics('REPAIR_TRIBUNALS', repairResult, errors, warnings)

  const tribunalValidation = validateTribunals({
    mesas: repairResult.mesasReparadas,
    docentes: docentesWithFallbackAffinities,
    participaciones: repairResult.participaciones,
    config,
    options,
  })
  collectStageDiagnostics('VALIDATE_TRIBUNALS', tribunalValidation, errors, warnings)

  const compactResult = compactCompatibleMesas({
    mesas: repairResult.mesasReparadas,
    docentes: docentesWithFallbackAffinities,
    correlatividades,
    config,
    options: {
      ...options,
      compact: 'safe',
      compactMode: 'safe',
    },
  })
  collectStageDiagnostics('COMPACT_MESAS', compactResult, errors, warnings)

  const planResult = planTentativeDates({
    mesas: compactResult.mesasCompactadas,
    docentes: docentesWithFallbackAffinities,
    correlatividades,
    config,
    fechasDisponibles,
    options,
  })
  collectStageDiagnostics('PLAN_TENTATIVE_DATES', planResult, errors, warnings)

  const cronogramaValidation = validateCronograma({
    correlatividades,
    cronograma: planResult.plannedMesas,
    docentes: docentesWithFallbackAffinities,
    examPeriodConfig: config,
    materias: [],
  })
  collectStageDiagnostics('VALIDATE_CRONOGRAMA', cronogramaValidation, errors, warnings)

  const finalErrors = dedupeDiagnostics(errors)
  const finalWarnings = dedupeDiagnostics(warnings)
  const fallbackAssignments = collectFallbackAssignments(repairResult.mesasReparadas, fallbackResult.fallbackPairs)

  return {
    success: finalErrors.length === 0 && planResult.unassignedMesas.length === 0,
    diagnosis,
    candidates: candidatesResult.candidates,
    mesasPreliminares: titularResult.mesasPreliminares,
    mesasConVocales: vocalAssignmentResult.mesasConVocales,
    mesasReparadas: repairResult.mesasReparadas,
    mesasCompactadas: compactResult.mesasCompactadas,
    plannedMesas: planResult.plannedMesas,
    unassignedMesas: planResult.unassignedMesas,
    errors: finalErrors,
    warnings: finalWarnings,
    summary: buildPlanSummary({
      docentes: docentesWithFallbackAffinities,
      materias,
      candidatesResult,
      titularResult,
      vocalCandidateResult,
      vocalAssignmentResult,
      repairResult,
      tribunalValidation,
      compactResult,
      planResult,
      cronogramaValidation,
      errors: finalErrors,
      warnings: finalWarnings,
    }),
    metadata: {
      vocalCandidateSummary: vocalCandidateResult.mesasConCandidatos,
      fallbackSummary: {
        ...fallbackResult.summary,
        fallbackAssignments: fallbackAssignments.length,
        fallbackMesasAsignadas: new Set(fallbackAssignments.map((assignment) => assignment.mesaId)).size,
      },
      fallbackAssignments,
      repairs: repairResult.repairs,
      compactaciones: compactResult.compactaciones,
      tribunalValidation,
      cronogramaValidation,
    },
  }
}

function scenarioMetricsFromPlan(plan = {}, input = {}, { oneVocalAsValid = false } = {}) {
  const rows = [...asArray(plan.plannedMesas), ...asArray(plan.unassignedMesas)]
  const vocalSummary = plan.summary?.stageSummaries?.vocales ?? {}
  const repairSummary = plan.summary?.stageSummaries?.repairs ?? {}
  let mesasCompletas = rows.filter(isTribunalComplete).length
  let mesasConUnVocal = rows.filter((mesa) => hasTitular(mesa) && getVocalCount(mesa) === 1).length
  const oneVocalReview = oneVocalAsValid ? mesasConUnVocal : 0

  if (oneVocalAsValid) {
    mesasCompletas += mesasConUnVocal
    mesasConUnVocal = 0
  }

  const totalMesas = rows.length
  const totalPlanned = asArray(plan.plannedMesas).length

  return {
    totalFechasDisponibles: asArray(input.fechasDisponibles).length,
    totalMesas,
    totalPlanned,
    totalUnassigned: asArray(plan.unassignedMesas).length,
    mesasCompletas,
    mesasConUnVocal,
    mesasSinTribunal: rows.filter((mesa) => !hasTitular(mesa) || getVocalCount(mesa) === 0).length,
    mesasSinFecha: rows.filter((mesa) => !hasDate(mesa)).length,
    completionRate: totalMesas ? Number((totalPlanned / totalMesas).toFixed(4)) : 0,
    criticalErrors: asArray(plan.errors).filter((error) => String(error.severity ?? '').toLowerCase() === 'critical').length,
    warnings: asArray(plan.warnings).length,
    vocalesAsignadosPorFallback: plan.metadata?.fallbackSummary?.fallbackAssignments ?? 0,
    requierenRevisionManual: (plan.metadata?.fallbackSummary?.fallbackMesasAsignadas ?? 0) + oneVocalReview,
    docentesEnLimite: vocalSummary.docentesEnLimite ?? 0,
    docentesExcedidos: vocalSummary.docentesExcedidos ?? 0,
    reparacionesExitosas: repairSummary.mesasReparadas ?? 0,
    reparacionesFallidas: repairSummary.reparacionesFallidas ?? 0,
    reparacionesGlobales: repairSummary.reparacionesGlobales ?? 0,
    reparacionesGlobalesFallidas: repairSummary.reparacionesGlobalesFallidas ?? 0,
  }
}

function buildDelta(metrics = {}, baseline = {}) {
  return {
    totalPlanned: (metrics.totalPlanned ?? 0) - (baseline.totalPlanned ?? 0),
    totalUnassigned: (metrics.totalUnassigned ?? 0) - (baseline.totalUnassigned ?? 0),
    mesasCompletas: (metrics.mesasCompletas ?? 0) - (baseline.mesasCompletas ?? 0),
    mesasSinTribunal: (metrics.mesasSinTribunal ?? 0) - (baseline.mesasSinTribunal ?? 0),
    mesasSinFecha: (metrics.mesasSinFecha ?? 0) - (baseline.mesasSinFecha ?? 0),
    completionRate: Number(((metrics.completionRate ?? 0) - (baseline.completionRate ?? 0)).toFixed(4)),
    criticalErrors: (metrics.criticalErrors ?? 0) - (baseline.criticalErrors ?? 0),
    warnings: (metrics.warnings ?? 0) - (baseline.warnings ?? 0),
  }
}

export function runVocalScenario({
  name,
  input,
  fallbackMode = FALLBACK_MODES.NONE,
  onlyWhenNoValidCandidates = false,
  oneVocalAsValid = false,
  baselineMetrics = null,
} = {}) {
  const plan = runVocalAuditPlan(input, { fallbackMode, onlyWhenNoValidCandidates })
  const metrics = scenarioMetricsFromPlan(plan, input, { oneVocalAsValid })

  return {
    name,
    metrics,
    mejoraContraActual: baselineMetrics ? buildDelta(metrics, baselineMetrics) : null,
    metadata: {
      fallbackSummary: plan.metadata.fallbackSummary,
    },
    plan,
  }
}

function candidateTotals(entries = []) {
  let evaluados = 0
  let validos = 0
  let rechazados = 0
  const rechazosPorCausa = {}
  const rechazosPorCodigo = {}

  asArray(entries).forEach((entry) => {
    asArray(entry.candidatosVocales).forEach((candidate) => {
      evaluados += 1
      if (candidate.valido) {
        validos += 1
      } else {
        rechazados += 1
      }
      asArray(candidate.rechazos).forEach((rejection) => {
        increment(rechazosPorCodigo, rejection)
        increment(rechazosPorCausa, classifyVocalRejectionCause(rejection))
      })
    })
  })

  return {
    candidatosEvaluados: evaluados,
    candidatosValidos: validos,
    candidatosRechazados: rechazados,
    rechazosPorCausa,
    rechazosPorCodigo: topEntries(rechazosPorCodigo, 20),
  }
}

function summarizeByCareer(plan = {}) {
  const candidateEntries = asArray(plan.metadata?.vocalCandidateSummary)
  const candidatesByCareer = candidateEntries.reduce((map, entry) => {
    const career = clean(entry.carrera) || 'sin_carrera'
    const rows = map.get(career) ?? []
    rows.push(entry)
    map.set(career, rows)
    return map
  }, new Map())
  const finalMesasByCareer = asArray(plan.mesasCompactadas).reduce((map, mesa) => {
    const career = clean(mesa.carrera) || 'sin_carrera'
    const rows = map.get(career) ?? []
    rows.push(mesa)
    map.set(career, rows)
    return map
  }, new Map())

  return [...new Set([...candidatesByCareer.keys(), ...finalMesasByCareer.keys()])]
    .sort()
    .map((career) => {
      const entries = candidatesByCareer.get(career) ?? []
      const mesas = finalMesasByCareer.get(career) ?? []
      const rejectionCounts = candidateTotals(entries).rechazosPorCausa
      const validCounts = entries.map((entry) => asArray(entry.candidatosVocales).filter((candidate) => candidate.valido).length)
      const missingFamilies = {}

      entries
        .filter((entry) => asArray(entry.candidatosVocales).filter((candidate) => candidate.valido).length === 0)
        .forEach((entry) => increment(missingFamilies, customFamily(entry)))

      return {
        carrera: career,
        mesasTotales: mesas.length,
        mesasCompletas: mesas.filter(isTribunalComplete).length,
        mesasSinTribunal: mesas.filter((mesa) => !hasTitular(mesa) || getVocalCount(mesa) === 0).length,
        promedioCandidatosVocalesValidos: validCounts.length
          ? Number((validCounts.reduce((total, count) => total + count, 0) / validCounts.length).toFixed(2))
          : 0,
        causaPrincipalRechazo: topEntries(rejectionCounts, 1)[0] ?? null,
        familiasAfinidadFaltantes: topEntries(missingFamilies, 10),
      }
    })
}

function summarizeAffinity(plan = {}, input = {}) {
  const entries = asArray(plan.metadata?.vocalCandidateSummary)
  const familyCounts = {}
  const validAffinityLevels = {}
  const materias = asArray(input.materias).filter((materia) => materia.requiereMesa !== false)

  materias.forEach((materia) => increment(familyCounts, customFamily(materia)))
  entries.forEach((entry) => {
    asArray(entry.candidatosVocales)
      .filter((candidate) => candidate.valido)
      .forEach((candidate) => increment(validAffinityLevels, candidate.nivelAfinidad))
  })

  const materiasSinFamilia = materias.filter((materia) => customFamily(materia) === FAMILIAS_AFINIDAD.GENERAL).length
  const materiasConFamiliaPeroSinVocales = entries.filter((entry) => (
    customFamily(entry) !== FAMILIAS_AFINIDAD.GENERAL &&
    asArray(entry.candidatosVocales).filter((candidate) => candidate.valido).length === 0
  )).length
  const totals = candidateTotals(entries)
  const affinityRejections = totals.rechazosPorCausa.afinidad ?? 0

  return {
    familiasMaterias: topEntries(familyCounts, 20),
    familiasAfinidadUsadasPorCandidatosValidos: topEntries(validAffinityLevels, 20),
    materiasSinFamiliaAfinidad: materiasSinFamilia,
    materiasConFamiliaPeroSinVocales,
    afinidadesParecenRestrictivas: affinityRejections > totals.candidatosValidos,
    posiblesReglasInstitucionales: {
      inglesTransversal: entries.filter((entry) => customFamily(entry) === FAMILIAS_AFINIDAD.INGLES).length,
      informaticaTicTransversal: entries.filter((entry) => customFamily(entry) === FAMILIAS_AFINIDAD.INFORMATICA_TIC).length,
      practicasPedagogicasProfesorados: entries.filter((entry) => customFamily(entry) === FAMILIAS_AFINIDAD.PRACTICA_PEDAGOGICA).length,
      practicasTecnicasTecnicaturas: entries.filter((entry) => customFamily(entry) === FAMILIAS_AFINIDAD.PRACTICA_TECNICA).length,
      quimicaLaboratorio: entries.filter((entry) => customFamily(entry) === 'QUIMICA_LABORATORIO').length,
      turismoGeografia: entries.filter((entry) => customFamily(entry) === 'TURISMO_GEOGRAFIA').length,
      practicasDiscursivasProtegidasNoRelajadas: entries.filter((entry) => customFamily(entry) === 'PROTEGIDA').length,
    },
  }
}

export function summarizeVocalBottlenecks(plan = {}, input = {}) {
  const finalMesas = asArray(plan.mesasCompactadas)
  const candidateSummary = candidateTotals(plan.metadata?.vocalCandidateSummary)

  return {
    general: {
      totalMesas: finalMesas.length,
      mesasCompletas: finalMesas.filter(isTribunalComplete).length,
      mesasConUnVocal: finalMesas.filter((mesa) => hasTitular(mesa) && getVocalCount(mesa) === 1).length,
      mesasSinTribunal: finalMesas.filter((mesa) => !hasTitular(mesa) || getVocalCount(mesa) === 0).length,
      mesasSinVocales: finalMesas.filter((mesa) => getVocalCount(mesa) === 0).length,
      mesasConUnSoloVocalFaltante: finalMesas.filter((mesa) => getVocalCount(mesa) === 1).length,
      ...candidateSummary,
      resumenFases: {
        vocalCandidates: plan.summary?.stageSummaries?.vocalCandidates ?? {},
        asignacionVocales: plan.summary?.stageSummaries?.vocales ?? {},
        reparacionTribunales: plan.summary?.stageSummaries?.repairs ?? {},
        validacionTribunales: plan.summary?.stageSummaries?.tribunals ?? {},
      },
    },
    porCarrera: summarizeByCareer(plan),
    afinidades: summarizeAffinity(plan, input),
  }
}

function sortDateSlots(slots = []) {
  return [...slots].sort((left, right) => (
    dateSlotCall(left).localeCompare(dateSlotCall(right)) ||
    clean(left.fecha).localeCompare(clean(right.fecha)) ||
    dateSlotTurn(left).localeCompare(dateSlotTurn(right))
  ))
}

function selectPriorityDays(input = {}) {
  const counts = {}
  asArray(input.docentes).forEach((docente) => {
    asArray(docente.diasAsistencia).forEach((day) => increment(counts, normalizeDay(day) || normalizeAcademicText(day)))
  })

  return topEntries(counts, 5).map((entry) => entry.key).filter(Boolean)
}

function nextDateForDays(fechaIso = '', days = [], existingKeys = new Set(), call = '', turno = '') {
  const start = parseIsoDate(fechaIso)
  if (!start) return null

  const wanted = new Set(days.map(normalizeDay).filter(Boolean))
  const current = new Date(start)
  let guard = 0

  while (guard < 240) {
    current.setDate(current.getDate() + 1)
    guard += 1
    const day = DAY_NAMES[current.getDay()]
    const iso = toIsoDate(current)
    const key = [call, iso, turno].join('::')
    if (wanted.has(day) && !existingKeys.has(key)) return new Date(current)
  }

  return null
}

export function createAutomaticCalendarInput(input = {}, { targetTotalDates = 35, priorityDays = null } = {}) {
  const next = cloneJson(input)
  const fechas = sortDateSlots(asArray(next.fechasDisponibles))
  const target = Math.max(targetTotalDates, fechas.length)
  const days = asArray(priorityDays).length ? priorityDays : selectPriorityDays(input)
  const byCall = fechas.reduce((map, slot) => {
    const call = dateSlotCall(slot)
    const current = map.get(call) ?? []
    current.push(slot)
    map.set(call, current)
    return map
  }, new Map())
  const calls = [...byCall.keys()].sort()
  const existingKeys = new Set(fechas.map((slot) => [dateSlotCall(slot), clean(slot.fecha), dateSlotTurn(slot)].join('::')))
  const additions = []

  while (fechas.length + additions.length < target && calls.length) {
    const call = calls[additions.length % calls.length]
    const callDates = [...asArray(byCall.get(call)), ...additions.filter((slot) => dateSlotCall(slot) === call)]
      .sort((left, right) => clean(left.fecha).localeCompare(clean(right.fecha)))
    const template = callDates.at(-1)
    if (!template) break
    const nextDate = nextDateForDays(template.fecha, days, existingKeys, call, dateSlotTurn(template))
    if (!nextDate) break

    const slot = {
      ...template,
      fecha: toIsoDate(nextDate),
      diaSemana: DAY_NAMES[nextDate.getDay()].toUpperCase(),
      disponible: true,
    }
    additions.push(slot)
    existingKeys.add([dateSlotCall(slot), clean(slot.fecha), dateSlotTurn(slot)].join('::'))
  }

  next.fechasDisponibles = sortDateSlots([...fechas, ...additions])
  next.config = {
    ...(next.config ?? {}),
    fechaFin: next.fechasDisponibles.reduce((max, slot) => clean(slot.fecha) > clean(max) ? slot.fecha : max, next.config?.fechaFin ?? ''),
  }
  return next
}

export function runVocalScenarios(input = {}) {
  const scenarioA = runVocalScenario({ name: 'A. reglas actuales', input })
  const baseline = scenarioA.metrics
  const scenarioB = runVocalScenario({
    name: 'B. aceptar tribunal con 1 vocal como minimo',
    input,
    oneVocalAsValid: true,
    baselineMetrics: baseline,
  })
  const scenarioC = runVocalScenario({
    name: 'C. fallback departamento/familia solo sin candidatos',
    input,
    fallbackMode: FALLBACK_MODES.FAMILY_IF_ZERO,
    onlyWhenNoValidCandidates: true,
    baselineMetrics: baseline,
  })
  const scenarioD = runVocalScenario({
    name: 'D. fallback Ingles e Informatica transversal',
    input,
    fallbackMode: FALLBACK_MODES.TRANSVERSAL_ENGLISH_IT,
    baselineMetrics: baseline,
  })
  const scenarioE = runVocalScenario({
    name: 'E. fallback pedagogico entre profesorados',
    input,
    fallbackMode: FALLBACK_MODES.PEDAGOGIC,
    baselineMetrics: baseline,
  })
  const scenarioF = runVocalScenario({
    name: 'F. fallback tecnico en tecnicaturas',
    input,
    fallbackMode: FALLBACK_MODES.TECHNICAL,
    baselineMetrics: baseline,
  })
  const scenarioG = runVocalScenario({
    name: 'G. combinacion segura D+E+F',
    input,
    fallbackMode: FALLBACK_MODES.SAFE_COMBO,
    baselineMetrics: baseline,
  })
  const scenarioH = runVocalScenario({
    name: 'H. combinacion segura + 35 fechas automaticas',
    input: createAutomaticCalendarInput(input, { targetTotalDates: 35 }),
    fallbackMode: FALLBACK_MODES.SAFE_COMBO,
    baselineMetrics: baseline,
  })
  const scenarioI = runVocalScenario({
    name: 'I. combinacion segura + 55 fechas automaticas',
    input: createAutomaticCalendarInput(input, { targetTotalDates: 55 }),
    fallbackMode: FALLBACK_MODES.SAFE_COMBO,
    baselineMetrics: baseline,
  })

  return [scenarioA, scenarioB, scenarioC, scenarioD, scenarioE, scenarioF, scenarioG, scenarioH, scenarioI]
}

export { FALLBACK_MODES }
