import { UsersRound } from 'lucide-react'
import { getTeachersFromProfiles } from '../../services/teacherAccess.js'

function TeacherAccessSection({
  horariosDocentes,
  docentes,
  isLoading,
  lastResult,
  onProvisionTeachers,
  useRemoteWorkspace,
}) {
  const teachers = getTeachersFromProfiles(docentes, horariosDocentes)
  const withDni = teachers.filter((teacher) => teacher.dni).length

  return (
    <section className="rise-in soft-card soft-card--tint-teal border-l-4 border-l-teal-600">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-teal-700">
            <UsersRound className="h-4 w-4" />
            Accesos docentes
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-slate-950">
            Crear cuentas docentes desde padron
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Se toma la ficha desde la planilla de docentes. Materias y horas se cruzan automaticamente con horarios docentes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
              {teachers.length} docentes detectados
            </span>
            <span className="status-chip border-teal-200 bg-teal-50 text-teal-900">
              {withDni} con DNI
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary min-w-56"
            onClick={onProvisionTeachers}
            disabled={isLoading || teachers.length === 0 || !useRemoteWorkspace}
          >
            {isLoading ? 'Creando...' : 'Crear accesos docentes'}
          </button>
        </div>
      </div>

      {!useRemoteWorkspace && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Necesitas una sesion remota con Supabase para crear cuentas docentes.
        </div>
      )}

      {lastResult && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Resultado: {lastResult.created} creados, {lastResult.updated} actualizados, {lastResult.failed} con error.
        </div>
      )}
    </section>
  )
}

export default TeacherAccessSection
