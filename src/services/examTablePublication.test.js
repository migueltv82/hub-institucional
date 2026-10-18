import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc: (...args) => rpc(...args) } }))

const { buildExamPublicationPayload, describeExamPublication, publishExamTables } = await import('./examTablePublication.js')

const mesa = {
  id: 'exam-engine-v21-m1-2026-11-02', materia: 'UAT01', codigo: 'UAT01', carrera: 'PROFESORADO DE PRUEBA UAT', fechaIso: '2026-11-02',
  inicio: '18:00', fin: '20:00', aula: 'A1', profesorTitular: 'DOCENTE Uat', vocal1: 'X', alertasFinales: [{ code: 'a' }], estado: 'confirmada',
}

describe('examTablePublication', () => {
  beforeEach(() => rpc.mockReset())

  it('manda a la RPC solo los campos de la mesa y los nombres del tribunal, sin alertas', () => {
    expect(buildExamPublicationPayload([mesa, null, { id: 'x', aula: '  ' }])).toEqual([
      { id: mesa.id, materia: 'UAT01', codigo: 'UAT01', carrera: 'PROFESORADO DE PRUEBA UAT', fechaIso: '2026-11-02', inicio: '18:00', fin: '20:00', aula: 'A1', profesorTitular: 'DOCENTE Uat', vocal1: 'X' },
      { id: 'x' },
    ])
  })

  it('manda los DNI del tribunal como texto separado por comas (EX.7)', () => {
    expect(buildExamPublicationPayload([{ id: 'm1', tribunal_dnis: ['90000001', '90000004'] }, { id: 'm2', tribunal_dnis: [] }])).toEqual([
      { id: 'm1', tribunal_dnis: '90000001,90000004' },
      { id: 'm2' },
    ])
  })

  it('llama a publish_exam_tables_from_schedule y resume el resultado', async () => {
    rpc.mockResolvedValue({ data: { publicadas: 1, nuevas: 1, actualizadas: 0, canceladas: 0, omitidas: [{ id: 'm3', motivo: 'La materia ZZZ no esta.' }], conservadas_con_inscriptos: [] }, error: null })

    const result = await publishExamTables({ institutionId: 'inst-1', workspaceKey: 'main', cronograma: [mesa] })

    expect(rpc).toHaveBeenCalledWith('publish_exam_tables_from_schedule', expect.objectContaining({ target_institution_id: 'inst-1', target_workspace_key: 'main' }))
    expect(describeExamPublication(result)).toEqual([
      '1 mesas abiertas para inscripcion (1 nuevas, 0 actualizadas).',
      'No se publico m3: La materia ZZZ no esta.',
    ])
  })

  it('traduce el rechazo por permisos', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Acceso denegado' } })
    await expect(publishExamTables({ institutionId: 'inst-1', cronograma: [mesa] })).rejects.toThrow('Tu rol no permite publicar mesas para los alumnos.')
  })
})
