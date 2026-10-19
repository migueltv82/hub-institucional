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
})
