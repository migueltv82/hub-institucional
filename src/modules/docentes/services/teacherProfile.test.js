import { describe, expect, it } from 'vitest'
import { normalizeTeacherProfile, validateTeacherProfile } from './teacherProfile.js'

describe('teacherProfile', () => {
  it('normaliza email y telefono antes de guardar', () => {
    expect(normalizeTeacherProfile({
      email: '  DOCENTE@Ejemplo.COM ',
      telefono: ' 381 555-1234 ',
    })).toEqual({
      email: 'docente@ejemplo.com',
      telefono: '381 555-1234',
    })
  })

  it('rechaza emails invalidos', () => {
    expect(() => validateTeacherProfile({ email: 'docente-sin-arroba' }))
      .toThrow('Ingresa un email valido.')
  })

  it('limita la longitud del telefono', () => {
    expect(() => validateTeacherProfile({
      email: 'docente@example.com',
      telefono: '1'.repeat(41),
    })).toThrow('El telefono no puede superar los 40 caracteres.')
  })
})
