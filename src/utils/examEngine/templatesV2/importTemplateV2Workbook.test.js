import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildTemplateV2XlsxBuffer } from './downloadTemplateV2Assets.js'
import {
  parseTemplateV2MasterWorkbook,
  parseTemplateV2StudentsWorkbook,
  parseTemplateV2TeachersWorkbook,
} from './importTemplateV2Workbook.js'

function workbookFile(buffer, name = 'plantilla-maestra.xlsx') {
  return { name, arrayBuffer: async () => buffer }
}

describe('parseTemplateV2MasterWorkbook', () => {
  it('carga conjuntamente todos los datasets del workbook maestro', async () => {
    const buffer = await buildTemplateV2XlsxBuffer({
      sourceData: {
        planesEstudio: [{
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: 1,
          regimen: 'ANUAL',
        }],
        horariosDocentes: [{
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          profesor: 'Perez Ana',
          dni: '30111222',
          dia: 'LUNES',
          inicio: '18:00',
          fin: '20:00',
        }],
      },
    })

    const result = await parseTemplateV2MasterWorkbook(workbookFile(buffer))

    expect(result.datasets.planesEstudio[0]).toMatchObject({
      carrera: 'PROFESORADO DE INGLES',
      materia: 'ING1',
      nombre: 'Ingles I',
      regimen: 'ANUAL',
    })
    expect(result.datasets.docenteMateria[0]).toMatchObject({
      carrera: 'PROFESORADO DE INGLES',
      materia: 'ING1',
      docente: 'Perez Ana',
    })
    expect(result.datasets.horariosDocentes[0]).toMatchObject({
      profesor: 'Perez Ana',
      inicio: '18:00',
      fin: '20:00',
    })
    expect(result.datasets.disponibilidadDocente[0]).toMatchObject({
      docente: 'Perez Ana',
      dia: 'LUNES',
      turno: 'NOCHE',
      hora_desde: '18:00',
      hora_hasta: '20:00',
      disponible_mesa: true,
    })
  })

  it('no autorreferencia una materia sin correlativa cargada (bug real: fila con correlativa_id vacio)', async () => {
    const workbook = new ExcelJS.Workbook()

    const carreras = workbook.addWorksheet('carreras_planes')
    carreras.addRow(['carrera_id', 'carrera_nombre'])
    carreras.addRow(['ING', 'PROFESORADO DE INGLES'])

    const plan = workbook.addWorksheet('plan_estudios')
    plan.addRow(['plan_id', 'carrera_id', 'materia_id', 'materia_codigo', 'materia_nombre'])
    plan.addRow(['ING-PLAN', 'ING', 'uuid-ing02', 'ING02', 'SUJETO DE LA EDUCACION INICIAL Y PRIMARIA'])
    plan.addRow(['ING-PLAN', 'ING', 'uuid-ing14', 'ING14', 'SUJETO DE LA EDUCACION SECUNDARIA'])

    const correlatividades = workbook.addWorksheet('correlatividades')
    correlatividades.addRow(['materia_id', 'correlativa_id', 'correlativa_codigo'])
    // ING02 no tiene correlativa: la fila real trae correlativa_id y
    // correlativa_codigo vacios. Antes del fix, esto generaba
    // correlativas: ['ING02'] (autorreferencia) en vez de [].
    correlatividades.addRow(['uuid-ing02', '', ''])
    // ING14 si tiene correlativa real: ING02.
    correlatividades.addRow(['uuid-ing14', 'uuid-ing02', 'ING02'])

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await parseTemplateV2MasterWorkbook(workbookFile(buffer))

    const ing02 = result.datasets.correlatividades.find((row) => row.materia === 'ING02')
    const ing14 = result.datasets.correlatividades.find((row) => row.materia === 'ING14')

    expect(ing02.correlativas).toEqual([])
    expect(ing14.correlativas).toEqual(['ING02'])
  })

  it('rechaza un XLSX que no tiene las hojas maestras requeridas', async () => {
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('Hoja1').addRow(['dato'])
    const buffer = await workbook.xlsx.writeBuffer()

    await expect(parseTemplateV2MasterWorkbook(workbookFile(buffer))).rejects.toThrow(
      'La plantilla maestra esta incompleta',
    )
  })
})

