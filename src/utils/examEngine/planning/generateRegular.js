import { createEngineResult } from '../contracts.js'
import { buildFeasibilityDiagnosis } from '../diagnostics/feasibility.js'
import { validateCronograma } from '../validation/validateCronograma.js'
import { validateTribunals } from '../validation/validateTribunals.js'
import { assignTitularesToCandidates } from './assignTitular.js'
import { assignVocalesToMesas } from './assignVocales.js'
import { buildExamTableCandidates } from './buildCandidates.js'
import { buildVocalCandidatesForMesas } from './buildVocalCandidates.js'
import { compactCompatibleMesas } from './compactMesas.js'
import { planDatesAndVocales } from './planDatesAndVocales.js'
import { planTentativeDates } from './planTentativeDates.js'
import { repairIncompleteTribunalVocals } from './repairIncompleteTribunalVocals.js'
import { repairIncompleteTribunals } from './repairTribunals.js'
import { buildPipelineReport } from '../validation/reports.js'

// Isolated regular-generation wrapper. It orchestrates the new engine only;
// it does not connect to UI, legacy generation, or final export yet.

const GENERATE_REGULAR_STAGE = 'GENERATE_REGULAR'

const STAGE_NAMES = {
  DIAGNOSIS: 'DIAGNOSIS',
  BUILD_CANDIDATES: 'BUILD_CANDIDATES',
  ASSIGN_TITULARES: 'ASSIGN_TITULARES',
  BUILD_VOCAL_CANDIDATES: 'BUILD_VOCAL_CANDIDATES',
  ASSIGN_VOCALES: 'ASSIGN_VOCALES',
  PLAN_DATES_AND_VOCALES: 'PLAN_DATES_AND_VOCALES',
  REPAIR_TRIBUNALS: 'REPAIR_TRIBUNALS',
  VALIDATE_TRIBUNALS: 'VALIDATE_TRIBUNALS',
  COMPACT_MESAS: 'COMPACT_MESAS',
  PLAN_TENTATIVE_DATES: 'PLAN_TENTATIVE_DATES',
  VALIDATE_CRONOGRAMA: 'VALIDATE_CRONOGRAMA',
}

const CURRENT_STAGE_ORDER = [
  STAGE_NAMES.DIAGNOSIS,
  STAGE_NAMES.BUILD_CANDIDATES,
  STAGE_NAMES.ASSIGN_TITULARES,
  STAGE_NAMES.BUILD_VOCAL_CANDIDATES,
  STAGE_NAMES.ASSIGN_VOCALES,
  STAGE_NAMES.REPAIR_TRIBUNALS,
  STAGE_NAMES.VALIDATE_TRIBUNALS,
  STAGE_NAMES.COMPACT_MESAS,
  STAGE_NAMES.PLAN_TENTATIVE_DATES,
  STAGE_NAMES.VALIDATE_CRONOGRAMA,
]

const DATE_AWARE_STAGE_ORDER = [
  STAGE_NAMES.DIAGNOSIS,
  STAGE_NAMES.BUILD_CANDIDATES,
  STAGE_NAMES.ASSIGN_TITULARES,
  STAGE_NAMES.BUILD_VOCAL_CANDIDATES,
  STAGE_NAMES.PLAN_DATES_AND_VOCALES,
  STAGE_NAMES.REPAIR_TRIBUNALS,
  STAGE_NAMES.VALIDATE_TRIBUNALS,
  STAGE_NAMES.COMPACT_MESAS,
  STAGE_NAMES.VALIDATE_CRONOGRAMA,
]

// Default to safe compaction while the new engine is isolated. This gives us
// controlled grouping without enabling the broadest compatibility rules yet.
const DEFAULT_COMPACT_MODE = 'safe'
const DEFAULT_VOCAL_PLANNING_MODE = 'current'

function normalizeCompactMode(value) {
  if (value === false || value === 'false') return false
  if (value === true || value === 'true' || value === 'full') return true
  if (value === 'safe') return 'safe'
  return DEFAULT_COMPACT_MODE
}

