import { describe, expect, it } from 'vitest'
import { buildExamEngineSnapshotFromAcademicSchema } from './buildExamEngineSnapshotFromAcademicSchema.js'
import { buildRegularExamInputFromWorkspaceSnapshot } from '../comparison/buildRegularExamInputFromWorkspaceSnapshot.js'
import { generateRegularExamPlan } from '../planning/generateRegular.js'
import { academicRelationalSchemaFixture, INSTITUTION_ID } from './__fixtures__/academicRelationalSchema.fixture.js'

function createFakeSupabase(store) {
  const writeMethods = ['insert', 'update', 'upsert', 'delete', 'rpc']

  return {
    from(table) {
      const query = {
        filters: [],
        eq(column, value) {
          this.filters.push({ column, value })
          return this
        },
        select() {
          return this
        },
        then(resolve) {
          const rows = (store[table] ?? []).filter((row) => (
            this.filters.every((filter) => row[filter.column] === filter.value)
          ))
          return resolve({ data: rows, error: null })
        },
      }
      writeMethods.forEach((method) => {
        query[method] = () => { throw new Error(`No deberia llamarse ${method} en un flujo de solo lectura.`) }
      })
      return query
    },
  }
}

describe('buildExamEngineSnapshotFromAcademicSchema', () => {
  it('arma un snapshot con las claves de contrato exactas que espera la Capa 2', async () => {
    const supabase = createFakeSupabase(academicRelationalSchemaFixture)

    const { snapshot, diagnostics } = await buildExamEngineSnapshotFromAcademicSchema({
      supabase,
      institutionId: INSTITUTION_ID,
      fechaInicio: '2026-11-01',
      fechaFin: '2026-11-30',
    })

    expect(Object.keys(snapshot).sort()).toEqual([
      'alumnos',
      'correlatividades',
      'docenteMateria',
      'docentes',
      'examType',
      'fechaFin',
      'fechaInicio',
      'generationScope',
      'horariosDocentes',
      'planesEstudio',
      'regularCallRanges',
      'selectedSpecialSubjectKeys',
    ])
    expect(diagnostics.canRunPreview).toBe(true)
    expect(diagnostics.counts.teacherRecords).toBe(3)
  })

  it('smoke end-to-end: llega a generateRegularExamPlan sin lanzar', async () => {
    const supabase = createFakeSupabase(academicRelationalSchemaFixture)

    const { snapshot } = await buildExamEngineSnapshotFromAcademicSchema({
      supabase,
      institutionId: INSTITUTION_ID,
      fechaInicio: '2026-11-02',
      fechaFin: '2026-11-06',
    })

    const input = buildRegularExamInputFromWorkspaceSnapshot(snapshot)

    expect(() => generateRegularExamPlan(input)).not.toThrow()
    const result = generateRegularExamPlan(input)
    expect(result).toHaveProperty('report')
  })

  it('institucion sin datos produce canRunPreview false sin lanzar', async () => {
    const supabase = createFakeSupabase({})

    const { diagnostics } = await buildExamEngineSnapshotFromAcademicSchema({
      supabase,
      institutionId: 'inst-vacia',
      fechaInicio: '2026-11-01',
      fechaFin: '2026-11-30',
    })

    expect(diagnostics.canRunPreview).toBe(false)
  })
})
