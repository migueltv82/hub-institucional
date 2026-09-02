import { describe, expect, it } from 'vitest'
import { buildTribunalDocenteMap } from '../tribunals/buildTribunalCandidatePool.js'
import { buildManualMesa } from './buildManualMesa.js'

function docentes() {
  return [
    { id: 'doc-titular', nombre: 'Ana Titular' },
    { id: 'doc-vocal-a', nombre: 'Bruno Vocal' },
  ]
}

describe('buildManualMesa', () => {
  it('resuelve titular y vocales por nombre y arma la mesa con estado TRIBUNAL_COMPLETE', () => {
    const docenteMap = buildTribunalDocenteMap(docentes())

    const mesa = buildManualMesa({
      materiaCodigo: 'ESP01',
      materiaNombre: 'Coloquio final',
      carrera: 'Profesorado de Historia',
      anio: 4,
      titularInput: 'Ana Titular',
      vocal1Input: 'Bruno Vocal',
      vocal2Input: 'doc-vocal-a',
      fecha: '2026-09-15',
      turno: 'Mañana',
      docenteMap,
      index: 0,
    })

    expect(mesa).toMatchObject({
      draftMesaId: 'especial:0:esp01',
      materiaId: 'ESP01',
      materia: 'Coloquio final',
      materiaMesa: 'Coloquio final',
      carrera: 'Profesorado de Historia',
      anio: 4,
      llamado: 'LLAMADO_ESPECIAL',
      fecha: '2026-09-15',
      fechaSugerida: '2026-09-15',
      turno: 'Mañana',
      titularId: 'doc-titular',
      titular: 'Ana Titular',
      vocal1Id: 'doc-vocal-a',
      vocal1: 'Bruno Vocal',
      vocal2Id: 'doc-vocal-a',
      vocal2: 'Bruno Vocal',
      estado: 'TRIBUNAL_COMPLETE',
    })
  })

  it('con un solo vocal resuelto, queda TRIBUNAL_MINIMUM', () => {
    const docenteMap = buildTribunalDocenteMap(docentes())

    const mesa = buildManualMesa({
      materiaCodigo: 'ESP02',
      titularInput: 'Ana Titular',
      vocal1Input: 'Bruno Vocal',
      docenteMap,
      index: 1,
    })

    expect(mesa.estado).toBe('TRIBUNAL_MINIMUM')
    expect(mesa.vocal2Id).toBe('')
  })

  it('sin ningun vocal, queda TRIBUNAL_INCOMPLETE', () => {
    const mesa = buildManualMesa({
      materiaCodigo: 'ESP03',
      titularInput: 'Ana Titular',
      docenteMap: buildTribunalDocenteMap(docentes()),
      index: 2,
    })

    expect(mesa.estado).toBe('TRIBUNAL_INCOMPLETE')
  })

  it('si el texto tipeado no resuelve a ningun docente, deja el nombre libre con id vacio en vez de romper', () => {
    const mesa = buildManualMesa({
      materiaCodigo: 'ESP04',
      titularInput: 'Docente Inexistente',
      vocal1Input: 'Otro Inexistente',
      docenteMap: buildTribunalDocenteMap(docentes()),
      index: 3,
    })

    expect(mesa.titularId).toBe('')
    expect(mesa.titular).toBe('Docente Inexistente')
    expect(mesa.vocal1Id).toBe('')
    expect(mesa.vocal1).toBe('Otro Inexistente')
    expect(mesa.estado).toBe('TRIBUNAL_INCOMPLETE')
  })

  it('genera draftMesaId unico por indice aunque se repita la materia', () => {
    const docenteMap = buildTribunalDocenteMap(docentes())
    const first = buildManualMesa({ materiaCodigo: 'ESP05', docenteMap, index: 0 })
    const second = buildManualMesa({ materiaCodigo: 'ESP05', docenteMap, index: 1 })

    expect(first.draftMesaId).not.toBe(second.draftMesaId)
  })
})
