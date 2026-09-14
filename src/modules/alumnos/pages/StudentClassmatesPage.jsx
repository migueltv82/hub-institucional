import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { UsersRound } from 'lucide-react'
import { useStudentStore } from '../stores/studentStore.js'
import { buildStudentClassmateGroups } from '../services/studentClassmates.js'

function clean(value) {
  return String(value ?? '').trim()
}

function getSubjectName(subject) {
  return clean(subject?.name || subject?.nombreMateria || subject?.subject_name || subject?.code || subject?.subject_id) || 'Materia sin nombre'
}

function getSubjectCode(subject) {
  return clean(subject?.code || subject?.codigo || subject?.subject_id || subject?.canonical_subject_id)
}

export default function StudentClassmatesPage() {
  const outletContext = useOutletContext() ?? {}
  const data = outletContext.data ?? {}
  const {
    currentStudent,
    subjects,
    enrollments,
    loading,
    error,
    clearError,
  } = useStudentStore(useShallow(state => ({
    currentStudent: state.currentStudent,
    subjects: state.subjects,
    enrollments: state.enrollments,
    loading: state.loading,
    error: state.error,
    clearError: state.clearError,
  })))

  const groups = useMemo(() => buildStudentClassmateGroups({
    currentStudent,
    subjects,
    enrollments,
    workspaceSnapshot: data.workspaceSnapshot ?? {},
  }), [currentStudent, data.workspaceSnapshot, enrollments, subjects])

  const totalClassmates = groups.reduce((total, group) => total + group.classmates.length, 0)

  return (
    <main className="student-page">
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Portal de alumno
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Compañeros
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Consulta quiénes cursan con vos en cada materia donde tenés inscripción activa.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Compañeros visibles
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">
              {totalClassmates}
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

        {loading ? (
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            Cargando compañeros...
          </section>
        ) : groups.length > 0 ? (
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {groups.map((group) => {
              const subjectName = getSubjectName(group.subject)
              const subjectCode = getSubjectCode(group.subject)

              return (
                <article key={`${subjectCode}-${subjectName}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Materia
                      </p>
                      <h2 className="mt-1 text-lg font-extrabold text-slate-950">{subjectName}</h2>
                      {subjectCode && <p className="mt-1 text-xs font-semibold text-slate-500">{subjectCode}</p>}
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      <UsersRound className="h-4 w-4" />
                      {group.classmates.length}
                    </span>
                  </div>

                  {group.classmates.length > 0 ? (
                    <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
                      {group.classmates.map((classmate) => (
                        <li key={classmate.id || classmate.full_name} className="flex items-center gap-3 px-3 py-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--student-lavender-soft)] text-sm font-extrabold text-slate-800">
                            {clean(classmate.full_name).slice(0, 2).toUpperCase() || 'AL'}
                          </span>
                          <span className="font-semibold text-slate-800">{classmate.full_name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                      Todavía no hay otros compañeros activos en esta materia.
                    </p>
                  )}
                </article>
              )
            })}
          </section>
        ) : (
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <UsersRound className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-950">No hay materias activas para consultar</h2>
            <p className="mt-2 text-sm text-slate-600">
              Cuando te inscribas a una materia, acá vas a ver el grupo de compañeros que cursan con vos.
            </p>
          </section>
        )}
      </div>
    </main>
  )
}
