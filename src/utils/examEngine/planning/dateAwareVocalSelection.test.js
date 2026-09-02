import { describe, expect, it } from 'vitest'
import {
  ASSIGNMENT_STRATEGIES,
  buildTeacherSlotKey,
  resolveAssignmentStrategy,
  selectDateAwareVocales,
} from './dateAwareVocalSelection.js'

const mesa = {
  id: 'mesa-1',
  materiaId: 'MAT-1',
  materia: 'Materia Uno',
  carreraId: 'CAR-1',
  carrera: 'Carrera Uno',
  llamado: 'PRIMER_LLAMADO',
  titularId: 'doc-titular',
  turno: 'NOCHE',
}

const fechaLunes = {
  fecha: '2026-07-27',
  diaSemana: 'LUNES',
  turno: 'NOCHE',
  llamado: 'PRIMER_LLAMADO',
}

function docente(overrides = {}) {
  return {
    id: 'doc-vocal',
    nombre: 'Nombre Personal Vocal',
    dia: 'LUNES',
    turnosDisponibles: ['NOCHE'],
    horasCatedra: 6,
    halfPlusOneRuleMode: 'TEACHING_HOURS_HALF_PLUS_ONE',
    activo: true,
    ...overrides,
  }
}

function candidate(docenteId = 'doc-vocal', overrides = {}) {
  return {
    docenteId,
    valido: true,
    puntajeAfinidad: 100,
    rechazos: [],
    metadata: {
      vocaliasAsignadas: 0,
      disponibilidadDias: 1,
    },
    ...overrides,
  }
}

describe('dateAwareVocalSelection', () => {
  it('no asigna docente que no asiste ese dia', () => {
    const result = selectDateAwareVocales({
      mesa,
      fechaCandidata: fechaLunes,
      docentes: [
        docente({ id: 'doc-ausente', dia: 'MARTES' }),
        docente({ id: 'doc-presente-1' }),
      ],
      candidatosVocales: [
        candidate('doc-ausente'),
        candidate('doc-presente-1'),
      ],
    })

    expect(result.canConfirmTribunal).toBe(false)
    expect(result.rejectedByReason.NO_ASISTE_EN_FECHA).toBe(1)
    expect(result.selected).toHaveLength(1)
  })

  it('reconoce diasAsistencia adaptados como asistencia valida', () => {
    const result = selectDateAwareVocales({
      mesa,
      fechaCandidata: fechaLunes,
      docentes: [
        docente({ id: 'doc-vocal-1', dia: undefined, diasAsistencia: ['lunes'] }),
        docente({ id: 'doc-vocal-2', dia: undefined, diasAsistencia: ['lunes'] }),
      ],
      candidatosVocales: [
        candidate('doc-vocal-1'),
        candidate('doc-vocal-2'),
      ],
    })

    expect(result.canConfirmTribunal).toBe(true)
    expect(result.selected.map((entry) => entry.docenteId)).toEqual(['doc-vocal-1', 'doc-vocal-2'])
  })

  it('respeta cupo por horas catedra', () => {
    const participaciones = [
      { docenteId: 'doc-vocal', mesaId: 'm1', rol: 'VOCAL_1', llamado: 'PRIMER_LLAMADO' },
      { docenteId: 'doc-vocal', mesaId: 'm2', rol: 'VOCAL_2', llamado: 'PRIMER_LLAMADO' },
    ]
    const result = selectDateAwareVocales({
      mesa,
      fechaCandidata: fechaLunes,
      docentes: [docente({ horasCatedra: 2 })],
      candidatosVocales: [candidate()],
      participaciones,
    })

    expect(result.canConfirmTribunal).toBe(false)
    expect(result.rejectedByReason.SUPERA_CUPO_HORAS_CATEDRA).toBe(1)
  })

  it('evita superposicion docente en la misma fecha y turno', () => {
    const teacherSchedule = new Set([
      buildTeacherSlotKey('doc-vocal', '2026-07-27', 'NOCHE'),
    ])
    const result = selectDateAwareVocales({
      mesa,
      fechaCandidata: fechaLunes,
      docentes: [docente()],
      candidatosVocales: [candidate()],
      teacherSchedule,
    })

    expect(result.canConfirmTribunal).toBe(false)
    expect(result.rejectedByReason.DOCENTE_SUPERPUESTO).toBe(1)
  })

  it('no confirma tribunal si falta segundo vocal valido', () => {
    const result = selectDateAwareVocales({
      mesa,
      fechaCandidata: fechaLunes,
      docentes: [docente({ id: 'doc-vocal-1' })],
      candidatosVocales: [candidate('doc-vocal-1')],
    })

    expect(result.canConfirmTribunal).toBe(false)
    expect(result.selected).toHaveLength(1)
    expect(result.decisionReasons).toContain('SIN_DOS_VOCALES_VALIDOS_EN_FECHA')
  })

  it('mantiene CURRENT como default del flag experimental', () => {
    expect(resolveAssignmentStrategy()).toBe(ASSIGNMENT_STRATEGIES.CURRENT)
    expect(resolveAssignmentStrategy('DATE_AWARE_VOCALS')).toBe(ASSIGNMENT_STRATEGIES.DATE_AWARE_VOCALS)
  })

  it('no muta entradas ni expone nombres personales en la decision', () => {
    const input = {
      mesa: { ...mesa },
      fechaCandidata: { ...fechaLunes },
      docentes: [
        docente({ id: 'doc-vocal-1', nombre: 'Nombre Personal Uno' }),
        docente({ id: 'doc-vocal-2', nombre: 'Nombre Personal Dos' }),
      ],
      candidatosVocales: [
        candidate('doc-vocal-1'),
        candidate('doc-vocal-2'),
      ],
    }
    const original = structuredClone(input)
    const result = selectDateAwareVocales(input)
    const serialized = JSON.stringify(result)

    expect(input).toEqual(original)
    expect(result.canConfirmTribunal).toBe(true)
    expect(serialized).not.toContain('Nombre Personal Uno')
    expect(serialized).not.toContain('Nombre Personal Dos')
  })
})
