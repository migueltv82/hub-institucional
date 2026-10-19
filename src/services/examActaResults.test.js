import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

async function loadService(rpc = vi.fn()) {
  vi.resetModules()
  vi.doMock('../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))
  return import('./examActaResults.js')
}

describe('examActaResults', () => {
  it('espeja el calculo de la RPC: nota final, promedio, aprobado con 4 y ausente', async () => {
    const { previewActaRow } = await loadService()
    expect(previewActaRow({ nota: '7' })).toEqual({ final: 7, result: 'approved' })
    expect(previewActaRow({ nota: '3,99' })).toEqual({ final: 3.99, result: 'failed' })
    expect(previewActaRow({ escrito: '3', oral: '4' })).toEqual({ final: 3.5, result: 'failed' })
    expect(previewActaRow({ escrito: '4', oral: '' })).toEqual({ final: 4, result: 'approved' })
    expect(previewActaRow({ escrito: '2', oral: '9', nota: '5' })).toEqual({ final: 5, result: 'approved' })
    expect(previewActaRow({ ausente: true })).toEqual({ final: null, result: 'absent' })
    expect(previewActaRow({})).toEqual({ final: null, result: '' })
  })

  it('arma el borrador desde el roster y resume el acta', async () => {
    const { buildActaDraft, summarizeActa } = await loadService()
    const draft = buildActaDraft([
      { inscripcion_id: 'e1', resultado: 'approved', escrito: 7, oral: null, nota: 7 },
      { inscripcion_id: 'e2', resultado: 'absent' },
      { inscripcion_id: 'e3' },
    ])
    expect(draft).toEqual([
      { inscripcion_id: 'e1', ausente: false, escrito: '7', oral: '', nota: '7' },
      { inscripcion_id: 'e2', ausente: true, escrito: '', oral: '', nota: '' },
      { inscripcion_id: 'e3', ausente: false, escrito: '', oral: '', nota: '' },
    ])
    expect(summarizeActa(draft)).toEqual({ total: 3, aprobados: 1, desaprobados: 0, ausentes: 1, sinCargar: 1 })
  })

  it('valida antes de enviar y solo manda filas con datos', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { guardados: 1, acta_cerrada: false }, error: null })
    const service = await loadService(rpc)
    await expect(service.saveExamActaResults({ institutionId: 'i', examKey: 'm', rows: [{ inscripcion_id: 'e1', ausente: true, nota: '5' }] })).rejects.toThrow('ausente')
    await expect(service.saveExamActaResults({ institutionId: 'i', examKey: 'm', rows: [{ inscripcion_id: 'e1', nota: '11' }] })).rejects.toThrow('0 a 10')
    expect(rpc).not.toHaveBeenCalled()

    const result = await service.saveExamActaResults({ institutionId: 'i', examKey: ' m ', rows: [{ inscripcion_id: 'e1', nota: '8' }, { inscripcion_id: 'e2', escrito: '', oral: '', nota: '' }], close: true })
    expect(result).toEqual({ guardados: 1, actaCerrada: false })
    expect(rpc).toHaveBeenCalledWith('exam_save_acta_results', {
      target_institution_id: 'i',
      target_workspace_key: 'main',
      target_exam_key: 'm',
      target_results: [{ inscripcion_id: 'e1', ausente: false, escrito: '', oral: '', nota: '8' }],
      target_close: true,
      target_reason: null,
    })
  })

  it('traduce los errores de la base', async () => {
    const cases = [
      [{ message: 'EXAM_ACTA_CLOSED' }, 'secretaria'],
      [{ message: 'EXAM_ACTA_INCOMPLETE' }, 'todos los inscriptos'],
      [{ message: 'EXAM_NOT_TAKEN_YET' }, 'dia del examen'],
      [{ code: '42501', message: 'x' }, 'titular'],
      [{ code: 'PGRST202', message: 'x' }, 'actualizar la base'],
    ]
    for (const [error, text] of cases) {
      const service = await loadService(vi.fn().mockResolvedValue({ data: null, error }))
      await expect(service.saveExamActaResults({ institutionId: 'i', examKey: 'm', rows: [] })).rejects.toThrow(text)
    }
  })
})
