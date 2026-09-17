import { afterEach, describe, expect, it, vi } from 'vitest'

function createQueryBuilder(result, resultSequence) {
  const queue = Array.isArray(resultSequence) ? [...resultSequence] : null
  const builder = {
    upsert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(queue?.length ? queue.shift() : result).then(resolve, reject),
  }
  return builder
}

async function loadService({
  isSupabaseConfigured = true,
  fromResult = { data: [], error: null },
  fromResults,
  rpcImplementation,
} = {}) {
  vi.resetModules()

  const queryBuilder = createQueryBuilder(fromResult, fromResults)
  const from = vi.fn(() => queryBuilder)
  const rpc = vi.fn(rpcImplementation ?? (() => Promise.resolve({ data: [], error: null })))

  vi.doMock('../lib/supabase.js', () => ({
    isSupabaseConfigured,
    supabase: isSupabaseConfigured ? { from, rpc } : null,
  }))

  const module = await import('./examTeacherAssignments.js')

  return { ...module, from, rpc, queryBuilder }
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

function mesaTitularYVocales(overrides = {}) {
  return {
    draftMesaId: 'draft:prof-historia::MAT1:PRIMER_LLAMADO',
    materiaMesa: 'Didactica General',
    fechaSugerida: '2026-08-10',
    carrera: 'Profesorado de Historia',
    anio: 1,
    llamado: 'PRIMER_LLAMADO',
    titularId: 'doc-titular',
    titular: 'Ana Titular',
    vocal1Id: 'doc-vocal-a',
    vocal1: 'Bruno Vocal',
    vocal2Id: 'doc-vocal-b',
    vocal2: 'Carla Vocal',
    ...overrides,
  }
}

function docentesBase() {
  return [
    { id: 'doc-titular', nombre: 'Ana Titular', email: 'ana@instituto.edu' },
    { id: 'doc-vocal-a', nombre: 'Bruno Vocal', email: 'bruno@instituto.edu' },
    { id: 'doc-vocal-b', nombre: 'Carla Vocal', email: '' },
  ]
}

describe('publishExamTeacherAssignmentsForReview', () => {
  it('publica una fila por cada rol con email resuelto y omite al docente sin email', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'))

    const { publishExamTeacherAssignmentsForReview, from, rpc, queryBuilder } = await loadService({
      fromResult: { data: [{ id: 'row-1' }, { id: 'row-2' }], error: null },
      rpcImplementation: (fn, args) => Promise.resolve({
        data: [{ user_id: args.target_email === 'ana@instituto.edu' ? 'uid-ana' : 'uid-bruno' }],
        error: null,
      }),
    })

    const result = await publishExamTeacherAssignmentsForReview({
      institutionId: 'inst-1',
      mesas: [mesaTitularYVocales()],
      docentes: docentesBase(),
    })

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(from).toHaveBeenCalledWith('exam_teacher_assignments')
    expect(queryBuilder.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: 'TITULAR',
          teacher_id: 'uid-ana',
          exam_table_id: mesaTitularYVocales().draftMesaId,
          confirmation_status: 'pending',
          objection_deadline: '2026-09-15T12:00:00.000Z',
          deleted_at: null,
          deleted_by: null,
        }),
        expect.objectContaining({ role: 'VOCAL_1', teacher_id: 'uid-bruno' }),
      ],
      { onConflict: 'institution_id,workspace_key,exam_table_id,teacher_id' },
    )
    expect(result.success).toBe(true)
    expect(result.published).toBe(2)
    expect(result.skippedNoEmail).toHaveLength(1)
    expect(result.skippedNoEmail[0]).toMatchObject({ role: 'VOCAL_2', docenteId: 'doc-vocal-b' })
  })

  it('devuelve una guia clara si falta la tabla de asignaciones docentes de mesas', async () => {
    const { publishExamTeacherAssignmentsForReview } = await loadService({
      fromResult: {
        data: null,
        error: {
          code: 'PGRST205',
          message: "Could not find the table 'public.exam_teacher_assignments' in the schema cache",
        },
      },
      rpcImplementation: () => Promise.resolve({ data: [{ user_id: 'uid-ana' }], error: null }),
    })

    const result = await publishExamTeacherAssignmentsForReview({
      institutionId: 'inst-1',
      mesas: [mesaTitularYVocales({ vocal1Id: '', vocal1: '', vocal2Id: '', vocal2: '' })],
      docentes: [{ id: 'doc-titular', nombre: 'Ana Titular', email: 'ana@instituto.edu' }],
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('repair_06_exam_teacher_assignments.sql')
  })

  it('reintenta sin objection_deadline cuando el schema remoto aun no tiene la columna', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'))

    const { publishExamTeacherAssignmentsForReview, queryBuilder } = await loadService({
      fromResults: [
        {
          data: null,
          error: {
            code: 'PGRST204',
            message: "Could not find the 'objection_deadline' column of 'exam_teacher_assignments' in the schema cache",
          },
        },
        { data: [{ id: 'row-1' }], error: null },
      ],
      rpcImplementation: () => Promise.resolve({ data: [{ user_id: 'uid-ana' }], error: null }),
    })

    const result = await publishExamTeacherAssignmentsForReview({
      institutionId: 'inst-1',
      mesas: [mesaTitularYVocales({ vocal1Id: '', vocal1: '', vocal2Id: '', vocal2: '' })],
      docentes: [{ id: 'doc-titular', nombre: 'Ana Titular', email: 'ana@instituto.edu' }],
    })

    expect(queryBuilder.upsert).toHaveBeenCalledTimes(2)
    expect(queryBuilder.upsert.mock.calls[0][0][0]).toHaveProperty('objection_deadline', '2026-09-15T12:00:00.000Z')
    expect(queryBuilder.upsert.mock.calls[1][0][0]).not.toHaveProperty('objection_deadline')
    expect(result.success).toBe(true)
    expect(result.published).toBe(1)
  })

  it('resuelve por el email sintetico de DNI cuando el docente no tiene email cargado en la planilla', async () => {
    const docentes = [
      { id: 'doc-titular', nombre: 'Ana Titular', email: '', dni: '30071977' },
      { id: 'doc-vocal-a', nombre: 'Bruno Vocal', email: '' },
      { id: 'doc-vocal-b', nombre: 'Carla Vocal', email: '' },
    ]
    const { publishExamTeacherAssignmentsForReview, rpc } = await loadService({
      fromResult: { data: [{ id: 'row-1' }], error: null },
      rpcImplementation: () => Promise.resolve({ data: [{ user_id: 'uid-ana' }], error: null }),
    })

    const result = await publishExamTeacherAssignmentsForReview({
      institutionId: 'inst-1',
      mesas: [mesaTitularYVocales({ vocal1Id: '', vocal1: '', vocal2Id: '', vocal2: '' })],
      docentes,
    })

    expect(rpc).toHaveBeenCalledWith('academic_resolve_member_profile_by_email', expect.objectContaining({
      target_email: '30071977@docentes.inst-1.local',
    }))
    expect(result.success).toBe(true)
    expect(result.published).toBe(1)
  })

  it('reporta docentes sin cuenta de portal en skippedNoAccount', async () => {
    const { publishExamTeacherAssignmentsForReview } = await loadService({
      rpcImplementation: () => Promise.resolve({ data: [], error: null }),
    })

    const result = await publishExamTeacherAssignmentsForReview({
      institutionId: 'inst-1',
      mesas: [mesaTitularYVocales({ vocal2Id: '', vocal2: '' })],
      docentes: docentesBase(),
    })

    expect(result.success).toBe(false)
    expect(result.skippedNoAccount).toHaveLength(2)
    expect(result.error).toMatch(/ningun docente/i)
  })

  it('sin mesas con titular ni vocales no llama a Supabase', async () => {
    const { publishExamTeacherAssignmentsForReview, from } = await loadService()

    const result = await publishExamTeacherAssignmentsForReview({
      institutionId: 'inst-1',
      mesas: [{ draftMesaId: 'draft:sin-tribunal' }],
      docentes: docentesBase(),
    })

    expect(from).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, error: 'No hay mesas con titular o vocales asignados para publicar.' })
  })

  it('requiere institucion activa', async () => {
    const { publishExamTeacherAssignmentsForReview } = await loadService()

    const result = await publishExamTeacherAssignmentsForReview({ mesas: [mesaTitularYVocales()], docentes: docentesBase() })

    expect(result).toEqual({ success: false, error: 'Falta la institucion activa.' })
  })
})

