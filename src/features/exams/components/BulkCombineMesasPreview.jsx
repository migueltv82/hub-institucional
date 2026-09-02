import { useMemo, useState } from 'react'
import { Layers, Sparkles } from 'lucide-react'
import { TYPE_PRIORITY } from '../../../utils/examEngine/planning/compactMesas.js'
import { planBulkMesaCombinations } from '../../../utils/examEngine/planning/tribunals/planBulkMesaCombinations.js'

const COMPACTION_TYPE_LABELS = {
  MISMO_TITULAR: 'Mismo titular',
  MATERIA_HOMONIMA: 'Materia homónima',
  INGLES_INSTITUCIONAL: 'Inglés institucional',
  CORRELATIVA_DIRECTA: 'Correlativa directa',
  MISMA_CARRERA: 'Misma carrera',
  CARRERA_COMPATIBLE: 'Carrera compatible',
  FAMILIA_IDONEIDAD: 'Familia de idoneidad',
}

const MODE_OPTIONS = [
  { value: 'safe', label: 'Segura', description: 'Solo combina por mismo titular, materia homónima o misma carrera.' },
  { value: 'full', label: 'Completa', description: 'Suma correlativa directa, carrera compatible e Inglés institucional.' },
]

function BulkCombineMesasPreview({
  correlatividades = [],
  docentes = [],
  examCallConfig = {},
  isBusy = false,
  onApply,
  reviewedSchedule = [],
}) {
  const [compactMode, setCompactMode] = useState('safe')

  const plan = useMemo(() => {
    if (!reviewedSchedule.length) return null

    return planBulkMesaCombinations({
      reviewedSchedule,
      docentes,
      correlatividades,
      examCallConfig,
      compactMode,
    })
  }, [reviewedSchedule, docentes, correlatividades, examCallConfig, compactMode])

  const ahorro = plan?.totalCombinaciones ?? 0

  return (
    <section className="soft-card" aria-label="Combinar mesas en bloque">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="soft-title">Combinar mesas</p>
          <h3 className="mt-2 flex items-center gap-2 text-2xl font-extrabold text-slate-950">
            <Layers className="h-6 w-6 text-teal-700" />
            Ahorrá tribunales combinando mesas compatibles
          </h3>
          <p className="mt-2 max-w-2xl text-sm font-bold text-slate-600">
            Antes de completar tribunales mesa por mesa, mirá cuánto ahorrarías combinando en bloque.
            Después seguís ajustando a mano lo que haga falta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Modo de combinación">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={compactMode === option.value ? 'btn-primary' : 'btn-secondary'}
              aria-pressed={compactMode === option.value}
              disabled={isBusy}
              title={option.description}
              type="button"
              onClick={() => setCompactMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {!plan ? (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm font-bold text-slate-500">
          Generá el precronograma primero para ver combinaciones posibles.
        </p>
      ) : ahorro > 0 ? (
        <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-4">
          <p className="flex items-center gap-2 text-lg font-extrabold text-teal-950">
            <Sparkles className="h-5 w-5" />
            Te ahorrarías {ahorro} {ahorro === 1 ? 'tribunal' : 'tribunales'} combinando {ahorro * 2} mesas
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TYPE_PRIORITY.filter((type) => plan.typeCounts[type]).map((type) => (
              <span
                key={type}
                className="rounded-full bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-teal-900"
              >
                {COMPACTION_TYPE_LABELS[type] ?? type}: {plan.typeCounts[type]}
              </span>
            ))}
          </div>
          <button
            className="btn-primary mt-4"
            disabled={isBusy}
            type="button"
            onClick={() => onApply?.(plan.reviewedSchedule)}
          >
            Aplicar combinaciones sugeridas
          </button>
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm font-bold text-slate-500">
          No se encontraron combinaciones {compactMode === 'safe' ? 'seguras' : 'posibles'} para este precronograma. Podés seguir combinando a mano abajo.
        </p>
      )}
    </section>
  )
}

export default BulkCombineMesasPreview
