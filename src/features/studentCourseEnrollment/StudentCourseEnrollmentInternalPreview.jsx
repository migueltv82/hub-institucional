import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookOpenCheck,
  ClipboardCheck,
  Database,
  RefreshCw,
  ShieldAlert,
  UserRoundCheck,
} from 'lucide-react'
import {
  enrollFirstYearStudent,
  enrollStudentInCourseOffering,
} from '../../services/academicEnrollmentCommands.js'
import { fetchStudentCourseEnrollmentPreview } from './studentCourseEnrollmentPreviewService.js'
import {
  getEnrollmentRejectionMessage,
  getOfferingDetails,
  STUDENT_COURSE_PREVIEW_STATE,
} from './studentCourseEnrollmentPreviewModel.js'
import { getStudentCourseEnrollmentPreviewAccess } from './studentCourseEnrollmentPreviewAccess.js'
import StudentCareerLinkAdminPanel from './StudentCareerLinkAdminPanel.jsx'

const DAY_NAMES = Object.freeze({
  1: 'Lunes',
  2: 'Martes',
  3: 'Miercoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sabado',
  7: 'Domingo',
})

function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value))
}

function StatusBadge({ children, tone = 'slate' }) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    sky: 'border-sky-200 bg-sky-50 text-sky-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-800',
  }
  return <span className={`status-chip ${tones[tone] ?? tones.slate}`}>{children}</span>
}

function RejectionList({ rejections = [] }) {
  if (!rejections.length) return null
  return (
    <div className="mt-3 space-y-2">
      {rejections.map((rejection, index) => {
        const detail = getEnrollmentRejectionMessage(rejection?.code)
        return (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" key={`${detail.code}-${index}`}>
            <p className="font-extrabold">{detail.message}</p>
            <p className="mt-1">Codigo: <code>{detail.code}</code></p>
            <p className="mt-1 text-amber-800">Accion: {detail.action}</p>
          </div>
        )
      })}
    </div>
  )
}

function ResultPanel({ operation }) {
  if (!operation?.result && !operation?.error) return null
  const data = operation.result?.data ?? operation.result ?? null
  const rejections = Array.isArray(data?.rejections) ? data.rejections : []
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>Resultado de la solicitud</strong>
        <code className="text-xs">{operation.requestId}</code>
      </div>
      {operation.error ? (
        <p className="mt-2 text-red-700">{operation.error}</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <span>Creadas: <strong>{data?.created_count ?? (data?.status === 'COMPLETED' ? 1 : 0)}</strong></span>
          <span>Existentes: <strong>{data?.existing_count ?? (data?.status === 'ALREADY_EXISTED' ? 1 : 0)}</strong></span>
          <span>Rechazadas: <strong>{data?.rejected_count ?? rejections.length}</strong></span>
        </div>
      )}
      <RejectionList rejections={rejections} />
    </div>
  )
}

