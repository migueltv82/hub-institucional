import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getInstitutionsPage, getUsersDirectoryPage } from './superAdmin.js'
import { saveWorkspaceSnapshot } from './workspaceSnapshot.js'

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}))

const LOCAL_SUPER_ADMIN_KEY = 'mesaflow.superadmin.store'

describe('superAdmin service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('enriquece la pagina de instituciones con carreras activas y distribucion por carrera', async () => {
    localStorage.setItem(LOCAL_SUPER_ADMIN_KEY, JSON.stringify({
      institutions: [{
        id: 'inst-1',
        name: 'Instituto Uno',
        slug: 'instituto-uno',
        logo_url: '',
        plan_type: 'pro',
        status: 'active',
        created_at: '2026-01-10T10:00:00.000Z',
      }],
      users: [{
        id: 'super-1',
        email: 'super@example.com',
        display_name: 'Super Admin',
        role: 'superadmin',
        is_global_admin: true,
        is_blocked: false,
        created_at: '2026-01-01T10:00:00.000Z',
      }, {
        id: 'admin-1',
        email: 'admin@example.com',
        display_name: 'Admin Uno',
        role: 'admin_instituto',
        is_global_admin: false,
        is_blocked: false,
        created_at: '2026-01-02T10:00:00.000Z',
      }],
      memberships: [{
        institution_id: 'inst-1',
        user_id: 'super-1',
        role: 'owner',
      }, {
        institution_id: 'inst-1',
        user_id: 'admin-1',
        role: 'admin',
      }],
    }))

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'admin-1',
      useRemote: false,
      payload: {
        alumnos: [{
          email: 'ana@example.com',
          nombre: 'Ana',
          apellido: 'Perez',
          carrera: 'Profesorado',
        }, {
          email: 'bruno@example.com',
          nombre: 'Bruno',
          apellido: 'Diaz',
          carrera: 'Tecnicatura',
        }],
        docentes: [{
          nombre: 'Carla Ruiz',
          dni: '33444555',
          carreras: ['Profesorado', 'Historia'],
        }],
      },
    })

    const page = await getInstitutionsPage({
      page: 1,
      pageSize: 6,
      useRemote: false,
    })

    expect(page.total).toBe(1)
    expect(page.institutions).toEqual([
      expect.objectContaining({
        id: 'inst-1',
        admin_count: 1,
        active_career_count: 3,
        student_count: 2,
        teacher_count: 1,
        career_breakdown: expect.arrayContaining([
          expect.objectContaining({
            name: 'Profesorado',
            student_count: 1,
            teacher_count: 1,
          }),
          expect.objectContaining({
            name: 'Tecnicatura',
            student_count: 1,
            teacher_count: 0,
          }),
          expect.objectContaining({
            name: 'Historia',
            student_count: 0,
            teacher_count: 1,
          }),
        ]),
      }),
    ])
  })

  it('agrupa usuarios por rol y permite filtrar por nombre, dni e institucion', async () => {
    localStorage.setItem(LOCAL_SUPER_ADMIN_KEY, JSON.stringify({
      institutions: [{
        id: 'inst-1',
        name: 'Instituto Uno',
        slug: 'instituto-uno',
        logo_url: '',
        plan_type: 'pro',
        status: 'active',
        created_at: '2026-01-10T10:00:00.000Z',
      }],
      users: [{
        id: 'super-1',
        email: 'super@example.com',
        display_name: 'Super Admin',
        role: 'superadmin',
        is_global_admin: true,
        is_blocked: false,
        created_at: '2026-01-01T10:00:00.000Z',
      }, {
        id: 'admin-1',
        email: 'admin@example.com',
        display_name: 'Admin Uno',
        role: 'admin_instituto',
        is_global_admin: false,
        is_blocked: false,
        created_at: '2026-01-02T10:00:00.000Z',
      }, {
        id: 'student-1',
        email: 'ana@example.com',
        display_name: 'Alumno Ana',
        role: 'alumno',
        is_global_admin: false,
        is_blocked: false,
        created_at: '2026-01-03T10:00:00.000Z',
      }, {
        id: 'student-orphan',
        email: 'sin-acceso@example.com',
        display_name: 'Alumno Sin Acceso',
        role: 'alumno',
        is_global_admin: false,
        is_blocked: false,
        created_at: '2026-01-03T11:00:00.000Z',
      }, {
        id: 'teacher-1',
        email: '30111222@docentes.inst-1.local',
        display_name: 'Docente Carla',
        role: 'docente',
        is_global_admin: false,
        is_blocked: false,
        created_at: '2026-01-04T10:00:00.000Z',
      }],
      memberships: [{
        institution_id: 'inst-1',
        user_id: 'super-1',
        role: 'owner',
      }, {
        institution_id: 'inst-1',
        user_id: 'admin-1',
        role: 'admin',
      }, {
        institution_id: 'inst-1',
        user_id: 'student-1',
        role: 'viewer',
      }, {
        institution_id: 'inst-1',
        user_id: 'teacher-1',
        role: 'viewer',
      }],
    }))

    await saveWorkspaceSnapshot({
      institutionId: 'inst-1',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'admin-1',
      useRemote: false,
      payload: {
        alumnos: [{
          email: 'ana@example.com',
          nombre: 'Ana',
          apellido: 'Perez',
          dni: '40123456',
          carrera: 'Profesorado',
        }],
        docentes: [{
          full_name: 'Carla Ruiz',
          nombre: 'Carla',
          apellido: 'Ruiz',
          dni: '30111222',
          carreras: ['Profesorado'],
        }],
      },
    })

    const studentsPage = await getUsersDirectoryPage({
      page: 1,
      pageSize: 10,
      searchTerm: 'perez',
      selectedRole: 'students',
      useRemote: false,
    })

    expect(studentsPage.roleSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'superadmin', count: 1 }),
      expect.objectContaining({ key: 'administrators', count: 1 }),
      expect.objectContaining({ key: 'students', count: 1 }),
      expect.objectContaining({ key: 'teachers', count: 1 }),
    ]))
    expect(studentsPage.totalUsers).toBe(4)
    expect(studentsPage.users).toEqual([
      expect.objectContaining({
        id: 'student-1',
        display_name: 'Ana Perez',
        first_name: 'Ana',
        last_name: 'Perez',
        dni: '40123456',
        role_bucket: 'students',
      }),
    ])

    const teachersPage = await getUsersDirectoryPage({
      page: 1,
      pageSize: 10,
      searchTerm: '30111222',
      selectedRole: 'teachers',
      useRemote: false,
    })

    expect(teachersPage.users).toEqual([
      expect.objectContaining({
        id: 'teacher-1',
        display_name: 'Carla Ruiz',
        dni: '30111222',
        role_bucket: 'teachers',
      }),
    ])

    const institutionSearchPage = await getUsersDirectoryPage({
      page: 1,
      pageSize: 10,
      searchTerm: 'instituto uno',
      selectedRole: 'students',
      useRemote: false,
    })

    expect(institutionSearchPage.total).toBe(1)
    expect(institutionSearchPage.users[0]).toEqual(expect.objectContaining({
      id: 'student-1',
    }))

    const superadminPage = await getUsersDirectoryPage({
      page: 1,
      pageSize: 10,
      selectedRole: 'superadmin',
      useRemote: false,
    })

    expect(superadminPage.users).toEqual([
      expect.objectContaining({
        id: 'super-1',
        institutions: [],
        role_bucket: 'superadmin',
      }),
    ])
  })
})
