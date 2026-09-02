import { describe, expect, it, vi } from 'vitest'
import { confirmStudentDeletion, getStudentConfirmationName } from './studentDeletionConfirmation.js'

describe('confirmStudentDeletion', () => {
  const student = { nombre: 'Ana', apellido: 'Pérez', dni: '12345678' }

  it('requiere dos confirmaciones antes de autorizar la eliminación', () => {
    const confirmAction = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)

    expect(confirmStudentDeletion(student, confirmAction)).toBe(true)
    expect(confirmAction).toHaveBeenCalledTimes(2)
    expect(confirmAction.mock.calls[0][0]).toContain('Ana Pérez')
    expect(confirmAction.mock.calls[0][0]).toContain('historial académico')
    expect(confirmAction.mock.calls[1][0]).toContain('CONFIRMACIÓN FINAL')
  })

  it('se detiene cuando se cancela cualquiera de los dos mensajes', () => {
    const cancelFirst = vi.fn().mockReturnValue(false)
    const cancelSecond = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false)

    expect(confirmStudentDeletion(student, cancelFirst)).toBe(false)
    expect(cancelFirst).toHaveBeenCalledTimes(1)
    expect(confirmStudentDeletion(student, cancelSecond)).toBe(false)
    expect(cancelSecond).toHaveBeenCalledTimes(2)
  })

  it('usa una identidad disponible cuando falta el nombre', () => {
    expect(getStudentConfirmationName({ email: 'alumno@institucion.edu' })).toBe('alumno@institucion.edu')
  })
})
