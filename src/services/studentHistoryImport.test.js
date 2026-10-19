import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

async function loadService(rpc = vi.fn()) {
  vi.resetModules()
  vi.doMock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))
  return { service: await import('./studentHistoryImport.js'), rpc }
}

async function workbookFrom(rows, sheetName = 'historia_academica') {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName)
  rows.forEach((row) => sheet.addRow(row))
  const reloaded = new ExcelJS.Workbook()
  await reloaded.xlsx.load(await workbook.xlsx.writeBuffer())
  return reloaded
}

describe('studentHistoryImport', () => {
  it('lee la hoja con alias de columnas, numero de fila y fechas de Excel', async () => {
    const { service } = await loadService()
    const workbook = await workbookFrom([
      ['DNI', 'Carrera', 'Materia', 'Condición', 'Nota', 'Fecha', 'Libro', 'Folio'],
      ['30.111.222', 'ING', 'ING01', 'Aprobada', 8, new Date(Date.UTC(2024, 11, 15)), 3, 27],
      [],
      ['30111222', 'ING', 'ING02', 'regular', '', '', '', ''],
    ], 'Hoja1')

    expect(service.readHistoryRowsFromWorkbook(workbook)).toEqual([
      { fila: '2', dni: '30.111.222', carrera: 'ING', materia: 'ING01', condicion: 'Aprobada', nota: '8', fecha: '15/12/2024', libro: '3', folio: '27' },
      { fila: '4', dni: '30111222', carrera: 'ING', materia: 'ING02', condicion: 'regular', nota: '', fecha: '', libro: '', folio: '' },
    ])
  })

  it('explica que columnas faltan o que no hay hoja de historia', async () => {
    const { service } = await loadService()
    expect(() => service.readHistoryRowsFromWorkbook(new ExcelJS.Workbook())).toThrow('historia_academica')
    const workbook = await workbookFrom([['dni', 'condicion']])
    expect(() => service.readHistoryRowsFromWorkbook(workbook)).toThrow('carrera, materia')
  })

  it('la plantilla descargable se puede volver a leer', async () => {
    const { service } = await loadService()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await service.buildStudentHistoryTemplateBuffer())
    const rows = service.readHistoryRowsFromWorkbook(workbook)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ dni: '30111222', materia: 'ING01', condicion: 'aprobada', fecha: '15/12/2024' })
  })

  it('importa en lotes de 500 y suma los reportes', async () => {
    const rpc = vi.fn().mockImplementation(async (_name, { p_rows: rows }) => ({
      data: { procesadas: rows.length, importadas: rows.length - 1, actualizadas: 0, omitidas: 0, rechazadas: 1, problemas: [{ fila: rows[0].fila, motivo: 'ALUMNO_NO_ENCONTRADO' }] },
      error: null,
    }))
    const { service } = await loadService(rpc)
    const rows = Array.from({ length: 1201 }, (_, index) => ({ fila: String(index + 2) }))
    const progress = vi.fn()

    const report = await service.importStudentHistory({ institutionId: 'inst-1', rows, onProgress: progress })

    expect(rpc).toHaveBeenCalledTimes(3)
    expect(rpc).toHaveBeenNthCalledWith(1, 'academic_admin_import_student_history', expect.objectContaining({ p_institution_id: 'inst-1', p_workspace_key: 'main' }))
    expect(rpc.mock.calls.map(([, args]) => args.p_rows.length)).toEqual([500, 500, 201])
    expect(report).toMatchObject({ procesadas: 1201, importadas: 1198, rechazadas: 3 })
    expect(report.problemas.map((item) => item.fila)).toEqual(['2', '502', '1002'])
    expect(progress).toHaveBeenLastCalledWith({ done: 1201, total: 1201 })
  })

  it('traduce permisos y migracion faltante, y devuelve lo ya importado', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { procesadas: 500, importadas: 500 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Acceso denegado' } })
    const { service } = await loadService(rpc)
    const rows = Array.from({ length: 600 }, (_, index) => ({ fila: String(index) }))

    const failure = await service.importStudentHistory({ institutionId: 'inst-1', rows }).catch((error) => error)
    expect(failure.message).toContain('owner, admin o editor')
    expect(failure.partialReport.importadas).toBe(500)

    const missing = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    const { service: second } = await loadService(missing)
    await expect(second.importStudentHistory({ institutionId: 'inst-1', rows: [{}] })).rejects.toThrow('actualizar la base de datos')
  })

  it('describe cada motivo del servidor en castellano', async () => {
    const { service } = await loadService()
    expect(service.describeHistoryReason('YA_TIENE_NOTAS_DEL_SISTEMA')).toContain('no se pisan')
    expect(service.describeHistoryReason('OTRO')).toBe('OTRO')
    await expect(service.importStudentHistory({ institutionId: '', rows: [] })).rejects.toThrow('institucion activa')
  })
})
