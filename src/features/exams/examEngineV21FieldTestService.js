import Papa from 'papaparse'
import {
  exportDraftScheduleForTeachers,
  exportFinalTribunalAlerts,
  exportFinalTribunalsOfficial,
  exportGeneratedTribunalsForReview,
  generateDraftExamSchedule,
  generateTribunalsFromReviewedSchedule,
  importFinalTribunalReview,
  importReviewedDraftSchedule,
} from '../../utils/examEngine/index.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../../utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { buildFeasibilityDiagnosis } from '../../utils/examEngine/diagnostics/feasibility.js'
import { teacherIsAvailableOnDate } from '../../utils/examEngine/rules/availability.js'
import { materiaAlcanzadaPorConfig } from '../../utils/examEngine/planning/draftSchedule/generateDraftExamSchedule.js'

// Estados realmente alcanzables por la UI (ver ExamEngineV21FieldTestPage.jsx).
// DRAFT_GENERATED, WAITING_TEACHER_REVIEW_IMPORT y TRIBUNALS_GENERATED se
// retiraron: generateDraft() y confirmTribunalSelection() nunca los seteaban,
// asi que mostrarlos en el progreso era enganoso.
export const FIELD_TEST_UI_STATES = {
  CONFIGURING_CALL: 'CONFIGURING_CALL',
  REVIEWED_IMPORTED: 'REVIEWED_IMPORTED',
  WAITING_FINAL_REVIEW_IMPORT: 'WAITING_FINAL_REVIEW_IMPORT',
  FINAL_READY: 'FINAL_READY',
  FINAL_HAS_BLOCKERS: 'FINAL_HAS_BLOCKERS',
}

export const FIELD_TEST_STATE_LABELS = {
  [FIELD_TEST_UI_STATES.CONFIGURING_CALL]: 'Configurando llamado',
  [FIELD_TEST_UI_STATES.REVIEWED_IMPORTED]: 'Precronograma listo (combinar y completar tribunales)',
  [FIELD_TEST_UI_STATES.WAITING_FINAL_REVIEW_IMPORT]: 'Esperando revision final',
  [FIELD_TEST_UI_STATES.FINAL_READY]: 'Final listo',
  [FIELD_TEST_UI_STATES.FINAL_HAS_BLOCKERS]: 'Final con bloqueos',
}

const DEFAULT_EXAM_CALL_FORM = {
  tipoPeriodo: 'REGULAR',
  cantidadLlamados: 1,
  fechaInicio: '2026-07-30',
  fechaFin: '2026-08-12',
  fechaInicioSegundoLlamado: '',
  fechaFinSegundoLlamado: '',
  usarDiasHabiles: true,
  carrerasIncluidas: 'ALL',
  alcanceCarrera: 'ALL',
  alcanceAnios: [],
  excepcionesPorCarrera: [],
  estadoSalida: 'TEACHER_REVIEW',
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeText(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function normalizeToken(value) {
  return normalizeText(value).replaceAll(/[^a-z0-9]+/g, '')
}

function subjectScopeKey(row = {}) {
  return [
    normalizeText(row.carrera ?? row.nombreCarrera ?? row.carreraNombre ?? row.career),
    normalizeToken(row.materia ?? row.codigo ?? row.materiaCodigo ?? row.id ?? row.materiaId),
  ].filter(Boolean).join('::')
}

function subjectStandaloneKeys(row = {}) {
  return [
    row.id,
    row.materiaId,
    row.materia_id,
    row.materia,
    row.codigo,
    row.materiaCodigo,
  ].map(normalizeToken).filter(Boolean)
}

function clonePlain(value) {
  if (Array.isArray(value)) return value.map(clonePlain)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clonePlain(entry)]))
  }

  return value
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value))
}

function parseYears(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite)

  return clean(value)
    .split(/[,\s;|]+/)
    .map(Number)
    .filter(Number.isFinite)
}

function parseIncludedCareers(value) {
  const text = clean(value)
  if (!text || normalizeToken(text) === 'all') return 'ALL'

  return text
    .split(/[\n,;|]+/)
    .map(clean)
    .filter(Boolean)
}

function readScopeCareer(form = {}) {
  const value = clean(form.alcanceCarrera ?? form.carreraIncluida ?? form.carreraSeleccionada)
  if (!value || normalizeToken(value) === 'all') return 'ALL'
  return value
}

