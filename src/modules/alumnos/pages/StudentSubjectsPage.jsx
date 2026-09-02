import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useStudentStore } from '../stores/studentStore'
import SubjectEnrollmentForm, { YearCompletionGateAlert } from '../components/Students/SubjectEnrollmentForm'
import PrerequisiteAlert from '../components/Students/PrerequisiteAlert'
import { getPrerequisiteCheck } from '../lib/prerequisites.js'
import { getYearCompletionGateCheck } from '../lib/yearCompletionGate.js'
import { getAttendanceSummaryForEnrollment } from '../lib/studentAttendance.js'

function normalizeStatus(status) {
  return String(status || '').toLowerCase()
}

const ACTIVE_ENROLLMENT_STATUSES = new Set(['active', 'enrolled'])
const COMPLETED_ENROLLMENT_STATUSES = new Set(['completed', 'approved', 'passed'])

function normalizeSubject(item) {
  const subject = item?.subject || item

  return {
    ...subject,
    id: subject?.id || item?.subject_id || item?.id,
    subject_id: subject?.subject_id || item?.subject_id || subject?.code || '',
    canonical_subject_id: subject?.canonical_subject_id || item?.canonical_subject_id || subject?.subject_id || item?.subject_id || subject?.code || '',
    portal_subject_id: subject?.portal_subject_id || item?.portal_subject_id || subject?.id || item?.id || '',
    canonical_program_id: subject?.canonical_program_id || item?.canonical_program_id || subject?.program_id || item?.program_id || '',
    semester: subject?.semester ?? item?.semester ?? 1,
    credits: subject?.credits ?? item?.credits ?? 0,
    is_mandatory: item?.is_mandatory ?? subject?.is_mandatory ?? true,
    program_subject_id: item?.subject ? item.id : item?.program_subject_id
  }
}

function getSubjectId(subject) {
  const item = subject?.subject || subject
  return item?.canonical_subject_id || item?.subject_id || item?.code || item?.id || ''
}

function getEnrollmentSubjectId(enrollment) {
  return enrollment?.canonical_subject_id || enrollment?.subject_id || enrollment?.subject?.canonical_subject_id || enrollment?.subject?.subject_id || enrollment?.subject?.code || enrollment?.subject?.id || ''
}

function getEnrollmentForSubject(enrollments, subjectId, programId) {
  return enrollments.find(enrollment => {
    const sameSubject = getEnrollmentSubjectId(enrollment) === subjectId
    const sameProgram = !programId || enrollment.program_id === programId
    const status = normalizeStatus(enrollment.status)
    return sameSubject && sameProgram && status !== 'dropped'
  })
}

function getSubjectStatusPriority(subject, enrollments, programId) {
  const enrollment = getEnrollmentForSubject(enrollments, getSubjectId(subject), programId)
  const status = normalizeStatus(enrollment?.status)

  if (ACTIVE_ENROLLMENT_STATUSES.has(status)) return 0
  if (!enrollment) return 1
  if (COMPLETED_ENROLLMENT_STATUSES.has(status)) return 2
  return 3
}

function compareSubjectsForStudentView(left, right, enrollments, programId) {
  const priorityDiff = getSubjectStatusPriority(left, enrollments, programId) -
    getSubjectStatusPriority(right, enrollments, programId)
  if (priorityDiff !== 0) return priorityDiff

  const semesterDiff = Number(left.semester || 1) - Number(right.semester || 1)
  if (semesterDiff !== 0) return semesterDiff

  return String(left.code || left.name || '').localeCompare(
    String(right.code || right.name || ''),
    'es',
    { sensitivity: 'base' },
  )
}

