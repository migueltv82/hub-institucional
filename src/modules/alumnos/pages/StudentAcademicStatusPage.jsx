import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { getAcademicStatusLabel, normalizeAcademicStatus } from '../lib/examEligibility.js'
import { getEnrollmentGrades } from '../lib/gradeMatching.js'
import { useStudentStore } from '../stores/studentStore'

function normalizeStatus(status) {
  return String(status || '').toLowerCase()
}

function normalizeSubject(item) {
  const subject = item?.subject || item
  const year = Number(subject?.year ?? subject?.anio ?? subject?.ano ?? subject?.semester ?? item?.year ?? item?.anio ?? item?.ano ?? item?.semester ?? 1) || 1

  return {
    ...subject,
    id: subject?.id || item?.subject_id || item?.id,
    subject_id: subject?.subject_id || item?.subject_id || subject?.code || '',
    canonical_subject_id: subject?.canonical_subject_id || item?.canonical_subject_id || subject?.subject_id || item?.subject_id || subject?.code || '',
    portal_subject_id: subject?.portal_subject_id || item?.portal_subject_id || subject?.id || item?.id || '',
    program_id: subject?.program_id || item?.program_id,
    canonical_program_id: subject?.canonical_program_id || item?.canonical_program_id || subject?.program_id || item?.program_id,
    code: subject?.code ?? item?.code ?? '',
    name: subject?.name ?? item?.name ?? 'Materia sin nombre',
    year,
    credits: Number(subject?.credits ?? item?.credits ?? 0) || 0,
    is_mandatory: item?.is_mandatory ?? subject?.is_mandatory ?? true,
  }
}

function getProgramId(program) {
  return typeof program === 'string' ? program : program?.canonical_program_id || program?.program_id || program?.id || ''
}

function getSubjectId(subject) {
  const item = subject?.subject || subject
  return item?.canonical_subject_id || item?.subject_id || item?.code || item?.id || ''
}

function getEnrollmentSubjectId(enrollment) {
  return enrollment?.canonical_subject_id || enrollment?.subject_id || enrollment?.subject?.canonical_subject_id || enrollment?.subject?.subject_id || enrollment?.subject?.code || enrollment?.subject?.id || ''
}

function getEnrollmentForSubject(enrollments, subjectId, programId) {
  return enrollments.find((enrollment) => {
    const sameSubject = getEnrollmentSubjectId(enrollment) === subjectId
    const enrollmentProgramId = enrollment.program_id || enrollment.canonical_program_id
    const sameProgram = !programId || !enrollmentProgramId || enrollmentProgramId === programId
    const status = normalizeStatus(enrollment.status)
    return sameSubject && sameProgram && status !== 'dropped'
  })
}

function subjectBelongsToProgram(subject, programId) {
  const subjectProgramId = subject.program_id || subject.canonical_program_id
  return !programId || !subjectProgramId || subjectProgramId === programId
}

function getGradeType(grade) {
  return normalizeStatus(grade?.grade_type || grade?.type || 'final')
}

function getGradeScore(grade) {
  const score = Number(grade?.score ?? grade?.grade_value ?? grade?.final_grade ?? grade?.value)
  return Number.isFinite(score) ? score : null
}

function getGradeDate(grade) {
  return grade?.final_date || grade?.fecha_final || grade?.graded_at || grade?.date || grade?.updated_at || grade?.created_at || ''
}

function formatShortDate(value) {
  if (!value) return ''

  const dateParts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/)
  const date = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date)
}

function getFinalGrade(enrollment, grades) {
  const finalGrade = getEnrollmentGrades(enrollment, grades).find((grade) => {
    const type = getGradeType(grade)
    return type === 'final' || grade.final_grade !== undefined
  })
  return finalGrade ?? null
}

function getFinalScore(enrollment, grades) {
  return getGradeScore(getFinalGrade(enrollment, grades))
}

function getAcademicStatusFromRecord(record) {
  return normalizeAcademicStatus(record?.academic_status || record?.condition || record?.condicion)
}

