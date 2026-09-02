import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudentCareerLinkAdminPanel from './StudentCareerLinkAdminPanel.jsx'

const history = {
  students: [{ studentId: 'student-1', displayName: 'Alumno Local' }],
  studentRecords: [{ studentRecordId: 'record-1', displayName: 'Registro Local', legacyCareer: 'Carrera A' }],
  careers: [{ id: 'career-1', name: 'Carrera A' }],
  studyPlans: [{ id: 'plan-1', careerId: 'career-1', name: 'Plan A' }],
  academicYears: [{ id: 'year-1', yearNumber: 2026, status: 'ACTIVE' }],
  history: [], commandRequests: [], auditEvents: [],
}

function model(overrides = {}) {
  return {
    selectedRelation: null,
    careers: [{ id: 'career-1', name: 'Carrera A' }],
    studyPlans: [{ id: 'plan-1', career_id: 'career-1', name: 'Plan A' }],
    academicYears: [{ id: 'year-1', year_number: 2026, status: 'ACTIVE' }],
    legacyDiagnostic: {
      rows: [{
        status: 'READY_FOR_RELATIONAL_LINK', legacyStudentRecordId: 'record-1',
        proposedStudentId: 'student-1', proposedCareerId: 'career-1', proposedStudyPlanId: 'plan-1',
      }],
    },
    ...overrides,
  }
}

function props(overrides = {}) {
  return {
    model: model(),
    requestIdFactory: vi.fn(() => 'request-stable-1'),
    loadHistory: vi.fn().mockResolvedValue({ ok: true, data: history }),
    createCommand: vi.fn().mockResolvedValue({ ok: true, data: { status: 'CREATED', studentCareerEnrollmentId: 'link-1', auditEventId: 'audit-1' } }),
    correctCommand: vi.fn(), invalidateCommand: vi.fn(), onChanged: vi.fn(),
    ...overrides,
  }
}

async function completeCreateForm() {
  await screen.findByRole('option', { name: 'Alumno Local' })
  fireEvent.change(screen.getByLabelText('Motivo administrativo'), { target: { value: 'Alta administrativa revisada' } })
  fireEvent.click(screen.getByLabelText(/Confirmo el resumen/i))
}

