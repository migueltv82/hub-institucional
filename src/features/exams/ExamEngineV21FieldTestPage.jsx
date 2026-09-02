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
  createConfirmedFinalReviewRows,
  createConfirmedTeacherReviewRows,
  createDefaultExamCallConfigForm,
  downloadRowsAsCsv,
  parseReviewRowsFile,
  resolveFinalUiState,
  runDraftScheduleStep,
  runFinalReviewStep,
  runReviewedScheduleStep,
  summarizeReviewedSchedule,
  summarizeTeacherReviewStatus,
  validateExamCallConfigForm,
} from './examEngineV21FieldTestService.js'

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
  { id: 'review', title: 'Envío a docentes', description: 'Publicá el precronograma completo para que lo confirmen.' },
  { id: 'final', title: 'Cronograma final', description: 'Revisá las confirmaciones y publicá la versión definitiva.' },
]

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
  canPublishOfficialSchedule = true,
  dataReady = true,
  institutionId = '',
  onGoToUploads,
  onPublishOfficialSchedule,
  onResetExamProcess,
  uploadedFiles = {},
  workspaceKey = 'main',
  workspaceSnapshot = {},
}) {
  const [configTouched, setConfigTouched] = useState(false)
  const [configForm, setConfigForm] = useState(() => createDefaultExamCallConfigForm(workspaceSnapshot))
  const [includeCurrentCronogramaAssignments, setIncludeCurrentCronogramaAssignments] = useState(false)
  const [uiState, setUiState] = useState(FIELD_TEST_UI_STATES.CONFIGURING_CALL)
  const [engineData, setEngineData] = useState(null)
  const [draftResult, setDraftResult] = useState(null)
  const [draftExport, setDraftExport] = useState(null)
  const [reviewedResult, setReviewedResult] = useState(null)
  const [reviewedSummary, setReviewedSummary] = useState(null)
  const [tribunalResult, setTribunalResult] = useState(null)
  const [tribunalReviewExport, setTribunalReviewExport] = useState(null)
  const [finalResult, setFinalResult] = useState(null)
  const [finalSummary, setFinalSummary] = useState(null)
  const [officialExport, setOfficialExport] = useState(null)
  const [finalAlertsExport, setFinalAlertsExport] = useState(null)
  const [dataWarnings, setDataWarnings] = useState([])
  const [isBusy, setIsBusy] = useState(false)
  const [teacherReviewStatus, setTeacherReviewStatus] = useState(null)
  const [isFetchingTeacherReviewStatus, setIsFetchingTeacherReviewStatus] = useState(false)

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
    setConfigForm(createDefaultExamCallConfigForm(workspaceSnapshot))
  }

  const currentStepId = resolveCurrentStepId(uiState)
  const currentStepIndex = WIZARD_STEPS.findIndex((step) => step.id === currentStepId)

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

  const viewStepIndex = WIZARD_STEPS.findIndex((step) => step.id === viewStepId)
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

  async function refreshTeacherReviewStatus() {
    if (!institutionId) {
      toast.error('Falta la institucion activa.')
      return
    }

    if (!tribunalReviewExport?.rows?.length) {
      toast.error('Primero publica el precronograma para revision docente.')
      return
    }

    try {
      setIsFetchingTeacherReviewStatus(true)
      const result = await fetchExamTeacherAssignmentsForReview({
        institutionId,
        workspaceKey,
        examTableIds: tribunalReviewExport.rows.map((row) => row.draftMesaId),
      })

      if (!result.success) {
        toast.error(result.error)
        return
      }

      setTeacherReviewStatus(summarizeTeacherReviewStatus(tribunalReviewExport.rows, result.rows))
    } catch (error) {
      toast.error(error.message)
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
      const result = runDraftScheduleStep({
        docentes: data.docentes,
        materias: data.materias,
        examCallConfig,
        generatedAt: new Date().toISOString(),
      })

      if (!result.draftExport.rows.length) {
        const firstReason = result.draftResult.excluded?.[0]?.message ||
          result.draftResult.errors?.[0]?.message ||
          'No hay materias que cumplan la configuracion seleccionada.'
        throw new Error(`No se pudo generar el precronograma: ${firstReason}`)
      }

      const reviewed = runReviewedScheduleStep({
        originalDraftSchedule: result.draftResult.draftSchedule,
        reviewedRows: createConfirmedTeacherReviewRows(result.draftExport.rows),
        docentes: data.docentes,
        examCallConfig,
      })

      clearDownstreamFromDraft()
      setEngineData({ ...data, examCallConfig })
      setDraftResult(result.draftResult)
      setDraftExport(result.draftExport)
      setReviewedResult(reviewed.reviewedResult)
      setReviewedSummary(reviewed.summary)
      setUiState(FIELD_TEST_UI_STATES.REVIEWED_IMPORTED)
      setDataWarnings(buildDataWarnings({
        docentes: data.docentes,
        materias: data.materias,
        draftResult: result.draftResult,
      }))
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

      clearDownstreamFromDraft()
      setEngineData({ ...data, examCallConfig })
      setDraftResult(null)
      setDraftExport(null)
      setUiState(FIELD_TEST_UI_STATES.REVIEWED_IMPORTED)
      setDataWarnings([])
      toast.success('Listo, ahora cargá cada mesa especial a mano.')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setIsBusy(false)
    }
  }

  function applyBulkCombination(nextReviewedSchedule) {
    const previousCount = reviewedResult?.reviewedSchedule?.length ?? 0
    const combinedCount = previousCount - nextReviewedSchedule.length

    setReviewedResult((current) => ({ ...current, reviewedSchedule: nextReviewedSchedule }))
    setReviewedSummary(summarizeReviewedSchedule(nextReviewedSchedule))
    tribunalSession.resetSelections()
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

      setTribunalResult(finalizedTribunalResult)
      setTribunalReviewExport(tribunalReviewExportResult)
      setFinalResult(null)
      setFinalSummary(null)
      setOfficialExport(null)
      setFinalAlertsExport(null)
      setUiState(FIELD_TEST_UI_STATES.WAITING_FINAL_REVIEW_IMPORT)
      setDataWarnings(buildDataWarnings({
        docentes: engineData.docentes,
        materias: engineData.materias,
        draftResult,
        tribunalResult: finalizedTribunalResult,
      }))
      toast.success('Precronograma completo listo para enviar a los docentes.')
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

    setFinalResult(result.finalResult)
    setFinalSummary(result.summary)
    setOfficialExport(result.officialExport)
    setFinalAlertsExport(result.finalAlertsExport)
    setUiState(resolveFinalUiState(result.summary))
    setDataWarnings(buildDataWarnings({
      docentes: engineData.docentes,
      materias: engineData.materias,
      draftResult,
      tribunalResult,
      finalResult: result.finalResult,
    }))
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

  function publishOfficialSchedule() {
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
      const result = onPublishOfficialSchedule(publishedCronograma, {
        finalResult,
        officialExport,
      })

      if (result === false) return
    }

    toast.success(`Cronograma publicado en portales: ${publishedCronograma.length} mesas.`)
  }

  function resetLocalRunState() {
    setEngineData(null)
    setDraftResult(null)
    setDraftExport(null)
    clearDownstreamFromDraft()
    setDataWarnings([])
    setUiState(FIELD_TEST_UI_STATES.CONFIGURING_CALL)
  }

  async function resetRun() {
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
            <p className="soft-title">Paso 2 - Armado de mesas</p>
            <h3 className="mt-2 flex min-w-0 flex-col items-start gap-2 text-3xl font-extrabold leading-tight text-slate-950 sm:flex-row sm:items-center md:text-4xl">
              <Sparkles className="h-8 w-8 shrink-0 text-teal-700" />
              Cronograma de mesas de examen
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
              Configura el llamado, arma el precronograma con sus agrupaciones y vocales,
              envialo a los docentes y aplica solamente los cambios solicitados antes de publicar.
            </p>
          </div>
          <button
            className="btn-secondary w-full shrink-0 sm:w-auto"
            disabled={isBusy || !canPublishOfficialSchedule}
            onClick={resetRun}
            type="button"
          >
            <RefreshCcw className="h-4 w-4" />
            Reiniciar proceso
          </button>
        </div>
      </motion.section>

      <section className="soft-card">
        <p className="soft-title">Recorrido del proceso</p>
        <div className="mt-4">
          <WorkflowStepper
            activeIndex={viewStepIndex}
            currentIndex={currentStepIndex}
            steps={WIZARD_STEPS}
            onSelectStep={setViewStepId}
          />
        </div>
      </section>

      {viewingPastStep && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm font-bold text-sky-900">
            Estás revisando &ldquo;{WIZARD_STEPS[viewStepIndex]?.title}&rdquo;, un paso ya completado. El proceso sigue donde lo dejaste.
          </p>
          <button className="btn-secondary" type="button" onClick={() => setViewStepId(currentStepId)}>
            Volver al paso actual
          </button>
        </div>
      )}

      <WarningList warnings={dataWarnings} />

      {viewStepId === 'config' && (
        <>
          <OperatorHandbook />

          <DataReadinessBanner
            missingItems={dataReady ? [] : missingDataItems}
            onGoToUploads={onGoToUploads}
          />

          <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <StatPill label="Docentes" value={sourceCounts.docentes} />
            <StatPill label="Horarios" value={sourceCounts.horarios} />
            <StatPill label="Docente-materia" value={sourceCounts.docenteMateria} />
            <StatPill label="Materias" value={sourceCounts.materias} />
            <StatPill label="Cronograma actual" value={sourceCounts.cronograma} />
          </section>

          <ExamCallConfigForm
            careerOptions={careerOptions}
            disabled={isBusy || !dataReady}
            form={configForm}
            onChange={updateConfigField}
            onGenerateDraft={configForm.tipoPeriodo === 'ESPECIAL' ? continueToManualBuild : generateDraft}
            validation={validation}
          />

          <label className="flex min-w-0 items-start gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm font-bold text-slate-800 sm:items-center">
            <input
              className="h-4 w-4 accent-teal-700"
              checked={includeCurrentCronogramaAssignments}
              disabled={isBusy}
              type="checkbox"
              onChange={(event) => setIncludeCurrentCronogramaAssignments(event.target.checked)}
            />
            Considerar el cronograma actual como carga previa de docentes
          </label>
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
                        <th className="px-3 py-2">Código</th>
                        <th className="px-3 py-2">Materia</th>
                        <th className="px-3 py-2">Motivo</th>
                        <th className="px-3 py-2">Cómo resolverlo</th>
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
                    onExport={exportTeacherReviewPdf}
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
            rows={tribunalReviewExport?.rows ?? []}
            onExport={() => exportRows(tribunalReviewExport, 'precronograma_completo_para_docentes.csv')}
            onExportPdf={exportCompletePrecronogramaPdf}
            onPublishForReview={publishForTeacherReview}
          />

          <TeacherConfirmationStatusPanel
            counts={teacherReviewStatus?.counts ?? { confirmed: 0, pending: 0, objected: 0, total: 0 }}
            isLoading={isFetchingTeacherReviewStatus}
            mesas={teacherReviewStatus?.mesas ?? []}
            onRefresh={refreshTeacherReviewStatus}
          />

          <details className="soft-card">
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
          </details>
        </>
      )}

      {viewStepId === 'final' && (
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
