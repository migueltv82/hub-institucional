import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, History, Link2, Link2Off, RefreshCw, Replace } from 'lucide-react'
import {
  correctStudentCareerEnrollment,
  createStudentCareerEnrollment,
  getStudentCareerEnrollmentHistory,
  invalidateStudentCareerEnrollment,
} from '../../services/studentCareerEnrollmentAdminCommands.js'
import {
  findReadyLegacyStudentLink,
  getStudentCareerAdminMessage,
  getStudentCareerAdminResultCode,
  hasAmbiguousLegacyStudentLink,
} from './studentCareerEnrollmentAdminModel.js'

function initialForm() {
  return {
    studentId: '', studentRecordId: '', careerId: '', studyPlanId: '',
    admissionAcademicYearId: '', currentAcademicYearId: '', entryYear: '',
    isFirstYearEntrant: false, reason: '', confirmed: false, manualIdentityConfirmed: false,
  }
}

function OperationResult({ operation }) {
  if (!operation) return null
  const code = getStudentCareerAdminResultCode(operation.result)
  const detail = code ? getStudentCareerAdminMessage(code) : null
  const data = operation.result?.data
  return (
    <div className={`mt-4 rounded-md border p-3 text-sm ${operation.result?.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-red-200 bg-red-50 text-red-950'}`}>
      <div className="flex flex-wrap justify-between gap-2">
        <strong>{data?.status ?? (operation.result?.ok ? 'COMPLETED' : 'ERROR')}</strong>
        <code className="text-xs">{operation.requestId}</code>
      </div>
      {detail && <><p className="mt-2 font-bold">{detail.message}</p><p className="mt-1">Codigo: <code>{detail.code}</code></p><p className="mt-1">Accion: {detail.action}</p></>}
      {(data?.warnings ?? []).map((warning) => {
        const warningDetail = getStudentCareerAdminMessage(warning)
        return <p className="mt-2" key={warning}>Advertencia: {warningDetail.message} <code>{warning}</code></p>
      })}
      {(data?.auditEventId || data?.auditEventIds) && <p className="mt-2 text-xs">Auditoria registrada por el servidor.</p>}
    </div>
  )
}

function SelectField({ children, label, name, onChange, value }) {
  return <label className="text-sm font-bold text-slate-700">{label}<select className="input-base mt-1" name={name} onChange={onChange} value={value}><option value="">Seleccionar</option>{children}</select></label>
}

