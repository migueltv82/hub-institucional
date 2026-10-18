import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))

const {
  canPrintActa,
  enrollStudentAsAdmin,
  fetchExamTablesOverview,
  getArgentinaDateKey,
  groupMesasByCareerAndYear,
} = await import('./examActas.js')

describe('examActas', () => {
  beforeEach(() => rpc.mockReset())

  it('no genera acta para mesas sin inscriptos', () => {
    expect(canPrintActa({ inscriptos: 0 })).toBe(false)
    expect(canPrintActa({ inscriptos: '0' })).toBe(false)
    expect(canPrintActa({ inscriptos: 3 })).toBe(true)
  })

  it('agrupa por carrera y anio, y ordena las mesas por horario', () => {
    const groups = groupMesasByCareerAndYear([
      { mesa_id: 'b', carrera: 'Profesorado de Ingles', anio: 2, inicio: '2026-11-02T22:00:00Z', materia: 'B' },
      { mesa_id: 'a', carrera: 'Profesorado de Ingles', anio: 2, inicio: '2026-11-02T21:00:00Z', materia: 'A' },
      { mesa_id: 'c', carrera: 'Profesorado de Ingles', anio: 1, inicio: '2026-11-02T23:00:00Z', materia: 'C' },
      { mesa_id: 'd', carrera: 'Profesorado de Geografia', anio: 4, inicio: '2026-11-02T21:00:00Z', materia: 'D' },
    ])
    expect(groups.map((group) => [group.carrera, group.anios.map((year) => [year.anio, year.mesas.map((mesa) => mesa.mesa_id)])])).toEqual([
      ['Profesorado de Geografia', [[4, ['d']]]],
      ['Profesorado de Ingles', [[1, ['c']], [2, ['a', 'b']]]],
    ])
  })

  it('usa el dia de Argentina para filtrar por fecha de examen', () => {
    // 01:30 UTC del 3/11 todavia es 2/11 en Argentina.
    expect(getArgentinaDateKey('2026-11-03T01:30:00Z')).toBe('2026-11-02')
  })

  it('pide las mesas al panel admin y traduce el rechazo de permisos', async () => {
    rpc.mockResolvedValueOnce({ data: [{ mesa_id: 'm1' }], error: null })
    await expect(fetchExamTablesOverview({ institutionId: 'inst-1' })).resolves.toEqual([{ mesa_id: 'm1' }])
    expect(rpc).toHaveBeenCalledWith('get_exam_tables_admin_overview', { target_institution_id: 'inst-1', target_workspace_key: 'main' })

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Acceso denegado' } })
    await expect(fetchExamTablesOverview({ institutionId: 'inst-1' })).rejects.toThrow('Tu rol no permite gestionar mesas y actas.')
  })

  it('inscripcion especial: exige motivo y explica por que la base la rechaza', async () => {
    await expect(enrollStudentAsAdmin({ institutionId: 'inst-1', examKey: 'm1', studentRecordId: 's1', reason: 'no' }))
      .rejects.toThrow('Escribi el motivo')
    expect(rpc).not.toHaveBeenCalled()

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'EXAM_REGULARITY_REQUIRED' } })
    await expect(enrollStudentAsAdmin({ institutionId: 'inst-1', examKey: 'm1', studentRecordId: 's1', reason: 'Certificado medico' }))
      .rejects.toThrow('no figura regular')
    expect(rpc).toHaveBeenCalledWith('admin_enroll_student_in_exam_table', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_exam_key: 'm1',
      target_student_record_id: 's1',
      target_reason: 'Certificado medico',
    })
  })
})
