import { describe, expect, it } from 'vitest'
import {
  buildTurnDiagnostics,
  createBestAvailabilityDatesInput,
  createTurnInferredInput,
  inferTurnoFromTime,
  summarizeMissingDateNeeds,
} from './dateAndTurnNeedsDiagnosis.js'

describe('dateAndTurnNeedsDiagnosis', () => {
  it('infiere turno desde hora de inicio', () => {
    expect(inferTurnoFromTime('08:30')).toBe('MANANA')
    expect(inferTurnoFromTime('15:00')).toBe('TARDE')
    expect(inferTurnoFromTime('18:00')).toBe('NOCHE')
    expect(inferTurnoFromTime('sin hora')).toBe('')
  })

  it('agrega fechas en dias de mayor disponibilidad sin mutar el input', () => {
    const input = {
      fechasDisponibles: [
        { fecha: '2026-07-27', diaSemana: 'LUNES', llamado: 'PRIMER_LLAMADO', turno: 'NOCHE' },
        { fecha: '2026-08-03', diaSemana: 'LUNES', llamado: 'SEGUNDO_LLAMADO', turno: 'NOCHE' },
      ],
      config: { fechaFin: '2026-08-03', cantidadLlamados: 2 },
    }

    const next = createBestAvailabilityDatesInput(input, {
      days: ['miercoles'],
      extraDatesPerCall: 1,
    })

    expect(next.fechasDisponibles).toHaveLength(4)
    expect(next.fechasDisponibles).toEqual(expect.arrayContaining([
      expect.objectContaining({ fecha: '2026-07-29', diaSemana: 'MIERCOLES' }),
      expect.objectContaining({ fecha: '2026-08-05', diaSemana: 'MIERCOLES' }),
    ]))
    expect(input.fechasDisponibles).toHaveLength(2)
  })

  it('simula turnos inferidos desde horariosDocentes sin duplicar ni mutar', () => {
    const input = {
      docentes: [
        {
          id: 'doc-falso-1',
          nombre: 'Persona Falsa Uno',
          diasAsistencia: ['lunes'],
          turnosDisponibles: [],
          availability: [{ dia: 'lunes', inicio: '15:00', fin: '17:00', turno: '' }],
        },
      ],
      materias: [
        {
          id: 'mat-1',
          carrera: 'Carrera A',
          materia: 'Materia A',
          nombreMateria: 'Materia A',
          titularId: 'doc-falso-1',
          requiereMesa: true,
          turno: '',
        },
      ],
      fechasDisponibles: [
        { fecha: '2026-07-27', diaSemana: 'LUNES', llamado: 'PRIMER_LLAMADO', turno: 'NOCHE' },
      ],
      metadata: {
        teacherNameToId: {
          'persona falsa uno': 'doc-falso-1',
        },
      },
    }
    const snapshot = {
      horariosDocentes: [
        {
          profesor: 'Persona Falsa Uno',
          carrera: 'Carrera A',
          materia: 'Materia A',
          dia: 'Lunes',
          inicio: '15:00',
          fin: '17:00',
        },
      ],
    }

    const next = createTurnInferredInput(input, snapshot)

    expect(next.docentes[0].turnosDisponibles).toContain('TARDE')
    expect(next.docentes[0].availability[0]).toMatchObject({ turno: 'TARDE', shift: 'TARDE' })
    expect(next.materias[0].turno).toBe('TARDE')
    expect(next.fechasDisponibles.map((slot) => slot.turno).sort()).toEqual(['NOCHE', 'TARDE'])
    expect(input.docentes[0].turnosDisponibles).toEqual([])
  })

  it('resume turnos faltantes e inferibles desde inicio/fin', () => {
    const diagnostics = buildTurnDiagnostics({
      horariosDocentes: [
        { dia: 'Lunes', inicio: '18:00', fin: '20:00' },
        { dia: 'Martes', turno: 'TARDE', inicio: '15:00', fin: '17:00' },
      ],
    }, {
      docentes: [
        { id: 'doc-1', turnosDisponibles: [], availability: [{ dia: 'lunes' }] },
      ],
    })

    expect(diagnostics.horariosDocentes).toMatchObject({
      total: 2,
      conTurnoExplicito: 1,
      sinTurnoExplicito: 1,
      sinTurnoPeroInicioFinValidos: 1,
      inferiblesDesdeInicio: 1,
    })
    expect(diagnostics.horariosDocentes.turnosInferidosDesdeInicio).toEqual([
      { key: 'NOCHE', count: 1 },
    ])
  })

  it('agrupa mesas sin fecha sin exponer docentes', () => {
    const summary = summarizeMissingDateNeeds({
      input: {
        docentes: [
          { id: 'doc-sensible', diasAsistencia: ['martes'] },
        ],
      },
      unassignedMesas: [
        {
          id: 'mesa-1',
          carrera: 'Carrera A',
          materia: 'Materia A',
          llamado: 'PRIMER_LLAMADO',
          anio: 2,
          titularId: 'doc-sensible',
          reason: 'TITULAR_NO_DISPONIBLE',
          errors: [{ code: 'TITULAR_NO_DISPONIBLE', docenteId: 'doc-sensible' }],
        },
      ],
    })

    expect(summary.total).toBe(1)
    expect(summary.porDiaDisponibilidadTitular).toEqual([{ key: 'martes', count: 1 }])
    expect(JSON.stringify(summary)).not.toContain('doc-sensible')
  })
})
