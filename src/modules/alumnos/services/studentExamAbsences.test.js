import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAbsencePenaltyForExam } from '../lib/examEligibility.js'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../../../lib/supabase.js')
})

async function loadService(rpc = vi.fn()) {
  vi.resetModules()
  vi.doMock('../../../lib/supabase.js', () => ({ isSupabaseConfigured: true, supabase: { rpc } }))
  return import('./studentExamAbsences.js')
}

describe('studentExamAbsences (F1b)', () => {
  it('mapea el ausente del acta a la fila que lee el espejo, sin condicion ni nota', async () => {
    const { mapExamAbsenceRow } = await loadService()
    expect(mapExamAbsenceRow({ id: 'r1', subject_id: 'ING01', program_id: 'PROFESORADO DE INGLES', student_record_id: 's1', absent_at: '2026-10-19T21:00:00+00:00' })).toEqual({
      id: 'exam-absence-r1',
      subject_id: 'ING01',
      canonical_subject_id: 'ING01',
      program_id: 'PROFESORADO DE INGLES',
      canonical_program_id: 'PROFESORADO DE INGLES',
      student_record_id: 's1',
      ausente: true,
      fecha_ausencia: '2026-10-19T21:00:00+00:00',
      absent_at: '2026-10-19T21:00:00+00:00',
      academic_status: 'pending',
      grade_type: 'exam_absence',
      source: 'exam_absence',
      updated_at: '2026-10-19T21:00:00+00:00',
    })
  })

  it('lee los ausentes propios y, si la base no tiene la RPC, devuelve vacio (decide el servidor)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'r1', subject_id: 'ING01', program_id: 'P', absent_at: '2026-10-19T21:00:00Z' }], error: null })
    const service = await loadService(rpc)
    expect(await service.fetchStudentExamAbsences({ institutionId: 'i1' })).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('get_student_exam_absences', { target_institution_id: 'i1', target_workspace_key: 'main' })
    const missing = await loadService(vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } }))
    expect(await missing.fetchStudentExamAbsences({ institutionId: 'i1' })).toEqual([])
    expect(await missing.fetchStudentExamAbsences({ institutionId: '' })).toEqual([])
  })

  it('el espejo bloquea solo el primer llamado (periodo + llamado) posterior al ausente', async () => {
    const { mapExamAbsenceRow } = await loadService()
    const grades = [mapExamAbsenceRow({ id: 'r1', subject_id: 'ING01', program_id: 'P', absent_at: '2026-10-19T21:00:00Z' })]
    const exams = [
      { id: 'nov-1', subject_id: 'ING01', program_id: 'P', exam_call: 'first', exam_date: '2026-11-02T18:00:00' },
      { id: 'nov-2', subject_id: 'ING01', program_id: 'P', exam_call: 'second', exam_date: '2026-11-16T18:00:00' },
      { id: 'dic-1', subject_id: 'ING01', program_id: 'P', exam_call: 'first', exam_date: '2026-12-01T18:00:00' },
      { id: 'otra', subject_id: 'ING02', program_id: 'P', exam_call: 'first', exam_date: '2026-11-02T18:00:00' },
    ]
    const blocked = (id) => getAbsencePenaltyForExam({ exam: exams.find((exam) => exam.id === id), exams, grades }).blocked
    expect(blocked('nov-1')).toBe(true)
    expect(blocked('nov-2')).toBe(false)
    expect(blocked('dic-1')).toBe(false)
    expect(blocked('otra')).toBe(false)
  })
})
