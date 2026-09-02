import { HARD_RULES } from '../constants.js'
import {
  normalizeExamPeriodConfig,
  validateExamPeriodConfig,
} from '../contracts.js'
import { normalizeEngineInput } from '../normalize/input.js'
import {
  getSubjectCareer,
  getSubjectKey,
  getSubjectName,
  normalizeText,
} from '../normalize/subjects.js'
import { docenteTieneAfinidadConMesa } from '../rules/affinities.js'
import { getLlamadosRequeridos } from '../rules/regularCalls.js'
import { buildParticipacionesFromMesas, validateCronograma } from '../validation/validateCronograma.js'
import { buildRiskRanking } from './riskRanking.js'

// Institutional rule: diagnostics must run before any generation phase.

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

function getTitularId(entity = {}) {
  return clean(
    entity.titular_id ??
    entity.titularId ??
    entity.presidente_id ??
    entity.profesorTitular ??
    entity.docenteTitular ??
    entity.titular?.id ??
    entity.titular?.nombre ??
    entity.titular,
  )
}

function materiaRequiereMesa(materia = {}) {
  if (materia.requiereMesa === false) return false
  if (materia.requiere_mesa === false) return false
  if (materia.requiresMesa === false) return false
  if (materia.noRequiereMesa === true) return false
  if (materia.excluida === true || materia.excluded === true) return false
  return true
}

function createError({ code, message, entityType, entityId, severity = 'critical', extra = {} }) {
  return {
    code,
    message,
    severity,
    entityType,
    entityId,
    ...extra,
  }
}

function createWarning({ code, message, entityType, entityId, extra = {} }) {
  return {
    code,
    message,
    severity: 'warning',
    entityType,
    entityId,
    ...extra,
  }
}

function buildDocenteMap(docentes = []) {
  return docentes.reduce((map, docente) => {
    getDocenteKeys(docente).forEach((key) => map.set(key, docente))
    return map
  }, new Map())
}

function countMateriasTitular(docente = {}, materias = []) {
  const docenteKey = normalizeText(getDocenteId(docente))
  if (!docenteKey) return 0
  return materias.filter((materia) => normalizeText(getTitularId(materia)) === docenteKey).length
}

function countVocalOptions(materia = {}, docentes = []) {
  const titularKey = normalizeText(getTitularId(materia))

  return docentes.filter((docente) => {
    if (!docenteEstaActivo(docente)) return false
    if (!getDiasDisponiblesCount(docente)) return false
    if (normalizeText(getDocenteId(docente)) === titularKey) return false
    return docenteTieneAfinidadConMesa(docente, materia)
  }).length
}

function buildTeacherSummary(docentes = [], materias = [], cronogramaValidation = {}) {
  const loadSummaryByTeacher = new Map(
    (cronogramaValidation.resumenDocentes ?? []).map((summary) => [normalizeText(summary.docenteId), summary]),
  )

  return docentes.map((docente) => {
    const docenteId = getDocenteId(docente)
    const loadSummary = loadSummaryByTeacher.get(normalizeText(docenteId)) ?? {}

    return {
      docenteId,
      nombre: getDocenteLabel(docente),
      activo: docenteEstaActivo(docente),
      diasDisponibles: getDiasDisponiblesCount(docente),
      materiasComoTitular: countMateriasTitular(docente, materias),
      limiteVocaliasPorLlamado: loadSummary.limiteVocaliasPorLlamado ?? null,
      vocaliasPorLlamado: loadSummary.vocaliasPorLlamado ?? {},
      titularidadesPorLlamado: loadSummary.titularidadesPorLlamado ?? {},
      tribunalesCruzadosPorLlamado: loadSummary.tribunalesCruzadosPorLlamado ?? {},
    }
  })
}

function buildSubjectSummary(materias = [], docentes = []) {
  return materias.map((materia) => ({
    subjectKey: getSubjectKey(materia),
    nombre: getSubjectName(materia),
    carrera: getSubjectCareer(materia),
    requiereMesa: materiaRequiereMesa(materia),
    titularId: getTitularId(materia),
    vocalesPosibles: countVocalOptions(materia, docentes),
  }))
}

