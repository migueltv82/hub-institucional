import { useEffect, useMemo, useState } from 'react'
import {
  ADMIN_REVIEW_DECISION_TYPES,
  ADMIN_DECISIONS,
  EXPERIMENTAL_REVIEW_STATUS,
  appendAdminReviewApprovalRequest,
  appendAdminReviewSecondApproval,
  buildAdminReviewApprovalEligibility,
  buildAdminReviewFinalReadiness,
  buildAdminReviewOfficializationPlan,
  buildAdminReviewSecondApprovalEligibility,
  buildExperimentalReviewedScheduleDraft,
  buildExperimentalReviewedSchedule,
  buildTeacherAffectationLedger,
  buildTeacherExamSourceContext,
  buildTitularOnlyPreSchedule,
  buildTribunalSelectionTargetId,
  createAdminReviewApprovalRequest,
  createAdminReviewSecondApproval,
  getSelectedTribunalSelections,
  promoteAdminReviewedDraft,
  recommendTribunalTeachers,
  removeTribunalTeacherDecision,
  suggestExamTableGroupings,
  tryAcceptAdminReviewDecision,
  trySelectTribunalTeacherDecision,
  upsertAdminReviewDecision,
  upsertAdminReviewedPromotion,
  upsertExperimentalReviewedScheduleDraft,
  validateAdminReviewedDraftForPromotion,
  validatePreScheduleHardRules,
  verifyAdminReviewPromotionEvents,
} from '../../utils/examEngine'
import { isExamAdminReviewWorkflowEnabled } from './isExamAdminReviewWorkflowEnabled.js'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function displayNumber(value) {
  return Number(value ?? 0).toLocaleString('es-AR')
}

function clean(value) {
  return String(value ?? '').trim()
}

function getFirstExamRange({ fechaInicio = '', fechaFin = '', regularCallRanges = {} } = {}) {
  return {
    start: clean(regularCallRanges?.first?.start) || clean(fechaInicio),
    end: clean(regularCallRanges?.first?.end) || clean(fechaFin),
  }
}

function decisionByTarget(decisions = [], type = ADMIN_REVIEW_DECISION_TYPES.GROUPING) {
  return asArray(decisions).reduce((accumulator, decision) => {
    if (decision?.type === type) accumulator[decision.targetId] = decision
    return accumulator
  }, {})
}

function renderList(values = [], fallback = 'Sin datos') {
  const safeValues = asArray(values).filter(Boolean)
  return safeValues.length ? safeValues.join(', ') : fallback
}

function promotionVerificationFingerprint(promotions = []) {
  return JSON.stringify(asArray(promotions).map((promotion) => ({
    promotionId: promotion?.promotionId,
    integrityStatus: promotion?.integrityStatus,
    integrityVerification: promotion?.integrityVerification,
    isOfficialCandidate: promotion?.isOfficialCandidate,
  })))
}

function DecisionBadge({ decision }) {
  const label = decision?.decision ?? ADMIN_DECISIONS.PENDING
  const tone = label === ADMIN_DECISIONS.ACCEPTED
    || label === 'SELECTED'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : label === ADMIN_DECISIONS.REJECTED || label === 'REMOVED' || label === 'BLOCKED_HARD_RULES'
      ? 'border-red-200 bg-red-50 text-red-900'
      : label === ADMIN_DECISIONS.EDITED
        ? 'border-sky-200 bg-sky-50 text-sky-900'
        : 'border-amber-200 bg-amber-50 text-amber-900'

  return <span className={`status-chip ${tone}`}>{label}</span>
}

