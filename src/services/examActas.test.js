import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))

const {
  canPrintActa,
  formatArgentinaTime,
  formatRoomLabel,
  enrollStudentAsAdmin,
  fetchExamTablesOverview,
  getArgentinaDateKey,
  groupMesasByCareerAndYear,
  shiftDateKey,
  summarizeExamDays,
  summarizeMesas,
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

  it('se mueve de a un dia cruzando meses y anios', () => {
    expect(shiftDateKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDateKey('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('resume las fechas con mesas: cuantas llevan acta y cuantos alumnos rinden', () => {
    const mesas = [
      { mesa_id: 'a', inicio: '2026-11-02T11:00:00Z', inscriptos: 3 },
      { mesa_id: 'b', inicio: '2026-11-02T21:00:00Z', inscriptos: 0 },
      { mesa_id: 'c', inicio: '2026-11-03T01:30:00Z', inscriptos: 1 },
      { mesa_id: 'd', inicio: '2026-11-04T11:00:00Z', inscriptos: 2 },
    ]
    expect(summarizeExamDays(mesas)).toEqual([
      { dateKey: '2026-11-02', mesas: 3, actas: 2, sinInscriptos: 1, alumnos: 4 },
      { dateKey: '2026-11-04', mesas: 1, actas: 1, sinInscriptos: 0, alumnos: 2 },
    ])
    expect(summarizeMesas([])).toEqual({ mesas: 0, actas: 0, sinInscriptos: 0, alumnos: 0 })
  })

  it('avisa que falta actualizar la base si la funcion no existe todavia', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
    await expect(fetchExamTablesOverview({ institutionId: 'inst-1' })).rejects.toThrow('Falta actualizar la base de datos')
  })

  it('muestra la hora en formato de 24 h y el aula sin repetir la palabra', () => {
    expect(formatArgentinaTime('2026-11-02T21:00:00Z')).toBe('18:00')
    expect(formatRoomLabel('Aula 5')).toBe('Aula 5')
    expect(formatRoomLabel('A1')).toBe('Aula A1')
    expect(formatRoomLabel('')).toBe('Aula a confirmar')
  })
})