function warnSimilarSubjectNames(materias = []) {
  const warnings = []
  const byName = new Map()

  materias.forEach((materia) => {
    const nameKey = normalizeText(getSubjectName(materia)).replaceAll(/\b(i|ii|iii|iv|v)\b/g, '').trim()
    if (!nameKey) return
    const previous = byName.get(nameKey)
    if (previous && getSubjectKey(previous) !== getSubjectKey(materia)) {
      warnings.push(createWarning({
        code: 'MATERIAS_NOMBRES_SIMILARES',
        message: 'Hay materias con nombres similares que podrian requerir normalizacion.',
        entityType: 'MATERIA',
        entityId: getSubjectKey(materia),
        extra: {
          materia: getSubjectName(materia),
          similarA: getSubjectName(previous),
        },
      }))
    } else {
      byName.set(nameKey, materia)
    }
  })

  return warnings
}

function warnTeacherConcentration(mesas = []) {
  const byTurno = mesas.reduce((map, mesa) => {
    const turno = clean(mesa.turno ?? mesa.shift)
    if (!turno) return map
    const count = map.get(turno) ?? 0
    map.set(turno, count + 1)
    return map
  }, new Map())

  return [...byTurno.entries()]
    .filter(([, count]) => count >= 4)
    .map(([turno, count]) => createWarning({
      code: 'CONCENTRACION_TURNO',
      message: 'Hay muchas mesas concentradas en un mismo turno.',
      entityType: 'TURNO',
      entityId: turno,
      extra: { turno, totalMesas: count },
    }))
}

function warnCrossTribunals(participaciones = []) {
  return participaciones
    .filter((participacion) => participacion.rol === 'TRIBUNAL_CRUZADO')
    .map((participacion) => createWarning({
      code: 'TRIBUNAL_CRUZADO_REGISTRADO',
      message: 'Hay tribunal cruzado registrado para control separado.',
      entityType: 'MESA',
      entityId: participacion.mesaId,
      extra: {
        docenteId: participacion.docenteId,
        mesaId: participacion.mesaId,
      },
    }))
}

