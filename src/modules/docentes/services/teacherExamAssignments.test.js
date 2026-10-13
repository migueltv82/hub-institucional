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
    const rows = [{ id: '11111111-1111-4111-8111-111111111111', exam_table_id: '22222222-2222-4222-8222-222222222222', role: 'VOCAL_1', confirmation_status: 'objected', objection_reason: 'Conflicto de horario', objection_deadline: '2026-10-12T12:00:00Z', objected_at: '2026-10-10T12:00:00Z' }]
    const { fetchTeacherExamAssignments, from, rpc, queryBuilder } = await loadService({
      fromResult: { data: rows, error: null },
    })

    const result = await fetchTeacherExamAssignments({ institutionId: 'inst-1', teacherUserId: 'u1' })

    // Reconciliacion pendiente: leer no llama RPC ni cambia confirmaciones.
    expect(rpc).not.toHaveBeenCalled()
    expect(queryBuilder.select).toHaveBeenCalledWith('id, institution_id, workspace_key, exam_table_id, exam_table_subject_id, teacher_record_id, teacher_id, role, status, confirmation_status, objection_reason, objection_deadline, confirmed_at, objected_at, reset_at, metadata, created_at, updated_at')
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

  it('no reintenta con columnas legacy cuando falla el contrato canonico', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const error = { code: '42703', message: 'column objection_reason does not exist' }
      const { fetchTeacherExamAssignments, from, rpc, queryBuilder } = await loadService({
        fromResult: { data: null, error },
      })
      expect(await fetchTeacherExamAssignments({ institutionId: 'inst-1', workspaceKey: 'teacher-workspace', teacherUserId: 'u1' })).toEqual([])
      expect(queryBuilder.eq).toHaveBeenCalledWith('workspace_key', 'teacher-workspace')
      expect(from).toHaveBeenCalledTimes(1)
      expect(rpc).not.toHaveBeenCalled()
      expect(warning).toHaveBeenCalledWith('No se pudieron leer las mesas asignadas al docente.', error)
    } finally {
      warning.mockRestore()
    }
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
