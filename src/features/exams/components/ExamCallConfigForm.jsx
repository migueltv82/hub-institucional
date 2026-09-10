import { Sparkles } from 'lucide-react'

const ALL_CAREERS_VALUE = 'ALL'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function ExamCallConfigForm({
  previewOnly = false,
  careerOptions = [],
  disabled = false,
  form,
  onChange,
  onGenerateDraft,
  validation,
}) {
  const selectedCareer = form.alcanceCarrera || ALL_CAREERS_VALUE
  const selectedYears = asArray(form.alcanceAnios).map(Number).filter(Number.isFinite)
  const selectedCareerOption = careerOptions.find((option) => option.name === selectedCareer)
  const availableYears = [...new Set(asArray(selectedCareerOption?.years).map(Number).filter(Number.isFinite))]
    .sort((left, right) => left - right)

  function changeCareer(value) {
    onChange('alcanceCarrera', value)
    onChange('alcanceAnios', [])
  }

  function toggleIncludedYear(year) {
    onChange(
      'alcanceAnios',
      selectedYears.includes(year)
        ? selectedYears.filter((item) => item !== year)
        : [...selectedYears, year],
    )
  }

  return (
    <section className="soft-card soft-card--tint-sky">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="soft-title">{previewOnly ? 'Periodo de examen' : 'examEngine v2.1'}</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-950">Configurar llamado</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {previewOnly ? 'Selecciona el periodo y las carreras que queres incluir en la previsualizacion.' : 'Las fechas y el alcance se envian al motor como `examCallConfig` dinamico.'}
          </p>
        </div>
        <button
          className="btn-primary"
          disabled={disabled}
          onClick={onGenerateDraft}
          type="button"
        >
          <Sparkles className="h-4 w-4" />
          {form.tipoPeriodo === 'ESPECIAL' ? 'Continuar a armar mesas' : 'Generar precronograma'}
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="block text-sm font-bold text-slate-700">
          Tipo de llamado
          <select
            className="input-base mt-2"
            disabled={disabled}
            value={form.tipoPeriodo}
            onChange={(event) => onChange('tipoPeriodo', event.target.value)}
          >
            <option value="REGULAR">Regular</option>
            {!previewOnly && <option value="ESPECIAL">Especial</option>}
          </select>
        </label>

        <label className="block text-sm font-bold text-slate-700">
          Cantidad de llamados
          <select
            className="input-base mt-2"
            disabled={disabled || form.tipoPeriodo === 'ESPECIAL'}
            value={form.tipoPeriodo === 'ESPECIAL' ? 1 : form.cantidadLlamados}
            onChange={(event) => onChange('cantidadLlamados', Number(event.target.value))}
          >
            <option value={1}>Un llamado</option>
            <option value={2}>Dos llamados</option>
          </select>
        </label>

        <label className="block text-sm font-bold text-slate-700">
          {form.tipoPeriodo === 'ESPECIAL' ? 'Inicio del llamado especial' : 'Inicio del primer llamado'}
          <input
            className="input-base mt-2"
            disabled={disabled}
            type="date"
            value={form.fechaInicio}
            onChange={(event) => onChange('fechaInicio', event.target.value)}
          />
        </label>

        <label className="block text-sm font-bold text-slate-700">
          {form.tipoPeriodo === 'ESPECIAL' ? 'Fin del llamado especial' : 'Fin del primer llamado'}
          <input
            className="input-base mt-2"
            disabled={disabled}
            type="date"
            value={form.fechaFin}
            onChange={(event) => onChange('fechaFin', event.target.value)}
          />
        </label>

        <label className="flex min-h-[72px] items-center gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800">
          <input
            className="h-4 w-4 accent-teal-700"
            checked={form.usarDiasHabiles}
            disabled={disabled}
            type="checkbox"
            onChange={(event) => onChange('usarDiasHabiles', event.target.checked)}
          />
          Usar dias habiles
        </label>
      </div>

      {form.tipoPeriodo === 'REGULAR' && Number(form.cantidadLlamados) === 2 ? (
        <div className="mt-4 grid gap-4 rounded-md border border-sky-200 bg-sky-50 p-4 lg:grid-cols-2">
          <label className="block text-sm font-bold text-slate-700">
            Inicio del segundo llamado
            <input className="input-base mt-2" disabled={disabled} type="date" value={form.fechaInicioSegundoLlamado} onChange={(event) => onChange('fechaInicioSegundoLlamado', event.target.value)} />
          </label>
          <label className="block text-sm font-bold text-slate-700">
            Fin del segundo llamado
            <input className="input-base mt-2" disabled={disabled} type="date" value={form.fechaFinSegundoLlamado} onChange={(event) => onChange('fechaFinSegundoLlamado', event.target.value)} />
          </label>
        </div>
      ) : null}

      {form.tipoPeriodo === 'ESPECIAL' ? (
        <p className="mt-4 rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-900">
          Los llamados especiales se arman mesa por mesa a mano en el siguiente paso, sin alcance automático por carrera o año.
        </p>
      ) : (
        <section className="mt-4 rounded-md border border-slate-200 bg-white p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(240px,360px)_minmax(0,1fr)]">
            <label className="block text-sm font-bold text-slate-700">
              Carrera a generar
              <select
                className="input-base mt-2"
                disabled={disabled}
                value={selectedCareer}
                onChange={(event) => changeCareer(event.target.value)}
              >
                <option value={ALL_CAREERS_VALUE}>Todas las carreras</option>
                {careerOptions.map((option) => (
                  <option key={option.name} value={option.name}>{option.name}</option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className="text-sm font-bold text-slate-700">A&ntilde;os incluidos</legend>
              {selectedCareer === ALL_CAREERS_VALUE ? (
                <p className="mt-3 rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-900">
                  Se van a generar todas las carreras y todos los a&ntilde;os habilitados.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-3">
                  <label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">
                    <input
                      className="h-4 w-4 accent-teal-700"
                      checked={selectedYears.length === 0}
                      disabled={disabled}
                      type="checkbox"
                      onChange={() => onChange('alcanceAnios', [])}
                    />
                    Todos los a&ntilde;os
                  </label>
                  {availableYears.map((year) => (
                    <label key={year} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">
                      <input
                        className="h-4 w-4 accent-teal-700"
                        checked={selectedYears.includes(year)}
                        disabled={disabled}
                        type="checkbox"
                        onChange={() => toggleIncludedYear(year)}
                      />
                      {year} a&ntilde;o
                    </label>
                  ))}
                  {!availableYears.length ? (
                    <span className="text-sm text-slate-500">No hay a&ntilde;os detectados para esta carrera.</span>
                  ) : null}
                </div>
              )}
            </fieldset>
          </div>
        </section>
      )}

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="mt-4 space-y-2">
          {validation.errors.map((message) => (
            <p key={message} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">
              {message}
            </p>
          ))}
          {validation.warnings.map((message) => (
            <p key={message} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              {message}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

export default ExamCallConfigForm
