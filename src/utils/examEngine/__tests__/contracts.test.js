import { describe, expect, it } from 'vitest'
import {
  createParticipacionTribunal,
  isParticipacionTitular,
  isParticipacionTribunalCruzado,
  isParticipacionVocalia,
  normalizeExamPeriodConfig,
  normalizeLlamado,
  normalizeMesaExamen,
  normalizeRolParticipacion,
  validateExamPeriodConfig,
} from '../contracts.js'

describe('examEngine internal contracts', () => {
  it('normaliza config valida regular con 1 llamado', () => {
    const config = normalizeExamPeriodConfig({
      tipoPeriodo: 'regular',
      cantidadLlamados: 1,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
    })

    expect(config).toMatchObject({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 1,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
    })
  })

  it('normaliza config valida regular con 2 llamados', () => {
    const config = normalizeExamPeriodConfig({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: '2',
      fechaInicio: new Date('2026-07-27T00:00:00.000Z'),
      fechaFin: new Date('2026-08-07T00:00:00.000Z'),
      descripcion: 'Periodo regular julio-agosto',
    })

    expect(config).toMatchObject({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 2,
      fechaInicio: '2026-07-27',
      fechaFin: '2026-08-07',
      descripcion: 'Periodo regular julio-agosto',
    })
  })

  it('rechaza cantidadLlamados invalida', () => {
    const result = validateExamPeriodConfig({
      tipoPeriodo: 'REGULAR',
      cantidadLlamados: 3,
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'INVALID_CALL_COUNT',
        severity: 'critical',
      }),
    ])
  })

  it('normaliza llamados first, second y special a claves canonicas', () => {
    expect(normalizeLlamado('first')).toBe('PRIMER_LLAMADO')
    expect(normalizeLlamado('second')).toBe('SEGUNDO_LLAMADO')
    expect(normalizeLlamado('special')).toBe('LLAMADO_ESPECIAL')
  })

  it('normaliza roles titular, vocal1, vocal2 y tribunal cruzado', () => {
    expect(normalizeRolParticipacion('titular')).toBe('TITULAR')
    expect(normalizeRolParticipacion('vocal1')).toBe('VOCAL_1')
    expect(normalizeRolParticipacion('vocal2')).toBe('VOCAL_2')
    expect(normalizeRolParticipacion('tribunal cruzado')).toBe('TRIBUNAL_CRUZADO')
  })

  it('detecta que TITULAR no cuenta como vocalia', () => {
    const participacion = createParticipacionTribunal({
      docenteId: 'doc-1',
      mesaId: 'mesa-1',
      rol: 'titular',
      llamado: 'first',
    })

    expect(isParticipacionTitular(participacion)).toBe(true)
    expect(isParticipacionVocalia(participacion)).toBe(false)
  })

  it('detecta que VOCAL_1 y VOCAL_2 si cuentan como vocalia', () => {
    expect(isParticipacionVocalia(createParticipacionTribunal({
      docenteId: 'doc-1',
      mesaId: 'mesa-1',
      rol: 'vocal1',
      llamado: 'first',
    }))).toBe(true)

    expect(isParticipacionVocalia(createParticipacionTribunal({
      docenteId: 'doc-1',
      mesaId: 'mesa-2',
      rol: 'vocal2',
      llamado: 'first',
    }))).toBe(true)
  })

  it('detecta que TRIBUNAL_CRUZADO no cuenta como vocalia comun', () => {
    const participacion = createParticipacionTribunal({
      docenteId: 'doc-1',
      mesaId: 'mesa-1',
      rol: 'tribunal cruzado',
      llamado: 'first',
    })

    expect(isParticipacionTribunalCruzado(participacion)).toBe(true)
    expect(isParticipacionVocalia(participacion)).toBe(false)
  })

  it('normaliza una mesa con presidente_id como titularId', () => {
    const mesa = normalizeMesaExamen({
      id: 'mesa-1',
      presidente_id: 'doc-1',
    })

    expect(mesa).toMatchObject({
      id: 'mesa-1',
      titularId: 'doc-1',
    })
  })

  it('normaliza una mesa con exam_call como llamado canonico', () => {
    const mesa = normalizeMesaExamen({
      id: 'mesa-1',
      exam_call: 'first',
    })

    expect(mesa.llamado).toBe('PRIMER_LLAMADO')
  })
})
