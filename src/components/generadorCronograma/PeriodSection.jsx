import { CalendarDays, ClipboardList, Hand } from 'lucide-react'
import { EXAM_GENERATION_TYPES } from '../../utils/examEngine/constants.js'

function DateField({
  disabled,
  label,
  max,
  min,
  onChange,
  value,
}) {
  return (
    <label className="text-sm font-bold text-slate-800">
      {label}
      <input
        className="input-base mt-2"
        disabled={disabled}
        max={max || undefined}
        min={min || undefined}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  )
}

function RegularCallRange({
  canEditWorkspace,
  callKey,
  range,
  title,
  onRegularCallRangeChange,
}) {
  return (
    <fieldset className="rounded-lg border border-slate-200 bg-white/80 p-4">
      <legend className="px-1 text-sm font-extrabold text-slate-950">{title}</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <DateField
          disabled={!canEditWorkspace}
          label="Desde"
          max={range.end}
          onChange={(value) => onRegularCallRangeChange(callKey, 'start', value)}
          value={range.start}
        />
        <DateField
          disabled={!canEditWorkspace}
          label="Hasta"
          min={range.start}
          onChange={(value) => onRegularCallRangeChange(callKey, 'end', value)}
          value={range.end}
        />
      </div>
    </fieldset>
  )
}

function PeriodSection({
  canEditWorkspace = true,
  examType,
  fechaFin,
  fechaInicio,
  onExamTypeChange,
  onFechaFinChange,
  onFechaInicioChange,
  onRegularCallCountChange,
  onRegularCallRangeChange,
  regularCallRanges,
}) {
  const isRegularExam = examType !== EXAM_GENERATION_TYPES.SPECIAL
  const regularCallCount = regularCallRanges?.callCount === 1 ? 1 : 2
  const firstCall = regularCallRanges?.first ?? { start: '', end: '' }
  const secondCall = regularCallRanges?.second ?? { start: '', end: '' }

  return (
    <section
      className="rise-in border border-slate-200 bg-[linear-gradient(135deg,rgba(247,242,232,0.65),rgba(237,246,240,0.7))] p-5"
      style={{ borderRadius: 8 }}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span className="soft-title">Definir periodo</span>
          <h3 className="mt-2 text-xl font-bold text-slate-950">
            {isRegularExam ? 'Llamados regulares' : 'Rango de mesas especiales'}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Elegi si el periodo es regular o especial. Las mesas especiales quedan pensadas para pedidos puntuales y carga manual.
          </p>
        </div>
        <span className="status-chip w-fit border-amber-200 bg-amber-50 text-amber-800">
          <CalendarDays className="h-4 w-4" />
          {isRegularExam ? `${regularCallCount} llamado${regularCallCount > 1 ? 's' : ''}` : 'Especial'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.5fr)]">
        <div className="inline-flex w-full flex-wrap gap-2 rounded-md border border-slate-200 bg-white/80 p-1 sm:w-fit">
          <button
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-extrabold transition sm:flex-none ${
              isRegularExam ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-white'
            }`}
            disabled={!canEditWorkspace}
            onClick={() => onExamTypeChange?.(EXAM_GENERATION_TYPES.REGULAR)}
            type="button"
          >
            <ClipboardList className="h-4 w-4" />
            Regular
          </button>
          <button
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded px-3 text-sm font-extrabold transition sm:flex-none ${
              !isRegularExam ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-white'
            }`}
            disabled={!canEditWorkspace}
            onClick={() => onExamTypeChange?.(EXAM_GENERATION_TYPES.SPECIAL)}
            type="button"
          >
            <Hand className="h-4 w-4" />
            Especial
          </button>
        </div>

        {isRegularExam && (
          <div className="inline-flex w-full rounded-md border border-slate-200 bg-white/80 p-1 sm:w-fit lg:justify-self-end">
            {[1, 2].map((count) => (
              <button
                key={count}
                className={`inline-flex min-h-10 flex-1 items-center justify-center rounded px-3 text-sm font-extrabold transition sm:flex-none ${
                  regularCallCount === count ? 'bg-teal-700 text-white' : 'text-slate-700 hover:bg-white'
                }`}
                disabled={!canEditWorkspace}
                onClick={() => onRegularCallCountChange?.(count)}
                type="button"
              >
                {count} llamado{count > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {isRegularExam ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <RegularCallRange
            callKey="first"
            canEditWorkspace={canEditWorkspace}
            onRegularCallRangeChange={onRegularCallRangeChange}
            range={firstCall}
            title="Primer llamado"
          />
          {regularCallCount === 2 && (
            <RegularCallRange
              callKey="second"
              canEditWorkspace={canEditWorkspace}
              onRegularCallRangeChange={onRegularCallRangeChange}
              range={secondCall}
              title="Segundo llamado"
            />
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-950">
            Las mesas especiales no usan llamados regulares. Defini el rango general y luego arma o ajusta las mesas a pedido.
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <DateField
              disabled={!canEditWorkspace}
              label="Fecha inicio de mesas"
              max={fechaFin}
              onChange={onFechaInicioChange}
              value={fechaInicio}
            />
            <DateField
              disabled={!canEditWorkspace}
              label="Fecha fin de mesas"
              min={fechaInicio}
              onChange={onFechaFinChange}
              value={fechaFin}
            />
          </div>
        </>
      )}
    </section>
  )
}

export default PeriodSection