export function buildFeasibilityDiagnosis(input = {}) {
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const materias = Array.isArray(input.materias) ? input.materias : []
  const mesas = Array.isArray(input.mesas) ? input.mesas : []
  const correlatividades = Array.isArray(input.correlatividades) ? input.correlatividades : []
  const config = input.config ?? input.examPeriodConfig ?? {}
  const materiasQueRequierenMesa = materias.filter(materiaRequiereMesa)
  const docenteMap = buildDocenteMap(docentes)
  const errors = []
  const warnings = []
  const configValidation = validateExamPeriodConfig(config)
  const normalizedConfig = normalizeExamPeriodConfig(config)
  const llamadosRequeridos = configValidation.valid ? getLlamadosRequeridos(normalizedConfig) : []
  const participaciones = buildParticipacionesFromMesas(mesas)
  const configErrorCodes = new Set(configValidation.errors.map((error) => error.code))

  errors.push(...configValidation.errors.map((error) => ({
    ...error,
    entityType: 'CONFIG',
    entityId: 'examPeriodConfig',
  })))

  const docentesSinDisponibilidad = docentes.filter((docente) => getDiasDisponiblesCount(docente) === 0)
  docentesSinDisponibilidad.forEach((docente) => {
    warnings.push(createWarning({
      code: 'DOCENTE_SIN_DISPONIBILIDAD',
      message: 'El docente no tiene dias disponibles cargados.',
      entityType: 'DOCENTE',
      entityId: getDocenteId(docente),
    }))
  })

  const docentesInactivos = docentes.filter((docente) => !docenteEstaActivo(docente))

  materiasQueRequierenMesa.forEach((materia) => {
    const subjectKey = getSubjectKey(materia)
    const titularId = getTitularId(materia)

    if (!titularId) {
      errors.push(createError({
        code: 'MATERIA_SIN_TITULAR',
        message: 'Una materia que requiere mesa no tiene titular.',
        entityType: 'MATERIA',
        entityId: subjectKey,
      }))
      return
    }

    const docenteTitular = docenteMap.get(normalizeText(titularId))
    if (!docenteTitular) {
      errors.push(createError({
        code: 'TITULAR_NOT_FOUND',
        message: 'El titular de la materia no existe en la lista de docentes.',
        entityType: 'MATERIA',
        entityId: subjectKey,
        extra: { titularId },
      }))
      return
    }

    if (!docenteEstaActivo(docenteTitular)) {
      errors.push(createError({
        code: 'TITULAR_INACTIVE',
        message: 'El titular de la materia esta inactivo.',
        entityType: 'MATERIA',
        entityId: subjectKey,
        extra: { titularId },
      }))
    }

    const vocalOptions = countVocalOptions(materia, docentes)
    if (vocalOptions < 2) {
      warnings.push(createWarning({
        code: 'POCAS_OPCIONES_VOCALES',
        message: 'Hay pocas opciones de vocales para una materia.',
        entityType: 'MATERIA',
        entityId: subjectKey,
        extra: { vocalOptions },
      }))
    }
  })

  const activeDocentes = docentes.filter((docente) => docenteEstaActivo(docente))
  if (activeDocentes.length < 3 && materiasQueRequierenMesa.length > 0) {
    errors.push(createError({
      code: 'DOCENTES_INSUFICIENTES_TRIBUNAL',
      message: 'No hay docentes activos suficientes para conformar tribunales.',
      entityType: 'DOCENTE',
      entityId: 'all',
      extra: { docentesActivos: activeDocentes.length },
    }))
  }

  let cronogramaValidation = {
    errors: [],
    warnings: [],
    resumenDocentes: [],
    resumenAfinidades: [],
    normalizedCronograma: [],
  }

  if (mesas.length) {
    cronogramaValidation = validateCronograma({
      correlatividades,
      cronograma: mesas,
      docentes,
      examPeriodConfig: normalizedConfig,
      materias: materiasQueRequierenMesa,
    })

    errors.push(...cronogramaValidation.errors
      .filter((error) => !configErrorCodes.has(error.code))
      .map((error) => ({
        ...error,
        entityType: error.entityType ?? (error.mesaId ? 'MESA' : 'CRONOGRAMA'),
        entityId: error.entityId ?? error.mesaId ?? error.subjectKey ?? error.docenteId ?? error.code,
      })))
    warnings.push(...cronogramaValidation.warnings.map((warning) => ({
      ...warning,
      entityType: warning.entityType ?? (warning.mesaId ? 'MESA' : 'CRONOGRAMA'),
      entityId: warning.entityId ?? warning.mesaId ?? warning.subjectKey ?? warning.docenteId ?? warning.code,
    })))
  }

  warnings.push(...warnSimilarSubjectNames(materiasQueRequierenMesa))
  warnings.push(...warnTeacherConcentration(mesas))
  warnings.push(...warnCrossTribunals(participaciones))

  const teacherSummary = buildTeacherSummary(docentes, materiasQueRequierenMesa, cronogramaValidation)
  const subjectSummary = buildSubjectSummary(materiasQueRequierenMesa, docentes)
  const riskRanking = buildRiskRanking({
    docentes,
    materias: materiasQueRequierenMesa,
    mesas,
    participaciones,
  })

  const materiasSinTitular = materiasQueRequierenMesa.filter((materia) => !getTitularId(materia))

  return {
    canGenerate: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalDocentes: docentes.length,
      totalMaterias: materias.length,
      totalMesas: mesas.length,
      materiasQueRequierenMesa: materiasQueRequierenMesa.length,
      materiasSinTitular: materiasSinTitular.length,
      docentesSinDisponibilidad: docentesSinDisponibilidad.length,
      docentesInactivos: docentesInactivos.length,
      erroresCriticos: errors.length,
      advertencias: warnings.length,
      llamadosRequeridos,
    },
    teacherSummary,
    subjectSummary,
    riskRanking,
  }
}

export function runPreGenerationDiagnostics(input = {}) {
  const normalizedInput = normalizeEngineInput(input)
  const diagnosis = buildFeasibilityDiagnosis({
    docentes: input.docentes ?? normalizedInput.docentes ?? [],
    materias: input.materias ?? input.planesEstudio ?? normalizedInput.planesEstudio ?? [],
    mesas: input.mesas ?? input.cronograma ?? [],
    correlatividades: input.correlatividades ?? normalizedInput.correlatividades ?? [],
    config: input.config ?? input.examPeriodConfig,
  })

  return {
    input: normalizedInput,
    hardRules: HARD_RULES,
    ...diagnosis,
  }
}

export function assertDiagnosticsPassed(diagnostics) {
  return Boolean(diagnostics?.canGenerate)
}