function buildLegacyCareerExceptions(form = {}) {
  return asArray(form.excepcionesPorCarrera)
    .map((exception) => {
      const carreras = asArray(exception.carreras).map(clean).filter(Boolean)
      const aniosExcluidos = parseYears(exception.aniosExcluidos)
      if (carreras.length && aniosExcluidos.length) return { carreras, aniosExcluidos }
      return {
        carrera: clean(exception.carrera),
        soloAnios: parseYears(exception.soloAnios),
      }
    })
    .filter((exception) => (
      (exception.carreras?.length && exception.aniosExcluidos?.length) ||
      (exception.carrera && exception.soloAnios?.length)
    ))
}

function readCellValue(cell) {
  const value = cell?.value
  if (value === undefined || value === null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if ('text' in value) return clean(value.text)
    if ('result' in value) return clean(value.result)
    if ('richText' in value) return value.richText.map((entry) => entry.text).join('')
    if ('hyperlink' in value) return clean(value.text ?? value.hyperlink)
  }

  return clean(value)
}

function lookupTeacherId(teacherNameToId = {}, value = '') {
  return teacherNameToId[normalizeText(value)] ?? teacherNameToId[normalizeToken(value)] ?? ''
}

function getMesaId(mesa = {}) {
  return clean(mesa.draftMesaId ?? mesa.id ?? mesa.mesaId)
}

function getMesaFecha(mesa = {}) {
  return clean(mesa.fechaSugerida ?? mesa.fecha ?? mesa.fechaIso)
}

function getMesaLlamado(mesa = {}) {
  return clean(mesa.llamado ?? mesa.exam_call ?? mesa.callKey) || 'PRIMER_LLAMADO'
}

function getPublishableFinalStatus(value = '') {
  const status = normalizeToken(value)
  if (status === 'finalconfirmed') return 'confirmada'
  if (status === 'finalconfirmedminimum') return 'confirmada'
  if (status === 'tribunalcomplete') return 'confirmada'
  if (status === 'tribunalminimum') return 'confirmada'
  return ''
}

function formatDisplayDate(value = '') {
  const date = clean(value)
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return date

  return `${match[3]}/${match[2]}/${match[1]}`
}

function getCallMetadata(value = '') {
  const token = normalizeToken(value)
  if (token.includes('segundo') || token === 'second' || token === '2') {
    return { exam_call: 'second', llamado: 'Segundo llamado' }
  }
  if (token.includes('especial') || token === 'special') {
    return { exam_call: 'special', llamado: 'Llamado especial' }
  }

  return { exam_call: 'first', llamado: 'Primer llamado' }
}

function buildPublishedMesaId(mesa = {}, index = 0) {
  return [
    'exam-engine-v21',
    clean(mesa.draftMesaId ?? mesa.id ?? mesa.mesaId) || String(index + 1),
    clean(mesa.fechaSugerida ?? mesa.fechaIso ?? mesa.fecha),
  ].filter(Boolean).join('-')
}

function getDraftScheduleRows(draftResult = null) {
  if (!draftResult) return null
  if (Array.isArray(draftResult.draftSchedule)) return draftResult.draftSchedule
  if (Array.isArray(draftResult.precronograma)) return draftResult.precronograma
  if (Array.isArray(draftResult.mesas)) return draftResult.mesas
  if (Array.isArray(draftResult.rows)) return draftResult.rows
  return []
}

function getAffectedDraftKeys(draftResult = null) {
  const rows = getDraftScheduleRows(draftResult)
  if (!rows) return null

  return asArray(rows).reduce((keys, mesa) => {
    const sourceSubject = mesa.metadata?.sourceMateria ?? {}
    const scopedKeys = [
      mesa.metadata?.sourceSubjectKey,
      subjectScopeKey(mesa),
      subjectScopeKey(sourceSubject),
    ].map(normalizeText).filter(Boolean)
    const standaloneKeys = [
      ...subjectStandaloneKeys(mesa),
      ...subjectStandaloneKeys(sourceSubject),
    ]

    scopedKeys.forEach((key) => keys.scoped.add(key))
    standaloneKeys.forEach((key) => keys.standalone.add(key))
    return keys
  }, { scoped: new Set(), standalone: new Set() })
}

function filterMateriasAffectedByDraft(materias = [], draftResult = null) {
  const affectedKeys = getAffectedDraftKeys(draftResult)
  if (!affectedKeys) return asArray(materias)
  if (!affectedKeys.scoped.size && !affectedKeys.standalone.size) return []

  return asArray(materias).filter((materia) => {
    const scopedKey = normalizeText(subjectScopeKey(materia))
    if (scopedKey && affectedKeys.scoped.has(scopedKey)) return true
    if (scopedKey && affectedKeys.scoped.size) return false

    return subjectStandaloneKeys(materia).some((key) => affectedKeys.standalone.has(key))
  })
}

