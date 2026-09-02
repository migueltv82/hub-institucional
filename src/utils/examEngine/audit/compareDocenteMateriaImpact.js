import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import {
  DOCENTE_MATERIA_RESOLUTION_STATUS,
} from '../comparison/resolveDocenteMateriaAssignment.js'
import { parseDocenteMateriaRows } from '../comparison/parseDocenteMateriaRows.js'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { buildExamEngineEfficiencySummary } from './efficiencySummary.js'

const WARNING_CODES = [
  'VOCAL_NO_DISPONIBLE',
  'TITULAR_NO_DISPONIBLE',
  'DOCENTE_SUPERPUESTO',
  'POCOS_CANDIDATOS_VOCALES',
  'REPARACION_SIN_CANDIDATOS_VALIDOS',
  'TRIBUNAL_INCOMPLETO_FECHA_TENTATIVA',
  'DOCENTE_ALCANZA_LIMITE_VOCALIAS',
  'TITULAR_MUCHAS_MESAS_PROPIAS',
]

const METRIC_KEYS = [
  'completionRate',
  'totalMesas',
  'planned',
  'pendientes',
  'mesasCompletas',
  'mesasConUnVocal',
  'mesasSinTribunal',
  'mesasSinFecha',
  'docentesEnLimite',
  'docentesExcedidos',
  'titularesInferidos',
  'titularesExplicitos',
  'titularesFaltantesReales',
  'materiasSinHorarioNoRequeridas',
  'materiasAmbiguas',
  'materiasRequierenRevision',
  'fallbackHorariosDocentes',
  'sourceDocenteMateria',
  'sourceInferidoUnicoDocente',
  'sourceRequiereRevision',
]

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

function numberOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function round4(value) {
  return Math.round(numberOrZero(value) * 10000) / 10000
}

function issueCode(issue = {}) {
  return clean(issue.code ?? issue.reason ?? issue.type ?? issue.message).toUpperCase()
}

function countIssueCodes(contract = {}) {
  const counts = Object.fromEntries(WARNING_CODES.map((code) => [code, 0]))
  const issues = [
    ...asArray(contract.errors),
    ...asArray(contract.warnings),
    ...asArray(contract.uiDto?.uiAlerts),
  ]
  const seen = new Set()

  issues.forEach((issue, index) => {
    const code = issueCode(issue)
    if (!Object.prototype.hasOwnProperty.call(counts, code)) return

    const dedupeKey = [
      code,
      clean(issue.mesaId ?? issue.id),
      clean(issue.docenteId),
      clean(issue.message),
      index,
    ].join('::')
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    counts[code] += 1
  })

  return counts
}

function sourceValue(materia = {}) {
  return clean(materia.titularSource)
}

function statusValue(materia = {}) {
  return clean(materia.titularResolutionStatus)
}

function isNoRequiredSubject(materia = {}) {
  return materia.requiereMesa === false && [
    'sinHorarioDocente',
    'docente_materia_no_requiere_mesa',
    'planNoRequiereMesa',
  ].includes(clean(materia.requiereMesaSource))
}

function institutionallyRequiresMesa(materia = {}) {
  return !isNoRequiredSubject(materia)
}

function requiresReview(materia = {}) {
  if (isNoRequiredSubject(materia)) return false

  const status = statusValue(materia)
  return (
    clean(materia.requiereMesaSource) === 'requiere_revision' ||
    sourceValue(materia) === 'requiere_revision' ||
    status === DOCENTE_MATERIA_RESOLUTION_STATUS.AMBIGUO_REQUIERE_REVISION ||
    status === DOCENTE_MATERIA_RESOLUTION_STATUS.SIN_TITULAR_VIGENTE
  )
}