export function ExamAdminReviewWorkflowPanel({
  adminReviewDecisions = [],
  adminReviewDrafts = [],
  adminReviewPromotions = [],
  adminReviewApprovalRequests = [],
  adminReviewSecondApprovals = [],
  adminActor = null,
  alumnos = [],
  correlatividades = [],
  disponibilidadDocente = [],
  cargaHorariaDocente = [],
  currentOfficialSchedule = [],
  fechasBloqueadasDocente = [],
  docentes = [],
  fechaFin = '',
  fechaInicio = '',
  horariosDocentes = [],
  planesEstudio = [],
  regularCallRanges = {},
  canEditWorkspace = false,
  onAdminReviewDecisionsChange = () => {},
  onAdminReviewDraftsChange = () => {},
  onAdminReviewPromotionsChange = () => {},
  onAdminReviewApprovalRequestsChange = () => {},
  onAdminReviewSecondApprovalsChange = () => {},
  workspaceKey = 'main',
  env = import.meta.env,
}) {
  const enabled = isExamAdminReviewWorkflowEnabled(env)
  const [statusMessage, setStatusMessage] = useState('')
  const [selectedMesaId, setSelectedMesaId] = useState('')
  const [pendingPromotionDraftId, setPendingPromotionDraftId] = useState('')
  const [pendingApprovalPromotionId, setPendingApprovalPromotionId] = useState('')
  const [pendingSecondApprovalRequestId, setPendingSecondApprovalRequestId] = useState('')
  const decisionsByGrouping = useMemo(
    () => decisionByTarget(adminReviewDecisions, ADMIN_REVIEW_DECISION_TYPES.GROUPING),
    [adminReviewDecisions],
  )
  const decisionsBySelection = useMemo(
    () => decisionByTarget(adminReviewDecisions, ADMIN_REVIEW_DECISION_TYPES.TRIBUNAL_SELECTION),
    [adminReviewDecisions],
  )
  const tribunalSelections = useMemo(
    () => getSelectedTribunalSelections(adminReviewDecisions),
    [adminReviewDecisions],
  )
  const teacherExamSourceContext = useMemo(() => buildTeacherExamSourceContext({
    disponibilidadDocente,
    cargaHorariaDocente,
    fechasBloqueadasDocente,
    horariosDocentes,
  }), [cargaHorariaDocente, disponibilidadDocente, fechasBloqueadasDocente, horariosDocentes])
  const examRange = useMemo(
    () => getFirstExamRange({ fechaInicio, fechaFin, regularCallRanges }),
    [fechaFin, fechaInicio, regularCallRanges],
  )
  const preScheduleResult = useMemo(() => buildTitularOnlyPreSchedule({
    teacherExamSourceContext,
    planesEstudio,
    fechaInicio: examRange.start,
    fechaFin: examRange.end,
  }), [examRange.end, examRange.start, planesEstudio, teacherExamSourceContext])
  const preScheduleValidation = useMemo(() => validatePreScheduleHardRules({
    preSchedule: preScheduleResult.mesas,
    correlatividades,
  }), [correlatividades, preScheduleResult.mesas])
  const groupingSuggestions = useMemo(() => suggestExamTableGroupings({
    preSchedule: preScheduleResult.mesas,
    correlatividades,
    adminDecisions: Object.fromEntries(
      Object.entries(decisionsByGrouping).map(([targetId, decision]) => [targetId, decision.decision]),
    ),
  }), [correlatividades, decisionsByGrouping, preScheduleResult.mesas])
  const selectedMesa = preScheduleResult.mesas.find((mesa) => mesa.id === selectedMesaId) ?? preScheduleResult.mesas[0] ?? null
  const recommendations = useMemo(() => (
    selectedMesa
      ? recommendTribunalTeachers({
        teacherExamSourceContext,
        mesa: selectedMesa,
        selections: tribunalSelections,
        acceptedGroupings: groupingSuggestions.filter((suggestion) => decisionsByGrouping[suggestion.groupId]?.decision === ADMIN_DECISIONS.ACCEPTED),
      }).slice(0, 6)
      : []
  ), [decisionsByGrouping, groupingSuggestions, selectedMesa, teacherExamSourceContext, tribunalSelections])
  const ledger = useMemo(
    () => buildTeacherAffectationLedger({ teacherExamSourceContext, selections: tribunalSelections }),
    [teacherExamSourceContext, tribunalSelections],
  )
  const experimentalReviewedSchedule = useMemo(() => buildExperimentalReviewedSchedule({
    preSchedule: preScheduleResult.mesas,
    adminReviewDecisions,
    teacherExamSourceContext,
    options: { correlatividades },
  }), [adminReviewDecisions, correlatividades, preScheduleResult.mesas, teacherExamSourceContext])
  const canPrepareDraft = [
    EXPERIMENTAL_REVIEW_STATUS.REVIEW_READY,
    EXPERIMENTAL_REVIEW_STATUS.REVIEW_HAS_WARNINGS,
  ].includes(experimentalReviewedSchedule.status)
  const promotionValidationByDraftId = useMemo(() => Object.fromEntries(
    asArray(adminReviewDrafts).map((draft) => [
      draft.draftId,
      validateAdminReviewedDraftForPromotion({
        draft,
        adminReviewDecisions,
        teacherExamSourceContext,
      }),
    ]),
  ), [adminReviewDecisions, adminReviewDrafts, teacherExamSourceContext])
  const verifiedAdminReviewPromotions = useMemo(() => verifyAdminReviewPromotionEvents({
    promotions: adminReviewPromotions,
    drafts: adminReviewDrafts,
    teacherExamSourceContext,
  }), [adminReviewDrafts, adminReviewPromotions, teacherExamSourceContext])
  const promotionIntegrityCounts = useMemo(() => verifiedAdminReviewPromotions.reduce((counts, promotion) => {
    const status = promotion.integrityStatus ?? 'VERIFY_ERROR'
    counts[status] = Number(counts[status] ?? 0) + 1
    return counts
  }, {}), [verifiedAdminReviewPromotions])
  const approvalEligibility = useMemo(() => buildAdminReviewApprovalEligibility({
    promotions: verifiedAdminReviewPromotions,
    drafts: adminReviewDrafts,
    adminReviewDecisions,
    teacherExamSourceContext,
  }), [adminReviewDecisions, adminReviewDrafts, teacherExamSourceContext, verifiedAdminReviewPromotions])
  const activeApprovalRequestByPromotion = useMemo(() => Object.fromEntries(
    asArray(adminReviewApprovalRequests)
      .filter((request) => ['REQUESTED', 'PENDING_SECOND_APPROVAL'].includes(clean(request?.status).toUpperCase()))
      .map((request) => [request.promotionId, request]),
  ), [adminReviewApprovalRequests])
  const secondApprovalEligibility = useMemo(() => buildAdminReviewSecondApprovalEligibility({
    approvalRequests: adminReviewApprovalRequests,
    promotions: verifiedAdminReviewPromotions,
    approvalEligibility,
    currentActor: adminActor,
  }), [adminActor, adminReviewApprovalRequests, approvalEligibility, verifiedAdminReviewPromotions])
  const secondApprovalByRequest = useMemo(() => Object.fromEntries(
    asArray(adminReviewSecondApprovals)
      .filter((approval) => clean(approval?.status).toUpperCase() === 'SECOND_APPROVED')
      .map((approval) => [approval.requestId, approval]),
  ), [adminReviewSecondApprovals])
  const finalReadiness = useMemo(() => buildAdminReviewFinalReadiness({
    promotions: verifiedAdminReviewPromotions,
    approvalRequests: adminReviewApprovalRequests,
    secondApprovals: adminReviewSecondApprovals,
    drafts: adminReviewDrafts,
    adminReviewDecisions,
    teacherExamSourceContext,
    currentActor: adminActor,
  }), [
    adminActor,
    adminReviewApprovalRequests,
    adminReviewDecisions,
    adminReviewDrafts,
    adminReviewSecondApprovals,
    teacherExamSourceContext,
    verifiedAdminReviewPromotions,
  ])
  const officializationPlanResult = useMemo(() => buildAdminReviewOfficializationPlan({
    finalReadiness,
    currentOfficialSchedule,
    currentActor: adminActor,
  }), [adminActor, currentOfficialSchedule, finalReadiness])

  useEffect(() => {
    if (!enabled) return
    if (promotionVerificationFingerprint(adminReviewPromotions) === promotionVerificationFingerprint(verifiedAdminReviewPromotions)) return
    onAdminReviewPromotionsChange(verifiedAdminReviewPromotions)
  }, [adminReviewPromotions, enabled, onAdminReviewPromotionsChange, verifiedAdminReviewPromotions])

  if (!enabled) return null

  const persistDecision = (nextDecisions, message) => {
    onAdminReviewDecisionsChange(nextDecisions)
    setStatusMessage(message)
  }

  const acceptGrouping = (suggestion) => {
    const result = tryAcceptAdminReviewDecision({
      target: suggestion,
      decisions: adminReviewDecisions,
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: suggestion.groupId,
      reason: 'Agrupamiento aceptado desde revision administrativa experimental.',
    })

    persistDecision(
      result.decisions,
      result.ok
        ? 'Agrupamiento aceptado. No se modifica el cronograma oficial.'
        : `Aceptacion bloqueada por reglas duras: ${renderList(result.hardRuleViolations)}`,
    )
  }

  const rejectGrouping = (suggestion) => {
    persistDecision(upsertAdminReviewDecision(adminReviewDecisions, {
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: suggestion.groupId,
      decision: ADMIN_DECISIONS.REJECTED,
      reason: 'Agrupamiento rechazado desde revision administrativa experimental.',
      hardRuleViolations: suggestion.hardRuleViolations,
    }), 'Agrupamiento rechazado y persistido en snapshot.')
  }

  const editGrouping = (suggestion) => {
    persistDecision(upsertAdminReviewDecision(adminReviewDecisions, {
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: suggestion.groupId,
      decision: ADMIN_DECISIONS.EDITED,
      reason: 'Metadata basica editada desde revision administrativa experimental.',
      metadata: {
        editedAtPanel: true,
        level: suggestion.level,
        type: suggestion.type,
      },
      hardRuleViolations: suggestion.hardRuleViolations,
    }), 'Metadata del agrupamiento marcada como editada.')
  }

  const pendingGrouping = (suggestion) => {
    persistDecision(upsertAdminReviewDecision(adminReviewDecisions, {
      type: ADMIN_REVIEW_DECISION_TYPES.GROUPING,
      targetId: suggestion.groupId,
      decision: ADMIN_DECISIONS.PENDING,
      reason: 'Agrupamiento dejado pendiente desde revision administrativa experimental.',
      hardRuleViolations: suggestion.hardRuleViolations,
    }), 'Agrupamiento dejado pendiente.')
  }

  const selectRecommendedTeacher = (recommendation) => {
    const currentLedgerEntry = ledger[recommendation.docente.id] ?? null
    const affectationBefore = currentLedgerEntry
      ? {
        used: currentLedgerEntry.afectacionesUsadas,
        remaining: currentLedgerEntry.afectacionesRestantes,
        limit: currentLedgerEntry.limiteAfectacion,
      }
      : null
    const affectationAfter = recommendation.eligible
      ? {
        used: Number(affectationBefore?.used ?? 0) + 1,
        remaining: Math.max(0, Number(affectationBefore?.remaining ?? 0) - 1),
        limit: affectationBefore?.limit ?? recommendation.limiteAfectacion,
      }
      : affectationBefore
    const result = trySelectTribunalTeacherDecision({
      decisions: adminReviewDecisions,
      mesa: selectedMesa,
      recommendation,
      role: 'VOCAL',
      affectationBefore,
      affectationAfter,
    })

    persistDecision(
      result.decisions,
      result.ok
        ? 'Vocal seleccionado en revision experimental. No se modifica el cronograma oficial.'
        : `Seleccion bloqueada por reglas duras: ${renderList(result.hardRuleViolations)}`,
    )
  }

  const removeSelectedTeacher = (selection) => {
    persistDecision(removeTribunalTeacherDecision({
      decisions: adminReviewDecisions,
      selection,
    }), 'Seleccion removida. El cupo queda liberado en el ledger experimental.')
  }

  const prepareReviewedDraft = () => {
    const result = buildExperimentalReviewedScheduleDraft({
      review: experimentalReviewedSchedule,
      preSchedule: preScheduleResult.mesas,
      adminReviewDecisions,
      teacherExamSourceContext,
      workspaceKey,
    })

    if (!result.ok) {
      setStatusMessage('No se puede preparar copia revisada: el preview esta bloqueado o incompleto.')
      return
    }

    onAdminReviewDraftsChange(upsertExperimentalReviewedScheduleDraft(adminReviewDrafts, result.draft))
    setStatusMessage('Copia revisada preparada como borrador experimental. No reemplaza el cronograma oficial.')
  }

  const requestDraftPromotion = (draft) => {
    setPendingPromotionDraftId(draft.draftId)
    setStatusMessage('Confirma la promocion experimental. Esto no reemplaza el cronograma oficial.')
  }

  const confirmDraftPromotion = () => {
    const draft = adminReviewDrafts.find((item) => item.draftId === pendingPromotionDraftId)
    const result = promoteAdminReviewedDraft({
      draft,
      adminReviewDecisions,
      teacherExamSourceContext,
      options: { workspaceKey, adminActor, existingPromotions: adminReviewPromotions },
    })

    if (!result.promoted) {
      setStatusMessage(`Promocion bloqueada: ${renderList(result.hardRuleViolations)}`)
      setPendingPromotionDraftId('')
      return
    }

    onAdminReviewPromotionsChange(upsertAdminReviewedPromotion(adminReviewPromotions, result.promotionRecord))
    setPendingPromotionDraftId('')
    setStatusMessage('Copia promovida experimental creada. No reemplaza el cronograma oficial.')
  }

  const requestApproval = (promotion) => {
    setPendingApprovalPromotionId(promotion.promotionId)
    setStatusMessage('Confirma la solicitud administrativa. Esto no convierte el cronograma en oficial.')
  }

  const confirmApprovalRequest = () => {
    const promotion = approvalEligibility.eligiblePromotions
      .find((candidate) => candidate.promotionId === pendingApprovalPromotionId)
    const result = createAdminReviewApprovalRequest({
      promotion,
      approvalEligibility,
      adminActor,
      existingApprovalRequests: adminReviewApprovalRequests,
    })

    if (!result.requestCreated) {
      setPendingApprovalPromotionId('')
      setStatusMessage(`Solicitud bloqueada: ${result.blockedReason || renderList(result.warnings)}`)
      return
    }

    onAdminReviewApprovalRequestsChange(appendAdminReviewApprovalRequest(
      adminReviewApprovalRequests,
      result.approvalRequest,
    ))
    setPendingApprovalPromotionId('')
    setStatusMessage('Solicitud de aprobacion creada. El cronograma sigue siendo experimental y no oficial.')
  }

  const requestSecondApproval = (approvalRequest) => {
    setPendingSecondApprovalRequestId(approvalRequest.requestId)
    setStatusMessage('Confirma la segunda aprobacion experimental. Esto no convierte el cronograma en oficial.')
  }

  const confirmSecondApproval = () => {
    const approvalRequest = secondApprovalEligibility.eligibleRequests
      .find((request) => request.requestId === pendingSecondApprovalRequestId)
    const promotion = verifiedAdminReviewPromotions
      .find((candidate) => candidate.promotionId === approvalRequest?.promotionId)
    const result = createAdminReviewSecondApproval({
      approvalRequest,
      promotion,
      secondApprovalEligibility,
      currentActor: adminActor,
      existingSecondApprovals: adminReviewSecondApprovals,
    })

    if (!result.approvalCreated) {
      setPendingSecondApprovalRequestId('')
      setStatusMessage(`Segunda aprobacion bloqueada: ${result.blockedReason || renderList(result.warnings)}`)
      return
    }

    onAdminReviewSecondApprovalsChange(appendAdminReviewSecondApproval(
      adminReviewSecondApprovals,
      result.secondApproval,
    ))
    setPendingSecondApprovalRequestId('')
    setStatusMessage('Segunda aprobacion registrada. El cronograma sigue siendo experimental y no oficial.')
  }

  return (
    <section className="soft-card soft-card--tint-amber border-l-4 border-l-amber-500" aria-label="Revision administrativa experimental de examenes">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="soft-title">Flujo experimental</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-950">Revision administrativa asistida</h3>
          <p className="mt-2 max-w-4xl text-sm font-bold leading-6 text-slate-700">
            Vista experimental. Construye precronograma con titulares, sugiere agrupamientos y recomienda vocales.
            No reemplaza la generacion oficial ni publica cronogramas.
          </p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs font-extrabold uppercase text-slate-500">Fuente docente</p>
            <p className="font-extrabold text-slate-950">{teacherExamSourceContext.source}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs font-extrabold uppercase text-slate-500">Precronograma</p>
            <p className="font-extrabold text-slate-950">{displayNumber(preScheduleResult.mesas.length)} mesas</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <p className="text-xs font-extrabold uppercase text-slate-500">Decisiones</p>
            <p className="font-extrabold text-slate-950">{displayNumber(adminReviewDecisions.length)}</p>
          </div>
        </div>
      </div>

      {statusMessage ? (
        <p className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-900">
          {statusMessage}
        </p>
      ) : null}

      {!canEditWorkspace ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
          Modo solo lectura: puedes revisar el flujo, pero no persistir decisiones.
        </p>
      ) : null}

      <section className="mt-4 rounded-md border border-slate-200 bg-white p-3" aria-label="Validacion del precronograma experimental">
        <h4 className="text-sm font-extrabold uppercase text-slate-800">Validacion titular-only</h4>
        <p className="mt-1 text-sm font-bold text-slate-700">
          Confirmable: {preScheduleValidation.confirmable ? 'si' : 'no'}. Un tribunal incompleto no puede marcarse como valido.
        </p>
        {preScheduleValidation.hardRuleViolations.length ? (
          <p className="mt-2 text-sm font-bold text-red-800">
            Violaciones: {renderList(preScheduleValidation.hardRuleViolations.slice(0, 8))}
          </p>
        ) : null}
      </section>

      <section className="mt-4" aria-label="Precronograma solo con titulares">
        <h4 className="text-sm font-extrabold uppercase text-slate-800">Precronograma solo con titulares</h4>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {preScheduleResult.mesas.slice(0, 8).map((mesa) => (
            <button
              key={mesa.id}
              type="button"
              className={`rounded-md border p-3 text-left ${selectedMesa?.id === mesa.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white'}`}
              onClick={() => setSelectedMesaId(mesa.id)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold text-slate-950">{mesa.nombreMateria || mesa.materia}</p>
                  <p className="mt-1 text-sm font-bold text-slate-600">{mesa.carrera} / {mesa.fechaIso || 'sin fecha'} {mesa.turno || ''}</p>
                </div>
                <span className="status-chip border-amber-200 bg-amber-50 text-amber-900">{mesa.tribunalStatus}</span>
              </div>
              <p className="mt-2 text-sm font-bold text-slate-700">Titular: {mesa.titular || 'sin titular'}</p>
              <p className="mt-1 text-xs font-extrabold uppercase text-slate-500">Vocales automaticos: {mesa.vocales.length}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4" aria-label="Sugerencias de agrupamiento administrativo">
        <h4 className="text-sm font-extrabold uppercase text-slate-800">Sugerencias de agrupamiento</h4>
        <div className="mt-3 grid gap-3">
          {groupingSuggestions.slice(0, 8).map((suggestion) => {
            const persistedDecision = decisionsByGrouping[suggestion.groupId]

            return (
              <article key={suggestion.groupId} className="rounded-md border border-slate-200 bg-white p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-extrabold text-slate-950">{suggestion.type}</p>
                      <DecisionBadge decision={persistedDecision ?? { decision: suggestion.adminDecision }} />
                      <span className="status-chip border-slate-200 bg-slate-50 text-slate-700">{suggestion.level}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-700">
                      {suggestion.estimatedBenefit}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                      Carreras: {renderList(suggestion.careers)}. Materias: {renderList(suggestion.subjects)}.
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                      Razones: {renderList(suggestion.reasons)}.
                    </p>
                    {suggestion.hardRuleViolations.length ? (
                      <p className="mt-2 text-sm font-bold text-red-800">
                        Reglas duras: {renderList(suggestion.hardRuleViolations)}
                      </p>
                    ) : null}
                    {persistedDecision?.reason ? (
                      <p className="mt-2 text-sm font-bold text-sky-800">Decision guardada: {persistedDecision.reason}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" disabled={!canEditWorkspace} onClick={() => acceptGrouping(suggestion)}>
                      Aceptar
                    </button>
                    <button type="button" className="btn-secondary" disabled={!canEditWorkspace} onClick={() => rejectGrouping(suggestion)}>
                      Rechazar
                    </button>
                    <button type="button" className="btn-secondary" disabled={!canEditWorkspace} onClick={() => editGrouping(suggestion)}>
                      Editar metadata
                    </button>
                    <button type="button" className="btn-secondary" disabled={!canEditWorkspace} onClick={() => pendingGrouping(suggestion)}>
                      Pendiente
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
          {!groupingSuggestions.length ? (
            <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600">
              Sin sugerencias de agrupamiento con los datos actuales.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
        <section className="rounded-md border border-slate-200 bg-white p-3" aria-label="Docentes recomendados para vocales">
          <h4 className="text-sm font-extrabold uppercase text-slate-800">Docentes recomendados para vocales</h4>
          <p className="mt-1 text-sm font-bold text-slate-600">
            Mesa seleccionada: {selectedMesa?.nombreMateria || selectedMesa?.materia || 'sin mesa'}.
          </p>
          {tribunalSelections.filter((selection) => selection.mesaId === selectedMesa?.id).length ? (
            <section className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3" aria-label="Selecciones actuales del tribunal experimental">
              <p className="text-sm font-extrabold uppercase text-emerald-900">Selecciones actuales</p>
              <div className="mt-2 grid gap-2">
                {tribunalSelections
                  .filter((selection) => selection.mesaId === selectedMesa?.id)
                  .map((selection) => (
                    <div key={selection.targetId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-100 bg-white px-3 py-2">
                      <div>
                        <p className="font-extrabold text-slate-950">{selection.docente}</p>
                        <p className="text-sm font-bold text-slate-600">{selection.role} / {selection.fechaIso} {selection.inicio}-{selection.fin}</p>
                      </div>
                      <button type="button" className="btn-secondary" disabled={!canEditWorkspace} onClick={() => removeSelectedTeacher(selection)}>
                        Quitar seleccion
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          ) : null}
          <div className="mt-3 grid gap-2">
            {recommendations.map((recommendation) => {
              const targetId = buildTribunalSelectionTargetId({
                tableId: selectedMesa?.id,
                teacherId: recommendation.docente.id,
                role: 'VOCAL',
              })
              const persistedSelectionDecision = decisionsBySelection[targetId]

              return (
                <div key={recommendation.docente.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-extrabold text-slate-950">{recommendation.docente.nombre}</p>
                      {persistedSelectionDecision ? <DecisionBadge decision={persistedSelectionDecision} /> : null}
                    </div>
                    <span className={`status-chip ${recommendation.eligible ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>
                      {recommendation.eligible ? 'ELEGIBLE' : 'BLOQUEADO'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    Cupo {displayNumber(recommendation.afectacionesUsadas)}/{displayNumber(recommendation.limiteAfectacion)}.
                    Restantes: {displayNumber(recommendation.afectacionesRestantes)}.
                    Al seleccionar: {displayNumber(recommendation.afectacionesUsadas + 1)}/{displayNumber(recommendation.limiteAfectacion)}
                    {' '}y {displayNumber(Math.max(0, recommendation.afectacionesRestantes - 1))} restantes.
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    Consume afectacion: si. Disponibilidad: dia {recommendation.disponibleEseDia ? 'si' : 'no'}, turno/franja {recommendation.disponibleEnTurno ? 'si' : 'no'}.
                    Afinidad: {recommendation.nivelAfinidad}. Score: {displayNumber(recommendation.score)}.
                  </p>
                  {recommendation.reasons.length ? (
                    <p className="mt-1 text-sm font-bold text-slate-600">Razones: {renderList(recommendation.reasons)}</p>
                  ) : null}
                  {recommendation.warnings.length ? (
                    <p className="mt-1 text-sm font-bold text-amber-800">Warnings: {renderList(recommendation.warnings)}</p>
                  ) : null}
                  {recommendation.hardRuleViolations.length ? (
                    <p className="mt-1 text-sm font-bold text-red-800">Reglas duras: {renderList(recommendation.hardRuleViolations)}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" disabled={!canEditWorkspace} onClick={() => selectRecommendedTeacher(recommendation)}>
                      Seleccionar vocal
                    </button>
                    {persistedSelectionDecision?.decision === 'SELECTED' ? (
                      <button type="button" className="btn-secondary" disabled={!canEditWorkspace} onClick={() => removeSelectedTeacher(persistedSelectionDecision)}>
                        Quitar seleccion
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-3" aria-label="Cupos docentes del flujo experimental">
          <h4 className="text-sm font-extrabold uppercase text-slate-800">Cupos docentes</h4>
          <div className="mt-3 grid gap-2">
            {Object.values(ledger).slice(0, 8).map((entry) => (
              <div key={entry.docenteId} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="font-extrabold text-slate-950">{entry.docente}</p>
                <p className="text-sm font-bold text-slate-600">
                  Horas {displayNumber(entry.horasCatedra)} / limite {displayNumber(entry.limiteAfectacion)} / restante {displayNumber(entry.afectacionesRestantes)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="mt-4 rounded-md border border-violet-200 bg-violet-50 p-3" aria-label="Cronograma revisado experimental">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h4 className="text-sm font-extrabold uppercase text-violet-950">Cronograma revisado experimental</h4>
            <p className="mt-1 text-sm font-bold text-violet-900">
              Estado: {experimentalReviewedSchedule.status}. Preview no oficial; no guarda ni reemplaza cronograma.
            </p>
            <p className="mt-1 text-sm font-bold text-violet-900">
              Esta copia no reemplaza el cronograma oficial.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={!canEditWorkspace || !canPrepareDraft}
              onClick={prepareReviewedDraft}
            >
              Preparar copia revisada
            </button>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-md border border-violet-100 bg-white px-3 py-2">
              <p className="text-xs font-extrabold uppercase text-slate-500">Aplicadas</p>
              <p className="font-extrabold text-slate-950">{displayNumber(experimentalReviewedSchedule.appliedDecisions.length)}</p>
            </div>
            <div className="rounded-md border border-violet-100 bg-white px-3 py-2">
              <p className="text-xs font-extrabold uppercase text-slate-500">Saltadas</p>
              <p className="font-extrabold text-slate-950">{displayNumber(experimentalReviewedSchedule.skippedDecisions.length)}</p>
            </div>
            <div className="rounded-md border border-violet-100 bg-white px-3 py-2">
              <p className="text-xs font-extrabold uppercase text-slate-500">Completas</p>
              <p className="font-extrabold text-slate-950">{displayNumber(experimentalReviewedSchedule.diagnostics.completeTribunals)}</p>
            </div>
          </div>
        </div>
        {experimentalReviewedSchedule.hardRuleViolations.length ? (
          <p className="mt-3 text-sm font-bold text-red-800">
            Violaciones duras: {renderList(experimentalReviewedSchedule.hardRuleViolations.slice(0, 8))}
          </p>
        ) : null}
        {!canPrepareDraft ? (
          <p className="mt-3 text-sm font-bold text-amber-900">
            Preparacion bloqueada: solo se permite con REVIEW_READY o REVIEW_HAS_WARNINGS.
          </p>
        ) : null}
        {experimentalReviewedSchedule.warnings.length ? (
          <p className="mt-3 text-sm font-bold text-amber-900">
            Warnings: {renderList(experimentalReviewedSchedule.warnings.slice(0, 5))}
          </p>
        ) : null}
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {experimentalReviewedSchedule.schedule.slice(0, 6).map((mesa) => (
            <div key={mesa.id} className="rounded-md border border-violet-100 bg-white px-3 py-2">
              <p className="font-extrabold text-slate-950">{mesa.nombreMateria || mesa.materia}</p>
              <p className="mt-1 text-sm font-bold text-slate-600">
                {mesa.carrera} / {mesa.tribunalStatus} / vocales {displayNumber(mesa.vocales.length)}
              </p>
              {mesa.adminReview?.appliedDecisionIds?.length ? (
                <p className="mt-1 text-xs font-extrabold uppercase text-violet-800">
                  Decisiones: {displayNumber(mesa.adminReview.appliedDecisionIds.length)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {experimentalReviewedSchedule.skippedDecisions.length ? (
          <p className="mt-3 text-sm font-bold text-slate-700">
            Decisiones saltadas: {experimentalReviewedSchedule.skippedDecisions.slice(0, 4).map((decision) => `${decision.decisionId}:${decision.reasonSkipped}`).join(', ')}
          </p>
        ) : null}
        {adminReviewDrafts.length ? (
          <section className="mt-3 rounded-md border border-violet-100 bg-white p-3" aria-label="Borradores revisados experimentales preparados">
            <h5 className="text-sm font-extrabold uppercase text-violet-950">Borradores preparados</h5>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {adminReviewDrafts.slice(-4).map((draft) => (
                <div key={draft.draftId} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-extrabold text-slate-950">{draft.draftId}</p>
                  <p className="text-sm font-bold text-slate-600">
                    {draft.status} / oficial: {draft.isOfficial ? 'si' : 'no'} / mesas {displayNumber(draft.schedule?.length)}
                  </p>
                  {promotionValidationByDraftId[draft.draftId]?.valid ? (
                    <button
                      type="button"
                      className="btn-secondary mt-2"
                      disabled={!canEditWorkspace}
                      onClick={() => requestDraftPromotion(draft)}
                    >
                      Promover borrador
                    </button>
                  ) : (
                    <p className="mt-2 text-xs font-extrabold uppercase text-amber-800">
                      No elegible para promocion
                    </p>
                  )}
                  {pendingPromotionDraftId === draft.draftId ? (
                    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2" role="group" aria-label={`Confirmar promocion ${draft.draftId}`}>
                      <p className="text-sm font-bold text-amber-950">
                        Esto crea una copia promovida experimental; no reemplaza el cronograma oficial.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className="btn-primary" onClick={confirmDraftPromotion}>
                          Confirmar promocion
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => setPendingPromotionDraftId('')}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {verifiedAdminReviewPromotions.length ? (
          <section className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3" aria-label="Promociones experimentales preparadas">
            <h5 className="text-sm font-extrabold uppercase text-emerald-950">Copias promovidas experimentales</h5>
            <p className="mt-1 text-sm font-bold text-emerald-900">
              Son candidatas no oficiales. No reemplazan ni publican el cronograma oficial.
            </p>
            <p className="mt-1 text-xs font-extrabold uppercase text-slate-600">
              Verificadas: {displayNumber(promotionIntegrityCounts.VERIFIED)} / alteradas: {displayNumber(promotionIntegrityCounts.MISMATCH)} / legacy: {displayNumber(promotionIntegrityCounts.LEGACY_UNVERIFIED)} / errores: {displayNumber(promotionIntegrityCounts.VERIFY_ERROR)}
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {verifiedAdminReviewPromotions.slice(-4).map((promotion) => (
                <div key={promotion.promotionId} className={`rounded-md border bg-white px-3 py-2 ${promotion.integrityStatus === 'MISMATCH' ? 'border-red-400' : 'border-emerald-200'}`}>
                  <p className="font-extrabold text-slate-950">{promotion.promotionId}</p>
                  <p className="text-sm font-bold text-slate-600">
                    {promotion.status} / revision {displayNumber(promotion.revisionNumber ?? 1)} / oficial: {promotion.isOfficial ? 'si' : 'no'} / mesas {displayNumber(promotion.schedule?.length)}
                  </p>
                  <p className={`mt-1 text-xs font-extrabold uppercase ${promotion.integrityStatus === 'VERIFIED' ? 'text-emerald-800' : promotion.integrityStatus === 'MISMATCH' ? 'text-red-800' : 'text-amber-800'}`}>
                    Integridad: {promotion.integrityStatus}
                  </p>
                  <p className="mt-1 text-xs font-extrabold uppercase text-emerald-900">
                    Sello: {promotion.integrity?.hash ? promotion.integrity.hash.slice(0, 12) : 'no disponible (registro anterior)'}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    Workflow: {promotion.integrity?.workflowVersion ?? 'legacy'}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    Administrador: {promotion.adminActor?.displayName ?? 'ADMIN_REVIEW_USER_UNAVAILABLE'}
                    {promotion.adminActor?.role ? ` / ${promotion.adminActor.role}` : ''}
                  </p>
                  {promotion.warnings?.includes('ADMIN_ACTOR_UNAVAILABLE') || !promotion.adminActor ? (
                    <p className="mt-1 text-xs font-extrabold uppercase text-amber-800">
                      Advertencia: identidad administrativa no disponible.
                    </p>
                  ) : null}
                  {promotion.integrityStatus === 'MISMATCH' ? (
                    <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2" role="alert">
                      <p className="text-sm font-extrabold text-red-900">
                        Promocion alterada: no es candidata a una aprobacion futura.
                      </p>
                      <p className="mt-1 text-xs font-bold text-red-800">
                        Diferencias: {renderList(promotion.integrityVerification?.mismatchFields)}
                      </p>
                    </div>
                  ) : null}
                  {promotion.integrityStatus === 'LEGACY_UNVERIFIED' ? (
                    <p className="mt-1 text-xs font-extrabold uppercase text-amber-800">
                      Registro legacy sin sello verificable.
                    </p>
                  ) : null}
                  {promotion.integrityStatus === 'VERIFY_ERROR' ? (
                    <p className="mt-1 text-xs font-extrabold uppercase text-red-800">
                      No se pudo verificar: {renderList(promotion.integrityVerification?.warnings)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {verifiedAdminReviewPromotions.length ? (
          <section className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3" aria-label="Elegibilidad para aprobacion futura">
            <h5 className="text-sm font-extrabold uppercase text-sky-950">Elegibilidad para aprobacion futura</h5>
            <p className="mt-1 text-sm font-bold text-sky-900">
              Esto todavia no aprueba ni reemplaza el cronograma oficial.
            </p>
            <p className="mt-1 text-xs font-extrabold uppercase text-slate-600">
              Elegibles: {displayNumber(approvalEligibility.eligiblePromotions.length)} / bloqueadas: {displayNumber(approvalEligibility.blockedPromotions.length)} / superadas: {displayNumber(approvalEligibility.supersededPromotions.length)}
            </p>
            {approvalEligibility.eligiblePromotions.length ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {approvalEligibility.eligiblePromotions.map((promotion) => (
                  <div key={promotion.promotionId} className="rounded-md border border-emerald-200 bg-white px-3 py-2">
                    <p className="text-xs font-extrabold uppercase text-emerald-800">Promocion elegible actual</p>
                    <p className="font-extrabold text-slate-950">{promotion.promotionId}</p>
                    <p className="text-sm font-bold text-slate-600">
                      Borrador {promotion.draftId} / revision {displayNumber(promotion.revisionNumber)}
                    </p>
                    {activeApprovalRequestByPromotion[promotion.promotionId] ? (
                      <p className="mt-2 text-xs font-extrabold uppercase text-sky-800">
                        Solicitud activa: {activeApprovalRequestByPromotion[promotion.promotionId].status}
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary mt-2"
                        disabled={!canEditWorkspace}
                        onClick={() => requestApproval(promotion)}
                      >
                        Solicitar aprobacion
                      </button>
                    )}
                    {pendingApprovalPromotionId === promotion.promotionId ? (
                      <div className="mt-2 rounded-md border border-sky-300 bg-sky-50 p-2" role="group" aria-label={`Confirmar solicitud ${promotion.promotionId}`}>
                        <p className="text-sm font-bold text-sky-950">
                          Esto no convierte el cronograma en oficial.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" className="btn-primary" onClick={confirmApprovalRequest}>
                            Confirmar solicitud
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setPendingApprovalPromotionId('')}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {approvalEligibility.blockedPromotions.length ? (
              <div className="mt-3">
                <p className="text-xs font-extrabold uppercase text-red-800">Promociones bloqueadas</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {approvalEligibility.blockedPromotions.slice(0, 6).map((entry, index) => (
                    <div key={entry.promotionId || `blocked-${index}`} className="rounded-md border border-red-200 bg-white px-3 py-2">
                      <p className="font-extrabold text-slate-950">{entry.promotionId || 'PROMOTION_ID_MISSING'}</p>
                      <p className="mt-1 text-xs font-bold text-red-800">{renderList(entry.reasons)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {approvalEligibility.supersededPromotions.length ? (
              <div className="mt-3">
                <p className="text-xs font-extrabold uppercase text-amber-800">Promociones superadas</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {approvalEligibility.supersededPromotions.slice(0, 6).map((entry) => (
                    <div key={entry.promotionId} className="rounded-md border border-amber-200 bg-white px-3 py-2">
                      <p className="font-extrabold text-slate-950">{entry.promotionId}</p>
                      <p className="mt-1 text-xs font-bold text-amber-800">
                        {entry.reason} / reemplazada por {entry.supersededByPromotionId || 'revision ambigua'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {adminReviewApprovalRequests.length ? (
              <div className="mt-3" role="region" aria-label="Solicitudes de aprobacion administrativa">
                <p className="text-xs font-extrabold uppercase text-sky-800">Solicitudes creadas</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {adminReviewApprovalRequests.slice(-6).map((request) => (
                    <div key={request.requestId} className="rounded-md border border-sky-200 bg-white px-3 py-2">
                      <p className="font-extrabold text-slate-950">{request.requestId}</p>
                      <p className="text-sm font-bold text-slate-600">
                        {request.status} / revision {displayNumber(request.revisionNumber)} / oficial: {request.isOfficial ? 'si' : 'no'}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-600">
                        Promocion: {request.promotionId}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
        {adminReviewApprovalRequests.length ? (
          <section className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-3" aria-label="Elegibilidad para segunda aprobacion">
            <h5 className="text-sm font-extrabold uppercase text-indigo-950">Elegibilidad para segunda aprobacion</h5>
            <p className="mt-1 text-sm font-bold text-indigo-900">
              Esto todavia no aprueba ni reemplaza el cronograma oficial.
            </p>
            <p className="mt-1 text-xs font-extrabold uppercase text-slate-600">
              Elegibles: {displayNumber(secondApprovalEligibility.eligibleRequests.length)} / bloqueadas: {displayNumber(secondApprovalEligibility.blockedRequests.length)}
            </p>
            {secondApprovalEligibility.eligibleRequests.length ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {secondApprovalEligibility.eligibleRequests.map((request) => (
                  <div key={request.requestId} className="rounded-md border border-emerald-200 bg-white px-3 py-2">
                    <p className="text-xs font-extrabold uppercase text-emerald-800">Solicitud elegible</p>
                    <p className="font-extrabold text-slate-950">{request.requestId}</p>
                    <p className="text-sm font-bold text-slate-600">
                      Promocion {request.promotionId} / revision {displayNumber(request.revisionNumber)}
                    </p>
                    {secondApprovalByRequest[request.requestId] ? (
                      <p className="mt-2 text-xs font-extrabold uppercase text-indigo-800">
                        Segunda aprobacion registrada: {secondApprovalByRequest[request.requestId].status}
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary mt-2"
                        disabled={!canEditWorkspace}
                        onClick={() => requestSecondApproval(request)}
                      >
                        Registrar segunda aprobacion
                      </button>
                    )}
                    {pendingSecondApprovalRequestId === request.requestId ? (
                      <div className="mt-2 rounded-md border border-indigo-300 bg-indigo-50 p-2" role="group" aria-label={`Confirmar segunda aprobacion ${request.requestId}`}>
                        <p className="text-sm font-bold text-indigo-950">
                          Esto no convierte el cronograma en oficial.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" className="btn-primary" onClick={confirmSecondApproval}>
                            Confirmar segunda aprobacion
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => setPendingSecondApprovalRequestId('')}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {secondApprovalEligibility.blockedRequests.length ? (
              <div className="mt-3">
                <p className="text-xs font-extrabold uppercase text-red-800">Solicitudes bloqueadas</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {secondApprovalEligibility.blockedRequests.slice(0, 6).map((entry, index) => (
                    <div key={entry.requestId || `second-blocked-${index}`} className="rounded-md border border-red-200 bg-white px-3 py-2">
                      <p className="font-extrabold text-slate-950">{entry.requestId || 'REQUEST_ID_MISSING'}</p>
                      <p className="mt-1 text-xs font-bold text-red-800">{renderList(entry.reasons)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {adminReviewSecondApprovals.length ? (
              <div className="mt-3" role="region" aria-label="Segundas aprobaciones registradas">
                <p className="text-xs font-extrabold uppercase text-indigo-800">Segundas aprobaciones</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {adminReviewSecondApprovals.slice(-6).map((approval) => (
                    <div key={approval.secondApprovalId} className="rounded-md border border-indigo-200 bg-white px-3 py-2">
                      <p className="font-extrabold text-slate-950">{approval.secondApprovalId}</p>
                      <p className="text-sm font-bold text-slate-600">
                        {approval.status} / revision {displayNumber(approval.revisionNumber)} / oficial: {approval.isOfficial ? 'si' : 'no'}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-600">Request: {approval.requestId}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
        <section
          className={`mt-3 rounded-md border p-3 ${
            finalReadiness.ready
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-red-300 bg-red-50'
          }`}
          aria-label="Readiness final experimental"
        >
          <h5 className={`text-sm font-extrabold uppercase ${finalReadiness.ready ? 'text-emerald-950' : 'text-red-950'}`}>
            Readiness final experimental
          </h5>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {finalReadiness.ready ? 'Listo para futura oficializacion.' : 'Bloqueado hasta resolver las validaciones pendientes.'}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-700">
            Esto todavia no oficializa ni reemplaza el cronograma.
          </p>
          <p className="mt-2 text-xs font-extrabold uppercase text-slate-600">
            Promociones elegibles: {displayNumber(finalReadiness.diagnostics.eligiblePromotions)} / bloqueos: {displayNumber(finalReadiness.diagnostics.blockedReasons)} / reglas duras: {displayNumber(finalReadiness.diagnostics.hardRuleViolations)}
          </p>
          {finalReadiness.finalCandidate ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-white px-3 py-2" role="region" aria-label="Candidato final experimental">
              <p className="text-xs font-extrabold uppercase text-emerald-800">Candidato final experimental</p>
              <p className="font-extrabold text-slate-950">{finalReadiness.finalCandidate.candidateId}</p>
              <p className="text-sm font-bold text-slate-600">
                {finalReadiness.finalCandidate.status} / revision {displayNumber(finalReadiness.finalCandidate.revisionNumber)} / oficial: no
              </p>
              <p className="mt-1 text-xs font-bold text-slate-600">
                Mesas: {displayNumber(finalReadiness.finalCandidate.diagnostics.scheduleCount)} / tribunales completos: {displayNumber(finalReadiness.finalCandidate.diagnostics.completeTribunals)}
              </p>
            </div>
          ) : null}
          {finalReadiness.blockedReasons.length ? (
            <div className="mt-3" role="region" aria-label="Bloqueos de readiness final">
              <p className="text-xs font-extrabold uppercase text-red-800">Bloqueos</p>
              <p className="mt-1 break-words text-xs font-bold text-red-900">{renderList(finalReadiness.blockedReasons)}</p>
            </div>
          ) : null}
          {finalReadiness.warnings.length ? (
            <p className="mt-2 break-words text-xs font-bold text-amber-900">Warnings: {renderList(finalReadiness.warnings)}</p>
          ) : null}
        </section>
        <section
          className={`mt-3 rounded-md border p-3 ${
            officializationPlanResult.canPrepareOfficialization
              ? 'border-cyan-300 bg-cyan-50'
              : 'border-slate-300 bg-slate-50'
          }`}
          aria-label="Plan de oficializacion segura"
        >
          <h5 className="text-sm font-extrabold uppercase text-slate-950">Plan de oficializacion segura</h5>
          <p className="mt-1 text-sm font-bold text-slate-800">
            {officializationPlanResult.canPrepareOfficialization
              ? 'Plan tecnico preparado para validacion servidor-side.'
              : 'El plan no puede prepararse con el estado actual.'}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-700">Este plan no oficializa el cronograma.</p>
          <p className="mt-2 text-xs font-extrabold uppercase text-slate-600">
            Cronograma actual: {displayNumber(officializationPlanResult.diagnostics.currentOfficialScheduleCount)} mesas / propuesta: {displayNumber(officializationPlanResult.diagnostics.proposedScheduleCount)} mesas
          </p>
          {officializationPlanResult.officializationPlan ? (
            <div className="mt-3 rounded-md border border-cyan-200 bg-white px-3 py-2" role="region" aria-label="Plan tecnico de oficializacion">
              <p className="font-extrabold text-slate-950">{officializationPlanResult.officializationPlan.planId}</p>
              <p className="mt-1 break-all text-xs font-bold text-slate-600">
                Fingerprint actual: {officializationPlanResult.officializationPlan.currentOfficialScheduleFingerprint}
              </p>
              <p className="mt-1 break-all text-xs font-bold text-slate-600">
                Fingerprint propuesto: {officializationPlanResult.officializationPlan.proposedOfficialScheduleFingerprint}
              </p>
              <p className="mt-2 text-xs font-extrabold uppercase text-cyan-900">Checks servidor requeridos</p>
              <p className="mt-1 text-xs font-bold text-slate-700">
                {renderList(officializationPlanResult.officializationPlan.requiredServerChecks)}
              </p>
            </div>
          ) : null}
          {officializationPlanResult.blockedReasons.length ? (
            <div className="mt-3" role="region" aria-label="Bloqueos del plan de oficializacion">
              <p className="text-xs font-extrabold uppercase text-red-800">Bloqueos</p>
              <p className="mt-1 break-words text-xs font-bold text-red-900">
                {renderList(officializationPlanResult.blockedReasons)}
              </p>
            </div>
          ) : null}
          {officializationPlanResult.warnings.length ? (
            <p className="mt-2 break-words text-xs font-bold text-amber-900">
              Warnings: {renderList(officializationPlanResult.warnings)}
            </p>
          ) : null}
        </section>
      </section>

      <section className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3" aria-label="Contrato de persistencia adminReviewDecisions">
        <h4 className="text-sm font-extrabold uppercase text-slate-800">Persistencia</h4>
        <p className="mt-1 text-sm font-bold text-slate-700">
          Decisiones, borradores y promociones se guardan en colecciones separadas del workspaceSnapshot por autosave. No se escribe en tablas nuevas.
        </p>
        <p className="mt-1 text-xs font-extrabold uppercase text-slate-500">
          alumnos: {displayNumber(alumnos.length)} / docentes: {displayNumber(docentes.length)} / decisiones: {displayNumber(adminReviewDecisions.length)}
        </p>
      </section>
    </section>
  )
}

export default ExamAdminReviewWorkflowPanel