function DiagnosticSection({ model, mode }) {
  const relation = model.selectedRelation
  const diagnostics = model.diagnostics
  const diagnosticTone = diagnostics.status === 'READY'
    ? 'emerald'
    : diagnostics.status === 'AMBIGUOUS' ? 'red' : 'amber'
  const legacyRows = model.legacyDiagnostic?.rows ?? []

  return (
    <section className="space-y-4" aria-labelledby="course-preview-diagnostic-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="soft-title">Diagnostico previo</p>
          <h3 className="mt-1 text-xl font-extrabold text-slate-950" id="course-preview-diagnostic-title">
            Estado de datos academicos
          </h3>
        </div>
        <StatusBadge tone={diagnosticTone}>{diagnostics.status}</StatusBadge>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Alumno identificado', relation?.student_display_name || (relation ? 'Si' : 'No')],
          ['Institucion', model.institution?.name || 'Sin institucion'],
          ['Carrera', relation?.career_name || 'Sin carrera'],
          ['Plan de estudios', relation?.study_plan_name || 'Sin plan'],
          ['Ano de ingreso', relation?.entry_year || 'Sin dato'],
          ['Ingresante de primer ano', relation?.is_first_year_entrant ? 'Si' : 'No'],
          ['Vinculo activo', diagnostics.activeRelation ? 'Si' : 'No'],
          ['Ofertas abiertas', diagnostics.availableOfferings],
          ['Inscripciones existentes', diagnostics.existingEnrollments],
        ].map(([label, value]) => (
          <div className="status-tile" key={label}>
            <dt className="text-xs font-bold uppercase text-slate-500">{label}</dt>
            <dd className="mt-1 text-sm font-extrabold text-slate-950">{String(value)}</dd>
          </div>
        ))}
      </dl>

      {!relation && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-extrabold">No existe un vinculo carrera-plan seleccionable.</p>
          <p className="mt-1">
            {mode === 'admin'
              ? 'Administracion puede preparar un alta explicita mediante la RPC auditada disponible mas abajo.'
              : 'Solicita a Administracion que revise y vincule tu identidad academica.'}
          </p>
        </div>
      )}

      {legacyRows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
              <tr><th className="px-3 py-2">Registro</th><th className="px-3 py-2">Diagnostico legacy</th><th className="px-3 py-2">Coincidencias</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {legacyRows.map((row) => (
                <tr key={row.legacyStudentRecordId ?? JSON.stringify(row.matchCounts)}>
                  <td className="px-3 py-2 font-mono text-xs">{row.legacyStudentRecordId ?? 'Sin ID'}</td>
                  <td className="px-3 py-2 font-bold">{row.status}</td>
                  <td className="px-3 py-2">A:{row.matchCounts.students} C:{row.matchCounts.careers} P:{row.matchCounts.studyPlans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function OfferingsSection({ model, operations, onEnroll }) {
  return (
    <section className="space-y-3" aria-labelledby="course-preview-offerings-title">
      <div>
        <p className="soft-title">Oferta academica</p>
        <h3 className="mt-1 text-xl font-extrabold text-slate-950" id="course-preview-offerings-title">Materias disponibles</h3>
      </div>
      {model.offerings.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-5 text-sm text-slate-600">No hay ofertas para la carrera y el plan seleccionados.</p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {model.offerings.map((offering) => {
            const detail = getOfferingDetails(model, offering.id)
            const operation = operations[offering.id]
            const isProcessing = operation?.state === STUDENT_COURSE_PREVIEW_STATE.PROCESSING
            const isOpen = offering.status === 'OPEN_FOR_ENROLLMENT'
            return (
              <article className="rounded-md border border-slate-200 bg-white p-4" key={offering.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">{offering.subject_code} · {offering.year_level} ano</p>
                    <h4 className="mt-1 text-base font-extrabold text-slate-950">{offering.subject_name}</h4>
                    <p className="mt-1 text-sm text-slate-600">Comision {offering.commission_code} · {offering.delivery_mode} · Ciclo {offering.academic_year_number}</p>
                  </div>
                  <StatusBadge tone={isOpen ? 'emerald' : 'amber'}>{offering.status}</StatusBadge>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-700">
                  <p>Inscripcion: {formatDate(offering.enrollment_opens_at)} a {formatDate(offering.enrollment_closes_at)}</p>
                  {detail.schedules.map((schedule) => (
                    <p key={schedule.id}>{DAY_NAMES[schedule.day_of_week] ?? `Dia ${schedule.day_of_week}`} {schedule.start_time}-{schedule.end_time} {schedule.location ? `· ${schedule.location}` : ''}</p>
                  ))}
                  {detail.teachers.map((teacher) => (
                    <p key={teacher.id}>Docente: {teacher.teacher_display_name || 'Sin nombre'} · {teacher.role}</p>
                  ))}
                  {detail.prerequisites.map((prerequisite) => (
                    <p className="text-amber-800" key={prerequisite.id}>Correlativa: {prerequisite.prerequisite_subject_name} ({prerequisite.minimum_status})</p>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {detail.enrollment ? (
                    <StatusBadge tone="sky">Inscripto · {detail.enrollment.status}</StatusBadge>
                  ) : (
                    <button
                      className="btn-primary"
                      disabled={!isOpen || isProcessing || !model.diagnostics.activeRelation}
                      onClick={() => onEnroll(offering.id)}
                      type="button"
                    >
                      {isProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
                      Inscribirme
                    </button>
                  )}
                </div>
                <ResultPanel operation={operation} />
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function EnrollmentsSection({ model }) {
  return (
    <section className="space-y-3" aria-labelledby="course-preview-enrollments-title">
      <div>
        <p className="soft-title">Padron de cursada</p>
        <h3 className="mt-1 text-xl font-extrabold text-slate-950" id="course-preview-enrollments-title">Inscripciones registradas</h3>
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-600">
            <tr><th className="px-3 py-2">Materia</th><th className="px-3 py-2">Carrera / plan</th><th className="px-3 py-2">Ciclo / comision</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Referencia</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {model.enrollments.map((enrollment) => (
              <tr key={enrollment.id}>
                <td className="px-3 py-2 font-bold">{enrollment.subject_name}</td>
                <td className="px-3 py-2">{enrollment.career_name} / {enrollment.study_plan_name}</td>
                <td className="px-3 py-2">{enrollment.academic_year_number} / {enrollment.commission_code}</td>
                <td className="px-3 py-2">{enrollment.enrollment_type}</td>
                <td className="px-3 py-2">{enrollment.status}</td>
                <td className="px-3 py-2 font-mono text-xs">{enrollment.client_mutation_id || enrollment.id}</td>
              </tr>
            ))}
            {model.enrollments.length === 0 && <tr><td className="px-3 py-6 text-center text-slate-500" colSpan="6">Sin inscripciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AdminReviewSection({ model }) {
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(model.enrollments[0]?.id ?? '')
  const enrollment = model.enrollments.find((item) => item.id === selectedEnrollmentId) ?? null
  const command = model.commandRequests.find((item) => (
    item?.result_payload?.course_enrollment_id === selectedEnrollmentId
    || item?.result_payload?.created_enrollment_ids?.includes?.(selectedEnrollmentId)
  )) ?? null
  const events = model.auditEvents.filter((item) => item.aggregate_id === selectedEnrollmentId)
  const metrics = model.metrics

  return (
    <section className="space-y-4" aria-labelledby="course-preview-admin-title">
      <div>
        <p className="soft-title">Control institucional</p>
        <h3 className="mt-1 text-xl font-extrabold text-slate-950" id="course-preview-admin-title">Resultados y auditoria</h3>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Alumnos vinculados', metrics.relations ?? 0],
          ['Vinculos incompletos', metrics.incompleteRelations ?? 0],
          ['Ofertas', metrics.offerings ?? 0],
          ['Inscripciones', metrics.enrollments ?? 0],
          ['Automaticas', metrics.automaticEnrollments ?? 0],
          ['Seleccionadas', metrics.selectedEnrollments ?? 0],
          ['Duplicados evitados', metrics.duplicateRequestsAvoided ?? 0],
          ['Eventos de auditoria', metrics.auditEvents ?? 0],
        ].map(([label, value]) => (
          <div className="status-tile" key={label}><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-2xl font-extrabold text-slate-950">{value}</dd></div>
        ))}
      </dl>

      {Object.keys(model.rejectionCounts).length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
          <strong>Rechazos por codigo</strong>
          <div className="mt-2 flex flex-wrap gap-2">{Object.entries(model.rejectionCounts).map(([code, count]) => <StatusBadge key={code} tone="amber">{code}: {count}</StatusBadge>)}</div>
        </div>
      )}

      <div className="rounded-md border border-slate-200 p-4">
        <label className="block text-sm font-bold text-slate-700">
          Inscripcion para auditar
          <select className="input-base mt-2" onChange={(event) => setSelectedEnrollmentId(event.target.value)} value={selectedEnrollmentId}>
            <option value="">Seleccionar</option>
            {model.enrollments.map((item) => <option key={item.id} value={item.id}>{item.subject_name} · {item.id}</option>)}
          </select>
        </label>
        {enrollment && (
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <p><strong>Alumno:</strong> {enrollment.student_id}</p>
            <p><strong>Oferta:</strong> {enrollment.course_offering_id}</p>
            <p><strong>Request ID:</strong> {command?.request_id ?? enrollment.client_mutation_id ?? 'Sin referencia'}</p>
            <p><strong>Actor:</strong> {command?.actor_id ?? 'Sin command asociado'}</p>
            <p><strong>Command:</strong> {command?.status ?? 'No encontrado'}</p>
            <p><strong>Eventos:</strong> {events.length}</p>
            {events.map((event) => (
              <div className="rounded-md bg-slate-50 p-3 md:col-span-2" key={event.id}>
                <p><strong>{event.event_type}</strong> · secuencia {event.sequence_number} · {formatDate(event.occurred_at)}</p>
                <p className="mt-1 break-all font-mono text-xs">hash: {event.event_hash}</p>
                <p className="mt-1 break-all font-mono text-xs">previous_hash: {event.previous_hash || 'GENESIS'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default function StudentCourseEnrollmentInternalPreview({
  mode = 'student',
  institutionId,
  user,
  detectedRole,
  isSuperAdmin = false,
  hasAuthenticatedSession = true,
  legacyInputs,
  env = import.meta.env,
  loadPreview = fetchStudentCourseEnrollmentPreview,
  enrollFirstYear = enrollFirstYearStudent,
  enrollIndividual = enrollStudentInCourseOffering,
  requestIdFactory = createRequestId,
}) {
  const access = getStudentCourseEnrollmentPreviewAccess({
    env,
    mode,
    detectedRole,
    isSuperAdmin,
    institutionId,
    userId: user?.id,
    hasAuthenticatedSession,
  })
  const [state, setState] = useState(STUDENT_COURSE_PREVIEW_STATE.LOADING)
  const [model, setModel] = useState(null)
  const [error, setError] = useState('')
  const [selectedRelationId, setSelectedRelationId] = useState(null)
  const [firstYearOperation, setFirstYearOperation] = useState(null)
  const [individualOperations, setIndividualOperations] = useState({})
  const firstYearRequestId = useRef(null)
  const individualRequestIds = useRef(new Map())
  const processingKeys = useRef(new Set())

  const load = useCallback(async (relationId = selectedRelationId) => {
    if (!access.allowed) return
    setState(STUDENT_COURSE_PREVIEW_STATE.LOADING)
    setError('')
    try {
      const nextModel = await loadPreview({
        institutionId,
        studentCareerEnrollmentId: relationId,
        legacyInputs,
      })
      setModel(nextModel)
      setSelectedRelationId(nextModel.selectedRelation?.id ?? null)
      setState(nextModel.diagnostics.status === 'READY'
        ? STUDENT_COURSE_PREVIEW_STATE.READY
        : STUDENT_COURSE_PREVIEW_STATE.BLOCKED)
    } catch (loadError) {
      setError(loadError?.message || 'No se pudo cargar el preview.')
      setState(STUDENT_COURSE_PREVIEW_STATE.ERROR)
    }
  }, [access.allowed, institutionId, legacyInputs, loadPreview, selectedRelationId])

  useEffect(() => {
    void load(null)
  }, [access.allowed, institutionId, loadPreview]) // eslint-disable-line react-hooks/exhaustive-deps

  const executeFirstYear = useCallback(async () => {
    if (!model?.selectedRelation || processingKeys.current.has('first-year')) return
    processingKeys.current.add('first-year')
    const requestId = firstYearRequestId.current ?? requestIdFactory()
    firstYearRequestId.current = requestId
    setState(STUDENT_COURSE_PREVIEW_STATE.PROCESSING)
    setFirstYearOperation({ state: STUDENT_COURSE_PREVIEW_STATE.PROCESSING, requestId })
    try {
      const result = await enrollFirstYear({
        studentCareerEnrollmentId: model.selectedRelation.id,
        academicYearId: model.selectedRelation.current_academic_year_id ?? model.selectedRelation.admission_academic_year_id,
        requestId,
      })
      const rejections = result?.data?.rejections ?? []
      const nextState = result?.ok && rejections.length === 0
        ? STUDENT_COURSE_PREVIEW_STATE.COMPLETED
        : result?.ok ? STUDENT_COURSE_PREVIEW_STATE.PARTIAL_RESULT : STUDENT_COURSE_PREVIEW_STATE.ERROR
      setFirstYearOperation({ state: nextState, requestId, result, error: result?.error?.message ?? null })
      setState(nextState)
      if (result?.ok) await load(model.selectedRelation.id)
    } catch (operationError) {
      setFirstYearOperation({ state: STUDENT_COURSE_PREVIEW_STATE.ERROR, requestId, error: operationError?.message || 'Solicitud interrumpida.' })
      setState(STUDENT_COURSE_PREVIEW_STATE.ERROR)
    } finally {
      processingKeys.current.delete('first-year')
    }
  }, [enrollFirstYear, load, model, requestIdFactory])

  const executeIndividual = useCallback(async (offeringId) => {
    const key = `offering:${offeringId}`
    if (!model?.selectedRelation || processingKeys.current.has(key)) return
    processingKeys.current.add(key)
    const requestId = individualRequestIds.current.get(offeringId) ?? requestIdFactory()
    individualRequestIds.current.set(offeringId, requestId)
    setIndividualOperations((current) => ({ ...current, [offeringId]: { state: STUDENT_COURSE_PREVIEW_STATE.PROCESSING, requestId } }))
    try {
      const result = await enrollIndividual({
        studentCareerEnrollmentId: model.selectedRelation.id,
        courseOfferingId: offeringId,
        requestId,
      })
      const rejections = result?.data?.rejections ?? []
      const nextState = result?.ok && rejections.length === 0
        ? STUDENT_COURSE_PREVIEW_STATE.COMPLETED
        : result?.ok ? STUDENT_COURSE_PREVIEW_STATE.PARTIAL_RESULT : STUDENT_COURSE_PREVIEW_STATE.ERROR
      setIndividualOperations((current) => ({
        ...current,
        [offeringId]: { state: nextState, requestId, result, error: result?.error?.message ?? null },
      }))
      if (result?.ok) await load(model.selectedRelation.id)
    } catch (operationError) {
      setIndividualOperations((current) => ({
        ...current,
        [offeringId]: { state: STUDENT_COURSE_PREVIEW_STATE.ERROR, requestId, error: operationError?.message || 'Solicitud interrumpida.' },
      }))
    } finally {
      processingKeys.current.delete(key)
    }
  }, [enrollIndividual, load, model, requestIdFactory])

  const firstYearEligible = useMemo(() => Boolean(
    model?.diagnostics.activeRelation
    && model?.diagnostics.firstYearEntrant
    && model?.diagnostics.firstYearOpenOfferings > 0,
  ), [model])

  if (!access.enabled) return null
  if (!access.allowed) {
    return (
      <section className="work-surface p-5">
        <div className="flex items-start gap-3 text-amber-900"><ShieldAlert className="mt-0.5 h-5 w-5" /><div><h2 className="font-extrabold">Preview de inscripcion bloqueado</h2><p className="mt-1 text-sm">{access.reasons.join(' · ')}</p></div></div>
      </section>
    )
  }

  return (
    <section className="work-surface space-y-7 p-4 md:p-6" data-testid="student-course-enrollment-preview">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2"><StatusBadge tone="amber">DEV</StatusBadge><StatusBadge tone="sky">PREVIEW INTERNA</StatusBadge><StatusBadge tone="red">NO OFICIAL</StatusBadge></div>
            <h2 className="mt-3 text-2xl font-extrabold text-slate-950">Inscripcion transaccional al cursado</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Consulta ofertas relacionales y ejecuta solamente comandos RPC auditados. Esta vista no crea historia academica oficial.</p>
          </div>
          <div className="flex items-center gap-2"><StatusBadge tone={state === 'ERROR' ? 'red' : state === 'PROCESSING' ? 'amber' : 'emerald'}>{state}</StatusBadge><button className="btn-secondary" onClick={() => load(selectedRelationId)} type="button"><RefreshCw className="h-4 w-4" />Actualizar</button></div>
        </div>
      </header>

      {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"><strong>Error:</strong> {error}</div>}

      {state === STUDENT_COURSE_PREVIEW_STATE.LOADING && !model ? (
        <div className="flex items-center gap-3 py-10 text-slate-600"><RefreshCw className="h-5 w-5 animate-spin" />Cargando datos relacionales...</div>
      ) : model ? (
        <>
          {mode === 'admin' && model.relations.length > 0 && (
            <label className="block max-w-xl text-sm font-bold text-slate-700">Alumno / vinculo a revisar<select className="input-base mt-2" onChange={(event) => load(event.target.value)} value={selectedRelationId ?? ''}>{model.relations.map((relation) => <option key={relation.id} value={relation.id}>{relation.student_display_name || relation.student_id} · {relation.career_name} · {relation.study_plan_name}</option>)}</select></label>
          )}

          <DiagnosticSection mode={mode} model={model} />

          {model.selectedRelation?.is_first_year_entrant && (
            <section className="rounded-md border border-sky-200 bg-sky-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><p className="flex items-center gap-2 font-extrabold text-sky-950"><UserRoundCheck className="h-5 w-5" />Alta automatica de primer ano</p><p className="mt-1 text-sm text-sky-800">La RPC decide ofertas, correlatividades, cupos y duplicados.</p></div>
                <button className="btn-primary" disabled={!firstYearEligible || firstYearOperation?.state === 'PROCESSING'} onClick={executeFirstYear} type="button"><ClipboardCheck className="h-4 w-4" />Inscribirme en todas las materias de primer ano</button>
              </div>
              <ResultPanel operation={firstYearOperation} />
            </section>
          )}

          <OfferingsSection model={model} onEnroll={executeIndividual} operations={individualOperations} />
          <EnrollmentsSection model={model} />

          {mode === 'admin' && (
            <>
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="flex items-center gap-2 font-extrabold"><AlertTriangle className="h-5 w-5" />Fuente academica transitoria</p><p className="mt-1">La validacion de materias aprobadas utiliza `student_grades`. Todavia no existe una historia academica canonica y esta elegibilidad no es definitiva.</p></div>
              <StudentCareerLinkAdminPanel key={model.selectedRelation?.id ?? 'unlinked'} model={model} onChanged={(relationId) => load(relationId)} requestIdFactory={requestIdFactory} />
              <AdminReviewSection model={model} />
            </>
          )}

          <footer className="flex items-center gap-2 border-t border-slate-200 pt-4 text-xs font-semibold text-slate-500"><Database className="h-4 w-4" />Lectura RLS y comandos RPC. Sin service role, sin snapshot y sin escrituras directas.</footer>
        </>
      ) : null}
    </section>
  )
}