describe('parseTemplateV2TeachersWorkbook', () => {
  it('cruza contra planes locales que usan id como materia_id interno', async () => {
    const workbook = new ExcelJS.Workbook()
    const docentes = workbook.addWorksheet('docentes')
    docentes.addRow(['docente_id', 'apellido', 'nombre', 'dni_docente'])
    docentes.addRow(['doc-1', 'BACA', 'Carolina', ''])

    const docenteMateria = workbook.addWorksheet('docente_materia')
    docenteMateria.addRow(['materia_id', 'materia_codigo', 'materia_nombre', 'docente_id', 'docente', 'rol_en_materia'])
    docenteMateria.addRow(['subject-uuid-lab05', 'LAB05', 'QUIMICA', 'doc-1', 'BACA Carolina', 'TITULAR'])

    const horariosDocentes = workbook.addWorksheet('horarios_docentes')
    horariosDocentes.addRow(['materia_id', 'materia_codigo', 'materia_nombre', 'docente_id', 'docente', 'dia', 'hora_inicio', 'hora_fin'])
    horariosDocentes.addRow(['subject-uuid-lab05', 'LAB05', 'QUIMICA', 'doc-1', 'BACA Carolina', 'MARTES', '18:20', '20:20'])

    const disponibilidadDocente = workbook.addWorksheet('disponibilidad_docente')
    disponibilidadDocente.addRow(['docente_id', 'dia', 'turno', 'hora_desde', 'hora_hasta', 'disponible_mesa', 'observaciones'])
    disponibilidadDocente.addRow(['doc-1', 'MARTES', 'NOCHE', '18:20', '20:20', 'NO', 'Viaje'])

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await parseTemplateV2TeachersWorkbook(workbookFile(buffer, 'docentes.xlsx'), {
      planesEstudio: [{
        id: 'subject-uuid-lab05',
        carrera: 'TECNICO SUP EN LABORATORIO',
        materia: 'LAB05',
        nombre: 'QUIMICA GENERAL',
        anio: 1,
      }],
    })

    expect(result.datasets.docenteMateria[0]).toMatchObject({
      materia_id: 'subject-uuid-lab05',
      materia_codigo: 'LAB05',
      materia_nombre: 'QUIMICA GENERAL',
      materia: 'LAB05',
      nombreMateria: 'QUIMICA GENERAL',
      carrera: 'TECNICO SUP EN LABORATORIO',
      docente: 'BACA Carolina',
    })
    expect(result.datasets.horariosDocentes[0]).toMatchObject({
      materia_id: 'subject-uuid-lab05',
      materia: 'LAB05',
      nombreMateria: 'QUIMICA GENERAL',
      profesor: 'BACA Carolina',
      inicio: '18:20',
      fin: '20:20',
    })
    expect(result.datasets.disponibilidadDocente[0]).toMatchObject({
      docente_id: 'doc-1',
      docente: 'BACA Carolina',
      profesor: 'BACA Carolina',
      dia: 'MARTES',
      turno: 'NOCHE',
      hora_desde: '18:20',
      hora_hasta: '20:20',
      disponible_mesa: false,
      observaciones: 'Viaje',
    })
    expect(result.summary.disponibilidadDocente).toBe(1)
  })

  it('resuelve el nombre de carrera por carrera_id cuando materia_id no matchea ningun plan', async () => {
    const workbook = new ExcelJS.Workbook()
    const docentes = workbook.addWorksheet('docentes')
    docentes.addRow(['docente_id', 'apellido', 'nombre', 'dni_docente'])
    docentes.addRow(['doc-2', 'BACA', 'Carolina', ''])

    const docenteMateria = workbook.addWorksheet('docente_materia')
    docenteMateria.addRow(['materia_id', 'materia_codigo', 'materia_nombre', 'docente_id', 'docente', 'carrera_id', 'rol_en_materia'])
    docenteMateria.addRow(['materia-no-existe', 'LAB05', 'QUIMICA', 'doc-2', 'BACA Carolina', 'ING', 'TITULAR'])

    const horariosDocentes = workbook.addWorksheet('horarios_docentes')
    horariosDocentes.addRow(['materia_id', 'materia_codigo', 'materia_nombre', 'docente_id', 'docente', 'dia', 'hora_inicio', 'hora_fin'])
    horariosDocentes.addRow(['materia-no-existe', 'LAB05', 'QUIMICA', 'doc-2', 'BACA Carolina', 'MARTES', '18:20', '20:20'])

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await parseTemplateV2TeachersWorkbook(workbookFile(buffer, 'docentes.xlsx'), {
      planesEstudio: [{
        id: 'subject-ing1',
        carrera_id: 'ING',
        carrera: 'PROFESORADO DE INGLES',
        materia: 'ING01',
        nombre: 'Ingles I',
        anio: 1,
      }],
    })

    expect(result.datasets.docenteMateria[0]).toMatchObject({
      carrera_id: 'ING',
      carrera: 'PROFESORADO DE INGLES',
      docente: 'BACA Carolina',
    })
  })
})

