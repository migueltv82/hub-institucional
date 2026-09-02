import { Save, X } from 'lucide-react'

function ManualEditPanel({
  edicionMesa,
  onCancel,
  onFieldChange,
  onSave,
}) {
  return (
    <section className="rise-in border border-slate-200 bg-white/90 p-5" style={{ borderRadius: 8 }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="soft-title">Edicion manual</span>
          <h4 className="mt-2 text-2xl font-bold text-slate-950">
            Ajustar mesa confirmada o pendiente
          </h4>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Usa este editor cuando un docente pide mover una mesa o cuando necesitas
            corregir fecha, horario o aula sin regenerar todo el cronograma.
          </p>
        </div>
        <button className="btn-secondary" onClick={onCancel} type="button">
          <X className="h-4 w-4" />
          Cancelar edicion
        </button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        <label className="text-sm font-bold text-slate-800">
          Fecha
          <input
            className="input-base mt-2"
            type="date"
            value={edicionMesa.fechaIso}
            onChange={(event) => onFieldChange('fechaIso', event.target.value)}
          />
        </label>
        <label className="text-sm font-bold text-slate-800">
          Inicio
          <input
            className="input-base mt-2"
            type="time"
            value={edicionMesa.inicio}
            onChange={(event) => onFieldChange('inicio', event.target.value)}
          />
        </label>
        <label className="text-sm font-bold text-slate-800">
          Fin {edicionMesa.examType === 'special' ? '' : '(opcional)'}
          <input
            className="input-base mt-2"
            type="time"
            value={edicionMesa.fin}
            onChange={(event) => onFieldChange('fin', event.target.value)}
          />
        </label>
        <label className="text-sm font-bold text-slate-800">
          Aula
          <input
            className="input-base mt-2"
            type="text"
            value={edicionMesa.aula}
            onChange={(event) => onFieldChange('aula', event.target.value)}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <label className="text-sm font-bold text-slate-800">
          Titular
          <input
            className="input-base mt-2"
            type="text"
            value={edicionMesa.profesorTitular}
            onChange={(event) => onFieldChange('profesorTitular', event.target.value)}
          />
        </label>
        <label className="text-sm font-bold text-slate-800">
          Vocal 1
          <input
            className="input-base mt-2"
            type="text"
            value={edicionMesa.vocal1}
            onChange={(event) => onFieldChange('vocal1', event.target.value)}
          />
        </label>
        <label className="text-sm font-bold text-slate-800">
          Vocal 2
          <input
            className="input-base mt-2"
            type="text"
            value={edicionMesa.vocal2}
            onChange={(event) => onFieldChange('vocal2', event.target.value)}
          />
        </label>
      </div>

      <label className="mt-3 block text-sm font-bold text-slate-800">
        Observacion operativa
        <textarea
          className="input-base mt-2 min-h-[112px] resize-y"
          value={edicionMesa.observacionManual}
          onChange={(event) => onFieldChange('observacionManual', event.target.value)}
          placeholder="Ejemplo: docente afectado a otra institucion, se mueve la mesa al jueves."
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={onSave} type="button">
          <Save className="h-4 w-4" />
          Guardar cambios manuales
        </button>
        <button className="btn-secondary" onClick={onCancel} type="button">
          <X className="h-4 w-4" />
          Cancelar
        </button>
      </div>
    </section>
  )
}

export default ManualEditPanel
