import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudentRosterSection from './StudentRosterSection.jsx'

const financialMocks = vi.hoisted(() => ({
  fetchStudentRecords: vi.fn(),
  fetchStudentFinancialStatus: vi.fn(),
  upsertStudentFinancialStatus: vi.fn(),
}))

vi.mock('../../services/rosterRecords.js', () => ({
  fetchStudentRecords: financialMocks.fetchStudentRecords,
}))

vi.mock('../../services/studentFinancialStatus.js', () => ({
  fetchStudentFinancialStatus: financialMocks.fetchStudentFinancialStatus,
  upsertStudentFinancialStatus: financialMocks.upsertStudentFinancialStatus,
}))

describe('StudentRosterSection con plantilla nueva', () => {
  it('muestra, busca y edita carrera_id y el anio cursado migrado', () => {
    render(<StudentRosterSection
      academicData={{
        planesEstudio: [{ carrera_id: '2', carrera: 'PROFESORADO DE INGLES' }],
      }}
      alumnos={[{
        alumno_id: '10',
        nombre: 'Ana',
        apellido: 'Perez',
        dni: '30111222',
        carrera_id: '2',
        observaciones: 'Migrado | Año cursado informado en padrón: 3',
      }]}
      canEditWorkspace
      careerOptions={['PROFESORADO DE INGLES']}
      onDeleteStudent={vi.fn()}
      onUpdateStudent={vi.fn()}
    />)

    fireEvent.change(screen.getByPlaceholderText(/Nombre, apellido, DNI/), { target: { value: 'PROFESORADO DE INGLES' } })
    const row = screen.getByText('30111222').closest('tr')
    expect(within(row).getByText('PROFESORADO DE INGLES')).toBeInTheDocument()
    expect(within(row).getByText('3')).toBeInTheDocument()

    fireEvent.click(within(row).getByTitle('Editar alumno'))
    expect(screen.getByLabelText('Carrera')).toHaveValue('PROFESORADO DE INGLES')
    expect(screen.getByLabelText('Anio')).toHaveValue('3')
  })

  it('permite registrar estado, nota y fecha final por materia', async () => {
    const onUpdateAcademicRecords = vi.fn()
    const onResetAcademicRecords = vi.fn()
    render(<StudentRosterSection
      academicData={{
        planesEstudio: [{
          id: 'materia-101',
          materia: 'ING10',
          nombre: 'Didactica del Ingles II',
          carrera: 'PROFESORADO DE INGLES',
          anio: 3,
        }],
      }}
      alumnos={[{
        id: 'alumno-1',
        nombre: 'Ana',
        apellido: 'Perez',
        dni: '30111222',
        email: 'ana@example.com',
        carrera: 'PROFESORADO DE INGLES',
      }]}
      canEditWorkspace
      careerOptions={['PROFESORADO DE INGLES']}
      onDeleteStudent={vi.fn()}
      onResetAcademicRecords={onResetAcademicRecords}
      onUpdateAcademicRecords={onUpdateAcademicRecords}
      onUpdateStudent={vi.fn()}
    />)

    fireEvent.change(screen.getByPlaceholderText(/Nombre, apellido, DNI/), { target: { value: '30111222' } })
    fireEvent.click(screen.getByText('30111222').closest('tr'))

    fireEvent.click(screen.getByLabelText('Regular Didactica del Ingles II'))
    fireEvent.change(screen.getByLabelText('Fecha de regularidad de Didactica del Ingles II'), { target: { value: '10/03/2025' } })
    fireEvent.click(screen.getByLabelText('Aprobada Didactica del Ingles II'))
    fireEvent.change(screen.getByLabelText('Nota final de Didactica del Ingles II'), { target: { value: '8' } })
    expect(screen.getByLabelText('Fecha final de Didactica del Ingles II')).toHaveClass('border-amber-500')
    fireEvent.change(screen.getByLabelText('Fecha final de Didactica del Ingles II'), { target: { value: '10/08/2026' } })
    fireEvent.click(screen.getByLabelText('Ausente Didactica del Ingles II'))
    fireEvent.change(screen.getByLabelText('Fecha de ausencia de Didactica del Ingles II'), { target: { value: '30/07/2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar todos los cambios' }))

    expect(onUpdateAcademicRecords).toHaveBeenCalledWith({
      student: expect.objectContaining({ dni: '30111222' }),
      records: [expect.objectContaining({
        subject: expect.objectContaining({ id: 'materia-101' }),
        values: expect.objectContaining({ regular: true, aprobada: true, nota: 8 }),
      })],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Resetear estado academico' }))
    fireEvent.change(screen.getByLabelText('Escribi BORRAR TODO para confirmar'), { target: { value: 'BORRAR TODO' } })
    fireEvent.change(screen.getByLabelText('Contrasena actual del administrador que solicita la accion'), { target: { value: 'clave-segura' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar borrado total' }))

    await waitFor(() => {
      expect(onResetAcademicRecords).toHaveBeenCalledWith(
        expect.objectContaining({ dni: '30111222' }),
        { currentPassword: 'clave-segura' },
      )
    })
  })

  it('refleja regularidad docente sin llenar la nota final con promedios parciales', () => {
    render(<StudentRosterSection
      academicData={{
        planesEstudio: [{
          id: 'ING06',
          materia: 'ING06',
          nombre: 'Lengua Inglesa VI',
          carrera: 'PROFESORADO DE INGLES',
          anio: 3,
        }],
        grades: [{
          id: 'grade-final',
          student_id: 'profile-1',
          subject_id: 'ING06',
          grade_type: 'final',
          grade_value: 8,
          academic_status: 'regular',
          updated_at: '2026-08-28T12:00:00Z',
        }],
      }}
      alumnos={[{
        id: 'legacy-student-1',
        profile_id: 'profile-1',
        nombre: 'Ana',
        apellido: 'Perez',
        dni: '30111222',
        carrera: 'PROFESORADO DE INGLES',
      }]}
      canEditWorkspace
      careerOptions={['PROFESORADO DE INGLES']}
      onUpdateStudent={vi.fn()}
    />)

    fireEvent.change(screen.getByPlaceholderText(/Nombre, apellido, DNI/), { target: { value: '30111222' } })
    fireEvent.click(screen.getByText('30111222').closest('tr'))
    expect(screen.getByLabelText('Nota final de Lengua Inglesa VI')).toHaveValue('')
    expect(screen.getByLabelText('Regular Lengua Inglesa VI')).toBeChecked()
    expect(screen.getByLabelText(/regularidad de Lengua Inglesa VI/)).toHaveValue('28/08/2026')
    expect(screen.getByLabelText('Fecha final de Lengua Inglesa VI')).toHaveValue('')
    expect(screen.queryByText(/promedio 8\.0/i)).not.toBeInTheDocument()
    expect(screen.getByText(/promedio sin registrar/i)).toBeInTheDocument()
  })

  it('marca aprobada y completa la fecha final cuando el docente registra promocion', () => {
    render(<StudentRosterSection
      academicData={{
        planesEstudio: [{
          id: 'ING06', materia: 'ING06', nombre: 'Lengua Inglesa VI',
          carrera: 'PROFESORADO DE INGLES', anio: 3,
        }],
        grades: [{
          id: 'grade-promotion', student_id: 'profile-1', subject_id: 'ING06',
          grade_type: 'final', grade_value: 9, academic_status: 'promocionado',
          updated_at: '2026-08-28T15:30:00Z',
        }],
      }}
      alumnos={[{
        id: 'legacy-student-1', profile_id: 'profile-1', nombre: 'Ana',
        apellido: 'Perez', dni: '30111222', carrera: 'PROFESORADO DE INGLES',
      }]}
      canEditWorkspace
      careerOptions={['PROFESORADO DE INGLES']}
      onUpdateStudent={vi.fn()}
    />)

    fireEvent.change(screen.getByPlaceholderText(/Nombre, apellido, DNI/), { target: { value: '30111222' } })
    fireEvent.click(screen.getByText('30111222').closest('tr'))

    expect(screen.getByLabelText('Aprobada Lengua Inglesa VI')).toBeChecked()
    expect(screen.getByLabelText('Nota final de Lengua Inglesa VI')).toHaveValue('9')
    expect(screen.getByLabelText('Fecha final de Lengua Inglesa VI')).toHaveValue('28/08/2026')
    expect(screen.getByLabelText('Regular Lengua Inglesa VI')).not.toBeChecked()
  })

  it('vincula la nota cuando el padron usa el registro academico como id del alumno', () => {
    render(<StudentRosterSection
      academicData={{
        planesEstudio: [{
          id: 'ING06', materia: 'ING06', nombre: 'Lengua Inglesa VI',
          carrera: 'PROFESORADO DE INGLES', anio: 3,
        }],
        grades: [{
          id: 'grade-regular', student_id: 'profile-1', student_record_id: 'record-1',
          subject_id: 'ING06', grade_type: 'final', grade_value: 8,
          academic_status: 'regular', updated_at: '2026-08-28T15:30:00Z',
        }],
        studentRecords: [{
          id: 'record-1', profile_id: 'profile-1', email: 'ana@example.com',
          career: 'PROFESORADO DE INGLES', dni: '30111222',
        }],
      }}
      alumnos={[{
        id: 'legacy-student-1', nombre: 'Ana', apellido: 'Perez', dni: '30111222',
        email: 'ana@example.com', carrera: 'PROFESORADO DE INGLES',
      }]}
      canEditWorkspace
      careerOptions={['PROFESORADO DE INGLES']}
      onUpdateStudent={vi.fn()}
    />)

    fireEvent.change(screen.getByPlaceholderText(/Nombre, apellido, DNI/), { target: { value: '30111222' } })
    fireEvent.click(screen.getByText('30111222').closest('tr'))

    expect(screen.getByLabelText('Regular Lengua Inglesa VI')).toBeChecked()
    expect(screen.getByLabelText(/regularidad de Lengua Inglesa VI/)).toHaveValue('28/08/2026')
  })

  it('agrupa una carrera por anio y abre el modal al seleccionar un alumno', () => {
    render(<StudentRosterSection
      academicData={{ planesEstudio: [] }}
      alumnos={[
        { id: 'a1', nombre: 'Ana', apellido: 'Perez', dni: '1', email: 'ana@example.com', carrera: 'INGLES', anio: '1' },
        { id: 'a2', nombre: 'Luis', apellido: 'Diaz', dni: '2', email: 'luis@example.com', carrera: 'INGLES', anio: '3' },
        { id: 'a3', nombre: 'Otra', apellido: 'Carrera', dni: '3', carrera: 'QUIMICA', anio: '1' },
      ]}
      canEditWorkspace
      careerFilter="INGLES"
      careerOptions={['INGLES', 'QUIMICA']}
      onBackToAdmin={vi.fn()}
      onUpdateStudent={vi.fn()}
    />)

    expect(screen.getByText('1.º año')).toBeInTheDocument()
    expect(screen.getByText('2.º año')).toBeInTheDocument()
    expect(screen.getByText('3.º año')).toBeInTheDocument()
    expect(screen.getByText('4.º año')).toBeInTheDocument()
    expect(screen.getByText('Ana Perez')).toBeInTheDocument()
    expect(screen.getByText('Luis Diaz')).toBeInTheDocument()
    expect(screen.queryByText('Otra Carrera')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Ana Perez'))
    expect(screen.getByRole('heading', { name: 'Datos del padron' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Marcar adeuda cuota' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ver ficha académica' })).toBeInTheDocument()
  })

  it('actualiza adeuda cuota usando el registro financiero existente', async () => {
    financialMocks.fetchStudentRecords.mockResolvedValue([{
      id: 'record-1',
      email: 'ana@example.com',
      career: 'INGLES',
    }])
    financialMocks.fetchStudentFinancialStatus.mockResolvedValue([])
    financialMocks.upsertStudentFinancialStatus.mockResolvedValue({
      student_record_id: 'record-1',
      adeuda_cuota: true,
    })

    render(<StudentRosterSection
      academicData={{ planesEstudio: [] }}
      alumnos={[{ id: 'a1', nombre: 'Ana', apellido: 'Perez', email: 'ana@example.com', carrera: 'INGLES', anio: '1' }]}
      canEditWorkspace
      canManageStudentFinancialStatus
      careerFilter="INGLES"
      careerOptions={['INGLES']}
      institutionId="institution-1"
      onUpdateStudent={vi.fn()}
      useRemoteWorkspace
      workspaceKey="main"
    />)

    await waitFor(() => expect(financialMocks.fetchStudentRecords).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Ana Perez'))
    const toggle = await screen.findByRole('button', { name: 'Marcar adeuda cuota' })
    expect(toggle).toBeEnabled()
    fireEvent.click(toggle)

    await waitFor(() => expect(financialMocks.upsertStudentFinancialStatus).toHaveBeenCalledWith({
      institutionId: 'institution-1',
      workspaceKey: 'main',
      studentRecordId: 'record-1',
      adeudaCuota: true,
      useRemote: true,
    }))
    expect(await screen.findByText(/las inscripciones a mesas finales están bloqueadas/i)).toBeInTheDocument()
  })
})