describe('parseTemplateV2StudentsWorkbook', () => {
  it('acepta una hoja con otro nombre si tiene las columnas de alumnos_inscripciones', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Hoja1')
    sheet.addRow([
      'alumno_id',
      'apellido',
      'nombre',
      'dni',
      'email',
      'telefono',
      'carrera_id',
      'plan_id',
      'materia_id',
      'materia_codigo',
      'materia_nombre',
      'condicion',
    ])
    sheet.addRow([
      'alu-1',
      'Perez',
      'Ana',
      '30111222',
      'ana@example.com',
      '',
      'ING',
      'ING-PLAN',
      'subject-ing1',
      'ING01',
      'Ingles I',
      'regular',
    ])

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await parseTemplateV2StudentsWorkbook(workbookFile(buffer, 'ALUMNOS.xlsx'), {
      planesEstudio: [{
        id: 'subject-ing1',
        carrera: 'PROFESORADO DE INGLES',
        materia: 'ING01',
        nombre: 'Ingles I',
        anio: 1,
      }],
    })

    expect(result.datasets.alumnos).toEqual([
      expect.objectContaining({
        id: 'alu-1',
        alumno_id: 'alu-1',
        carrera: 'PROFESORADO DE INGLES',
        materia_id: 'subject-ing1',
        materia: 'ING01',
        nombreMateria: 'Ingles I',
      }),
    ])
  })

  it('resuelve el nombre de carrera por carrera_id cuando la fila no tiene materia_id (caso real: alumno sin cursada previa)', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('alumnos_inscripciones')
    sheet.addRow([
      'alumno_id',
      'apellido',
      'nombre',
      'dni',
      'email',
      'telefono',
      'carrera_id',
      'plan_id',
      'materia_id',
      'materia_codigo',
      'materia_nombre',
    ])
    sheet.addRow([
      'alu-2',
      'ABDELHAMID CAMPOS',
      'YAMIL OMAR',
      '45963378',
      'yamil@example.com',
      '3813049985',
      'ING',
      'ING-PLAN',
      '',
      '',
      '',
    ])

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await parseTemplateV2StudentsWorkbook(workbookFile(buffer, 'ALUMNOS.xlsx'), {
      planesEstudio: [{
        id: 'subject-ing1',
        carrera_id: 'ING',
        carrera: 'PROFESORADO DE INGLES',
        materia: 'ING01',
        nombre: 'Ingles I',
        anio: 1,
      }],
    })

    expect(result.datasets.alumnos).toEqual([
      expect.objectContaining({
        id: 'alu-2',
        alumno_id: 'alu-2',
        carrera_id: 'ING',
        carrera: 'PROFESORADO DE INGLES',
      }),
    ])
  })

  it('importa alumnos nuevos sin alumno_id usando DNI o email como identidad', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('alumnos_inscripciones')
    sheet.addRow([
      'alumno_id',
      'apellido',
      'nombre',
      'dni',
      'email',
      'telefono',
      'carrera_id',
      'plan_id',
      'materia_id',
      'materia_codigo',
      'materia_nombre',
    ])
    sheet.addRow([
      '',
      'GOMEZ',
      'LUCIA',
      '44.555.666',
      'lucia@example.com',
      '381555111',
      'TUR',
      'TUR-PLAN',
      '',
      '',
      '',
    ])

    const buffer = await workbook.xlsx.writeBuffer()
    const result = await parseTemplateV2StudentsWorkbook(workbookFile(buffer, 'ALUMNOS.xlsx'), {
      planesEstudio: [{
        carrera_id: 'TUR',
        carrera: 'TECNICO SUPERIOR EN TURISMO',
      }],
    })

    expect(result.datasets.alumnos).toEqual([
      expect.objectContaining({
        id: 'dni-44555666',
        alumno_id: 'dni-44555666',
        dni: '44.555.666',
        email: 'lucia@example.com',
        carrera_id: 'TUR',
        carrera: 'TECNICO SUPERIOR EN TURISMO',
      }),
    ])
  })

  it('explica cuando se sube una planilla vieja sin alumnos_inscripciones', async () => {
    const workbook = new ExcelJS.Workbook()
    const alumnos = workbook.addWorksheet('Alumnos')
    alumnos.addRow(['email', 'nombre', 'apellido', 'carrera', 'dni', 'legajo', 'telefono', 'estado'])
    alumnos.addRow(['ana@example.com', 'Ana', 'Perez', 'INGLES', '30111222', '', '', 'activo'])
    workbook.addWorksheet('Instrucciones').addRow(['campo', 'requerido', 'descripcion'])

    const buffer = await workbook.xlsx.writeBuffer()

    await expect(parseTemplateV2StudentsWorkbook(workbookFile(buffer, 'plantilla-alumnos.xlsx'))).rejects.toThrow(
      'Hojas encontradas: Alumnos, Instrucciones',
    )
  })
})
