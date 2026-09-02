import { describe, expect, it } from 'vitest'
import { runExamEngineV21FieldTest } from '../index.js'

const dynamicExamCallConfig = {
  fechaInicio: '2026-11-27',
  fechaFin: '2026-12-02',
  usarDiasHabiles: true,
  carrerasIncluidas: 'ALL',
  excepcionesPorCarrera: [
    {
      carrera: 'Profesorado de Geografia',
      soloAnios: [4],
    },
  ],
  estadoSalida: 'TEACHER_REVIEW',
}

describe('examEngine v2.1 field test runner', () => {
  it('ejecuta el flujo completo con configuracion dinamica y filas normalizadas', () => {
    const correctedDate = '2026-12-02'
    let correctedMesaId = ''
    let excludedMesaId = ''

    const result = runExamEngineV21FieldTest({
      examCallConfig: dynamicExamCallConfig,
      generatedAt: '2026-06-30T00:00:00.000Z',
      reviewedRows: (draftRows) => draftRows.map((row, index) => {
        if (index === 0) correctedMesaId = row.draftMesaId
        if (index === 1) excludedMesaId = row.draftMesaId

        return {
          ...row,
          confirmada: index === 0 ? 'si' : '',
          excluirMesa: index === 1 ? 'si' : '',
          nuevaFechaSugerida: index === 0 ? correctedDate : '',
          observacionesDocentes: index === 0
            ? 'Cambio de fecha confirmado por docente.'
            : 'Mesa excluida para la prueba de campo.',
        }
      }),
    })

    expect(result.summary.draft).toMatchObject({
      totalMesas: 2,
      conTitular: 2,
      sinTitular: 0,
      paraRevisionDocente: 2,
    })
    expect(result.stages.draftResult.metadata.config).toMatchObject(dynamicExamCallConfig)
    expect(result.stages.draftResult.metadata.fechasHabiles).toEqual([
      '2026-11-27',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
    ])
    expect(result.stages.draftResult.draftSchedule.every((mesa) => (
      result.stages.draftResult.metadata.fechasHabiles.includes(mesa.fechaSugerida)
    ))).toBe(true)
    result.stages.draftResult.draftSchedule.forEach((mesa) => {
      expect(mesa).not.toHaveProperty('vocal1')
      expect(mesa).not.toHaveProperty('vocal2')
      expect(mesa).not.toHaveProperty('vocal1Id')
      expect(mesa).not.toHaveProperty('vocal2Id')
    })
    result.outputs.cronograma_preliminar_docentes.forEach((row) => {
      expect(row).not.toHaveProperty('vocal1')
      expect(row).not.toHaveProperty('vocal2')
    })

    const correctedReviewedMesa = result.stages.reviewedResult.reviewedSchedule
      .find((mesa) => mesa.draftMesaId === correctedMesaId)
    expect(correctedReviewedMesa).toMatchObject({
      fecha: correctedDate,
      estado: 'READY_FOR_TRIBUNAL',
      manualOverrides: expect.objectContaining({ fecha: true }),
    })
    expect(result.summary.reviewed).toMatchObject({
      totalMesas: 2,
      listasParaTribunal: 1,
      excluidas: 1,
      pendientesRevision: 0,
    })

    expect(result.stages.tribunalResult.generatedTribunals).toHaveLength(1)
    expect(result.stages.tribunalResult.generatedTribunals[0]).toMatchObject({
      draftMesaId: correctedMesaId,
      fecha: correctedDate,
      estado: 'TRIBUNAL_COMPLETE',
    })
    expect(result.stages.tribunalResult.generatedTribunals.some((mesa) => (
      mesa.draftMesaId === excludedMesaId
    ))).toBe(false)
    expect(result.stages.tribunalResult.skippedMesas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        draftMesaId: excludedMesaId,
        reason: 'MESA_EXCLUDED_SKIPPED',
      }),
    ]))
    expect(result.summary.tribunals).toMatchObject({
      totalMesas: 1,
      completos: 1,
      minimos: 0,
      incompletos: 0,
      pendientesRevision: 0,
    })

    expect(result.stages.finalResult.metadata).toMatchObject({
      halfPlusOneRecalculated: true,
    })
    expect(result.summary.final).toMatchObject({
      confirmados: 1,
      confirmadosMinimos: 0,
      bloqueados: 0,
      excluidos: 0,
      pendientes: 0,
    })
    expect(result.outputs.tribunales_para_revision_institucional).toHaveLength(1)
    expect(result.outputs.cronograma_final_oficial).toEqual([
      expect.objectContaining({
        fecha: correctedDate,
        estadoFinal: 'FINAL_CONFIRMED',
      }),
    ])
    expect(Array.isArray(result.outputs.alertas_finales)).toBe(true)
    expect(result.alerts).toBe(result.outputs.alertas_finales)
  })
})
