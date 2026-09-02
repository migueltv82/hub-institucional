import { AlertTriangle, ArrowRight, Database } from 'lucide-react'

function DataReadinessBanner({ missingItems = [], onGoToUploads }) {
  if (!missingItems.length) return null

  return (
    <section className="min-w-0 rounded-md border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-4 md:p-5">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-amber-500 text-white">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-amber-900">
              Faltan datos para continuar
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-950">
              Antes de armar mesas, completa: {missingItems.join(', ')}.
            </p>
          </div>
        </div>
        <button className="btn-primary w-full shrink-0 sm:w-auto" onClick={onGoToUploads} type="button">
          <Database className="h-4 w-4" />
          Ir a carga de datos
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  )
}

export default DataReadinessBanner
