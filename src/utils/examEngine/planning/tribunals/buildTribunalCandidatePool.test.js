import { describe, expect, it } from 'vitest'
import { buildTribunalCandidatePool } from './buildTribunalCandidatePool.js'

describe('buildTribunalCandidatePool: limite entre carreras', () => {
  it('no ofrece un docente de Quimica como vocal de Traductorado', () => {
    const result = buildTribunalCandidatePool({
      mesa: {
        id: 'mesa-trad',
        carrera: 'Traductorado de Ingles',
        materia: 'Quimica aplicada a la traduccion',
        titularId: 'titular-1',
      },
      docentes: [{
        id: 'doc-quimica',
        nombre: 'Docente Quimica',
        activo: true,
        carrera: 'Profesorado de Quimica',
        nombreMateria: 'Quimica aplicada a la traduccion',
      }],
      tribunalRules: { aplicarMitadMasUno: false, maxParticipacionesDocentePorDia: 99 },
    })

    expect(result.validCandidates).toHaveLength(0)
    expect(result.rejectedCandidates[0]).toMatchObject({
      docenteId: 'doc-quimica',
      nivelAfinidad: 'CARRERA_INCOMPATIBLE',
      rechazos: expect.arrayContaining(['CARRERA_INCOMPATIBLE']),
    })
  })

  it('ofrece docentes afines de otra carrera para TIC', () => {
    const result = buildTribunalCandidatePool({
      mesa: {
        id: 'mesa-tic',
        carrera: 'Tecnicatura en Turismo',
        materia: 'TIC aplicada al Turismo',
        titularId: 'titular-1',
      },
      docentes: [{
        id: 'doc-tic',
        nombre: 'Docente TIC',
        activo: true,
        carrera: 'Profesorado de Informatica',
        nombreMateria: 'Tecnologia de la Informacion',
      }],
      tribunalRules: { aplicarMitadMasUno: false, maxParticipacionesDocentePorDia: 99 },
    })

    expect(result.validCandidates).toHaveLength(1)
    expect(result.validCandidates[0].docenteId).toBe('doc-tic')
  })

  it('mantiene a docentes de Ingles de servicio dentro de su propia carrera', () => {
    const docenteInglesTurismo = {
      id: 'doc-ingles-turismo',
      nombre: 'Fernanda Doz',
      activo: true,
      carrera: 'Tecnicatura Superior en Turismo',
      nombreMateria: 'Ingles',
      materiasAsignadas: [
        {
          carrera: 'Tecnicatura Superior en Turismo',
          materia: 'TUR-ING',
          nombreMateria: 'Ingles',
        },
      ],
    }

    const nonEnglishMesa = buildTribunalCandidatePool({
      mesa: {
        id: 'mesa-quimica',
        carrera: 'Profesorado de Quimica',
        materia: 'Quimica General',
        titularId: 'titular-1',
      },
      docentes: [docenteInglesTurismo],
      tribunalRules: { aplicarMitadMasUno: false, maxParticipacionesDocentePorDia: 99 },
    })

    expect(nonEnglishMesa.validCandidates).toHaveLength(0)
    expect(nonEnglishMesa.rejectedCandidates[0]).toMatchObject({
      docenteId: 'doc-ingles-turismo',
      rechazos: expect.arrayContaining(['DOCENTE_INGLES_SERVICIO_SOLO_MESAS_INGLES']),
    })

    const englishMesa = buildTribunalCandidatePool({
      mesa: {
        id: 'mesa-ingles-lab',
        carrera: 'Tecnico Superior en Laboratorio',
        materia: 'Ingles Tecnico',
        titularId: 'titular-1',
      },
      docentes: [docenteInglesTurismo],
      tribunalRules: { aplicarMitadMasUno: false, maxParticipacionesDocentePorDia: 99 },
    })

    expect(englishMesa.validCandidates.map((candidate) => candidate.docenteId)).not.toContain('doc-ingles-turismo')
    expect(englishMesa.rejectedCandidates[0]).toMatchObject({
      docenteId: 'doc-ingles-turismo',
      rechazos: expect.arrayContaining(['CARRERA_INCOMPATIBLE']),
    })
  })
})
