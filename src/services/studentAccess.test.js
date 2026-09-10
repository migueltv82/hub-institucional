import { beforeEach, describe, expect, it, vi } from 'vitest'
import { provisionStudentAccess } from './studentAccess.js'

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

  it('rechaza la creacion si no hay institucion activa', async () => {
    await expect(provisionStudentAccess({
      institutionId: '',
      useRemote: true,
      students: [{ email: 'ana@example.com', dni: '30111222' }],
    })).rejects.toThrow('No hay una institucion activa')

    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
