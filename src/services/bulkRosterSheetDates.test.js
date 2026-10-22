import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseTemplateV2TeachersWorkbook } from '../utils/examEngine/templatesV2/importTemplateV2Workbook.js'
import { parseSheetDate, planTeacherAssignmentRows } from './bulkRoster.js'

// AUD.I2b P1 (Codex, 21/10): una fecha de Excel llega como Date y se leia como "sin limite".
const today = new Date(2026, 9, 21)

async function workbookRows(cells) {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('docentes').addRows([['docente_id', 'apellido', 'nombre', 'dni_docente'], ['D1', 'Prueba', 'Docente', '20111222']])
  const sheet = workbook.addWorksheet('docente_materia')
  sheet.addRows([
    ['plan_id', 'carrera_id', 'materia_id', 'materia_codigo', 'docente_id', 'dni_docente', 'rol_en_materia', 'estado_asignacion', 'vigencia_desde', 'vigencia_hasta'],
    ...cells.map(([desde, hasta], index) => ['P1', 'Fixture Career A', `M${index + 1}`, `M${index + 1}`, 'D1', '20111222', 'TITULAR', 'ACTIVO', desde, hasta]),
  ])
  workbook.addWorksheet('horarios_docentes').addRow(['docente_id', 'dia', 'hora_inicio', 'hora_fin'])
  const buffer = await workbook.xlsx.writeBuffer()
  const parsed = await parseTemplateV2TeachersWorkbook({ name: 'fechas.xlsx', arrayBuffer: async () => buffer })
  return parsed.datasets.docenteMateria
}

describe('AUD.I2b P1: vigencias con fechas nativas de Excel', () => {
  it('reproduccion de Codex con el importador real: vencida y futura como Date no se asignan', async () => {
    const rows = await workbookRows([
      [null, new Date('2020-01-01T00:00:00Z')],
      [new Date('2099-01-01T00:00:00Z'), null],
      [new Date('2026-03-01T00:00:00Z'), new Date('2026-12-31T00:00:00Z')],
    ])
    expect(rows[0].vigencia_hasta).toBeInstanceOf(Date)
    const plan = planTeacherAssignmentRows(rows, { today })
    expect(plan.rows.map((row) => row.materia)).toEqual(['M3'])
    expect(plan.skipped.map((row) => [row.materia, row.motivo])).toEqual([['M1', 'VIGENCIA_VENCIDA'], ['M2', 'VIGENCIA_FUTURA']])
  })

  it('un valor no vacio que no es fecha se rechaza, no pasa como sin limite', () => {
    const base = { dni: '20111222', carrera: 'P', materia: 'M1', rol_en_materia: 'TITULAR' }
    const plan = planTeacherAssignmentRows([
      { ...base, vigencia_hasta: 'marzo' },
      { ...base, materia: 'M2', vigencia_desde: '2026-02-30' },
      { ...base, materia: 'M3', vigencia_hasta: new Date('invalid') },
      { ...base, materia: 'M4', vigencia_desde: '2026-10-01', vigencia_hasta: '2026-09-01' },
      { ...base, materia: 'M5', vigencia_desde: '  ', vigencia_hasta: null },
    ], { today })
    expect(plan.skipped.map((row) => [row.materia, row.estado, row.motivo])).toEqual([
      ['M1', 'rechazada', 'VIGENCIA_INVALIDA'],
      ['M2', 'rechazada', 'VIGENCIA_INVALIDA'],
      ['M3', 'rechazada', 'VIGENCIA_INVALIDA'],
      ['M4', 'rechazada', 'VIGENCIA_INVALIDA'],
    ])
    expect(plan.rows.map((row) => row.materia)).toEqual(['M5'])
  })

  it('normaliza Date (UTC), numero de serie de Excel, ISO con hora y DD/MM/AAAA', () => {
    expect(parseSheetDate(new Date('2026-10-21T00:00:00Z'))).toBe('2026-10-21')
    expect(parseSheetDate(46316)).toBe('2026-10-21')
    expect(parseSheetDate('2026-10-21T03:00:00.000Z')).toBe('2026-10-21')
    expect(parseSheetDate('21/10/2026')).toBe('2026-10-21')
    expect(parseSheetDate('1/2/2026')).toBe('2026-02-01')
    expect(parseSheetDate('')).toBe('')
    expect(parseSheetDate(undefined)).toBe('')
    expect(parseSheetDate('31/02/2026')).toBeNull()
    expect(parseSheetDate(-3)).toBeNull()
    expect(parseSheetDate('2026-10-21abc')).toBeNull()
  })
})