function createAssignmentFromMesa({ mesa, docenteId, rol }) {
  if (!docenteId) return null

  return {
    docenteId,
    mesaId: getMesaId(mesa),
    materiaId: clean(mesa.materiaId ?? mesa.materia_id ?? mesa.materia),
    carreraId: clean(mesa.carreraId ?? mesa.carrera_id),
    rol,
    llamado: getMesaLlamado(mesa),
    fecha: getMesaFecha(mesa),
    turno: clean(mesa.turno),
  }
}

function resolveMesaTeacherId(mesa = {}, fields = [], teacherNameToId = {}) {
  for (const field of fields) {
    const value = clean(mesa[field])
    if (!value) continue
    const resolved = lookupTeacherId(teacherNameToId, value)
    if (resolved) return resolved
    if (field.toLowerCase().includes('id')) return value
  }

  return ''
}

export function createDefaultExamCallConfigForm(seed = {}, { requireExplicitDates = false } = {}) {
  return {
    ...clonePlain(DEFAULT_EXAM_CALL_FORM),
    tipoPeriodo: clean(seed.examType).toLowerCase() === 'special' ? 'ESPECIAL' : 'REGULAR',
    cantidadLlamados: Number(seed.regularCallRanges?.callCount) === 2 ? 2 : 1,
    fechaInicio: clean(seed.regularCallRanges?.first?.start ?? seed.fechaInicio) || (requireExplicitDates ? '' : DEFAULT_EXAM_CALL_FORM.fechaInicio),
    fechaFin: clean(seed.regularCallRanges?.first?.end ?? seed.fechaFin) || (requireExplicitDates ? '' : DEFAULT_EXAM_CALL_FORM.fechaFin),
    fechaInicioSegundoLlamado: clean(seed.regularCallRanges?.second?.start),
    fechaFinSegundoLlamado: clean(seed.regularCallRanges?.second?.end),
  }
}

export function validateExamCallConfigForm(form = {}) {
  const errors = []
  const warnings = []
  const fechaInicio = clean(form.fechaInicio)
  const fechaFin = clean(form.fechaFin)

  if (!fechaInicio) errors.push('La fecha de inicio es obligatoria.')
  if (!fechaFin) errors.push('La fecha de fin es obligatoria.')
  if (fechaInicio && !isValidIsoDate(fechaInicio)) errors.push('La fecha de inicio debe tener formato YYYY-MM-DD.')
  if (fechaFin && !isValidIsoDate(fechaFin)) errors.push('La fecha de fin debe tener formato YYYY-MM-DD.')
  if (isValidIsoDate(fechaInicio) && isValidIsoDate(fechaFin) && fechaFin < fechaInicio) {
    errors.push('La fecha de fin debe ser posterior o igual a la fecha de inicio.')
  }
  if (clean(form.tipoPeriodo).toUpperCase() === 'REGULAR' && Number(form.cantidadLlamados) === 2) {
    const secondStart = clean(form.fechaInicioSegundoLlamado)
    const secondEnd = clean(form.fechaFinSegundoLlamado)
    if (!secondStart) errors.push('La fecha de inicio del segundo llamado es obligatoria.')
    if (!secondEnd) errors.push('La fecha de fin del segundo llamado es obligatoria.')
    if (secondStart && !isValidIsoDate(secondStart)) errors.push('La fecha de inicio del segundo llamado no es valida.')
    if (secondEnd && !isValidIsoDate(secondEnd)) errors.push('La fecha de fin del segundo llamado no es valida.')
    if (isValidIsoDate(secondStart) && isValidIsoDate(secondEnd) && secondEnd < secondStart) {
      errors.push('La fecha de fin del segundo llamado debe ser posterior o igual a su inicio.')
    }
  }

  asArray(form.excepcionesPorCarrera).forEach((exception, index) => {
    const careers = asArray(exception.carreras).map(clean).filter(Boolean)
    const years = parseYears(exception.aniosExcluidos)
    if (!careers.length && !clean(exception.carrera) && (years.length || clean(exception.soloAnios))) {
      warnings.push(`La excepcion ${index + 1} tiene anios pero no carreras seleccionadas.`)
    }
    if ((careers.length || clean(exception.carrera)) && !years.length && !clean(exception.soloAnios)) {
      warnings.push(`La excepcion ${index + 1} tiene carreras pero no anios excluidos.`)
    }
  })

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  }
}

