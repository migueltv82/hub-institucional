import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getAcademicStatusLabel, normalizeAcademicStatus } from '../lib/examEligibility.js'
import { getEnrollmentGrades } from '../lib/gradeMatching.js'
import { useStudentStore } from '../stores/studentStore'

function normalizeStatus(status) {
  return String(status || '').toLowerCase()
}

function isCurrentOrCompletedEnrollment(enrollment) {
  return !['dropped', 'cancelled', 'canceled', 'baja', 'abandonada'].includes(normalizeStatus(enrollment?.status))
}

function getSubjectName(enrollment) {
  return enrollment?.subject?.name || enrollment?.subject_name || 'Materia sin nombre'
}

function getSubjectCode(enrollment) {
  return enrollment?.subject?.code || enrollment?.subject_code || ''
}

function getGradeScore(grade) {
  const score = Number(grade?.score ?? grade?.grade_value ?? grade?.final_grade ?? grade?.partial_grade)
  return Number.isFinite(score) ? score : null
}

function getGradeType(grade) {
  return normalizeStatus(grade?.grade_type || grade?.type)
}

function getGradeAttemptNumber(grade) {
  const attemptNumber = Number(grade?.attempt_number ?? grade?.attemptNumber ?? grade?.attempt)
  return Number.isFinite(attemptNumber) ? attemptNumber : 1
}

function sortGradesByAttempt(left, right) {
  return getGradeAttemptNumber(left) - getGradeAttemptNumber(right)
}

function getAcademicStatus({ grade, enrollment }) {
  return normalizeAcademicStatus(
    grade?.academic_status ||
    grade?.condition ||
    grade?.condicion ||
    enrollment?.academic_status ||
    enrollment?.condition ||
    enrollment?.condicion,
  )
}

function gradeClass(score) {
  if (score === null) return 'text-slate-500'
  if (score >= 8) return 'text-emerald-700'
  if (score >= 6) return 'text-sky-700'
  return 'text-red-700'
}

export default function StudentGradesPage() {
  const { enrollments, grades, loading, error, clearError } = useStudentStore(useShallow(state => ({
    enrollments: state.enrollments,
    grades: state.grades,
    loading: state.loading,
    error: state.error,
    clearError: state.clearError
  })))

  const rows = useMemo(() => {
    return enrollments.filter(isCurrentOrCompletedEnrollment).map(enrollment => {
      const enrollmentGrades = getEnrollmentGrades(enrollment, grades)
      const partials = enrollmentGrades
        .filter(grade => getGradeType(grade) === 'partial')
        .sort(sortGradesByAttempt)
      const finalGrade = enrollmentGrades.find(grade => getGradeType(grade) === 'final')
      const finalScore = getGradeScore(finalGrade)
      const academicStatus = getAcademicStatus({ grade: finalGrade, enrollment })
      const hasExplicitStatus = academicStatus !== 'pending'

      return {
        enrollment,
        partials,
        finalScore,
        status: hasExplicitStatus
          ? getAcademicStatusLabel(academicStatus)
          : finalScore === null ? 'Sin final' : finalScore >= 6 ? 'Aprobada' : 'Desaprobada'
      }
    })
  }, [enrollments, grades])

  const average = useMemo(() => {
    const finalScores = rows
      .map(row => row.finalScore)
      .filter(score => score !== null)

    if (finalScores.length === 0) return 0

    return finalScores.reduce((total, score) => total + score, 0) / finalScores.length
  }, [rows])

  return (
    <main className="student-page">
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Portal de alumno
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Calificaciones
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Consulta parciales, finales y estado de cada materia.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Promedio final
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">
              {average.toFixed(1)}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 flex items-start justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="font-semibold text-red-800">
              Cerrar
            </button>
          </div>
        )}

        <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Materia</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Parciales</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Final</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-slate-600">
                      Cargando calificaciones...
                    </td>
                  </tr>
                ) : rows.length > 0 ? (
                  rows.map(({ enrollment, partials, finalScore, status }) => (
                    <tr key={enrollment.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-950">{getSubjectName(enrollment)}</div>
                        {getSubjectCode(enrollment) && (
                          <div className="text-xs text-slate-500">{getSubjectCode(enrollment)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {partials.length > 0
                          ? partials.map(grade => getGradeScore(grade) ?? '-').join(' / ')
                          : '-'}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${gradeClass(finalScore)}`}>
                        {finalScore ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{status}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="px-4 py-8 text-center text-slate-600">
                      No hay calificaciones cargadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

