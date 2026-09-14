import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  BookOpenCheck,
  BookMarked,
  Building2,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  ListChecks,
  LogOut,
  UsersRound,
} from 'lucide-react'
import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import AppFooter from '../../components/AppFooter.jsx'
import ProductBrand from '../../components/ProductBrand.jsx'
import StudentDashboardPage from './pages/StudentDashboardPage.jsx'
import StudentAcademicStatusPage from './pages/StudentAcademicStatusPage.jsx'
import StudentSubjectsPage from './pages/StudentSubjectsPage.jsx'
import StudentGradesPage from './pages/StudentGradesPage.jsx'
import StudentClassmatesPage from './pages/StudentClassmatesPage.jsx'
import StudentExamEnrollmentPage from './pages/StudentExamEnrollmentPage.jsx'
import { isStudentCourseEnrollmentInternalPreviewEnabled } from '../../features/studentCourseEnrollment/studentCourseEnrollmentPreviewAccess.js'
import { saveWorkspaceSnapshot } from '../../services/workspaceSnapshot.js'
import { fetchStudentPortalData, STUDENT_WORKSPACE_KEY } from './services/studentPortalData.js'
import { mutateStudentPortal } from './services/studentPortalMutations.js'
import { mergeStudentProfile } from './services/studentProfile.js'
import { useStudentStore } from './stores/studentStore.js'

const baseNavItems = [
  { to: '/app/dashboard', label: 'Dashboard', icon: GraduationCap },
  { to: '/app/estado-academico', label: 'Estado academico', icon: ListChecks },
  { to: '/app/materias', label: 'Materias', icon: BookOpenCheck },
  { to: '/app/companeros', label: 'Compañeros', icon: UsersRound },
  { to: '/app/calificaciones', label: 'Calificaciones', icon: ClipboardList },
  { to: '/app/mesas-examen', label: 'Mesas de examen', icon: CalendarDays },
]

const StudentCourseEnrollmentInternalPreview = import.meta.env.DEV
  ? lazy(() => import('../../features/studentCourseEnrollment/StudentCourseEnrollmentInternalPreview.jsx'))
  : null