export function buildExamCallConfigFromForm(form = {}) {
  const tipoPeriodo = clean(form.tipoPeriodo).toUpperCase() === 'ESPECIAL' ? 'ESPECIAL' : 'REGULAR'
  const cantidadLlamados = tipoPeriodo === 'ESPECIAL'
      ? 1
      : (Number(form.cantidadLlamados) === 2 ? 2 : 1)
  const scopeCareer = readScopeCareer(form)
  const scopeYears = parseYears(form.alcanceAnios ?? form.aniosIncluidos)
  const legacyExceptions = buildLegacyCareerExceptions(form)
  const scopeExceptions = scopeCareer !== 'ALL' && scopeYears.length
    ? [{ carrera: scopeCareer, soloAnios: scopeYears }]
    : []

  return {
    tipoPeriodo,
    cantidadLlamados,
    fechaInicio: clean(form.fechaInicio),
    fechaFin: clean(form.fechaFin),
    rangosLlamados: tipoPeriodo === 'REGULAR' ? {
      PRIMER_LLAMADO: { inicio: clean(form.fechaInicio), fin: clean(form.fechaFin) },
      ...(cantidadLlamados === 2 ? {
        SEGUNDO_LLAMADO: {
          inicio: clean(form.fechaInicioSegundoLlamado),
          fin: clean(form.fechaFinSegundoLlamado),
        },
      } : {}),
    } : {
      LLAMADO_ESPECIAL: { inicio: clean(form.fechaInicio), fin: clean(form.fechaFin) },
    },
    usarDiasHabiles: form.usarDiasHabiles !== false,
    carrerasIncluidas: scopeCareer === 'ALL'
      ? parseIncludedCareers(form.carrerasIncluidas)
      : [scopeCareer],
    excepcionesPorCarrera: [
      ...scopeExceptions,
      ...legacyExceptions,
    ],
    estadoSalida: clean(form.estadoSalida) || 'TEACHER_REVIEW',
  }
}

export function buildTeacherAssignmentsFromCronograma(cronograma = [], teacherNameToId = {}) {
  return asArray(cronograma).flatMap((mesa) => [
    createAssignmentFromMesa({
      mesa,
      docenteId: resolveMesaTeacherId(mesa, ['titularId', 'profesorTitularId', 'titular', 'profesorTitular'], teacherNameToId),
      rol: 'TITULAR',
    }),
    createAssignmentFromMesa({
      mesa,
      docenteId: resolveMesaTeacherId(mesa, ['vocal1Id', 'vocal1_id', 'vocal1'], teacherNameToId),
      rol: 'VOCAL_1',
    }),
    createAssignmentFromMesa({
      mesa,
      docenteId: resolveMesaTeacherId(mesa, ['vocal2Id', 'vocal2_id', 'vocal2'], teacherNameToId),
      rol: 'VOCAL_2',
    }),
  ].filter(Boolean))
}

export function buildExamEngineV21DataFromWorkspace({
  workspaceSnapshot = {},
  examCallConfig = {},
  includeCurrentCronogramaAssignments = false,
} = {}) {
  const adapted = buildRegularExamInputFromWorkspaceSnapshot({
    ...workspaceSnapshot,
    fechaInicio: examCallConfig.fechaInicio,
    fechaFin: examCallConfig.fechaFin,
    examType: 'regular',
    regularCallRanges: {
      first: {
        start: examCallConfig.fechaInicio,
        end: examCallConfig.fechaFin,
      },
    },
  })
  const teacherAssignments = includeCurrentCronogramaAssignments
    ? buildTeacherAssignmentsFromCronograma(
      workspaceSnapshot.cronograma,
      adapted.metadata?.teacherNameToId ?? {},
    )
    : []

  return {
    docentes: adapted.docentes,
    materias: adapted.materias,
    teacherAssignments,
    correlatividades: adapted.correlatividades ?? [],
    metadata: adapted.metadata,
  }
}

