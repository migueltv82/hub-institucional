import { describe, expect, it } from 'vitest'
import {
  getStudentCourseEnrollmentPreviewAccess,
  isLocalSupabaseUrl,
  isStudentCourseEnrollmentInternalPreviewEnabled,
} from './studentCourseEnrollmentPreviewAccess.js'

const localEnv = {
  DEV: true,
  VITE_ENABLE_STUDENT_COURSE_ENROLLMENT_INTERNAL_PREVIEW: 'true',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
}

describe('student course enrollment preview access', () => {
  it('solo habilita DEV con flag y Supabase local', () => {
    expect(isStudentCourseEnrollmentInternalPreviewEnabled(localEnv)).toBe(true)
    expect(isStudentCourseEnrollmentInternalPreviewEnabled({ ...localEnv, DEV: false })).toBe(false)
    expect(isStudentCourseEnrollmentInternalPreviewEnabled({ ...localEnv, VITE_SUPABASE_URL: 'https://example.supabase.co' })).toBe(false)
    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true)
  })

  it('autoriza roles administrativos y alumnos solo con sesion Auth real', () => {
    expect(getStudentCourseEnrollmentPreviewAccess({
      env: localEnv,
      mode: 'admin',
      detectedRole: 'admin_instituto',
      institutionId: 'inst-1',
      userId: 'user-1',
      hasAuthenticatedSession: true,
    }).allowed).toBe(true)
    expect(getStudentCourseEnrollmentPreviewAccess({
      env: localEnv,
      mode: 'student',
      detectedRole: 'alumno',
      institutionId: 'inst-1',
      userId: 'student-1',
      hasAuthenticatedSession: false,
    })).toEqual(expect.objectContaining({
      allowed: false,
      reasons: expect.arrayContaining(['AUTHENTICATED_SESSION_REQUIRED']),
    }))
  })

  it('bloquea docentes sin rol administrativo', () => {
    expect(getStudentCourseEnrollmentPreviewAccess({
      env: localEnv,
      mode: 'student',
      detectedRole: 'docente',
      institutionId: 'inst-1',
      userId: 'teacher-1',
      hasAuthenticatedSession: true,
    })).toEqual(expect.objectContaining({
      allowed: false,
      reasons: expect.arrayContaining(['USER_NOT_AUTHORIZED']),
    }))
  })

  it('bloquea cualquier rol cuando Supabase no es local', () => {
    expect(getStudentCourseEnrollmentPreviewAccess({
      env: { ...localEnv, VITE_SUPABASE_URL: 'https://remote.example.test' },
      mode: 'admin',
      detectedRole: 'superadmin',
      isSuperAdmin: true,
      institutionId: 'inst-1',
      userId: 'admin-1',
      hasAuthenticatedSession: true,
    })).toEqual(expect.objectContaining({
      allowed: false,
      reasons: expect.arrayContaining(['SUPABASE_NOT_LOCAL']),
    }))
  })
})
