import { Trophy } from 'lucide-react'
import { formatearHoras } from './helpers.js'

function TeacherLoadDashboard({
  maxHorasDocente = 0,
  topDocentes = [],
}) {
  return (
    <section className="rise-in metric-card metric-card--blue">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Dashboard docente
          </p>
          <h4 className="mt-2 text-2xl font-bold text-slate-950">
            Docentes con mayor carga horaria
          </h4>
        </div>
        <Trophy className="h-5 w-5 text-orange-500" />
      </div>

      <div className="mt-5 space-y-4">
        {topDocentes.length === 0 && (
          <p className="text-sm text-slate-600">
            Carga horarios docentes para ver el ranking institucional.
          </p>
        )}

        {topDocentes.map((docente, index) => (
          <div key={docente.profesor} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-950">
                  {index + 1}. {docente.profesor}
                </p>
                <p className="text-xs text-slate-500">
                  {docente.bloques} bloques, {docente.carreras} carreras, {docente.mesasAsignadas} asignaciones en mesas
                </p>
              </div>
              <span className="status-chip border-slate-200 bg-slate-50 text-slate-800">
                {formatearHoras(docente.horas)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#06b6d4,#2563eb,#84cc16)]"
                style={{
                  width: `${maxHorasDocente ? Math.max((docente.horas / maxHorasDocente) * 100, 10) : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default TeacherLoadDashboard