function normalizeVocalPlanningMode(value) {
  if (value === 'dateAware') return 'dateAware'
  if (value === 'current') return 'current'
  return DEFAULT_VOCAL_PLANNING_MODE
}

function cloneDiagnostic(item = {}, stage = '') {
  return {
    ...item,
    stage: item.stage ?? stage,
  }
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
  const uniqueItems = []

  items.forEach((item) => {
    const key = diagnosticKey(item)
    if (seen.has(key)) return
    seen.add(key)
    uniqueItems.push(item)
  })

  return uniqueItems
}

function collectStageDiagnostics(stage, stageResult, errors, warnings) {
  if (!stageResult || typeof stageResult !== 'object') return

  if (Array.isArray(stageResult.errors)) {
    errors.push(...stageResult.errors.map((error) => cloneDiagnostic(error, stage)))
  }

  if (Array.isArray(stageResult.warnings)) {
    warnings.push(...stageResult.warnings.map((warning) => cloneDiagnostic(warning, stage)))
  }
}

function createStageError(stage, error) {
  return {
    code: 'ENGINE_STAGE_ERROR',
    message: error instanceof Error ? error.message : 'La etapa del motor no pudo ejecutarse.',
    severity: 'critical',
    stage,
  }
}

function runStage(stage, fn, fallback, errors, completedStages) {
  try {
    const result = fn()
    completedStages.push(stage)
    return result ?? fallback
  } catch (error) {
    errors.push(createStageError(stage, error))
    return fallback
  }
}

function createEmptyPlanningResult({
  diagnosis = null,
  errors = [],
  warnings = [],
  metadata = {},
} = {}) {
  const finalErrors = dedupeDiagnostics(errors)
  const finalWarnings = dedupeDiagnostics(warnings)
  const compactMode = metadata.compactMode ?? DEFAULT_COMPACT_MODE
  const vocalPlanningMode = metadata.vocalPlanningMode ?? DEFAULT_VOCAL_PLANNING_MODE

  const result = {
    success: false,
    stage: GENERATE_REGULAR_STAGE,
    diagnosis,
    candidates: [],
    mesasPreliminares: [],
    mesasConVocales: [],
    mesasReparadas: [],
    mesasCompactadas: [],
    plannedMesas: [],
    unassignedMesas: [],
    errors: finalErrors,
    warnings: finalWarnings,
    summary: {
      totalDocentes: 0,
      totalMaterias: 0,
      totalCandidates: 0,
      totalMesasPreliminares: 0,
      totalMesasConVocales: 0,
      totalMesasReparadas: 0,
      totalMesasCompactadas: 0,
      totalPlannedMesas: 0,
      totalUnassignedMesas: 0,
      totalErrors: finalErrors.length,
      totalWarnings: finalWarnings.length,
      compactMode,
      totalCompactaciones: 0,
      totalMesasAntesCompactacion: 0,
      totalMesasDespuesCompactacion: 0,
      stageSummaries: {},
    },
    metadata: {
      stageOrder: CURRENT_STAGE_ORDER,
      completedStages: [],
      stopped: false,
      stoppedReason: '',
      forced: false,
      vocalPlanningMode,
      ...metadata,
    },
  }

  return {
    ...result,
    report: buildPipelineReport(result),
  }
}