function buildAdapterMetrics(input = {}) {
  const materias = asArray(input.materias)
  const diagnostics = input.metadata?.adapterDiagnostics ?? {}
  const sourceCounts = diagnostics.sourceCounts ?? {}

  return {
    titularesInferidos: materias.filter((materia) => (
      Boolean(clean(materia.titularId ?? materia.titular_id)) &&
      ['horariosDocentes', 'inferido_unico_docente'].includes(sourceValue(materia))
    )).length,
    titularesExplicitos: materias.filter((materia) => (
      Boolean(clean(materia.titularId ?? materia.titular_id)) &&
      sourceValue(materia) === 'docente_materia'
    )).length,
    titularesFaltantesReales: materias.filter((materia) => (
      institutionallyRequiresMesa(materia) && !clean(materia.titularId ?? materia.titular_id)
    )).length,
    materiasSinHorarioNoRequeridas: materias.filter((materia) => (
      materia.requiereMesa === false &&
      ['sinHorarioDocente', 'docente_materia_no_requiere_mesa'].includes(clean(materia.requiereMesaSource))
    )).length,
    materiasAmbiguas: materias.filter((materia) => (
      statusValue(materia) === DOCENTE_MATERIA_RESOLUTION_STATUS.AMBIGUO_REQUIERE_REVISION
    )).length,
    materiasRequierenRevision: materias.filter(requiresReview).length,
    fallbackHorariosDocentes: materias.filter((materia) => sourceValue(materia) === 'horariosDocentes').length,
    sourceDocenteMateria: materias.filter((materia) => sourceValue(materia) === 'docente_materia').length,
    sourceInferidoUnicoDocente: materias.filter((materia) => sourceValue(materia) === 'inferido_unico_docente').length,
    sourceRequiereRevision: materias.filter((materia) => (
      !isNoRequiredSubject(materia) &&
      (
        sourceValue(materia) === 'requiere_revision' ||
        clean(materia.requiereMesaSource) === 'requiere_revision'
      )
    )).length,
    sourceCounts: {
      docentes: numberOrZero(sourceCounts.docentes),
      horariosDocentes: numberOrZero(sourceCounts.horariosDocentes),
      docenteMateria: numberOrZero(sourceCounts.docenteMateria),
      planesEstudio: numberOrZero(sourceCounts.planesEstudio),
      correlatividades: numberOrZero(sourceCounts.correlatividades),
    },
  }
}

function buildScenario(snapshot = {}, label = '') {
  const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
  const contract = buildRegularExamPreviewIntegrationContract(input, {})
  const efficiency = buildExamEngineEfficiencySummary({
    contract,
    input,
    metadata: {
      source: label,
      readOnly: true,
    },
  })
  const adapter = buildAdapterMetrics(input)

  return {
    label,
    completionRate: round4(efficiency.completionRate),
    totalMesas: efficiency.totalMesas,
    planned: efficiency.totalPlanned,
    pendientes: efficiency.totalUnassigned,
    mesasCompletas: efficiency.mesasCompletas,
    mesasConUnVocal: efficiency.mesasConUnVocal,
    mesasSinTribunal: efficiency.mesasSinTribunal,
    mesasSinFecha: efficiency.mesasSinFecha,
    docentesEnLimite: efficiency.docentesEnLimite,
    docentesExcedidos: efficiency.docentesExcedidos,
    titularesInferidos: adapter.titularesInferidos,
    titularesExplicitos: adapter.titularesExplicitos,
    titularesFaltantesReales: adapter.titularesFaltantesReales,
    materiasSinHorarioNoRequeridas: adapter.materiasSinHorarioNoRequeridas,
    materiasAmbiguas: adapter.materiasAmbiguas,
    materiasRequierenRevision: adapter.materiasRequierenRevision,
    fallbackHorariosDocentes: adapter.fallbackHorariosDocentes,
    sourceDocenteMateria: adapter.sourceDocenteMateria,
    sourceInferidoUnicoDocente: adapter.sourceInferidoUnicoDocente,
    sourceRequiereRevision: adapter.sourceRequiereRevision,
    totalCriticalErrors: efficiency.totalCriticalErrors,
    totalWarnings: efficiency.totalWarnings,
    phase: efficiency.phase,
    status: efficiency.status,
    warningCounts: countIssueCodes(contract),
    sourceCounts: adapter.sourceCounts,
  }
}

function buildDiff(withoutDocenteMateria = {}, withDocenteMateria = {}) {
  const metricDiff = METRIC_KEYS.reduce((diff, key) => {
    diff[key] = round4(numberOrZero(withDocenteMateria[key]) - numberOrZero(withoutDocenteMateria[key]))
    return diff
  }, {})
  const warningCounts = WARNING_CODES.reduce((diff, code) => {
    diff[code] = numberOrZero(withDocenteMateria.warningCounts?.[code]) -
      numberOrZero(withoutDocenteMateria.warningCounts?.[code])
    return diff
  }, {})

  return {
    ...metricDiff,
    warningCounts,
  }
}