describe('fetchExamTeacherAssignmentsForReview', () => {
  it('lee las filas de confirmacion docente filtrando por institucion, workspace y mesas', async () => {
    const rows = [
      { exam_table_id: 'draft:1', teacher_id: 'uid-ana', role: 'TITULAR', confirmation_status: 'confirmed', teacher_notes: '', confirmed_at: '2026-08-01', metadata: { titular: 'Ana Titular' } },
    ]
    const { fetchExamTeacherAssignmentsForReview, from, rpc, queryBuilder } = await loadService({
      fromResult: { data: rows, error: null },
    })

    const result = await fetchExamTeacherAssignmentsForReview({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      examTableIds: ['draft:1', 'draft:2'],
    })

    expect(from).toHaveBeenCalledWith('exam_teacher_assignments')
    expect(rpc).toHaveBeenCalledWith('academic_reconcile_expired_exam_confirmations', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_exam_table_id: '',
    })
    expect(queryBuilder.eq).toHaveBeenCalledWith('institution_id', 'inst-1')
    expect(queryBuilder.eq).toHaveBeenCalledWith('workspace_key', 'main')
    expect(queryBuilder.eq).toHaveBeenCalledWith('status', 'active')
    expect(queryBuilder.in).toHaveBeenCalledWith('exam_table_id', ['draft:1', 'draft:2'])
    expect(result).toEqual({ success: true, rows })
  })

  it('no llama a Supabase si no hay mesas para consultar', async () => {
    const { fetchExamTeacherAssignmentsForReview, from } = await loadService()

    const result = await fetchExamTeacherAssignmentsForReview({ institutionId: 'inst-1', examTableIds: [] })

    expect(from).not.toHaveBeenCalled()
    expect(result).toEqual({ success: true, rows: [] })
  })

  it('requiere institucion activa', async () => {
    const { fetchExamTeacherAssignmentsForReview } = await loadService()

    const result = await fetchExamTeacherAssignmentsForReview({ examTableIds: ['draft:1'] })

    expect(result).toEqual({ success: false, error: 'Falta la institucion activa.', rows: [] })
  })

  it('devuelve el error de Supabase sin lanzar', async () => {
    const { fetchExamTeacherAssignmentsForReview } = await loadService({
      fromResult: { data: null, error: { message: 'timeout' } },
    })

    const result = await fetchExamTeacherAssignmentsForReview({ institutionId: 'inst-1', examTableIds: ['draft:1'] })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/timeout/)
    expect(result.rows).toEqual([])
  })
})

