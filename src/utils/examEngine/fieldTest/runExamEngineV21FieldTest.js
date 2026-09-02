import { CANTIDADES_LLAMADOS, TIPOS_PERIODO } from '../constants.js'
import { generateDraftExamSchedule } from '../planning/draftSchedule/generateDraftExamSchedule.js'
import { exportDraftScheduleForTeachers } from '../exports/exportDraftScheduleForTeachers.js'
import { importReviewedDraftSchedule } from '../planning/reviewedSchedule/importReviewedDraftSchedule.js'
import { generateTribunalsFromReviewedSchedule } from '../planning/tribunals/generateTribunalsFromReviewedSchedule.js'
import { GENERATED_TRIBUNAL_STATUSES } from '../planning/tribunals/assignVocalesForReviewedMesa.js'
import { exportGeneratedTribunalsForReview } from '../exports/exportGeneratedTribunalsForReview.js'
import { importFinalTribunalReview } from '../planning/finalReview/importFinalTribunalReview.js'
import { FINAL_TRIBUNAL_STATUSES } from '../planning/finalReview/reconcileFinalTribunalReview.js'
import { exportFinalTribunalsOfficial } from '../exports/exportFinalTribunalsOfficial.js'
import { exportFinalTribunalAlerts } from '../exports/exportFinalTribunalAlerts.js'
import { DRAFT_SCHEDULE_STATUSES } from './august2026FieldTestConfig.js'

export const EXAM_ENGINE_V21_FIELD_TEST_STAGE = 'EXAM_ENGINE_V21_FIELD_TEST'

export const DEFAULT_EXAM_ENGINE_V21_FIELD_TEST_CONFIG = {
  id: 'exam-engine-v21-field-test-default',
  label: 'Julio-Agosto 2026 field test',
  tipoPeriodo: TIPOS_PERIODO.REGULAR,
  cantidadLlamados: CANTIDADES_LLAMADOS.UNO,
  fechaInicio: '2026-07-30',
  fechaFin: '2026-08-12',
  usarDiasHabiles: true,
  carrerasIncluidas: 'ALL',
  excepcionesPorCarrera: [
    {
      carrera: 'Profesorado de Geografia',
      soloAnios: [4],
    },
  ],
  estadoSalida: DRAFT_SCHEDULE_STATUSES.TEACHER_REVIEW,
  asignarVocales: false,
  aplicarMitadMasUno: false,
}

const DEFAULT_FIELD_TEST_DAYS = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
]

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

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function countWhere(items = [], predicate) {
  return items.filter(predicate).length
}

function getMesaFecha(mesa = {}) {
  return clean(mesa.fechaSugerida ?? mesa.fecha)
}

function getMesaId(mesa = {}) {
  return clean(mesa.draftMesaId ?? mesa.id ?? mesa.mesaId)
}

function resolveExamCallConfig(input = {}) {
  return clonePlain(
    input.examCallConfig ??
    input.config ??
    input.examPeriodConfig ??
    DEFAULT_EXAM_ENGINE_V21_FIELD_TEST_CONFIG,
  )
}

function createFieldTestDocentes() {
  return [
    {
      id: 'field-doc-geo-titular',
      nombre: 'Ana Titular Geografia',
      activo: true,
      carrera: 'Profesorado de Geografia',
      nombreMateria: 'Geografia Regional',
      diasAsistencia: DEFAULT_FIELD_TEST_DAYS,
      horasCatedra: 8,
    },
    {
      id: 'field-doc-geo-vocal-1',
      nombre: 'Bruno Vocal Geografia',
      activo: true,
      carrera: 'Profesorado de Geografia',
      nombreMateria: 'Cartografia Aplicada',
      diasAsistencia: DEFAULT_FIELD_TEST_DAYS,
      horasCatedra: 8,
    },
    {
      id: 'field-doc-geo-vocal-2',
      nombre: 'Carla Vocal Geografia',
      activo: true,
      carrera: 'Profesorado de Geografia',
      nombreMateria: 'Geografia Regional',
      diasAsistencia: DEFAULT_FIELD_TEST_DAYS,
      horasCatedra: 8,
    },
    {
      id: 'field-doc-geo-vocal-3',
      nombre: 'Dario Vocal Geografia',
      activo: true,
      carrera: 'Profesorado de Geografia',
      nombreMateria: 'Geografia Argentina',
      diasAsistencia: DEFAULT_FIELD_TEST_DAYS,
      horasCatedra: 8,
    },
  ]
}