function buildInterpretation({ withoutDocenteMateria, withDocenteMateria, diff, parsedRows }) {
  const reduceInferencias = diff.titularesInferidos < 0
  const reduceAmbiguedad = diff.materiasAmbiguas < 0
  const mejoraCompletionRate = diff.completionRate > 0
  const mantieneOreduceSinTribunal = diff.mesasSinTribunal <= 0
  const aparecenMasRevision = diff.materiasRequierenRevision > 0
  const parserOk = parsedRows.errors.length === 0
  const rowsCount = parsedRows.rows.length
  const convieneComoBase = parserOk && rowsCount > 0 && reduceInferencias

  return {
    reduceInferencias,
    reduceAmbiguedad,
    mejoraCompletionRate,
    mantieneOreduceSinTribunal,
    aparecenMasCasosRevision: aparecenMasRevision,
    parserOk,
    convieneUsarPlantillaCandidataComoBaseInstitucional: convieneComoBase,
    summary: [
      reduceInferencias
        ? 'docente_materia reduce la cantidad de titulares inferidos desde horarios.'
        : 'docente_materia no reduce las inferencias frente al fallback actual.',
      reduceAmbiguedad
        ? 'docente_materia reduce materias ambiguas.'
        : 'docente_materia no reduce la ambiguedad todavia; las filas con revision deben completarse.',
      mejoraCompletionRate
        ? 'El completionRate mejora con docente_materia.'
        : 'El completionRate no mejora con la plantilla candidata actual.',
      mantieneOreduceSinTribunal
        ? 'Las mesas sin tribunal se mantienen o bajan.'
        : 'Las mesas sin tribunal suben y requieren revision antes de usar la plantilla.',
      aparecenMasRevision
        ? 'Aparecen mas materias que requieren revision institucional explicita.'
        : 'No aparecen mas materias en revision institucional.',
      convieneComoBase
        ? 'Conviene usar la plantilla candidata como base institucional revisable, no como version final.'
        : 'Conviene revisar y corregir la plantilla candidata antes de considerarla base institucional.',
    ],
    beforeAfter: {
      titularesInferidos: {
        before: withoutDocenteMateria.titularesInferidos,
        after: withDocenteMateria.titularesInferidos,
      },
      completionRate: {
        before: withoutDocenteMateria.completionRate,
        after: withDocenteMateria.completionRate,
      },
      materiasRequierenRevision: {
        before: withoutDocenteMateria.materiasRequierenRevision,
        after: withDocenteMateria.materiasRequierenRevision,
      },
    },
  }
}

function buildRecommendations({ withDocenteMateria, parsedRows, orphanHorariosCount = 0 }) {
  const recommendations = [
    'Revisar filas con requiere_revision = SI antes de usar docente_materia como fuente institucional.',
    'Definir titular en materias multidocente no practicas.',
    'Definir titular de mesa en practicas profesionales.',
    'Revisar horarios huerfanos y corregir carrera/materia si corresponde.',
    'Mantener materias sin horario como no requeridas mientras institucionalmente no deban generar mesa.',
    'Luego generar una version corregida de docente_materia con roles y estados validados.',
  ]

  if (parsedRows.errors.length > 0) {
    recommendations.unshift('Corregir errores del parser antes de ejecutar nuevas simulaciones.')
  }
  if (withDocenteMateria.materiasRequierenRevision === 0) {
    recommendations.push('Validar una muestra institucional aunque no queden materias marcadas como revision.')
  }
  if (orphanHorariosCount === 0) {
    recommendations.push('No se detectaron horarios huerfanos en este impacto; conservar la verificacion en futuras cargas.')
  }

  return recommendations
}

function parseCandidateRows(docenteMateriaRows = []) {
  return parseDocenteMateriaRows(asArray(docenteMateriaRows), {
    allowEmptyDocenteWhenNoRequiereMesa: true,
    source: 'docente_materia_candidate',
  })
}

export function compareDocenteMateriaImpact({
  baseSnapshot,
  docenteMateriaRows,
  options = {},
} = {}) {
  const safeSnapshot = baseSnapshot && typeof baseSnapshot === 'object' ? baseSnapshot : {}
  const parsedRows = parseCandidateRows(docenteMateriaRows)
  const withoutSnapshot = {
    ...cloneJson(safeSnapshot),
    docenteMateria: [],
  }
  const withSnapshot = {
    ...cloneJson(safeSnapshot),
    docenteMateria: parsedRows.rows,
  }
  const withoutDocenteMateria = buildScenario(withoutSnapshot, 'withoutDocenteMateria')
  const withDocenteMateria = buildScenario(withSnapshot, 'withDocenteMateria')
  const diff = buildDiff(withoutDocenteMateria, withDocenteMateria)
  const orphanHorariosCount = numberOrZero(options.orphanHorariosCount)
  const parser = {
    rows: parsedRows.rows.length,
    errors: parsedRows.errors.length,
    warnings: parsedRows.warnings.length,
  }

  return {
    withoutDocenteMateria,
    withDocenteMateria,
    diff,
    parser,
    interpretation: buildInterpretation({
      withoutDocenteMateria,
      withDocenteMateria,
      diff,
      parsedRows,
    }),
    recommendations: buildRecommendations({
      withDocenteMateria,
      parsedRows,
      orphanHorariosCount,
    }),
  }
}
