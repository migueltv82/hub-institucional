import { describe, expect, it } from 'vitest'
import {
  applyVocalFallbackToCandidateEntries,
  classifyVocalRejectionCause,
  FALLBACK_MODES,
} from './vocalBottleneckDiagnosis.js'

describe('vocalBottleneckDiagnosis', () => {
  it('clasifica rechazos de vocales en causas auditables', () => {
    expect(classifyVocalRejectionCause('SIN_AFINIDAD')).toBe('afinidad')
    expect(classifyVocalRejectionCause('SIN_DISPONIBILIDAD')).toBe('disponibilidad')
    expect(classifyVocalRejectionCause('SUPERA_LIMITE_VOCALIAS')).toBe('mitad_mas_uno')
    expect(classifyVocalRejectionCause('ES_TITULAR_DE_LA_MESA')).toBe('conflicto_rol_titular')
    expect(classifyVocalRejectionCause('DOCENTE_DUPLICADO_EN_MESA')).toBe('mismo_docente')
    expect(classifyVocalRejectionCause('TURNO_INCOMPATIBLE')).toBe('turno_incompatible')
  })

  it('convierte SIN_AFINIDAD en fallback manual cuando la familia transversal coincide', () => {
    const result = applyVocalFallbackToCandidateEntries({
      mode: FALLBACK_MODES.TRANSVERSAL_ENGLISH_IT,
      docentes: [
        {
          id: 'doc-ingles',
          carrera: 'Profesorado de Ingles',
          nombreMateria: 'Lengua Inglesa I',
        },
      ],
      entries: [
        {
          mesaId: 'mesa-1',
          carrera: 'Traductorado de Ingles',
          materia: 'Ingles Tecnico',
          materiaId: 'ING-TEC',
          candidatosVocales: [
            {
              docenteId: 'doc-ingles',
              valido: false,
              nivelAfinidad: 'SIN_AFINIDAD',
              puntajeAfinidad: 0,
              rechazos: ['SIN_AFINIDAD'],
              metadata: {},
            },
          ],
        },
      ],
    })

    const candidate = result.entries[0].candidatosVocales[0]

    expect(candidate).toMatchObject({
      valido: true,
      rechazos: [],
      metadata: {
        fallbackAffinity: true,
        requiresManualReview: true,
        reason: 'FALLBACK_AFINIDAD',
      },
    })
    expect(result.summary).toMatchObject({
      fallbackCandidatesAdded: 1,
      mesasConFallback: 1,
    })
  })

  it('no convierte candidatos con rechazos de seguridad adicionales', () => {
    const result = applyVocalFallbackToCandidateEntries({
      mode: FALLBACK_MODES.TRANSVERSAL_ENGLISH_IT,
      docentes: [
        {
          id: 'doc-ingles',
          carrera: 'Profesorado de Ingles',
          nombreMateria: 'Lengua Inglesa I',
        },
      ],
      entries: [
        {
          mesaId: 'mesa-1',
          carrera: 'Traductorado de Ingles',
          materia: 'Ingles Tecnico',
          candidatosVocales: [
            {
              docenteId: 'doc-ingles',
              valido: false,
              rechazos: ['SIN_AFINIDAD', 'SUPERA_LIMITE_VOCALIAS'],
              metadata: {},
            },
          ],
        },
      ],
    })

    expect(result.entries[0].candidatosVocales[0].valido).toBe(false)
    expect(result.summary.fallbackCandidatesAdded).toBe(0)
  })

  it('no relaja Practicas Discursivas III o IV', () => {
    const result = applyVocalFallbackToCandidateEntries({
      mode: FALLBACK_MODES.TRANSVERSAL_ENGLISH_IT,
      docentes: [
        {
          id: 'doc-ingles',
          carrera: 'Profesorado de Ingles',
          nombreMateria: 'Lengua Inglesa I',
        },
      ],
      entries: [
        {
          mesaId: 'mesa-1',
          carrera: 'Profesorado de Ingles',
          materia: 'Practicas Discursivas III',
          candidatosVocales: [
            {
              docenteId: 'doc-ingles',
              valido: false,
              rechazos: ['SIN_AFINIDAD'],
              metadata: {},
            },
          ],
        },
      ],
    })

    expect(result.entries[0].candidatosVocales[0].valido).toBe(false)
    expect(result.summary.fallbackCandidatesAdded).toBe(0)
  })

  it('respeta el modo solo sin candidatos validos', () => {
    const result = applyVocalFallbackToCandidateEntries({
      mode: FALLBACK_MODES.FAMILY_IF_ZERO,
      onlyWhenNoValidCandidates: true,
      docentes: [
        {
          id: 'doc-1',
          carrera: 'Profesorado de Quimica',
          nombreMateria: 'Laboratorio de Quimica',
        },
        {
          id: 'doc-2',
          carrera: 'Profesorado de Quimica',
          nombreMateria: 'Quimica General',
        },
      ],
      entries: [
        {
          mesaId: 'mesa-1',
          carrera: 'Profesorado de Quimica',
          materia: 'Laboratorio de Quimica',
          candidatosVocales: [
            { docenteId: 'doc-1', valido: true, rechazos: [], metadata: {} },
            { docenteId: 'doc-2', valido: false, rechazos: ['SIN_AFINIDAD'], metadata: {} },
          ],
        },
      ],
    })

    expect(result.entries[0].candidatosVocales.filter((candidate) => candidate.valido)).toHaveLength(1)
    expect(result.summary.fallbackCandidatesAdded).toBe(0)
  })
})
