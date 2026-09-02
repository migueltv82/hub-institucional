import { describe, expect, it } from 'vitest'
import {
  calcularLimiteVocaliasPorLlamado,
  contarVocaliasPorDocente,
  cuentaComoVocalia,
  puedeAsignarseComoVocal,
  validarLimiteVocalias,
} from '../rules/halfPlusOne.js'

describe('examEngine hard rule: mitad mas uno solo para vocalias', () => {
  it('docente con 5 dias de asistencia tiene limite 3', () => {
    expect(calcularLimiteVocaliasPorLlamado({
      id: 'doc-1',
      diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    })).toBe(3)
  })

  it('docente con 4 dias de asistencia tiene limite 3', () => {
    expect(calcularLimiteVocaliasPorLlamado({
      id: 'doc-1',
      diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves'],
    })).toBe(3)
  })

  it('docente con 3 dias de asistencia tiene limite 2', () => {
    expect(calcularLimiteVocaliasPorLlamado({
      id: 'doc-1',
      diasAsistencia: ['lunes', 'martes', 'miercoles'],
    })).toBe(2)
  })

  it('las titularidades no cuentan como vocalias', () => {
    const participaciones = [
      { docenteId: 'doc-1', llamado: 'first', rol: 'TITULAR' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'TITULAR' },
    ]

    expect(cuentaComoVocalia(participaciones[0])).toBe(false)
    expect(contarVocaliasPorDocente(participaciones, 'doc-1', 'first')).toBe(0)
  })

  it('VOCAL_1 y VOCAL_2 si cuentan como vocalias', () => {
    const participaciones = [
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_1' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_2' },
    ]

    expect(cuentaComoVocalia(participaciones[0])).toBe(true)
    expect(cuentaComoVocalia(participaciones[1])).toBe(true)
    expect(contarVocaliasPorDocente(participaciones, 'doc-1', 'first')).toBe(2)
  })

  it('TRIBUNAL_CRUZADO no cuenta como vocalia comun', () => {
    const participaciones = [
      { docenteId: 'doc-1', llamado: 'first', rol: 'TRIBUNAL_CRUZADO' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_EXTERNO' },
    ]

    expect(cuentaComoVocalia(participaciones[0])).toBe(false)
    expect(contarVocaliasPorDocente(participaciones, 'doc-1', 'first')).toBe(1)
  })

  it('docente con 2 titularidades y 3 vocalias no esta excedido si su limite es 3', () => {
    const docente = {
      id: 'doc-1',
      diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    }
    const participaciones = [
      { docenteId: 'doc-1', llamado: 'first', rol: 'TITULAR' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'TITULAR' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_1' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_2' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_EXTERNO' },
    ]

    expect(validarLimiteVocalias(docente, participaciones, 'first')).toMatchObject({
      docenteId: 'doc-1',
      limite: 3,
      vocaliasAsignadas: 3,
      excedido: false,
      disponible: 0,
    })
    expect(puedeAsignarseComoVocal(docente, participaciones, 'first')).toBe(false)
  })

  it('docente con 2 titularidades y 4 vocalias si esta excedido si su limite es 3', () => {
    const docente = {
      id: 'doc-1',
      diasAsistencia: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
    }
    const participaciones = [
      { docenteId: 'doc-1', llamado: 'first', rol: 'TITULAR' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'TITULAR' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_1' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_2' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_EXTERNO' },
      { docenteId: 'doc-1', llamado: 'first', rol: 'VOCAL_1' },
    ]

    expect(validarLimiteVocalias(docente, participaciones, 'first')).toMatchObject({
      docenteId: 'doc-1',
      limite: 3,
      vocaliasAsignadas: 4,
      excedido: true,
      disponible: 0,
    })
    expect(puedeAsignarseComoVocal(docente, participaciones, 'first')).toBe(false)
  })

  it('docente sin dias disponibles devuelve limite 0 y mensaje controlado', () => {
    const result = validarLimiteVocalias({ id: 'doc-1', diasAsistencia: [] }, [], 'first')

    expect(result).toMatchObject({
      docenteId: 'doc-1',
      limite: 0,
      vocaliasAsignadas: 0,
      excedido: false,
      disponible: 0,
    })
    expect(result.mensaje).toContain('no tiene dias de asistencia')
    expect(puedeAsignarseComoVocal({ id: 'doc-1', diasAsistencia: [] }, [], 'first')).toBe(false)
  })
})

