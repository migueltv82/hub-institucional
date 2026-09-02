import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadService({
  configured = true,
  invokeResult = {
    data: {
      success: true,
      sources: { snapshot: true, relational: true },
      transition: { read_mode: 'hybrid_read' },
    },
    error: null,
  },
} = {}) {
  vi.resetModules()

  const invoke = vi.fn().mockResolvedValue(invokeResult)

  vi.doMock('../../../lib/supabase.js', () => ({
    isSupabaseConfigured: configured,
    supabase: configured ? { functions: { invoke } } : null,
  }))

  const module = await import('./studentPortalMutations.js')

  return {
    ...module,
    invoke,
  }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  vi.doUnmock('../../../lib/supabase.js')
})

describe('mutateStudentPortal', () => {
  it('rechaza respuestas exitosas sin escritura relacional cuando el portal lee relacional', async () => {
    const { mutateStudentPortal, invoke } = await loadService({
      invokeResult: {
        data: {
          success: true,
          sources: {
            snapshot: true,
            relational: false,
            relational_error: 'No existe la tabla subject_enrollments.',
          },
          transition: { read_mode: 'hybrid_read' },
        },
        error: null,
      },
    })

    await expect(
      mutateStudentPortal({
        institutionId: 'inst-1',
        mutationType: 'enroll_subject',
        payload: { enrollment: { id: 'enrollment-1' } },
        useRemote: true,
      }),
    ).rejects.toThrow('No se pudo confirmar la inscripcion en las tablas academicas.')

    expect(invoke).toHaveBeenCalledWith('admin-users', {
      body: expect.objectContaining({
        action: 'student_portal_mutation',
        institution_id: 'inst-1',
        mutation_type: 'enroll_subject',
      }),
    })
  })

  it('rechaza inscripciones snapshot_only sin escritura relacional porque docentes lee esa tabla', async () => {
    const { mutateStudentPortal } = await loadService({
      invokeResult: {
        data: {
          success: true,
          sources: { snapshot: true, relational: false },
          transition: { read_mode: 'snapshot_only' },
        },
        error: null,
      },
    })

    await expect(
      mutateStudentPortal({
        institutionId: 'inst-1',
        mutationType: 'enroll_subject',
        payload: { enrollment: { id: 'enrollment-1' } },
        useRemote: true,
      }),
    ).rejects.toThrow('No se pudo confirmar la inscripcion en las tablas academicas.')
  })

  it('permite otras mutaciones snapshot_only aunque no haya escritura relacional obligatoria', async () => {
    const { mutateStudentPortal } = await loadService({
      invokeResult: {
        data: {
          success: true,
          sources: { snapshot: true, relational: false },
          transition: { read_mode: 'snapshot_only' },
        },
        error: null,
      },
    })

    await expect(
      mutateStudentPortal({
        institutionId: 'inst-1',
        mutationType: 'update_profile',
        payload: { profile: { nombre: 'Ana' } },
        useRemote: true,
      }),
    ).resolves.toEqual(expect.objectContaining({ source: 'supabase' }))
  })
})
