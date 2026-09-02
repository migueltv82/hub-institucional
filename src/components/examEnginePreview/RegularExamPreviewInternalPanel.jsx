import { useEffect, useMemo, useRef, useState } from 'react'
import { useRegularExamPreviewEngine } from '../../hooks/useRegularExamPreviewEngine'
import {
  createExamEnginePreviewWorkerRun,
  isExamEnginePreviewWorkerSupported,
} from '../../workers/examEnginePreviewWorkerClient.js'
import {
  buildObservationSummary,
  buildPreviewInputFromProps,
  buildPreviewReadiness,
  buildScenarioMetricFromContract,
  buildWorkspaceSnapshotFromPreviewProps,
  getCompletionRate,
  getPreviewRowsWithManualReview,
  isRegularExamPreviewInternalEnabled,
  PRIORITY_DAYS,
} from './regularExamPreviewInternalPanelUtils.js'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function displayNumber(value) {
  return Number(value ?? 0).toLocaleString('es-AR')
}

function displayPercent(value) {
  return `${((Number(value) || 0) * 100).toFixed(2)}%`
}

function displayMs(value) {
  if (value === null || value === undefined || value === '') return '-'
  return `${Number(value || 0).toFixed(2)} ms`
}

function getEfficiencyLabel(completionRate = 0) {
  if (completionRate >= 0.85) return 'EFICIENTE'
  if (completionRate >= 0.75) return 'PARCIALMENTE EFICIENTE'
  return 'CRITICO'
}

function getSummaryMetric(summary = {}, key, fallback = 0) {
  return summary[key] ?? fallback
}

function countRowsWithOneVocal(rows = []) {
  return asArray(rows).filter((row) => row.reason === 'TRIBUNAL_UN_VOCAL').length
}

function countCompleteRows(rows = []) {
  return asArray(rows).filter((row) => asArray(row.vocales).length >= 2 && row.titular?.id).length
}

function getStageSummary(preview = {}, key = '') {
  return preview?.summary?.stageSummaries?.[key] ?? {}
}

function getTeacherLimitSummary(preview = {}, uiDto = {}) {
  const vocalSummary = getStageSummary(preview, 'vocales')
  if ('docentesEnLimite' in vocalSummary || 'docentesExcedidos' in vocalSummary) {
    return {
      docentesEnLimite: vocalSummary.docentesEnLimite ?? 0,
      docentesExcedidos: vocalSummary.docentesExcedidos ?? 0,
    }
  }

  const teacherRows = asArray(uiDto?.uiTeacherSummary)
  return {
    docentesEnLimite: teacherRows.filter((row) => row.enLimite || row.atLimit || row.estadoCarga === 'EN_LIMITE').length,
    docentesExcedidos: teacherRows.filter((row) => row.excedido || row.exceeded || row.estadoCarga === 'EXCEDIDO').length,
  }
}

function getTribunalSummary({ preview = {}, rows = [] } = {}) {
  const tribunalSummary = getStageSummary(preview, 'tribunals')
  const tentativeDatesSummary = getStageSummary(preview, 'tentativeDates')

  return {
    mesasCompletas: tribunalSummary.mesasCompletas ?? countCompleteRows(rows),
    mesasConUnVocal: tribunalSummary.mesasConUnVocal ?? countRowsWithOneVocal(rows),
    mesasSinTribunal: tribunalSummary.mesasSinTribunal ?? asArray(rows).filter((row) => asArray(row.vocales).length === 0).length,
    mesasSinFecha: tentativeDatesSummary.mesasSinFecha ?? asArray(rows).filter((row) => !row.fecha && !row.displayDate).length,
  }
}

function displayDiagnosticValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-'
  if (value && typeof value === 'object') return JSON.stringify(value)
  if (value === true) return 'true'
  if (value === false) return 'false'
  return String(value ?? '') || '-'
}

function performanceNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function scheduleDeferred(callback) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: 100 })
    return { id, type: 'idle' }
  }

  const id = window.setTimeout(callback, 0)
  return { id, type: 'timeout' }
}

function cancelDeferred(handle) {
  if (!handle) return
  if (handle.type === 'idle' && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle.id)
    return
  }
  window.clearTimeout(handle.id)
}

function PreviewReadinessDiagnostics({ readiness }) {
  const diagnostics = readiness.diagnostics ?? {}
  const rows = [
    ['canRunPreview', diagnostics.canRunPreview],
    ['reasonDisabled', diagnostics.reasonDisabled],
    ['alumnos count', diagnostics.alumnosCount],
    ['docentes count', diagnostics.docentesCount],
    ['docenteMateria count', diagnostics.docenteMateriaCount],
    ['horariosDocentes count', diagnostics.horariosDocentesCount],
    ['planesEstudio count', diagnostics.planesEstudioCount],
    ['correlatividades count', diagnostics.correlatividadesCount],
    ['fechaInicio', diagnostics.fechaInicio],
    ['fechaFin', diagnostics.fechaFin],
    ['examType', diagnostics.examType],
    ['generationScope', diagnostics.generationScope],
    ['regularCallRanges keys', diagnostics.regularCallRangesKeys],
    ['selectedSpecialSubjectKeys count', diagnostics.selectedSpecialSubjectKeysCount],
  ]

  return (
    <section className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3" aria-label="Diagnostico de habilitacion del preview">
      <h4 className="text-sm font-extrabold uppercase text-amber-900">Diagnostico de habilitacion</h4>
      {!readiness.canRunPreview ? (
        <p className="mt-1 text-sm font-bold text-amber-800">
          No hay datos suficientes para ejecutar preview interno. reasonDisabled: {readiness.reasonDisabled}
        </p>
      ) : null}
      {readiness.warnings?.length ? (
        <p className="mt-1 text-sm font-bold text-amber-800">
          Warnings no bloqueantes: {readiness.warnings.join(', ')}
        </p>
      ) : null}
      <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md border border-amber-100 bg-white px-3 py-2">
            <dt className="text-xs font-extrabold uppercase text-slate-500">{label}</dt>
            <dd className="mt-1 break-words font-bold text-slate-800">{displayDiagnosticValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ReadOnlyActionBar({ actions }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Acciones bloqueadas del preview interno">
      <button type="button" className="btn-secondary" disabled onClick={() => actions.saveOfficialSchedule()}>
        Guardar oficial bloqueado
      </button>
      <button type="button" className="btn-secondary" disabled onClick={() => actions.publishSchedule()}>
        Publicar bloqueado
      </button>
      <button type="button" className="btn-secondary" disabled onClick={() => actions.replaceLegacyEngine()}>
        Reemplazo motor bloqueado
      </button>
    </div>
  )
}

function PreviewRunStatus({ status }) {
  const timings = status.timings ?? {}
  const timingRows = [
    ['armadoSnapshotMs', timings.armadoSnapshotMs],
    ['generatePreviewMs', timings.generatePreviewMs],
    ['enginePreviewMs', timings.enginePreviewMs],
    ['buildDtoMs', timings.buildDtoMs],
    ['validateDtoMs', timings.validateDtoMs],
    ['applyFiltersMs', timings.applyFiltersMs],
    ['procesarResultadosMs', timings.procesarResultadosMs],
    ['renderMs', timings.renderMs],
    ['workerTotalMs', timings.workerTotalMs],
    ['totalMs', timings.totalMs],
  ].filter(([, value]) => value !== undefined)

  if (!status.message && !timingRows.length) return null

  return (
    <section className="mt-4 rounded-md border border-sky-200 bg-white p-3" aria-label="Estado de ejecucion del preview interno">
      {status.message ? (
        <p className="text-sm font-extrabold text-sky-900">{status.message}</p>
      ) : null}
      {timingRows.length ? (
        <dl className="mt-3 grid gap-2 text-xs md:grid-cols-3 xl:grid-cols-4">
          {timingRows.map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="font-extrabold uppercase text-slate-500">{label}</dt>
              <dd className="mt-1 font-bold text-slate-800">{displayMs(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}

function getCauseCount(observations = {}, codes = []) {
  const wanted = new Set(codes)
  return asArray((observations ?? {}).causasPrincipales)
    .filter((cause) => wanted.has(cause.code))
    .reduce((total, cause) => total + Number(cause.count ?? 0), 0)
}

function buildBottleneckItems({ observations = {}, tribunalSummary = {}, teacherLimitSummary = {} } = {}) {
  return [
    {
      label: 'Disponibilidad de titulares',
      count: getCauseCount(observations, ['TITULAR_NO_DISPONIBLE']),
      text: 'Hay titulares que no coinciden con fechas disponibles.',
    },
    {
      label: 'Disponibilidad de vocales',
      count: getCauseCount(observations, ['VOCAL_NO_DISPONIBLE', 'POCOS_CANDIDATOS_VOCALES', 'REPARACION_SIN_CANDIDATOS_VALIDOS']),
      text: 'Faltan vocales disponibles o candidatos compatibles.',
    },
    {
      label: 'Superposicion docente',
      count: getCauseCount(observations, ['DOCENTE_SUPERPUESTO']),
      text: 'Un mismo docente queda requerido en mas de una mesa o rol.',
    },
    {
      label: 'Limite de vocalias',
      count: getCauseCount(observations, ['DOCENTE_ALCANZA_LIMITE_VOCALIAS']) || teacherLimitSummary.docentesEnLimite,
      text: 'La regla mitad mas uno limita nuevas vocalias.',
    },
    {
      label: 'Muchas mesas propias',
      count: getCauseCount(observations, ['TITULAR_MUCHAS_MESAS_PROPIAS']),
      text: 'Algunos titulares concentran muchas mesas propias.',
    },
    {
      label: 'Fechas/slots insuficientes',
      count: tribunalSummary.mesasSinFecha,
      text: 'El calendario actual no alcanza para ubicar todas las mesas.',
    },
  ].filter((item) => Number(item.count ?? 0) > 0)
}

function buildInterpretationItems({ completionRate, teacherLimitSummary = {}, tribunalSummary = {} } = {}) {
  return [
    completionRate < 0.8 ? 'No se recomienda usar como cronograma oficial.' : 'El preview supera 80%, pero sigue siendo solo una vista interna.',
    Number(teacherLimitSummary.docentesExcedidos ?? 0) === 0
      ? 'La regla mitad mas uno se respeta, pero limita la asignacion de vocales.'
      : 'Hay docentes excedidos: revisar la regla mitad mas uno antes de avanzar.',
    Number(tribunalSummary.mesasConUnVocal ?? 0) > 0
      ? 'Las mesas con un vocal requieren revision manual.'
      : '',
  ].filter(Boolean)
}

function TitularidadBlock({ observations }) {
  const titularidad = observations?.titularidad
  if (!titularidad) return null

  const items = [
    ['mesas con titular', titularidad.mesasConTitular],
    ['mesas sin titular real', titularidad.mesasSinTitularReal],
    ['materias no requeridas por falta de horario', titularidad.materiasSinHorarioNoRequeridas],
    ['materias con unico docente tomado como titular', titularidad.materiasConUnSoloDocenteAsignado],
    ['materias con multiples docentes', titularidad.materiasConMasDeUnDocenteAsignado],
    ['practicas profesionales detectadas', titularidad.practicasProfesionalesDetectadas],
  ]

  return (
    <section className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3" aria-label="Titularidad del preview interno">
      <h4 className="text-sm font-extrabold uppercase text-emerald-900">Titularidad</h4>
      <p className="mt-1 text-sm font-bold text-emerald-800">
        {displayNumber(titularidad.materiasSinHorarioNoRequeridas)} materias del plan no tienen horario asociado y no fueron requeridas para mesa.
      </p>
      <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-md border border-emerald-100 bg-white px-3 py-2">
            <dt className="text-xs font-extrabold uppercase text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-extrabold text-slate-950">{displayNumber(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function InstitutionalInterpretation({ completionRate, observations, teacherLimitSummary, tribunalSummary }) {
  const bottlenecks = buildBottleneckItems({ observations, teacherLimitSummary, tribunalSummary })
  const interpretations = buildInterpretationItems({ completionRate, teacherLimitSummary, tribunalSummary })
  const recommendations = [
    'Ampliar calendario y priorizar dias con mayor disponibilidad docente.',
    'Revisar titulares con muchas mesas propias.',
    'Revisar habilitacion y disponibilidad de vocales.',
    'Cargar rol docente/materia para diferenciar titular, reemplazo, suplente y codocente.',
    'Revisar disponibilidad docente antes de usar este resultado como base institucional.',
  ]

  return (
    <section className="mt-4 grid gap-3 xl:grid-cols-3" aria-label="Interpretacion institucional del preview">
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <h4 className="text-sm font-extrabold uppercase text-slate-800">Cuellos principales</h4>
        {bottlenecks.length ? (
          <ul className="mt-2 space-y-2 text-sm font-bold text-slate-700">
            {bottlenecks.map((item) => (
              <li key={item.label}>
                {item.label}: {displayNumber(item.count)}. {item.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm font-bold text-slate-600">Sin cuellos principales detectados en el resumen compacto.</p>
        )}
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <h4 className="text-sm font-extrabold uppercase text-slate-800">Interpretacion automatica</h4>
        <ul className="mt-2 space-y-2 text-sm font-bold text-slate-700">
          {interpretations.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <h4 className="text-sm font-extrabold uppercase text-slate-800">Recomendacion concreta</h4>
        <ul className="mt-2 space-y-2 text-sm font-bold text-slate-700">
          {recommendations.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </section>
  )
}

export function RegularExamPreviewInternalPanel(props) {
  const { env = import.meta.env } = props
  const enabled = isRegularExamPreviewInternalEnabled(env)
  const engine = useRegularExamPreviewEngine()
  const [scenarios, setScenarios] = useState([])
  const [observations, setObservations] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [isRunningPreview, setIsRunningPreview] = useState(false)
  const [runStatus, setRunStatus] = useState({ stage: 'idle', message: '', timings: null })
  const deferredHandlesRef = useRef([])
  const workerRunRef = useRef(null)
  const mountedRef = useRef(true)
  const snapshot = useMemo(() => buildWorkspaceSnapshotFromPreviewProps(props), [props])
  const readiness = useMemo(() => buildPreviewReadiness(snapshot), [snapshot])
  const canRunPreview = readiness.canRunPreview
  const summary = engine.uiDto?.uiSummary ?? {}
  const completionRate = getCompletionRate(summary)
  const rows = getPreviewRowsWithManualReview({
    filteredDto: engine.filteredDto,
  })
  const allRows = [...rows.planned, ...rows.unassigned]
  const teacherLimitSummary = getTeacherLimitSummary(engine.preview, engine.uiDto)
  const tribunalSummary = getTribunalSummary({ preview: engine.preview, rows: allRows })
  const hasPreview = engine.phase && engine.phase !== 'idle' && engine.phase !== 'loading'

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      deferredHandlesRef.current.forEach(cancelDeferred)
      deferredHandlesRef.current = []
      workerRunRef.current?.cancel()
      workerRunRef.current = null
    }
  }, [])

  if (!enabled) return null

  const schedulePreviewStep = (callback) => {
    const handle = scheduleDeferred(callback)
    deferredHandlesRef.current.push(handle)
  }

  const clearScheduledPreviewSteps = () => {
    deferredHandlesRef.current.forEach(cancelDeferred)
    deferredHandlesRef.current = []
  }

  const clearPreview = () => {
    clearScheduledPreviewSteps()
    workerRunRef.current?.cancel()
    workerRunRef.current = null
    setIsRunningPreview(false)
    setPreviewError('')
    setScenarios([])
    setObservations(null)
    setRunStatus({ stage: 'idle', message: '', timings: null })
    engine.actions.resetPreview()
  }

  const runPreview = () => {
    if (!canRunPreview || isRunningPreview) return
    if (!isExamEnginePreviewWorkerSupported()) {
      setPreviewError('El preview interno requiere Web Worker para no bloquear la pantalla.')
      setRunStatus({ stage: 'error', message: 'Web Worker no disponible', timings: null })
      return
    }

    clearScheduledPreviewSteps()
    workerRunRef.current?.cancel()
    workerRunRef.current = null
    setIsRunningPreview(true)
    setRunStatus({ stage: 'preparing', message: 'Preparando preview...', timings: null })
    setScenarios([])
    setObservations(null)
    setPreviewError('')
    engine.actions.resetPreview()

    const startedAt = performanceNow()
    const timings = {}

    schedulePreviewStep(() => {
      if (!mountedRef.current) return
      let input
      let previewSnapshot

      try {
        const buildInputStartedAt = performanceNow()
        ;({ input, snapshot: previewSnapshot } = buildPreviewInputFromProps(props))
        timings.armadoSnapshotMs = roundMs(performanceNow() - buildInputStartedAt)
      } catch (error) {
        if (!mountedRef.current) return
        setPreviewError(error instanceof Error ? error.message : 'Error desconocido al preparar el preview interno.')
        setRunStatus({ stage: 'error', message: 'Error al preparar preview', timings })
        setIsRunningPreview(false)
        return
      }

      setRunStatus({ stage: 'running', message: 'Ejecutando motor en segundo plano...', timings: { ...timings } })

      schedulePreviewStep(async () => {
        if (!mountedRef.current) return
        let contract

        try {
          const generateStartedAt = performanceNow()
          const workerRun = createExamEnginePreviewWorkerRun(input, {}, { timeoutMs: 30000 })
          workerRunRef.current = workerRun
          contract = await workerRun.promise
          workerRunRef.current = null
          timings.generatePreviewMs = roundMs(performanceNow() - generateStartedAt)
          Object.assign(timings, contract?.metadata?.timings ?? {})
        } catch (error) {
          if (!mountedRef.current) return
          workerRunRef.current = null
          if (error?.code === 'WORKER_CANCELLED') return
          setPreviewError(error instanceof Error ? error.message : 'Error desconocido al ejecutar preview interno.')
          setRunStatus({ stage: 'error', message: 'Error al ejecutar motor', timings: { ...timings } })
          setIsRunningPreview(false)
          return
        }

        setRunStatus({ stage: 'processing', message: 'Procesando resultados...', timings: { ...timings } })

        schedulePreviewStep(() => {
          if (!mountedRef.current) return

          try {
            const processingStartedAt = performanceNow()
            setScenarios([
              buildScenarioMetricFromContract({ name: 'Calendario actual', input, contract }),
            ])
            setObservations(buildObservationSummary(input, contract, { maxCauses: 20, snapshot: previewSnapshot }))
            engine.actions.loadPreviewResult(contract, input, {})
            timings.procesarResultadosMs = roundMs(performanceNow() - processingStartedAt)
            timings.totalMs = roundMs(performanceNow() - startedAt)
            setRunStatus({ stage: 'finished', message: 'Preview finalizado', timings: { ...timings } })
            setIsRunningPreview(false)

            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
              const renderStartedAt = performanceNow()
              window.requestAnimationFrame(() => {
                if (!mountedRef.current) return
                setRunStatus((current) => ({
                  ...current,
                  timings: {
                    ...(current.timings ?? {}),
                    renderMs: roundMs(performanceNow() - renderStartedAt),
                  },
                }))
              })
            }
          } catch (error) {
            if (!mountedRef.current) return
            setPreviewError(error instanceof Error ? error.message : 'Error desconocido al procesar resultados del preview.')
            setRunStatus({ stage: 'error', message: 'Error al procesar resultados', timings: { ...timings } })
            setIsRunningPreview(false)
          }
        })
      })
    })
  }

  const buttonDisabled = !canRunPreview || isRunningPreview || engine.phase === 'loading'

  return (
    <section className="soft-card soft-card--tint-sky border-l-4 border-l-sky-600" aria-label="Preview interno del nuevo motor">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="soft-title">Preview interno examEngine</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-950">
            Auditoria read-only del nuevo motor
          </h3>
          <p className="mt-2 text-sm font-bold text-slate-700">
            Preview interno. No reemplaza el motor oficial. No guarda ni publica cronogramas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={buttonDisabled}
            onClick={runPreview}
          >
            {isRunningPreview ? 'Preview interno en ejecucion...' : 'Ejecutar preview interno del nuevo motor'}
          </button>
          <button type="button" className="btn-secondary" onClick={clearPreview}>
            Cancelar / limpiar preview
          </button>
        </div>
      </div>

      <PreviewRunStatus status={runStatus} />

      {(!canRunPreview || readiness.warnings.length > 0) ? (
        <PreviewReadinessDiagnostics readiness={readiness} />
      ) : null}

      {previewError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-800">
          Error del preview interno: {previewError}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-extrabold uppercase text-slate-500">Estado general</p>
          <p className="mt-1 text-xl font-extrabold text-slate-950">{getEfficiencyLabel(completionRate)}</p>
          <p className="text-sm font-bold text-slate-600">completionRate {displayPercent(completionRate)}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-extrabold uppercase text-slate-500">Mesas</p>
          <p className="mt-1 text-xl font-extrabold text-slate-950">{displayNumber(getSummaryMetric(summary, 'totalMesas'))}</p>
          <p className="text-sm font-bold text-slate-600">
            {displayNumber(getSummaryMetric(summary, 'totalPlanned'))} planificadas / {displayNumber(getSummaryMetric(summary, 'totalUnassigned'))} pendientes
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-extrabold uppercase text-slate-500">Tribunales</p>
          <p className="mt-1 text-xl font-extrabold text-slate-950">{displayNumber(tribunalSummary.mesasCompletas)} completas</p>
          <p className="text-sm font-bold text-slate-600">
            {displayNumber(tribunalSummary.mesasConUnVocal)} con 1 vocal / {displayNumber(tribunalSummary.mesasSinTribunal)} sin tribunal
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-extrabold uppercase text-slate-500">Disponibilidad</p>
          <p className="mt-1 text-xl font-extrabold text-slate-950">{displayNumber(tribunalSummary.mesasSinFecha)} sin fecha</p>
          <p className="text-sm font-bold text-slate-600">
            {displayNumber(teacherLimitSummary.docentesEnLimite)} docentes en limite / {displayNumber(teacherLimitSummary.docentesExcedidos)} excedidos
          </p>
        </div>
      </div>

      {observations ? <TitularidadBlock observations={observations} /> : null}

      {(hasPreview || observations) ? (
        <InstitutionalInterpretation
          completionRate={completionRate}
          observations={observations}
          teacherLimitSummary={teacherLimitSummary}
          tribunalSummary={tribunalSummary}
        />
      ) : null}

      <section className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3" aria-label="Alertas institucionales del preview">
        <h4 className="text-sm font-extrabold uppercase text-sky-900">Alertas institucionales</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-bold text-slate-700">
          <li>Mitad mas uno activa; no se relaja por defecto.</li>
          <li>Toda mesa con 1 vocal requiere revision manual y se marca como TRIBUNAL_UN_VOCAL.</li>
          <li>{completionRate >= 0.8 ? 'El escenario actual supera 80%.' : 'Calendario actual insuficiente si no supera 80%.'}</li>
          <li>No usar para publicacion oficial.</li>
        </ul>
      </section>

      <section className="mt-4" aria-label="Fechas recomendadas del preview">
        <h4 className="text-sm font-extrabold uppercase text-slate-800">Fechas recomendadas</h4>
        <p className="mt-1 text-sm font-bold text-slate-600">
          Dias sugeridos: {PRIORITY_DAYS.join(', ')}.
        </p>
        {scenarios.length ? (
          <>
            <p className="mt-2 text-sm font-bold text-slate-600">
              Para evitar bloquear la UI, el panel calcula solo el calendario actual. Los escenarios ampliados conviene correrlos en script o worker.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {scenarios.map((scenario) => (
                <div key={scenario.name} className="rounded-md border border-slate-200 bg-white p-3">
                  <p className="font-extrabold text-slate-950">{scenario.name}</p>
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    {displayNumber(scenario.totalFechasDisponibles)} fechas / {displayPercent(scenario.completionRate)}
                  </p>
                  <p className="text-xs font-extrabold uppercase text-slate-500">
                    {scenario.supera80 ? 'Supera 80%' : 'No supera 80%'}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm font-bold text-slate-600">Ejecuta el preview interno para calcular el escenario actual.</p>
        )}
      </section>

      <section className="mt-4" aria-label="Observaciones del preview interno">
        <h4 className="text-sm font-extrabold uppercase text-slate-800">Observaciones</h4>
        {observations ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-extrabold uppercase text-slate-500">Materias del plan</p>
              <p className="text-xl font-extrabold text-slate-950">{displayNumber(observations.totalMateriasPlan)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-extrabold uppercase text-slate-500">Materias que requieren mesa</p>
              <p className="text-xl font-extrabold text-slate-950">{displayNumber(observations.materiasQueRequierenMesa)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-extrabold uppercase text-slate-500">Sin horario/no requeridas</p>
              <p className="text-xl font-extrabold text-slate-950">{displayNumber(observations.materiasSinHorarioNoRequeridas)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-extrabold uppercase text-slate-500">Titulares inferidos</p>
              <p className="text-xl font-extrabold text-slate-950">{displayNumber(observations.titularesInferidos)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-extrabold uppercase text-slate-500">Titulares faltantes reales</p>
              <p className="text-xl font-extrabold text-slate-950">{displayNumber(observations.titularesFaltantesReales)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-extrabold uppercase text-slate-500">Docentes sin disponibilidad</p>
              <p className="text-xl font-extrabold text-slate-950">{displayNumber(observations.docentesSinDisponibilidad)}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm font-bold text-slate-600">Sin observaciones calculadas todavia.</p>
        )}

        {observations?.causasPrincipales?.length ? (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {observations.causasPrincipales.map((cause) => (
              <li key={cause.code} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                {cause.code}: {displayNumber(cause.count)}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {hasPreview && countRowsWithOneVocal(allRows) > 0 ? (
        <section className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3" aria-label="Mesas con un vocal en revision manual">
          <h4 className="text-sm font-extrabold uppercase text-amber-900">Revision manual</h4>
          <p className="mt-1 text-sm font-bold text-amber-800">
            {displayNumber(countRowsWithOneVocal(allRows))} mesas marcadas con requiresManualReview=true y reason=TRIBUNAL_UN_VOCAL.
          </p>
        </section>
      ) : null}

      <div className="mt-4">
        <ReadOnlyActionBar actions={engine.actions} />
      </div>
    </section>
  )
}

export default RegularExamPreviewInternalPanel
