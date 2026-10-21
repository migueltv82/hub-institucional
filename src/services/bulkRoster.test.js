import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

async function loadService(rpc = vi.fn()) {
  vi.resetModules()
  vi.doMock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))
  return import('./bulkRoster.js')
}

describe('bulkRoster (I2b)', () => {
  it('arma filas de titularidades y cursadas desde lo que dejo el importador', async () => {
    const service = await loadService()
    expect(service.buildTeacherAssignmentRows([
      { dni: '20111222', carrera: 'PROFESORADO DE INGLES', materia: 'ING01', rol_en_materia: 'TITULAR' },
      { dni_docente: '20333444', carrera_id: 'ING', materia_codigo: 'ING02' },
      {},
    ])).toEqual([
      { fila: '1', dni: '20111222', carrera: 'PROFESORADO DE INGLES', materia: 'ING01', rol: 'TITULAR' },
      { fila: '2', dni: '20333444', carrera: 'ING', materia: 'ING02', rol: '' },
    ])
    expect(service.buildStudentEnrollmentRows([
      { id: 'dni-1::ing::ing01', dni: '30111222', carrera: 'PROFESORADO DE INGLES', carrera_id: 'ING', materia_codigo: 'ING01' },
    ])).toEqual([{ fila: '1', dni: '30111222', carrera: 'PROFESORADO DE INGLES', materia: 'ING01' }])
  })

  it('respeta estado_asignacion y vigencia de docente_materia: renuncias, bajas y vencidas no se asignan', async () => {
    const service = await loadService()
    const today = new Date(2026, 9, 20)
    const base = { dni: '20111222', carrera: 'P', rol_en_materia: 'TITULAR' }
    const plan = service.planTeacherAssignmentRows([
      { ...base, materia: 'A1', estado_asignacion: 'ACTIVO', vigencia_desde: '2026-03-01' },
      { ...base, materia: 'A2', estado_asignacion: 'LICENCIA' },
      { ...base, materia: 'A3', estado_asignacion: 'RENUNCIA' },
      { ...base, materia: 'A4', estado_asignacion: 'baja' },
      { ...base, materia: 'A5', estado_asignacion: 'REEMPLAZADO' },
      { ...base, materia: 'A6', vigencia_hasta: '19/10/2026' },
      { ...base, materia: 'A7', vigencia_desde: '2027-03-01' },
      { ...base, materia: 'A8', estado_asignacion: 'JUBILADO' },
      { ...base, materia: 'A9', vigencia_hasta: '2026-10-20' },
    ], { today })
    expect(plan.rows.map((row) => [row.materia, row.rol])).toEqual([['A1', 'TITULAR'], ['A2', 'licencia'], ['A9', 'TITULAR']])
    expect(plan.skipped.map((row) => [row.fila, row.materia, row.estado, row.motivo])).toEqual([
      ['3', 'A3', 'omitida', 'ASIGNACION_NO_VIGENTE'],
      ['4', 'A4', 'omitida', 'ASIGNACION_NO_VIGENTE'],
      ['5', 'A5', 'omitida', 'ASIGNACION_NO_VIGENTE'],
      ['6', 'A6', 'omitida', 'VIGENCIA_VENCIDA'],
      ['7', 'A7', 'omitida', 'VIGENCIA_FUTURA'],
      ['8', 'A8', 'rechazada', 'ESTADO_ASIGNACION_INVALIDO'],
    ])
    expect(service.buildTeacherAssignmentRows([{ ...base, materia: 'A3', estado_asignacion: 'RENUNCIA' }], { today })).toEqual([])
    expect(service.describeBulkRosterReason('ASIGNACION_NO_VIGENTE')).toContain('ficha del docente')
  })

  it('las filas descartadas antes de la base cuentan en el reporte sin llamar a la RPC por ellas', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { procesadas: 1, creadas: 1, problemas: [] }, error: null })
    const service = await loadService(rpc)
    const skipped = [
      { fila: '3', estado: 'omitida', motivo: 'ASIGNACION_NO_VIGENTE' },
      { fila: '8', estado: 'rechazada', motivo: 'ESTADO_ASIGNACION_INVALIDO' },
    ]
    const report = await service.applyTeacherAssignments({ institutionId: 'i1', rows: [{ fila: '1' }], skipped })
    expect(report).toMatchObject({ procesadas: 3, creadas: 1, omitidas: 1, rechazadas: 1 })
    expect(report.problemas).toEqual(skipped)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][1].p_rows).toEqual([{ fila: '1' }])
  })

  it('envia por lotes a cada RPC y suma los reportes', async () => {
    const rpc = vi.fn().mockImplementation(async (_name, { p_rows: rows }) => ({ data: { procesadas: rows.length, creadas: rows.length, problemas: [] }, error: null }))
    const service = await loadService(rpc)
    const rows = Array.from({ length: 700 }, (_, index) => ({ fila: String(index) }))
    const teachers = await service.applyTeacherAssignments({ institutionId: 'i1', rows })
    expect(teachers).toMatchObject({ procesadas: 700, creadas: 700 })
    expect(rpc.mock.calls.map(([name, args]) => [name, args.p_rows.length])).toEqual([['academic_admin_bulk_assign_teachers', 500], ['academic_admin_bulk_assign_teachers', 200]])
    await service.applyStudentEnrollments({ institutionId: 'i1', rows: rows.slice(0, 1) })
    expect(rpc).toHaveBeenLastCalledWith('academic_admin_bulk_enroll_students', { p_institution_id: 'i1', p_workspace_key: 'main', p_rows: [{ fila: '0' }] })
  })

  it('traduce errores y explica cada motivo', async () => {
    const service = await loadService(vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } }))
    await expect(service.applyStudentEnrollments({ institutionId: 'i1', rows: [{}] })).rejects.toThrow('owner, admin o editor')
    expect(service.describeBulkRosterReason('CURSADA_DADA_DE_BAJA')).toContain('no se reactiva')
    expect(service.describeBulkRosterReason('DOCENTE_SIN_CUENTA')).toContain('Crear accesos docentes')
  })

  it('AUD.I2b P2: si el workspace esta ocupado (55P03 del gateway) reintenta el mismo lote', async () => {
    const busy = { data: null, error: { code: '55P03', message: 'SOURCE_FILE_WORKSPACE_BUSY' } }
    const rpc = vi.fn()
      .mockResolvedValueOnce(busy)
      .mockResolvedValueOnce(busy)
      .mockResolvedValueOnce({ data: { procesadas: 2, creadas: 1, sin_cambios: 1, problemas: [] }, error: null })
    const service = await loadService(rpc)
    const report = await service.applyTeacherAssignments({ institutionId: 'i1', rows: [{ fila: '1' }, { fila: '2' }], busyRetryDelayMs: 0 })
    expect(rpc).toHaveBeenCalledTimes(3)
    expect(new Set(rpc.mock.calls.map(([, args]) => JSON.stringify(args.p_rows))).size).toBe(1)
    expect(report).toMatchObject({ procesadas: 2, creadas: 1, sin_cambios: 1 })
  })

  it('AUD.I2b P2: si sigue ocupado se rinde con un mensaje claro y no reintenta otros errores', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '55P03', message: 'SOURCE_FILE_WORKSPACE_BUSY' } })
    const service = await loadService(rpc)
    await expect(service.applyStudentEnrollments({ institutionId: 'i1', rows: [{}], busyRetryDelayMs: 0 })).rejects.toThrow('otra carga o guardado en curso')
    expect(rpc).toHaveBeenCalledTimes(service.BULK_ROSTER_BUSY_ATTEMPTS)

    const denied = vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } })
    const other = await loadService(denied)
    await expect(other.applyStudentEnrollments({ institutionId: 'i1', rows: [{}], busyRetryDelayMs: 0 })).rejects.toThrow('owner, admin o editor')
    expect(denied).toHaveBeenCalledTimes(1)
  })
})