describe('reconcileExpiredExamConfirmations', () => {
  it('llama la RPC de reconciliacion perezosa con institucion, workspace y mesa opcional', async () => {
    const { reconcileExpiredExamConfirmations, rpc, from } = await loadService({
      rpcImplementation: () => Promise.resolve({ data: { updated: 2 }, error: null }),
    })

    const result = await reconcileExpiredExamConfirmations({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      examTableId: 'mesa-1',
    })

    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('academic_reconcile_expired_exam_confirmations', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_exam_table_id: 'mesa-1',
    })
    expect(result).toEqual({ success: true, data: { updated: 2 } })
  })

  it('no rompe si la RPC de reconciliacion todavia no esta desplegada', async () => {
    const { reconcileExpiredExamConfirmations } = await loadService({
      rpcImplementation: () => Promise.resolve({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.academic_reconcile_expired_exam_confirmations' },
      }),
    })

    const result = await reconcileExpiredExamConfirmations({ institutionId: 'inst-1' })

    expect(result).toMatchObject({
      success: true,
      skippedReconciliation: true,
      reason: 'missing_rpc',
      data: null,
    })
  })

  it('no bloquea el flujo si la reconciliacion falla por red', async () => {
    const { reconcileExpiredExamConfirmations } = await loadService({
      rpcImplementation: () => Promise.reject(new TypeError('Failed to fetch')),
    })

    const result = await reconcileExpiredExamConfirmations({ institutionId: 'inst-1' })

    expect(result).toMatchObject({
      success: true,
      skippedReconciliation: true,
      reason: 'request_failed',
      data: null,
    })
    expect(result.warning).toContain('Failed to fetch')
  })
})

