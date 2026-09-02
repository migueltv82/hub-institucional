function MetricsGrid({
  ajustesManuales,
  confirmadas,
  horarios,
  planes,
}) {
  return (
    <div className="rise-in grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="metric-card metric-card--cyan">
        <p className="text-xs font-bold uppercase tracking-wide text-cyan-700">Horarios</p>
        <p className="mt-2 text-3xl font-bold text-slate-950">{horarios}</p>
      </div>
      <div className="metric-card metric-card--blue">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Plan</p>
        <p className="mt-2 text-3xl font-bold text-slate-950">{planes}</p>
      </div>
      <div className="metric-card metric-card--lime">
        <p className="text-xs font-bold uppercase tracking-wide text-lime-700">Confirmadas</p>
        <p className="mt-2 text-3xl font-bold text-slate-950">{confirmadas}</p>
      </div>
      <div className="metric-card metric-card--warning">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Ajustes manuales</p>
        <p className="mt-2 text-3xl font-bold text-slate-950">{ajustesManuales}</p>
      </div>
    </div>
  )
}

export default MetricsGrid
