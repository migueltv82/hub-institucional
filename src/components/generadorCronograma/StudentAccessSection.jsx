import { KeyRound, UserPlus, UsersRound } from 'lucide-react'

function StudentAccessSection({
  extraActions = null,
  alumnos,
  isLoading,
  lastResult,
  onProvisionStudents,
  useRemoteWorkspace,
}) {
  const total = Array.isArray(alumnos) ? alumnos.length : 0
  const resultErrors = Array.isArray(lastResult?.errors) ? lastResult.errors : []
  const canProvision = total > 0 && useRemoteWorkspace && !isLoading

  return (
    <section className="rise-in soft-card soft-card--tint-amber border-l-4 border-l-lime-500">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-lime-700">
            <UsersRound className="h-4 w-4" />
            Accesos de alumnos
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-slate-950">
            Crear usuarios desde el padron cargado
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Se creara una cuenta por alumno usando el email como usuario y el DNI como contrasena inicial.
            Los alumnos quedan con rol de portal y acceso lector a esta institucion.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
            <span className="status-chip border-lime-200 bg-lime-50 text-lime-800">
              {total} alumnos cargados
            </span>
            <span className="status-chip border-slate-200 bg-white text-slate-700">
              <KeyRound className="h-4 w-4" />
              Contrasena inicial: DNI
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {extraActions}
          <button
            className="btn-primary min-w-56"
            disabled={!canProvision}
            onClick={onProvisionStudents}
            type="button"
          >
            <UserPlus className="h-4 w-4" />
            {isLoading ? 'Creando accesos...' : 'Crear accesos'}
          </button>
        </div>
      </div>

      {!useRemoteWorkspace && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Para crear usuarios reales necesitas iniciar sesion remota en Supabase y tener una institucion activa.
        </div>
      )}

      {lastResult && (
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
            Creados: <strong>{lastResult.created ?? 0}</strong>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900">
            Actualizados: <strong>{lastResult.updated ?? 0}</strong>
          </div>
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-900">
            Errores: <strong>{lastResult.failed ?? 0}</strong>
          </div>
        </div>
      )}

      {resultErrors.length > 0 && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-950">
          <p className="font-extrabold">Filas con error</p>
          <ul className="mt-2 space-y-1">
            {resultErrors.slice(0, 6).map((entry, index) => (
              <li key={`${entry.row ?? index}-${entry.email ?? 'sin-email'}`}>
                Fila {entry.row ?? '?'}: {entry.email || 'sin email'} - {entry.error}
              </li>
            ))}
          </ul>
          {resultErrors.length > 6 && (
            <p className="mt-2 font-semibold">
              Hay {resultErrors.length - 6} errores mas en el resultado del proceso.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export default StudentAccessSection
