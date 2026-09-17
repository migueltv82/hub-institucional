import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { CheckCircle2, FileUp, RefreshCcw, ShieldAlert, Sparkles } from 'lucide-react'
import DataReadinessBanner from '../../components/ui/DataReadinessBanner.jsx'
import OperatorHandbook from '../../components/ui/OperatorHandbook.jsx'
import WorkflowStepper from '../../components/ui/WorkflowStepper.jsx'
import { exportGeneratedTribunalsForReview } from '../../utils/examEngine/index.js'
import BulkCombineMesasPreview from './components/BulkCombineMesasPreview.jsx'
import DraftScheduleTable from './components/DraftScheduleTable.jsx'
import ExamCallConfigForm from './components/ExamCallConfigForm.jsx'
import FinalTribunalSummary from './components/FinalTribunalSummary.jsx'
import InteractiveVocalSelectionPanel from './components/InteractiveVocalSelectionPanel.jsx'
import ManualMesaBuilderForm from './components/ManualMesaBuilderForm.jsx'
import TeacherConfirmationStatusPanel from './components/TeacherConfirmationStatusPanel.jsx'
import TribunalReviewTable from './components/TribunalReviewTable.jsx'
import { useInteractiveTribunalSession } from './hooks/useInteractiveTribunalSession.js'
import { downloadDraftScheduleReviewPdf } from './draftSchedulePdfExport.js'
import {
  confirmExamAssignmentsAsAdmin,
  fetchExamTeacherAssignmentsForReview,
  publishExamTeacherAssignmentsForReview,
  resetExamProcessForWorkspace,
} from '../../services/examTeacherAssignments.js'
import {
  FIELD_TEST_UI_STATES,
  buildDataWarnings,
  buildUnresolvedTitularRows,
  buildExamCallConfigFromForm,
  buildExamEngineV21DataFromWorkspace,
  buildPublishedCronogramaFromFinalTribunals,
  createConfirmedFinalReviewRowsFromTeacherStatus,
  createConfirmedFinalReviewRows,
  createDefaultExamCallConfigForm,
  downloadRowsAsCsv,
  parseReviewRowsFile,
  resolveFinalUiState,
  runExamEngineV21DraftWorkflow,
  runFinalReviewStep,
  summarizeReviewedSchedule,
  summarizeTeacherReviewStatus,
  validateExamCallConfigForm,
} from './examEngineV21FieldTestService.js'
import { runExamEngineV21DraftWorkflowInWorker } from '../../workers/examEngineV21WorkerClient.js'

// Un solo stepper que SI controla que seccion se ve, con solo 4 pasos:
// Configurar llamado -> Armar mesas -> Envio a docentes -> Cronograma final.
// "Armar mesas" cubre TODO lo que pasa mientras uiState es REVIEWED_IMPORTED
// (precronograma, combinar, completar tribunales para regular; el formulario
// manual entero para especial), sin sub-pasos propios: para regular se
// muestra todo junto (precronograma colapsado + combinar + tribunales), para
// especial se muestra solo el formulario manual. La rama se decide por
// engineData.examCallConfig.tipoPeriodo, fijado al entrar a este paso.
const WIZARD_STEPS = [
  { id: 'config', title: 'Configurar llamado', description: 'Fechas, tipo de llamado y alcance del periodo de mesas.' },
  { id: 'armar', title: 'Armar mesas', description: 'Precronograma, combinar y completar tribunales (o cargarlas a mano si es especial).' },
  { id: 'review', title: 'EnvÃ­o a docentes', description: 'PublicÃ¡ el precronograma completo para que lo confirmen.' },
  { id: 'final', title: 'Cronograma final', description: 'RevisÃ¡ las confirmaciones y publicÃ¡ la versiÃ³n definitiva.' },
]

const DRAFT_WORKER_SYNC_FALLBACK_CODES = new Set([
  'WORKER_NOT_SUPPORTED',
  'WORKER_RUNTIME_ERROR',
])

async function runDraftWorkflowInBackground(payload) {
  try {
    return await runExamEngineV21DraftWorkflowInWorker(payload)
  } catch (error) {
    if (DRAFT_WORKER_SYNC_FALLBACK_CODES.has(error?.code)) {
      return runExamEngineV21DraftWorkflow(payload)
    }

    throw error
  }
}

function resolveCurrentStepId(uiState) {
  if (uiState === FIELD_TEST_UI_STATES.CONFIGURING_CALL) return 'config'
  if (uiState === FIELD_TEST_UI_STATES.REVIEWED_IMPORTED) return 'armar'
  if (uiState === FIELD_TEST_UI_STATES.WAITING_FINAL_REVIEW_IMPORT) return 'review'
  return 'final'
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function StatPill({ label, value }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p>
    </div>
  )
}

function WarningList({ warnings = [] }) {
  if (!warnings.length) return null

  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-amber-900">
        <ShieldAlert className="h-4 w-4" />
        Advertencias
      </p>
      <ul className="mt-3 space-y-2">
        {warnings.map((warning) => (
          <li key={warning} className="text-sm font-bold text-amber-900">{warning}</li>
        ))}
      </ul>
    </section>
  )
}