function statusConfig(status) {
  const normalized = normalizeStatus(status)

  if (COMPLETED_ENROLLMENT_STATUSES.has(normalized)) {
    return {
      label: 'Completada',
      className: 'bg-emerald-100 text-emerald-800 ring-emerald-200'
    }
  }

  if (ACTIVE_ENROLLMENT_STATUSES.has(normalized)) {
    return {
      label: 'Cursando',
      className: 'bg-sky-100 text-sky-800 ring-sky-200'
    }
  }

  if (normalized === 'dropped') {
    return {
      label: 'Abandonada',
      className: 'bg-slate-100 text-slate-700 ring-slate-200'
    }
  }

  return {
    label: 'Disponible',
    className: 'bg-white text-slate-700 ring-slate-200'
  }
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
    </div>
  )
}

function SubjectCard({
  subject,
  enrollment,
  programId,
  studentId,
  prerequisiteCheck,
  yearGateCheck,
  attendanceSummary,
  onEnroll,
  onWithdraw
}) {
  const [showEnrollForm, setShowEnrollForm] = useState(false)
  const updateEnrollment = useStudentStore(state => state.updateEnrollment)
  const setError = useStudentStore(state => state.setError)
  const currentStatus = statusConfig(enrollment?.status)
  const isEnrolled = Boolean(enrollment) && normalizeStatus(enrollment.status) !== 'dropped'
  const canEnroll = prerequisiteCheck.canEnroll && yearGateCheck.canEnroll && !isEnrolled

  const handleWithdraw = async () => {
    if (!enrollment?.id) return

    try {
      if (onWithdraw) {
        await onWithdraw(enrollment)
      } else {
        updateEnrollment(enrollment.id, {
          status: 'dropped',
          dropped_at: new Date().toISOString()
        })
      }
    } catch (error) {
      setError(error?.message || 'No se pudo desistir de la materia.')
    }
  }

  return (
    <article className={`student-subject-card rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${subject.teacher_notice ? 'student-subject-card--replacement' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {subject.code && (
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                {subject.code}
              </span>
            )}
            <span className={`rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${currentStatus.className}`}>
              {currentStatus.label}
            </span>
            {!subject.is_mandatory && (
              <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-200">
                Optativa
              </span>
            )}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">{subject.name}</h3>
          {subject.teacher_notice && (
            <p className="student-teacher-notice mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Docente de licencia: {subject.teacher_notice.teacherOnLeave || 'docente titular'}; reemplaza {subject.teacher_notice.replacementTeacher || 'docente suplente'}.
            </p>
          )}
          {subject.description && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{subject.description}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Semestre
          </div>
          <div className="text-2xl font-semibold text-slate-950">{subject.semester}</div>
        </div>
      </div>

      <div className="student-subject-metrics mt-4 grid grid-cols-3 gap-3 rounded-md bg-slate-50 p-3 text-sm">
        <div>
          <div className="text-xs text-slate-500">Creditos</div>
          <div className="font-semibold text-slate-900">{subject.credits || 0}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Teoria</div>
          <div className="font-semibold text-slate-900">{subject.hs_theory || 0} hs</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Practica</div>
          <div className="font-semibold text-slate-900">{subject.hs_practice || 0} hs</div>
        </div>
      </div>

      <div className="student-attendance-card mt-3 rounded-md border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-slate-700">Asistencia</span>
          <span className="text-lg font-extrabold text-slate-950">{attendanceSummary?.label ?? 'Sin registros'}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[var(--student-lavender)]"
            style={{ width: `${attendanceSummary?.percentage ?? 0}%` }}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">
          {attendanceSummary?.total
            ? `${attendanceSummary.present} presentes de ${attendanceSummary.total} clases`
            : 'Todavia no hay clases con asistencia cargada.'}
        </p>
      </div>

      <div className="mt-4">
        <PrerequisiteAlert subject={subject} compact hideWhenClear={prerequisiteCheck.canEnroll} />
        <YearCompletionGateAlert check={yearGateCheck} compact className={prerequisiteCheck.canEnroll ? '' : 'mt-3'} />
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {!isEnrolled && (
          <button
            type="button"
            onClick={() => setShowEnrollForm(value => !value)}
            disabled={!canEnroll}
            className="inline-flex flex-1 items-center justify-center rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {showEnrollForm ? 'Cerrar inscripcion' : 'Inscribirme'}
          </button>
        )}

        {isEnrolled && normalizeStatus(enrollment.status) === 'active' && (
          <button
            type="button"
            onClick={handleWithdraw}
            className="inline-flex flex-1 items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            Desistir
          </button>
        )}
      </div>

      {showEnrollForm && !isEnrolled && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <SubjectEnrollmentForm
            subject={subject}
            programId={programId}
            studentId={studentId}
            onEnroll={onEnroll}
            onSuccess={() => setShowEnrollForm(false)}
            showPrerequisites={false}
          />
        </div>
      )}
    </article>
  )
}

export default function StudentSubjectsPage({
  studentId: studentIdProp,
  programId: programIdProp,
  onEnroll,
  onWithdraw
}) {
  const outletContext = useOutletContext() ?? {}
  const enrollHandler = onEnroll ?? outletContext.onEnrollSubject
  const withdrawHandler = onWithdraw ?? outletContext.onWithdrawSubject
  const {
    currentStudent,
    currentProgram,
    subjects,
    enrollments,
    prerequisites,
    grades,
    attendanceRecords,
    loading,
    error,
    selectedSemester,
    filterStatus,
    setSelectedSemester,
    setFilterStatus,
    clearError
  } = useStudentStore(useShallow(state => ({
    currentStudent: state.currentStudent,
    currentProgram: state.currentProgram,
    subjects: state.subjects,
    enrollments: state.enrollments,
    prerequisites: state.prerequisites,
    grades: state.grades,
    attendanceRecords: state.attendanceRecords,
    loading: state.loading,
    error: state.error,
    selectedSemester: state.selectedSemester,
    filterStatus: state.filterStatus,
    setSelectedSemester: state.setSelectedSemester,
    setFilterStatus: state.setFilterStatus,
    clearError: state.clearError
  })))

  const [search, setSearch] = useState('')
  const studentId =
    studentIdProp ||
    (typeof currentStudent === 'string' ? currentStudent : currentStudent?.id || currentStudent?.profile_id) ||
    ''
  const programId =
    programIdProp ||
    (typeof currentProgram === 'string' ? currentProgram : currentProgram?.id) ||
    ''
  const currentProgramName = typeof currentProgram === 'string' ? currentProgram : currentProgram?.name

  const normalizedSubjects = useMemo(() => {
    return subjects.map(normalizeSubject).filter(subject => {
      if (!programId) return true
      return !subject.program_id || subject.program_id === programId
    })
  }, [subjects, programId])

  const semesters = useMemo(() => {
    const values = normalizedSubjects.map(subject => Number(subject.semester) || 1)
    return Array.from(new Set(values)).sort((a, b) => a - b)
  }, [normalizedSubjects])

  const visibleSubjects = useMemo(() => {
    const query = search.trim().toLowerCase()

    return normalizedSubjects.filter(subject => {
      const sameSemester = selectedSemester === 'all' || Number(subject.semester || 1) === Number(selectedSemester)
      const enrollment = getEnrollmentForSubject(enrollments, getSubjectId(subject), programId)
      const status = normalizeStatus(enrollment?.status)
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'available' && !enrollment) ||
        (filterStatus === 'active' && ACTIVE_ENROLLMENT_STATUSES.has(status)) ||
        (filterStatus === 'completed' && COMPLETED_ENROLLMENT_STATUSES.has(status))
      const matchesSearch =
        !query ||
        subject.name?.toLowerCase().includes(query) ||
        subject.code?.toLowerCase().includes(query)

      return sameSemester && matchesStatus && matchesSearch
    }).sort((left, right) => compareSubjectsForStudentView(left, right, enrollments, programId))
  }, [normalizedSubjects, selectedSemester, filterStatus, search, enrollments, programId])

  const summary = useMemo(() => {
    const active = enrollments.filter((enrollment) =>
      (!programId || !enrollment.program_id || enrollment.program_id === programId) &&
      ACTIVE_ENROLLMENT_STATUSES.has(normalizeStatus(enrollment.status))
    ).length
    const completed = enrollments.filter((enrollment) =>
      (!programId || !enrollment.program_id || enrollment.program_id === programId) &&
      COMPLETED_ENROLLMENT_STATUSES.has(normalizeStatus(enrollment.status))
    ).length
    return {
      total: normalizedSubjects.length,
      active,
      completed,
      available: Math.max(normalizedSubjects.length - active - completed, 0)
    }
  }, [normalizedSubjects, enrollments, programId])

  return (
    <main className="student-subjects-page min-h-screen">
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Portal de alumno
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Materias
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Consulta materias por semestre, valida correlatividades e inicia inscripciones.
            </p>
          </div>

          {currentProgram && (
            <div className="student-program-card rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Carrera actual
              </div>
              <div className="mt-1 font-semibold text-slate-950">{currentProgramName}</div>
            </div>
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

        <section className="student-summary-grid mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="student-summary-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{summary.total}</div>
          </div>
          <div className="student-summary-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Cursando</div>
            <div className="mt-2 text-2xl font-semibold text-sky-700">{summary.active}</div>
          </div>
          <div className="student-summary-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Completadas</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-700">{summary.completed}</div>
          </div>
          <div className="student-summary-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Disponibles</div>
            <div className="mt-2 text-2xl font-semibold text-slate-950">{summary.available}</div>
          </div>
        </section>

        <section className="student-subject-filters mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por nombre o codigo"
              className="input-base h-10 px-3 py-2"
            />

            <select
              aria-label="Filtrar materias por estado"
              value={filterStatus}
              onChange={event => setFilterStatus(event.target.value)}
              className="input-base h-10 px-3 py-2"
            >
              <option value="all">Todos los estados</option>
              <option value="available">Disponibles</option>
              <option value="active">Cursando</option>
              <option value="completed">Completadas</option>
            </select>

            <select
              aria-label="Filtrar materias por semestre"
              value={selectedSemester}
              onChange={event => {
                const value = event.target.value
                setSelectedSemester(value === 'all' ? 'all' : Number(value))
              }}
              className="input-base h-10 px-3 py-2"
            >
              <option value="all">Todos los semestres</option>
              {semesters.map(semester => (
                <option key={semester} value={semester}>
                  Semestre {semester}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="mt-6">
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map(item => (
                <div key={item} className="h-72 animate-pulse rounded-lg bg-slate-200" />
              ))}
            </div>
          ) : visibleSubjects.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleSubjects.map(subject => {
                const subjectId = getSubjectId(subject)
                const enrollment = getEnrollmentForSubject(enrollments, subjectId, programId)
                const attendanceSummary = enrollment
                  ? getAttendanceSummaryForEnrollment(enrollment, attendanceRecords)
                  : null
                const prerequisiteCheck = getPrerequisiteCheck({
                  subjectId,
                  subject,
                  prerequisites,
                  enrollments,
                  grades,
                  subjects: normalizedSubjects
                })
                const yearGateCheck = getYearCompletionGateCheck({
                  subject,
                  subjects: normalizedSubjects,
                  grades
                })

                return (
                  <SubjectCard
                    key={subjectId}
                    subject={subject}
                    enrollment={enrollment}
                    programId={programId}
                    studentId={studentId}
                    prerequisiteCheck={prerequisiteCheck}
                    yearGateCheck={yearGateCheck}
                    attendanceSummary={attendanceSummary}
                    onEnroll={enrollHandler}
                    onWithdraw={withdrawHandler}
                  />
                )
              })}
            </div>
          ) : (
            <EmptyState
              title="No hay materias para mostrar"
              description="Ajusta los filtros o carga las materias de la carrera en el store."
            />
          )}
        </section>
      </div>
    </main>
  )
}

