import { describe, expect, it } from 'vitest'
import { buildTeacherExamSourceContext } from './teacherExamSourceContext.js'

const structuredAvailability = [
  {
    docente: 'Ana Diaz',
    teacher_record_id: 'teacher-ana',
    dia: 'Lunes',
    turno: 'NOCHE',
    hora_desde: '18:00',
    hora_hasta: '20:00',
    estado: 'ACTIVE',
  },
  {
    docente: 'Ana Diaz',
    teacher_record_id: 'teacher-ana',
    dia: 'Miercoles',
    turno: 'NOCHE',
    hora_desde: '18:00',
    hora_hasta: '22:00',
    estado: 'ACTIVE',
  },
]

const structuredWorkload = [
  {
    docente: 'Ana Diaz',
    teacher_record_id: 'teacher-ana',
    carrera: 'Profesorado',
    plan: '2024',
    materia_codigo: 'ING1',
    materia_nombre: 'Ingles I',
    anio: '1',
    horasCatedra: 3,
    rol_en_materia: 'TITULAR',
    estado_asignacion: 'ACTIVE',
  },
  {
    docente: 'Ana Diaz',
    teacher_record_id: 'teacher-ana',
    carrera: 'Tecnicatura',
    plan: '2024',
    materia_codigo: 'GES1',
    materia_nombre: 'Gestion I',
    anio: '1',
    horasCatedra: 4,
    rol_en_materia: 'TITULAR',
    estado_asignacion: 'ACTIVE',
  },
]