function ImportAction({
  disabled = false,
  label,
  onAutoConfirm,
  onFile,
  rowsCount = 0,
  title,
}) {
  return (
    <section className="soft-card">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="soft-title">{title}</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">{rowsCount}</p>
          <p className="mt-1 text-sm font-bold text-slate-600">filas disponibles</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <label className={`btn-secondary ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
            <FileUp className="h-4 w-4" />
            Importar archivo
            <input
              className="sr-only"
              accept=".csv,.xlsx,.json"
              disabled={disabled}
              type="file"
              onChange={(event) => {
                onFile(event.target.files?.[0] ?? null)
                event.target.value = ''
              }}
            />
          </label>
          <button
            className="btn-secondary"
            disabled={disabled || !rowsCount}
            onClick={onAutoConfirm}
            type="button"
          >
            <CheckCircle2 className="h-4 w-4" />
            {label}
          </button>
        </div>
      </div>
    </section>
  )
}

function ExamEngineV21FieldTestPage({
  mode = 'operational',
  canPublishOfficialSchedule = true,
  dataReady = true,
  institutionId = '',
  onGoToUploads,
  onExamEngineStateChange,
  onPublishOfficialSchedule,
  onResetExamProcess,
  uploadedFiles = {},
  workspaceKey = 'main',
  workspaceSnapshot = {},
}) {
  const isPreview = mode === 'preview'
  const wizardSteps = isPreview ? [
    WIZARD_STEPS[0],
    { id: 'armar', title: 'Armar mesas', description: 'Revisar fechas, combinar mesas y completar tribunales.' },
    { id: 'review', title: 'Resultado', description: 'Revisar la previsualizacion sin publicar.' },
  ] : WIZARD_STEPS
  const persistedState = !isPreview && workspaceSnapshot?.examEngineV21State?.version === 1
    ? workspaceSnapshot.examEngineV21State
    : null
  const [previewErrors, setPreviewErrors] = useState([])
  const [configTouched, setConfigTouched] = useState(false)
  const [configForm, setConfigForm] = useState(() => persistedState?.configForm ?? createDefaultExamCallConfigForm(workspaceSnapshot, { requireExplicitDates: isPreview }))
  const [includeCurrentCronogramaAssignments, setIncludeCurrentCronogramaAssignments] = useState(Boolean(persistedState?.includeCurrentCronogramaAssignments))
  const [uiState, setUiState] = useState(persistedState?.uiState ?? FIELD_TEST_UI_STATES.CONFIGURING_CALL)
  const [engineData, setEngineData] = useState(persistedState?.engineData ?? null)
  const [draftResult, setDraftResult] = useState(persistedState?.draftResult ?? null)
  const [draftExport, setDraftExport] = useState(persistedState?.draftExport ?? null)
  const [reviewedResult, setReviewedResult] = useState(persistedState?.reviewedResult ?? null)
  const [reviewedSummary, setReviewedSummary] = useState(persistedState?.reviewedSummary ?? null)
  const [tribunalResult, setTribunalResult] = useState(persistedState?.tribunalResult ?? null)
  const [tribunalReviewExport, setTribunalReviewExport] = useState(persistedState?.tribunalReviewExport ?? null)
  const [finalResult, setFinalResult] = useState(persistedState?.finalResult ?? null)
  const [finalSummary, setFinalSummary] = useState(persistedState?.finalSummary ?? null)
  const [officialExport, setOfficialExport] = useState(persistedState?.officialExport ?? null)
  const [finalAlertsExport, setFinalAlertsExport] = useState(persistedState?.finalAlertsExport ?? null)
  const [dataWarnings, setDataWarnings] = useState(persistedState?.dataWarnings ?? [])
  const [isBusy, setIsBusy] = useState(false)
  const [teacherReviewStatus, setTeacherReviewStatus] = useState(persistedState?.teacherReviewStatus ?? null)
  const [isFetchingTeacherReviewStatus, setIsFetchingTeacherReviewStatus] = useState(false)

  function persistExamEngineState(overrides = {}) {
    if (isPreview || !onExamEngineStateChange) return true

    return onExamEngineStateChange({
      version: 1,
      updatedAt: new Date().toISOString(),
      configForm,
      includeCurrentCronogramaAssignments,
      uiState,
      engineData,
      draftResult,
      draftExport,
      reviewedResult,
      reviewedSummary,
      tribunalResult,
      tribunalReviewExport,
      finalResult,
      finalSummary,
      officialExport,
      finalAlertsExport,
      dataWarnings,
      teacherReviewStatus,
      ...overrides,
    })
  }

  // Adjusting state during render (React-recommended pattern) instead of an
  // effect: when the workspace's exam period changes and the user hasn't
  // touched the form yet, reset the form to defaults for the new period.
  const [previousExamPeriod, setPreviousExamPeriod] = useState(() => [
    workspaceSnapshot.fechaInicio,
    workspaceSnapshot.fechaFin,
  ])

  if (
    !configTouched &&
    (previousExamPeriod[0] !== workspaceSnapshot.fechaInicio ||
      previousExamPeriod[1] !== workspaceSnapshot.fechaFin)
  ) {
    setPreviousExamPeriod([workspaceSnapshot.fechaInicio, workspaceSnapshot.fechaFin])
    setConfigForm(createDefaultExamCallConfigForm(workspaceSnapshot, { requireExplicitDates: isPreview }))
  }

  const currentStepId = resolveCurrentStepId(uiState)
  const currentStepIndex = wizardSteps.findIndex((step) => step.id === currentStepId)

  // Same render-time-adjustment pattern as previousExamPeriod above: the
  // viewed step follows real progress by default, but a manual click on an
  // already-completed step (WorkflowStepper's onSelectStep) can point it
  // elsewhere without losing progress. The moment progress moves forward
  // again, this snaps viewStepId back to the new current step.
  const [viewStepId, setViewStepId] = useState(currentStepId)
  const [lastCurrentStepId, setLastCurrentStepId] = useState(currentStepId)

  if (currentStepId !== lastCurrentStepId) {
    setLastCurrentStepId(currentStepId)
    setViewStepId(currentStepId)
  }

  const viewStepIndex = wizardSteps.findIndex((step) => step.id === viewStepId)
  const isEspecial = engineData?.examCallConfig?.tipoPeriodo === 'ESPECIAL'

  const missingDataItems = useMemo(() => {
    const items = []
    if (!uploadedFiles.horarios) items.push('horarios docentes')
    if (!uploadedFiles.planes) items.push('plan de estudios')
    if (!uploadedFiles.correlatividades) items.push('correlatividades')
    return items
  }, [uploadedFiles])

  const validation = useMemo(
    () => validateExamCallConfigForm(configForm),
    [configForm],
  )

  const sourceCounts = useMemo(() => ({
    docentes: asArray(workspaceSnapshot.docentes).length,
    horarios: asArray(workspaceSnapshot.horariosDocentes).length,
    docenteMateria: asArray(workspaceSnapshot.docenteMateria).length,
    materias: asArray(workspaceSnapshot.planesEstudio).length,
    cronograma: asArray(workspaceSnapshot.cronograma).length,
  }), [workspaceSnapshot])

  const careerOptions = useMemo(() => {
    const careers = new Map()
    asArray(workspaceSnapshot.planesEstudio).forEach((row) => {
      const name = String(row.carrera ?? row.carrera_nombre ?? '').trim()
      if (!name) return
      const years = careers.get(name) ?? new Set()
      const year = Number(row.anio ?? row.anio_cursada)
      if (Number.isFinite(year)) years.add(year)
      careers.set(name, years)
    })
    return [...careers.entries()]
      .map(([name, years]) => ({ name, years: [...years].sort((left, right) => left - right) }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [workspaceSnapshot.planesEstudio])

  const unresolvedTitularRows = useMemo(
    () => buildUnresolvedTitularRows(engineData?.materias ?? [], draftResult),
    [draftResult, engineData],
  )

  const tribunalSession = useInteractiveTribunalSession({
    reviewedSchedule: reviewedResult?.reviewedSchedule ?? [],
    docentes: engineData?.docentes ?? [],
    teacherAssignments: engineData?.teacherAssignments ?? [],
    examCallConfig: engineData?.examCallConfig ?? {},
    correlatividades: engineData?.correlatividades ?? [],
  })

  function updateConfigField(key, value) {
    if (isPreview) resetLocalRunState()
    setConfigTouched(true)
    setConfigForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function clearDownstreamFromDraft() {
    setReviewedResult(null)
    setReviewedSummary(null)
    setTribunalResult(null)
    setTribunalReviewExport(null)
    setFinalResult(null)
    setFinalSummary(null)
    setOfficialExport(null)
    setFinalAlertsExport(null)
    setTeacherReviewStatus(null)
    tribunalSession.resetSelections()
  }

  async function refreshTeacherReviewStatus({ silent = false } = {}) {
    if (isPreview) return null
    if (!institutionId) {
      if (!silent) toast.error('Falta la institucion activa.')
      return null
    }

    if (!tribunalReviewExport?.rows?.length) {
      if (!silent) toast.error('Primero publica el precronograma para revision docente.')
      return null
    }

    try {
      setIsFetchingTeacherReviewStatus(true)
      const result = await fetchExamTeacherAssignmentsForReview({
        institutionId,
        workspaceKey,
        examTableIds: tribunalReviewExport.rows.map((row) => row.draftMesaId),
      })

      if (!result.success) {
        if (!silent) toast.error(result.error)
        return null
      }

      const nextTeacherReviewStatus = summarizeTeacherReviewStatus(tribunalReviewExport.rows, result.rows)
      setTeacherReviewStatus(nextTeacherReviewStatus)
      void persistExamEngineState({ teacherReviewStatus: nextTeacherReviewStatus })
      return nextTeacherReviewStatus
    } catch (error) {
      if (!silent) toast.error(error.message)
      return null
    } finally {
      setIsFetchingTeacherReviewStatus(false)
    }
  }

  function exportRows(exportPayload, filename) {
    if (!exportPayload?.rows?.length) {
      toast.error('No hay filas para exportar.')
      return
    }

    const result = downloadRowsAsCsv({
      rows: exportPayload.rows,
      columns: exportPayload.columns,
      filename,
    })
    toast.success(`Exportadas ${result.rows} filas.`)
  }

  async function exportTeacherReviewPdf() {
    if (!draftExport?.rows?.length) {
      toast.error('No hay filas para exportar.')
      return
    }

    try {
      setIsBusy(true)
      const result = await downloadDraftScheduleReviewPdf({
        rows: draftExport.rows,
        filename: 'precronograma_revision_docente.pdf',
        periodLabel: `${configForm.fechaInicio} al ${configForm.fechaFin}`,
      })
      toast.success(`PDF generado: ${result.rows} mesas en ${result.careers} carreras.`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function exportCompletePrecronogramaPdf() {
    if (!tribunalReviewExport?.rows?.length) {
      toast.error('Primero guarda las agrupaciones y los vocales.')
      return
    }

    try {
      setIsBusy(true)
      const result = await downloadDraftScheduleReviewPdf({
        rows: tribunalReviewExport.rows,
        filename: 'precronograma_completo_para_docentes.pdf',
        periodLabel: `${configForm.fechaInicio} al ${configForm.fechaFin}`,
      })
      toast.success(`PDF para docentes generado: ${result.rows} mesas.`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function publishForTeacherReview() {
    if (isPreview) return
    if (!institutionId) {
      toast.error('Falta la institucion activa.')
      return
    }

    if (!tribunalResult?.generatedTribunals?.length) {
      toast.error('Primero guarda las agrupaciones y los vocales.')
      return
    }

    try {
      setIsBusy(true)
      const result = await publishExamTeacherAssignmentsForReview({
        institutionId,
        workspaceKey,
        mesas: tribunalResult.generatedTribunals,
        docentes: engineData?.docentes ?? [],
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      const skipped = (result.skippedNoEmail?.length ?? 0) + (result.skippedNoAccount?.length ?? 0)
      toast.success(
        skipped
          ? `Publicado para ${result.published} docentes. ${skipped} sin cuenta de portal todavia.`
          : `Precronograma publicado para ${result.published} docentes.`,
      )
      await refreshTeacherReviewStatus()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  async function generateDraft() {
    if (!dataReady || isBusy) return
    if (!validation.ok) {
      toast.error(validation.errors[0])
      return
    }

    try {
      setIsBusy(true)
      const examCallConfig = buildExamCallConfigFromForm(configForm)
      const generatedAt = new Date().toISOString()
      setPreviewErrors([])
      const workflow = await runDraftWorkflowInBackground({
        workspaceSnapshot,
        examCallConfig,
        includeCurrentCronogramaAssignments,
        isPreview,
        generatedAt,
      })
      const data = workflow.data
      const result = workflow.draft
      const reviewed = workflow.reviewed

      if (isPreview && workflow.previewErrors?.length) {
        setPreviewErrors(workflow.previewErrors)
        return
      }

      if (!result.draftExport.rows.length) {
        const firstReason = result.draftResult.excluded?.[0]?.message ||
          result.draftResult.errors?.[0]?.message ||
          'No hay materias que cumplan la configuracion seleccionada.'
        throw new Error(`No se pudo generar el precronograma: ${firstReason}`)
      }

      const nextEngineData = { ...data, examCallConfig }
      const nextWarnings = workflow.dataWarnings

      clearDownstreamFromDraft()
      setEngineData(nextEngineData)
      setDraftResult(result.draftResult)
      setDraftExport(result.draftExport)
      setReviewedResult(reviewed.reviewedResult)
      setReviewedSummary(reviewed.summary)
      setUiState(FIELD_TEST_UI_STATES.REVIEWED_IMPORTED)
      setDataWarnings(nextWarnings)
      await persistExamEngineState({
        configForm,
        includeCurrentCronogramaAssignments,
        uiState: FIELD_TEST_UI_STATES.REVIEWED_IMPORTED,
        engineData: nextEngineData,
        draftResult: result.draftResult,
        draftExport: result.draftExport,
        reviewedResult: reviewed.reviewedResult,
        reviewedSummary: reviewed.summary,
        tribunalResult: null,
        tribunalReviewExport: null,
        finalResult: null,
        finalSummary: null,
        officialExport: null,
        finalAlertsExport: null,
        dataWarnings: nextWarnings,
        teacherReviewStatus: null,
      })
      toast.success('Precronograma generado. Ya puedes combinar mesas y asignar vocales.')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  // Camino especial: se salta generateDraftExamSchedule por completo (no hay
  // alcance automatico, son pocas mesas sueltas). Solo se adaptan
  // docentes/materias para alimentar los datalists del formulario manual.
  function continueToManualBuild() {
    if (isPreview) return
    if (!validation.ok) {
      toast.error(validation.errors[0])
      return
    }

    try {
      setIsBusy(true)
      const examCallConfig = buildExamCallConfigFromForm(configForm)
      const data = buildExamEngineV21DataFromWorkspace({
        workspaceSnapshot,
        examCallConfig,
        includeCurrentCronogramaAssignments,
      })

      const nextEngineData = { ...data, examCallConfig }
      clearDownstreamFromDraft()
      setEngineData(nextEngineData)
      setDraftResult(null)
      setDraftExport(null)
      setUiState(FIELD_TEST_UI_STATES.REVIEWED_IMPORTED)
      setDataWarnings([])
      void persistExamEngineState({
        configForm,
        includeCurrentCronogramaAssignments,
        uiState: FIELD_TEST_UI_STATES.REVIEWED_IMPORTED,
        engineData: nextEngineData,
        draftResult: null,
        draftExport: null,
        reviewedResult: null,
        reviewedSummary: null,
        tribunalResult: null,
        tribunalReviewExport: null,
        finalResult: null,
        finalSummary: null,
        officialExport: null,
        finalAlertsExport: null,
        dataWarnings: [],
        teacherReviewStatus: null,
      })
      toast.success('Listo, ahora cargÃ¡ cada mesa especial a mano.')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  function applyBulkCombination(nextReviewedSchedule) {
    const previousCount = reviewedResult?.reviewedSchedule?.length ?? 0
    const combinedCount = previousCount - nextReviewedSchedule.length

    const nextReviewedResult = { ...reviewedResult, reviewedSchedule: nextReviewedSchedule }
    const nextReviewedSummary = summarizeReviewedSchedule(nextReviewedSchedule)
    setReviewedResult(nextReviewedResult)
    setReviewedSummary(nextReviewedSummary)
    tribunalSession.resetSelections()
    void persistExamEngineState({
      reviewedResult: nextReviewedResult,
      reviewedSummary: nextReviewedSummary,
      tribunalResult: null,
      tribunalReviewExport: null,
      finalResult: null,
      finalSummary: null,
      officialExport: null,
      finalAlertsExport: null,
      teacherReviewStatus: null,
    })
    toast.success(
      combinedCount > 0
        ? `Se combinaron ${combinedCount} ${combinedCount === 1 ? 'par' : 'pares'} de mesas.`
        : 'No habia combinaciones para aplicar.',
    )
  }

  function confirmTribunalSelection(finalizedTribunalResult) {
    if (!engineData) {
      toast.error('Primero genera el precronograma.')
      return
    }

    if (!finalizedTribunalResult.generatedTribunals.length) {
      toast.error('No hay mesas listas para armar tribunal.')
      return
    }

    try {
      setIsBusy(true)
      const tribunalReviewExportResult = exportGeneratedTribunalsForReview(finalizedTribunalResult, {
        generatedAt: new Date().toISOString(),
      })
      const nextWarnings = buildDataWarnings({
        docentes: engineData.docentes,
        materias: engineData.materias,
        draftResult,
        tribunalResult: finalizedTribunalResult,
      })

      setTribunalResult(finalizedTribunalResult)
      setTribunalReviewExport(tribunalReviewExportResult)
      setFinalResult(null)
      setFinalSummary(null)
      setOfficialExport(null)
      setFinalAlertsExport(null)
      setUiState(FIELD_TEST_UI_STATES.WAITING_FINAL_REVIEW_IMPORT)
      setDataWarnings(nextWarnings)
      void persistExamEngineState({
        uiState: FIELD_TEST_UI_STATES.WAITING_FINAL_REVIEW_IMPORT,
        tribunalResult: finalizedTribunalResult,
        tribunalReviewExport: tribunalReviewExportResult,
        finalResult: null,
        finalSummary: null,
        officialExport: null,
        finalAlertsExport: null,
        dataWarnings: nextWarnings,
        teacherReviewStatus: null,
      })
      toast.success(isPreview ? 'Previsualizacion completa lista para revisar.' : 'Precronograma completo listo para enviar a los docentes.')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  // Wrapper fino: una mesa armada a mano tiene exactamente el shape plano
  // que exportGeneratedTribunalsForReview/publishExamTeacherAssignmentsForReview
  // ya leen de una mesa generada automaticamente, asi que reusa
  // confirmTribunalSelection sin cambios.
  function confirmManualMesas(mesas) {
    confirmTribunalSelection({ generatedTribunals: mesas })
  }

  function importFinalReviewRows(finalReviewedRows) {
    if (!tribunalResult || !engineData) {
      toast.error('Primero genera tribunales.')
      return
    }

    const result = runFinalReviewStep({
      generatedTribunals: tribunalResult.generatedTribunals,
      finalReviewedRows,
      docentes: engineData.docentes,
      teacherAssignments: engineData.teacherAssignments,
      examCallConfig: engineData.examCallConfig,
      tribunalRules: {},
      generatedAt: new Date().toISOString(),
    })

    const nextUiState = resolveFinalUiState(result.summary)
    const nextWarnings = buildDataWarnings({
      docentes: engineData.docentes,
      materias: engineData.materias,
      draftResult,
      tribunalResult,
      finalResult: result.finalResult,
    })

    setFinalResult(result.finalResult)
    setFinalSummary(result.summary)
    setOfficialExport(result.officialExport)
    setFinalAlertsExport(result.finalAlertsExport)
    setUiState(nextUiState)
    setDataWarnings(nextWarnings)
    void persistExamEngineState({
      uiState: nextUiState,
      finalResult: result.finalResult,
      finalSummary: result.summary,
      officialExport: result.officialExport,
      finalAlertsExport: result.finalAlertsExport,
      dataWarnings: nextWarnings,
    })
    toast.success('Revision final importada y revalidada.')
  }

  async function importFinalReviewFile(file) {
    if (!file) return

    try {
      setIsBusy(true)
      const rows = await parseReviewRowsFile(file)
      importFinalReviewRows(rows)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  function autoConfirmFinalReview() {
    importFinalReviewRows(createConfirmedFinalReviewRows(tribunalReviewExport?.rows ?? []))
  }

  async function confirmReadyMesasFromTeacherReview() {
    if (!tribunalReviewExport?.rows?.length) {
      toast.error('Primero publica el precronograma para revision docente.')
      return
    }

    try {
      setIsBusy(true)
      const nextTeacherReviewStatus = await refreshTeacherReviewStatus({ silent: true })
      if (!nextTeacherReviewStatus) {
        toast.error('No se pudo leer el estado docente actualizado.')
        return
      }

      const confirmedRows = createConfirmedFinalReviewRowsFromTeacherStatus(
        tribunalReviewExport.rows,
        nextTeacherReviewStatus,
      )

      if (!confirmedRows.length) {
        toast.error('No hay mesas con todas sus confirmaciones docentes.')
        return
      }

      importFinalReviewRows(confirmedRows)
    } finally {
      setIsBusy(false)
    }
  }

  function getTeacherReviewEntriesForMesa(examTableId) {
    const mesa = teacherReviewStatus?.mesas?.find((item) => item.draftMesaId === examTableId)
    return [mesa?.titular, mesa?.vocal1, mesa?.vocal2]
      .filter((entry) => entry?.teacherId && entry.status !== 'confirmed')
  }

  async function confirmAssignmentsAsAdmin(entries = []) {
    if (!canPublishOfficialSchedule) {
      toast.error('Tu rol actual no permite confirmar mesas como admin.')
      return
    }

    const targets = entries.filter((entry) => entry?.examTableId && entry?.teacherId)
    if (!targets.length) {
      toast.error('No hay confirmaciones pendientes para esa mesa.')
      return
    }

    try {
      setIsBusy(true)
      const result = await confirmExamAssignmentsAsAdmin({
        institutionId,
        workspaceKey,
        entries: targets,
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      toast.success(targets.length === 1 ? 'Confirmacion admin registrada.' : 'Mesa confirmada por admin.')
      await refreshTeacherReviewStatus({ silent: true })
    } finally {
      setIsBusy(false)
    }
  }

  function confirmAssignmentAsAdmin(examTableId, teacherId) {
    void confirmAssignmentsAsAdmin([{ examTableId, teacherId }])
  }

  function confirmMesaAsAdmin(examTableId) {
    void confirmAssignmentsAsAdmin(getTeacherReviewEntriesForMesa(examTableId))
  }

  async function publishOfficialSchedule() {
    if (isPreview) return
    if (!finalResult?.finalTribunals?.length) {
      toast.error('Primero confirma la revision final.')
      return
    }

    const publishedCronograma = buildPublishedCronogramaFromFinalTribunals(finalResult.finalTribunals, {
      generatedAt: new Date().toISOString(),
    })

    if (!publishedCronograma.length) {
      toast.error('No hay mesas finales confirmadas para publicar.')
      return
    }

    if (onPublishOfficialSchedule) {
      try {
        setIsBusy(true)
        const result = await onPublishOfficialSchedule(publishedCronograma, {
          finalResult,
          officialExport,
        })

        if (result === false) return
      } finally {
        setIsBusy(false)
      }
    }

    toast.success(`Cronograma publicado en portales: ${publishedCronograma.length} mesas.`)
  }

  function resetLocalRunState() {
    setPreviewErrors([])
    setEngineData(null)
    setDraftResult(null)
    setDraftExport(null)
    clearDownstreamFromDraft()
    setDataWarnings([])
    setUiState(FIELD_TEST_UI_STATES.CONFIGURING_CALL)
    if (!isPreview && onExamEngineStateChange) {
      void onExamEngineStateChange(null)
    }
  }

  async function resetRun() {
    if (isPreview) {
      resetLocalRunState()
      return
    }
    if (!canPublishOfficialSchedule) {
      toast.error('Tu rol actual no permite reiniciar el proceso de mesas.')
      return
    }

    const confirmed = typeof window === 'undefined' || window.confirm(
      'Esto va a borrar el cronograma publicado, las mesas enviadas a docentes, sus confirmaciones u objeciones y las inscripciones a mesas de examen. Los padrones, materias, notas y asistencias no se tocan. Continuar?',
    )

    if (!confirmed) return

    try {
      setIsBusy(true)
      const resetResult = await resetExamProcessForWorkspace({ institutionId, workspaceKey })

      if (!resetResult.success) {
        toast.error(resetResult.error)
        return
      }

      if (onResetExamProcess) {
        const result = onResetExamProcess({ summary: resetResult.summary })
        if (result === false) return
      }

      resetLocalRunState()
      toast.success(
        resetResult.skippedRemote
          ? 'Proceso reiniciado en esta sesion.'
          : 'Proceso de mesas reiniciado. Ya podes probar desde cero.',
      )
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  const viewingPastStep = viewStepId !== currentStepId

  return (
    <div className="min-w-0 space-y-6">
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="exam-hero rise-in min-w-0 rounded-md border p-4 md:p-6"
        initial={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="soft-title">{isPreview ? 'Vista previa' : 'Paso 2 - Armado de mesas'}</p>
            <h3 className="mt-2 flex min-w-0 flex-col items-start gap-2 text-3xl font-extrabold leading-tight text-slate-950 sm:flex-row sm:items-center md:text-4xl">
              <Sparkles className="h-8 w-8 shrink-0 text-teal-700" />
              Cronograma de mesas de examen
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              {isPreview ? 'Elegi las fechas y el alcance para probar el armado de mesas con los datos de tu institucion.' : 'Configura el llamado, arma el precronograma con sus agrupaciones y vocales, envialo a los docentes y aplica solamente los cambios solicitados antes de publicar.'}
            </p>
          </div>
          <button
            className="btn-secondary w-full shrink-0 sm:w-auto"
            disabled={isBusy || (!isPreview && !canPublishOfficialSchedule)}
            onClick={resetRun}
            type="button"
          >
            <RefreshCcw className="h-4 w-4" />
            {isPreview ? 'Reiniciar previsualizacion' : 'Reiniciar proceso'}
          </button>
        </div>
      </motion.section>

      <section className="soft-card">
        <p className="soft-title">Recorrido del proceso</p>
        <div className="mt-4">
          <WorkflowStepper
            activeIndex={viewStepIndex}
            currentIndex={currentStepIndex}
            steps={wizardSteps}
            onSelectStep={setViewStepId}
          />
        </div>
      </section>

      {viewingPastStep && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm font-bold text-sky-900">
            EstÃ¡s revisando &ldquo;{wizardSteps[viewStepIndex]?.title}&rdquo;, un paso ya completado. El proceso sigue donde lo dejaste.
          </p>
          <button className="btn-secondary" type="button" onClick={() => setViewStepId(currentStepId)}>
            Volver al paso actual
          </button>
        </div>
      )}

      <WarningList warnings={dataWarnings} />

      {previewErrors.length > 0 && <section role="alert" className="soft-card border border-rose-200 bg-rose-50">
        <h3 className="font-extrabold text-rose-900">Hay datos que impiden generar la previsualizacion ({previewErrors.length})</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-rose-900">{previewErrors.map((issue, index) => <li key={`${issue.code}:${issue.entityId}:${index}`}>{issue.entityId ? `${issue.entityId}: ` : ''}{issue.message}</li>)}</ul>
      </section>}

      {viewStepId === 'config' && (
        <>
          {!isPreview && <OperatorHandbook />}

          {!isPreview && <DataReadinessBanner
            missingItems={dataReady ? [] : missingDataItems}
            onGoToUploads={onGoToUploads}
          />}

          <section className={`grid min-w-0 gap-3 md:grid-cols-2 ${isPreview ? 'xl:grid-cols-4' : 'xl:grid-cols-3 2xl:grid-cols-5'}`}>
            <StatPill label="Docentes" value={sourceCounts.docentes} />
            <StatPill label="Horarios" value={sourceCounts.horarios} />
            <StatPill label="Docente-materia" value={sourceCounts.docenteMateria} />
            <StatPill label="Materias" value={sourceCounts.materias} />
            {!isPreview && <StatPill label="Cronograma actual" value={sourceCounts.cronograma} />}
          </section>

          <ExamCallConfigForm
            previewOnly={isPreview}
            careerOptions={careerOptions}
            disabled={isBusy || !dataReady}
            form={configForm}
            onChange={updateConfigField}
            onGenerateDraft={configForm.tipoPeriodo === 'ESPECIAL' ? continueToManualBuild : generateDraft}
            validation={validation}
          />

          {!isPreview && <label className="flex min-w-0 items-start gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm font-bold text-slate-800 sm:items-center">
            <input
              className="h-4 w-4 accent-teal-700"
              checked={includeCurrentCronogramaAssignments}
              disabled={isBusy}
              type="checkbox"
              onChange={(event) => setIncludeCurrentCronogramaAssignments(event.target.checked)}
            />
            Considerar el cronograma actual como carga previa de docentes
          </label>}
        </>
      )}

      {viewStepId === 'armar' && (
        isEspecial ? (
          <ManualMesaBuilderForm
            docentes={engineData?.docentes ?? []}
            isBusy={isBusy}
            materias={engineData?.materias ?? []}
            onConfirm={confirmManualMesas}
          />
        ) : (
          <>
            {engineData && (
              <section className="grid min-w-0 gap-3 md:grid-cols-3">
                <StatPill label="Docentes adaptados" value={engineData.docentes.length} />
                <StatPill label="Materias adaptadas" value={engineData.materias.length} />
                <StatPill label="Asignaciones previas" value={engineData.teacherAssignments.length} />
              </section>
            )}

            {unresolvedTitularRows.length > 0 && (
              <details className="soft-card" open>
                <summary className="cursor-pointer text-base font-extrabold text-rose-900">
                  Materias sin titular ({unresolvedTitularRows.length})
                </summary>
                <p className="mt-2 text-sm text-slate-700">
                  Estas materias no encontraron una titularidad activa con el mismo materia_id en docente_materia ni una coincidencia de respaldo en Horarios de profesores.
                </p>
                <button
                  className="secondary-button mt-3"
                  type="button"
                  onClick={() => downloadRowsAsCsv({
                    rows: unresolvedTitularRows,
                    filename: 'materias_sin_titular.csv',
                  })}
                >
                  Descargar lista completa
                </button>
                <div className="mt-4 max-h-[32rem] overflow-auto rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="sticky top-0 bg-slate-100 text-slate-800">
                      <tr>
                        <th className="px-3 py-2">Carrera</th>
                        <th className="px-3 py-2">CÃ³digo</th>
                        <th className="px-3 py-2">Materia</th>
                        <th className="px-3 py-2">Motivo</th>
                        <th className="px-3 py-2">CÃ³mo resolverlo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {unresolvedTitularRows.map((row) => (
                        <tr key={`${row.carrera}::${row.codigo}`}>
                          <td className="px-3 py-2 font-semibold text-slate-800">{row.carrera}</td>
                          <td className="px-3 py-2 font-mono text-slate-700">{row.codigo}</td>
                          <td className="px-3 py-2 text-slate-700">{row.materia}</td>
                          <td className="px-3 py-2 text-rose-800">{row.motivo}</td>
                          <td className="min-w-72 px-3 py-2 text-slate-700">{row.solucion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {draftExport?.rows?.length > 0 && (
              <details>
                <summary className="cursor-pointer text-base font-extrabold text-slate-800">
                  Ver precronograma detallado
                </summary>
                <div className="mt-3">
                  <DraftScheduleTable
                    rows={draftExport?.rows ?? []}
                    onExport={isPreview ? () => exportRows(draftExport, 'previsualizacion_mesas.csv') : exportTeacherReviewPdf}
                  />
                </div>
              </details>
            )}

            {reviewedSummary && (
              <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatPill label="Total mesas" value={reviewedSummary.totalMesas} />
                <StatPill label="Listas" value={reviewedSummary.listasParaTribunal} />
                <StatPill label="Excluidas" value={reviewedSummary.excluidas} />
                <StatPill label="Pendientes" value={reviewedSummary.pendientesRevision} />
              </section>
            )}

            <BulkCombineMesasPreview
              correlatividades={engineData?.correlatividades ?? []}
              docentes={engineData?.docentes ?? []}
              examCallConfig={engineData?.examCallConfig ?? {}}
              isBusy={isBusy}
              reviewedSchedule={reviewedResult?.reviewedSchedule ?? []}
              onApply={applyBulkCombination}
            />

            <InteractiveVocalSelectionPanel
              confirmLabel={isPreview ? 'Ver resultado de la previsualizacion' : undefined}
              isBusy={isBusy}
              session={tribunalSession}
              onConfirm={confirmTribunalSelection}
            />
          </>
        )
      )}

      {viewStepId === 'review' && (
        <>
          <TribunalReviewTable
            previewOnly={isPreview}
            rows={tribunalReviewExport?.rows ?? []}
            onExport={() => exportRows(tribunalReviewExport, isPreview ? 'previsualizacion_tribunales.csv' : 'precronograma_completo_para_docentes.csv')}
            onExportPdf={exportCompletePrecronogramaPdf}
            onPublishForReview={publishForTeacherReview}
          />

          {!isPreview && <TeacherConfirmationStatusPanel
            counts={teacherReviewStatus?.counts ?? { confirmed: 0, pending: 0, objected: 0, total: 0 }}
            canConfirmAsAdmin={canPublishOfficialSchedule}
            isLoading={isFetchingTeacherReviewStatus || isBusy}
            mesas={teacherReviewStatus?.mesas ?? []}
            onConfirmAssignmentAsAdmin={confirmAssignmentAsAdmin}
            onConfirmMesaAsAdmin={confirmMesaAsAdmin}
            onConfirmReadyMesas={confirmReadyMesasFromTeacherReview}
            onRefresh={refreshTeacherReviewStatus}
          />}

          {!isPreview && <details className="soft-card">
            <summary className="cursor-pointer text-base font-extrabold text-slate-800">
              Importar cambios manualmente (docentes sin cuenta de portal)
            </summary>
            <p className="mt-2 text-sm text-slate-600">
              Solo hace falta para docentes que todavia no tienen cuenta en el portal y no pueden confirmar desde ahi.
            </p>
            <div className="mt-3">
              <ImportAction
                disabled={isBusy || !tribunalReviewExport?.rows?.length}
                label="Confirmar sin cambios"
                rowsCount={tribunalReviewExport?.rows?.length ?? 0}
                title="Cambios solicitados por docentes"
                onAutoConfirm={autoConfirmFinalReview}
                onFile={importFinalReviewFile}
              />
            </div>
          </details>}
        </>
      )}

      {!isPreview && viewStepId === 'final' && (
        <FinalTribunalSummary
          alertRows={finalAlertsExport?.rows ?? []}
          canPublishOfficial={canPublishOfficialSchedule}
          finalRows={officialExport?.rows ?? []}
          summary={finalSummary}
          onExportAlerts={() => exportRows(finalAlertsExport, 'alertas_finales.csv')}
          onExportOfficial={() => exportRows(officialExport, 'cronograma_final_oficial.csv')}
          onPublishOfficial={publishOfficialSchedule}
        />
      )}
    </div>
  )
}

export default ExamEngineV21FieldTestPage
