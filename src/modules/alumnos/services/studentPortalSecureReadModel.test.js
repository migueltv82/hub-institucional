import { describe, expect, it } from 'vitest'
import { isStudentPortalAccount } from './studentPortalSecureReadModel.js'

describe('studentPortalSecureReadModel', () => {
  it('detecta cuentas de alumno por flags y roles normalizados', () => {
    expect(isStudentPortalAccount({ isStudent: true })).toBe(true)
    expect(isStudentPortalAccount({ accountRole: 'alumno' })).toBe(true)
    expect(isStudentPortalAccount({ role: 'student' })).toBe(true)
  })

  it('no trata admins o docentes como alumnos para la lectura segura', () => {
    expect(isStudentPortalAccount({ accountRole: 'admin_instituto' })).toBe(false)
    expect(isStudentPortalAccount({ role: 'docente' })).toBe(false)
    expect(isStudentPortalAccount(null)).toBe(false)
  })
})
