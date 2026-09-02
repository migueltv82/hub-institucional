import { BookOpenCheck, CalendarDays, ClipboardList, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyBlock, Section } from '../TeacherPortalModule.jsx'

const EMPTY_ARRAY = []

function buildSubjectKeyParam(subjectId, programId) {
  return `${encodeURIComponent(subjectId)}__${encodeURIComponent(programId)}`
}

function subjectDetailPath(subject, tab = '') {
  const basePath = `/app/materias/${buildSubjectKeyParam(subject.subjectId, subject.programId)}`
  return tab ? `${basePath}?tab=${tab}` : basePath
}

function formatSchedule(schedule) {
  return `${schedule.dia || 'Dia'} ${schedule.inicio || ''}${schedule.fin ? `-${schedule.fin}` : ''}`.trim()
}

function getSubjectStudentCount(subject) {
  if (Number.isFinite(Number(subject.studentCount))) return Number(subject.studentCount)
  return Array.isArray(subject.students) ? subject.students.length : 0
}

export function SubjectCards({ subjects = EMPTY_ARRAY, limit = null }) {
  const visibleSubjects = Number.isFinite(limit) ? subjects.slice(0, limit) : subjects

  return (
    <div className="teacher-subject-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visibleSubjects.map((subject) => {
        const schedules = subject.schedules ?? EMPTY_ARRAY
        const studentCount = getSubjectStudentCount(subject)
        const isOnLeave = subject.role === 'licencia'
        const isReplacement = subject.assignmentSource === 'teacher_leave_replacement'

        return (
          <article
            key={subject.id ?? `${subject.subjectId}-${subject.programId}`}
            className={`teacher-subject-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-300 hover:shadow-md ${isOnLeave ? 'teacher-subject-card--leave' : ''} ${isReplacement ? 'teacher-subject-card--replacement' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">{subject.carrera || 'Carrera'}</p>
                <Link
                  to={subjectDetailPath(subject)}
                  className="mt-2 block text-lg font-extrabold text-slate-950 hover:text-teal-800"
                >
                  {subject.nombre || subject.subjectId}
                </Link>
                <p className="mt-1 text-sm text-slate-600">
                  {subject.subjectId ? `Codigo ${subject.subjectId}` : 'Sin codigo'}
                  {subject.anio ? ` | Anio ${subject.anio}` : ''}
                </p>
                {isOnLeave && (
                  <p className="teacher-assignment-notice teacher-assignment-notice--leave mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900">
                    Estas de licencia en esta materia. Te reemplaza {subject.leave?.replacement_teacher_name || 'el docente designado'}
                    {subject.leave?.leave_ends_on ? ` hasta ${subject.leave.leave_ends_on}` : ''}.
                  </p>
                )}
                {isReplacement && (
                  <p className="teacher-assignment-notice teacher-assignment-notice--replacement mt-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-900">
                    Reemplazas a {subject.leave?.teacher_on_leave_name || 'docente de licencia'}
                    {subject.leave?.leave_ends_on ? ` hasta ${subject.leave.leave_ends_on}` : ''}.
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-800 ring-1 ring-emerald-200">
                {studentCount} alumnos
              </span>
            </div>

            <div className="teacher-subject-schedule mt-4 min-h-16 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              {schedules.length > 0 ? (
                <ul className="space-y-1">
                  {schedules.slice(0, 3).map((schedule, index) => (
                    <li key={`${schedule.id ?? subject.id}-${schedule.dia}-${schedule.inicio}-${index}`} className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-teal-700" />
                      <span>{formatSchedule(schedule)}{schedule.aula ? ` | ${schedule.aula}` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-semibold text-amber-800">Sin horarios cargados</p>
              )}
            </div>

            {!isOnLeave && <div className="mt-4 flex flex-wrap gap-2">
              <Link className="btn-secondary" to={subjectDetailPath(subject)}>
                <UsersRound className="h-4 w-4" />
                Alumnos
              </Link>
              <Link className="btn-secondary" to={subjectDetailPath(subject, 'asistencia')}>
                <CalendarDays className="h-4 w-4" />
                Asistencia
              </Link>
              <Link className="btn-primary" to={subjectDetailPath(subject, 'notas')}>
                <ClipboardList className="h-4 w-4" />
                Notas
              </Link>
            </div>}
          </article>
        )
      })}
    </div>
  )
}

export default function SubjectsView({ subjects = EMPTY_ARRAY, isLoading = false }) {
  return (
    <Section title="Mis materias" icon={BookOpenCheck}>
      {isLoading ? (
        <EmptyBlock>Cargando materias asignadas...</EmptyBlock>
      ) : subjects.length > 0 ? (
        <SubjectCards subjects={subjects} />
      ) : (
        <EmptyBlock>Todavia no tenes materias asignadas. Consulta con la institucion para que te asocien a una materia.</EmptyBlock>
      )}
    </Section>
  )
}
