import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildTemplateV2CsvFiles,
  buildTemplateV2Manifest,
  buildTemplateV2ReadmeText,
  buildTemplateV2WorkbookDefinition,
} from './templateV2Downloads.js'
import {
  buildTemplateV2AssetPayload,
  buildTemplateV2XlsxBuffer,
} from './downloadTemplateV2Assets.js'

function cellByHeader(worksheet, rowNumber, header) {
  const headerValues = worksheet.getRow(1).values
  const columnIndex = headerValues.findIndex((value) => value === header)
  return worksheet.getRow(rowNumber).getCell(columnIndex).value
}

describe('templateV2Downloads', () => {
  it('genera las 10 plantillas v2', () => {
    const workbook = buildTemplateV2WorkbookDefinition()

    expect(workbook.sheets).toHaveLength(10)
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      'carreras_planes',
      'docentes',
      'plan_estudios',
      'equivalencias_planes',
      'docente_materia',
      'horarios_docentes',
      'disponibilidad_docente',
      'alumnos_inscripciones',
      'correlatividades',
      'calendario_mesas',
    ])
  })

  it('cada plantilla incluye plan_id cuando corresponde', () => {
    const workbook = buildTemplateV2WorkbookDefinition()
    const planAware = [
      'carreras_planes',
      'plan_estudios',
      'docente_materia',
      'horarios_docentes',
      'alumnos_inscripciones',
      'correlatividades',
    ]

    planAware.forEach((templateName) => {
      const sheet = workbook.sheets.find((candidate) => candidate.name === templateName)
      expect(sheet.columns).toContain('plan_id')
    })
  })

  it('plan_estudios incluye materia_codigo', () => {
    const manifest = buildTemplateV2Manifest()
    const template = manifest.templates.find((item) => item.name === 'plan_estudios')

    expect(template.columns).toContain('materia_codigo')
    expect(template.columns).toContain('materia_id')
    expect(template.uniqueKey).toEqual(['materia_id'])
  })

  it('docente_materia incluye docente_id, plan_id y materia_codigo', () => {
    const manifest = buildTemplateV2Manifest()
    const template = manifest.templates.find((item) => item.name === 'docente_materia')

    expect(template.columns).toEqual(expect.arrayContaining([
      'docente_id',
      'plan_id',
      'materia_codigo',
      'materia_id',
    ]))
    expect(template.uniqueKey).toEqual(['materia_id', 'docente_id'])
  })

  it('docentes incluye horas catedra e idoneidad para vocalias', () => {
    const manifest = buildTemplateV2Manifest()
    const template = manifest.templates.find((item) => item.name === 'docentes')

    expect(template.columns).toEqual(expect.arrayContaining([
      'horas_catedra',
      'especialidad',
      'familias_idoneidad',
      'idoneidad_academica_explicita',
      'turnos_disponibles',
    ]))
    expect(template.requiredColumns).toContain('horas_catedra')
  })

  it('calendario y disponibilidad declaran llamado y turno explicitos', () => {
    const manifest = buildTemplateV2Manifest()
    const calendario = manifest.templates.find((item) => item.name === 'calendario_mesas')
    const disponibilidad = manifest.templates.find((item) => item.name === 'disponibilidad_docente')

    expect(calendario.columns).toContain('llamado')
    expect(calendario.requiredColumns).toContain('llamado')
    expect(disponibilidad.columns).toContain('turno')
    expect(disponibilidad.requiredColumns).toContain('turno')
  })

  it('horarios_docentes no define titularidad', () => {
    const workbook = buildTemplateV2WorkbookDefinition()
    const horarios = workbook.sheets.find((sheet) => sheet.name === 'horarios_docentes')
    const serialized = JSON.stringify(horarios)

    expect(horarios.columns).not.toContain('rol_en_materia')
    expect(horarios.columns).not.toContain('estado_asignacion')
    expect(serialized).toContain('no titularidad')
  })

  it('equivalencias_planes incluye plan_origen_id y plan_destino_id', () => {
    const csvFiles = buildTemplateV2CsvFiles()
    const equivalencias = csvFiles.find((file) => file.templateName === 'equivalencias_planes')

    expect(equivalencias.columns).toEqual(expect.arrayContaining([
      'plan_origen_id',
      'plan_destino_id',
    ]))
    expect(equivalencias.content).toContain('LAB15-QUIM1')
    expect(equivalencias.content).toContain('LAB24-QUIM1')
  })

  it('ejemplos incluyen materias de los planes 2015 y 2024 de Laboratorio', () => {
    const payload = buildTemplateV2AssetPayload()
    const serialized = JSON.stringify(payload)

    expect(serialized).toContain('LAB15-QUIM1')
    expect(serialized).toContain('LAB24-QUIM1')
  })

  it('README explica que materia_nombre no es clave', () => {
    const readme = buildTemplateV2ReadmeText()

    expect(readme).toContain('No usar `materia_nombre` como clave unica')
    expect(readme).toContain('materia_id')
  })

  it('no importa ni modifica cronogramaInteligente.js', async () => {
    const module = await import('./templateV2Downloads.js')

    expect(Object.keys(module)).toEqual(expect.arrayContaining([
      'buildTemplateV2WorkbookDefinition',
      'buildTemplateV2CsvFiles',
      'buildTemplateV2ReadmeText',
      'buildTemplateV2Manifest',
    ]))
    expect(Object.keys(module)).not.toContain('descargarPlantillaAlumnos')
  })

  it('no depende de plantillas viejas', () => {
    const payload = buildTemplateV2AssetPayload()
    const filenames = payload.csvFiles.map((file) => file.filename)

    expect(filenames).not.toContain('plantilla-alumnos.xlsx')
    expect(filenames).not.toContain('plantilla-plan-estudios.xlsx')
    expect(payload.zipSupported).toBe(false)
  })

  it('genera un workbook XLSX con hojas editables', async () => {
    const buffer = await buildTemplateV2XlsxBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(expect.arrayContaining([
      'README',
      'MANIFEST',
      'docentes',
      'docente_materia',
      'calendario_mesas',
    ]))

    const docentes = workbook.getWorksheet('docentes')
    expect(docentes.getRow(1).values).toEqual(expect.arrayContaining([
      'docente_id',
      'horas_catedra',
      'idoneidad_academica_explicita',
    ]))

    const docenteMateria = workbook.getWorksheet('docente_materia')
    const materiaId = cellByHeader(docenteMateria, 2, 'materia_id')
    const materiaNombre = cellByHeader(docenteMateria, 2, 'materia_nombre')
    expect(docenteMateria.getCell(2, docenteMateria.getRow(1).values.indexOf('materia_id')).dataValidation)
      .toMatchObject({ type: 'list', formulae: ['ListaMateriaIds'] })
    expect(materiaId).toBe('2')
    expect(materiaNombre).toMatchObject({
      formula: expect.stringContaining('INDEX(plan_estudios!$E:$E'),
      result: 'Quimica General',
    })

    const planEstudios = workbook.getWorksheet('plan_estudios')
    const regimenColumn = planEstudios.getRow(1).values.indexOf('regimen')
    const cuatrimestreColumn = planEstudios.getRow(1).values.indexOf('cuatrimestre')
    expect(planEstudios.getCell(2, regimenColumn).dataValidation).toMatchObject({
      type: 'list',
      formulae: ['"ANUAL,CUATRIMESTRAL"'],
    })
    expect(planEstudios.getCell(2, cuatrimestreColumn).dataValidation).toMatchObject({
      type: 'list',
      allowBlank: true,
      formulae: ['"1,2"'],
    })
  })

  it('prefill del XLSX usa datos cargados y deja campos faltantes para completar', async () => {
    const buffer = await buildTemplateV2XlsxBuffer({
      sourceData: {
        horariosDocentes: [{
          profesor: 'Ana Perez',
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          dia: 'LUNES',
          inicio: '18:00',
          fin: '19:20',
          dni: '111',
        }],
        planesEstudio: [{
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          nombre: 'Ingles I',
          anio: 1,
        }],
        docenteMateria: [{
          carrera: 'Profesorado de Ingles',
          materia: 'ING1',
          nombreMateria: 'Ingles I',
          docente: 'Ana Perez',
          dni: '111',
          rol_en_materia: 'TITULAR',
        }],
        alumnos: [{
          email: 'alumno@example.edu',
          nombre: 'Luis',
          apellido: 'Diaz',
          carrera: 'Profesorado de Ingles',
          dni: '222',
        }],
        correlatividades: [{
          carrera: 'Profesorado de Ingles',
          materia: 'ING2',
          nombre: 'Ingles II',
          correlativas: ['ING1'],
        }],
        regularCallRanges: {
          first: { start: '2026-07-01', end: '2026-07-02' },
          second: { start: '', end: '' },
        },
      },
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    expect(cellByHeader(workbook.getWorksheet('plan_estudios'), 2, 'materia_nombre')).toBe('Ingles I')
    expect(cellByHeader(workbook.getWorksheet('docentes'), 2, 'horas_catedra')).toBe('2')
    expect(cellByHeader(workbook.getWorksheet('docente_materia'), 2, 'rol_en_materia')).toBe('TITULAR')
    expect(cellByHeader(workbook.getWorksheet('alumnos_inscripciones'), 2, 'materia_codigo')).toMatchObject({
      formula: expect.stringContaining('MATCH($M2,plan_estudios!$C:$C,0)'),
    })
    expect(workbook.getWorksheet('calendario_mesas').rowCount).toBe(3)
  })

  it('prefill del XLSX propone como titular al unico docente detectado en horarios', async () => {
    const buffer = await buildTemplateV2XlsxBuffer({
      sourceData: {
        horariosDocentes: [{
          profesor: 'Natalia Raya',
          carrera: 'Profesorado de Ingles',
          materia: 'ING26',
          nombreMateria: 'Didactica del Ingles II',
          dia: 'JUEVES',
          inicio: '21:10',
          fin: '22:35',
          dni: '31256302',
        }],
        planesEstudio: [{
          carrera: 'Profesorado de Ingles',
          materia: 'ING26',
          nombre: 'Didactica del Ingles II',
          anio: 3,
        }],
      },
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    expect(cellByHeader(workbook.getWorksheet('docente_materia'), 2, 'rol_en_materia')).toBe('TITULAR')
    expect(cellByHeader(workbook.getWorksheet('docente_materia'), 2, 'observaciones'))
      .toContain('unico docente en horarios')
  })
})