describe('confirmExamAssignmentAsAdmin', () => {
  it('confirma una asignacion docente puntual como admin', async () => {
    const { confirmExamAssignmentAsAdmin, rpc, from } = await loadService({
      rpcImplementation: () => Promise.resolve({ data: { updated: 1 }, error: null }),
    })

    const result = await confirmExamAssignmentAsAdmin({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      examTableId: 'mesa-1',
      teacherId: 'uid-ana',
    })

    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('academic_admin_confirm_exam_assignment', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_exam_table_id: 'mesa-1',
      target_teacher_id: 'uid-ana',
    })
    expect(result).toEqual({ success: true, data: { updated: 1 } })
  })

  it('reintenta con update directa si falta la RPC de confirmacion admin', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'))

    const { confirmExamAssignmentAsAdmin, from, queryBuilder } = await loadService({
      fromResult: { data: [{ id: 'row-1' }], error: null },
      rpcImplementation: () => Promise.resolve({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.academic_admin_confirm_exam_assignment' },
      }),
    })

    const result = await confirmExamAssignmentAsAdmin({
      institutionId: 'inst-1',
      examTableId: 'mesa-1',
      teacherId: 'uid-ana',
    })

    expect(from).toHaveBeenCalledWith('exam_teacher_assignments')
    expect(queryBuilder.update).toHaveBeenCalledWith({
      confirmation_status: 'confirmed',
      confirmed_at: '2026-09-14T12:00:00.000Z',
      updated_at: '2026-09-14T12:00:00.000Z',
    })
    expect(queryBuilder.eq).toHaveBeenCalledWith('institution_id', 'inst-1')
    expect(queryBuilder.eq).toHaveBeenCalledWith('workspace_key', 'main')
    expect(queryBuilder.eq).toHaveBeenCalledWith('exam_table_id', 'mesa-1')
    expect(queryBuilder.in).toHaveBeenCalledWith('teacher_id', ['uid-ana'])
    expect(queryBuilder.eq).toHaveBeenCalledWith('status', 'active')
    expect(result).toEqual({
      success: true,
      data: {
        updated: 1,
        fallback: 'direct_admin_update',
        rows: [{ id: 'row-1' }],
      },
    })
  })

  it('devuelve una guia clara si falta la RPC y falla el fallback directo', async () => {
    const { confirmExamAssignmentAsAdmin } = await loadService({
      fromResult: {
        data: null,
        error: { code: '42501', message: 'permission denied for table exam_teacher_assignments' },
      },
      rpcImplementation: () => Promise.resolve({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.academic_admin_confirm_exam_assignment' },
      }),
    })

    const result = await confirmExamAssignmentAsAdmin({
      institutionId: 'inst-1',
      examTableId: 'mesa-1',
      teacherId: 'uid-ana',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('repair_06_exam_teacher_assignments.sql')
    expect(result.error).toContain('permission denied')
  })
})

describe('confirmExamAssignmentsAsAdmin', () => {
  it('usa un update agrupado por mesa cuando falta la RPC admin', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T12:00:00.000Z'))

    const { confirmExamAssignmentsAsAdmin, rpc, from, queryBuilder } = await loadService({
      fromResult: {
        data: [{ id: 'row-1' }, { id: 'row-2' }, { id: 'row-3' }],
        error: null,
      },
      rpcImplementation: () => Promise.resolve({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.academic_admin_confirm_exam_assignment' },
      }),
    })

    const result = await confirmExamAssignmentsAsAdmin({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      entries: [
        { examTableId: 'mesa-1', teacherId: 'uid-ana' },
        { examTableId: 'mesa-1', teacherId: 'uid-bruno' },
        { examTableId: 'mesa-1', teacherId: 'uid-carla' },
      ],
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('exam_teacher_assignments')
    expect(queryBuilder.update).toHaveBeenCalledTimes(1)
    expect(queryBuilder.eq).toHaveBeenCalledWith('exam_table_id', 'mesa-1')
    expect(queryBuilder.in).toHaveBeenCalledWith('teacher_id', ['uid-ana', 'uid-bruno', 'uid-carla'])
    expect(result).toEqual({
      success: true,
      data: {
        updated: 3,
        fallback: 'direct_admin_update',
        rows: [{ id: 'row-1' }, { id: 'row-2' }, { id: 'row-3' }],
      },
    })
  })

  it('confirma en paralelo despues de validar que la RPC admin existe', async () => {
    const { confirmExamAssignmentsAsAdmin, rpc, from } = await loadService({
      rpcImplementation: () => Promise.resolve({ data: { updated: 1 }, error: null }),
    })

    const result = await confirmExamAssignmentsAsAdmin({
      institutionId: 'inst-1',
      entries: [
        { examTableId: 'mesa-1', teacherId: 'uid-ana' },
        { examTableId: 'mesa-1', teacherId: 'uid-bruno' },
      ],
    })

    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      success: true,
      data: { updated: 2 },
    })
  })
})

