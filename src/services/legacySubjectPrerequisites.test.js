import { describe, expect, it } from 'vitest'
import { buildLegacySubjectPrerequisitesFromSnapshot } from './legacySubjectPrerequisites.js'

describe('buildLegacySubjectPrerequisitesFromSnapshot', () => {
  it('sincroniza tambien la correlativa indirecta derivada, aunque el Excel solo traiga el eslabon directo', () => {
    const snapshot = {
      planesEstudio: [
        { carrera: 'PROFESORADO DE INGLES', materia: 'DIDGRAL', nombre: 'Didactica General', anio: 1 },
        { carrera: 'PROFESORADO DE INGLES', materia: 'DIDING1', nombre: 'Didactica del Ingles I', anio: 2 },
        { carrera: 'PROFESORADO DE INGLES', materia: 'DIDING2', nombre: 'Didactica del Ingles II', anio: 3 },
      ],
      correlatividades: [
        { carrera: 'PROFESORADO DE INGLES', materia: 'DIDING1', correlativas: 'DIDGRAL' },
        { carrera: 'PROFESORADO DE INGLES', materia: 'DIDING2', correlativas: 'DIDING1' },
      ],
    }

    const rows = buildLegacySubjectPrerequisitesFromSnapshot({
      snapshot,
      institutionId: 'inst-1',
      workspaceKey: 'main',
    })

    const forDidIng2 = rows.filter((row) => row.subject_id === 'DIDING2')

    expect(forDidIng2).toEqual(expect.arrayContaining([
      expect.objectContaining({ prerequisite_subject_id: 'DIDING1', is_immediate: true }),
      expect.objectContaining({ prerequisite_subject_id: 'DIDGRAL', is_immediate: false }),
    ]))
    expect(forDidIng2).toHaveLength(2)
    expect(rows.every((row) => row.institution_id === 'inst-1' && row.workspace_key === 'main')).toBe(true)
  })
})
