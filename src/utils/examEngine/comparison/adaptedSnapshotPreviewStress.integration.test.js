import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { legacyWorkspaceSnapshotStress } from './__fixtures__/legacyWorkspaceSnapshotStress.fixture.js'
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

describe('adapted snapshot preview stress integration', () => {
  it('ejecuta el preview nuevo con snapshot viejo exigente adaptado', () => {
    const snapshot = clone(legacyWorkspaceSnapshotStress)
    const originalSnapshot = clone(snapshot)

    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const originalInput = clone(input)
    const contract = buildRegularExamPreviewIntegrationContract(input, {})
    const summary = contract.uiDto.uiSummary
    const pendingReview = contract.uiDto.uiPendingReview.length
      ? contract.uiDto.uiPendingReview
      : contract.preview?.report?.pendingManualReview ?? []

    expect(input).toMatchObject({
      docentes: expect.any(Array),
      materias: expect.any(Array),
      correlatividades: expect.any(Array),
      fechasDisponibles: expect.any(Array),
      config: expect.any(Object),
      options: expect.any(Object),
      metadata: expect.any(Object),
    })
    expect(new Set(input.materias.map((materia) => materia.carrera))).toEqual(new Set([
      'Profesorado de Ingles',
      'Tecnicatura Superior en Desarrollo de Software',
      'Profesorado de Educacion Primaria',
    ]))
    expect(input.materias).toHaveLength(8)
    expect(input.docentes).toHaveLength(7)
    expect(input.correlatividades).toEqual([
      expect.objectContaining({
        materia: 'ING2',
        correlativas: ['ING1'],
      }),
    ])
    expect(input.config).toMatchObject({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 1,
    })
    expect(input.fechasDisponibles).toHaveLength(1)
    expect(input.materias.find((materia) => materia.materia === 'INGT')).toMatchObject({
      nombreMateria: 'Ingles Transversal',
      requiereMesa: true,
    })
    expect(input.materias.find((materia) => materia.materia === 'TIC1')).toMatchObject({
      nombreMateria: 'Informatica y TIC',
      requiereMesa: true,
    })
    expect(input.materias.find((materia) => materia.materia === 'PD3')).toMatchObject({
      nombreMateria: 'Practicas Discursivas III',
      requiereMesa: true,
    })
    expect(input.materias.find((materia) => materia.materia === 'DIDMAT1')).toMatchObject({
      titularId: '',
      requiereMesa: false,
    })
    expect(input.materias.find((materia) => materia.materia === 'PED1')).toMatchObject({
      titularId: 'doc-stress-inexistente',
      requiereMesa: false,
    })
    expect(input.docentes.some((docente) => docente.id === 'doc-stress-inexistente')).toBe(false)
    expect(input.docentes.find((docente) => docente.id === 'doc-stress-sin-disp')).toMatchObject({
      diasAsistencia: [],
      turnosDisponibles: [],
    })

    expect(contract.phase).toMatch(/^(warning|critical)$/)
    expect(contract.validation.valid).toBe(true)
    expect(summary.totalCriticalErrors + summary.totalWarnings).toBeGreaterThan(0)
    expect(contract.filteredDto.uiAlerts.length).toBeGreaterThan(0)
    expect(pendingReview.length).toBeGreaterThan(0)
    expect(hasRaw(contract)).toBe(false)

    expect(snapshot).toEqual(originalSnapshot)
    expect(input).toEqual(originalInput)
  })

  it('mantiene el stress aislado del motor viejo, hooks productivos y adaptadores prohibidos', () => {
    const source = sourceFor([
      'src/utils/examEngine/comparison/adaptedSnapshotPreviewStress.integration.test.js',
      'src/utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotStress.fixture.js',
      'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js',
      'src/utils/examEngine/preview/buildRegularExamPreviewIntegrationContract.js',
      'src/utils/examEngine/preview/buildRegularExamEnginePreview.js',
    ])
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(adapter)
  })
})
