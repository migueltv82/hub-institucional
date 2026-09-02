import { afterEach, describe, expect, it, vi } from 'vitest'

function createQueryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }
  return builder
}

async function loadService({
  transitionConfig = {
    stage: 'snapshot_only',
    write_mode: 'snapshot_only',
    read_mode: 'snapshot_only',
    dual_write_enabled: false,
    hybrid_read_enabled: false,
    relational_primary_enabled: false,
  },
  fromResults = [],
} = {}) {
  vi.resetModules()

  const queryBuilders = fromResults.map(createQueryBuilder)
  let queryIndex = 0
  const from = vi.fn(() => {
    const builder = queryBuilders[queryIndex]
    queryIndex += 1
    return builder ?? createQueryBuilder({ data: [], error: null })
  })
  const rpc = vi.fn().mockResolvedValue({ data: transitionConfig, error: null })

  vi.doMock('../../../lib/supabase.js', () => ({
    isSupabaseConfigured: true,
    supabase: { from, rpc },
  }))

  const module = await import('./academicRelationalData.js')

  return {
    ...module,
    from,
    rpc,
    queryBuilders,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../../../lib/supabase.js')
})

describe('fetchAcademicRelationalSnapshotOverlay', () => {
  it('en snapshot_only lee solo las notas relacionales del libro docente', async () => {
    const { fetchAcademicRelationalSnapshotOverlay, from } = await loadService()

    const result = await fetchAcademicRelationalSnapshotOverlay({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      user: { id: 'student-1' },
      useRemote: true,
    })

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('student_grades')
    expect(result.relationalData).toEqual({
      enrollments: [],
      enrollmentsLoaded: false,
      examEnrollments: [],
      grades: [],
    })
  })

  it('lee inscripciones, mesas y notas cuando la lectura hibrida esta activa', async () => {
    const { fetchAcademicRelationalSnapshotOverlay, from } = await loadService({
      transitionConfig: {
        stage: 'hybrid_read',
        write_mode: 'dual_write',
        read_mode: 'hybrid_read',
        dual_write_enabled: true,
        hybrid_read_enabled: true,
        relational_primary_enabled: false,
      },
      fromResults: [
        { data: [{ id: 'enrollment-1', subject_id: 'ING01', program_id: 'Profesorado', status: 'active' }], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ],
    })

    const result = await fetchAcademicRelationalSnapshotOverlay({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      user: { id: 'student-1' },
      useRemote: true,
    })

    expect(from).toHaveBeenCalledWith('subject_enrollments')
    expect(from).toHaveBeenCalledWith('exam_enrollments')
    expect(from).toHaveBeenCalledWith('student_grades')
    expect(result.relationalData.enrollmentsLoaded).toBe(true)
    expect(result.relationalData.enrollments).toEqual([
      expect.objectContaining({
        id: 'enrollment-1',
        subject_id: 'ING01',
        status: 'active',
      }),
    ])
  })
})