export function buildDataWarnings({ docentes = [], materias = [], draftResult = null, tribunalResult = null, finalResult = null } = {}) {
  const warnings = []
  const affectedMaterias = filterMateriasAffectedByDraft(materias, draftResult)

  if (!asArray(materias).length) warnings.push('No hay materias adaptadas para el motor.')
  if (!asArray(docentes).length) warnings.push('No hay docentes adaptados para el motor.')

  const draftSinTitular = Number(draftResult?.summary?.totalSinTitular ?? 0)
  if (draftSinTitular > 0) {
    warnings.push(`Hay ${draftSinTitular} mesas sin titular.`)

    const unresolved = affectedMaterias.filter((materia) => !clean(
      materia.titularId ?? materia.titular_id ?? materia.docenteTitularId,
    ))
    const reasons = unresolved.reduce((counts, materia) => {
      const reason = clean(materia.requiereMesaSource) ||
        clean(materia.titularResolutionStatus) ||
        'SIN_DIAGNOSTICO'
      counts[reason] = (counts[reason] ?? 0) + 1
      return counts
    }, {})
    const reasonSummary = Object.entries(reasons)
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => `${reason}: ${count}`)
      .join(', ')
    if (reasonSummary) warnings.push(`Diagnostico de titulares: ${reasonSummary}.`)

    const examples = unresolved.slice(0, 6).map((materia) => {
      const career = clean(materia.carrera ?? materia.nombreCarrera) || 'Carrera sin nombre'
      const code = clean(materia.materia ?? materia.codigo ?? materia.id) || 'sin codigo'
      const name = clean(materia.nombreMateria ?? materia.materiaNombre) || 'sin nombre'
      return `${career} / ${code} / ${name}`
    })
    if (examples.length) warnings.push(`Ejemplos sin titular: ${examples.join(' | ')}.`)
  }

  const incompleteTribunals = Number(tribunalResult?.summary?.totalIncomplete ?? 0)
  if (incompleteTribunals > 0) warnings.push(`Hay ${incompleteTribunals} tribunales incompletos.`)

  const blockingFinalAlerts = asArray(finalResult?.alerts).filter((alert) => alert.severity === 'critical').length
  if (blockingFinalAlerts > 0) warnings.push(`Hay ${blockingFinalAlerts} alertas finales bloqueantes.`)

  return warnings
}

// The relational preview fails closed and reports raw issues per subject.
// The operational workflow retains its existing incremental draft behavior.
export function runRelationalPreviewDraftStep({ data, examCallConfig, generatedAt }) {
  const diagnosis = buildFeasibilityDiagnosis({
    ...data,
    materias: data.materias.filter((materia) => materiaAlcanzadaPorConfig(materia, examCallConfig).included),
    config: examCallConfig,
  })
  if (!diagnosis.canGenerate) return { errors: diagnosis.errors }
  const result = runDraftScheduleStep({ ...data, examCallConfig, generatedAt })
  const teachers = new Map(data.docentes.map((teacher) => [teacher.id, teacher]))
  const availabilityErrors = result.draftResult.draftSchedule.flatMap((mesa) => {
    const teacher = teachers.get(mesa.titularId)
    return teacher && teacherIsAvailableOnDate(teacher, mesa.fecha) ? [] : [{
      code: 'PREVIEW_TITULAR_NO_DISPONIBLE',
      entityId: mesa.materiaId,
      message: `${mesa.materiaMesa}: el titular no tiene disponibilidad para ${mesa.fecha || 'el periodo elegido'}.`,
    }]
  })
  return { ...result, errors: [...result.draftResult.errors, ...availabilityErrors] }
}

export function buildUnresolvedTitularRows(materias = [], draftResult = null) {
  return filterMateriasAffectedByDraft(materias, draftResult)
    .filter((materia) => materia.requiereMesa !== false)
    .filter((materia) => !clean(materia.titularId ?? materia.titular_id ?? materia.docenteTitularId))
    .map((materia) => {
      const resolution = clean(materia.titularResolutionStatus)
      const source = clean(materia.requiereMesaSource) || 'SIN_DIAGNOSTICO'
      let solucion = 'Agregar o corregir en docente_materia una fila TITULAR ACTIVA con el mismo materia_id; Horarios de profesores se usa como respaldo.'
      if (source === 'titularInexistente') {
        solucion = 'El horario identifica al profesor, pero falta vincularlo al padrón de docentes.'
      } else if (source === 'requiere_revision' || resolution === 'AMBIGUO_REQUIERE_REVISION') {
        solucion = 'Hay más de un posible titular. Dejar una única titularidad activa para esta materia.'
      }

      return {
        carrera: clean(materia.carrera ?? materia.nombreCarrera) || 'Sin carrera',
        codigo: clean(materia.materia ?? materia.codigo ?? materia.id) || 'Sin código',
        materia: clean(materia.nombreMateria ?? materia.materiaNombre ?? materia.nombre) || 'Sin nombre',
        motivo: source,
        estadoResolucion: resolution || 'SIN_COINCIDENCIA',
        solucion,
      }
    })
    .sort((left, right) => (
      left.carrera.localeCompare(right.carrera) || left.codigo.localeCompare(right.codigo)
    ))
}

export function summarizeReviewedSchedule(reviewedSchedule = []) {
  return {
    totalMesas: reviewedSchedule.length,
    listasParaTribunal: reviewedSchedule.filter((mesa) => mesa.estado === 'READY_FOR_TRIBUNAL').length,
    excluidas: reviewedSchedule.filter((mesa) => mesa.estado === 'EXCLUDED_BY_REVIEW').length,
    pendientesRevision: reviewedSchedule.filter((mesa) => ![
      'READY_FOR_TRIBUNAL',
      'EXCLUDED_BY_REVIEW',
    ].includes(mesa.estado)).length,
  }
}

