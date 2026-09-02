import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildRegularPreviewInstitutionalFixture } from '../__fixtures__/regularPreviewInstitutionalFixture.js'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'

function validInput(overrides = {}) {
  return buildRegularPreviewInstitutionalFixture(overrides)
}

function hasRaw(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)

  if (Object.prototype.hasOwnProperty.call(value, 'raw')) return true
  if (Array.isArray(value)) return value.some((entry) => hasRaw(entry, seen))
  return Object.values(value).some((entry) => hasRaw(entry, seen))
}

describe('examEngine preview: buildRegularExamPreviewIntegrationContract', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doUnmock('../preview/validateRegularExamPreviewUiDto.js')
  })

  it('devuelve contrato completo con fixture institucional', () => {
    const contract = buildRegularExamPreviewIntegrationContract(validInput())

    expect(Object.keys(contract).sort()).toEqual([
      'canExportJson',
      'canPublishOfficial',
      'canSaveOfficialSchedule',
      'errors',
      'filteredDto',
      'filters',
      'filtersState',
      'metadata',
      'phase',
      'preview',
      'status',
      'uiDto',
      'validation',
      'warnings',
    ].sort())
    expect(contract).toMatchObject({
      phase: expect.stringMatching(/^(success|warning|critical|error)$/),
      status: expect.any(String),
      preview: expect.any(Object),
      uiDto: expect.any(Object),
      validation: expect.any(Object),
      filters: expect.any(Object),
      filtersState: expect.any(Object),
      filteredDto: expect.any(Object),
      canExportJson: expect.any(Boolean),
      canPublishOfficial: false,
      canSaveOfficialSchedule: false,
      errors: expect.any(Array),
      warnings: expect.any(Array),
      metadata: expect.any(Object),
    })
  })

  it('phase success/warning/critical segun status', () => {
    expect(buildRegularExamPreviewIntegrationContract(validInput()).phase).toMatch(/^(success|warning|critical)$/)
  })

  it('validation valida habilita canExportJson', () => {
    const contract = buildRegularExamPreviewIntegrationContract(validInput())

    expect(contract.validation.valid).toBe(true)
    expect(contract.uiDto.audit.exportValidation.valid).toBe(true)
    expect(contract.canExportJson).toBe(true)
  })

  it('canPublishOfficial y canSaveOfficialSchedule siempre false', () => {
    const contract = buildRegularExamPreviewIntegrationContract(validInput())

    expect(contract.canPublishOfficial).toBe(false)
    expect(contract.canSaveOfficialSchedule).toBe(false)
  })

  it('aplica filtersState', () => {
    const filtersState = { llamados: ['PRIMER_LLAMADO'] }
    const contract = buildRegularExamPreviewIntegrationContract(validInput(), filtersState)
    const llamados = new Set([
      ...contract.filteredDto.uiTables.planned,
      ...contract.filteredDto.uiTables.unassigned,
    ].map((row) => row.llamado).filter(Boolean))

    expect(llamados).toEqual(new Set(['PRIMER_LLAMADO']))
    expect(contract.filtersState).toEqual(filtersState)
    expect(contract.filteredDto.filteredSummary.totalVisible).toBe(
      contract.filteredDto.uiTables.planned.length + contract.filteredDto.uiTables.unassigned.length,
    )
  })

  it('no muta input', () => {
    const input = validInput()
    const snapshot = structuredClone(input)

    buildRegularExamPreviewIntegrationContract(input)

    expect(input).toEqual(snapshot)
  })

  it('no muta filtersState', () => {
    const filtersState = { carreras: ['Profesorado de Ingles'], search: 'ingles' }
    const snapshot = structuredClone(filtersState)

    buildRegularExamPreviewIntegrationContract(validInput(), filtersState)

    expect(filtersState).toEqual(snapshot)
  })

  it('no incluye raw', () => {
    const contract = buildRegularExamPreviewIntegrationContract(validInput())

    expect(hasRaw(contract)).toBe(false)
  })

  it('si falla una validacion devuelve phase error', async () => {
    vi.doMock('../preview/validateRegularExamPreviewUiDto.js', () => ({
      validateRegularExamPreviewUiDto: () => ({
        valid: false,
        errors: [{ code: 'BROKEN_UI_DTO', message: 'Contrato visual invalido.', path: 'uiDto' }],
        warnings: [],
      }),
    }))

    const { buildRegularExamPreviewIntegrationContract: buildContractWithInvalidValidation } = await import(
      '../preview/buildRegularExamPreviewIntegrationContract.js'
    )
    const contract = buildContractWithInvalidValidation(validInput())

    expect(contract.phase).toBe('error')
    expect(contract.canExportJson).toBe(false)
    expect(contract.validation.valid).toBe(false)
    expect(contract.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'BROKEN_UI_DTO' }),
    ]))
  })

  it('captura errores tecnicos con phase error', () => {
    const brokenInput = {}
    Object.defineProperty(brokenInput, 'docentes', {
      get() {
        throw new Error('No se pudo leer docentes.')
      },
    })
    const contract = buildRegularExamPreviewIntegrationContract(brokenInput)

    expect(contract.phase).toBe('error')
    expect(contract.canExportJson).toBe(false)
    expect(contract.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PREVIEW_INTEGRATION_ERROR' }),
    ]))
  })

  it('no importa motor viejo, UI ni hooks', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/utils/examEngine/preview/buildRegularExamPreviewIntegrationContract.js'),
      'utf8',
    )
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const legacy = ['legacy', 'Adapter'].join('')
    const uiComponents = ['compo', 'nents'].join('')
    const uiHooks = ['ho', 'oks'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(legacy)
    expect(source).not.toContain(uiComponents)
    expect(source).not.toContain(uiHooks)
  })
})
