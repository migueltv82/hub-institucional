import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRegularExamPreviewIntegrationContract } from '../preview/index.js'
import { legacyWorkspaceSnapshotInstitutional } from './__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js'
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

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function sourceFor(paths = []) {
  return paths
    .map((sourcePath) => readFileSync(join(process.cwd(), sourcePath), 'utf8'))
    .join('\n')
}

describe('institutional snapshot preview integration', () => {
  it('adapta el snapshot institucional controlado y ejecuta el preview nuevo', () => {
    const snapshot = clone(legacyWorkspaceSnapshotInstitutional)
    const originalSnapshot = clone(snapshot)

    expect(snapshot).toMatchObject({
      alumnos: expect.any(Array),
      horariosDocentes: expect.any(Array),
      docentes: expect.any(Array),
      planesEstudio: expect.any(Array),
      correlatividades: expect.any(Array),
      regularCallRanges: expect.any(Object),
    })
    expect(snapshot.generationScope.careers).toHaveLength(3)
    expect(snapshot.planesEstudio).toHaveLength(12)
    expect(snapshot.docentes).toHaveLength(10)
    expect(snapshot.horariosDocentes.length).toBeGreaterThanOrEqual(12)
    expect(snapshot.correlatividades.length).toBeGreaterThan(0)
    expect(Object.keys(snapshot.regularCallRanges)).toEqual(['first'])

    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)
    const originalInput = clone(input)
    const carreras = uniqueValues(input.materias.map((materia) => materia.carrera))
    const fechas = input.fechasDisponibles.map((fecha) => fecha.fecha)

    expect(input).toMatchObject({
      docentes: expect.any(Array),
      materias: expect.any(Array),
      correlatividades: expect.any(Array),
      fechasDisponibles: expect.any(Array),
      config: expect.any(Object),
      options: expect.any(Object),
      metadata: expect.any(Object),
    })
    expect(carreras).toEqual(expect.arrayContaining([
      'Profesorado de Ingles',
      'Tecnicatura Superior en Desarrollo de Software',
      'Profesorado de Educacion Primaria',
    ]))
    expect(carreras).toHaveLength(3)
    expect(input.materias).toHaveLength(12)
    expect(input.docentes).toHaveLength(10)
    expect(input.config).toMatchObject({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 1,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
    })
    expect(input.fechasDisponibles.length).toBeGreaterThan(0)
    expect(Math.min(...fechas.map((fecha) => Date.parse(fecha)))).toBeGreaterThanOrEqual(Date.parse('2026-07-27'))
    expect(Math.max(...fechas.map((fecha) => Date.parse(fecha)))).toBeLessThanOrEqual(Date.parse('2026-08-07'))
    expect(input.fechasDisponibles.every((fecha) => fecha.llamado === 'PRIMER_LLAMADO')).toBe(true)

    const contract = buildRegularExamPreviewIntegrationContract(input, {})

    expect(contract).toMatchObject({
      phase: expect.stringMatching(/^(success|warning|critical)$/),
      status: expect.any(String),
      uiDto: expect.any(Object),
      validation: expect.any(Object),
      filters: expect.any(Object),
      filteredDto: expect.any(Object),
      errors: expect.any(Array),
      warnings: expect.any(Array),
      metadata: expect.any(Object),
    })
    expect(contract.validation.valid).toBe(true)
    expect(contract.uiDto.uiSummary).toEqual(expect.any(Object))
    expect(
      contract.preview.plannedMesas.length + contract.preview.unassignedMesas.length,
    ).toBeGreaterThan(0)
    expect(hasRaw(contract)).toBe(false)

    expect(snapshot).toEqual(originalSnapshot)
    expect(input).toEqual(originalInput)
  })

  it('mantiene el snapshot institucional aislado de motor viejo, UI y adaptadores prohibidos', () => {
    const source = sourceFor([
      'src/utils/examEngine/comparison/institutionalSnapshotPreview.integration.test.js',
      'src/utils/examEngine/comparison/__fixtures__/legacyWorkspaceSnapshotInstitutional.fixture.js',
      'src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js',
      'src/utils/examEngine/preview/buildRegularExamPreviewIntegrationContract.js',
    ])
    const oldEngine = ['cronograma', 'Inteligente'].join('')
    const oldHook = ['useCronograma', 'Generation'].join('')
    const adapter = ['legacy', 'Adapter'].join('')
    const productiveGenerator = ['Generador', 'Cronograma'].join('')
    const routerPackage = ['react', '-router-dom'].join('')

    expect(source).not.toContain(oldEngine)
    expect(source).not.toContain(oldHook)
    expect(source).not.toContain(adapter)
    expect(source).not.toContain(productiveGenerator)
    expect(source).not.toContain(routerPackage)
    expect(source).not.toMatch(/from\s+['"].*components/)
  })
})