function StudentPortalLayout({
  data,
  error,
  isLoading,
  onCancelExam,
  onEnrollSubject,
  onOpenSubjects,
  onRegisterExam,
  onSaveProfile,
  onWithdrawSubject,
  showCourseEnrollmentPreview,
}) {
  const {
    user,
    isRemoteSession,
    signOutRemote,
  } = useAuth()
  const setCurrentStudent = useStudentStore((state) => state.setCurrentStudent)
  const setCurrentProgram = useStudentStore((state) => state.setCurrentProgram)
  const setCurrentInstitution = useStudentStore((state) => state.setCurrentInstitution)
  const setPrograms = useStudentStore((state) => state.setPrograms)
  const setSubjects = useStudentStore((state) => state.setSubjects)
  const setEnrollments = useStudentStore((state) => state.setEnrollments)
  const setGrades = useStudentStore((state) => state.setGrades)
  const setAttendanceRecords = useStudentStore((state) => state.setAttendanceRecords)
  const setExams = useStudentStore((state) => state.setExams)
  const setExamEnrollments = useStudentStore((state) => state.setExamEnrollments)
  const setPrerequisites = useStudentStore((state) => state.setPrerequisites)
  const setAcademicStatus = useStudentStore((state) => state.setAcademicStatus)
  const setAccountStatus = useStudentStore((state) => state.setAccountStatus)
  const setLoading = useStudentStore((state) => state.setLoading)
  const setError = useStudentStore((state) => state.setError)
  const clearError = useStudentStore((state) => state.clearError)

  useEffect(() => {
    setLoading(isLoading)
  }, [isLoading, setLoading])

  useEffect(() => {
    if (!error) return
    setError(error.message || 'No se pudo cargar el portal de alumno.')
  }, [error, setError])

  useEffect(() => {
    if (!data) return

    setCurrentStudent(data.currentStudent)
    setCurrentProgram(data.currentProgram)
    setCurrentInstitution(data.currentInstitution)
    setPrograms(data.programs)
    setSubjects(data.subjects)
    setEnrollments(data.enrollments)
    setGrades(data.grades)
    setAttendanceRecords(data.attendanceRecords ?? [])
    setExams(data.exams)
    setExamEnrollments(data.examEnrollments)
    setPrerequisites(data.prerequisites)
    setAcademicStatus(data.academicStatus)
    setAccountStatus(data.accountStatus)
    clearError()
  }, [
    clearError,
    data,
    setAcademicStatus,
    setAccountStatus,
    setAttendanceRecords,
    setCurrentInstitution,
    setCurrentProgram,
    setCurrentStudent,
    setEnrollments,
    setExamEnrollments,
    setExams,
    setGrades,
    setPrerequisites,
    setPrograms,
    setSubjects,
  ])

  const studentName = data?.currentStudent?.full_name ?? user?.nombre ?? 'Alumno'
  const firstName = String(studentName).trim().split(/\s+/)[0] || 'Alumno'
  const studentInitials = String(studentName)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'AL'
  const institutionName = data?.currentInstitution?.name || 'Institucion'
  const currentDateLabel = new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  const navItems = [...baseNavItems, ...(showCourseEnrollmentPreview ? [{
    to: '/app/inscripcion-cursado-preview',
    label: 'Inscripcion al cursado',
    icon: BookMarked,
  }] : [])]

  return (
    <div className="student-portal app-shell">
      <header className="student-portal-hero compact-hero rise-in">
        <div className="student-portal-hero__glow student-portal-hero__glow--one" aria-hidden="true" />
        <div className="student-portal-hero__glow student-portal-hero__glow--two" aria-hidden="true" />

        <section className="student-portal-welcome relative z-10">
          <div className="student-portal-brand-row">
            <ProductBrand />
            <span className="student-portal-badge">
              <GraduationCap className="h-4 w-4" />
              Mi espacio
            </span>
          </div>

          <div className="student-portal-greeting">
            <div className="student-portal-avatar" aria-hidden="true">{studentInitials}</div>
            <div className="min-w-0">
              <p className="student-portal-eyebrow">Hola, {firstName}</p>
              <h1>{studentName}</h1>
              <div className="student-portal-context">
                <span><Building2 className="h-3.5 w-3.5" />{institutionName}</span>
                <span className="capitalize">{currentDateLabel}</span>
              </div>
            </div>
          </div>
        </section>

        <nav
          className="student-portal-nav student-portal-nav--desktop relative z-10 mt-5 flex flex-wrap items-center gap-2 border-t pt-4"
          aria-label="Navegacion principal"
        >
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => [
                  'student-portal-nav__item inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm font-extrabold transition',
                  isActive ? 'student-portal-nav__item--active' : 'student-portal-nav__item--idle',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}

          {isRemoteSession && (
            <button
              className="student-portal-signout ml-auto inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm font-extrabold transition"
              type="button"
              onClick={signOutRemote}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
          )}
        </nav>
      </header>

      {error && (
        <section className="student-portal-alert rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            {error.message || 'No se pudo cargar el portal de alumno.'}
          </p>
        </section>
      )}

      <div className="student-portal-content flex-1">
        <Outlet context={{
          data,
          onCancelExam,
          onEnrollSubject,
          onOpenSubjects,
          onRegisterExam,
          onSaveProfile,
          onWithdrawSubject,
        }}
        />
      </div>
      <AppFooter />

      <nav className="student-bottom-nav" aria-label="Navegacion principal">
        {navItems.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => [
                'student-bottom-nav__item',
                isActive ? 'student-bottom-nav__item--active' : '',
              ].join(' ')}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{item.label === 'Inscripcion al cursado' ? 'Cursado' : item.label}</span>
            </NavLink>
          )
        })}

        {isRemoteSession && (
          <button className="student-bottom-nav__item" type="button" onClick={signOutRemote}>
            <LogOut className="h-5 w-5" aria-hidden="true" />
            <span>Salir</span>
          </button>
        )}
      </nav>
    </div>
  )
}

