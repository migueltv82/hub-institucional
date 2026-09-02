import { describe, expect, it } from 'vitest'
import {
  buildCargaHorariaDocenteFromHorarios,
  buildTeacherAcademicAlerts,
  buildTeacherAcademicSummary,
  buildLegacyScheduleRowsFromStructuredTeacherSource,
  validateAvailabilityDraft,
  validateLoadDraft,
} from './teacherAcademicAdmin.js'

describe('teacherAcademicAdmin', () => {
  it('valida disponibilidad docente minima', () => {
    expect(validateAvailabilityDraft({ docente: 'Ana', hora_desde: '18:00', hora_hasta: '20:00' })).toMatchObject({
      ok: false,
      error: 'La disponibilidad debe tener dia.',
    })
    expect(validateAvailabilityDraft({ docente: 'Ana', dia: 'Lunes' })).toMatchObject({
      ok: false,
      error: 'La disponibilidad debe tener franja horaria desde y hasta.',
    })
    expect(validateAvailabilityDraft({
      docente: 'Ana',
      dia: 'Lunes',
      turno: 'noche',
      hora_desde: '18:00',
      hora_hasta: '20:00',
    })).toMatchObject({
      ok: true,
      value: {
        docente: 'Ana',
        dia: 'Lunes',
        turno: 'NOCHE',
      },
    })
  })

  it('valida carga horaria docente minima', () => {
    expect(validateLoadDraft({ docente: 'Ana', materia_codigo: 'ING1', horasCatedra: 2 })).toMatchObject({
      ok: false,
      error: 'La asignacion debe tener carrera.',
    })
    expect(validateLoadDraft({ docente: 'Ana', carrera: 'Profesorado', horasCatedra: 2 })).toMatchObject({
      ok: false,
      error: 'La asignacion debe tener materia.',
    })
    expect(validateLoadDraft({ docente: 'Ana', carrera: 'Profesorado', materia_codigo: 'ING1', horasCatedra: -1 })).toMatchObject({
      ok: false,
      error: 'La carga horaria debe ser mayor a cero.',
    })
    expect(validateLoadDraft({
      docente: 'Ana',
      carrera: 'Profesorado',
      materia_codigo: 'ING1',
      horasCatedra: '3,5',
    })).toMatchObject({
      ok: true,
      value: {
        docente: 'Ana',
        carrera: 'Profesorado',
        materia_codigo: 'ING1',
        horasCatedra: 3.5,
      },
    })
  })

  it('resume horas, carreras, materias, disponibilidad y alertas por docente', () => {
    const summaries = buildTeacherAcademicSummary({
      teachers: [{ nombre: 'Ana Diaz', dni: '123' }],
      cargaHorariaDocente: [
        { docente: 'Ana Diaz', dni_docente: '123', carrera: 'Profesorado', materia_codigo: 'ING1', materia_nombre: 'Ingles I', horasCatedra: 3 },
        { docente: 'Ana Diaz', dni_docente: '123', carrera: 'Tecnicatura', materia_codigo: 'GES1', materia_nombre: 'Gestion I', horasCatedra: 4 },
        { docente: 'Bruno', carrera: 'Profesorado', materia_codigo: 'HIS1', horasCatedra: 2 },
      ],
      disponibilidadDocente: [
        { docente: 'Ana Diaz', dni_docente: '123', dia: 'Lunes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
        { docente: 'Carla', dia: 'Martes', turno: 'NOCHE', hora_desde: '18:00', hora_hasta: '20:00' },
      ],
    })

    expect(summaries.find((summary) => summary.docente === 'Ana Diaz')).toMatchObject({
      totalHoras: 7,
      horasPorCarrera: {
        Profesorado: 3,
        Tecnicatura: 4,
      },
      materias: ['Ingles I', 'Gestion I'],
      alertas: [],
    })
    expect(summaries.find((summary) => summary.docente === 'Bruno').alertas).toEqual([
      'Tiene carga horaria sin disponibilidad.',
    ])
    expect(summaries.find((summary) => summary.docente === 'Carla').alertas).toEqual([
      'Tiene disponibilidad sin materias asignadas.',
    ])
  })

  it('resume datos academicos desde docentes y docente_materia de plantilla v2', () => {
    const summaries = buildTeacherAcademicSummary({
      teachers: [{
        docente_id: 'doc-1',
        apellido: 'Aguero',
        nombre: 'Susana',
        dni_docente: '18203460',
        horas_catedra: '8',
        especialidad: 'Quimica',
        familias_idoneidad: 'LABORATORIO',
        idoneidad_academica_explicita: 'SI',
        turnos_disponibles: 'NOCHE',
      }],
      docenteMateria: [{
        docente_id: 'doc-1',
        docente: 'Aguero Susana',
        carrera: 'Tecnicatura Superior en Laboratorio',
        materia_codigo: 'LAB24-QUIM1',
        materia_nombre: 'Quimica General',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
      }],
    })

    expect(summaries).toEqual([
      expect.objectContaining({
        docente: 'Aguero Susana',
        totalHoras: 8,
        carreras: ['Tecnicatura Superior en Laboratorio'],
        materias: ['Quimica General'],
        especialidad: 'Quimica',
        familiasIdoneidad: 'LABORATORIO',
        idoneidadAcademica: 'SI',
        turnosDisponibles: 'NOCHE',
        materiasDetalle: [
          expect.objectContaining({
            carrera: 'Tecnicatura Superior en Laboratorio',
            materia: 'Quimica General',
            rol: 'TITULAR',
          }),
        ],
      }),
    ])
  })

  it('desglosa horas por carrera cuando docente_materia trae horas por fila', () => {
    const summaries = buildTeacherAcademicSummary({
      teachers: [{ docente_id: 'doc-1', apellido: 'Aguero', nombre: 'Susana' }],
      docenteMateria: [
        {
          docente_id: 'doc-1',
          docente: 'Aguero Susana',
          carrera: 'Laboratorio',
          materia_nombre: 'Quimica General',
          horas_catedra: '4',
        },
        {
          docente_id: 'doc-1',
          docente: 'Aguero Susana',
          carrera: 'Profesorado de Quimica',
          materia_nombre: 'Didactica de la Quimica',
          horas_catedra: '3',
        },
      ],
    })

    expect(summaries[0]).toMatchObject({
      totalHoras: 7,
      horasPorCarrera: {
        Laboratorio: 4,
        'Profesorado de Quimica': 3,
      },
      materiasDetalle: [
        expect.objectContaining({ materia: 'Quimica General', rol: '' }),
        expect.objectContaining({ materia: 'Didactica de la Quimica', rol: '' }),
      ],
    })
  })

  it('no muestra como titular una fila docente_materia inferida desde horarios', () => {
    const summaries = buildTeacherAcademicSummary({
      teachers: [{ docente_id: 'doc-barrionuevo', apellido: 'Barrionuevo', nombre: 'Myriam' }],
      docenteMateria: [{
        docente_id: 'doc-barrionuevo',
        docente: 'BARRIONUEVO MYRIAM',
        carrera: 'PROFESORADO DE INGLES',
        materia_codigo: 'ING32',
        materia_nombre: 'EDUCACION SEXUAL INTEGRAL (ESI)',
        rol_en_materia: 'TITULAR',
        estado_asignacion: 'ACTIVO',
        observaciones: 'Titular inferido por unico docente en horarios.',
      }],
    })

    expect(summaries[0]).toMatchObject({
      docente: 'Barrionuevo Myriam',
      carreras: ['PROFESORADO DE INGLES'],
      materiasDetalle: [
        expect.objectContaining({
          materia: 'EDUCACION SEXUAL INTEGRAL (ESI)',
          rol: '',
          source: 'horarios_docentes',
        }),
      ],
    })
  })

  it('calcula horas catedra desde horarios docentes usando modulos de 40 minutos', () => {
    const summaries = buildTeacherAcademicSummary({
      teachers: [{ docente_id: 'doc-1', apellido: 'Aguero', nombre: 'Susana' }],
      horariosDocentes: [
        {
          docente_id: 'doc-1',
          profesor: 'Aguero Susana',
          carrera: 'Laboratorio',
          materia_nombre: 'Quimica General',
          inicio: '18:00',
          fin: '20:00',
        },
        {
          docente_id: 'doc-1',
          profesor: 'Aguero Susana',
          carrera: 'Profesorado de Quimica',
          materia_nombre: 'Didactica de la Quimica',
          inicio: '20:00',
          fin: '22:00',
        },
      ],
    })

    expect(summaries[0]).toMatchObject({
      totalHoras: 6,
      horasPorCarrera: {
        Laboratorio: 3,
        'Profesorado de Quimica': 3,
      },
      carreras: ['Laboratorio', 'Profesorado de Quimica'],
    })
  })

  it('redondea horarios a bloques catedra y no duplica el mismo bloque con distinto codigo interno', () => {
    const summaries = buildTeacherAcademicSummary({
      teachers: [{ docente_id: 'doc-1', apellido: 'Rusconi', nombre: 'Paula' }],
      horariosDocentes: [
        {
          docente_id: 'doc-1',
          profesor: 'Rusconi Paula',
          carrera: 'Tecnico Superior en Laboratorio',
          materia_codigo: 'LAB15-INFO',
          materia_nombre: 'Informatica',
          dia: 'MIERCOLES',
          inicio: '19:40',
          fin: '21:10',
        },
        {
          docente_id: 'doc-1',
          profesor: 'Rusconi Paula',
          carrera: 'Tecnico Superior en Laboratorio',
          materia_codigo: 'LAB24-INFO',
          materia_nombre: 'Informatica',
          dia: 'MIERCOLES',
          inicio: '19:40',
          fin: '21:10',
        },
      ],
    })

    expect(summaries[0]).toMatchObject({
      totalHoras: 2,
      horasPorCarrera: {
        'Tecnico Superior en Laboratorio': 2,
      },
      materias: ['Informatica'],
    })
    expect(summaries[0].materiasDetalle).toEqual([
      expect.objectContaining({
        materia: 'Informatica',
        rol: '',
        source: 'horarios_docentes',
      }),
    ])
  })

  it('no muestra titularidad cuando la carga horaria fue generada desde horarios', () => {
    const summaries = buildTeacherAcademicSummary({
      teachers: [{ dni_docente: '30071977', apellido: 'Alvarez', nombre: 'Pablo' }],
      cargaHorariaDocente: [{
        docente: 'ALVAREZ PABLO',
        dni_docente: '30071977',
        carrera: 'PROFESORADO DE QUIMICA',
        materia_codigo: 'QUI01',
        materia_nombre: 'FISICA I',
        horasCatedra: 4,
        rol_en_materia: 'TITULAR',
        source: 'horarios_docentes',
        observaciones: 'Generado desde horarios docentes.',
      }],
    })

    expect(summaries[0]).toMatchObject({
      totalHoras: 4,
      materiasDetalle: [
        expect.objectContaining({
          materia: 'FISICA I',
          rol: '',
          source: 'horarios_docentes',
        }),
      ],
    })
  })

  it('usa horarios docentes aunque docente_materia y horario tengan identificadores distintos', () => {
    const summaries = buildTeacherAcademicSummary({
      teachers: [{
        docente_id: 'doc-1',
        apellido: 'Aguero',
        nombre: 'Susana',
        dni_docente: '18203460',
      }],
      docenteMateria: [{
        docente_id: 'doc-1',
        docente: 'Aguero Susana',
        carrera: 'Laboratorio',
        materia_codigo: 'LAB05',
        materia_nombre: 'Quimica',
        rol_en_materia: 'TITULAR',
      }],
      horariosDocentes: [{
        profesor: 'Aguero Susana',
        carrera: 'Laboratorio',
        materia_codigo: 'LAB05',
        materia_nombre: 'Quimica',
        inicio: '18:20',
        fin: '19:40',
      }],
    })

    expect(summaries).toEqual([
      expect.objectContaining({
        key: 'doc-1',
        docente: 'Aguero Susana',
        totalHoras: 2,
        materias: ['Quimica'],
      }),
    ])
    expect(summaries[0].alertas).not.toContain('Tiene materias asignadas sin horas declaradas.')
  })

  it('respeta horas declaradas cuando tambien hay horarios docentes', () => {
    const summaries = buildTeacherAcademicSummary({
      teachers: [{ docente_id: 'doc-1', apellido: 'Aguero', nombre: 'Susana', horas_catedra: '8' }],
      horariosDocentes: [
        {
          docente_id: 'doc-1',
          profesor: 'Aguero Susana',
          carrera: 'Laboratorio',
          materia_nombre: 'Quimica General',
          inicio: '18:00',
          fin: '20:00',
        },
        {
          docente_id: 'doc-1',
          profesor: 'Aguero Susana',
          carrera: 'Profesorado de Quimica',
          materia_nombre: 'Didactica de la Quimica',
          inicio: '20:00',
          fin: '23:00',
        },
      ],
    })

    expect(summaries[0]).toMatchObject({
      totalHoras: 8,
      horasPorCarrera: {},
      carreras: ['Laboratorio', 'Profesorado de Quimica'],
    })
  })

  it('genera alertas de auditoria de filas incompletas', () => {
    const summaries = buildTeacherAcademicSummary({
      cargaHorariaDocente: [{ docente: 'Ana', carrera: 'Profesorado', materia_codigo: 'ING1', horasCatedra: 2 }],
      disponibilidadDocente: [{ docente: 'Bruno', dia: 'Lunes', hora_desde: '18:00', hora_hasta: '20:00' }],
    })

    expect(buildTeacherAcademicAlerts({
      cargaHorariaDocente: [
        { docente: 'Sin Carrera', materia_codigo: 'ING1', horasCatedra: 2 },
        { docente: 'Sin Materia', carrera: 'Profesorado', horasCatedra: 2 },
        { docente: 'Sin Horas', carrera: 'Profesorado', materia_codigo: 'ING1', horasCatedra: '' },
      ],
      docenteMateria: [
        { docente: 'Sin Rol', carrera: 'Profesorado', materia_codigo: 'ING1' },
      ],
      disponibilidadDocente: [
        { docente: 'Sin Dia', hora_desde: '18:00', hora_hasta: '20:00' },
        { docente: 'Sin Franja', dia: 'Lunes', hora_desde: '18:00' },
      ],
      summaries,
    })).toEqual(expect.arrayContaining([
      'Carga horaria de Sin Carrera sin carrera.',
      'Carga horaria de Sin Materia sin materia.',
      'Carga horaria de Sin Horas sin horas validas.',
      'Disponibilidad de Sin Dia sin dia.',
      'Disponibilidad de Sin Franja sin franja horaria completa.',
      'Ana: Tiene carga horaria sin disponibilidad.',
      'Bruno: Tiene disponibilidad sin materias asignadas.',
    ]))
    expect(buildTeacherAcademicAlerts({
      docenteMateria: [
        { docente: 'Sin Rol', carrera: 'Profesorado', materia_codigo: 'ING1' },
      ],
    })).not.toContain('Relacion docente-materia de Sin Rol sin rol.')
  })

  it('construye filas compatibles con horarios desde disponibilidad y carga estructurada', () => {
    expect(buildLegacyScheduleRowsFromStructuredTeacherSource({
      cargaHorariaDocente: [{
        id: 'load-1',
        docente: 'Ana',
        carrera: 'Profesorado',
        materia_codigo: 'ING1',
        materia_nombre: 'Ingles I',
        horasCatedra: 3,
        rol_en_materia: 'TITULAR',
      }],
      disponibilidadDocente: [{
        id: 'disp-1',
        docente: 'Ana',
        dia: 'Lunes',
        turno: 'NOCHE',
        hora_desde: '18:00',
        hora_hasta: '20:00',
      }],
    })).toEqual([
      expect.objectContaining({
        profesor: 'Ana',
        carrera: 'Profesorado',
        materia: 'ING1',
        nombreMateria: 'Ingles I',
        horasCatedra: 3,
        dia: 'Lunes',
        turno: 'NOCHE',
        inicio: '18:00',
        fin: '20:00',
        source: 'structured_teacher_source',
      }),
    ])
  })

  it('genera carga horaria agrupada desde horarios docentes en horas catedra', () => {
    const result = buildCargaHorariaDocenteFromHorarios({
      horariosDocentes: [
        {
          profesor: 'Aguero Susana',
          dni: '18203460',
          carrera: 'Laboratorio',
          materia_codigo: 'LAB05',
          materia_nombre: 'Quimica',
          anio: '1',
          inicio: '18:20',
          fin: '19:40',
        },
        {
          profesor: 'Aguero Susana',
          dni: '18203460',
          carrera: 'Laboratorio',
          materia_codigo: 'LAB05',
          materia_nombre: 'Quimica',
          anio: '1',
          inicio: '19:40',
          fin: '21:00',
        },
        {
          profesor: 'Baca Carolina',
          carrera: 'Laboratorio',
          materia_codigo: 'LAB06',
          materia_nombre: 'Biologia',
          inicio: '18:20',
          fin: '19:00',
        },
      ],
    })

    expect(result.generated).toBe(2)
    expect(result.rows).toEqual([
      expect.objectContaining({
        docente: 'Aguero Susana',
        carrera: 'Laboratorio',
        materia_codigo: 'LAB05',
        materia_nombre: 'Quimica',
        anio: '1',
        horasCatedra: 4,
        rol_en_materia: '',
        estado_asignacion: 'ACTIVO',
        titularidad: false,
        es_titular: false,
      }),
      expect.objectContaining({
        docente: 'Baca Carolina',
        materia_codigo: 'LAB06',
        horasCatedra: 1,
      }),
    ])
  })

  it('actualiza cargas generadas y preserva filas manuales sin horario', () => {
    const result = buildCargaHorariaDocenteFromHorarios({
      cargaHorariaDocente: [
        {
          id: 'existing-load',
          docente: 'Aguero Susana',
          carrera: 'Laboratorio',
          materia_codigo: 'LAB05',
          materia_nombre: 'Quimica',
          horasCatedra: 3,
          observaciones: 'Manual revisado',
        },
        {
          id: 'manual-only',
          docente: 'Docente Manual',
          carrera: 'Turismo',
          materia_codigo: 'TUR01',
          materia_nombre: 'Turismo I',
          horasCatedra: 2,
        },
      ],
      horariosDocentes: [{
        profesor: 'Aguero Susana',
        carrera: 'Laboratorio',
        materia_codigo: 'LAB05',
        materia_nombre: 'Quimica',
        inicio: '18:20',
        fin: '19:40',
      }],
    })

    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'existing-load',
        horasCatedra: 2,
        observaciones: 'Manual revisado',
      }),
      expect.objectContaining({
        id: 'manual-only',
        horasCatedra: 2,
      }),
    ]))
  })
})
