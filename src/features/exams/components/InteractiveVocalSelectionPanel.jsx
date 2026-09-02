import { CheckCircle2, RotateCcw, Sparkles, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MAX_SUBJECTS_PER_MESA } from '../../../utils/examEngine/constants.js'
import { REASON_LABELS } from '../../../utils/examEngine/planning/tribunals/combineReviewedMesas.js'

function clean(value) {
  return String(value ?? '').trim()
}

function compareText(left, right) {
  return clean(left).localeCompare(clean(right), 'es', { numeric: true, sensitivity: 'base' })
}

function getCareer(mesa = {}) {
  return clean(mesa.carrera) || 'Sin carrera'
}

const TIPO_COMPACTACION_LABELS = {
  MISMO_TITULAR: 'Mismo titular',
  MATERIA_HOMONIMA: 'Materia homonima',
  CORRELATIVA_DIRECTA: 'Correlativa directa',
  MISMA_CARRERA: 'Misma carrera',
  CARRERA_COMPATIBLE: 'Carrera compatible',
  FAMILIA_IDONEIDAD: 'Familia de idoneidad',
  INGLES_INSTITUCIONAL: 'Ingles institucional',
}

function tipoCompactacionLabel(tipo) {
  return TIPO_COMPACTACION_LABELS[tipo] ?? tipo ?? 'Compatible'
}

const ESTADO_LABELS = {
  TRIBUNAL_COMPLETE: 'Completo',
  TRIBUNAL_MINIMUM: 'Minimo',
  TRIBUNAL_INCOMPLETE: 'Incompleto',
  NEEDS_INSTITUTIONAL_REVIEW: 'Revision institucional',
}

const ESTADO_BADGE_CLASSES = {
  TRIBUNAL_COMPLETE: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  TRIBUNAL_MINIMUM: 'border-amber-200 bg-amber-50 text-amber-950',
  TRIBUNAL_INCOMPLETE: 'border-slate-200 bg-white text-slate-600',
  NEEDS_INSTITUTIONAL_REVIEW: 'border-rose-200 bg-rose-50 text-rose-950',
}

const AFFINITY_LABELS = {
  MISMA_CARRERA: 'Misma carrera',
  MATERIA_HOMONIMA: 'Materia homonima',
  MATERIA_SIMILAR: 'Materia similar',
  ESPECIALIDAD_DECLARADA: 'Especialidad declarada',
  FAMILIA_INGLES: 'Familia ingles',
  FAMILIA_INFORMATICA_TIC: 'Familia informatica/TIC',
  PRACTICA_PEDAGOGICA_TRANSVERSAL: 'Practica pedagogica transversal',
  PRACTICA_TECNICA_MISMA_CARRERA: 'Practica tecnica misma carrera',
  IDONEIDAD_EXPLICITA: 'Idoneidad explicita',
  TITULAR_CRUZADO: 'Titular cruzado',
  CARRERA_INCOMPATIBLE: 'Carrera incompatible',
  SIN_AFINIDAD: 'Sin afinidad',
}

function affinityLabel(nivel) {
  return AFFINITY_LABELS[nivel] ?? nivel ?? 'Sin afinidad'
}

function formatCupo(candidate) {
  if (!Number.isFinite(candidate.limiteVocalias)) return 'sin limite'

  return `${Math.max(0, candidate.limiteVocalias - candidate.vocaliasAsignadas)} disponible`
}

function getMesaId(mesa = {}) {
  return String(mesa.draftMesaId ?? mesa.id ?? '').trim()
}

