import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AlumnosTab, NotasTab } from './SubjectDetailView.jsx'

const STUDENT = {
  studentId: 'student-1',
  studentRecordId: 'record-1',
  enrollmentId: 'enrollment-1',
  fullName: 'Ana Alumna',
}

const STORED_GRADES = [
  { student_id: 'student-1', grade_type: 'partial', attempt_number: 1, grade_value: 6, lock_version: 1 },
  { student_id: 'student-1', grade_type: 'partial', attempt_number: 2, grade_value: 8, lock_version: 2 },
  { student_id: 'student-1', grade_type: 'final', attempt_number: 1, grade_value: 7, academic_status: 'regular', lock_version: 3 },
]

describe('NotasTab', () => {
  it('bloquea una carga confirmada y permite editar notas y condicion de forma explicita', async () => {
    const onConfirmGrades = vi.fn().mockResolvedValue({ success: true })
    render(
      <NotasTab
        roster={[STUDENT]}
        grades={STORED_GRADES}
        onConfirmGrades={onConfirmGrades}
      />,
    )

    const firstPartial = screen.getByRole('spinbutton', { name: 'Ana Alumna - Parcial 1' })
    const condition = screen.getByRole('combobox', { name: 'Ana Alumna - Condición' })
    expect(firstPartial).toHaveAttribute('readonly')
    expect(condition).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Editar notas y condición/i }))
    expect(firstPartial).not.toHaveAttribute('readonly')
    expect(condition).not.toBeDisabled()

    fireEvent.change(firstPartial, { target: { value: '9' } })
    fireEvent.change(condition, { target: { value: 'promocionado' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar cambios/i }))

    await waitFor(() => expect(onConfirmGrades).toHaveBeenCalledTimes(1))
    const submittedRows = onConfirmGrades.mock.calls[0][0]
    expect(submittedRows).toHaveLength(2)
    expect(submittedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ gradeValue: 9, lockVersion: 1 }),
      expect.objectContaining({ gradeValue: 8.5, academicStatus: 'promocionado', lockVersion: 3 }),
    ]))
    await waitFor(() => expect(firstPartial).toHaveAttribute('readonly'))
  })

  it('ofrece confirmar carga desde el inicio cuando todavia no hay notas', () => {
    render(
      <NotasTab
        roster={[STUDENT]}
        grades={[]}
        onConfirmGrades={vi.fn()}
      />,
    )

    expect(screen.getByRole('spinbutton', { name: 'Ana Alumna - Parcial 1' })).not.toHaveAttribute('readonly')
    expect(screen.getByRole('combobox', { name: 'Ana Alumna - Condición' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /Confirmar carga/i })).toBeInTheDocument()
  })
})

describe('AlumnosTab', () => {
  it('reinicia notas, estado y asistencias sin eliminar al alumno de la materia', async () => {
    const onRemoveStudent = vi.fn()
    const onResetStudentRecords = vi.fn().mockResolvedValue({ success: true })

    render(
      <AlumnosTab
        roster={[STUDENT]}
        grades={STORED_GRADES}
        onRemoveStudent={onRemoveStudent}
        onResetStudentRecords={onResetStudentRecords}
      />,
    )

    fireEvent.click(screen.getByRole('button', {
      name: /Reiniciar notas, estado y asistencias de Ana Alumna/i,
    }))

    expect(screen.getByText(/El alumno seguira inscripto/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Ingresa tu contrasena docente/i), {
      target: { value: 'clave-segura' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Reiniciar registros/i }))

    await waitFor(() => {
      expect(onResetStudentRecords).toHaveBeenCalledWith(STUDENT, 'clave-segura')
    })
    expect(onRemoveStudent).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Reiniciar registros/i })).not.toBeInTheDocument()
    })
  })
})