function createFieldTestMaterias() {
  return [
    {
      id: 'FIELD-GEO-3',
      materia: 'FIELD-GEO-3',
      nombreMateria: 'Geografia Argentina',
      carreraId: 'prof-geografia',
      carrera: 'Profesorado de Geografia',
      anio: 3,
      titular_id: 'field-doc-geo-titular',
      requiereMesa: true,
    },
    {
      id: 'FIELD-GEO-4-A',
      materia: 'FIELD-GEO-4-A',
      nombreMateria: 'Cartografia Aplicada',
      carreraId: 'prof-geografia',
      carrera: 'Profesorado de Geografia',
      anio: 4,
      titular_id: 'field-doc-geo-titular',
      requiereMesa: true,
    },
    {
      id: 'FIELD-GEO-4-B',
      materia: 'FIELD-GEO-4-B',
      nombreMateria: 'Geografia Regional',
      carreraId: 'prof-geografia',
      carrera: 'Profesorado de Geografia',
      anio: 4,
      titular_id: 'field-doc-geo-titular',
      requiereMesa: true,
    },
  ]
}

export function getExamEngineV21FieldTestSampleData() {
  return {
    docentes: createFieldTestDocentes(),
    materias: createFieldTestMaterias(),
  }
}

export function getDefaultExamEngineV21FieldTestConfig() {
  return clonePlain(DEFAULT_EXAM_ENGINE_V21_FIELD_TEST_CONFIG)
}

function buildDefaultReviewedRows(draftRows = []) {
  return draftRows.map((row) => ({
    ...row,
    confirmada: 'si',
  }))
}

function buildDefaultFinalReviewRows(tribunalRows = []) {
  return tribunalRows.map((row) => ({
    draftMesaId: row.draftMesaId,
    vocal1: row.vocal1,
    vocal2: row.vocal2,
    estadoFinal: FINAL_TRIBUNAL_STATUSES.FINAL_CONFIRMED,
    tribunalMinimoAceptado: row.estado === GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_MINIMUM ? 'si' : '',
  }))
}

function resolveRows(rowsOrFactory, fallbackFactory, rows, context) {
  if (typeof rowsOrFactory === 'function') {
    const resolvedRows = rowsOrFactory(rows, context)
    return asArray(resolvedRows)
  }

  if (Array.isArray(rowsOrFactory)) return rowsOrFactory
  return fallbackFactory(rows, context)
}

function summarizeDraft(draftSchedule = []) {
  return {
    totalMesas: draftSchedule.length,
    conTitular: countWhere(draftSchedule, (mesa) => clean(mesa.titularId)),
    sinTitular: countWhere(draftSchedule, (mesa) => !clean(mesa.titularId)),
    paraRevisionDocente: countWhere(
      draftSchedule,
      (mesa) => mesa.estado === DRAFT_SCHEDULE_STATUSES.TEACHER_REVIEW,
    ),
  }
}

function summarizeReviewed(reviewedSchedule = []) {
  return {
    totalMesas: reviewedSchedule.length,
    listasParaTribunal: countWhere(
      reviewedSchedule,
      (mesa) => mesa.estado === DRAFT_SCHEDULE_STATUSES.READY_FOR_TRIBUNAL,
    ),
    excluidas: countWhere(
      reviewedSchedule,
      (mesa) => mesa.estado === DRAFT_SCHEDULE_STATUSES.EXCLUDED_BY_REVIEW,
    ),
    pendientesRevision: countWhere(
      reviewedSchedule,
      (mesa) => ![
        DRAFT_SCHEDULE_STATUSES.READY_FOR_TRIBUNAL,
        DRAFT_SCHEDULE_STATUSES.EXCLUDED_BY_REVIEW,
      ].includes(mesa.estado),
    ),
  }
}

function summarizeTribunals(generatedTribunals = []) {
  return {
    totalMesas: generatedTribunals.length,
    completos: countWhere(
      generatedTribunals,
      (mesa) => mesa.estado === GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_COMPLETE,
    ),
    minimos: countWhere(
      generatedTribunals,
      (mesa) => mesa.estado === GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_MINIMUM,
    ),
    incompletos: countWhere(
      generatedTribunals,
      (mesa) => mesa.estado === GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_INCOMPLETE,
    ),
    pendientesRevision: countWhere(
      generatedTribunals,
      (mesa) => mesa.estado === GENERATED_TRIBUNAL_STATUSES.NEEDS_INSTITUTIONAL_REVIEW,
    ),
  }
}

