import { describe, expect, it } from 'vitest'
import {
  getTeacherCourseRosterPreviewAccess,
  isTeacherCourseRosterInternalPreviewEnabled,
} from './teacherCourseRosterPreviewAccess.js'

const env = {
  DEV: true,
  VITE_ENABLE_TEACHER_COURSE_ROSTER_INTERNAL_PREVIEW: 'true',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
}

describe('teacherCourseRosterPreviewAccess', () => {
  it('solo habilita la feature en DEV local con flag explicita', () => {
    expect(isTeacherCourseRosterInternalPreviewEnabled(env)).toBe(true)
    expect(isTeacherCourseRosterInternalPreviewEnabled({ ...env, DEV: false })).toBe(false)
    expect(isTeacherCourseRosterInternalPreviewEnabled({ ...env, VITE_SUPABASE_URL: 'https://example.supabase.co' })).toBe(false)
    expect(isTeacherCourseRosterInternalPreviewEnabled({ ...env, VITE_ENABLE_TEACHER_COURSE_ROSTER_INTERNAL_PREVIEW: 'false' })).toBe(false)
  })

  it('autoriza docentes y administradores solo en su modo', () => {
    expect(getTeacherCourseRosterPreviewAccess({ env, mode: 'teacher', detectedRole: 'docente', institutionId: 'inst', userId: 'teacher' }).allowed).toBe(true)
    expect(getTeacherCourseRosterPreviewAccess({ env, mode: 'admin', detectedRole: 'admin_instituto', institutionId: 'inst', userId: 'admin' }).allowed).toBe(true)
    expect(getTeacherCourseRosterPreviewAccess({ env, mode: 'teacher', detectedRole: 'alumno', institutionId: 'inst', userId: 'student' }).reasons).toContain('USER_NOT_AUTHORIZED')
  })

  it('bloquea sesiones simuladas, instituciones ausentes y usuarios sin identidad', () => {
    const access = getTeacherCourseRosterPreviewAccess({
      env,
      mode: 'teacher',
      detectedRole: 'docente',
      institutionId: null,
      userId: null,
      hasAuthenticatedSession: false,
    })
    expect(access.allowed).toBe(false)
    expect(access.reasons).toEqual(expect.arrayContaining(['AUTHENTICATED_SESSION_REQUIRED', 'INSTITUTION_MISSING', 'USER_ID_MISSING']))
  })
})
