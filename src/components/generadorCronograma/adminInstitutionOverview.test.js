import { describe, expect, it } from 'vitest'
import {
  buildAdminInstitutionOverview,
  buildInstitutionScheduleGrid,
  buildInstitutionScheduleRows,
  buildInstitutionScheduleTimetableGroups,
} from './adminInstitutionOverview.js'

describe('adminInstitutionOverview', () => {
  it('resume alumnos, docentes y materias por carrera', () => {
    const overview = buildAdminInstitutionOverview({
      careerOptions: ['Traductorado de Ingles', 'Profesorado de Portugues'],
      planesEstudio: [
        { carrera_id: 'ing', carrera: 'Traductorado de Ingles', materia_codigo: 'ING-1' },
        { carrera_id: 'ing', carrera: 'Traductorado de Ingles', materia_codigo: 'ING-2' },
        { carrera_id: 'por', carrera: 'Profesorado de Portugues', materia_codigo: 'POR-1' },
      ],
      alumnos: [
        { id: 'student-1', carrera: 'Traductorado de Ingles' },
        { id: 'student-2', carrera: 'Traductorado de Ingles' },
        { id: 'student-3', carrera_id: 'por' },
        { id: 'student-4' },
      ],
      docentes: [
        { dni: '11', full_name: 'Ana Diaz', carreras: ['Traductorado de Ingles'] },
        { dni: '22', full_name: 'Bruno Paz', carrera: 'Profesorado de Portugues' },
      ],
      horariosDocentes: [
        { dni: '11', profesor: 'Ana Diaz', carrera: 'Traductorado de Ingles' },
        { profesor: 'Carla Ruiz', carrera: 'Profesorado de Portugues' },
      ],
      cargaHorariaDocente: [
        { docente: 'Diego Soto', carrera: 'Traductorado de Ingles', materia: 'ING-2' },
      ],
    })

    expect(overview.totals).toMatchObject({
      careers: 2,
      students: 4,
      teachers: 2,
      subjects: 3,
      schedules: 2,
    })
    expect(overview.careerRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        career: 'Traductorado de Ingles',
        studentCount: 2,
        teacherCount: 1,
        subjectCount: 2,
      }),
      expect.objectContaining({
        career: 'Profesorado de Portugues',
        studentCount: 1,
        teacherCount: 1,
        subjectCount: 1,
      }),
    ]))
    expect(overview.careerRows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ career: 'Sin carrera' }),
    ]))
    expect(overview.quality).toMatchObject({
      studentsWithoutCareer: 1,
      teachersWithoutCareer: 0,
    })
  })

  it('no duplica docentes cuando coinciden padron y horarios', () => {
    const overview = buildAdminInstitutionOverview({
      careerOptions: ['Tecnicatura Superior'],
      docentes: [
        { dni: '123', full_name: 'Maria Silva', carrera: 'Tecnicatura Superior' },
      ],
      horariosDocentes: [
        { dni: '123', profesor: 'Maria Silva', carrera: 'Tecnicatura Superior' },
        { profesor: 'Maria Silva', carrera: 'Tecnicatura Superior' },
      ],
      teacherDirectory: [
        { dni: '123', nombre: 'Maria Silva', carreras: ['Tecnicatura Superior'] },
      ],
    })

    expect(overview.totals.teachers).toBe(1)
    expect(overview.careerRows[0]).toMatchObject({
      career: 'Tecnicatura Superior',
      teacherCount: 1,
    })
  })

  it('no suma como docentes nuevos las filas academicas que no coinciden con el padron', () => {
    const overview = buildAdminInstitutionOverview({
      docentes: [
        { dni: '11', full_name: 'Ana Diaz', carrera: 'Profesorado de Ingles' },
        { dni: '22', full_name: 'Bruno Paz', carrera: 'Profesorado de Ingles' },
      ],
      horariosDocentes: [
        { profesor: 'Ana Diaz', carrera: 'Profesorado de Ingles', materia: 'ING-1' },
        { profesor: 'Ana D.', carrera: 'Profesorado de Ingles', materia: 'ING-2' },
        { profesor: 'Bruno Paz', carrera: 'Profesorado de Ingles', materia: 'ING-3' },
        { profesor: 'Fila historica sin perfil', carrera: 'Profesorado de Ingles', materia: 'ING-4' },
      ],
      cargaHorariaDocente: [
        { docente: 'Otra variante sin perfil', carrera: 'Profesorado de Ingles', materia: 'ING-5' },
      ],
    })

    expect(overview.totals.teachers).toBe(2)
    expect(overview.careerRows[0]).toMatchObject({
      career: 'Profesorado de Ingles',
      teacherCount: 2,
    })
  })

  it('descarta etiquetas auxiliares de validacion como carreras', () => {
    const overview = buildAdminInstitutionOverview({
      careerOptions: ['Traductorado de Ingles', 'Validacion Carrera'],
      planesEstudio: [
        { carrera: 'Traductorado de Ingles', materia_codigo: 'ING-1' },
        { carrera: 'Validacion Carrera', materia_codigo: 'AUX' },
      ],
      teacherDirectory: [
        { dni: '88', nombre: 'Fila Auxiliar', carreras: ['Validacion Carrera'] },
      ],
    })

    expect(overview.careerRows).toEqual([
      expect.objectContaining({
        career: 'Traductorado de Ingles',
        subjectCount: 1,
      }),
    ])
    expect(overview.quality.teachersWithoutCareer).toBe(1)
    expect(overview.totals.careers).toBe(1)
    expect(overview.totals.subjects).toBe(1)
  })

  it('normaliza codigos de carrera contra el plan para no duplicar distribucion ni horarios', () => {
    const planesEstudio = [
      {
        carrera_id: 'ING',
        carrera_nombre: 'PROFESORADO DE INGLES',
        materia_id: 'ing-1',
        materia_codigo: 'ING1',
        materia_nombre: 'Lengua Inglesa I',
        anio: 1,
      },
      {
        carrera_id: 'LAB',
        carrera_nombre: 'TECNICO SUPERIOR EN LABORATORIO',
        materia_id: 'lab-1',
        materia_codigo: 'LAB1',
        materia_nombre: 'Quimica General',
        anio: 1,
      },
    ]

    const overview = buildAdminInstitutionOverview({
      careerOptions: ['ING', 'LAB', 'PROFESORADO DE INGLES'],
      planesEstudio,
      docentes: [
        { dni: '11', full_name: 'Ana Diaz', carreras: ['ING'] },
        { dni: '22', full_name: 'Sofia Vera', carreras: ['LAB'] },
      ],
      horariosDocentes: [
        { dni: '11', profesor: 'Ana Diaz', carrera: 'ING', materia_codigo: 'ING1', dia: 'Lunes', inicio: '18:20', fin: '19:00' },
        { dni: '11', profesor: 'Ana Diaz', carrera: 'PROFESORADO DE INGLES', materia_codigo: 'ING1', dia: 'Lunes', inicio: '18:20', fin: '19:00' },
        { dni: '22', profesor: 'Sofia Vera', carrera: 'LAB', materia_codigo: 'LAB1', dia: 'Martes', inicio: '18:20', fin: '19:00' },
      ],
    })
    const scheduleRows = buildInstitutionScheduleRows({
      planesEstudio,
      horariosDocentes: [
        { profesor: 'Ana Diaz', carrera: 'ING', materia_codigo: 'ING1', dia: 'Lunes', inicio: '18:20', fin: '19:00' },
        { profesor: 'Ana Diaz', carrera: 'PROFESORADO DE INGLES', materia_codigo: 'ING1', dia: 'Lunes', inicio: '18:20', fin: '19:00' },
        { profesor: 'Sofia Vera', carrera: 'LAB', materia_codigo: 'LAB1', dia: 'Martes', inicio: '18:20', fin: '19:00' },
      ],
    })

    expect(overview.careerRows.map((row) => row.career)).toEqual([
      'PROFESORADO DE INGLES',
      'TECNICO SUPERIOR EN LABORATORIO',
    ])
    expect(overview.careerRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        career: 'PROFESORADO DE INGLES',
        teacherCount: 1,
        subjectCount: 1,
      }),
      expect.objectContaining({
        career: 'TECNICO SUPERIOR EN LABORATORIO',
        teacherCount: 1,
        subjectCount: 1,
      }),
    ]))
    expect(overview.totals.schedules).toBe(2)
    expect(scheduleRows.map((row) => row.carrera)).toEqual([
      'PROFESORADO DE INGLES',
      'TECNICO SUPERIOR EN LABORATORIO',
    ])
  })

  it('infiere la carrera docente desde el codigo de materia del plan', () => {
    const overview = buildAdminInstitutionOverview({
      planesEstudio: [
        { carrera: 'TECNICO SUPERIOR EN LABORATORIO', materia_codigo: 'LAB-01', materia_nombre: 'Quimica general' },
      ],
      docenteMateria: [
        { docente: 'Sofia Vera', materia: 'LAB-01' },
      ],
      horariosDocentes: [
        { profesor: 'Sofia Vera', materia_codigo: 'LAB-01' },
      ],
    })

    expect(overview.careerRows).toEqual([
      expect.objectContaining({
        career: 'TECNICO SUPERIOR EN LABORATORIO',
        teacherCount: 1,
        subjectCount: 1,
      }),
    ])
    expect(overview.quality.teachersWithoutCareer).toBe(0)
  })

  it('arma horarios de inicio con materia, carrera y anio desde el plan', () => {
    const rows = buildInstitutionScheduleRows({
      planesEstudio: [
        {
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING25',
          nombre: 'Fonetica y fonologia',
          anio: 2,
        },
        {
          carrera: 'TECNICO SUPERIOR EN LABORATORIO',
          materia: 'LAB1',
          nombre: 'Quimica general',
          anio: 1,
        },
      ],
      horariosDocentes: [
        {
          profesor: 'Luhana Bujaer Isa',
          carrera: 'PROFESORADO DE INGLES',
          materia: 'ING25',
          anio: 1,
          dia: 'Martes',
          inicio: '19:40',
          fin: '21:10',
          aula: '3',
        },
        {
          profesor: 'Sofia Vera',
          materia_codigo: 'LAB1',
          dia: 'Lunes',
          inicio: '18:20',
          fin: '19:40',
        },
      ],
    })

    expect(rows).toEqual([
      expect.objectContaining({
        carrera: 'PROFESORADO DE INGLES',
        anio: '2',
        materia: 'Fonetica y fonologia',
        docente: 'Luhana Bujaer Isa',
        dia: 'Martes',
        horario: '19:40 - 21:10',
      }),
      expect.objectContaining({
        carrera: 'TECNICO SUPERIOR EN LABORATORIO',
        anio: '1',
        materia: 'Quimica general',
        docente: 'Sofia Vera',
      }),
    ])
  })

  it('prefiere el anio del plan cuando el horario trae un anio generico', () => {
    const rows = buildInstitutionScheduleRows({
      planesEstudio: [
        {
          plan_id: 'PLAN-ING',
          materia_id: 'ING10',
          carrera: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING10',
          materia_nombre: 'Gramatica Inglesa I',
          anio: 1,
        },
        {
          plan_id: 'PLAN-ING',
          materia_id: 'ING25',
          carrera: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING25',
          materia_nombre: 'Fonetica y Fonologia Inglesa II',
          anio: 2,
        },
        {
          plan_id: 'PLAN-ING',
          materia_id: 'ING35',
          carrera: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING35',
          materia_nombre: 'Practica Profesional IV',
          anio: 4,
        },
      ],
      horariosDocentes: [
        {
          profesor: 'Docente Uno',
          plan_id: 'PLAN-ING',
          materia_id: 'ING10',
          carrera: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING10',
          anio: 1,
          dia: 'Lunes',
          inicio: '18:20',
          fin: '19:00',
        },
        {
          profesor: 'Docente Dos',
          plan_id: 'PLAN-ING',
          materia_id: 'ING25',
          carrera: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING25',
          anio: 1,
          dia: 'Martes',
          inicio: '19:00',
          fin: '19:40',
        },
        {
          profesor: 'Docente Tres',
          plan_id: 'PLAN-ING',
          materia_id: 'ING35',
          carrera: 'PROFESORADO DE INGLES',
          materia_codigo: 'ING35',
          anio: 1,
          dia: 'Miercoles',
          inicio: '19:40',
          fin: '20:20',
        },
      ],
    })
    const groups = buildInstitutionScheduleTimetableGroups(rows)

    expect(rows.map((row) => row.anio)).toEqual(['1', '2', '4'])
    expect(groups.map((group) => group.anio)).toEqual(['1', '2', '4'])
  })

  it('usa el profesor del horario aunque la fila enriquecida tenga nombre de materia', () => {
    const rows = buildInstitutionScheduleRows({
      planesEstudio: [
        {
          plan_id: 'QUI-PLAN',
          materia_id: 'QUI17',
          carrera: 'PROFESORADO DE QUIMICA',
          materia_codigo: 'QUI17',
          materia_nombre: 'PRACTICA PROFESIONAL II',
          nombre: 'PRACTICA PROFESIONAL II',
          anio: 2,
        },
      ],
      horariosDocentes: [
        {
          plan_id: 'QUI-PLAN',
          materia_id: 'QUI17',
          carrera: 'PROFESORADO DE QUIMICA',
          materia_codigo: 'QUI17',
          materia_nombre: 'PRACTICA PROFESIONAL II',
          nombre: 'PRACTICA PROFESIONAL II',
          profesor: 'RIVERO MARTA',
          dia: 'Martes',
          inicio: '19:40',
          fin: '21:10',
        },
      ],
    })

    expect(rows).toEqual([
      expect.objectContaining({
        carrera: 'PROFESORADO DE QUIMICA',
        anio: '2',
        materia: 'PRACTICA PROFESIONAL II',
        docente: 'RIVERO MARTA',
      }),
    ])
  })

  it('unifica los codigos institucionales con los nombres completos en el filtro de carreras', () => {
    const rows = buildInstitutionScheduleRows({
      planesEstudio: [
        { carrera_id: 'GEO', carrera: 'GEO', materia: 'GEO01', anio: 1 },
        { carrera_id: 'TUR', carrera: 'TUR', materia: 'TUR01', anio: 1 },
      ],
      horariosDocentes: [
        { carrera: 'GEO', materia: 'GEO01', dia: 'Lunes', inicio: '18:20', fin: '19:00' },
        { carrera: 'PROFESORADO DE GEOGRAFIA', materia: 'GEO02', dia: 'Martes', inicio: '18:20', fin: '19:00' },
        { carrera: 'TUR', materia: 'TUR01', dia: 'Miercoles', inicio: '18:20', fin: '19:00' },
        { carrera: 'TECNICO SUPER EN TURISMO', materia: 'TUR02', dia: 'Jueves', inicio: '18:20', fin: '19:00' },
      ],
    })

    expect([...new Set(rows.map((row) => row.carrera))]).toEqual([
      'PROFESORADO DE GEOGRAFIA',
      'TECNICO SUPERIOR EN TURISMO',
    ])
  })

  it('no muestra artefactos de validacion en los horarios de inicio', () => {
    const rows = buildInstitutionScheduleRows({
      planesEstudio: [
        { carrera: 'Validacion Carrera', materia: 'VAL-SUPA-1', nombre: 'Validacion Supabase I', anio: 1 },
      ],
      horariosDocentes: [
        {
          profesor: 'Docente Validacion Supabase',
          carrera: 'Validacion Carrera',
          materia: 'VAL-SUPA-1',
          dia: 'Lunes',
          inicio: '18:00',
          fin: '18:40',
        },
      ],
    })

    expect(rows).toEqual([])
  })

  it('agrupa la vista de horarios por franja y dia', () => {
    const grid = buildInstitutionScheduleGrid([
      {
        key: 'one',
        carrera: 'Carrera A',
        anio: '1',
        materia: 'Materia Uno',
        docente: 'Ana',
        dia: 'Martes',
        inicio: '18:20',
        fin: '19:40',
        horario: '18:20 - 19:40',
      },
      {
        key: 'two',
        carrera: 'Carrera A',
        anio: '1',
        materia: 'Materia Dos',
        docente: 'Bruno',
        dia: 'Martes',
        inicio: '18:20',
        fin: '19:40',
        horario: '18:20 - 19:40',
      },
      {
        key: 'three',
        carrera: 'Carrera A',
        anio: '1',
        materia: 'Materia Tres',
        docente: 'Carla',
        dia: 'Jueves',
        inicio: '19:40',
        fin: '21:00',
        horario: '19:40 - 21:00',
      },
    ])

    expect(grid.days.map((day) => day.label)).toEqual(['Martes', 'Jueves'])
    expect(grid.slots.map((slot) => slot.label)).toEqual(['18:20 - 19:40', '19:40 - 21:00'])
    expect(grid.slots[0].cells.martes).toHaveLength(2)
    expect(grid.slots[1].cells.jueves).toHaveLength(1)
  })

  it('arma paneles individuales con columnas de hora catedra', () => {
    const [group] = buildInstitutionScheduleTimetableGroups([
      {
        key: 'one',
        carrera: 'PROFESORADO DE INGLES',
        anio: '1',
        materia: 'Gramatica inglesa I',
        docente: 'Valle Maria Ines',
        dia: 'Martes',
        inicio: '18:20',
        fin: '19:40',
        horario: '18:20 - 19:40',
      },
    ])

    const martes = group.gridRows.find((row) => row.key === 'martes')
    const occupied = martes.cells.find((cell) => cell.rows.length === 1)

    expect(group.carrera).toBe('PROFESORADO DE INGLES')
    expect(group.anio).toBe('1')
    expect(group.slots.map((slot) => slot.label).slice(0, 2)).toEqual(['18:20 A 19:00', '19:00 A 19:40'])
    expect(occupied).toMatchObject({ colSpan: 2 })
    expect(occupied.rows[0].materia).toBe('Gramatica inglesa I')
  })
})
