import { AlertTriangle, Download, UploadCloud } from 'lucide-react'

function Metric({ label, value, tone = 'slate' }) {
  const toneClass = {
    amber: 'border-l-amber-500 bg-amber-50 text-amber-950',
    emerald: 'border-l-emerald-600 bg-emerald-50 text-emerald-950',
    rose: 'border-l-rose-600 bg-rose-50 text-rose-950',
    slate: 'border-l-slate-400 bg-slate-50 text-slate-950',
  }[tone]

  return (
    <div className={`rounded-md border border-slate-200 border-l-4 p-4 ${toneClass}`}>
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
    </div>
  )
}

function FinalTribunalSummary({
  alertRows = [],
  canPublishOfficial = true,
  finalRows = [],
  onExportAlerts,
  onExportOfficial,
  onPublishOfficial,
  summary,
}) {
  const safeSummary = summary ?? {
    confirmados: 0,
    confirmadosMinimos: 0,
    bloqueados: 0,
    excluidos: 0,
    pendientes: 0,
  }

  return (
    <section className="soft-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="soft-title">Cierre final</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-950">
            Cronograma oficial y alertas
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={!canPublishOfficial || !finalRows.length}
            onClick={onPublishOfficial}
            type="button"
          >
            <UploadCloud className="h-4 w-4" />
            Publicar portales
          </button>
          <button
            className="btn-secondary"
            disabled={!finalRows.length}
            onClick={onExportOfficial}
            type="button"
          >
            <Download className="h-4 w-4" />
            Oficial
          </button>
          <button
            className="btn-secondary"
            disabled={!alertRows.length}
            onClick={onExportAlerts}
            type="button"
          >
            <AlertTriangle className="h-4 w-4" />
            Alertas
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Confirmados" value={safeSummary.confirmados} tone="emerald" />
        <Metric label="Minimos" value={safeSummary.confirmadosMinimos} tone="amber" />
        <Metric label="Bloqueados" value={safeSummary.bloqueados} tone="rose" />
        <Metric label="Excluidos" value={safeSummary.excluidos} />
        <Metric label="Pendientes" value={safeSummary.pendientes} tone="amber" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-500">
            Cronograma final oficial
          </p>
          <p className="mt-2 text-3xl font-extrabold text-slate-950">{finalRows.length}</p>
          <p className="mt-1 text-sm font-bold text-slate-600">filas normalizadas</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-500">
            Alertas finales
          </p>
          <p className="mt-2 text-3xl font-extrabold text-slate-950">{alertRows.length}</p>
          <p className="mt-1 text-sm font-bold text-slate-600">filas normalizadas</p>
        </div>
      </div>
    </section>
  )
}

export default FinalTribunalSummary
