import { describe, expect, it } from 'vitest'
import { buildLegacyExamSessionsFromSnapshot } from './legacyExamSessions.js'

const baseSnapshot = {
  planesEstudio: [
    { carrera: 'PROFESORADO DE INGLES', materia: 'ING01', nombre: 'Lengua Inglesa I', anio: 1 },
    { carrera: 'PROFESORADO DE INGLES', materia: 'ING02', nombre: 'Lengua Inglesa II', anio: 2 },
  ],
}

describe('buildLegacyExamSessionsFromSnapshot', () => {
  it('sincroniza mesas generadas aunque sigan pendientes de confirmacion', () => {
    const rows = buildLegacyExamSessionsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      snapshot: {
        ...baseSnapshot,
        cronograma: [{
          id: 'mesa-1',
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING01',
          nombreMateria: 'Lengua Inglesa I',
          fechaIso: '2026-12-10',
          inicio: '18:30',
          llamado: 'Primer llamado',
          estado: 'pendiente',
        }],
      },
    })

    expect(rows).toEqual([expect.objectContaining({
      institution_id: 'inst-1',
      workspace_key: 'main',
      exam_table_id: 'mesa-1',
      subject_id: 'ING01',
      program_id: 'PROFESORADO DE INGLES',
      exam_date: '2026-12-10T18:30:00',
      call_label: 'Primer llamado',
    })])
  })

  it('limpia mesas admin_only y conserva mesas especiales operativas', () => {
    const rows = buildLegacyExamSessionsFromSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      snapshot: {
        ...baseSnapshot,
        cronograma: [
          { id: 'mesa-admin', carrera: 'PROFESORADO DE INGLES', materia: 'ING01', fechaIso: '2026-12-10', inscription_mode: 'admin_only' },
          { id: 'mesa-special', carrera: 'PROFESORADO DE INGLES', materia: 'ING02', fecha: '11/12/2026', exam_type: 'special', llamado: 'Llamado especial' },
        ],
      },
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(expect.objectContaining({
      exam_table_id: 'mesa-special',
      subject_id: 'ING02',
      exam_date: '2026-12-11T08:00:00',
      call_label: 'Llamado especial',
    }))
  })
})
