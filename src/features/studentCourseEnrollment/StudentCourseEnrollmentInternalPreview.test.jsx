import fs from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudentCourseEnrollmentInternalPreview from './StudentCourseEnrollmentInternalPreview.jsx'
import { buildStudentCourseEnrollmentPreviewModel } from './studentCourseEnrollmentPreviewModel.js'

const env = {
  DEV: true,
  VITE_ENABLE_STUDENT_COURSE_ENROLLMENT_INTERNAL_PREVIEW: 'true',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
}

function model(overrides = {}) {
  return buildStudentCourseEnrollmentPreviewModel({
    actorMode: 'student',
    institution: { id: 'inst-1', name: 'Instituto Local' },
    selectedRelationId: 'relation-1',
    relations: [{
      id: 'relation-1',
      institution_id: 'inst-1',
      student_id: 'student-1',
      student_display_name: 'Alumno Prueba',
      career_id: 'career-1',
      career_name: 'Carrera A',
      study_plan_id: 'plan-1',
      study_plan_name: 'Plan A',
      admission_academic_year_id: 'year-1',
      current_academic_year_id: 'year-1',
      entry_year: 2026,
      is_first_year_entrant: true,
      status: 'ACTIVE',
    }],
    careers: [],
    studyPlans: [],
    academicYears: [],
    subjects: [],
    offerings: [{
      id: 'offering-1',
      institution_id: 'inst-1',
      career_id: 'career-1',
      study_plan_id: 'plan-1',
      study_plan_subject_id: 'subject-1',
      subject_code: 'MAT1',
      subject_name: 'Materia Uno',
      year_level: 1,
      commission_code: 'A',
      delivery_mode: 'PRESENTIAL',
      academic_year_number: 2026,
      status: 'OPEN_FOR_ENROLLMENT',
    }],
    schedules: [],
    teachingAssignments: [],
    prerequisites: [],
    enrollments: [],
    commandRequests: [],
    auditEvents: [],
    metrics: { relations: 1, offerings: 1, enrollments: 0 },
    ...overrides,
  })
}

function props(overrides = {}) {
  return {
    mode: 'student',
    institutionId: 'inst-1',
    user: { id: 'student-1', role: 'alumno' },
    detectedRole: 'alumno',
    hasAuthenticatedSession: true,
    env,
    loadPreview: vi.fn().mockResolvedValue(model()),
    enrollFirstYear: vi.fn(),
    enrollIndividual: vi.fn(),
    requestIdFactory: vi.fn(() => 'request-stable-1'),
    ...overrides,
  }
}