describe('StudentCareerLinkAdminPanel', () => {
  it('crea mediante comando, bloquea doble clic y conserva requestId', async () => {
    let resolveCommand
    const createCommand = vi.fn(() => new Promise((resolve) => { resolveCommand = resolve }))
    render(<StudentCareerLinkAdminPanel {...props({ createCommand })} />)
    await completeCreateForm()
    const button = screen.getByRole('button', { name: 'Crear vinculo' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(createCommand).toHaveBeenCalledTimes(1)
    expect(createCommand.mock.calls[0][0]).toEqual(expect.objectContaining({ requestId: 'request-stable-1', studentId: 'student-1', studentRecordId: 'record-1' }))
    resolveCommand({ ok: true, data: { status: 'CREATED', studentCareerEnrollmentId: 'link-1' } })
    expect(await screen.findByText('CREATED')).toBeInTheDocument()
  })

  it('permite reintentar una respuesta perdida con el mismo requestId', async () => {
    const createCommand = vi.fn()
      .mockRejectedValueOnce(new Error('NETWORK_RESPONSE_LOST'))
      .mockResolvedValueOnce({ ok: true, data: { status: 'CREATED', studentCareerEnrollmentId: 'link-1' } })
    render(<StudentCareerLinkAdminPanel {...props({ createCommand })} />)
    await completeCreateForm()
    fireEvent.click(screen.getByRole('button', { name: 'Crear vinculo' }))
    await screen.findByText('NETWORK_RESPONSE_LOST')
    fireEvent.click(screen.getByRole('button', { name: 'Crear vinculo' }))
    await waitFor(() => expect(createCommand).toHaveBeenCalledTimes(2))
    expect(createCommand.mock.calls[0][0].requestId).toBe('request-stable-1')
    expect(createCommand.mock.calls[1][0].requestId).toBe('request-stable-1')
  })

  it('exige motivo y confirmacion explicita', async () => {
    render(<StudentCareerLinkAdminPanel {...props()} />)
    await screen.findByRole('option', { name: 'Alumno Local' })
    expect(screen.getByRole('button', { name: 'Crear vinculo' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Motivo administrativo'), { target: { value: 'Motivo' } })
    expect(screen.getByRole('button', { name: 'Crear vinculo' })).toBeDisabled()
  })

  it('bloquea autocompletado ambiguo hasta confirmacion manual', async () => {
    const ambiguousModel = model({
      legacyDiagnostic: { rows: [{ status: 'AMBIGUOUS_STUDENT', legacyStudentRecordId: 'record-1' }] },
    })
    render(<StudentCareerLinkAdminPanel {...props({ model: ambiguousModel })} />)
    await screen.findByText('Diagnostico legacy ambiguo')
    fireEvent.change(screen.getByLabelText('Alumno'), { target: { value: 'student-1' } })
    fireEvent.change(screen.getByLabelText('Registro de padron'), { target: { value: 'record-1' } })
    fireEvent.change(screen.getByLabelText('Carrera'), { target: { value: 'career-1' } })
    fireEvent.change(screen.getByLabelText('Plan de estudios'), { target: { value: 'plan-1' } })
    fireEvent.change(screen.getByLabelText('Ciclo de ingreso'), { target: { value: 'year-1' } })
    fireEvent.change(screen.getByLabelText('Ciclo actual'), { target: { value: 'year-1' } })
    fireEvent.change(screen.getByLabelText('Ano de ingreso'), { target: { value: '2026' } })
    fireEvent.change(screen.getByLabelText('Motivo administrativo'), { target: { value: 'Resolucion manual' } })
    fireEvent.click(screen.getByLabelText(/Confirmo el resumen/i))
    expect(screen.getByRole('button', { name: 'Crear vinculo' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/Confirme manualmente la identidad/i))
    expect(screen.getByRole('button', { name: 'Crear vinculo' })).toBeEnabled()
  })

  it('muestra historial read-only sin acciones por fila', async () => {
    const loadHistory = vi.fn().mockResolvedValue({
      ok: true,
      data: { ...history, history: [{ id: 'link-1', status: 'INVALIDATED', studentDisplayName: 'Alumno Local', careerName: 'Carrera A', studyPlanName: 'Plan A', validFrom: '2026-01-01', validTo: '2026-02-01' }] },
    })
    render(<StudentCareerLinkAdminPanel {...props({ loadHistory })} />)
    expect(await screen.findByText('INVALIDATED')).toBeInTheDocument()
    const row = screen.getByText('INVALIDATED').closest('tr')
    expect(row.querySelector('button')).toBeNull()
    expect(row.querySelector('input')).toBeNull()
  })

  it('corrige e invalida un vinculo solo con confirmacion fuerte', async () => {
    const selectedRelation = {
      id: 'link-1', student_id: 'student-1', student_record_id: 'record-1',
      career_id: 'career-1', study_plan_id: 'plan-1',
      admission_academic_year_id: 'year-1', current_academic_year_id: 'year-1',
      entry_year: 2026, is_first_year_entrant: false,
    }
    const correctCommand = vi.fn().mockResolvedValue({ ok: true, data: { status: 'CORRECTED', studentCareerEnrollmentId: 'link-2' } })
    const invalidateCommand = vi.fn().mockResolvedValue({ ok: true, data: { status: 'INVALIDATED', studentCareerEnrollmentId: 'link-1', warnings: ['ACTIVE_COURSE_ENROLLMENTS_EXIST'] } })
    const { unmount } = render(<StudentCareerLinkAdminPanel {...props({ model: model({ selectedRelation }), correctCommand, invalidateCommand })} />)
    await screen.findByRole('option', { name: 'Carrera A' })
    fireEvent.change(screen.getByLabelText('Motivo administrativo'), { target: { value: 'Correccion revisada' } })
    fireEvent.click(screen.getByLabelText(/Confirmo el resumen/i))
    fireEvent.click(screen.getByRole('button', { name: 'Corregir vinculo' }))
    await waitFor(() => expect(correctCommand).toHaveBeenCalledTimes(1))
    unmount()

    render(<StudentCareerLinkAdminPanel {...props({ model: model({ selectedRelation }), correctCommand, invalidateCommand })} />)
    await screen.findByRole('button', { name: 'Invalidar' })
    fireEvent.click(screen.getByRole('button', { name: 'Invalidar' }))
    fireEvent.change(screen.getByLabelText('Motivo administrativo'), { target: { value: 'Invalidacion revisada' } })
    fireEvent.click(screen.getByLabelText(/Confirmo el resumen/i))
    fireEvent.click(screen.getByRole('button', { name: 'Invalidar vinculo' }))
    expect(await screen.findByText(/conserva inscripciones de cursado activas/i)).toBeInTheDocument()
    expect(invalidateCommand).toHaveBeenCalledTimes(1)
  })
})
