import { afterEach, describe, expect, it, vi } from 'vitest'

function createQueryBuilder(result) {
  const results = Array.isArray(result) ? [...result] : [result]
  const nextResult = () => (results.length > 1 ? results.shift() : results[0])
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(nextResult())),
    then: (resolve, reject) => Promise.resolve(nextResult()).then(resolve, reject),
  }
  return builder
}

async function loadService({
  isSupabaseConfigured = true,
  fromResult = { data: [], error: null },
  rpcResult = { data: null, error: null },
} = {}) {
  vi.resetModules()

  const queryBuilder = createQueryBuilder(fromResult)
  const from = vi.fn(() => queryBuilder)
  const rpc = vi.fn().mockResolvedValue(rpcResult)

  vi.doMock('../lib/supabase.js', () => ({
    isSupabaseConfigured,
    supabase: isSupabaseConfigured ? { from, rpc } : null,
  }))

  const module = await import('./subjectTeacherAssignments.js')

  return {
    ...module,
    from,
    rpc,
    queryBuilder,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

describe('subjectTeacherAssignments service', () => {
  it('registra una licencia por materias y su reemplazante mediante una operacion atomica', async () => {
    const { createTeacherSubjectLeave, rpc } = await loadService({
      rpcResult: { data: { leaveId: 'leave-1', affectedSubjects: 2 }, error: null },
    })

    const result = await createTeacherSubjectLeave({
      institutionId: 'inst-1',
      assignmentIds: ['a1', 'a2'],
      replacementTeacherId: 'u2',
      replacementTeacherRecordId: 'tr2',
      startsOn: '2026-08-22',
      endsOn: '2026-09-30',
    })

    expect(rpc).toHaveBeenCalledWith('academic_create_teacher_subject_leave', {
      p_institution_id: 'inst-1',
      p_workspace_key: 'main',
      p_assignment_ids: ['a1', 'a2'],
      p_replacement_teacher_id: 'u2',
      p_replacement_teacher_record_id: 'tr2',
      p_starts_on: '2026-08-22',
      p_ends_on: '2026-09-30',
      p_notes: '',
    })
    expect(result).toEqual({ success: true, data: { leaveId: 'leave-1', affectedSubjects: 2 } })
  })

  it('actualiza la condicion y cierra cualquier cadena de reemplazo anterior', async () => {
    const { updateTeacherAssignmentCondition, rpc } = await loadService({
      rpcResult: { data: { id: 'a1', role: 'titular' }, error: null },
    })

    const result = await updateTeacherAssignmentCondition('a1', 'titular')

    expect(rpc).toHaveBeenCalledWith('academic_update_teacher_assignment_condition', {
      p_assignment_id: 'a1',
      p_role: 'titular',
    })
    expect(result).toEqual({ success: true, data: { id: 'a1', role: 'titular' } })
  })

  it('carga las titularidades activas de la institucion', async () => {
    const rows = [{ id: 'a1', subject_id: 'ING13', program_id: 'Profesorado de Ingles', teacher_id: 'u1', status: 'active' }]
    const { fetchSubjectTeacherAssignments, from, queryBuilder } = await loadService({
      fromResult: { data: rows, error: null },
    })

    const result = await fetchSubjectTeacherAssignments({ institutionId: 'inst-1' })

    expect(from).toHaveBeenCalledWith('subject_teacher_assignments')
    expect(queryBuilder.select).not.toHaveBeenCalledWith('*')
    expect(queryBuilder.eq).toHaveBeenCalledWith('institution_id', 'inst-1')
    expect(queryBuilder.eq).toHaveBeenCalledWith('workspace_key', 'main')
    expect(queryBuilder.eq).toHaveBeenCalledWith('status', 'active')
    expect(queryBuilder.is).toHaveBeenCalledWith('deleted_at', null)
    expect(result).toEqual(rows)
  })

  it('carga titularidades con fallback si la base aun no tiene deleted_at', async () => {
    const rows = [{ id: 'a1', subject_id: 'ING13', teacher_id: 'u1', status: 'active' }]
    const { fetchSubjectTeacherAssignments, from, queryBuilder } = await loadService({
      fromResult: [
        { data: null, error: { code: '42703', message: 'column subject_teacher_assignments.deleted_at does not exist' } },
        { data: rows, error: null },
      ],
    })

    const result = await fetchSubjectTeacherAssignments({ institutionId: 'inst-1' })

    expect(from).toHaveBeenCalledTimes(2)
    expect(queryBuilder.is).toHaveBeenCalledWith('deleted_at', null)
    expect(result).toEqual(rows)
  })

  it('resuelve el perfil del docente por email via RPC', async () => {
    const { resolveTeacherProfile, rpc } = await loadService({
      rpcResult: { data: [{ user_id: 'u1', display_name: 'Ana Diaz', account_role: 'docente', is_blocked: false }], error: null },
    })

    const result = await resolveTeacherProfile({ institutionId: 'inst-1', email: 'ana@mail.com' })

    expect(rpc).toHaveBeenCalledWith('academic_resolve_member_profile_by_email', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_email: 'ana@mail.com',
      target_account_role: 'docente',
    })
    expect(result).toEqual({ success: true, profile: { user_id: 'u1', display_name: 'Ana Diaz', account_role: 'docente', is_blocked: false } })
  })

  it('devuelve un error amigable si no encuentra al docente', async () => {
    const { resolveTeacherProfile } = await loadService({
      rpcResult: { data: [], error: null },
    })

    const result = await resolveTeacherProfile({ institutionId: 'inst-1', email: 'nadie@mail.com' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No se encontro un usuario docente/)
  })

  it('crea una titularidad de materia', async () => {
    const created = { id: 'a1', subject_id: 'ING13', program_id: 'Profesorado de Ingles', teacher_id: 'u1' }
    const { createSubjectTeacherAssignment, queryBuilder } = await loadService({
      fromResult: { data: created, error: null },
    })

    const result = await createSubjectTeacherAssignment({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      teacherId: 'u1',
      teacherRecordId: 'tr1',
    })

    expect(queryBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      institution_id: 'inst-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      teacher_id: 'u1',
      teacher_record_id: 'tr1',
      status: 'active',
      deleted_at: null,
      role: 'titular',
    }))
    expect(queryBuilder.select).not.toHaveBeenCalledWith('*')
    expect(result).toEqual({ success: true, data: created })
  })

  it('crea una titularidad con fallback si la base aun no tiene deleted_at', async () => {
    const created = { id: 'a1', subject_id: 'ING13', teacher_id: 'u1' }
    const { createSubjectTeacherAssignment, queryBuilder } = await loadService({
      fromResult: [
        { data: null, error: { code: '42703', message: 'column subject_teacher_assignments.deleted_at does not exist' } },
        { data: created, error: null },
      ],
    })

    const result = await createSubjectTeacherAssignment({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      teacherId: 'u1',
    })

    expect(queryBuilder.insert).toHaveBeenCalledTimes(2)
    expect(queryBuilder.insert.mock.calls[0][0]).toEqual(expect.objectContaining({ deleted_at: null }))
    expect(queryBuilder.insert.mock.calls[1][0]).not.toHaveProperty('deleted_at')
    expect(result).toEqual({ success: true, data: created })
  })

  it('reintenta sin teacher_record_id cuando el identificador legacy no existe en el padron relacional', async () => {
    const created = { id: 'a1', subject_id: 'ING13', teacher_id: 'u1', teacher_record_id: null }
    const { createSubjectTeacherAssignment, queryBuilder } = await loadService({
      fromResult: [
        {
          data: null,
          error: {
            code: '23503',
            message: 'violates foreign key constraint "subject_teacher_assignments_teacher_record_id_fkey"',
          },
        },
        { data: created, error: null },
      ],
    })

    const result = await createSubjectTeacherAssignment({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      teacherId: 'u1',
      teacherRecordId: 'legacy-id',
    })

    expect(queryBuilder.insert).toHaveBeenCalledTimes(2)
    expect(queryBuilder.insert.mock.calls[0][0]).toHaveProperty('teacher_record_id', 'legacy-id')
    expect(queryBuilder.insert.mock.calls[1][0]).not.toHaveProperty('teacher_record_id')
    expect(result).toEqual({ success: true, data: created })
  })

  it('crea una asignacion con condicion suplente', async () => {
    const created = { id: 'a2', subject_id: 'ING13', teacher_id: 'u2', role: 'suplente' }
    const { createSubjectTeacherAssignment, queryBuilder } = await loadService({
      fromResult: { data: created, error: null },
    })

    const result = await createSubjectTeacherAssignment({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      teacherId: 'u2',
      role: 'suplente',
    })

    expect(queryBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ role: 'suplente' }))
    expect(result).toEqual({ success: true, data: created })
  })

  it('rechaza una condicion invalida al crear', async () => {
    const { createSubjectTeacherAssignment } = await loadService()

    const result = await createSubjectTeacherAssignment({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      teacherId: 'u1',
      role: 'otra',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/titular, suplente o licencia/)
  })

  it('devuelve un mensaje amigable si el docente ya tiene la materia asignada', async () => {
    const { createSubjectTeacherAssignment } = await loadService({
      fromResult: { data: null, error: { code: '23505', message: 'duplicate key value' } },
    })

    const result = await createSubjectTeacherAssignment({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      teacherId: 'u1',
    })

    expect(result).toEqual({ success: false, error: 'Este docente ya tiene esta materia asignada.' })
  })

  it('carga las materias asignadas de un docente puntual', async () => {
    const rows = [{ id: 'a1', subject_id: 'ING13', teacher_id: 'u1', role: 'titular' }]
    const { fetchSubjectTeacherAssignmentsForTeacher, queryBuilder } = await loadService({
      fromResult: { data: rows, error: null },
    })

    const result = await fetchSubjectTeacherAssignmentsForTeacher({ institutionId: 'inst-1', teacherId: 'u1' })

    expect(queryBuilder.eq).toHaveBeenCalledWith('teacher_id', 'u1')
    expect(queryBuilder.is).toHaveBeenCalledWith('deleted_at', null)
    expect(result).toEqual(rows)
  })

  it('carga materias de un docente con fallback si falta deleted_at', async () => {
    const rows = [{ id: 'a1', subject_id: 'ING13', teacher_id: 'u1', role: 'titular' }]
    const { fetchSubjectTeacherAssignmentsForTeacher, from } = await loadService({
      fromResult: [
        { data: null, error: { code: '42703', message: 'column subject_teacher_assignments.deleted_at does not exist' } },
        { data: rows, error: null },
      ],
    })

    const result = await fetchSubjectTeacherAssignmentsForTeacher({ institutionId: 'inst-1', teacherId: 'u1' })

    expect(from).toHaveBeenCalledTimes(2)
    expect(result).toEqual(rows)
  })

  it('actualiza la condicion de una asignacion', async () => {
    const updated = { id: 'a1', role: 'licencia' }
    const { updateSubjectTeacherAssignmentRole, queryBuilder } = await loadService({
      fromResult: { data: updated, error: null },
    })

    const result = await updateSubjectTeacherAssignmentRole('a1', 'licencia')

    expect(queryBuilder.update).toHaveBeenCalledWith({ role: 'licencia' })
    expect(result).toEqual({ success: true, data: updated })
  })

  it('explica la migracion pendiente si actualizar dispara deleted_at faltante', async () => {
    const { updateSubjectTeacherAssignmentRole } = await loadService({
      fromResult: { data: null, error: { message: 'record "old" has no field "deleted_at"' } },
    })

    const result = await updateSubjectTeacherAssignmentRole('a1', 'licencia')

    expect(result.success).toBe(false)
    expect(result.error).toContain('06_subject_teacher_assignments.sql')
  })

  it('da de baja una titularidad', async () => {
    const updated = { id: 'a1', status: 'inactive' }
    const { deactivateSubjectTeacherAssignment, queryBuilder } = await loadService({
      fromResult: { data: updated, error: null },
    })

    const result = await deactivateSubjectTeacherAssignment('a1')

    expect(queryBuilder.update).toHaveBeenCalledWith({
      status: 'inactive',
      deleted_at: expect.any(String),
    })
    expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'a1')
    expect(result).toEqual({ success: true, data: updated })
  })

  it('explica la migracion pendiente si la baja dispara deleted_at faltante', async () => {
    const { deactivateSubjectTeacherAssignment } = await loadService({
      fromResult: { data: null, error: { message: 'record "old" has no field "deleted_at"' } },
    })

    const result = await deactivateSubjectTeacherAssignment('a1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('06_subject_teacher_assignments.sql')
  })
})
