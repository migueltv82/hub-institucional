import { useMemo, useCallback } from 'react'
import { Info, ShieldCheck } from 'lucide-react'
import { EXAM_GENERATION_TYPES } from '../../utils/examEngine/constants.js'
import { EJEMPLO_DIAS, EJEMPLO_MAX } from './examGenerationOptionsRules.js'

// ---------------------------------------------------------------------------
// Sub-componente: badge para reglas siempre activas
// ---------------------------------------------------------------------------

function ReglaFijaBadge({ label, description }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      <div>
        <span className="text-xs font-bold text-emerald-800">{label}</span>
        <span className="mt-0.5 block text-xs font-normal leading-tight text-emerald-700">
          {description}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

function ExamGenerationOptions({
  canEditWorkspace = true,
  careerOptions = [],
  examType,
  generationScope = {},
  onGenerationScopeChange,
  onSpecialSubjectToggle,
  selectedSpecialSubjectKeys = [],
  specialSubjectOptions = [],
  yearOptions = [],
}) {
  // FIX: memoizar Sets para evitar recrearlos en cada render
  const selectedSubjects = useMemo(
    () => new Set(selectedSpecialSubjectKeys),
    [selectedSpecialSubjectKeys]
  )
  const selectedCareers = useMemo(
    () => new Set(generationScope.careers ?? []),
    [generationScope.careers]
  )

  const isSpecial = examType === EXAM_GENERATION_TYPES.SPECIAL
  const allCareersSelected = selectedCareers.size === 0
  const applyHalfPlusOneRule = generationScope.applyHalfPlusOneRule ?? true
  const allowSameDayRelatedSubjects = generationScope.allowSameDayRelatedSubjects ?? true
  const respectCorrelativities = generationScope.respectCorrelativities ?? true

  // FIX: useCallback para estabilizar la referencia del handler
  const handleCareerChange = useCallback(
    (career) => {
      const newCareers = new Set(selectedCareers)
      if (newCareers.has(career)) {
        newCareers.delete(career)
      } else {
        newCareers.add(career)
      }
      // Si quedan todas seleccionadas individualmente, volvemos al estado "todas" (array vacío)
      if (newCareers.size === careerOptions.length) {
        onGenerationScopeChange('careers', [])
      } else {
        onGenerationScopeChange('careers', Array.from(newCareers))
      }
    },
    [selectedCareers, careerOptions.length, onGenerationScopeChange]
  )

  // FIX: handler explícito en vez de short-circuit en JSX
  const handleSelectAllCareers = useCallback(() => {
    if (!allCareersSelected) {
      onGenerationScopeChange('careers', [])
    }
  }, [allCareersSelected, onGenerationScopeChange])

  // FIX: naming consistente — todos los handlers usan `event`
  const handleYearChange = useCallback(
    (event) => onGenerationScopeChange('year', event.target.value),
    [onGenerationScopeChange]
  )

  const handleHalfPlusOneChange = useCallback(
    (event) => onGenerationScopeChange('applyHalfPlusOneRule', event.target.checked),
    [onGenerationScopeChange]
  )

  const handleSameDayChange = useCallback(
    (event) => onGenerationScopeChange('allowSameDayRelatedSubjects', event.target.checked),
    [onGenerationScopeChange]
  )

  const handleRespectCorrelativitiesChange = useCallback(
    (event) => onGenerationScopeChange('respectCorrelativities', event.target.checked),
    [onGenerationScopeChange]
  )

  return (
    // FIX: reemplazar style={{ borderRadius: 8 }} por clase Tailwind equivalente
    <section className="rise-in rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="soft-title">Alcance y reglas</span>
          <h3 className="mt-2 text-xl font-bold text-slate-950">
            {isSpecial ? 'Mesas especiales a pedido' : 'Configuracion de generacion'}
          </h3>
          {isSpecial && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Este periodo queda marcado como especial. Usalo para pedidos puntuales y ajustes manuales;
              si generas automaticamente, solo se tomaran las materias seleccionadas.
            </p>
          )}
        </div>
      </div>

      {/* Filtros de alcance + restricciones */}
      <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.6fr)]">

        {/* Carreras */}
        <div>
          <p className="text-sm font-bold text-slate-800">Carreras</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 transition">
              <input
                className="h-4 w-4 accent-slate-950"
                checked={allCareersSelected}
                disabled={!canEditWorkspace}
                onChange={handleSelectAllCareers}
                type="checkbox"
              />
              Todas las carreras
            </label>
            {/* FIX: key usa solo `career` (string único); el índice es antipatrón */}
            {careerOptions.map((career) => (
              <label
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 transition"
                key={career}
              >
                <input
                  className="h-4 w-4 accent-slate-950"
                  checked={selectedCareers.has(career)}
                  disabled={!canEditWorkspace}
                  onChange={() => handleCareerChange(career)}
                  type="checkbox"
                />
                {career}
              </label>
            ))}
          </div>
        </div>

        {/* Año + Restricciones */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="year-select" className="text-sm font-bold text-slate-800">
              Año
            </label>
            <select
              id="year-select"
              className="input-base w-full"
              disabled={!canEditWorkspace}
              value={generationScope.year ?? ''}
              onChange={handleYearChange}
            >
              <option value="">Todos los años</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}° año</option>
              ))}
            </select>
          </div>

          {/* Restricciones configurables */}
          <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Restricciones configurables
            </p>

            {/* R1 */}
            <label className="flex cursor-pointer items-start gap-2.5 text-sm font-bold text-slate-800">
              <input
                className="mt-0.5 h-4 w-4 accent-slate-950"
                checked={applyHalfPlusOneRule}
                disabled={!canEditWorkspace}
                onChange={handleHalfPlusOneChange}
                type="checkbox"
              />
              <div>
                <span>Límite Mitad Más Uno</span>
                <span className="mt-0.5 block text-xs font-normal leading-tight text-slate-500">
                  Máx. días afectados por docente = ⌊días de asistencia / 2⌋ + 1.{' '}
                  <span className="font-medium text-slate-600">
                    Ej: {EJEMPLO_DIAS} días de asistencia → máx. {EJEMPLO_MAX} días afectados.
                  </span>
                </span>
              </div>
            </label>

            <hr className="border-slate-200" />

            <label
              className={[
                'flex items-start gap-2.5 text-sm font-bold transition',
                !canEditWorkspace
                  ? 'cursor-not-allowed text-slate-400'
                  : 'cursor-pointer text-slate-800',
              ].join(' ')}
            >
              <input
                className="mt-0.5 h-4 w-4 accent-slate-950"
                checked={respectCorrelativities}
                disabled={!canEditWorkspace}
                onChange={handleRespectCorrelativitiesChange}
                type="checkbox"
              />
              <div>
                <span>Respetar correlatividades</span>
                <span className="mt-0.5 block text-xs font-normal leading-tight text-slate-500">
                  Ordena las mesas respetando que las materias correlativas previas se rindan antes que sus posteriores.
                </span>
              </div>
            </label>

            <hr className="border-slate-200" />

            {/* R3 */}
            <label
              className={[
                'flex items-start gap-2.5 text-sm font-bold transition',
                !canEditWorkspace
                  ? 'cursor-not-allowed text-slate-400'
                  : 'cursor-pointer text-slate-800',
              ].join(' ')}
            >
              <input
                className="mt-0.5 h-4 w-4 accent-slate-950"
                checked={allowSameDayRelatedSubjects}
                disabled={!canEditWorkspace}
                onChange={handleSameDayChange}
                type="checkbox"
              />
              <div>
                <span>Materias afines el mismo día</span>
                <span className="mt-0.5 block text-xs font-normal leading-tight text-slate-500">
                  Permite dos mesas el mismo día solo si las materias son afines. Si está desactivada, no permite más de una mesa por docente ese día.
                </span>
              </div>
            </label>
          </div>

          {/* Reglas fijas */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Reglas siempre activas
              </p>
            </div>
            <ReglaFijaBadge
              label="Sin conflicto de roles"
              description="Un docente no puede ser titular en una mesa y vocal en otra el mismo día."
            />
            <ReglaFijaBadge
              label="Vocal mínimo 1"
              description="Si no hay 2 vocales disponibles, se acepta 1. El sistema genera una advertencia."
            />
          </div>
        </div>
      </div>

      {/* Mesas especiales */}
      {isSpecial && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-extrabold text-slate-900">Materias a incluir</p>
              <p className="mt-1 text-sm text-slate-600">
                Seleccionadas:{' '}
                <span className="font-bold text-slate-950">{selectedSubjects.size}</span>
              </p>
            </div>
          </div>

          {specialSubjectOptions.length > 0 ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {specialSubjectOptions.map((subject) => (
                <label
                  key={subject.key}
                  className="flex min-h-16 cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-100 transition"
                >
                  <input
                    className="mt-1 h-4 w-4 accent-slate-950"
                    checked={selectedSubjects.has(subject.key)}
                    disabled={!canEditWorkspace}
                    onChange={() => onSpecialSubjectToggle(subject.key)}
                    type="checkbox"
                  />
                  <div>
                    <span className="block font-bold text-slate-950">{subject.name}</span>
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      {subject.code} · {subject.career}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              No hay materias con horario cargado para generar mesas especiales.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export default ExamGenerationOptions