function summarizeFinal(finalTribunals = []) {
  return {
    confirmados: countWhere(
      finalTribunals,
      (mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_CONFIRMED,
    ),
    confirmadosMinimos: countWhere(
      finalTribunals,
      (mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_CONFIRMED_MINIMUM,
    ),
    bloqueados: countWhere(
      finalTribunals,
      (mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_BLOCKED_BY_VALIDATION,
    ),
    excluidos: countWhere(
      finalTribunals,
      (mesa) => mesa.estadoFinal === FINAL_TRIBUNAL_STATUSES.FINAL_EXCLUDED,
    ),
    pendientes: countWhere(
      finalTribunals,
      (mesa) => [
        FINAL_TRIBUNAL_STATUSES.FINAL_NEEDS_REVIEW,
        FINAL_TRIBUNAL_STATUSES.FINAL_INCOMPLETE,
      ].includes(mesa.estadoFinal),
    ),
  }
}

function collectDiagnostics(stage, result = {}) {
  return [
    ...asArray(result.errors).map((diagnostic) => ({ stage, type: 'error', ...diagnostic })),
    ...asArray(result.warnings).map((diagnostic) => ({ stage, type: 'warning', ...diagnostic })),
  ]
}

function collectFieldTestDiagnostics({
  draftResult,
  reviewedResult,
  tribunalResult,
  finalResult,
}) {
  return [
    ...collectDiagnostics('draft', draftResult),
    ...collectDiagnostics('reviewed', reviewedResult),
    ...collectDiagnostics('tribunals', tribunalResult),
    ...collectDiagnostics('final', finalResult),
  ]
}

export function runExamEngineV21FieldTest(input = {}) {
  const examCallConfig = resolveExamCallConfig(input)
  const sampleData = getExamEngineV21FieldTestSampleData()
  const docentes = Array.isArray(input.docentes)
    ? input.docentes
    : Array.isArray(input.teachers)
      ? input.teachers
      : sampleData.docentes
  const materias = Array.isArray(input.materias)
    ? input.materias
    : Array.isArray(input.subjects)
      ? input.subjects
      : sampleData.materias
  const teacherAssignments = asArray(input.teacherAssignments)
  const tribunalRules = input.tribunalRules ?? {}
  const generatedAt = clean(input.generatedAt)

  const draftResult = generateDraftExamSchedule({
    docentes,
    materias,
    examCallConfig,
  })
  const draftExport = exportDraftScheduleForTeachers(draftResult, { generatedAt })
  const reviewedRows = resolveRows(
    input.reviewedRows,
    buildDefaultReviewedRows,
    draftExport.rows,
    { draftResult, draftExport, examCallConfig },
  )

  const reviewedResult = importReviewedDraftSchedule({
    originalDraftSchedule: draftResult.draftSchedule,
    reviewedRows,
    docentes,
    examCallConfig,
  })
  const tribunalResult = generateTribunalsFromReviewedSchedule({
    reviewedSchedule: reviewedResult.reviewedSchedule,
    docentes,
    materias,
    teacherAssignments,
    examCallConfig,
    tribunalRules,
  })
  const tribunalReviewExport = exportGeneratedTribunalsForReview(tribunalResult, { generatedAt })
  const finalReviewedRows = resolveRows(
    input.finalReviewedRows ?? input.finalReviewRows,
    buildDefaultFinalReviewRows,
    tribunalReviewExport.rows,
    {
      draftResult,
      reviewedResult,
      tribunalResult,
      tribunalReviewExport,
      examCallConfig,
    },
  )

  const finalResult = importFinalTribunalReview({
    generatedTribunals: tribunalResult.generatedTribunals,
    reviewedRows: finalReviewedRows,
    docentes,
    materias,
    teacherAssignments,
    examCallConfig,
    tribunalRules,
  })
  const officialExport = exportFinalTribunalsOfficial(finalResult, { generatedAt })
  const finalAlertsExport = exportFinalTribunalAlerts(finalResult, { generatedAt })

  const outputs = {
    cronograma_preliminar_docentes: draftExport.rows,
    tribunales_para_revision_institucional: tribunalReviewExport.rows,
    cronograma_final_oficial: officialExport.rows,
    alertas_finales: finalAlertsExport.rows,
  }
  const summary = {
    draft: summarizeDraft(draftResult.draftSchedule),
    reviewed: summarizeReviewed(reviewedResult.reviewedSchedule),
    tribunals: summarizeTribunals(tribunalResult.generatedTribunals),
    final: summarizeFinal(finalResult.finalTribunals),
    alerts: finalAlertsExport.rows,
  }

  return {
    ...summary,
    summary,
    outputs,
    cronograma_preliminar_docentes: outputs.cronograma_preliminar_docentes,
    tribunales_para_revision_institucional: outputs.tribunales_para_revision_institucional,
    cronograma_final_oficial: outputs.cronograma_final_oficial,
    alertas_finales: outputs.alertas_finales,
    stages: {
      draftResult,
      draftExport,
      reviewedResult,
      tribunalResult,
      tribunalReviewExport,
      finalResult,
      officialExport,
      finalAlertsExport,
    },
    diagnostics: collectFieldTestDiagnostics({
      draftResult,
      reviewedResult,
      tribunalResult,
      finalResult,
    }),
    metadata: {
      stage: EXAM_ENGINE_V21_FIELD_TEST_STAGE,
      examCallConfig,
      tribunalRules,
      generatedAt,
      usedSampleDocentes: !Array.isArray(input.docentes) && !Array.isArray(input.teachers),
      usedSampleMaterias: !Array.isArray(input.materias) && !Array.isArray(input.subjects),
      fechasPrecronograma: draftResult.draftSchedule.map(getMesaFecha).filter(Boolean),
      mesasProcesadasParaTribunal: tribunalResult.generatedTribunals.map(getMesaId).filter(Boolean),
    },
  }
}