describe('resetExamProcessForWorkspace', () => {
  it('llama la RPC admin que limpia cronograma, envios docentes e inscripciones a mesas', async () => {
    const summary = {
      workspace_cronograma_cleared: 1,
      teacher_assignments_reset: 3,
      exam_enrollments_reset: 2,
      legacy_exam_sessions_deleted: 4,
    }
    const { resetExamProcessForWorkspace, rpc, from } = await loadService({
      rpcImplementation: () => Promise.resolve({ data: summary, error: null }),
    })

    const result = await resetExamProcessForWorkspace({
      institutionId: 'inst-1',
      workspaceKey: 'mesa-tests',
    })

    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('academic_admin_reset_exam_process', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'mesa-tests',
    })
    expect(result).toEqual({ success: true, summary })
  })

  it('devuelve una guia clara si falta ejecutar la migracion del reset', async () => {
    const { resetExamProcessForWorkspace } = await loadService({
      rpcImplementation: () => Promise.resolve({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function public.academic_admin_reset_exam_process' },
      }),
    })

    const result = await resetExamProcessForWorkspace({ institutionId: 'inst-1' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('repair_06_exam_process_reset_rpc.sql')
  })

  it('permite continuar con reset local si la RPC remota de reset agota el timeout', async () => {
    const { resetExamProcessForWorkspace } = await loadService({
      rpcImplementation: () => Promise.resolve({
        data: null,
        error: { message: 'canceling statement due to statement timeout' },
      }),
    })

    const result = await resetExamProcessForWorkspace({ institutionId: 'inst-1' })

    expect(result).toMatchObject({
      success: true,
      skippedRemote: true,
      warning: 'canceling statement due to statement timeout',
      summary: {
        workspace_cronograma_cleared: 0,
        teacher_assignments_reset: 0,
        exam_enrollments_reset: 0,
        legacy_exam_sessions_deleted: 0,
      },
    })
  })

  it('permite continuar con reset local si la RPC remota de reset falla por red', async () => {
    const { resetExamProcessForWorkspace } = await loadService({
      rpcImplementation: () => Promise.reject(new TypeError('Failed to fetch')),
    })

    const result = await resetExamProcessForWorkspace({ institutionId: 'inst-1' })

    expect(result).toMatchObject({
      success: true,
      skippedRemote: true,
      warning: 'Failed to fetch',
    })
  })

  it('no espera indefinidamente si la RPC remota de reset queda colgada', async () => {
    vi.useFakeTimers()
    const { resetExamProcessForWorkspace } = await loadService({
      rpcImplementation: () => new Promise(() => {}),
    })

    const pendingReset = resetExamProcessForWorkspace({ institutionId: 'inst-1' })
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await pendingReset

    expect(result).toMatchObject({
      success: true,
      skippedRemote: true,
      warning: 'reset process rpc timeout',
    })
  })

  it('no intenta tocar Supabase si la app esta en modo local', async () => {
    const { resetExamProcessForWorkspace, rpc } = await loadService({ isSupabaseConfigured: false })

    const result = await resetExamProcessForWorkspace({ institutionId: 'inst-1' })

    expect(rpc).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: true, skippedRemote: true })
  })

  it('requiere institucion activa', async () => {
    const { resetExamProcessForWorkspace, rpc } = await loadService()

    const result = await resetExamProcessForWorkspace()

    expect(rpc).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, error: 'Falta la institucion activa.' })
  })
})
