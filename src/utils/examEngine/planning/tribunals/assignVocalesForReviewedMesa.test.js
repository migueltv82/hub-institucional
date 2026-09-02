import { describe, expect, it } from 'vitest'
import { finalizeTribunalMesaSelection } from './assignVocalesForReviewedMesa.js'
import { contarVocaliasPorDocente, cuentaComoVocalia } from '../../rules/halfPlusOne.js'

function buildContext(overrides = {}) {
  return {
    baseMesa: {
      id: 'mesa-1',
      draftMesaId: 'mesa-1',
      materiaId: 'MAT1',
      carreraId: 'CARRERA1',
      llamado: 'PRIMER_LLAMADO',
      fechaSugerida: '2026-08-10',
      turno: 'manana',
    },
    titular: { titularId: 'doc-titular', titular: 'Titular Uno', docente: { id: 'doc-titular' }, found: true },
    titularAlerts: [],
    candidatePool: { candidates: [] },
    tribunalRules: { idealVocales: 2, minimoVocales: 1, permitirTribunalMinimo: true },
    decisionTrace: [],
    alertas: [],
    ...overrides,
  }
}

describe('finalizeTribunalMesaSelection - tribunal cruzado', () => {
  it('asigna rol TRIBUNAL_CRUZADO a un candidato bloqueado como titular cruzado en vez de VOCAL_1', () => {
    const context = buildContext()
    const selected = [
      { docenteId: 'doc-cross', nombre: 'Cruzado Uno', nivelAfinidad: 'alta', alertas: [], lockedCrossTitular: true },
      { docenteId: 'doc-vocal2', nombre: 'Vocal Dos', nivelAfinidad: 'alta', alertas: [] },
    ]

    const result = finalizeTribunalMesaSelection({ context, selected })

    expect(result.participaciones[0].rol).toBe('TRIBUNAL_CRUZADO')
    expect(result.participaciones[1].rol).toBe('VOCAL_2')
  })

  it('un titular cruzado no consume cupo de mitad-mas-uno (no cuenta como vocalia comun)', () => {
    const context = buildContext()
    const selected = [
      { docenteId: 'doc-cross', nombre: 'Cruzado Uno', nivelAfinidad: 'alta', alertas: [], lockedCrossTitular: true },
    ]

    const result = finalizeTribunalMesaSelection({ context, selected })
    const [participacion] = result.participaciones

    expect(cuentaComoVocalia(participacion)).toBe(false)
    expect(contarVocaliasPorDocente(result.participaciones, 'doc-cross', 'PRIMER_LLAMADO')).toBe(0)
  })

  it('un vocal comun (no bloqueado como cruzado) si consume cupo de mitad-mas-uno', () => {
    const context = buildContext()
    const selected = [
      { docenteId: 'doc-vocal1', nombre: 'Vocal Uno', nivelAfinidad: 'alta', alertas: [] },
    ]

    const result = finalizeTribunalMesaSelection({ context, selected })
    const [participacion] = result.participaciones

    expect(participacion.rol).toBe('VOCAL_1')
    expect(cuentaComoVocalia(participacion)).toBe(true)
    expect(contarVocaliasPorDocente(result.participaciones, 'doc-vocal1', 'PRIMER_LLAMADO')).toBe(1)
  })
})
