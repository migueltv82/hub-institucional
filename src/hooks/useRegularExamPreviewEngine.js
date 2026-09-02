import { useCallback, useMemo, useState } from 'react'
import { buildRegularExamPreviewIntegrationContract } from '../utils/examEngine/preview'

const INITIAL_STATE = {
  phase: 'idle',
  status: 'IDLE',
  input: null,
  preview: null,
  uiDto: null,
  validation: null,
  filters: null,
  filtersState: {},
  filteredDto: null,
  canExportJson: false,
  canPublishOfficial: false,
  canSaveOfficialSchedule: false,
  errors: [],
  warnings: [],
  metadata: null,
}

const BLOCKED_ACTION = {
  ok: false,
  reason: 'ACTION_BLOCKED_PREVIEW_ONLY',
}
const MAX_VISIBLE_ISSUES = 20

function cloneValue(value) {
  if (value === undefined) return undefined
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function clean(value) {
  return String(value ?? '').trim()
}

function issueCode(issue = {}) {
  return clean(issue.code ?? issue.reason ?? issue.message) || 'SIN_CODIGO'
}

function buildIssueSummary(errors = [], warnings = []) {
  const allIssues = [
    ...asArray(errors).map((issue) => ({ ...issue, severity: issue.severity ?? 'error' })),
    ...asArray(warnings).map((issue) => ({ ...issue, severity: issue.severity ?? 'warning' })),
  ]
  const byCode = allIssues.reduce((counts, issue) => {
    const code = issueCode(issue)
    counts[code] = (counts[code] ?? 0) + 1
    return counts
  }, {})

  return {
    totalErrors: asArray(errors).length,
    totalWarnings: asArray(warnings).length,
    visibleErrors: Math.min(asArray(errors).length, MAX_VISIBLE_ISSUES),
    visibleWarnings: Math.min(asArray(warnings).length, MAX_VISIBLE_ISSUES),
    topByCode: Object.entries(byCode)
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
      .slice(0, MAX_VISIBLE_ISSUES),
  }
}

function stateFromContract(contract, input, filtersState) {
  const errors = asArray(contract.errors)
  const warnings = asArray(contract.warnings)
  const issueSummary = contract.metadata?.issueSummary ?? buildIssueSummary(errors, warnings)

  return {
    phase: contract.phase,
    status: contract.status,
    input: cloneValue(input),
    preview: contract.preview,
    uiDto: contract.uiDto,
    validation: contract.validation,
    filters: contract.filters,
    filtersState: cloneValue(filtersState),
    filteredDto: contract.filteredDto,
    canExportJson: Boolean(contract.canExportJson),
    canPublishOfficial: false,
    canSaveOfficialSchedule: false,
    errors: errors.slice(0, MAX_VISIBLE_ISSUES),
    warnings: warnings.slice(0, MAX_VISIBLE_ISSUES),
    metadata: {
      ...(contract.metadata ?? {}),
      issueSummary,
      issueDisplayLimit: MAX_VISIBLE_ISSUES,
    },
  }
}

function withCompactMode(input = {}, mode) {
  const clonedInput = cloneValue(input) ?? {}
  return {
    ...clonedInput,
    options: {
      ...(clonedInput.options ?? {}),
      compactMode: mode,
    },
  }
}

export function useRegularExamPreviewEngine() {
  const [state, setState] = useState(INITIAL_STATE)

  const generatePreview = useCallback((nextInput) => {
    const inputSnapshot = cloneValue(nextInput)
    const filtersSnapshot = cloneValue(state.filtersState) ?? {}

    setState((current) => ({
      ...current,
      phase: 'loading',
      status: 'LOADING',
      input: inputSnapshot,
      errors: [],
      warnings: [],
    }))

    const contract = buildRegularExamPreviewIntegrationContract(inputSnapshot, filtersSnapshot)
    const nextState = stateFromContract(contract, inputSnapshot, filtersSnapshot)
    setState(nextState)
    return contract
  }, [state.filtersState])

  const loadPreviewResult = useCallback((contract, nextInput, nextFiltersState = {}) => {
    const inputSnapshot = cloneValue(nextInput)
    const filtersSnapshot = cloneValue(nextFiltersState) ?? {}
    const nextState = stateFromContract(contract ?? {}, inputSnapshot, filtersSnapshot)
    setState(nextState)
    return nextState
  }, [])

  const applyFilters = useCallback((nextFiltersState = {}) => {
    if (!state.input) return null

    const filtersSnapshot = cloneValue(nextFiltersState) ?? {}
    const contract = buildRegularExamPreviewIntegrationContract(state.input, filtersSnapshot)
    const nextState = stateFromContract(contract, state.input, filtersSnapshot)
    setState(nextState)
    return contract
  }, [state.input])

  const clearFilters = useCallback(() => applyFilters({}), [applyFilters])

  const changeCompactMode = useCallback((mode) => {
    if (![false, 'safe', true].includes(mode) || !state.input) return null

    const nextInput = withCompactMode(state.input, mode)
    const filtersSnapshot = cloneValue(state.filtersState) ?? {}
    const contract = buildRegularExamPreviewIntegrationContract(nextInput, filtersSnapshot)
    const nextState = stateFromContract(contract, nextInput, filtersSnapshot)
    setState(nextState)
    return contract
  }, [state.filtersState, state.input])

  const exportJson = useCallback(() => {
    if (!state.canExportJson) {
      return {
        ok: false,
        reason: 'EXPORT_JSON_NOT_AVAILABLE',
      }
    }

    return {
      ok: true,
      report: cloneValue(state.uiDto?.audit?.exportedReport),
    }
  }, [state.canExportJson, state.uiDto])

  const resetPreview = useCallback(() => {
    setState(INITIAL_STATE)
  }, [])

  const blockedAction = useCallback(() => BLOCKED_ACTION, [])

  const actions = useMemo(() => ({
    generatePreview,
    loadPreviewResult,
    applyFilters,
    clearFilters,
    changeCompactMode,
    exportJson,
    resetPreview,
    saveOfficialSchedule: blockedAction,
    publishSchedule: blockedAction,
    replaceLegacyEngine: blockedAction,
  }), [
    applyFilters,
    blockedAction,
    changeCompactMode,
    clearFilters,
    exportJson,
    generatePreview,
    loadPreviewResult,
    resetPreview,
  ])

  return {
    ...state,
    actions,
  }
}