export default function StudentCareerLinkAdminPanel({
  model,
  onChanged,
  requestIdFactory,
  createCommand = createStudentCareerEnrollment,
  correctCommand = correctStudentCareerEnrollment,
  invalidateCommand = invalidateStudentCareerEnrollment,
  loadHistory = getStudentCareerEnrollmentHistory,
}) {
  const readyLegacy = findReadyLegacyStudentLink(model)
  const ambiguousLegacy = hasAmbiguousLegacyStudentLink(model)
  const defaultCareerId = model?.selectedRelation?.career_id ?? readyLegacy?.proposedCareerId ?? model?.careers?.[0]?.id ?? ''
  const careerScopeId = defaultCareerId
  const [historyData, setHistoryData] = useState(null)
  const [historyError, setHistoryError] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [mode, setMode] = useState(model?.selectedRelation ? 'CORRECT' : 'CREATE')
  const [form, setForm] = useState(initialForm)
  const [operation, setOperation] = useState(null)
  const processing = useRef(false)
  const requestIds = useRef(new Map())

  const refreshHistory = useCallback(async (careerId = careerScopeId) => {
    if (!careerId) return
    setLoadingHistory(true)
    setHistoryError('')
    const result = await loadHistory({ careerId })
    if (result?.ok) {
      setHistoryData(result.data)
      const relation = model?.selectedRelation
      const fallbackYear = result.data?.academicYears?.[0]
      setForm((current) => ({
        ...current,
        studentId: relation?.student_id ?? readyLegacy?.proposedStudentId ?? current.studentId,
        studentRecordId: relation?.student_record_id ?? readyLegacy?.legacyStudentRecordId ?? current.studentRecordId,
        careerId: relation?.career_id ?? readyLegacy?.proposedCareerId ?? careerId ?? current.careerId,
        studyPlanId: relation?.study_plan_id ?? readyLegacy?.proposedStudyPlanId ?? current.studyPlanId,
        admissionAcademicYearId: relation?.admission_academic_year_id ?? fallbackYear?.id ?? current.admissionAcademicYearId,
        currentAcademicYearId: relation?.current_academic_year_id ?? fallbackYear?.id ?? current.currentAcademicYearId,
        entryYear: relation?.entry_year ?? fallbackYear?.yearNumber ?? current.entryYear,
        isFirstYearEntrant: relation?.is_first_year_entrant ?? current.isFirstYearEntrant,
      }))
    } else setHistoryError(result?.error?.message ?? 'No se pudo cargar el historial.')
    setLoadingHistory(false)
  }, [careerScopeId, loadHistory, model, readyLegacy])

  useEffect(() => {
    let cancelled = false
    if (!defaultCareerId) return undefined
    void loadHistory({ careerId: defaultCareerId }).then((result) => {
      if (cancelled) return
      if (result?.ok) {
        setHistoryData(result.data)
        const relation = model?.selectedRelation
        const fallbackYear = result.data?.academicYears?.[0]
        setForm((current) => ({
          ...current,
          studentId: relation?.student_id ?? readyLegacy?.proposedStudentId ?? current.studentId,
          studentRecordId: relation?.student_record_id ?? readyLegacy?.legacyStudentRecordId ?? current.studentRecordId,
          careerId: relation?.career_id ?? readyLegacy?.proposedCareerId ?? defaultCareerId,
          studyPlanId: relation?.study_plan_id ?? readyLegacy?.proposedStudyPlanId ?? current.studyPlanId,
          admissionAcademicYearId: relation?.admission_academic_year_id ?? fallbackYear?.id ?? current.admissionAcademicYearId,
          currentAcademicYearId: relation?.current_academic_year_id ?? fallbackYear?.id ?? current.currentAcademicYearId,
          entryYear: relation?.entry_year ?? fallbackYear?.yearNumber ?? current.entryYear,
          isFirstYearEntrant: relation?.is_first_year_entrant ?? current.isFirstYearEntrant,
        }))
      } else setHistoryError(result?.error?.message ?? 'No se pudo cargar el historial.')
    })
    return () => { cancelled = true }
  }, [defaultCareerId, loadHistory, model, readyLegacy])

  const students = historyData?.students ?? []
  const studentRecords = historyData?.studentRecords ?? []
  const careers = historyData?.careers ?? model?.careers ?? []
  const plans = (historyData?.studyPlans ?? model?.studyPlans ?? []).filter((plan) => (
    (plan.careerId ?? plan.career_id) === form.careerId
  ))
  const years = historyData?.academicYears ?? model?.academicYears?.map((year) => ({ id: year.id, yearNumber: year.year_number, status: year.status })) ?? []
  const reasonValid = form.reason.trim().length > 0
  const createValid = Boolean(
    form.studentId && form.studentRecordId && form.careerId && form.studyPlanId
    && form.admissionAcademicYearId && form.currentAcademicYearId && form.entryYear
    && reasonValid && form.confirmed && (!ambiguousLegacy || form.manualIdentityConfirmed),
  )
  const correctionValid = Boolean(model?.selectedRelation && form.careerId && form.studyPlanId
    && form.admissionAcademicYearId && form.currentAcademicYearId && form.entryYear
    && reasonValid && form.confirmed)
  const invalidationValid = Boolean(model?.selectedRelation && reasonValid && form.confirmed)

  const setField = (event) => {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
    setOperation(null)
  }

  const execute = async () => {
    const valid = mode === 'CREATE' ? createValid : mode === 'CORRECT' ? correctionValid : invalidationValid
    if (!valid || processing.current) return
    processing.current = true
    const requestId = requestIds.current.get(mode) ?? requestIdFactory()
    requestIds.current.set(mode, requestId)
    setOperation({ state: 'PROCESSING', requestId })
    try {
      let result
      if (mode === 'CREATE') {
        result = await createCommand({ ...form, requestId })
      } else if (mode === 'CORRECT') {
        result = await correctCommand({
          existingStudentCareerEnrollmentId: model.selectedRelation.id,
          newCareerId: form.careerId, newStudyPlanId: form.studyPlanId,
          newAdmissionAcademicYearId: form.admissionAcademicYearId,
          newCurrentAcademicYearId: form.currentAcademicYearId,
          newEntryYear: form.entryYear, newIsFirstYearEntrant: form.isFirstYearEntrant,
          requestId, reason: form.reason,
        })
      } else {
        result = await invalidateCommand({
          studentCareerEnrollmentId: model.selectedRelation.id,
          requestId, reason: form.reason,
        })
      }
      setOperation({ state: result?.ok ? 'COMPLETED' : 'ERROR', requestId, result })
      if (result?.ok && result?.data?.status !== 'REJECTED') {
        await refreshHistory(form.careerId || careerScopeId)
        await onChanged?.(result.data?.studentCareerEnrollmentId ?? null)
      }
    } catch (error) {
      setOperation({
        state: 'ERROR', requestId,
        result: { ok: false, data: null, error: { code: 'NETWORK_RESPONSE_LOST', message: error?.message || 'NETWORK_RESPONSE_LOST' } },
      })
    } finally {
      processing.current = false
    }
  }

  const submitEnabled = mode === 'CREATE' ? createValid : mode === 'CORRECT' ? correctionValid : invalidationValid

  return (
    <section className="space-y-4 border-t border-slate-200 pt-6" data-testid="student-career-link-admin-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="soft-title">Gestion administrativa local</p><h3 className="mt-1 text-xl font-extrabold text-slate-950">Vinculo alumno, carrera y plan</h3><p className="mt-1 text-sm text-slate-600">Comandos RPC auditados. No hay escrituras directas ni borrado fisico.</p></div>
        <button className="btn-secondary" disabled={loadingHistory || !careerScopeId} onClick={() => refreshHistory()} type="button"><RefreshCw className={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} />Actualizar historial</button>
      </div>

      {historyError && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{historyError}</p>}
      {ambiguousLegacy && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="flex items-center gap-2 font-extrabold"><AlertTriangle className="h-4 w-4" />Diagnostico legacy ambiguo</p><p className="mt-1">No se autocompletara el vinculo. Debes seleccionar explicitamente usuario, registro, carrera y plan.</p></div>}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Operacion de vinculo">
        <button className={mode === 'CREATE' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setMode('CREATE'); setOperation(null) }} type="button"><Link2 className="h-4 w-4" />Crear</button>
        <button className={mode === 'CORRECT' ? 'btn-primary' : 'btn-secondary'} disabled={!model?.selectedRelation} onClick={() => { setMode('CORRECT'); setOperation(null) }} type="button"><Replace className="h-4 w-4" />Corregir</button>
        <button className={mode === 'INVALIDATE' ? 'btn-primary' : 'btn-secondary'} disabled={!model?.selectedRelation} onClick={() => { setMode('INVALIDATE'); setOperation(null) }} type="button"><Link2Off className="h-4 w-4" />Invalidar</button>
      </div>

      {mode !== 'INVALIDATE' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {mode === 'CREATE' && <><SelectField label="Alumno" name="studentId" onChange={setField} value={form.studentId}>{students.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName || student.studentId}</option>)}</SelectField><SelectField label="Registro de padron" name="studentRecordId" onChange={setField} value={form.studentRecordId}>{studentRecords.map((record) => <option key={record.studentRecordId} value={record.studentRecordId}>{record.displayName || record.studentRecordId} · {record.legacyCareer || 'Sin carrera legacy'}</option>)}</SelectField></>}
          <SelectField label="Carrera" name="careerId" onChange={setField} value={form.careerId}>{careers.map((career) => <option key={career.id} value={career.id}>{career.name}</option>)}</SelectField>
          <SelectField label="Plan de estudios" name="studyPlanId" onChange={setField} value={form.studyPlanId}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</SelectField>
          <SelectField label="Ciclo de ingreso" name="admissionAcademicYearId" onChange={setField} value={form.admissionAcademicYearId}>{years.map((year) => <option key={year.id} value={year.id}>{year.yearNumber}</option>)}</SelectField>
          <SelectField label="Ciclo actual" name="currentAcademicYearId" onChange={setField} value={form.currentAcademicYearId}>{years.map((year) => <option key={year.id} value={year.id}>{year.yearNumber}</option>)}</SelectField>
          <label className="text-sm font-bold text-slate-700">Ano de ingreso<input className="input-base mt-1" min="2000" max="2200" name="entryYear" onChange={setField} type="number" value={form.entryYear} /></label>
          <label className="flex items-center gap-2 self-end rounded-md border border-slate-200 p-3 text-sm font-bold"><input checked={form.isFirstYearEntrant} name="isFirstYearEntrant" onChange={setField} type="checkbox" />Ingresante de primer ano</label>
        </div>
      )}

      {mode === 'INVALIDATE' && <div className="rounded-md border-2 border-red-300 bg-red-50 p-4 text-sm text-red-950"><strong>Este vinculo dejara de estar activo.</strong><p className="mt-1">Las inscripciones historicas no se eliminaran. Las inscripciones activas se informaran como advertencia.</p></div>}

      <label className="block text-sm font-bold text-slate-700">Motivo administrativo<textarea className="input-base mt-1 min-h-24" name="reason" onChange={setField} placeholder="Motivo obligatorio y auditable" value={form.reason} /></label>
      {ambiguousLegacy && mode === 'CREATE' && <label className="flex items-start gap-2 text-sm font-bold text-amber-950"><input checked={form.manualIdentityConfirmed} name="manualIdentityConfirmed" onChange={setField} type="checkbox" />Confirme manualmente la identidad y las alternativas ante la ambiguedad legacy.</label>}
      <label className="flex items-start gap-2 text-sm font-bold text-slate-800"><input checked={form.confirmed} name="confirmed" onChange={setField} type="checkbox" />Confirmo el resumen, los IDs seleccionados y el impacto de esta operacion no oficial.</label>
      <button className="btn-primary" disabled={!submitEnabled || operation?.state === 'PROCESSING'} onClick={execute} type="button">{operation?.state === 'PROCESSING' ? 'Procesando...' : `${mode === 'CREATE' ? 'Crear' : mode === 'CORRECT' ? 'Corregir' : 'Invalidar'} vinculo`}</button>
      <OperationResult operation={operation} />

      <div className="space-y-3 pt-3">
        <h4 className="flex items-center gap-2 font-extrabold text-slate-950"><History className="h-4 w-4" />Historial administrativo read-only</h4>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-600"><tr><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Alumno</th><th className="px-3 py-2">Carrera / plan</th><th className="px-3 py-2">Vigencia</th><th className="px-3 py-2">Trazabilidad</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{(historyData?.history ?? []).map((link) => <tr key={link.id}><td className="px-3 py-2 font-bold">{link.status}</td><td className="px-3 py-2">{link.studentDisplayName || link.studentId}</td><td className="px-3 py-2">{link.careerName} · {link.studyPlanName}</td><td className="px-3 py-2">{link.validFrom || 'Sin fecha'} / {link.validTo || 'vigente'}</td><td className="px-3 py-2 font-mono text-xs">anterior: {link.supersedesEnrollmentId || '-'}<br />reemplazo: {link.supersededByEnrollmentId || '-'}</td></tr>)}{(historyData?.history ?? []).length === 0 && <tr><td className="px-3 py-4 text-slate-500" colSpan="5">Sin vinculos registrados.</td></tr>}</tbody></table>
        </div>
        <p className="text-xs text-slate-500">Comandos: {historyData?.commandRequests?.length ?? 0} · Eventos: {historyData?.auditEvents?.length ?? 0}. Hashes y payload de auditoria son solo lectura.</p>
      </div>
    </section>
  )
}
