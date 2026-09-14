import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyStudentAccessResultsToRows, provisionStudentAccess } from './studentAccess.js'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    functions: {
      invoke: mocks.invoke,
    },
  },
}))

describe('studentAccess service', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
  })

  it('invoca admin-users para crear accesos con email como usuario y DNI como contrasena', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        success: true,
        created: 1,
        updated: 0,
        failed: 0,
        results: [],
        errors: [],
      },
      error: null,
    })

    const result = await provisionStudentAccess({
      institutionId: 'inst-1',
      useRemote: true,
      students: [{
        email: 'ana@example.com',
        nombre: 'Ana',
        apellido: 'Diaz',
        carrera: 'Profesorado de Ingles',
        anio: '1',
        dni: '30111222',
        legajo: 'L-1',
      }],
    })

    expect(result.created).toBe(1)
    expect(mocks.invoke).toHaveBeenCalledWith('admin-users', {
      body: {
        action: 'bulk_create_students',
        institution_id: 'inst-1',
        students: [{
          email: 'ana@example.com',
          nombre: 'Ana',
          apellido: 'Diaz',
          full_name: undefined,
          carrera: 'Profesorado de Ingles',
          anio: '1',
          dni: '30111222',
          legajo: 'L-1',
        }],
      },
    })
  })

  it('procesa padrones grandes en tandas para no agotar la Edge Function', async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { success: true, created: 20, updated: 0, failed: 0, results: [], errors: [] }, error: null })
      .mockResolvedValueOnce({ data: { success: true, created: 20, updated: 0, failed: 0, results: [], errors: [] }, error: null })
      .mockResolvedValueOnce({ data: { success: true, created: 5, updated: 0, failed: 0, results: [], errors: [] }, error: null })

    const students = Array.from({ length: 45 }, (_, index) => ({
      email: `alumno-${index + 1}@example.com`,
      nombre: `Alumno ${index + 1}`,
      dni: `30000${index + 1}`,
      carrera: 'Profesorado de Ingles',
    }))

    const result = await provisionStudentAccess({
      institutionId: 'inst-1',
      useRemote: true,
      students,
    })

    expect(result).toMatchObject({
      created: 45,
      updated: 0,
      failed: 0,
      batches: 3,
    })
    expect(mocks.invoke).toHaveBeenCalledTimes(3)
    expect(mocks.invoke.mock.calls.map(([, args]) => args.body.students.length)).toEqual([20, 20, 5])
  })

  it('no reprocesa alumnos que ya tienen acceso vinculado', async () => {
    mocks.invoke.mockResolvedValue({
      data: {
        success: true,
        created: 1,
        updated: 0,
        failed: 0,
        results: [],
        errors: [],
      },
      error: null,
    })

    const result = await provisionStudentAccess({
      institutionId: 'inst-1',
      useRemote: true,
      students: [
        { email: 'ana@example.com', dni: '30111222', profile_id: 'profile-1' },
        { email: 'bruno@example.com', dni: '30222333', user_id: 'user-2' },
        { email: 'carla@example.com', dni: '30333444' },
      ],
    })

    expect(result).toMatchObject({
      created: 1,
      updated: 0,
      failed: 0,
      skippedExisting: 2,
      totalRequested: 3,
    })
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.invoke.mock.calls[0][1].body.students).toEqual([
      expect.objectContaining({ email: 'carla@example.com' }),
    ])
  })

  it('termina sin llamar Supabase cuando todos los alumnos ya tienen acceso', async () => {
    const result = await provisionStudentAccess({
      institutionId: 'inst-1',
      useRemote: true,
      students: [
        { email: 'ana@example.com', dni: '30111222', profile_id: 'profile-1' },
        { email: 'bruno@example.com', dni: '30222333', user_id: 'user-2' },
      ],
    })

    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      failed: 0,
      skippedExisting: 2,
      totalRequested: 2,
    })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('marca en el padron local los alumnos vinculados por la Edge Function', () => {
    const linkedRows = applyStudentAccessResultsToRows([
      { email: 'ana@example.com', nombre: 'Ana', dni: '30111222' },
      { email: 'bruno@example.com', nombre: 'Bruno', dni: '30222333' },
    ], [
      {
        email: 'ana@example.com',
        user_id: 'profile-1',
        student_record_id: 'record-1',
        status: 'created',
      },
    ])

    expect(linkedRows[0]).toEqual(expect.objectContaining({
      email: 'ana@example.com',
      profile_id: 'profile-1',
      user_id: 'profile-1',
      student_id: 'profile-1',
      record_id: 'record-1',
      student_record_id: 'record-1',
      login_email: 'ana@example.com',
      access_status: 'active',
      access_updated_at: expect.any(String),
    }))
    expect(linkedRows[1]).toEqual({ email: 'bruno@example.com', nombre: 'Bruno', dni: '30222333' })
  })

  it('divide una tanda si Supabase responde falta de recursos de compute', async () => {
    mocks.invoke
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Function failed due to not having enough compute resources',
          context: {
            json: vi.fn().mockResolvedValue({
              message: 'Function failed due to not having enough compute resources',
            }),
          },
        },
      })
      .mockResolvedValueOnce({ data: { success: true, created: 10, updated: 0, failed: 0, results: [], errors: [] }, error: null })
      .mockResolvedValueOnce({ data: { success: true, created: 10, updated: 0, failed: 0, results: [], errors: [] }, error: null })

    const students = Array.from({ length: 20 }, (_, index) => ({
      email: `alumno-${index + 1}@example.com`,
      nombre: `Alumno ${index + 1}`,
      dni: `30000${index + 1}`,
      carrera: 'Profesorado de Ingles',
    }))

    const result = await provisionStudentAccess({
      institutionId: 'inst-1',
      useRemote: true,
      students,
    })

    expect(result).toMatchObject({
      created: 20,
      failed: 0,
      batches: 2,
    })
    expect(mocks.invoke).toHaveBeenCalledTimes(3)
    expect(mocks.invoke.mock.calls.map(([, args]) => args.body.students.length)).toEqual([20, 10, 10])
  })

  it('rechaza la creacion si no hay institucion activa', async () => {
    await expect(provisionStudentAccess({
      institutionId: '',
      useRemote: true,
      students: [{ email: 'ana@example.com', dni: '30111222' }],
    })).rejects.toThrow('No hay una institucion activa')

    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
