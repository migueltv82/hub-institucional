import { afterEach, describe, expect, it, vi } from 'vitest'

function createQueryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
  }
  return builder
}

async function loadService({
  isSupabaseConfigured = true,
  fromResult = { data: [], error: null },
  fromResults = null,
  rpcResult = { data: null, error: null },
} = {}) {
  vi.resetModules()

  const results = fromResults ?? [fromResult]
  const queryBuilders = results.map(createQueryBuilder)
  let queryIndex = 0
  const from = vi.fn(() => queryBuilders[Math.min(queryIndex++, queryBuilders.length - 1)])
  const rpc = vi.fn().mockResolvedValue(rpcResult)

  vi.doMock('../../../lib/supabase.js', () => ({
    isSupabaseConfigured,
    supabase: isSupabaseConfigured ? { from, rpc } : null,
  }))

  const module = await import('./teacherExamAssignments.js')

  return { ...module, from, rpc, queryBuilder: queryBuilders[0], queryBuilders }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../../../lib/supabase.js')
})

describe('fetchTeacherExamAssignments', () => {
  it('carga las mesas publicadas para el docente autenticado', async () => {
    const rows = [{ id: 'a1', exam_table_id: 'draft:mesa-1', role: 'VOCAL_1', confirmation_status: 'pending' }]
    const { fetchTeacherExamAssignments, from, rpc, queryBuilder } = await loadService({
      fromResult: { data: rows, error: null },
    })

    const result = await fetchTeacherExamAssignments({ institutionId: 'inst-1', teacherUserId: 'u1' })

    expect(rpc).toHaveBeenCalledWith('academic_reconcile_expired_exam_confirmations', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_exam_table_id: '',
    })
    expect(from).toHaveBeenCalledWith('exam_teacher_assignments')
    expect(queryBuilder.eq).toHaveBeenCalledWith('institution_id', 'inst-1')
    expect(queryBuilder.eq).toHaveBeenCalledWith('workspace_key', 'main')
    expect(queryBuilder.eq).toHaveBeenCalledWith('teacher_id', 'u1')
    expect(queryBuilder.eq).toHaveBeenCalledWith('status', 'active')
    expect(result).toEqual(rows)
  })

  it('devuelve vacio sin institucion o sin usuario, sin llamar a Supabase', async () => {
    const { fetchTeacherExamAssignments, from } = await loadService()

    expect(await fetchTeacherExamAssignments({ teacherUserId: 'u1' })).toEqual([])
    expect(await fetchTeacherExamAssignments({ institutionId: 'inst-1' })).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('devuelve vacio y no lanza si Supabase responde error', async () => {
    const { fetchTeacherExamAssignments } = await loadService({
      fromResult: { data: null, error: { message: 'boom' } },
    })

    const result = await fetchTeacherExamAssignments({ institutionId: 'inst-1', teacherUserId: 'u1' })

    expect(result).toEqual([])
  })
})

describe('confirmTeacherExamAssignment', () => {
  it('confirma una mesa via RPC', async () => {
    const { confirmTeacherExamAssignment, rpc } = await loadService({
      rpcResult: { data: { confirmation_status: 'confirmed' }, error: null },
    })

    const result = await confirmTeacherExamAssignment({
      institutionId: 'inst-1',
      examTableId: 'draft:mesa-1',
      confirmationStatus: 'confirmed',
      teacherNotes: 'Todo bien',
    })

    expect(rpc).toHaveBeenCalledWith('academic_teacher_confirm_exam_assignment', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_exam_table_id: 'draft:mesa-1',
      target_confirmation_status: 'confirmed',
      target_teacher_notes: 'Todo bien',
    })
    expect(result).toEqual({ success: true, data: { confirmation_status: 'confirmed' } })
  })

  it('rechaza un estado de confirmacion invalido sin llamar a Supabase', async () => {
    const { confirmTeacherExamAssignment, rpc } = await loadService()

    const result = await confirmTeacherExamAssignment({
      institutionId: 'inst-1',
      examTableId: 'draft:mesa-1',
      confirmationStatus: 'pending',
    })

    expect(rpc).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, error: 'Estado de confirmacion invalido.' })
  })

  it('recupera las mesas existentes si la migracion de reubicacion aun no fue aplicada', async () => {
    const legacyRows = [{ id: 'a1', exam_table_id: 'mesa-1', confirmation_status: 'pending' }]
    const { fetchTeacherExamAssignments, from, queryBuilders } = await loadService({
      fromResults: [
        { data: null, error: { code: '42703', message: 'column requested_exam_table_id does not exist' } },
        { data: legacyRows, error: null },
      ],
    })

    const result = await fetchTeacherExamAssignments({ institutionId: 'inst-1', teacherUserId: 'u1' })

    expect(from).toHaveBeenCalledTimes(2)
    expect(queryBuilders[1].select).toHaveBeenCalledWith(expect.not.stringContaining('requested_exam_table_id'))
    expect(result).toEqual(legacyRows)
  })

  it('registra una objecion con solicitud de reubicacion mediante la RPC especifica', async () => {
    const { confirmTeacherExamAssignment, rpc } = await loadService({
      rpcResult: { data: { reassignment_status: 'requested' }, error: null },
    })

    await confirmTeacherExamAssignment({
      institutionId: 'inst-1', examTableId: 'mesa-origen',
      confirmationStatus: 'objected', teacherNotes: 'No puedo esa fecha',
      reassignmentOption: {
        targetExamTableId: 'mesa-destino', targetRole: 'VOCAL_2', fecha: '2026-08-12',
      },
    })

    expect(rpc).toHaveBeenCalledWith('academic_teacher_object_exam_assignment', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_exam_table_id: 'mesa-origen',
      target_teacher_notes: 'No puedo esa fecha',
      target_requested_exam_table_id: 'mesa-destino',
      target_requested_role: 'VOCAL_2',
      target_requested_date: '2026-08-12',
    })
  })

  it('devuelve el error del servidor si la RPC falla', async () => {
    const { confirmTeacherExamAssignment } = await loadService({
      rpcResult: { data: null, error: { message: 'No se encontro una mesa asignada a este docente para confirmar.' } },
    })

    const result = await confirmTeacherExamAssignment({
      institutionId: 'inst-1',
      examTableId: 'draft:mesa-ajena',
      confirmationStatus: 'objected',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('No se encontro una mesa asignada')
  })
})
