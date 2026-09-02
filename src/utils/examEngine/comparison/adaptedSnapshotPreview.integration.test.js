import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { legacyWorkspaceSnapshot } from './__fixtures__/legacyWorkspaceSnapshot.fixture.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from './buildRegularExamInputFromWorkspaceSnapshot.js'

function clone(value) {
  return structuredClone(value)
}

function hasRaw(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)

  if (Object.prototype.hasOwnProperty.call(value, 'raw')) return true
  if (Array.isArray(value)) return value.some((entry) => hasRaw(entry, seen))
  return Object.values(value).some((entry) => hasRaw(entry, seen))
}

function sourceFor(paths = []) {
  return paths
    .map((sourcePath) => readFileSync(join(process.cwd(), sourcePath), 'utf8'))
    .join('\n')
}

describe('adapted snapshot preview integration', () => {
  it('ejecuta el preview nuevo con input adaptado desde snapshot viejo', () => {
    const snapshot = clone(legacyWorkspaceSnapshot)
    const originalSnapshot = clone(snapshot)

    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const originalInput = clone(input)
    const contract = buildRegularExamPreviewIntegrationContract(input, {})

    expect(input).toMatchObject({
      docentes: expect.any(Array),
      materias: expect.any(Array),
      correlatividades: expect.any(Array),
      fechasDisponibles: expect.any(Array),
      config: expect.any(Object),
      options: expect.any(Object),
      metadata: expect.any(Object),
    })
    expect(input.docentes).toHaveLength(4)
    expect(input.materias).toHaveLength(4)
    expect(input.correlatividades).toHaveLength(1)
    expect(input.fechasDisponibles.length).toBeGreaterThan(0)

    expect(contract.phase).toMatch(/^(success|warning|critical)$/)
    expect(contract.uiDto).toEqual(expect.any(Object))
    expect(contract.filteredDto).toEqual(expect.any(Object))
    expect(contract.validation).toEqual(expect.any(Object))
    expect(contract.validation.valid).toBe(true)
    expect(contract.canPublishOfficial).toBe(false)
    expect(contract.canSaveOfficialSchedule).toBe(false)
    expect(hasRaw(contract)).toBe(false)

    expect(snapshot).toEqual(originalSnapshot)
    expect(input).toEqual(originalInput)
  })

  it('mantiene el test aislado del motor viejo, hooks productivos y adaptadores prohibidos', () => {
    const source = sourceFor([
      'src/utils/examEngine/comparison/adaptedSnapshotPreview.integration.test.js',
      'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js',
      'src/utils/examEngine/preview/buildRegularExamPreviewIntegrationContract.js',
      'src/utils/examEngine/preview/buildRegularExamEnginePreview.js',
    ])
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldGenerator = ['generarCronograma', 'DesdeArchivos'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldGenerator)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(adapter)
  })
})
