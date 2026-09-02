import { describe, expect, it } from 'vitest'
import { buildDraftSchedulePdfModel } from './draftSchedulePdfExport.js'

describe('buildDraftSchedulePdfModel', () => {
  it('separa el PDF por carrera y arma la matriz fecha por año', () => {
    const model = buildDraftSchedulePdfModel([
      { draftMesaId: '1', carrera: 'Laboratorio', fecha: '2026-07-30', anio: 1, materiaMesa: 'Práctica I' },
      { draftMesaId: '2', carrera: 'Laboratorio', fecha: '2026-07-30', anio: 2, materiaMesa: 'Anatomía' },
      { draftMesaId: '3', carrera: 'Traductorado', fecha: '2026-07-31', anio: 1, materiaMesa: 'Lengua' },
    ])

    expect(model).toHaveLength(2)
    expect(model[0]).toMatchObject({
      career: 'Laboratorio',
      years: ['1', '2'],
      dates: ['2026-07-30'],
    })
    expect(model[0].cells.get('2026-07-30::1')).toEqual([
      expect.objectContaining({ materiaMesa: 'Práctica I' }),
    ])
  })

  it('conserva los vocales para incluirlos en el PDF completo enviado a docentes', () => {
    const model = buildDraftSchedulePdfModel([
      {
        draftMesaId: '1',
        carrera: 'Profesorado de Ingles',
        fecha: '2026-07-30',
        anio: 2,
        materiaMesa: 'Didactica del Ingles II',
        titular: 'Natalia Raya',
        vocal1: 'Docente Vocal Uno',
        vocal2: 'Docente Vocal Dos',
      },
    ])

    expect(model[0].cells.get('2026-07-30::2')[0]).toMatchObject({
      vocal1: 'Docente Vocal Uno',
      vocal2: 'Docente Vocal Dos',
    })
  })
})
