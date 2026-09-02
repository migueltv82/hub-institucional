function OperationsDashboard({
  cronogramaTotal,
  mesasEspecialesTotal = 0,
  mesasConfirmadasTotal,
  mesasRegularesTotal = 0,
}) {
  return (
    <section className="rise-in">
      <article className="metric-card metric-card--coral">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          Control operativo
        </p>
        <h4 className="mt-2 text-2xl font-bold text-slate-950">
          Estado del cronograma
        </h4>

        <div className="mt-5 space-y-3">
          <div className="soft-card border-l-4 border-l-blue-600 bg-white">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Mesas totales</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{cronogramaTotal}</p>
          </div>
          <div className="soft-card border-l-4 border-l-orange-500 bg-white">
            <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Pendientes</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {cronogramaTotal - mesasConfirmadasTotal}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="soft-card border-l-4 border-l-teal-500 bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Regulares</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{mesasRegularesTotal}</p>
            </div>
            <div className="soft-card border-l-4 border-l-fuchsia-500 bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-700">Especiales</p>
              <p className="mt-2 text-2xl font-bold text-slate-950">{mesasEspecialesTotal}</p>
            </div>
          </div>
          <div className="soft-card border-l-4 border-l-lime-500 bg-white">
            <p className="text-xs font-bold uppercase tracking-wide text-lime-700">Reporte listo</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Cuando confirmas mesas, el XLSX de salida se separa por carrera automaticamente.
            </p>
          </div>
        </div>
      </article>
    </section>
  )
}

export default OperationsDashboard