function buildSummary({
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
  compactMode,
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
    compactMode,
    totalCompactaciones: compactResult.compactaciones.length,
    totalMesasAntesCompactacion: repairResult.mesasReparadas.length,
    totalMesasDespuesCompactacion: compactResult.mesasCompactadas.length,
    stageSummaries: {
      diagnosis: null,
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

export function generateRegularExamPlan(input = {}) {
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const materias = Array.isArray(input.materias) ? input.materias : []
  const correlatividades = Array.isArray(input.correlatividades) ? input.correlatividades : []
  const fechasDisponibles = Array.isArray(input.fechasDisponibles) ? input.fechasDisponibles : []
  const config = input.config ?? input.examPeriodConfig ?? {}
  const options = input.options ?? {}
  const force = options.force === true
  const compactMode = normalizeCompactMode(options.compact)
  const vocalPlanningMode = normalizeVocalPlanningMode(options.vocalPlanningMode)
  const stageOrder = vocalPlanningMode === 'dateAware' ? DATE_AWARE_STAGE_ORDER : CURRENT_STAGE_ORDER
  const completedStages = []
  const errors = []
  const warnings = []

  const diagnosis = runStage(
    STAGE_NAMES.DIAGNOSIS,
    () => buildFeasibilityDiagnosis({
      docentes,
      materias,
      mesas: Array.isArray(input.mesas) ? input.mesas : [],
      correlatividades,
      config,
    }),
    {
      canGenerate: false,
      errors: [],
      warnings: [],
      summary: {},
      teacherSummary: [],
      subjectSummary: [],
      riskRanking: [],
    },
    errors,
    completedStages,
  )
  collectStageDiagnostics(STAGE_NAMES.DIAGNOSIS, diagnosis, errors, warnings)

  if (diagnosis.canGenerate === false && !force) {
    return createEmptyPlanningResult({
      diagnosis,
      errors,
      warnings,
      metadata: {
        stageOrder,
        completedStages,
        stopped: true,
        stoppedReason: 'DIAGNOSIS_FAILED',
        forced: false,
        compactMode,
        vocalPlanningMode,
        cantidadLlamados: config.cantidadLlamados,
        tipoPeriodo: config.tipoPeriodo,
        compactacionEjecutada: false,
      },
    })
  }

  if (diagnosis.canGenerate === false && force) {
    warnings.push({
      code: 'GENERATION_FORCED_WITH_DIAGNOSTIC_ERRORS',
      message: 'La generacion regular continua forzada pese a errores de diagnostico.',
      severity: 'warning',
      stage: STAGE_NAMES.DIAGNOSIS,
    })
  }

  const candidatesResult = runStage(
    STAGE_NAMES.BUILD_CANDIDATES,
    () => buildExamTableCandidates({
      docentes,
      materias,
      correlatividades,
      config,
      diagnosis,
    }),
    { candidates: [], excluded: [], errors: [], warnings: [], summary: {} },
    errors,
    completedStages,
  )
  collectStageDiagnostics(STAGE_NAMES.BUILD_CANDIDATES, candidatesResult, errors, warnings)

  const titularResult = runStage(
    STAGE_NAMES.ASSIGN_TITULARES,
    () => assignTitularesToCandidates({
      candidates: candidatesResult.candidates,
      docentes,
      config,
    }),
    { mesasPreliminares: [], errors: [], warnings: [], summary: {} },
    errors,
    completedStages,
  )
  collectStageDiagnostics(STAGE_NAMES.ASSIGN_TITULARES, titularResult, errors, warnings)

  const vocalCandidateResult = runStage(
    STAGE_NAMES.BUILD_VOCAL_CANDIDATES,
    () => buildVocalCandidatesForMesas({
      mesasPreliminares: titularResult.mesasPreliminares,
      docentes,
      participacionesExistentes: [],
      config,
      requireCareerCompatibility: vocalPlanningMode === 'dateAware',
    }),
    { mesasConCandidatos: [], errors: [], warnings: [], summary: {} },
    errors,
    completedStages,
  )
  collectStageDiagnostics(STAGE_NAMES.BUILD_VOCAL_CANDIDATES, vocalCandidateResult, errors, warnings)

  let dateAwarePlanResult = null
  let vocalAssignmentResult

  if (vocalPlanningMode === 'dateAware') {
    dateAwarePlanResult = runStage(
      STAGE_NAMES.PLAN_DATES_AND_VOCALES,
      () => planDatesAndVocales({
        mesas: titularResult.mesasPreliminares,
        docentes,
        correlatividades,
        config,
        fechasDisponibles,
        mesasConCandidatos: vocalCandidateResult.mesasConCandidatos,
        participacionesExistentes: [],
        options,
      }),
      { plannedMesas: [], unassignedMesas: [], participaciones: [], errors: [], warnings: [], summary: {} },
      errors,
      completedStages,
    )
    collectStageDiagnostics(STAGE_NAMES.PLAN_DATES_AND_VOCALES, dateAwarePlanResult, errors, warnings)
    vocalAssignmentResult = {
      mesasConVocales: dateAwarePlanResult.plannedMesas,
      participaciones: dateAwarePlanResult.participaciones,
      errors: [],
      warnings: [],
      summary: dateAwarePlanResult.summary,
    }
  } else {
    vocalAssignmentResult = runStage(
      STAGE_NAMES.ASSIGN_VOCALES,
      () => assignVocalesToMesas({
        mesasPreliminares: titularResult.mesasPreliminares,
        docentes,
        participacionesExistentes: [],
        mesasConCandidatos: vocalCandidateResult.mesasConCandidatos,
        config,
        fechasDisponibles,
        options,
      }),
      { mesasConVocales: [], participaciones: [], errors: [], warnings: [], summary: {} },
      errors,
      completedStages,
    )
    collectStageDiagnostics(STAGE_NAMES.ASSIGN_VOCALES, vocalAssignmentResult, errors, warnings)
  }

  const repairResult = runStage(
    STAGE_NAMES.REPAIR_TRIBUNALS,
    () => {
      if (vocalPlanningMode === 'dateAware') {
        const result = repairIncompleteTribunalVocals({
          plannedItems: dateAwarePlanResult.plannedMesas,
          unplannedItems: dateAwarePlanResult.unassignedMesas,
          teachers: docentes,
          calendar: fechasDisponibles,
          teacherLoad: dateAwarePlanResult.participaciones,
          options,
        })

        return {
          mesasReparadas: result.plannedItems,
          unassignedMesas: result.unplannedItems,
          participaciones: result.participaciones,
          repairs: result.repairs,
          errors: result.errors,
          warnings: result.warnings,
          summary: result.summary,
          diagnostics: result.diagnostics,
        }
      }

      return repairIncompleteTribunals({
        mesas: vocalAssignmentResult.mesasConVocales,
        docentes,
        participaciones: vocalAssignmentResult.participaciones,
        config,
        options,
      })
    },
    { mesasReparadas: [], unassignedMesas: [], participaciones: [], repairs: [], errors: [], warnings: [], summary: {} },
    errors,
    completedStages,
  )
  collectStageDiagnostics(STAGE_NAMES.REPAIR_TRIBUNALS, repairResult, errors, warnings)

  const tribunalValidation = runStage(
    STAGE_NAMES.VALIDATE_TRIBUNALS,
    () => validateTribunals({
      mesas: repairResult.mesasReparadas,
      docentes,
      participaciones: repairResult.participaciones,
      config,
      options,
    }),
    { valid: false, errors: [], warnings: [], summary: {}, tribunalSummary: [], participaciones: [] },
    errors,
    completedStages,
  )
  collectStageDiagnostics(STAGE_NAMES.VALIDATE_TRIBUNALS, tribunalValidation, errors, warnings)

  const compactacionEjecutada = compactMode !== false
  const compactResult = compactacionEjecutada
    ? runStage(
        STAGE_NAMES.COMPACT_MESAS,
        () => compactCompatibleMesas({
          mesas: repairResult.mesasReparadas,
          docentes,
          correlatividades,
          config,
          options: {
            ...options,
            compact: compactMode,
            compactMode,
            requireSameDateAndTurno: vocalPlanningMode === 'dateAware',
          },
        }),
        { mesasCompactadas: repairResult.mesasReparadas, compactaciones: [], skipped: [], errors: [], warnings: [], summary: {} },
        errors,
        completedStages,
      )
    : {
        mesasCompactadas: repairResult.mesasReparadas.map((mesa) => ({
          ...mesa,
          warnings: Array.isArray(mesa.warnings) ? [...mesa.warnings] : [],
          errors: Array.isArray(mesa.errors) ? [...mesa.errors] : [],
          metadata: {
            ...(mesa.metadata ?? {}),
          },
        })),
        compactaciones: [],
        skipped: [],
        errors: [],
        warnings: [],
        summary: {
          totalMesasIniciales: repairResult.mesasReparadas.length,
          totalMesasFinales: repairResult.mesasReparadas.length,
          totalCompactaciones: 0,
          totalSkipped: 0,
          compactMode,
          materiasNoAgrupablesRespetadas: 0,
          compactacionesConTribunalCruzado: 0,
          erroresCriticos: 0,
          advertencias: 0,
        },
        metadata: {
          compactMode,
          compactacionOmitida: true,
        },
      }

  if (compactacionEjecutada) {
    collectStageDiagnostics(STAGE_NAMES.COMPACT_MESAS, compactResult, errors, warnings)
  }

  const planResult = vocalPlanningMode === 'dateAware'
    ? {
        ...dateAwarePlanResult,
        plannedMesas: compactResult.mesasCompactadas,
        unassignedMesas: repairResult.unassignedMesas,
      }
    : runStage(
        STAGE_NAMES.PLAN_TENTATIVE_DATES,
        () => planTentativeDates({
          mesas: compactResult.mesasCompactadas,
          docentes,
          correlatividades,
          config,
          fechasDisponibles,
          options,
        }),
        { plannedMesas: [], unassignedMesas: [], errors: [], warnings: [], summary: {} },
        errors,
        completedStages,
      )
  if (vocalPlanningMode === 'current') {
    collectStageDiagnostics(STAGE_NAMES.PLAN_TENTATIVE_DATES, planResult, errors, warnings)
  }

  const cronogramaValidation = runStage(
    STAGE_NAMES.VALIDATE_CRONOGRAMA,
    () => validateCronograma({
      correlatividades,
      cronograma: planResult.plannedMesas,
      docentes,
      examPeriodConfig: config,
      materias: [],
    }),
    { valid: false, errors: [], warnings: [], normalizedCronograma: [] },
    errors,
    completedStages,
  )
  collectStageDiagnostics(STAGE_NAMES.VALIDATE_CRONOGRAMA, cronogramaValidation, errors, warnings)

  const finalErrors = dedupeDiagnostics(errors)
  const finalWarnings = dedupeDiagnostics(warnings)
  const success = finalErrors.length === 0 && planResult.unassignedMesas.length === 0

  const result = {
    success,
    stage: GENERATE_REGULAR_STAGE,
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
    summary: buildSummary({
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
      errors: finalErrors,
      warnings: finalWarnings,
      compactMode,
    }),
    metadata: {
      stageOrder,
      completedStages,
      stopped: false,
      stoppedReason: '',
      forced: force,
      compactMode,
      vocalPlanningMode,
      cantidadLlamados: config.cantidadLlamados,
      tipoPeriodo: config.tipoPeriodo,
      compactacionEjecutada,
      candidateExclusions: candidatesResult.excluded,
      vocalCandidateSummary: vocalCandidateResult.mesasConCandidatos,
      repairs: repairResult.repairs,
      compactaciones: compactResult.compactaciones,
      skippedCompactaciones: compactResult.skipped,
      tribunalValidation,
      cronogramaValidation,
      ...(vocalPlanningMode === 'dateAware'
        ? {
            dateAwareCompatibility: {
              mesasConVocales: 'plannedMesasBeforeRepair',
              mesasReparadas: 'repairOutputPreservingAssignedDates',
              finalMesas: 'compactResultAfterRepair',
              repairStrategy: 'repairIncompleteTribunalVocals',
            },
          }
        : {}),
    },
  }

  return {
    ...result,
    report: buildPipelineReport(result),
  }
}

export function generateRegularExams(input = {}) {
  const plan = generateRegularExamPlan(input)

  return createEngineResult({
    cronograma: plan.plannedMesas,
    diagnostics: plan.diagnosis,
    report: {
      diagnostics: plan.diagnosis ? [plan.diagnosis] : [],
      errors: plan.errors,
      warnings: plan.warnings,
      metrics: {
        generated: plan.plannedMesas.length,
        errors: plan.errors.length,
        warnings: plan.warnings.length,
      },
      plan,
    },
  })
}
