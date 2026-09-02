import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseArchivo } from './parseCSV.js'

async function createWorkbookFile({ fileName = 'horarios.xlsx', sheetName = 'Horarios', rows }) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  const headers = Object.keys(rows[0] ?? {})

  sheet.columns = headers.map((header) => ({ header, key: header }))
  sheet.addRows(rows)

  const buffer = await workbook.xlsx.writeBuffer()
  return new File([buffer], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

async function createMultiSheetWorkbookFile({ fileName = 'alumnos.xlsx', sheets }) {
  const workbook = new ExcelJS.Workbook()

  sheets.forEach(({ name, rows }) => {
    const sheet = workbook.addWorksheet(name)
    const headers = Object.keys(rows[0] ?? {})

    sheet.columns = headers.map((header) => ({ header, key: header }))
    sheet.addRows(rows)
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new File([buffer], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('parseArchivo', () => {
  it('lee horarios desde un XLSX real', async () => {
    const file = await createWorkbookFile({
      rows: [
        {
          profesor: 'Ana Diaz',
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          dia: 'Lunes',
          inicio: '08:00',
          fin: '10:00',
          bloqueo: '',
        },
      ],
    })

    const rows = await parseArchivo(file, 'horarios-docentes')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      profesor: 'Ana Diaz',
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      aula: 'A definir',
      bloqueos: [],
    })
  })

  it('convierte horas reales de Excel a HH:mm sin arrastrar la fecha base 1899', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Horarios')
    sheet.columns = [
      { header: 'profesor', key: 'profesor' },
      { header: 'carrera', key: 'carrera' },
      { header: 'materia', key: 'materia' },
      { header: 'dia', key: 'dia' },
      { header: 'inicio', key: 'inicio' },
      { header: 'fin', key: 'fin' },
    ]

    const row = sheet.addRow({
      profesor: 'Susana Aguero',
      carrera: 'Tecnico Superior en Turismo',
      materia: 'TUR09',
      dia: 'Jueves',
      inicio: 0.7708333333,
      fin: 0.8541666667,
    })
    row.getCell('inicio').numFmt = 'hh:mm'
    row.getCell('fin').numFmt = 'hh:mm'

    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'horarios-hora-real.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const rows = await parseArchivo(file, 'horarios-docentes')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      profesor: 'Susana Aguero',
      materia: 'TUR09',
      inicio: '18:30',
      fin: '20:30',
    })
  })

  it('lee alumnos desde CSV', async () => {
    const file = new File([
      'email,apellido_y_nombre,carrera,anio,dni,legajo\nana@example.com,"Diaz, Ana",Profesorado de Ingles,1,30111222,L-1',
    ], 'alumnos.csv', { type: 'text/csv' })

    const rows = await parseArchivo(file, 'alumnos')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: 'ana@example.com',
      nombre: 'Ana',
      apellido: 'Diaz',
      full_name: 'Ana Diaz',
      carrera: 'Profesorado de Ingles',
      anio: '1',
      dni: '30111222',
      legajo: 'L-1',
      role: 'alumno',
    })
  })

  it('lee alumnos desde un XLSX con una hoja por carrera', async () => {
    const file = await createMultiSheetWorkbookFile({
      sheets: [
        {
          name: 'Profesorado de Ingles',
          rows: [{
            email: 'ana@example.com',
            apellido_y_nombre: 'Diaz, Ana',
            anio: '1',
            dni: '30111222',
          }],
        },
        {
          name: 'Profesorado de Quimica',
          rows: [{
            email: 'luis@example.com',
            apellido_y_nombre: 'Perez, Luis',
            anio: '2',
            dni: '28999888',
          }],
        },
        {
          name: 'Instrucciones',
          rows: [{
            campo: 'email',
            requerido: 'si',
            descripcion: 'Correo de acceso',
          }],
        },
      ],
    })

    const rows = await parseArchivo(file, 'alumnos')

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      email: 'ana@example.com',
      nombre: 'Ana',
      apellido: 'Diaz',
      carrera: 'Profesorado de Ingles',
      anio: '1',
    })
    expect(rows[1]).toMatchObject({
      email: 'luis@example.com',
      nombre: 'Luis',
      apellido: 'Perez',
      carrera: 'Profesorado de Quimica',
      anio: '2',
    })
  })

  it('lee docentes desde CSV', async () => {
    const file = new File([
      'nombre,apellido,dni,telefono,agrupacion_preferida\nAna,Diaz,30111222,1123456789,si',
    ], 'docentes.csv', { type: 'text/csv' })

    const rows = await parseArchivo(file, 'docentes')

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      nombre: 'Ana',
      apellido: 'Diaz',
      full_name: 'Ana Diaz',
      dni: '30111222',
      telefono: '1123456789',
      estado: 'activo',
      agrupacion_preferida: 'si',
    })
  })

  it('lee matriz docente-materia desde CSV y normaliza roles de tribunal', async () => {
    const file = new File([
      [
        'carrera,materia,nombre_materia,docente,dni,rol_en_materia,tipo_afinidad,prioridad',
        'Profesorado de Ingles,ING1,Gramatica I,Ana Diaz,30111222,Titular,directa,1',
        'Profesorado de Ingles,ING1,Gramatica I,Luis Gomez,30222333,Vocal afin,misma area,2',
      ].join('\n'),
    ], 'docente-materia.csv', { type: 'text/csv' })

    const rows = await parseArchivo(file, 'docente-materia')

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      carrera: 'Profesorado de Ingles',
      materia: 'ING1',
      nombreMateria: 'Gramatica I',
      docente: 'Ana Diaz',
      docenteId: '30111222',
      rol_en_materia: 'TITULAR',
      tipo_afinidad: 'directa',
      prioridad: 1,
    })
    expect(rows[1]).toMatchObject({
      docente: 'Luis Gomez',
      rol_en_materia: 'VOCAL_AFIN',
    })
  })

  it('rechaza XLS legacy para evitar el parser vulnerable', async () => {
    const file = new File(['legacy'], 'horarios.xls', {
      type: 'application/vnd.ms-excel',
    })

    await expect(parseArchivo(file, 'horarios-docentes')).rejects.toThrow(
      'Formato no soportado. Usa CSV, XLSX o DOCX.',
    )
  })
})