function getAcademicDateTimestamp(record) {
  const timestamp = Date.parse(getGradeDate(record))
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getRegularityGrade(enrollment, grades) {
  return getEnrollmentGrades(enrollment, grades)
    .filter((grade) => getAcademicStatusFromRecord(grade) === 'regular')
    .sort((left, right) => getAcademicDateTimestamp(right) - getAcademicDateTimestamp(left))[0] ?? null
}

function getRegularityDate(enrollment, grades, academicStatus) {
  const regularityGrade = getRegularityGrade(enrollment, grades)
  const explicitDate = regularityGrade?.regularity_date ||
    regularityGrade?.fecha_regularidad ||
    enrollment?.regularity_date ||
    enrollment?.fecha_regularidad ||
    ''

  if (explicitDate) return formatShortDate(explicitDate)

  const regularityYear = regularityGrade?.regular_year ||
    regularityGrade?.anio_regularidad ||
    enrollment?.regular_year ||
    enrollment?.anio_regularidad ||
    ''

  if (regularityYear) return String(regularityYear)

  if (regularityGrade || academicStatus === 'regular') {
    return formatShortDate(getGradeDate(regularityGrade) || enrollment?.regularized_at || enrollment?.regular_at || '')
  }

  return ''
}

function getFinalDate(enrollment, grades) {
  return formatShortDate(getGradeDate(getFinalGrade(enrollment, grades)))
}

function getLatestAcademicStatus(enrollment, grades) {
  const enrollmentGrades = getEnrollmentGrades(enrollment, grades)
    .sort((left, right) => new Date(right.updated_at ?? right.graded_at ?? 0) - new Date(left.updated_at ?? left.graded_at ?? 0))
  const gradeStatus = enrollmentGrades
    .map((grade) => normalizeAcademicStatus(grade.academic_status || grade.condition || grade.condicion))
    .find((status) => status !== 'pending')

  if (gradeStatus) return gradeStatus

  return normalizeAcademicStatus(enrollment?.academic_status || enrollment?.condition || enrollment?.condicion)
}

function subjectStatus(enrollment, grades) {
  const status = normalizeStatus(enrollment?.status)
  const finalScore = getFinalScore(enrollment, grades)
  const academicStatus = getLatestAcademicStatus(enrollment, grades)
  const regularityDate = getRegularityDate(enrollment, grades, academicStatus)
  const finalDate = getFinalDate(enrollment, grades)

  if (academicStatus === 'regular') {
    return {
      label: getAcademicStatusLabel(academicStatus),
      className: 'bg-sky-100 text-sky-800 ring-sky-200',
      tone: 'sky',
      finalScore,
      regularityDate,
      finalDate,
      academicStatus,
      isApproved: false,
    }
  }

  if (academicStatus === 'libre') {
    return {
      label: getAcademicStatusLabel(academicStatus),
      className: 'bg-amber-100 text-amber-800 ring-amber-200',
      tone: 'amber',
      finalScore,
      regularityDate,
      finalDate,
      academicStatus,
      isApproved: false,
    }
  }

  if (academicStatus === 'promocionado') {
    return {
      label: getAcademicStatusLabel(academicStatus),
      className: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
      tone: 'emerald',
      finalScore,
      regularityDate,
      finalDate,
      academicStatus,
      isApproved: true,
    }
  }

  if (academicStatus === 'approved') {
    return {
      label: getAcademicStatusLabel(academicStatus),
      className: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
      tone: 'emerald',
      finalScore,
      regularityDate,
      finalDate,
      academicStatus,
      isApproved: true,
    }
  }

  if (academicStatus === 'failed') {
    return {
      label: getAcademicStatusLabel(academicStatus),
      className: 'bg-red-100 text-red-800 ring-red-200',
      tone: 'red',
      finalScore,
      regularityDate,
      finalDate,
      academicStatus,
      isApproved: false,
    }
  }

  if (['completed', 'approved', 'passed'].includes(status) || (finalScore !== null && finalScore >= 6)) {
    return {
      label: 'Aprobada',
      className: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
      tone: 'emerald',
      finalScore,
      regularityDate,
      finalDate,
      academicStatus: 'approved',
      isApproved: true,
    }
  }

  if (finalScore !== null) {
    return {
      label: 'Desaprobada',
      className: 'bg-red-100 text-red-800 ring-red-200',
      tone: 'red',
      finalScore,
      regularityDate,
      finalDate,
      academicStatus: 'failed',
      isApproved: false,
    }
  }

  if (['active', 'enrolled'].includes(status)) {
    return {
      label: 'Pendiente',
      className: 'bg-white text-slate-700 ring-slate-200',
      tone: 'slate',
      finalScore,
      regularityDate: '',
      finalDate: '',
      academicStatus: 'pending',
      isApproved: false,
    }
  }

  return {
    label: 'Pendiente',
    className: 'bg-white text-slate-700 ring-slate-200',
    tone: 'slate',
    finalScore,
    regularityDate,
    finalDate,
    academicStatus,
    isApproved: false,
  }
}

function groupByYear(subjects) {
  return subjects.reduce((groups, subject) => {
    const year = Number(subject.year) || 1
    const current = groups.get(year) || []
    current.push(subject)
    groups.set(year, current)
    return groups
  }, new Map())
}

function StatCard({ label, value, helper, tone = 'slate' }) {
  const toneClass = {
    slate: 'text-slate-950',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
  }[tone]

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</div>
      {helper && <div className="mt-1 text-sm text-slate-600">{helper}</div>}
    </div>
  )
}