function VocalSlot({
  candidates = [],
  label,
  mesaId,
  onRemove,
  onSelect,
  rejectedCandidates = [],
  rol,
  selected,
}) {
  return (
    <div className="soft-card">
      <p className="soft-title">{label}</p>

      {selected ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-emerald-950">{selected.nombre}</p>
            <p className="text-xs font-bold text-emerald-800">{affinityLabel(selected.nivelAfinidad)}</p>
          </div>
          {selected.lockedCrossTitular ? (
            <span className="shrink-0 rounded-full border border-emerald-200 bg-white px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
              Fijo
            </span>
          ) : (
            <button
              className="btn-secondary shrink-0"
              onClick={() => onRemove(mesaId, rol)}
              type="button"
            >
              <Undo2 className="h-4 w-4" />
              Quitar
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mt-2 text-xs font-bold text-slate-500">Sin asignar.</p>
          <ul className="mt-3 max-h-56 space-y-2 overflow-auto">
            {candidates.length ? candidates.map((candidate) => (
              <li
                key={candidate.docenteId}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-950">{candidate.nombre}</p>
                  <p className="text-xs font-bold text-slate-500">
                    {affinityLabel(candidate.nivelAfinidad)} &middot; cupo {formatCupo(candidate)}
                  </p>
                </div>
                <button
                  className="btn-secondary shrink-0"
                  onClick={() => onSelect(mesaId, rol, candidate.docenteId)}
                  type="button"
                >
                  Elegir
                </button>
              </li>
            )) : (
              <li className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs font-bold text-slate-500">
                Sin candidatos validos disponibles.
              </li>
            )}
          </ul>
        </>
      )}

      {rejectedCandidates.length > 0 && (
        <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer font-bold">Ver descartados ({rejectedCandidates.length})</summary>
          <ul className="mt-2 space-y-1">
            {rejectedCandidates.map((candidate) => (
              <li key={candidate.docenteId}>
                {candidate.nombre}: {candidate.rechazos.join(', ')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function CombineMesaControls({
  isBusy = false,
  onCombine,
  suggestions = [],
}) {
  const [feedback, setFeedback] = useState('')

  function handleCombine(combineArgs) {
    const result = onCombine(...combineArgs)
    if (!result.success) {
      setFeedback(REASON_LABELS[result.reason] ?? result.detail ?? 'No se pudo combinar las mesas.')
      return
    }

    setFeedback('')
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <p className="soft-title">Mesas sugeridas para combinar</p>

      {suggestions.length ? (
        <ul className="mt-3 max-h-56 space-y-2 overflow-auto">
          {suggestions.map((suggestion) => {
            const mesaId = getMesaId(suggestion.mesa)
            return (
              <li
                key={mesaId}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-950">
                    {suggestion.mesa.materiaMesa ?? suggestion.mesa.materia}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    {tipoCompactacionLabel(suggestion.tipoCompactacion)}
                  </p>
                </div>
                <button
                  className="btn-secondary shrink-0"
                  disabled={isBusy}
                  onClick={() => handleCombine(suggestion.combineArgs)}
                  type="button"
                >
                  Combinar
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-bold text-slate-500">
          No hay mesas para combinar con esta en este momento. Esto suele ocurrir
          cuando no hay otra mesa de la misma carrera, o una pedagogica/TIC compatible
          en el mismo llamado, cuando los titulares no dictan clase en la fecha
          de la mesa activa, o cuando las reglas academicas impiden agruparlas.
        </p>
      )}

      {feedback && (
        <p className="mt-2 text-xs font-bold text-rose-700">{feedback}</p>
      )}
    </div>
  )
}

function CombinedMesaControls({
  activeMesa,
  activeMesaId,
  isBusy = false,
  onCombine,
  onUndo,
  suggestions = [],
}) {
  const groupedCount = activeMesa.materiasAgrupadas?.length ?? 0

  return (
    <div className="mt-4 border-t border-slate-200 pt-4">
      <p className="soft-title">Mesa combinada</p>
      <ul className="mt-2 space-y-1 text-sm font-bold text-slate-700">
        {(activeMesa.materiasAgrupadas ?? []).map((materia, index) => (
          <li key={materia.materiaId ?? index}>{materia.materia ?? materia.nombreMateria}</li>
        ))}
      </ul>
      <button
        className="btn-secondary mt-3"
        disabled={isBusy}
        onClick={() => onUndo(activeMesaId)}
        type="button"
      >
        <Undo2 className="h-4 w-4" />
        Deshacer combinacion
      </button>
      {groupedCount < MAX_SUBJECTS_PER_MESA ? (
        <CombineMesaControls
          isBusy={isBusy}
          onCombine={onCombine}
          suggestions={suggestions}
        />
      ) : (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">
          Mesa cerrada con tres materias.
        </p>
      )}
    </div>
  )
}

function InteractiveVocalSelectionPanel({
  isBusy = false,
  onConfirm,
  session,
}) {
  const {
    activeMesa,
    autoCompleteAll,
    combineMesas,
    finalizeSession,
    getCombinableMesas,
    getSelectableCandidatesForMesa,
    mesaResults,
    progressSummary,
    readyMesas,
    resetSelections,
    selectVocal,
    setActiveMesaId,
    teacherLoadSummary,
    undoCombineMesas,
    undoVocal,
  } = session

  const careers = useMemo(
    () => [...new Set(readyMesas.map(getCareer))].sort(compareText),
    [readyMesas],
  )
  const [selectedCareer, setSelectedCareer] = useState('')

  if (!readyMesas.length) {
    return (
      <section className="soft-card">
        <p className="soft-title">Tribunales</p>
        <p className="mt-3 text-sm font-bold text-slate-600">
          Genera el precronograma para comenzar a agrupar mesas y asignar vocales.
        </p>
      </section>
    )
  }

  const activeMesaId = activeMesa ? getMesaId(activeMesa) : ''
  const activeEntry = activeMesaId ? mesaResults.get(activeMesaId) : null
  const activeCareer = careers.includes(selectedCareer) ? selectedCareer : careers[0] ?? ''
  const careerMesas = readyMesas.filter((mesa) => getCareer(mesa) === activeCareer)

  function handleSelectCareer(career) {
    setSelectedCareer(career)
    if (getCareer(activeMesa ?? {}) !== career) {
      const firstMesa = readyMesas.find((mesa) => getCareer(mesa) === career)
      if (firstMesa) setActiveMesaId(getMesaId(firstMesa))
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <section className="soft-card">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="soft-title">Tribunales</p>
            <h3 className="mt-2 text-2xl font-extrabold text-slate-950">
              Seleccion de vocales
            </h3>
            <p className="mt-2 text-sm font-bold text-slate-600">
              {progressSummary.completos} completas &middot; {progressSummary.minimos} minimas &middot; {progressSummary.incompletos} incompletas
              {progressSummary.necesitanRevision ? ` · ${progressSummary.necesitanRevision} con revision institucional` : ''}
              {' '}de {progressSummary.total} mesas.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <button
              className="btn-secondary"
              disabled={isBusy}
              onClick={resetSelections}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
              Vaciar selecciones
            </button>
            <button
              className="btn-secondary"
              disabled={isBusy}
              onClick={autoCompleteAll}
              type="button"
            >
              <Sparkles className="h-4 w-4" />
              Auto-completar todo
            </button>
            <button
              className="btn-primary"
              disabled={isBusy}
              onClick={() => onConfirm(finalizeSession())}
              type="button"
            >
              <CheckCircle2 className="h-4 w-4" />
              Guardar cambios y preparar envio
            </button>
          </div>
        </div>
      </section>

      {careers.length > 1 ? (
        <section className="soft-card">
          <p className="soft-title">Carrera</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Carreras de las mesas">
            {careers.map((career) => (
              <button
                key={career}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-extrabold ${career === activeCareer ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                onClick={() => handleSelectCareer(career)}
                type="button"
              >
                {career} · {readyMesas.filter((mesa) => getCareer(mesa) === career).length}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid min-w-0 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="soft-card max-h-[560px] min-w-0 overflow-auto">
          <p className="soft-title">{careers.length > 1 ? `Mesas · ${activeCareer}` : 'Mesas'}</p>
          <ul className="mt-3 space-y-2">
            {careerMesas.map((mesa) => {
              const mesaId = getMesaId(mesa)
              const entry = mesaResults.get(mesaId)
              const isActive = mesaId === activeMesaId

              return (
                <li key={mesaId}>
                  <button
                    className={`w-full min-w-0 rounded-md border px-3 py-2 text-left text-sm font-bold ${
                      isActive ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'
                    }`}
                    onClick={() => setActiveMesaId(mesaId)}
                    type="button"
                  >
                    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${ESTADO_BADGE_CLASSES[entry?.mesa.estado] ?? ''}`}>
                      {ESTADO_LABELS[entry?.mesa.estado] ?? entry?.mesa.estado}
                    </span>
                    <p className="mt-1 truncate text-slate-950">{mesa.materiaMesa ?? mesa.materia}</p>
                    <p className="text-xs font-bold text-slate-500">
                      {mesa.fechaSugerida ?? mesa.fecha} &middot; {mesa.carrera}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="min-w-0 space-y-4">
          {activeEntry && (
            <>
              <section className="soft-card">
                <p className="soft-title">Mesa activa</p>
                <h4 className="mt-2 text-xl font-extrabold text-slate-950">
                  {activeMesa.materiaMesa ?? activeMesa.materia}
                </h4>
                <p className="mt-1 text-sm font-bold text-slate-600">
                  {activeMesa.fechaSugerida ?? activeMesa.fecha} &middot; {activeMesa.carrera} &middot; Titular: {activeEntry.mesa.titular || 'A designar'}
                </p>

                {(activeMesa.materiasAgrupadas?.length ?? 0) > 1 ? (
                  <CombinedMesaControls
                    activeMesa={activeMesa}
                    activeMesaId={activeMesaId}
                    isBusy={isBusy}
                    onCombine={combineMesas}
                    onUndo={undoCombineMesas}
                    suggestions={getCombinableMesas(activeMesaId)}
                  />
                ) : (
                  <CombineMesaControls
                    isBusy={isBusy}
                    onCombine={combineMesas}
                    suggestions={getCombinableMesas(activeMesaId)}
                  />
                )}
              </section>

              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <VocalSlot
                  candidates={getSelectableCandidatesForMesa(activeMesaId, 'VOCAL_1')}
                  label="Vocal 1"
                  mesaId={activeMesaId}
                  rejectedCandidates={activeEntry.candidatePool.rejectedCandidates}
                  rol="VOCAL_1"
                  selected={activeEntry.selection.vocal1}
                  onRemove={undoVocal}
                  onSelect={selectVocal}
                />
                <VocalSlot
                  candidates={getSelectableCandidatesForMesa(activeMesaId, 'VOCAL_2')}
                  label="Vocal 2"
                  mesaId={activeMesaId}
                  rejectedCandidates={activeEntry.candidatePool.rejectedCandidates}
                  rol="VOCAL_2"
                  selected={activeEntry.selection.vocal2}
                  onRemove={undoVocal}
                  onSelect={selectVocal}
                />
              </div>
            </>
          )}

          {teacherLoadSummary.length > 0 && (
            <section className="soft-card">
              <p className="soft-title">Carga docente (mitad mas uno)</p>
              <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                <div className="max-h-64 overflow-auto">
                  <table className="min-w-full divide-y divide-slate-200 bg-white">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        {['Docente', 'Llamado', 'Vocalias asignadas', 'Limite', 'Disponible'].map((label) => (
                          <th key={label} className="px-3 py-2 text-left text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {teacherLoadSummary.map((entry) => (
                        <tr key={`${entry.docenteId}::${entry.llamado}`}>
                          <td className="px-3 py-2 text-sm font-extrabold text-slate-950">{entry.nombre}</td>
                          <td className="px-3 py-2 text-sm text-slate-700">{entry.llamado}</td>
                          <td className="px-3 py-2 text-sm text-slate-700">{entry.vocaliasAsignadas}</td>
                          <td className="px-3 py-2 text-sm text-slate-700">
                            {Number.isFinite(entry.limiteVocalias) ? entry.limiteVocalias : 'Sin limite'}
                          </td>
                          <td className={`px-3 py-2 text-sm font-extrabold ${entry.disponible === 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {Number.isFinite(entry.limiteVocalias) ? entry.disponible : 'Sin limite'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  )
}

export default InteractiveVocalSelectionPanel
