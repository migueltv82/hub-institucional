import { describe, expect, it } from 'vitest'
import { validateFinalTribunals } from './validateFinalTribunals.js'

const docentes = [
  { id: 'doc-1', nombre: 'Docente Uno', horasCatedra: 1 },
  { id: 'doc-titular-a', nombre: 'Titular A', horasCatedra: 10 },
  { id: 'doc-titular-b', nombre: 'Titular B', horasCatedra: 10 },
]

describe('validateFinalTribunals - tribunal cruzado no consume mitad-mas-uno', () => {
  it('no dispara FINAL_TEACHER_EXCEEDS_HALF_PLUS_ONE cuando la segunda participacion es un titular cruzado', () => {
    const finalTribunals = [
      {
        id: 'mesa-1',
        draftMesaId: 'mesa-1',
        titularId: 'doc-titular-a',
        vocal1Id: 'doc-1',
        vocal1: 'Docente Uno',
        llamado: 'PRIMER_LLAMADO',
      },
      {
        id: 'mesa-2',
        draftMesaId: 'mesa-2',
        titularId: 'doc-titular-b',
        vocal1Id: 'doc-1',
        vocal1: 'Docente Uno',
        llamado: 'PRIMER_LLAMADO',
        metadata: {
          crossTitularVocales: [{ docenteId: 'doc-1' }],
        },
      },
    ]

    const result = validateFinalTribunals({ finalTribunals, docentes })

    const exceededAlerts = result.alerts.filter((alert) => alert.code === 'FINAL_TEACHER_EXCEEDS_HALF_PLUS_ONE')
    expect(exceededAlerts).toHaveLength(0)
  })

  it('si dispara FINAL_TEACHER_EXCEEDS_HALF_PLUS_ONE cuando ambas participaciones son vocalias comunes', () => {
    const finalTribunals = [
      {
        id: 'mesa-1',
        draftMesaId: 'mesa-1',
        titularId: 'doc-titular-a',
        vocal1Id: 'doc-1',
        vocal1: 'Docente Uno',
        llamado: 'PRIMER_LLAMADO',
      },
      {
        id: 'mesa-2',
        draftMesaId: 'mesa-2',
        titularId: 'doc-titular-b',
        vocal1Id: 'doc-1',
        vocal1: 'Docente Uno',
        llamado: 'PRIMER_LLAMADO',
      },
    ]

    const result = validateFinalTribunals({ finalTribunals, docentes })

    const exceededAlerts = result.alerts.filter((alert) => alert.code === 'FINAL_TEACHER_EXCEEDS_HALF_PLUS_ONE')
    expect(exceededAlerts.length).toBeGreaterThan(0)
  })
})
