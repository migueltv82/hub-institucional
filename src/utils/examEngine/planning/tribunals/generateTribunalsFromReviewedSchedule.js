import { compareIsoDates } from '../../normalize/dates.js'
import { resolveDraftExamCallConfig } from '../draftSchedule/generateDraftExamSchedule.js'
import {
  assignVocalesForReviewedMesa,
  GENERATED_TRIBUNAL_STATUSES,
} from './assignVocalesForReviewedMesa.js'
import { buildTribunalDocenteMap } from './buildTribunalCandidatePool.js'
import { validateGeneratedTribunals } from '../../validation/validateGeneratedTribunals.js'

export const DEFAULT_TRIBUNAL_RULES = {
  idealVocales: 2,
  minimoVocales: 1,
  maxParticipacionesDocentePorDia: 2,
  aplicarMitadMasUno: true,
  mitadMasUnoSoloVocalias: true,
  permitirTribunalMinimo: true,
}

function clean(value) {
  return String(value ?? '').trim()
}

export function normalizeTribunalRules(rules = {}) {
  return {
    ...DEFAULT_TRIBUNAL_RULES,
    ...rules,
    idealVocales: Number(rules.idealVocales ?? DEFAULT_TRIBUNAL_RULES.idealVocales) || DEFAULT_TRIBUNAL_RULES.idealVocales,
    minimoVocales: Number(rules.minimoVocales ?? DEFAULT_TRIBUNAL_RULES.minimoVocales) || DEFAULT_TRIBUNAL_RULES.minimoVocales,
    maxParticipacionesDocentePorDia: Number(
      rules.maxParticipacionesDocentePorDia ?? DEFAULT_TRIBUNAL_RULES.maxParticipacionesDocentePorDia,
    ) || DEFAULT_TRIBUNAL_RULES.maxParticipacionesDocentePorDia,
  }
}

export function mesaIsReady(mesa = {}) {
  return mesa.estado === 'READY_FOR_TRIBUNAL'
}

export function createSkippedMesa(mesa = {}) {
  const excluded = mesa.estado === 'EXCLUDED_BY_REVIEW'

  return {
    draftMesaId: clean(mesa.draftMesaId ?? mesa.id),
    estado: mesa.estado,
    reason: excluded ? 'MESA_EXCLUDED_SKIPPED' : 'MESA_NOT_READY_FOR_TRIBUNAL',
    alertas: [{
      code: excluded ? 'MESA_EXCLUDED_SKIPPED' : 'MESA_NOT_READY_FOR_TRIBUNAL',
      message: excluded
        ? 'La mesa excluida por revision no se procesa para tribunal.'
        : 'La mesa no esta lista para generar tribunal.',
      severity: 'info',
    }],
  }
}

export function sortReadyMesas(left = {}, right = {}) {
  return (
    compareIsoDates(left.fechaSugerida ?? left.fecha, right.fechaSugerida ?? right.fecha) ||
    clean(left.carrera).localeCompare(clean(right.carrera)) ||
    Number(left.anio ?? 0) - Number(right.anio ?? 0) ||
    clean(left.materiaMesa ?? left.materia).localeCompare(clean(right.materiaMesa ?? right.materia)) ||
    clean(left.draftMesaId ?? left.id).localeCompare(clean(right.draftMesaId ?? right.id))
  )
}

export function summarizeGeneratedTribunals(generatedTribunals = [], skippedMesas = [], validation = {}) {
  return {
    totalReviewedMesas: generatedTribunals.length + skippedMesas.length,
    totalProcessed: generatedTribunals.length,
    totalSkipped: skippedMesas.length,
    totalComplete: generatedTribunals.filter((mesa) => mesa.estado === GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_COMPLETE).length,
    totalMinimum: generatedTribunals.filter((mesa) => mesa.estado === GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_MINIMUM).length,
    totalIncomplete: generatedTribunals.filter((mesa) => mesa.estado === GENERATED_TRIBUNAL_STATUSES.TRIBUNAL_INCOMPLETE).length,
    totalNeedsReview: generatedTribunals.filter((mesa) => mesa.estado === GENERATED_TRIBUNAL_STATUSES.NEEDS_INSTITUTIONAL_REVIEW).length,
    totalWarnings: validation.warnings.length,
    totalErrors: validation.errors.length,
  }
}

export function generateTribunalsFromReviewedSchedule(input = {}) {
  const reviewedSchedule = Array.isArray(input.reviewedSchedule)
    ? input.reviewedSchedule
    : Array.isArray(input.cronogramaRevisado)
      ? input.cronogramaRevisado
      : []
  const docentes = Array.isArray(input.docentes) ? input.docentes : []
  const teacherAssignments = Array.isArray(input.teacherAssignments) ? input.teacherAssignments : []
  const config = resolveDraftExamCallConfig(input)
  const tribunalRules = normalizeTribunalRules(input.tribunalRules ?? {})
  const docenteMap = buildTribunalDocenteMap(docentes)
  const participaciones = [...teacherAssignments]
  const readyMesas = reviewedSchedule.filter(mesaIsReady).sort(sortReadyMesas)
  const skippedMesas = reviewedSchedule.filter((mesa) => !mesaIsReady(mesa)).map(createSkippedMesa)
  const generatedTribunals = []
  const candidatePools = []

  readyMesas.forEach((mesa) => {
    const result = assignVocalesForReviewedMesa({
      mesa,
      docentes,
      docenteMap,
      participaciones,
      tribunalRules,
    })

    generatedTribunals.push(result.mesa)
    participaciones.push(...result.participaciones)
    candidatePools.push(result.candidatePool)
  })

  const validation = validateGeneratedTribunals({
    generatedTribunals,
    reviewedSchedule,
    skippedMesas,
    docentes,
    participaciones,
    examCallConfig: config,
    tribunalRules,
  })

  return {
    success: validation.errors.length === 0,
    stage: 'GENERATE_TRIBUNALS_FROM_REVIEWED_SCHEDULE',
    generatedTribunals,
    tribunales: generatedTribunals,
    skippedMesas,
    participaciones,
    validation,
    errors: validation.errors,
    warnings: validation.warnings,
    summary: summarizeGeneratedTribunals(generatedTribunals, skippedMesas, validation),
    metadata: {
      config,
      tribunalRules,
      candidatePools,
      source: 'REVIEWED_SCHEDULE',
      halfPlusOneAppliedToVocaliasOnly: tribunalRules.aplicarMitadMasUno && tribunalRules.mitadMasUnoSoloVocalias,
    },
  }
}
