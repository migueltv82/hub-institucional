import { describe, expect, it } from 'vitest'
import {
  buildTeacherScheduleGrids,
  buildTeacherWeeklyOverviewGrid,
  buildWeeklySummaryPrintHtml,
} from './teacherScheduleGrid.js'

describe('buildTeacherScheduleGrids', () => {
  it('arma una grilla por materia con dia y franja horaria', () => {
    const grids = buildTeacherScheduleGrids([
      {
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        carrera: 'PROFESORADO DE INGLES',
        nombreMateria: 'Fonetica y Fonologia Inglesa I',
        anio: '1',
        dia: 'Martes',
        inicio: '18:20',
        fin: '19:40',
        aula: '-',
      },
    ])

    expect(grids).toHaveLength(1)
    const [grid] = grids
    expect(grid.nombreMateria).toBe('Fonetica y Fonologia Inglesa I')
    expect(grid.carrera).toBe('PROFESORADO DE INGLES')

    const martes = grid.gridRows.find((row) => row.key === 'martes')
    const occupied = martes.cells.find((cell) => cell.rows.length === 1)
    expect(occupied.rows[0].anio).toBe('1')
  })

  it('separa dos materias con el mismo nombre pero distinto subjectId/programId', () => {
    const grids = buildTeacherScheduleGrids([
      {
        subjectId: 'ING16',
        programId: 'PROFESORADO DE INGLES',
        carrera: 'PROFESORADO DE INGLES',
        nombreMateria: 'Fonetica y Fonologia Inglesa II',
        anio: '2',
        dia: 'Lunes',
        inicio: '20:30',
        fin: '22:35',
      },
      {
        subjectId: 'TRA13',
        programId: 'TECNICO SUP EN TRADUCTORADO',
        carrera: 'TECNICO SUP EN TRADUCTORADO',
        nombreMateria: 'Fonetica y Fonologia Inglesa II',
        anio: '2',
        dia: 'Jueves',
        inicio: '21:10',
        fin: '22:35',
      },
    ])

    expect(grids).toHaveLength(2)
    expect(new Set(grids.map((grid) => grid.carrera))).toEqual(new Set([
      'PROFESORADO DE INGLES',
      'TECNICO SUP EN TRADUCTORADO',
    ]))
  })

  it('agrupa varios bloques semanales de la misma materia en una sola grilla', () => {
    const grids = buildTeacherScheduleGrids([
      {
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        carrera: 'PROFESORADO DE INGLES',
        nombreMateria: 'Fonetica y Fonologia Inglesa I',
        anio: '1',
        dia: 'Jueves',
        inicio: '19:40',
        fin: '21:10',
      },
      {
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        carrera: 'PROFESORADO DE INGLES',
        nombreMateria: 'Fonetica y Fonologia Inglesa I',
        anio: '1',
        dia: 'Miercoles',
        inicio: '19:40',
        fin: '21:10',
      },
    ])

    expect(grids).toHaveLength(1)
    const occupiedDays = grids[0].gridRows
      .filter((day) => day.cells.some((cell) => cell.rows.length > 0))
      .map((day) => day.label)
    expect(occupiedDays).toEqual(['Miercoles', 'Jueves'])
  })

  it('devuelve un array vacio cuando no hay horarios cargados', () => {
    expect(buildTeacherScheduleGrids([])).toEqual([])
    expect(buildTeacherScheduleGrids()).toEqual([])
  })
})

describe('buildTeacherWeeklyOverviewGrid', () => {
  it('compacta todas las materias en una sola grilla dia x franja', () => {
    const grid = buildTeacherWeeklyOverviewGrid([
      {
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        carrera: 'PROFESORADO DE INGLES',
        nombreMateria: 'Materia Uno',
        anio: '1',
        dia: 'Lunes',
        inicio: '18:20',
        fin: '19:40',
      },
      {
        subjectId: 'TRA13',
        programId: 'TECNICO SUP EN TRADUCTORADO',
        carrera: 'TECNICO SUP EN TRADUCTORADO',
        nombreMateria: 'Materia Dos',
        anio: '2',
        dia: 'Jueves',
        inicio: '21:10',
        fin: '22:35',
      },
    ])

    const lunes = grid.gridRows.find((day) => day.key === 'lunes')
    const jueves = grid.gridRows.find((day) => day.key === 'jueves')
    expect(lunes.cells.find((cell) => cell.rows.length === 1).rows[0].nombreMateria).toBe('Materia Uno')
    expect(jueves.cells.find((cell) => cell.rows.length === 1).rows[0].nombreMateria).toBe('Materia Dos')
  })

  it('devuelve una grilla vacia cuando no hay horarios', () => {
    const grid = buildTeacherWeeklyOverviewGrid([])
    expect(grid.gridRows.every((day) => day.cells.every((cell) => cell.rows.length === 0))).toBe(true)
  })
})

describe('buildWeeklySummaryPrintHtml', () => {
  it('arma una unica tabla con materia, carrera y ano dentro de cada celda ocupada', () => {
    const grid = buildTeacherWeeklyOverviewGrid([
      {
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        carrera: 'PROFESORADO DE INGLES',
        nombreMateria: 'Fonetica y Fonologia Inglesa I',
        anio: '1',
        dia: 'Martes',
        inicio: '18:20',
        fin: '19:40',
      },
    ])

    const html = buildWeeklySummaryPrintHtml(grid)

    expect(html).toContain('Fonetica y Fonologia Inglesa I')
    expect(html).toContain('PROFESORADO DE INGLES')
    expect(html).toContain('1° Año')
    expect(html).toContain('<title>Resumen semanal</title>')
    expect((html.match(/<table>/g) ?? []).length).toBe(1)
  })

  it('junta materias de distintas carreras en la misma tabla', () => {
    const grid = buildTeacherWeeklyOverviewGrid([
      {
        subjectId: 'ING06',
        programId: 'PROFESORADO DE INGLES',
        carrera: 'PROFESORADO DE INGLES',
        nombreMateria: 'Materia Uno',
        anio: '1',
        dia: 'Lunes',
        inicio: '18:20',
        fin: '19:40',
      },
      {
        subjectId: 'TRA13',
        programId: 'TECNICO SUP EN TRADUCTORADO',
        carrera: 'TECNICO SUP EN TRADUCTORADO',
        nombreMateria: 'Materia Dos',
        anio: '2',
        dia: 'Jueves',
        inicio: '21:10',
        fin: '22:35',
      },
    ])

    const html = buildWeeklySummaryPrintHtml(grid)

    expect((html.match(/<table>/g) ?? []).length).toBe(1)
    expect(html).toContain('Materia Uno')
    expect(html).toContain('Materia Dos')
  })

  it('escapa el titulo para evitar HTML sin escapar', () => {
    const html = buildWeeklySummaryPrintHtml({}, { title: '<script>alert(1)</script>' })

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
