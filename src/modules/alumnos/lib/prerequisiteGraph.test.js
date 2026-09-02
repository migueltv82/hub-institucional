import { describe, expect, it } from 'vitest'
import { classifyPrerequisites } from './prerequisiteGraph.js'

describe('classifyPrerequisites', () => {
  it('deriva la cadena completa a partir de solo las correlativas directas (caso real: Geo1 -> Geo2 -> Geo3)', () => {
    // Solo se carga el eslabon directo: Geo2 requiere Geo1, Geo3 requiere Geo2.
    // Geo3 NO tiene a Geo1 cargado explicitamente -- se deriva solo.
    const direct = new Map([
      ['Geo2', ['Geo1']],
      ['Geo3', ['Geo2']],
    ])

    const classification = classifyPrerequisites(direct)

    expect(classification.get('Geo2')).toEqual({ immediate: ['Geo1'], indirect: [] })
    expect(classification.get('Geo3')).toEqual({ immediate: ['Geo2'], indirect: ['Geo1'] })
  })

  it('caso real del instituto: Didactica General -> Ingles I -> Ingles II', () => {
    const direct = new Map([
      ['IngI', ['DidGral']],
      ['IngII', ['IngI']],
    ])

    const classification = classifyPrerequisites(direct)

    expect(classification.get('IngI')).toEqual({ immediate: ['DidGral'], indirect: [] })
    expect(classification.get('IngII')).toEqual({ immediate: ['IngI'], indirect: ['DidGral'] })
  })

  it('una materia con dos correlativas directas hereda lo indirecto de ambas', () => {
    const direct = new Map([
      ['B', ['A']],
      ['C', ['A']],
      ['D', ['B', 'C']],
    ])

    const classification = classifyPrerequisites(direct)

    expect(classification.get('D').immediate).toEqual(['B', 'C'])
    expect(classification.get('D').indirect).toEqual(['A'])
  })

  it('no rompe con ciclos (defensivo, no deberian existir en datos reales)', () => {
    const direct = new Map([
      ['A', ['B']],
      ['B', ['A']],
    ])

    expect(() => classifyPrerequisites(direct)).not.toThrow()
  })

  it('devuelve listas vacias para una materia sin correlativas', () => {
    const direct = new Map([['Materia', []]])

    const classification = classifyPrerequisites(direct)

    expect(classification.get('Materia')).toEqual({ immediate: [], indirect: [] })
  })
})