describe('StudentCourseEnrollmentInternalPreview', () => {
  it('no se monta con la flag apagada', () => {
    render(<StudentCourseEnrollmentInternalPreview {...props({ env: { ...env, VITE_ENABLE_STUDENT_COURSE_ENROLLMENT_INTERNAL_PREVIEW: 'false' } })} />)
    expect(screen.queryByTestId('student-course-enrollment-preview')).not.toBeInTheDocument()
  })

  it('muestra la accion de primer ano solo para ingresantes elegibles', async () => {
    const firstYearProps = props()
    const { rerender } = render(<StudentCourseEnrollmentInternalPreview {...firstYearProps} />)
    expect(await screen.findByRole('button', { name: /todas las materias de primer ano/i })).toBeEnabled()

    rerender(<StudentCourseEnrollmentInternalPreview {...props({
      loadPreview: vi.fn().mockResolvedValue(model({
        relations: [{ ...model().selectedRelation, is_first_year_entrant: false }],
      })),
    })} />)
    await waitFor(() => expect(screen.queryByRole('button', { name: /todas las materias de primer ano/i })).not.toBeInTheDocument())
  })

  it('bloquea doble clic y conserva requestId para reintento', async () => {
    let rejectFirst
    const enrollFirstYear = vi.fn()
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectFirst = reject }))
      .mockResolvedValueOnce({ ok: true, data: { status: 'COMPLETED', created_count: 1, existing_count: 0, rejected_count: 0, rejections: [] } })
    render(<StudentCourseEnrollmentInternalPreview {...props({ enrollFirstYear })} />)
    const button = await screen.findByRole('button', { name: /todas las materias de primer ano/i })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(enrollFirstYear).toHaveBeenCalledTimes(1)
    rejectFirst(new Error('NETWORK_RESPONSE_LOST'))
    await screen.findByText('NETWORK_RESPONSE_LOST')
    fireEvent.click(screen.getByRole('button', { name: /todas las materias de primer ano/i }))
    await waitFor(() => expect(enrollFirstYear).toHaveBeenCalledTimes(2))
    expect(enrollFirstYear.mock.calls[0][0].requestId).toBe('request-stable-1')
    expect(enrollFirstYear.mock.calls[1][0].requestId).toBe('request-stable-1')
  })

  it('muestra creadas, existentes y rechazadas devueltas por servidor', async () => {
    const enrollFirstYear = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        status: 'COMPLETED',
        created_count: 2,
        existing_count: 1,
        rejected_count: 1,
        rejections: [{ code: 'PREREQUISITES_NOT_MET' }],
      },
    })
    render(<StudentCourseEnrollmentInternalPreview {...props({ enrollFirstYear })} />)
    fireEvent.click(await screen.findByRole('button', { name: /todas las materias de primer ano/i }))
    expect(await screen.findByText(/Todavia no cumplis la correlatividad/i)).toBeInTheDocument()
    const result = screen.getByText('Resultado de la solicitud').parentElement.parentElement
    expect(within(result).getByText(/Creadas:/)).toHaveTextContent('2')
    expect(within(result).getByText(/Existentes:/)).toHaveTextContent('1')
    expect(within(result).getByText(/Rechazadas:/)).toHaveTextContent('1')
  })

  it('inscribe una oferta individual solo mediante el adapter inyectado', async () => {
    const enrollIndividual = vi.fn().mockResolvedValue({
      ok: true,
      data: { status: 'COMPLETED', course_enrollment_id: 'enrollment-1', rejections: [] },
    })
    render(<StudentCourseEnrollmentInternalPreview {...props({ enrollIndividual })} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Inscribirme$/ }))
    await waitFor(() => expect(enrollIndividual).toHaveBeenCalledWith({
      studentCareerEnrollmentId: 'relation-1',
      courseOfferingId: 'offering-1',
      requestId: 'request-stable-1',
    }))
  })

  it('muestra diagnostico, metricas y auditoria en modo admin', async () => {
    const adminModel = model({
      actorMode: 'admin',
      enrollments: [{
        id: 'enrollment-1',
        student_id: 'student-1',
        course_offering_id: 'offering-1',
        subject_name: 'Materia Uno',
        career_name: 'Carrera A',
        study_plan_name: 'Plan A',
        academic_year_number: 2026,
        commission_code: 'A',
        enrollment_type: 'STUDENT_SELECTED',
        status: 'ENROLLED',
      }],
      metrics: { relations: 1, offerings: 1, enrollments: 1, auditEvents: 1 },
      auditEvents: [{ id: 'event-1', aggregate_id: 'enrollment-1', event_type: 'COURSE_ENROLLMENT_CREATED', sequence_number: 1, event_hash: 'a'.repeat(64), previous_hash: null }],
    })
    render(<StudentCourseEnrollmentInternalPreview {...props({
      mode: 'admin',
      detectedRole: 'admin_instituto',
      loadPreview: vi.fn().mockResolvedValue(adminModel),
    })} />)
    expect(await screen.findByText('Resultados y auditoria')).toBeInTheDocument()
    expect(screen.getByText('Fuente academica transitoria')).toBeInTheDocument()
    expect(screen.getByText('COURSE_ENROLLMENT_CREATED')).toBeInTheDocument()
    expect(screen.getByTestId('student-career-link-admin-panel')).toBeInTheDocument()
    expect(screen.queryByText(/RPC pendiente/i)).not.toBeInTheDocument()
  })

  it('el alumno no ve acciones administrativas de vinculo', async () => {
    render(<StudentCourseEnrollmentInternalPreview {...props()} />)
    await screen.findByText('Diagnostico previo')
    expect(screen.queryByTestId('student-career-link-admin-panel')).not.toBeInTheDocument()
  })

  it('no contiene escrituras directas, service role ni persistencia de snapshot', () => {
    const files = [
      'src/features/studentCourseEnrollment/StudentCourseEnrollmentInternalPreview.jsx',
      'src/features/studentCourseEnrollment/StudentCareerLinkAdminPanel.jsx',
      'src/features/studentCourseEnrollment/studentCourseEnrollmentPreviewService.js',
      'src/services/studentCareerEnrollmentAdminCommands.js',
    ].map((file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n')
    expect(files).not.toMatch(/\.from\([^)]*\)\.(insert|update|delete|upsert)/)
    expect(files).not.toContain('service_role')
    expect(files).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(files).not.toContain('saveWorkspaceSnapshot')
  })
})
