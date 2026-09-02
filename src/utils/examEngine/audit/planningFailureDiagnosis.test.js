import { describe, expect, it } from 'vitest'
import {
  classifyDateFailure,
  classifyVocalRejection,
  createExtendedDatesInput,
  createInstitutionalAffinityFallbackInput,
  createOneCallInput,
  summarizeDateFailures,
  summarizeOneVocalMinimumScenario,
  summarizeTribunalFailures,
} from './planningFailureDiagnosis.js'

describe('planningFailureDiagnosis', () => {
  it('clasifica causas de mesas sin fecha sin usar datos personales', () => {
    expect(classifyDateFailure({
      reason: 'TITULAR_NO_DISPONIBLE',
      errors: [{ code: 'TITULAR_NO_DISPONIBLE', docenteId: 'doc-sensible' }],
    })).toBe('titular_no_disponible_en_periodo')

    const summary = summarizeDateFailures([
      {
        id: 'm1',
        carrera: 'Profesorado de Ingles',
        materia: 'Lengua Inglesa I',
        llamado: 'PRIMER_LLAMADO',
        reason: 'VOCAL_NO_DISPONIBLE',
        errors: [{ code: 'VOCAL_NO_DISPONIBLE', docenteId: 'doc-1' }],
      },
    ])

    expect(summary).toMatchObject({
      totalMesasSinFecha: 1,
      motivosPrincipales: {
        vocales_no_disponibles: 1,
      },
    })
    expect(JSON.stringify(summary)).not.toContain('doc-1')
  })

  it('clasifica rechazos de vocales por causa institucional', () => {
    expect(classifyVocalRejection('SIN_AFINIDAD')).toBe('afinidad')
    expect(classifyVocalRejection('SIN_DISPONIBILIDAD')).toBe('disponibilidad')
    expect(classifyVocalRejection('SUPERA_LIMITE_VOCALIAS')).toBe('mitad_mas_uno')
    expect(classifyVocalRejection('ES_TITULAR_DE_LA_MESA')).toBe('conflicto_horario_o_rol')
  })

  it('resume fallas de tribunal y rechazos sin exponer docentes', () => {
    const summary = summarizeTribunalFailures({
      rows: [
        { id: 'm1', carrera: 'Carrera A', materia: 'Materia A', llamado: 'PRIMER_LLAMADO', titularId: 'titular-1' },
        { id: 'm2', carrera: 'Carrera A', materia: 'Materia B', llamado: 'PRIMER_LLAMADO', titularId: 'titular-2', vocal1Id: 'vocal-1' },
      ],
      plan: {
        plannedMesas: [
          { id: 'm1', titularId: 'titular-1' },
          { id: 'm2', titularId: 'titular-2', vocal1Id: 'vocal-1' },
        ],
        metadata: {
          vocalCandidateSummary: [
            {
              mesaId: 'm1',
              candidatosVocales: [
                { docenteId: 'doc-sensible', valido: false, rechazos: ['SIN_AFINIDAD'] },
                { docenteId: 'doc-sensible-2', valido: true, rechazos: [] },
              ],
            },
          ],
          repairs: [{ action: 'NO_HAY_CANDIDATOS_VALIDOS', success: false }],
        },
      },
    })

    expect(summary.totalMesasSinTribunal).toBe(1)
    expect(summary.titularOkPeroSinVocales).toBe(1)
    expect(summary.tieneUnVocalFaltaSegundo).toBe(1)
    expect(summary.estadoInternoPlan.tieneUnVocalFaltaSegundo).toBe(1)
    expect(summary.candidaturas.rechazosPorCausa).toEqual({ afinidad: 1 })
    expect(JSON.stringify(summary)).not.toContain('doc-sensible')
  })

  it('crea variantes de input para escenarios sin mutar el original', () => {
    const input = {
      docentes: [{ id: 'doc-1' }],
      fechasDisponibles: [
        { fecha: '2026-07-27', diaSemana: 'LUNES', llamado: 'PRIMER_LLAMADO', turno: 'NOCHE' },
        { fecha: '2026-08-03', diaSemana: 'LUNES', llamado: 'SEGUNDO_LLAMADO', turno: 'NOCHE' },
      ],
      config: { cantidadLlamados: 2, fechaFin: '2026-08-03' },
    }

    const oneCall = createOneCallInput(input)
    const extended = createExtendedDatesInput(input, { extraDaysPerCall: 2 })
    const affinity = createInstitutionalAffinityFallbackInput(input)

    expect(oneCall.fechasDisponibles).toHaveLength(1)
    expect(oneCall.config.cantidadLlamados).toBe(1)
    expect(extended.fechasDisponibles).toHaveLength(6)
    expect(affinity.docentes[0]).toMatchObject({
      idoneidadAcademica: true,
      idoneidadAcademicaExplicita: true,
    })
    expect(input.docentes[0]).not.toHaveProperty('idoneidadAcademica')
  })

  it('estima el escenario de un vocal como minimo institucional', () => {
    const scenario = summarizeOneVocalMinimumScenario({
      metrics: {
        mesasCompletas: 10,
        mesasConUnVocal: 3,
        totalMesas: 20,
        completionRate: 0.5,
      },
    })

    expect(scenario.mode).toBe('post-process-estimate')
    expect(scenario.metrics.mesasCompletas).toBe(13)
    expect(scenario.metrics.mesasConUnVocal).toBe(0)
    expect(scenario.metrics.completionRate).toBe(0.5)
  })
})
