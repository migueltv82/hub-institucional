import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BookOpenCheck, Clock3, Database, RefreshCw, ShieldAlert, UsersRound } from 'lucide-react'
import {
  getMyTeacherCourseRosterPreview,
  getTeacherCourseRosterPreviewForAdmin,
} from '../../services/teacherCourseRosterPreviewService.js'
import { getTeacherCourseRosterPreviewAccess } from './teacherCourseRosterPreviewAccess.js'
import TeacherProfileIdentityLinkPanel from './TeacherProfileIdentityLinkPanel.jsx'

const DAY_LABELS = ['', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']

function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    teal: 'border-teal-200 bg-teal-50 text-teal-900',
  }
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-extrabold ${tones[tone]}`}>{children}</span>
}

function AssignmentCard({ assignment }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-xs font-extrabold uppercase text-teal-700">{assignment.careerName} · {assignment.studyPlanName}</p>
          <h3 className="mt-1 text-lg font-extrabold text-slate-950">{assignment.subjectName}</h3>
          <p className="mt-1 text-sm text-slate-600">Año {assignment.yearLevel ?? '-'} · Comisión {assignment.commission || '-'} · Ciclo {assignment.academicYearLabel || '-'}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Badge tone="teal">{assignment.teacherRole}</Badge>
          <Badge>{assignment.weeklyHours} h semanales</Badge>
          <Badge>{assignment.roster.length} alumnos</Badge>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div>
          <p className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Clock3 className="h-4 w-4" />Días y horarios</p>
          {assignment.schedules.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {assignment.schedules.map((schedule, index) => (
                <li key={`${schedule.dayOfWeek}-${schedule.startTime}-${index}`} className="rounded-md bg-slate-50 px-3 py-2">
                  {DAY_LABELS[schedule.dayOfWeek] || `Día ${schedule.dayOfWeek}`} · {schedule.startTime}-{schedule.endTime}
                  <span className="block text-xs text-slate-500">{schedule.classroom || 'Aula sin definir'} · {schedule.modality}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm font-semibold text-amber-800">ASSIGNMENT_WITHOUT_SCHEDULE</p>}
        </div>

        <details>
          <summary className="cursor-pointer text-sm font-extrabold text-slate-900">Ver padrón estructurado ({assignment.roster.length})</summary>
          {assignment.roster.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Alumno</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Estado</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  {assignment.roster.map((student) => (
                    <tr key={student.courseEnrollmentId}><td className="px-3 py-2 font-semibold text-slate-950">{student.studentDisplayName}</td><td className="px-3 py-2 text-slate-700">{student.courseEnrollmentType}</td><td className="px-3 py-2 text-slate-700">{student.courseEnrollmentStatus}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-3 text-sm text-slate-600">EMPTY_STRUCTURED_ROSTER. No se agregaron alumnos por carrera o año.</p>}
        </details>
      </div>
    </article>
  )
}

export default function TeacherCourseRosterInternalPreview({
  mode = 'teacher',
  institutionId,
  user,
  detectedRole,
  isSuperAdmin = false,
  hasAuthenticatedSession = true,
  env = import.meta.env,
  loadMyPreview = getMyTeacherCourseRosterPreview,
  loadAdminPreview = getTeacherCourseRosterPreviewForAdmin,
  identityPanelProps = {},
}) {
  const access = getTeacherCourseRosterPreviewAccess({
    env,
    mode,
    detectedRole,
    isSuperAdmin,
    institutionId,
    userId: user?.id,
    hasAuthenticatedSession,
  })
  const [state, setState] = useState('LOADING')
  const [model, setModel] = useState(null)
  const [error, setError] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState(null)

  const load = useCallback(async (teacherId = selectedTeacherId) => {
    if (!access.allowed) return
    setState('LOADING')
    setError('')
    try {
      const nextModel = mode === 'admin'
        ? await loadAdminPreview({ institutionId, teacherId })
        : await loadMyPreview({ institutionId })
      setModel(nextModel)
      setSelectedTeacherId(nextModel.teacher?.teacherId ?? teacherId ?? null)
      setState(nextModel.status)
    } catch (loadError) {
      setError(loadError?.message || 'No se pudo cargar el preview docente.')
      setState('ERROR')
    }
  }, [access.allowed, institutionId, loadAdminPreview, loadMyPreview, mode, selectedTeacherId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(null), 0)
    return () => window.clearTimeout(timer)
  }, [access.allowed, institutionId, loadAdminPreview, loadMyPreview, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const warningCodes = useMemo(() => model?.warnings?.map((warning) => `${warning.code} (${warning.count})`) ?? [], [model])

  if (!access.enabled) return null
  if (!access.allowed) {
    return (
      <section className="work-surface p-5" data-testid="teacher-course-roster-preview-blocked">
        <div className="flex items-start gap-3 text-amber-900"><ShieldAlert className="mt-0.5 h-5 w-5" /><div><h2 className="font-extrabold">Preview docente bloqueado</h2><p className="mt-1 text-sm">{access.reasons.join(' · ')}</p></div></div>
      </section>
    )
  }

  return (
    <section className="work-surface space-y-6 p-4 md:p-6" data-testid="teacher-course-roster-preview">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2"><Badge tone="amber">DEV</Badge><Badge>PREVIEW INTERNA</Badge><Badge tone="red">NO OFICIAL</Badge></div>
            <h2 className="mt-3 text-2xl font-extrabold text-slate-950">Materias y padrones estructurados</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Lectura estricta desde asignaciones, ofertas e inscripciones relacionales. El fallback por carrera y año no integra este padrón.</p>
          </div>
          <div className="flex items-center gap-2"><Badge tone={state === 'ERROR' || state === 'BLOCKED' ? 'red' : state === 'PARTIAL' ? 'amber' : 'teal'}>{state}</Badge><button className="btn-secondary" onClick={() => load()} type="button"><RefreshCw className="h-4 w-4" />Actualizar</button></div>
        </div>
      </header>

      {mode === 'admin' && model?.teacherOptions?.length > 0 && (
        <label className="block max-w-xl text-sm font-bold text-slate-700">Docente a consultar
          <select className="input-base mt-2" value={selectedTeacherId ?? ''} onChange={(event) => load(event.target.value)}>
            <option value="">Seleccionar docente</option>
            {model.teacherOptions.map((teacher) => <option key={teacher.teacherId} value={teacher.teacherId}>{teacher.displayName} · {teacher.activeAssignmentsCount} asignaciones</option>)}
          </select>
        </label>
      )}

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"><strong>Error:</strong> {error}</div>}
      {state === 'LOADING' && !model && <div className="flex items-center gap-3 py-10 text-slate-600"><RefreshCw className="h-5 w-5 animate-spin" />Cargando padrón relacional...</div>}

      {model && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-white p-4"><BookOpenCheck className="h-5 w-5 text-teal-700" /><p className="mt-2 text-2xl font-extrabold text-slate-950">{model.totals.activeOfferingsCount}</p><p className="text-xs font-bold uppercase text-slate-500">Materias activas</p></div>
            <div className="rounded-md border border-slate-200 bg-white p-4"><UsersRound className="h-5 w-5 text-teal-700" /><p className="mt-2 text-2xl font-extrabold text-slate-950">{model.totals.enrolledStudentsCount}</p><p className="text-xs font-bold uppercase text-slate-500">Inscripciones visibles</p></div>
            <div className="rounded-md border border-slate-200 bg-white p-4"><Clock3 className="h-5 w-5 text-teal-700" /><p className="mt-2 text-2xl font-extrabold text-slate-950">{model.totals.assignmentsWithoutScheduleCount}</p><p className="text-xs font-bold uppercase text-slate-500">Sin horario</p></div>
            <div className="rounded-md border border-slate-200 bg-white p-4"><Database className="h-5 w-5 text-teal-700" /><p className="mt-2 text-2xl font-extrabold text-slate-950">{model.totals.structuredRosterCoveragePercent}%</p><p className="text-xs font-bold uppercase text-slate-500">Cobertura estructurada</p></div>
          </section>

          {warningCodes.length > 0 && <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="flex items-center gap-2 font-extrabold"><AlertTriangle className="h-5 w-5" />Advertencias de integridad</p><p className="mt-2">{warningCodes.join(' · ')}</p></div>}

          {model.assignments.length > 0 ? <div className="space-y-4">{model.assignments.map((assignment) => <AssignmentCard key={assignment.teachingAssignmentId} assignment={assignment} />)}</div> : <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">No hay asignaciones estructuradas activas para mostrar.</div>}

          {mode === 'admin' && (
            <>
              <TeacherProfileIdentityLinkPanel {...identityPanelProps} institutionId={institutionId} onLinked={(profileId) => load(profileId)} />
              <section className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <h3 className="font-extrabold text-slate-950">Comparación legacy diagnóstica</h3>
                <p className="mt-1">Cantidad estructurada: {model.totals.enrolledStudentsCount}. Estimación legacy: {model.diagnostics.legacyEstimatedStudentsCount}. Diferencia: {model.diagnostics.legacyStructuredDifference}. Legacy utilizado: no.</p>
              </section>
            </>
          )}

          <footer className="flex items-center gap-2 border-t border-slate-200 pt-4 text-xs font-semibold text-slate-500"><Database className="h-4 w-4" />RPC autenticada, tenant validado y datos personales minimizados. Sin snapshot ni escrituras.</footer>
        </>
      )}
    </section>
  )
}
