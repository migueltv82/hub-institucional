import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchInstitutionRosterDirectory, fetchSuperAdminDashboardData } from './superAdminDashboard.js'
import { saveWorkspaceSnapshot } from './workspaceSnapshot.js'

vi.mock('../lib/supabase.js', () => ({
  isSupabaseConfigured: false,
  supabase: null,
}))

const LOCAL_SUPER_ADMIN_KEY = 'mesaflow.superadmin.store'

describe('superAdminDashboard service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('resume instituciones, administradores, alumnos y docentes desde snapshots locales', async () => {
    localStorage.setItem(LOCAL_SUPER_ADMIN_KEY, JSON.stringify({
      institutions: [{
        id: 'inst-1',
        name: 'Instituto Uno',
        slug: 'instituto-uno',
        logo_url: '',
        plan_type: 'pro',
        status: 'active',
        created_at: '2026-01-10T10:00:00.000Z',
      }, {
        id: 'inst-2',
        name: 'Instituto Dos',
        slug: 'instituto-dos',
        logo_url: '',
        plan_type: 'free',
        status: 'suspended',
        created_at: '2026-01-11T10:00:00.000Z',
      }],
      users: [{
        id: 'super-1',
        email: 'superadmin@example.com',
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
        is_blocked: true,
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
          anio: '1',
        }, {
          email: 'ana@example.com',
          nombre: 'Ana',
          apellido: 'Perez',
          carrera: 'Tecnicatura',
          anio: '1',
        }, {
          email: 'bruno@example.com',
          nombre: 'Bruno',
          apellido: 'Diaz',
          carrera: 'Profesorado',
          anio: '2',
        }],
        docentes: [{
          nombre: 'Carla Ruiz',
          dni: '30111222',
          carrera: 'Profesorado',
        }],
        horariosDocentes: [{
          profesor: 'Carla Ruiz',
          carrera: 'Profesorado',
          materia: 'HIS1',
        }],
      },
    })

    await saveWorkspaceSnapshot({
      institutionId: 'inst-2',
      workspaceKey: 'main',
      ownerEmail: 'admin@example.com',
      ownerUserId: 'admin-1',
      useRemote: false,
      payload: {
        alumnos: [{
          email: 'cecilia@example.com',
          nombre: 'Cecilia',
          apellido: 'Lopez',
          carrera: 'Turismo',
          anio: '3',
        }],
        docentes: [{
          nombre: 'Diego Mena',
          dni: '33444555',
          carrera: 'Turismo',
        }],
      },
    })

    const summary = await fetchSuperAdminDashboardData({ useRemote: false })

    expect(summary).toMatchObject({
      totalInstitutions: 2,
      activeInstitutions: 1,
      totalAdministrators: 1,
      totalStudents: 3,
      totalTeachers: 2,
      blockedUsers: 1,
      source: 'local',
    })
    expect(summary.institutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'inst-1',
        admin_count: 1,
        active_career_count: 2,
        student_count: 2,
        teacher_count: 1,
        career_breakdown: expect.arrayContaining([
          expect.objectContaining({
            name: 'Profesorado',
            student_count: 2,
            teacher_count: 1,
          }),
          expect.objectContaining({
            name: 'Tecnicatura',
            student_count: 1,
            teacher_count: 0,
          }),
        ]),
      }),
      expect.objectContaining({
        id: 'inst-2',
        active_career_count: 1,
        student_count: 1,
        teacher_count: 1,
        career_breakdown: [
          expect.objectContaining({
            name: 'Turismo',
            student_count: 1,
            teacher_count: 1,
          }),
        ],
      }),
    ]))
  })

  it('arma el directorio institucional desde el snapshot local', async () => {
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
          anio: '1',
          dni: '30111222',
          estado: 'activo',
        }],
        docentes: [{
          nombre: 'Carla Ruiz',
          dni: '33444555',
          telefono: '3815550000',
          carrera: 'Profesorado',
          carreras: ['Profesorado', 'Historia'],
          estado: 'activo',
        }],
      },
    })

    const studentsDirectory = await fetchInstitutionRosterDirectory({
      institutionId: 'inst-1',
      audience: 'students',
      useRemote: false,
    })
    const teachersDirectory = await fetchInstitutionRosterDirectory({
      institutionId: 'inst-1',
      audience: 'teachers',
      useRemote: false,
    })

    expect(studentsDirectory.items).toEqual([
      expect.objectContaining({
        full_name: 'Ana Perez',
        email: 'ana@example.com',
        career: 'Profesorado',
        academic_year: '1',
      }),
    ])
    expect(teachersDirectory.items).toEqual([
      expect.objectContaining({
        full_name: 'Carla Ruiz',
        dni: '33444555',
        careers_label: 'Historia | Profesorado',
        phone: '3815550000',
      }),
    ])
  })
})
