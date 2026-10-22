import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))

const { fetchExamTableRoster } = await import('./teacherExamRoster.js')

describe('fetchExamTableRoster', () => {
  beforeEach(() => rpc.mockReset())

  it('pide los inscriptos de la mesa publicada por su id', async () => {
    rpc.mockResolvedValue({ data: { estado: 'open', alumnos: [{ nombre: 'Ana Regular', dni: '11111111' }] }, error: null })

    const result = await fetchExamTableRoster({ institutionId: 'inst-1', examKey: ' exam-engine-v21-m1-2026-11-02 ' })

    expect(rpc).toHaveBeenCalledWith('get_exam_table_roster', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_exam_key: 'exam-engine-v21-m1-2026-11-02',
    })
    expect(result).toEqual({ estado: 'open', alumnos: [{ nombre: 'Ana Regular', dni: '11111111' }], actaCerrada: false, puedeCargarNotas: false, fechaExamen: null })
  })

  it('traduce el rechazo de permisos sin mostrar el error tecnico', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Acceso denegado' } })
    await expect(fetchExamTableRoster({ institutionId: 'inst-1', examKey: 'm1' }))
      .rejects.toThrow('Solo el titular de la mesa puede ver los inscriptos.')
  })

  it('explica cuando la mesa no esta publicada', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'EXAM_TABLE_NOT_FOUND' } })
    await expect(fetchExamTableRoster({ institutionId: 'inst-1', examKey: 'm1' }))
      .rejects.toThrow('La mesa todavia no esta publicada para inscripcion.')
  })
})
