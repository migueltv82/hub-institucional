import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useOutletContext } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useAuth } from '../../../auth/AuthContext.jsx'
import { useSyncData } from '../../../hooks/useSyncData.js'
import { STUDENT_WORKSPACE_KEY } from '../services/studentPortalData.js'
import { useStudentStore } from '../stores/studentStore'
import { getExamEnrollmentEligibility } from '../lib/examEligibility.js'

function normalizeStatus(status) {
  return String(status || '').toLowerCase()
}

function getExamId(exam) {
  return exam?.id || exam?.exam_session?.id
}

function getExamDate(exam) {
  return exam?.exam_date || exam?.exam_session?.exam_date || exam?.date
}

function getExamSubject(exam) {
  return exam?.subject || exam?.exam_session?.subject || null
}

function getExamSubjectId(exam) {
  const subject = getExamSubject(exam)
  return exam?.canonical_subject_id || exam?.subject_id || subject?.canonical_subject_id || subject?.subject_id || subject?.code || subject?.id || ''
}

function getExamProgramId(exam) {
  const subject = getExamSubject(exam)
  return exam?.canonical_program_id || exam?.program_id || subject?.canonical_program_id || subject?.program_id || ''
}

function formatDateTime(dateString) {
  if (!dateString) return 'Sin fecha'

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString))
}

function buildLocalExamEnrollment(exam, currentStudent) {
  const now = new Date().toISOString()
  const examId = getExamId(exam)
  const subjectId = getExamSubjectId(exam)
  const programId = getExamProgramId(exam)
  const studentId =
    typeof currentStudent === 'string'
      ? currentStudent
      : currentStudent?.id || currentStudent?.profile_id || currentStudent?.user_id
  const studentRecordId =
    typeof currentStudent === 'string'
      ? null
      : currentStudent?.record_id || currentStudent?.student_record_id || null

  return {
    id: `local-exam-${examId}-${Date.now()}`,
    exam_session_id: examId,
    exam_table_id: examId,
    profile_id: studentId,
    student_id: studentId,
    student_record_id: studentRecordId,
    subject_id: subjectId,
    program_id: programId,
    status: 'registered',
    created_at: now,
    updated_at: now,
    exam_session: exam
  }
}

