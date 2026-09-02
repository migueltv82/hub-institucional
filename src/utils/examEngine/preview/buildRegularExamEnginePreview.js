import { generateRegularExamPlan } from '../planning/generateRegular.js'
import {
  exportPipelineReportToJson,
  validatePipelineReportExport,
} from '../validation/exportReport.js'

// Safe DTO boundary for a future UI integration. It does not connect the engine.

function cloneJson(value) {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneJson).filter((entry) => entry !== undefined)

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, cloneJson(entry)])
      .filter(([, entry]) => entry !== undefined),
  )
}

export function buildRegularExamEnginePreview(input = {}) {
  const plan = generateRegularExamPlan(input)
  const exportedReport = exportPipelineReportToJson(plan.report, { includeRaw: false })
  const exportValidation = validatePipelineReportExport(exportedReport)

  return {
    success: Boolean(plan.success),
    status: plan.report?.status ?? (plan.success ? 'OK' : 'CRITICAL'),
    plannedMesas: cloneJson(plan.plannedMesas ?? []),
    unassignedMesas: cloneJson(plan.unassignedMesas ?? []),
    summary: cloneJson(plan.summary ?? {}),
    report: cloneJson(plan.report ?? {}),
    exportedReport,
    exportValidation,
    errors: cloneJson(plan.errors ?? []),
    warnings: cloneJson(plan.warnings ?? []),
    metadata: cloneJson({
      stage: plan.stage,
      stageOrder: plan.metadata?.stageOrder,
      completedStages: plan.metadata?.completedStages,
      stopped: plan.metadata?.stopped,
      stoppedReason: plan.metadata?.stoppedReason,
      forced: plan.metadata?.forced,
      vocalPlanningMode: plan.metadata?.vocalPlanningMode,
      compactMode: plan.metadata?.compactMode,
      compactacionEjecutada: plan.metadata?.compactacionEjecutada,
      cantidadLlamados: plan.metadata?.cantidadLlamados,
      tipoPeriodo: plan.metadata?.tipoPeriodo,
    }),
  }
}