export default function StudentPortalModule() {
  const {
    user,
    isRemoteSession,
    isSuperAdmin,
    activeInstitution,
  } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setEnrollments = useStudentStore((state) => state.setEnrollments)
  const setSuccess = useStudentStore((state) => state.setSuccess)
  const courseEnrollmentPreviewEnabled = import.meta.env.DEV && isStudentCourseEnrollmentInternalPreviewEnabled()

  const queryKey = useMemo(
    () => ['student-portal', user?.id, user?.email, isRemoteSession, isSuperAdmin, activeInstitution?.id],
    [activeInstitution?.id, isRemoteSession, isSuperAdmin, user?.email, user?.id],
  )
  const { data, error, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchStudentPortalData({ user, isRemoteSession, isSuperAdmin, activeInstitution }),
    enabled: Boolean(user?.id),
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  })

  const persistStudentSnapshot = useCallback(async (buildPayload) => {
    const institutionId = data?.currentInstitution?.id

    if (!institutionId) {
      throw new Error('No hay una institucion activa para guardar el cambio.')
    }

    const baseSnapshot = data?.workspaceSnapshot ?? {}
    const payload = buildPayload(baseSnapshot)

    await saveWorkspaceSnapshot({
      institutionId,
      workspaceKey: STUDENT_WORKSPACE_KEY,
      ownerEmail: user?.email ?? null,
      ownerUserId: user?.id ?? null,
      payload,
      useRemote: Boolean(isRemoteSession),
    })

    await queryClient.invalidateQueries({ queryKey })
    return payload
  }, [data?.currentInstitution?.id, data?.workspaceSnapshot, isRemoteSession, queryClient, queryKey, user?.email, user?.id])

  const handleEnrollSubject = useCallback(async (payload, { subject } = {}) => {
    const now = new Date().toISOString()
    const currentStudent = data?.currentStudent ?? {}
    const enrollment = {
      id: `student-enrollment-${payload.profile_id}-${payload.subject_id}-${Date.now()}`,
      ...payload,
      student_record_id: payload.student_record_id || currentStudent.record_id || currentStudent.student_record_id || undefined,
      email: payload.email || currentStudent.email || undefined,
      full_name: payload.full_name || currentStudent.full_name || undefined,
      dni: payload.dni || currentStudent.dni || currentStudent.raw?.dni || undefined,
      status: payload.status || 'active',
      enrolled_at: now,
      created_at: now,
      updated_at: now,
      subject,
    }

    if (isRemoteSession) {
      const result = await mutateStudentPortal({
        institutionId: data?.currentInstitution?.id,
        mutationType: 'enroll_subject',
        payload: { enrollment },
        useRemote: true,
        workspaceKey: STUDENT_WORKSPACE_KEY,
      })

      await queryClient.invalidateQueries({ queryKey })
      return result.data ?? enrollment
    }

    await persistStudentSnapshot((snapshot) => {
      const current = Array.isArray(snapshot.enrollments) ? snapshot.enrollments : []
      const nextEnrollments = current.some((item) =>
        item.subject_id === enrollment.subject_id &&
        item.program_id === enrollment.program_id &&
        (item.profile_id === enrollment.profile_id || item.student_id === enrollment.student_id)
      )
        ? current.map((item) =>
            item.subject_id === enrollment.subject_id &&
            item.program_id === enrollment.program_id &&
            (item.profile_id === enrollment.profile_id || item.student_id === enrollment.student_id)
              ? { ...item, ...enrollment, id: item.id || enrollment.id }
              : item,
          )
        : [...current, enrollment]

      return {
        ...snapshot,
        enrollments: nextEnrollments,
      }
    })

    return enrollment
  }, [data?.currentInstitution?.id, data?.currentStudent, isRemoteSession, persistStudentSnapshot, queryClient, queryKey])

  const handleWithdrawSubject = useCallback(async (enrollment) => {
    const droppedAt = new Date().toISOString()
    const updatedEnrollment = {
      ...enrollment,
      status: 'dropped',
      dropped_at: droppedAt,
      updated_at: droppedAt,
    }

    if (isRemoteSession) {
      const result = await mutateStudentPortal({
        institutionId: data?.currentInstitution?.id,
        mutationType: 'withdraw_subject',
        payload: { enrollment_id: enrollment.id },
        useRemote: true,
        workspaceKey: STUDENT_WORKSPACE_KEY,
      })

      await queryClient.invalidateQueries({ queryKey })
      setSuccess('Inscripcion a materia dada de baja.')
      return result.data ?? updatedEnrollment
    }

    await persistStudentSnapshot((snapshot) => ({
      ...snapshot,
      enrollments: (Array.isArray(snapshot.enrollments) ? snapshot.enrollments : []).map((item) =>
        item.id === enrollment.id ? updatedEnrollment : item,
      ),
    }))

    setEnrollments((data?.enrollments ?? []).map((item) =>
      item.id === enrollment.id ? updatedEnrollment : item,
    ))
    setSuccess('Inscripcion a materia dada de baja.')
    return updatedEnrollment
  }, [data?.currentInstitution?.id, data?.enrollments, isRemoteSession, persistStudentSnapshot, queryClient, queryKey, setEnrollments, setSuccess])

  const handleRegisterExam = useCallback(async (payload, { exam } = {}) => {
    const now = new Date().toISOString()
    const enrollment = {
      id: `student-exam-${payload.profile_id}-${payload.exam_session_id}-${Date.now()}`,
      ...payload,
      status: payload.status || 'registered',
      created_at: now,
      updated_at: now,
      exam_session: exam,
    }

    if (isRemoteSession) {
      const result = await mutateStudentPortal({
        institutionId: data?.currentInstitution?.id,
        mutationType: 'register_exam',
        payload: { exam_enrollment: enrollment },
        useRemote: true,
        workspaceKey: STUDENT_WORKSPACE_KEY,
      })

      await queryClient.invalidateQueries({ queryKey })
      return result.data ?? enrollment
    }

    await persistStudentSnapshot((snapshot) => {
      const current = Array.isArray(snapshot.examEnrollments) ? snapshot.examEnrollments : []
      const nextExamEnrollments = current.some((item) =>
        item.exam_session_id === enrollment.exam_session_id &&
        item.profile_id === enrollment.profile_id
      )
        ? current.map((item) =>
            item.exam_session_id === enrollment.exam_session_id && item.profile_id === enrollment.profile_id
              ? { ...item, ...enrollment, id: item.id || enrollment.id }
              : item,
          )
        : [...current, enrollment]

      return {
        ...snapshot,
        examEnrollments: nextExamEnrollments,
      }
    })

    return enrollment
  }, [data?.currentInstitution?.id, isRemoteSession, persistStudentSnapshot, queryClient, queryKey])

  const handleCancelExam = useCallback(async (enrollment) => {
    const cancelledAt = new Date().toISOString()

    if (isRemoteSession) {
      await mutateStudentPortal({
        institutionId: data?.currentInstitution?.id,
        mutationType: 'cancel_exam',
        payload: { exam_enrollment_id: enrollment.id },
        useRemote: true,
        workspaceKey: STUDENT_WORKSPACE_KEY,
      })

      await queryClient.invalidateQueries({ queryKey })
      return
    }

    await persistStudentSnapshot((snapshot) => ({
      ...snapshot,
      examEnrollments: (Array.isArray(snapshot.examEnrollments) ? snapshot.examEnrollments : []).map((item) =>
        item.id === enrollment.id
          ? { ...item, status: 'dropped', dropped_at: cancelledAt, updated_at: cancelledAt }
          : item,
      ),
    }))
  }, [data?.currentInstitution?.id, isRemoteSession, persistStudentSnapshot, queryClient, queryKey])

  const handleOpenSubjects = useCallback(() => {
    navigate('/app/materias')
  }, [navigate])

  const handleSaveProfile = useCallback(async (profile) => {
    if (isRemoteSession) {
      const result = await mutateStudentPortal({
        institutionId: data?.currentInstitution?.id,
        mutationType: 'update_profile',
        payload: { profile },
        useRemote: true,
        workspaceKey: STUDENT_WORKSPACE_KEY,
      })

      await queryClient.invalidateQueries({ queryKey })
      return result.data
    }

    const currentStudent = data?.currentStudent
    await persistStudentSnapshot((snapshot) => ({
      ...snapshot,
      alumnos: (Array.isArray(snapshot.alumnos) ? snapshot.alumnos : []).map((student) => {
        const sameRecord = currentStudent?.record_id && (
          student.record_id === currentStudent.record_id || student.id === currentStudent.record_id
        )
        const sameEmail = String(student.email || '').trim().toLowerCase() === String(currentStudent?.email || '').trim().toLowerCase()
        return sameRecord || sameEmail ? mergeStudentProfile(student, profile) : student
      }),
    }))
  }, [data?.currentInstitution?.id, data?.currentStudent, isRemoteSession, persistStudentSnapshot, queryClient, queryKey])

  const courseEnrollmentLegacyInputs = useMemo(() => ({
    studentRecords: (data?.rosterRows ?? []).map((row) => ({
      id: row.record_id ?? row.id,
      institution_id: data?.currentInstitution?.id,
      email: row.email,
      career: row.carrera ?? row.career,
    })),
    profiles: user?.id ? [{
      user_id: user.id,
      email: user.email,
      account_role: 'alumno',
    }] : [],
    memberships: user?.id && data?.currentInstitution?.id ? [{
      user_id: user.id,
      institution_id: data.currentInstitution.id,
    }] : [],
  }), [data, user])

  if (isLoading) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center p-4 md:p-6">
        <section className="panel w-full max-w-md text-center">
          <span className="soft-title">Institutional Hub</span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Cargando portal de alumno</h1>
          <p className="mt-3 text-sm text-slate-600">
            Estamos preparando tu espacio academico.
          </p>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center p-4 md:p-6">
        <section className="panel w-full max-w-md text-center">
          <span className="soft-title">Institutional Hub</span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">Error al cargar portal</h1>
          <p className="mt-3 text-sm text-slate-600">
            {error.message || 'No se pudo cargar el portal de alumno.'}
          </p>
        </section>
      </main>
    )
  }

  return (
    <Routes>
      <Route
        element={
          <StudentPortalLayout
            data={data}
            error={error}
            isLoading={isLoading}
            onCancelExam={handleCancelExam}
            onEnrollSubject={handleEnrollSubject}
            onOpenSubjects={handleOpenSubjects}
            onRegisterExam={handleRegisterExam}
            onSaveProfile={handleSaveProfile}
            onWithdrawSubject={handleWithdrawSubject}
            showCourseEnrollmentPreview={courseEnrollmentPreviewEnabled}
          />
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<StudentDashboardPage />} />
        <Route path="estado-academico" element={<StudentAcademicStatusPage />} />
        <Route path="materias" element={<StudentSubjectsPage />} />
        <Route path="companeros" element={<StudentClassmatesPage />} />
        <Route path="calificaciones" element={<StudentGradesPage />} />
        <Route path="mesas-examen" element={<StudentExamEnrollmentPage />} />
        {courseEnrollmentPreviewEnabled && StudentCourseEnrollmentInternalPreview && (
          <Route
            path="inscripcion-cursado-preview"
            element={(
              <Suspense fallback={null}>
                <StudentCourseEnrollmentInternalPreview
                  detectedRole={user?.accountRole ?? user?.role}
                  hasAuthenticatedSession={isRemoteSession}
                  institutionId={data?.currentInstitution?.id}
                  legacyInputs={courseEnrollmentLegacyInputs}
                  mode="student"
                  user={user}
                />
              </Suspense>
            )}
          />
        )}
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  )
}
