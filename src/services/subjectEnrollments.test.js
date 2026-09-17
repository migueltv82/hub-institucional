import { afterEach, describe, expect, it, vi } from 'vitest'

function createQueryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
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

  const configuredResults = Array.isArray(fromResults) && fromResults.length > 0
    ? fromResults
    : [fromResult]
  const queryBuilders = configuredResults.map(createQueryBuilder)
  let queryIndex = 0
  const from = vi.fn(() => queryBuilders[Math.min(queryIndex++, queryBuilders.length - 1)])
  const rpc = vi.fn().mockResolvedValue(rpcResult)

  vi.doMock('../lib/supabase.js', () => ({
    isSupabaseConfigured,
    supabase: isSupabaseConfigured ? { from, rpc } : null,
  }))

  const module = await import('./subjectEnrollments.js')

  return {
    ...module,
    from,
    rpc,
    queryBuilder: queryBuilders[0],
    queryBuilders,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../lib/supabase.js')
})

describe('subjectEnrollments service', () => {
  it('carga las inscripciones activas de la institucion', async () => {
    const rows = [{ id: 'e1', subject_id: 'ING13', program_id: 'Profesorado de Ingles', student_id: 's1', status: 'active' }]
    const { fetchSubjectEnrollments, from, queryBuilder } = await loadService({
      fromResult: { data: rows, error: null },
    })

    const result = await fetchSubjectEnrollments({ institutionId: 'inst-1' })

    expect(from).toHaveBeenCalledWith('subject_enrollments')
    expect(queryBuilder.select).not.toHaveBeenCalledWith('*')
    expect(queryBuilder.eq).toHaveBeenCalledWith('institution_id', 'inst-1')
    expect(queryBuilder.eq).toHaveBeenCalledWith('workspace_key', 'main')
    expect(queryBuilder.is).toHaveBeenCalledWith('deleted_at', null)
    expect(queryBuilder.in).toHaveBeenCalledWith('status', ['active', 'enrolled'])
    expect(result).toEqual([
      expect.objectContaining({
        id: 'e1',
        relational_id: 'e1',
        subject_enrollment_id: 'e1',
        student_id: 's1',
        profile_id: 's1',
        status: 'active',
      }),
    ])
  })

  it('resuelve el perfil del alumno por email via RPC', async () => {
    const { resolveStudentProfile, rpc } = await loadService({
      rpcResult: { data: [{ user_id: 's1', display_name: 'Juan Perez', account_role: 'alumno', is_blocked: false }], error: null },
    })

    const result = await resolveStudentProfile({ institutionId: 'inst-1', email: 'juan@mail.com' })

    expect(rpc).toHaveBeenCalledWith('academic_resolve_member_profile_by_email', {
      target_institution_id: 'inst-1',
      target_workspace_key: 'main',
      target_email: 'juan@mail.com',
      target_account_role: 'alumno',
    })
    expect(result).toEqual({ success: true, profile: { user_id: 's1', display_name: 'Juan Perez', account_role: 'alumno', is_blocked: false } })
  })

  it('resuelve el student_record_id real por email y carrera', async () => {
    const studentRecordId = '11111111-1111-4111-8111-111111111111'
    const { resolveStudentRecordId, from, queryBuilder } = await loadService({
      fromResult: { data: [{ id: studentRecordId, career: 'Profesorado de Ingles' }], error: null },
    })

    const result = await resolveStudentRecordId({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      email: 'JUAN@mail.com',
      career: 'Profesorado de Ingles',
    })

    expect(from).toHaveBeenCalledWith('student_records')
    expect(queryBuilder.eq).toHaveBeenCalledWith('institution_id', 'inst-1')
    expect(queryBuilder.eq).toHaveBeenCalledWith('workspace_key', 'main')
    expect(queryBuilder.eq).toHaveBeenCalledWith('email', 'juan@mail.com')
    expect(queryBuilder.eq).toHaveBeenCalledWith('career', 'Profesorado de Ingles')
    expect(result).toBe(studentRecordId)
  })

  it('resuelve el padron por email si la etiqueta de carrera no coincide', async () => {
    const studentRecordId = '22222222-2222-4222-8222-222222222222'
    const { resolveStudentRecordId, from, queryBuilders } = await loadService({
      fromResults: [
        { data: [], error: null },
        { data: [{ id: studentRecordId, career: 'profesorado-de-ingles' }], error: null },
      ],
    })

    const result = await resolveStudentRecordId({
      institutionId: 'inst-1',
      email: 'alumno@mail.com',
      career: 'PROFESORADO DE INGLES',
    })

    expect(from).toHaveBeenCalledTimes(2)
    expect(queryBuilders[0].eq).toHaveBeenCalledWith('career', 'PROFESORADO DE INGLES')
    expect(queryBuilders[1].eq).not.toHaveBeenCalledWith('career', expect.anything())
    expect(result).toBe(studentRecordId)
  })

  it('crea una inscripcion a materia poblando student_record_id UUID', async () => {
    const studentRecordId = '11111111-1111-4111-8111-111111111111'
    const created = { id: 'e1', subject_id: 'ING13', program_id: 'Profesorado de Ingles', student_id: 's1' }
    const { createSubjectEnrollment, queryBuilder } = await loadService({
      fromResult: { data: created, error: null },
    })

    const result = await createSubjectEnrollment({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      studentId: 's1',
      studentRecordId,
    })

    expect(queryBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      institution_id: 'inst-1',
      subject_id: 'ING13',
      program_id: 'Profesorado de Ingles',
      student_id: 's1',
      student_record_id: studentRecordId,
      status: 'active',
    }))
    expect(queryBuilder.select).not.toHaveBeenCalledWith('*')
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        id: 'e1',
        relational_id: 'e1',
        subject_enrollment_id: 'e1',
        student_id: 's1',
        profile_id: 's1',
      }),
    })
  })

  it('no envia ids legacy numericos como student_record_id UUID', async () => {
    const created = { id: 'e1', subject_id: 'ING25', program_id: 'Profesorado de Ingles', student_id: 's1' }
    const { createSubjectEnrollment, queryBuilder } = await loadService({
      fromResult: { data: created, error: null },
    })

    await createSubjectEnrollment({
      institutionId: 'inst-1',
      subjectId: 'ING25',
      programId: 'Profesorado de Ingles',
      studentId: 's1',
      studentRecordId: '24',
    })

    expect(queryBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      student_record_id: null,
    }))
  })

  it('reactiva una inscripcion previa dada de baja y completa student_record_id', async () => {
    const studentRecordId = '33333333-3333-4333-8333-333333333333'
    const repaired = { id: 'e1', student_id: 's1', student_record_id: studentRecordId, status: 'active' }
    const { createSubjectEnrollment, queryBuilders } = await loadService({
      fromResults: [
        { data: null, error: { code: '23505', message: 'duplicate key value' } },
        { data: repaired, error: null },
      ],
    })

    const result = await createSubjectEnrollment({
      institutionId: 'inst-1',
      subjectId: 'ING06',
      programId: 'Profesorado de Ingles',
      studentId: 's1',
      studentRecordId,
    })

    expect(queryBuilders[1].update).toHaveBeenCalledWith({
      status: 'active',
      deleted_at: null,
      dropped_at: null,
      student_record_id: studentRecordId,
    })
    expect(queryBuilders[1].eq).toHaveBeenCalledWith('student_id', 's1')
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        id: 'e1',
        relational_id: 'e1',
        student_record_id: studentRecordId,
        status: 'active',
      }),
    })
  })

  it('devuelve un mensaje amigable si no puede reactivar una inscripcion duplicada', async () => {
    const { createSubjectEnrollment } = await loadService({
      fromResults: [
        { data: null, error: { code: '23505', message: 'duplicate key value' } },
        { data: null, error: { message: 'no row found' } },
      ],
    })

    const result = await createSubjectEnrollment({
      institutionId: 'inst-1',
      subjectId: 'ING13',
      programId: 'Profesorado de Ingles',
      studentId: 's1',
    })

    expect(result).toEqual({ success: false, error: 'El alumno ya esta inscripto en esta materia.' })
  })

  it('da de baja una inscripcion', async () => {
    const updated = { id: 'e1', status: 'dropped' }
    const { dropSubjectEnrollment, queryBuilder } = await loadService({
      fromResult: { data: updated, error: null },
    })

    const result = await dropSubjectEnrollment('e1')

    expect(queryBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'dropped',
      dropped_at: expect.any(String),
      deleted_at: expect.any(String),
    }))
    expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'e1')
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        id: 'e1',
        relational_id: 'e1',
        status: 'dropped',
      }),
    })
  })
})