export function summarizeFinalTribunals(finalTribunals = []) {
  return {
    confirmados: finalTribunals.filter((mesa) => mesa.estadoFinal === 'FINAL_CONFIRMED').length,
    confirmadosMinimos: finalTribunals.filter((mesa) => mesa.estadoFinal === 'FINAL_CONFIRMED_MINIMUM').length,
    bloqueados: finalTribunals.filter((mesa) => mesa.estadoFinal === 'FINAL_BLOCKED_BY_VALIDATION').length,
    excluidos: finalTribunals.filter((mesa) => mesa.estadoFinal === 'FINAL_EXCLUDED').length,
    pendientes: finalTribunals.filter((mesa) => [
      'FINAL_NEEDS_REVIEW',
      'FINAL_INCOMPLETE',
    ].includes(mesa.estadoFinal)).length,
  }
}

export function runDraftScheduleStep({ docentes, materias, examCallConfig, generatedAt } = {}) {
  const draftResult = generateDraftExamSchedule({
    docentes,
    materias,
    examCallConfig,
  })
  const draftExport = exportDraftScheduleForTeachers(draftResult, { generatedAt })

  return {
    draftResult,
    draftExport,
  }
}

export function runReviewedScheduleStep({
  originalDraftSchedule,
  reviewedRows,
  docentes,
  examCallConfig,
} = {}) {
  const reviewedResult = importReviewedDraftSchedule({
    originalDraftSchedule,
    reviewedRows,
    docentes,
    examCallConfig,
  })

  return {
    reviewedResult,
    summary: summarizeReviewedSchedule(reviewedResult.reviewedSchedule),
  }
}

export function runTribunalGenerationStep({
  reviewedSchedule,
  docentes,
  materias,
  teacherAssignments,
  examCallConfig,
  tribunalRules,
  generatedAt,
} = {}) {
  const tribunalResult = generateTribunalsFromReviewedSchedule({
    reviewedSchedule,
    docentes,
    materias,
    teacherAssignments,
    examCallConfig,
    tribunalRules,
  })
  const tribunalReviewExport = exportGeneratedTribunalsForReview(tribunalResult, { generatedAt })

  return {
    tribunalResult,
    tribunalReviewExport,
  }
}

export function runFinalReviewStep({
  generatedTribunals,
  finalReviewedRows,
  docentes,
  teacherAssignments,
  examCallConfig,
  tribunalRules,
  generatedAt,
} = {}) {
  const finalResult = importFinalTribunalReview({
    generatedTribunals,
    reviewedRows: finalReviewedRows,
    docentes,
    teacherAssignments,
    examCallConfig,
    tribunalRules,
  })
  const officialExport = exportFinalTribunalsOfficial(finalResult, { generatedAt })
  const finalAlertsExport = exportFinalTribunalAlerts(finalResult, { generatedAt })

  return {
    finalResult,
    officialExport,
    finalAlertsExport,
    summary: summarizeFinalTribunals(finalResult.finalTribunals),
  }
}

export function createConfirmedTeacherReviewRows(draftRows = []) {
  return asArray(draftRows).map((row) => ({
    ...row,
    confirmada: 'si',
  }))
}

export function createConfirmedFinalReviewRows(tribunalRows = []) {
  return asArray(tribunalRows).map((row) => ({
    draftMesaId: row.draftMesaId,
    vocal1: row.vocal1,
    vocal2: row.vocal2,
    estadoFinal: 'FINAL_CONFIRMED',
    tribunalMinimoAceptado: row.estado === 'TRIBUNAL_MINIMUM' ? 'si' : '',
  }))
}

function reviewStatusEntriesForMesa(mesaStatus = {}) {
  return ['titular', 'vocal1', 'vocal2']
    .map((roleKey) => mesaStatus?.[roleKey])
    .filter(Boolean)
}

export function createConfirmedFinalReviewRowsFromTeacherStatus(tribunalRows = [], teacherReviewSummary = {}) {
  const statusByMesaId = new Map(
    asArray(teacherReviewSummary?.mesas)
      .map((mesa) => [clean(mesa.draftMesaId), mesa])
      .filter(([draftMesaId]) => Boolean(draftMesaId)),
  )

  return asArray(tribunalRows).flatMap((row) => {
    const draftMesaId = clean(row.draftMesaId)
    const mesaStatus = statusByMesaId.get(draftMesaId)
    const entries = reviewStatusEntriesForMesa(mesaStatus)

    if (!entries.length || entries.some((entry) => clean(entry.status) !== 'confirmed')) {
      return []
    }

    return [{
      draftMesaId,
      vocal1: row.vocal1,
      vocal2: row.vocal2,
      estadoFinal: 'FINAL_CONFIRMED',
      tribunalMinimoAceptado: row.estado === 'TRIBUNAL_MINIMUM' ? 'si' : '',
    }]
  })
}

