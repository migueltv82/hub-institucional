import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TeacherCourseRosterInternalPreview from './TeacherCourseRosterInternalPreview.jsx'

const env = {
  DEV: true,
  VITE_ENABLE_TEACHER_COURSE_ROSTER_INTERNAL_PREVIEW: 'true',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
}

function model(overrides = {}) {
  return {
    source: 'structured_teacher_course_roster',
    actorMode: 'teacher',
    status: 'READY',
    teacher: { teacherId: 'teacher-1', displayName: 'Docente Uno' },
    teacherOptions: [],
    assignments: [{
      teachingAssignmentId: 'assignment-1',
      subjectName: 'Didactica I',
      careerName: 'Profesorado',
      studyPlanName: 'Plan 2026',
      yearLevel: 1,
      commission: 'A',
      academicYearLabel: '2026',
      teacherRole: 'TITULAR',
      weeklyHours: 4,
      schedules: [{ dayOfWeek: 1, startTime: '18:00:00', endTime: '20:00:00', classroom: 'Aula 1', modality: 'PRESENTIAL' }],
      roster: [{ courseEnrollmentId: 'enrollment-1', studentDisplayName: 'Alumno Uno', courseEnrollmentType: 'ADMINISTRATIVE', courseEnrollmentStatus: 'ENROLLED' }],
    }],
    totals: { activeOfferingsCount: 1, enrolledStudentsCount: 1, assignmentsWithoutScheduleCount: 0, structuredRosterCoveragePercent: 100 },
    warnings: [],
    diagnostics: { legacyFallbackAvailable: true, legacyFallbackUsed: false },
    ...overrides,
  }
}

function props(overrides = {}) {
  return {
    env,
    institutionId: 'institution-1',
    user: { id: 'teacher-1' },
    detectedRole: 'docente',
    hasAuthenticatedSession: true,
    loadMyPreview: vi.fn().mockResolvedValue(model()),
    ...overrides,
  }
}

describe('TeacherCourseRosterInternalPreview', () => {
  it('no monta la vista con feature flag apagada', () => {
    render(<TeacherCourseRosterInternalPreview {...props({ env: { ...env, VITE_ENABLE_TEACHER_COURSE_ROSTER_INTERNAL_PREVIEW: 'false' } })} />)
    expect(screen.queryByTestId('teacher-course-roster-preview')).not.toBeInTheDocument()
  })

  it('bloquea alumnos y sesiones no autenticadas', () => {
    render(<TeacherCourseRosterInternalPreview {...props({ detectedRole: 'alumno', hasAuthenticatedSession: false })} />)
    expect(screen.getByTestId('teacher-course-roster-preview-blocked')).toHaveTextContent('USER_NOT_AUTHORIZED')
    expect(screen.getByTestId('teacher-course-roster-preview-blocked')).toHaveTextContent('AUTHENTICATED_SESSION_REQUIRED')
  })

  it('muestra solo materias, horarios y alumnos devueltos por la RPC', async () => {
    render(<TeacherCourseRosterInternalPreview {...props()} />)
    expect(await screen.findByText('Didactica I')).toBeInTheDocument()
    expect(screen.getByText(/Profesorado/)).toBeInTheDocument()
    expect(screen.getByText(/Lunes/)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Ver padrón estructurado/))
    expect(screen.getByText('Alumno Uno')).toBeInTheDocument()
    expect(screen.queryByText(/DNI|Email|Telefono/i)).not.toBeInTheDocument()
  })

  it('muestra EMPTY sin completar el padron con fallback legacy', async () => {
    const emptyModel = model({ status: 'EMPTY', assignments: [{ ...model().assignments[0], roster: [] }], totals: { ...model().totals, enrolledStudentsCount: 0 } })
    render(<TeacherCourseRosterInternalPreview {...props({ loadMyPreview: vi.fn().mockResolvedValue(emptyModel) })} />)
    expect(await screen.findByText('EMPTY')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Ver padrón estructurado/))
    expect(screen.getByText(/No se agregaron alumnos por carrera o año/)).toBeInTheDocument()
  })

  it('marca PARTIAL cuando falta horario', async () => {
    const partial = model({
      status: 'PARTIAL',
      assignments: [{ ...model().assignments[0], schedules: [] }],
      totals: { ...model().totals, assignmentsWithoutScheduleCount: 1 },
      warnings: [{ code: 'ASSIGNMENT_WITHOUT_SCHEDULE', count: 1 }],
    })
    render(<TeacherCourseRosterInternalPreview {...props({ loadMyPreview: vi.fn().mockResolvedValue(partial) })} />)
    expect(await screen.findByText('PARTIAL')).toBeInTheDocument()
    expect(screen.getAllByText(/ASSIGNMENT_WITHOUT_SCHEDULE/).length).toBeGreaterThan(0)
  })

  it('permite al administrador elegir docente sin consultar tablas', async () => {
    const adminInitial = model({ status: 'BLOCKED', teacher: null, assignments: [], teacherOptions: [{ teacherId: 'teacher-1', displayName: 'Docente Uno', activeAssignmentsCount: 1 }] })
    const loadAdminPreview = vi.fn().mockResolvedValueOnce(adminInitial).mockResolvedValueOnce(model({ actorMode: 'admin' }))
    render(<TeacherCourseRosterInternalPreview {...props({
      mode: 'admin',
      detectedRole: 'admin_instituto',
      loadAdminPreview,
      identityPanelProps: {
        loadCandidates: vi.fn().mockResolvedValue({ profiles: [], teacherRecords: [], diagnostics: { unlinkedProfiles: 0, unlinkedTeacherRecords: 0 } }),
      },
    })} />)
    const select = await screen.findByLabelText('Docente a consultar')
    fireEvent.change(select, { target: { value: 'teacher-1' } })
    await waitFor(() => expect(loadAdminPreview).toHaveBeenLastCalledWith({ institutionId: 'institution-1', teacherId: 'teacher-1' }))
    expect(await screen.findByText('Comparación legacy diagnóstica')).toBeInTheDocument()
  })
})
