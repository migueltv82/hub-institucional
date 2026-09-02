import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildRegularPreviewInstitutionalFixture } from '../utils/examEngine/__fixtures__/regularPreviewInstitutionalFixture.js'
import { useRegularExamPreviewEngine } from './useRegularExamPreviewEngine.js'

function buildInput(overrides = {}) {
  return buildRegularPreviewInstitutionalFixture(overrides)
}

function blockedExpectation(result) {
  expect(result).toEqual({
    ok: false,
    reason: 'ACTION_BLOCKED_PREVIEW_ONLY',
  })
}

describe('useRegularExamPreviewEngine', () => {
  it('inicializa en idle', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())

    expect(result.current).toMatchObject({
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
    })
    expect(result.current.actions).toEqual({
      generatePreview: expect.any(Function),
      loadPreviewResult: expect.any(Function),
      applyFilters: expect.any(Function),
      clearFilters: expect.any(Function),
      changeCompactMode: expect.any(Function),
      exportJson: expect.any(Function),
      resetPreview: expect.any(Function),
      saveOfficialSchedule: expect.any(Function),
      publishSchedule: expect.any(Function),
      replaceLegacyEngine: expect.any(Function),
    })
  })

  it('generatePreview genera contrato valido', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())
    const input = buildInput()

    act(() => {
      result.current.actions.generatePreview(input)
    })

    expect(result.current.phase).toMatch(/^(success|warning|critical)$/)
    expect(result.current.status).toEqual(expect.any(String))
    expect(result.current.preview).toEqual(expect.any(Object))
    expect(result.current.uiDto).toEqual(expect.any(Object))
    expect(result.current.validation).toMatchObject({ valid: true })
    expect(result.current.filters).toEqual(expect.any(Object))
    expect(result.current.filteredDto).toEqual(expect.any(Object))
  })

  it('loadPreviewResult carga contrato ya generado sin recalcular en el hook', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())
    const input = buildInput()
    let contract

    act(() => {
      contract = result.current.actions.generatePreview(input)
    })
    act(() => {
      result.current.actions.resetPreview()
    })
    act(() => {
      result.current.actions.loadPreviewResult(contract, input, {})
    })

    expect(result.current.phase).toMatch(/^(success|warning|critical)$/)
    expect(result.current.uiDto).toEqual(expect.any(Object))
    expect(result.current.metadata.issueSummary).toEqual(expect.any(Object))
  })

  it('applyFilters actualiza filtersState y filteredDto', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())
    const input = buildInput()
    const filtersState = { llamados: ['PRIMER_LLAMADO'] }

    act(() => {
      result.current.actions.generatePreview(input)
    })
    act(() => {
      result.current.actions.applyFilters(filtersState)
    })

    expect(result.current.filtersState).toEqual(filtersState)
    expect(result.current.filteredDto.filteredSummary.totalVisible).toBe(
      result.current.filteredDto.uiTables.planned.length + result.current.filteredDto.uiTables.unassigned.length,
    )
    ;[...result.current.filteredDto.uiTables.planned, ...result.current.filteredDto.uiTables.unassigned].forEach((row) => {
      expect(row.llamado).toBe('PRIMER_LLAMADO')
    })
  })

  it('clearFilters limpia filtros', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())

    act(() => {
      result.current.actions.generatePreview(buildInput())
    })
    act(() => {
      result.current.actions.applyFilters({ llamados: ['PRIMER_LLAMADO'] })
    })
    act(() => {
      result.current.actions.clearFilters()
    })

    expect(result.current.filtersState).toEqual({})
  })

  it('changeCompactMode false safe true regenera sin mutar input anterior', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())
    const input = buildInput()
    const snapshot = structuredClone(input)

    act(() => {
      result.current.actions.generatePreview(input)
    })

    ;[false, 'safe', true].forEach((mode) => {
      act(() => {
        result.current.actions.changeCompactMode(mode)
      })
      expect(result.current.input.options.compactMode).toBe(mode)
      expect(result.current.phase).toMatch(/^(success|warning|critical)$/)
    })

    expect(input).toEqual(snapshot)
  })

  it('exportJson funciona si canExportJson true', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())

    act(() => {
      result.current.actions.generatePreview(buildInput())
    })

    expect(result.current.canExportJson).toBe(true)
    expect(result.current.actions.exportJson()).toEqual({
      ok: true,
      report: result.current.uiDto.audit.exportedReport,
    })
  })

  it('exportJson falla controlado si canExportJson false', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())

    expect(result.current.actions.exportJson()).toEqual({
      ok: false,
      reason: 'EXPORT_JSON_NOT_AVAILABLE',
    })
  })

  it('resetPreview vuelve a idle', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())

    act(() => {
      result.current.actions.generatePreview(buildInput())
    })
    act(() => {
      result.current.actions.resetPreview()
    })

    expect(result.current).toMatchObject({
      phase: 'idle',
      status: 'IDLE',
      input: null,
      uiDto: null,
      filters: null,
      filtersState: {},
      filteredDto: null,
      errors: [],
      warnings: [],
    })
  })

  it('acciones bloqueadas devuelven ACTION_BLOCKED_PREVIEW_ONLY', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())

    blockedExpectation(result.current.actions.saveOfficialSchedule())
    blockedExpectation(result.current.actions.publishSchedule())
    blockedExpectation(result.current.actions.replaceLegacyEngine())
  })

  it('no muta input', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())
    const input = buildInput()
    const snapshot = structuredClone(input)

    act(() => {
      result.current.actions.generatePreview(input)
    })
    act(() => {
      result.current.actions.changeCompactMode('safe')
    })

    expect(input).toEqual(snapshot)
  })

  it('no muta filtersState', () => {
    const { result } = renderHook(() => useRegularExamPreviewEngine())
    const filtersState = { carreras: ['Profesorado de Ingles'], search: 'ingles' }
    const snapshot = structuredClone(filtersState)

    act(() => {
      result.current.actions.generatePreview(buildInput())
    })
    act(() => {
      result.current.actions.applyFilters(filtersState)
    })

    expect(filtersState).toEqual(snapshot)
  })

  it('no importa motor viejo ni useCronogramaGeneration', () => {
    const source = readFileSync(join(process.cwd(), 'src/hooks/useRegularExamPreviewEngine.js'), 'utf8')
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const legacy = ['legacy', 'Adapter'].join('')
    const uiComponents = ['compo', 'nents'].join('')

    expect(source).not.toContain('generateRegularExamPlan')
    expect(source).not.toContain('buildRegularExamEnginePreview')
    expect(source).not.toContain('buildRegularExamPreviewUiDto')
    expect(source).not.toContain('validateRegularExamPreviewUiDto')
    expect(source).not.toContain('buildRegularExamPreviewUiFilters')
    expect(source).not.toContain('applyRegularExamPreviewUiFilters')
    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(legacy)
    expect(source).not.toContain(uiComponents)
  })
})