export function buildPublishedCronogramaFromFinalTribunals(finalTribunals = [], options = {}) {
  const publishedAt = clean(options.generatedAt) || new Date().toISOString()

  return asArray(finalTribunals)
    .filter((mesa) => getPublishableFinalStatus(mesa.estadoFinal ?? mesa.estado) === 'confirmada')
    .filter((mesa) => clean(mesa.fechaSugerida ?? mesa.fechaIso ?? mesa.fecha))
    .map((mesa, index) => {
      const fechaIso = clean(mesa.fechaSugerida ?? mesa.fechaIso ?? mesa.fecha)
      const materia = clean(mesa.materiaId ?? mesa.materia_id ?? mesa.materia ?? mesa.codigo)
      const nombreMateria = clean(mesa.materiaMesa ?? mesa.nombreMateria ?? mesa.materia_nombre ?? mesa.nombre ?? materia)
      const call = getCallMetadata(mesa.llamado ?? mesa.exam_call ?? mesa.callKey)

      return {
        id: buildPublishedMesaId(mesa, index),
        mesa: index + 1,
        carrera: clean(mesa.carrera ?? mesa.nombreCarrera ?? mesa.career),
        anio: clean(mesa.anio ?? mesa.anio_cursada ?? mesa.year),
        materia,
        codigo: materia,
        nombreMateria,
        fechaIso,
        fecha: formatDisplayDate(fechaIso),
        fechaSugerida: fechaIso,
        dia: clean(mesa.dia ?? mesa.diaSemana),
        inicio: clean(mesa.inicio ?? mesa.hora) || '08:00',
        fin: clean(mesa.fin),
        profesorTitular: clean(mesa.titular ?? mesa.profesorTitular),
        titularId: clean(mesa.titularId ?? mesa.profesorTitularId),
        vocal1: clean(mesa.vocal1),
        vocal1Id: clean(mesa.vocal1Id),
        vocal2: clean(mesa.vocal2),
        vocal2Id: clean(mesa.vocal2Id),
        aula: clean(mesa.aula) || 'A confirmar',
        estado: 'confirmada',
        estadoFinal: clean(mesa.estadoFinal ?? mesa.estado),
        exam_type: call.exam_call === 'special' ? 'special' : 'regular',
        exam_call: call.exam_call,
        llamado: call.llamado,
        inscription_mode: 'student_self_service',
        auto_enrollment_enabled: true,
        ajusteManual: false,
        origenMotor: 'exam-engine-v21',
        publishedAt,
        alertasFinales: asArray(mesa.alertasFinales ?? mesa.finalValidation?.alerts),
        observacionManual: clean(mesa.observacionesFinales ?? mesa.observaciones),
      }
    })
}

const ASSIGNMENT_ROLE_KEYS = {
  TITULAR: 'titular',
  VOCAL_1: 'vocal1',
  VOCAL_2: 'vocal2',
}

