import { buildRegularExamEnginePreview } from './buildRegularExamEnginePreview.js'
import { buildRegularExamPreviewUiDto } from './buildRegularExamPreviewUiDto.js'
import { validateRegularExamPreviewUiDto } from './validateRegularExamPreviewUiDto.js'
import { buildRegularExamPreviewUiFilters } from './buildRegularExamPreviewUiFilters.js'
import { applyRegularExamPreviewUiFilters } from './applyRegularExamPreviewUiFilters.js'
import { asArray, clean, cloneJson } from './uiDtoShared.js'

function cloneWithoutRaw(value) {
  return cloneJson(value)
}

function getPhase(uiDto = {}, validation = { valid: false }) {
  if (!validation.valid) return 'error'
  if (uiDto.status === 'CRITICAL') return 'critical'
  if (uiDto.status === 'WARNING') return 'warning'
  if (uiDto.status === 'OK') return 'success'
  return 'error'
}

function technicalError(error) {
  return {
    code: 'PREVIEW_INTEGRATION_ERROR',
    message: error instanceof Error ? error.message : 'No se pudo construir el contrato de preview.',
    severity: 'error',
    stage: 'PREVIEW_INTEGRATION_CONTRACT',
  }
}

function performanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function measureStep(timings, key, callback) {
  const startedAt = performanceNow()
  const result = callback()
  timings[key] = roundMs(performanceNow() - startedAt)
  return result
}

export function buildRegularExamPreviewIntegrationContract(input = {}, filtersState = {}) {
  const contractStartedAt = performanceNow()
  const timings = {}

  try {
    const preview = measureStep(timings, 'enginePreviewMs', () => buildRegularExamEnginePreview(input))
    const uiDto = measureStep(timings, 'buildDtoMs', () => buildRegularExamPreviewUiDto(preview))
    const validation = measureStep(timings, 'validateDtoMs', () => validateRegularExamPreviewUiDto(uiDto))
    const filters = measureStep(timings, 'buildFiltersMs', () => buildRegularExamPreviewUiFilters(uiDto))
    const filteredDto = measureStep(timings, 'applyFiltersMs', () => applyRegularExamPreviewUiFilters(uiDto, filtersState))
    const phase = measureStep(timings, 'phaseMs', () => getPhase(uiDto, validation))
    const canExportJson = measureStep(timings, 'exportGateMs', () => Boolean(validation.valid && uiDto.audit?.exportValidation?.valid))
    const cloneStartedAt = performanceNow()
    const contract = {
      phase,
      status: clean(uiDto.status) || 'UNKNOWN',
      preview: cloneWithoutRaw(preview),
      uiDto: cloneWithoutRaw(uiDto),
      validation: cloneWithoutRaw(validation),
      filters: cloneWithoutRaw(filters),
      filtersState: cloneWithoutRaw(filtersState),
      filteredDto: cloneWithoutRaw(filteredDto),
      canExportJson,
      canPublishOfficial: false,
      canSaveOfficialSchedule: false,
      errors: [
        ...asArray(preview.errors),
        ...asArray(validation.errors),
      ].map(cloneWithoutRaw),
      warnings: [
        ...asArray(preview.warnings),
        ...asArray(validation.warnings),
      ].map(cloneWithoutRaw),
      metadata: cloneWithoutRaw({
        preview: preview.metadata,
        uiSummary: uiDto.uiSummary,
        filteredSummary: filteredDto.filteredSummary,
        timings,
      }),
    }

    timings.cloneContractMs = roundMs(performanceNow() - cloneStartedAt)
    timings.totalContractMs = roundMs(performanceNow() - contractStartedAt)
    contract.metadata = {
      ...(contract.metadata ?? {}),
      timings: cloneWithoutRaw(timings),
    }
    return contract
  } catch (error) {
    const normalizedError = technicalError(error)
    timings.totalContractMs = roundMs(performanceNow() - contractStartedAt)

    return {
      phase: 'error',
      status: 'ERROR',
      preview: null,
      uiDto: null,
      validation: {
        valid: false,
        errors: [normalizedError],
        warnings: [],
      },
      filters: buildRegularExamPreviewUiFilters({}),
      filtersState: cloneWithoutRaw(filtersState),
      filteredDto: applyRegularExamPreviewUiFilters({}, {}),
      canExportJson: false,
      canPublishOfficial: false,
      canSaveOfficialSchedule: false,
      errors: [normalizedError],
      warnings: [],
      metadata: cloneWithoutRaw({
        errorStage: 'PREVIEW_INTEGRATION_CONTRACT',
        timings,
      }),
    }
  }
}