describe('buildTeacherExamSourceContext', () => {
  it('construye contexto desde fuente estructurada', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: structuredAvailability,
      cargaHorariaDocente: structuredWorkload,
    })

    expect(context).toMatchObject({
      source: 'structured',
      hasStructuredTeacherSource: true,
      hasLegacyTeacherScheduleSource: false,
    })
    expect(context.docentes).toEqual([
      expect.objectContaining({
        id: 'teacher-teacherana',
        nombre: 'Ana Diaz',
        source: 'structured',
        carreras: ['Profesorado', 'Tecnicatura'],
        materias: ['ING1', 'GES1'],
        horasCatedra: 7,
        limiteAfectacion: 4,
      }),
    ])
  })

  it('suma horas de un docente en varias carreras y calcula limite mitad mas uno', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: structuredAvailability,
      cargaHorariaDocente: structuredWorkload,
    })

    expect(context.cargaHorariaPorDocente).toEqual({
      'teacher-teacherana': 7,
    })
    expect(context.cargaHorariaPorDocenteYCarrera).toEqual({
      'teacher-teacherana': {
        Profesorado: 3,
        Tecnicatura: 4,
      },
    })
    expect(context.limiteAfectacionPorDocente).toEqual({
      'teacher-teacherana': 4,
    })
  })

  it('resuelve titularidad por carrera y materia desde cargaHorariaDocente', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: structuredAvailability,
      cargaHorariaDocente: structuredWorkload,
    })

    expect(context.titularidadesPorMateria).toMatchObject({
      'profesorado::ing1': [
        {
          docenteId: 'teacher-teacherana',
          docente: 'Ana Diaz',
          carrera: 'Profesorado',
          plan: '2024',
          materia: 'ING1',
          materiaNombre: 'Ingles I',
          rol: 'TITULAR',
          titularidad: true,
          horasCatedra: 3,
          source: 'structured',
        },
      ],
      'tecnicatura::ges1': [
        expect.objectContaining({
          docenteId: 'teacher-teacherana',
          carrera: 'Tecnicatura',
          materia: 'GES1',
        }),
      ],
    })
  })

  it('construye disponibilidad y dias de asistencia por docente', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: structuredAvailability,
      cargaHorariaDocente: structuredWorkload,
    })

    expect(context.disponibilidadPorDocente).toEqual({
      'teacher-teacherana': [
        expect.objectContaining({
          dia: 'Lunes',
          diaNormalizado: 'lunes',
          turno: 'NOCHE',
          horaDesde: '18:00',
          horaHasta: '20:00',
          disponible: true,
        }),
        expect.objectContaining({
          dia: 'Miercoles',
          diaNormalizado: 'miercoles',
          turno: 'NOCHE',
          horaDesde: '18:00',
          horaHasta: '22:00',
        }),
      ],
    })
    expect(context.diasAsistenciaPorDocente).toEqual({
      'teacher-teacherana': ['lunes', 'miercoles'],
    })
  })

  it('ignora registros inactivos', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: [
        ...structuredAvailability,
        {
          docente: 'Bruno Inactivo',
          dia: 'Viernes',
          hora_desde: '18:00',
          hora_hasta: '20:00',
          estado: 'INACTIVE',
        },
      ],
      cargaHorariaDocente: [
        ...structuredWorkload,
        {
          docente: 'Bruno Inactivo',
          carrera: 'Profesorado',
          materia_codigo: 'HIS1',
          horasCatedra: 3,
          rol_en_materia: 'TITULAR',
          estado_asignacion: 'INACTIVE',
        },
      ],
    })

    expect(context.docentes.map((docente) => docente.nombre)).toEqual(['Ana Diaz'])
    expect(context.titularidadesPorMateria).not.toHaveProperty('profesorado::his1')
  })

  it('incorpora fechas bloqueadas activas sin exponer motivos en diagnostics', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: structuredAvailability,
      cargaHorariaDocente: structuredWorkload,
      fechasBloqueadasDocente: [
        { id: 'block-1', docenteNombre: 'Ana Diaz', date: '2026-07-30', scope: 'FULL_DAY', reason: 'Dato privado', status: 'ACTIVE' },
        { id: 'block-2', docenteNombre: 'Ana Diaz', date: '2026-07-31', scope: 'FULL_DAY', status: 'INACTIVE' },
      ],
    })

    expect(context.blockedDatesByTeacher['teacher-teacherana']).toEqual([
      expect.objectContaining({ id: 'block-1', date: '2026-07-30', scope: 'FULL_DAY' }),
    ])
    expect(context.diagnostics.counts.blockedDates).toBe(1)
    expect(JSON.stringify(context.diagnostics)).not.toContain('Dato privado')
  })

  it('prioriza fuente estructurada sobre legacy', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: structuredAvailability,
      cargaHorariaDocente: structuredWorkload,
      horariosDocentes: [{
        profesor: 'Docente Legacy',
        carrera: 'Profesorado',
        materia: 'ING1',
        dia: 'Martes',
        inicio: '18:00',
        fin: '20:00',
      }],
    })

    expect(context.source).toBe('structured')
    expect(context.docentes.map((docente) => docente.nombre)).toEqual(['Ana Diaz'])
    expect(JSON.stringify(context)).not.toContain('Docente Legacy')
    expect(context.hasLegacyTeacherScheduleSource).toBe(true)
  })

  it('usa legacy si no hay fuente estructurada valida', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: [],
      cargaHorariaDocente: [],
      horariosDocentes: [{
        profesor: 'Docente Legacy',
        carrera: 'Profesorado',
        materia: 'ING1',
        dia: 'Martes',
        turno: 'NOCHE',
        inicio: '18:00',
        fin: '20:00',
      }],
    })

    expect(context).toMatchObject({
      source: 'legacy',
      hasStructuredTeacherSource: false,
      hasLegacyTeacherScheduleSource: true,
    })
    expect(context.docentes).toEqual([
      expect.objectContaining({
        id: 'teacher-docentelegacy',
        nombre: 'Docente Legacy',
        horasCatedra: 3,
        limiteAfectacion: 2,
      }),
    ])
    expect(context.disponibilidadPorDocente['teacher-docentelegacy'][0]).toMatchObject({
      dia: 'Martes',
      turno: 'NOCHE',
      horaDesde: '18:00',
      horaHasta: '20:00',
      source: 'legacy',
    })
  })

  it('devuelve warnings claros si faltan datos', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: [{ docente: 'Ana Diaz', hora_desde: '18:00', hora_hasta: '20:00' }],
      cargaHorariaDocente: [{ docente: 'Ana Diaz', materia_codigo: 'ING1', horasCatedra: '' }],
      horariosDocentes: [],
    })

    expect(context.source).toBe('missing')
    expect(context.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_TEACHER_SOURCE' }),
      expect.objectContaining({
        code: 'INCOMPLETE_TEACHER_AVAILABILITY',
        missing: ['dia'],
      }),
      expect.objectContaining({
        code: 'INCOMPLETE_TEACHER_WORKLOAD',
        missing: expect.arrayContaining(['carrera', 'horas_catedra']),
      }),
    ]))
    expect(context.diagnostics.counts).toMatchObject({
      docentes: 0,
      warnings: 3,
    })
  })

  it('no expone payload sensible en diagnostics', () => {
    const context = buildTeacherExamSourceContext({
      disponibilidadDocente: [{
        docente: 'Persona Sensible',
        email: 'secreto@example.edu',
        dia: 'Lunes',
        hora_desde: '18:00',
        hora_hasta: '20:00',
      }],
      cargaHorariaDocente: [{
        docente: 'Persona Sensible',
        email: 'secreto@example.edu',
        carrera: 'Profesorado',
        materia_codigo: 'SEC1',
        horasCatedra: 2,
        rol_en_materia: 'TITULAR',
      }],
    })

    const diagnostics = JSON.stringify(context.diagnostics)

    expect(diagnostics).not.toContain('Persona Sensible')
    expect(diagnostics).not.toContain('secreto@example.edu')
    expect(diagnostics).not.toContain('SEC1')
  })
})