// Cruza el precronograma publicado con lo que cada docente cargo desde su
// portal (fetchExamTeacherAssignmentsForReview), para que el admin vea el
// estado real de confirmacion/objecion sin exportar/importar un archivo.
export function summarizeTeacherReviewStatus(reviewRows = [], assignmentRows = []) {
  const byMesa = new Map()
  const reviewByMesaId = new Map(asArray(reviewRows).map((row) => [clean(row.draftMesaId), row]))

  asArray(assignmentRows).forEach((row) => {
    const mesaId = clean(row.exam_table_id)
    const roleKey = ASSIGNMENT_ROLE_KEYS[row.role]
    if (!mesaId || !roleKey) return

    const entry = byMesa.get(mesaId) ?? {}
    entry[roleKey] = {
      nombre: clean(row.metadata?.[roleKey]),
      teacherId: clean(row.teacher_id),
      role: clean(row.role),
      examTableId: mesaId,
      status: clean(row.confirmation_status) || 'pending',
      notas: clean(row.teacher_notes),
      confirmedAt: row.confirmed_at ?? null,
      objectionDeadline: row.objection_deadline ?? null,
      reassignmentStatus: clean(row.reassignment_status) || 'none',
      requestedExamTableId: clean(row.requested_exam_table_id),
      requestedRole: clean(row.requested_role),
      requestedDate: row.requested_date ?? null,
      automaticSwap: row.metadata?.automatic_swap ?? null,
      automaticSwapSourceDate: row.metadata?.automatic_swap
        ? clean(reviewByMesaId.get(clean(row.metadata.automatic_swap.source_exam_table_id))?.fecha)
        : '',
      automaticSwapTargetDate: row.metadata?.automatic_swap
        ? clean(reviewByMesaId.get(clean(row.metadata.automatic_swap.target_exam_table_id))?.fecha)
        : '',
      pendingReason: clean(row.metadata?.reassignment_pending_reason),
    }
    byMesa.set(mesaId, entry)
  })

  const mesas = asArray(reviewRows).map((row) => {
    const mesaId = clean(row.draftMesaId)
    const roles = byMesa.get(mesaId) ?? {}

    return {
      draftMesaId: mesaId,
      materiaMesa: clean(row.materiaMesa ?? row.materia),
      carrera: clean(row.carrera),
      fecha: clean(row.fecha),
      titular: roles.titular ?? null,
      vocal1: roles.vocal1 ?? null,
      vocal2: roles.vocal2 ?? null,
    }
  })

  const allStatuses = mesas.flatMap((mesa) => (
    [mesa.titular, mesa.vocal1, mesa.vocal2].filter(Boolean).map((entry) => entry.status)
  ))

  return {
    mesas,
    counts: {
      confirmed: allStatuses.filter((status) => status === 'confirmed').length,
      pending: allStatuses.filter((status) => status === 'pending').length,
      objected: allStatuses.filter((status) => status === 'objected').length,
      total: allStatuses.length,
    },
  }
}

export function resolveFinalUiState(summary = {}) {
  const hasBlockers = Number(summary.bloqueados ?? 0) > 0 ||
    Number(summary.pendientes ?? 0) > 0

  return hasBlockers
    ? FIELD_TEST_UI_STATES.FINAL_HAS_BLOCKERS
    : FIELD_TEST_UI_STATES.FINAL_READY
}

export async function parseReviewRowsFile(file) {
  if (!file) return []

  const extension = clean(file.name).split('.').pop()?.toLowerCase()
  if (extension === 'json') {
    const parsed = JSON.parse(await file.text())
    if (Array.isArray(parsed)) return parsed
    if (Array.isArray(parsed.rows)) return parsed.rows
    throw new Error('El JSON debe ser un array de filas o un objeto con propiedad rows.')
  }

  if (extension === 'csv') {
    const parsed = Papa.parse(await file.text(), {
      header: true,
      skipEmptyLines: true,
    })
    if (parsed.errors?.length) {
      throw new Error(parsed.errors[0].message || 'No se pudo leer el CSV.')
    }
    return parsed.data
  }

  if (extension === 'xlsx') {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.default.Workbook()
    await workbook.xlsx.load(await file.arrayBuffer())
    const worksheet = workbook.worksheets[0]
    if (!worksheet) return []

    const headers = worksheet.getRow(1).values
      .slice(1)
      .map(clean)
    const rows = []

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return

      const normalized = {}
      headers.forEach((header, index) => {
        if (!header) return
        normalized[header] = readCellValue(row.getCell(index + 1))
      })

      if (Object.values(normalized).some((value) => clean(value))) rows.push(normalized)
    })

    return rows
  }

  throw new Error('Formato no soportado. Usa CSV, XLSX o JSON.')
}

export function rowsToCsv(rows = [], columns = []) {
  const sourceRows = asArray(rows)
  const columnDefs = asArray(columns).length
    ? asArray(columns)
      .map((column) => {
        const key = column?.key ?? column
        return key ? { key, label: column?.label ?? key } : null
      })
      .filter(Boolean)
    : [...new Set(sourceRows.flatMap((row) => Object.keys(row ?? {})))]
      .map((key) => ({ key, label: key }))
  const escapeValue = (value) => {
    const text = clean(value)
    if (!/[",\n\r]/.test(text)) return text
    return `"${text.replaceAll('"', '""')}"`
  }

  return [
    columnDefs.map((column) => escapeValue(column.label)).join(','),
    ...sourceRows.map((row) => columnDefs.map((column) => escapeValue(row?.[column.key])).join(',')),
  ].join('\n')
}

export function downloadRowsAsCsv({ rows = [], columns = [], filename = 'exam-engine-v21.csv' } = {}) {
  const csv = rowsToCsv(rows, columns)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)

  return {
    filename,
    rows: asArray(rows).length,
  }
}