export default function StudentExamEnrollmentPage({ onRegisterExam, onCancelExam }) {
  const outletContext = useOutletContext() ?? {}
  const queryClient = useQueryClient()
  const {
    user,
    isRemoteSession,
    isSuperAdmin,
  } = useAuth()
  const registerExamHandler = onRegisterExam ?? outletContext.onRegisterExam
  const cancelExamHandler = onCancelExam ?? outletContext.onCancelExam
  const {
    currentStudent,
    currentInstitution,
    enrollments,
    grades,
    exams,
    examEnrollments,
    prerequisites,
    subjects,
    accountStatus,
    loading,
    error,
    success,
    addExamEnrollment,
    removeExamEnrollment,
    setError,
    setSuccess,
    clearError,
    clearSuccess
  } = useStudentStore(useShallow(state => ({
    currentStudent: state.currentStudent,
    currentInstitution: state.currentInstitution,
    enrollments: state.enrollments,
    grades: state.grades,
    exams: state.exams,
    examEnrollments: state.examEnrollments,
    prerequisites: state.prerequisites,
    subjects: state.subjects,
    accountStatus: state.accountStatus,
    loading: state.loading,
    error: state.error,
    success: state.success,
    addExamEnrollment: state.addExamEnrollment,
    removeExamEnrollment: state.removeExamEnrollment,
    setError: state.setError,
    setSuccess: state.setSuccess,
    clearError: state.clearError,
    clearSuccess: state.clearSuccess
  })))
  const adeudaCuota = Boolean(accountStatus?.adeuda_cuota)
  const portalQueryKey = useMemo(
    () => ['student-portal', user?.id, user?.email, isRemoteSession, isSuperAdmin, currentInstitution?.id],
    [currentInstitution?.id, isRemoteSession, isSuperAdmin, user?.email, user?.id],
  )

  const registeredByExamId = useMemo(() => {
    return new Map(
      examEnrollments
        .filter(enrollment => normalizeStatus(enrollment.status) !== 'dropped')
        .map(enrollment => [
          enrollment.exam_session_id || enrollment.exam_table_id || enrollment.exam_session?.id,
          enrollment
        ])
    )
  }, [examEnrollments])

  const upcomingExams = useMemo(() => {
    return exams
      .filter(exam => {
        const date = getExamDate(exam)
        return date && new Date(date) >= new Date()
      })
      .sort((a, b) => new Date(getExamDate(a)) - new Date(getExamDate(b)))
  }, [exams])

  const pastExams = useMemo(() => {
    return exams
      .filter(exam => {
        const date = getExamDate(exam)
        return date && new Date(date) < new Date()
      })
      .sort((a, b) => new Date(getExamDate(b)) - new Date(getExamDate(a)))
  }, [exams])

  const [activeTab, setActiveTab] = useState('proximas')

  const { isSubscribed: isRealtimeConnected } = useSyncData({
    table: 'workspace_snapshots',
    filter: currentInstitution?.id ? `institution_id=eq.${currentInstitution.id}` : undefined,
    enabled: Boolean(isRemoteSession && currentInstitution?.id),
    onChange: (payload) => {
      const workspaceKey = payload.new?.workspace_key ?? payload.old?.workspace_key

      if (workspaceKey !== STUDENT_WORKSPACE_KEY) return

      void queryClient.invalidateQueries({ queryKey: portalQueryKey })
    },
  })

  const handleRegister = async exam => {
    const examId = getExamId(exam)
    if (!examId) return
    const eligibility = getExamEnrollmentEligibility({ exam, exams, enrollments, grades, prerequisites, subjects, adeudaCuota })

    if (!eligibility.canRegister) {
      setError(eligibility.reason)
      return
    }

    try {
      const currentStudentId =
        typeof currentStudent === 'string'
          ? currentStudent
          : currentStudent?.id || currentStudent?.profile_id || currentStudent?.user_id
      const payload = {
        exam_session_id: examId,
        exam_table_id: examId,
        subject_id: getExamSubjectId(exam) || undefined,
        program_id: getExamProgramId(exam) || undefined,
        profile_id: currentStudentId,
        student_id: currentStudentId,
        student_record_id: typeof currentStudent === 'string'
          ? undefined
          : currentStudent?.record_id || currentStudent?.student_record_id || undefined,
        status: 'registered'
      }

      const result = registerExamHandler
        ? await registerExamHandler(payload, { exam })
        : buildLocalExamEnrollment(exam, currentStudent)

      if (result === false || result?.success === false || result?.error) {
        throw new Error(result?.error?.message || result?.error || 'No se pudo registrar la mesa.')
      }

      const enrollment =
        result && typeof result === 'object'
          ? result.data ||
            result.enrollment ||
            (result.id || result.exam_session_id ? result : buildLocalExamEnrollment(exam, currentStudent))
          : buildLocalExamEnrollment(exam, currentStudent)

      addExamEnrollment(enrollment)
      setSuccess('Inscripcion a mesa registrada.')
    } catch (registerError) {
      setError(registerError?.message || 'No se pudo registrar la mesa.')
    }
  }

  const handleCancel = async enrollment => {
    if (!enrollment?.id) return

    try {
      if (cancelExamHandler) {
        await cancelExamHandler(enrollment)
      }

      removeExamEnrollment(enrollment.id)
      setSuccess('Inscripcion a mesa cancelada.')
    } catch (cancelError) {
      setError(cancelError?.message || 'No se pudo cancelar la inscripcion.')
    }
  }

  return (
    <main className="student-page">
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Portal de alumno
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Mesas de examen
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Revisa las mesas disponibles y gestiona tus inscripciones.
          </p>
          {isRemoteSession && (
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--student-lavender-ink)]">
              {isRealtimeConnected ? 'Sincronizacion en vivo activa' : 'Conectando sincronizacion en vivo'}
            </p>
          )}
        </div>

        {error && (
          <div className="mt-6 flex items-start justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="font-semibold text-red-800">
              Cerrar
            </button>
          </div>
        )}

        {success && (
          <div className="mt-6 flex items-start justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>{success}</span>
            <button type="button" onClick={clearSuccess} className="font-semibold text-emerald-900">
              Cerrar
            </button>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('proximas')}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'proximas' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200'
            }`}
          >
            Proximas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('historial')}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === 'historial' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200'
            }`}
          >
            Historial
          </button>
        </div>

        {activeTab === 'proximas' ? (
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          {loading ? (
            [1, 2].map(item => (
              <div key={item} className="h-52 animate-pulse rounded-lg bg-slate-200" />
            ))
          ) : upcomingExams.length > 0 ? (
            upcomingExams.map(exam => {
              const examId = getExamId(exam)
              const subject = getExamSubject(exam)
              const registeredEnrollment = registeredByExamId.get(examId)
              const isRegistered = Boolean(registeredEnrollment)
              const eligibility = getExamEnrollmentEligibility({ exam, exams, enrollments, grades, prerequisites, subjects, adeudaCuota })

              return (
                <article key={examId} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">
                        {subject?.name || exam.subject_name || 'Mesa de examen'}
                      </h2>
                      {subject?.code && (
                        <p className="mt-1 text-sm text-slate-500">{subject.code}</p>
                      )}
                      {exam.call_label && (
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                          {exam.call_label}
                        </p>
                      )}
                    </div>
                    {isRegistered && (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
                        Inscripto
                      </span>
                    )}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Fecha y hora</dt>
                      <dd className="font-semibold text-slate-900">{formatDateTime(getExamDate(exam))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Lugar</dt>
                      <dd className="font-semibold text-slate-900">{exam.location || 'A confirmar'}</dd>
                    </div>
                  </dl>

                  <div className="mt-5">
                    {isRegistered ? (
                      <button
                        type="button"
                        onClick={() => handleCancel(registeredEnrollment)}
                        className="inline-flex w-full items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                      >
                        Cancelar inscripcion
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {!eligibility.canRegister && (
                          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                            {eligibility.reason}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRegister(exam)}
                          disabled={!eligibility.canRegister}
                          className="inline-flex w-full items-center justify-center rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                        >
                          Inscribirme
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              )
            })
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-600 lg:col-span-2">
              No hay mesas de examen disponibles.
            </div>
          )}
        </section>
        ) : (
        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          {pastExams.length > 0 ? (
            pastExams.map(exam => {
              const examId = getExamId(exam)
              const subject = getExamSubject(exam)
              const registeredEnrollment = registeredByExamId.get(examId)
              const historyStatus = registeredEnrollment
                ? (normalizeStatus(registeredEnrollment.status) === 'dropped' ? 'Cancelada' : 'Inscripto')
                : 'No inscripto'

              return (
                <article key={examId} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">
                        {subject?.name || exam.subject_name || 'Mesa de examen'}
                      </h2>
                      {subject?.code && (
                        <p className="mt-1 text-sm text-slate-500">{subject.code}</p>
                      )}
                      {exam.call_label && (
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                          {exam.call_label}
                        </p>
                      )}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                      {historyStatus}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Fecha y hora</dt>
                      <dd className="font-semibold text-slate-900">{formatDateTime(getExamDate(exam))}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Lugar</dt>
                      <dd className="font-semibold text-slate-900">{exam.location || 'A confirmar'}</dd>
                    </div>
                  </dl>
                </article>
              )
            })
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-600 lg:col-span-2">
              Todavia no hay mesas pasadas para mostrar.
            </div>
          )}
        </section>
        )}
      </div>
    </main>
  )
}