export default function StudentAcademicStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    currentProgram,
    subjects,
    enrollments,
    grades,
    loading,
    error,
    clearError,
  } = useStudentStore(useShallow((state) => ({
    currentProgram: state.currentProgram,
    subjects: state.subjects,
    enrollments: state.enrollments,
    grades: state.grades,
    loading: state.loading,
    error: state.error,
    clearError: state.clearError,
  })))

  const programId = getProgramId(currentProgram)
  const programName = typeof currentProgram === 'string' ? currentProgram : currentProgram?.name

  const careerSubjects = useMemo(() => {
    return subjects
      .map(normalizeSubject)
      .filter((subject) => subjectBelongsToProgram(subject, programId))
      .sort((left, right) =>
        Number(left.year || 1) - Number(right.year || 1) ||
        String(left.code || left.name).localeCompare(String(right.code || right.name)),
      )
  }, [programId, subjects])

  const rowsByYear = useMemo(() => {
    return Array.from(groupByYear(careerSubjects).entries())
      .sort(([left], [right]) => left - right)
      .map(([year, yearSubjects]) => ({
        year,
        subjects: yearSubjects.map((subject) => {
          const enrollment = getEnrollmentForSubject(enrollments, getSubjectId(subject), programId)
          return {
            subject,
            enrollment,
            status: subjectStatus(enrollment, grades),
          }
        }),
      }))
  }, [careerSubjects, enrollments, grades, programId])

  const summary = useMemo(() => {
    const subjectRows = rowsByYear.flatMap((group) => group.subjects)
    const approved = subjectRows.filter((row) => row.status.isApproved).length
    const regular = subjectRows.filter((row) => row.status.academicStatus === 'regular').length
    const totalCredits = subjectRows.reduce((total, row) => total + row.subject.credits, 0)
    const approvedCredits = subjectRows
      .filter((row) => row.status.isApproved)
      .reduce((total, row) => total + row.subject.credits, 0)

    return {
      total: subjectRows.length,
      approved,
      regular,
      pending: Math.max(subjectRows.length - approved, 0),
      progress: subjectRows.length ? Math.round((approved / subjectRows.length) * 100) : 0,
      approvedCredits,
      totalCredits,
    }
  }, [rowsByYear])

  const requestedFilter = searchParams.get('estado')
  const activeFilter = ['pending', 'approved'].includes(requestedFilter) ? requestedFilter : ''
  const filteredRowsByYear = useMemo(() => {
    if (!activeFilter) return rowsByYear

    return rowsByYear
      .map((group) => ({
        ...group,
        subjects: group.subjects.filter((row) => (
          activeFilter === 'approved' ? row.status.isApproved : !row.status.isApproved
        )),
      }))
      .filter((group) => group.subjects.length > 0)
  }, [activeFilter, rowsByYear])

  const changeFilter = (filter) => {
    const nextParams = new URLSearchParams(searchParams)
    if (filter) nextParams.set('estado', filter)
    else nextParams.delete('estado')
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <main className="student-page">
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Portal de alumno
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Estado academico
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {programName || 'Carrera actual'} organizada por ano de cursada.
          </p>
        </div>

        {error && (
          <div className="mt-6 flex items-start justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="font-semibold text-red-800">
              Cerrar
            </button>
          </div>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Progreso" value={`${summary.progress}%`} helper={`${summary.approved} de ${summary.total} aprobadas`} tone="emerald" />
          <StatCard label="Regulares" value={summary.regular} helper="Con regularidad cargada" tone="sky" />
          <StatCard label="Pendientes" value={summary.pending} helper="Todavia no aprobadas" tone="amber" />
          <StatCard label="Creditos" value={`${summary.approvedCredits}/${summary.totalCredits}`} helper="Aprobados sobre el plan" />
        </section>

        <section id="materias" className="mt-6 scroll-mt-6 space-y-5">
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">
                {activeFilter === 'approved'
                  ? 'Materias aprobadas'
                  : activeFilter === 'pending'
                    ? 'Materias pendientes'
                    : 'Todas las materias'}
              </h2>
              <p className="mt-1 text-sm text-slate-600">Filtra el plan de estudio por estado.</p>
            </div>
            <div className="flex flex-wrap gap-2" aria-label="Filtrar materias por estado">
              {[
                { value: '', label: `Todas (${summary.total})` },
                { value: 'pending', label: `Pendientes (${summary.pending})` },
                { value: 'approved', label: `Aprobadas (${summary.approved})` },
              ].map((filter) => {
                const isActive = activeFilter === filter.value
                return (
                  <button
                    key={filter.value || 'all'}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => changeFilter(filter.value)}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--student-lavender)] ${
                      isActive
                        ? 'bg-[var(--student-lavender)] text-white shadow-sm'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-[var(--student-lavender)] hover:text-[var(--student-lavender-ink)]'
                    }`}
                  >
                    {filter.label}
                  </button>
                )
              })}
            </div>
          </div>

          {loading ? (
            [1, 2, 3].map((item) => (
              <div key={item} className="h-52 animate-pulse rounded-lg bg-slate-200" />
            ))
          ) : filteredRowsByYear.length > 0 ? (
            filteredRowsByYear.map((group) => (
              <section key={group.year} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Ano {group.year}</h2>
                    <p className="text-sm text-slate-600">{group.subjects.length} materias</p>
                  </div>
                  <div className="text-sm font-semibold text-slate-700">
                    {group.subjects.filter((row) => row.status.isApproved).length} aprobadas
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left font-semibold text-slate-700">Materia</th>
                        <th className="px-5 py-3 text-left font-semibold text-slate-700">Tipo</th>
                        <th className="px-5 py-3 text-left font-semibold text-slate-700">Creditos</th>
                        <th className="px-5 py-3 text-left font-semibold text-slate-700">Fecha regularidad</th>
                        <th className="px-5 py-3 text-left font-semibold text-slate-700">Nota final</th>
                        <th className="px-5 py-3 text-left font-semibold text-slate-700">Fecha final</th>
                        <th className="px-5 py-3 text-left font-semibold text-slate-700">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {group.subjects.map(({ subject, status }) => (
                        <tr key={getSubjectId(subject)}>
                          <td className="px-5 py-4">
                            <div className="font-medium text-slate-950">{subject.name}</div>
                            <div className="mt-1 text-xs text-slate-500">{subject.code || 'Sin codigo'}</div>
                          </td>
                          <td className="px-5 py-4 text-slate-700">
                            {subject.is_mandatory ? 'Obligatoria' : 'Optativa'}
                          </td>
                          <td className="px-5 py-4 text-slate-700">{subject.credits || 0}</td>
                          <td className="px-5 py-4 text-slate-700">
                            {status.regularityDate || '-'}
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-900">
                            {status.finalScore ?? '-'}
                          </td>
                          <td className="px-5 py-4 text-slate-700">
                            {status.finalDate || '-'}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset ${status.className}`}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
              <h2 className="text-base font-semibold text-slate-950">
                {activeFilter === 'approved'
                  ? 'Todavia no hay materias aprobadas'
                  : activeFilter === 'pending'
                    ? 'No quedan materias pendientes'
                    : 'No hay materias cargadas'}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {activeFilter
                  ? 'Puedes usar los filtros para consultar el resto del plan de estudio.'
                  : 'Carga el plan de estudio de la carrera para ver el estado academico por ano.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
