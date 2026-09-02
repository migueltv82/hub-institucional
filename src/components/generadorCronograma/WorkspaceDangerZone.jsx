import { AlertTriangle, Trash2 } from 'lucide-react'

const countItems = [
  { key: 'uploadedFiles', label: 'Archivos' },
  { key: 'docentes', label: 'Docentes' },
  { key: 'planesEstudio', label: 'Materias/planes' },
  { key: 'horariosDocentes', label: 'Horarios' },
  { key: 'alumnos', label: 'Alumnos' },
  { key: 'docenteMateria', label: 'Titularidades' },
  { key: 'cronograma', label: 'Mesas' },
]

function WorkspaceDangerZone({
  activeInstitutionName = '',
  canEditWorkspace = true,
  counts = {},
  isClearing = false,
  onClearWorkspace,
  useRemoteWorkspace = false,
}) {
  const hasData = countItems.some((item) => Number(counts[item.key] ?? 0) > 0)

  return (
    <section className="rise-in">
      <article className="soft-card border-red-200 bg-red-50/70 p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-700" />
              <span className="text-xs font-extrabold uppercase tracking-[0.16em] text-red-800">
                Zona de borrado
              </span>
            </div>
            <h4 className="mt-2 text-xl font-extrabold text-slate-950">Eliminar toda la carga</h4>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-red-950">
              Vacia planillas, padrones, horarios, titularidades, inscripciones, notas, asistencia y mesas del workspace.
              No elimina la institucion activa, usuarios, roles ni accesos.
            </p>
            <p className="mt-2 text-xs font-bold text-red-900">
              {activeInstitutionName ? `Institucion: ${activeInstitutionName}. ` : ''}
              {useRemoteWorkspace ? 'Se borra la carga sincronizada en Supabase.' : 'Se borra la carga local de este navegador.'}
            </p>
          </div>

          <button
            className="btn-secondary shrink-0 border-red-300 px-4 py-3 text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={!canEditWorkspace || isClearing || !hasData}
            onClick={onClearWorkspace}
          >
            <Trash2 className="h-4 w-4" />
            {isClearing ? 'Borrando...' : 'Eliminar carga'}
          </button>
        </div>

        <dl className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {countItems.map((item) => (
            <div key={item.key} className="rounded-md border border-red-100 bg-white px-3 py-2">
              <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-red-800">{item.label}</dt>
              <dd className="mt-1 text-xl font-extrabold text-slate-950">{Number(counts[item.key] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      </article>
    </section>
  )
}

export default WorkspaceDangerZone
