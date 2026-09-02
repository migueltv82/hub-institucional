import { AlertTriangle, CheckCircle2, UsersRound } from 'lucide-react'
import { buildDocenteMateriaTribunalDiagnosis } from '../../utils/docenteMateriaMatrix.js'

const statusLabels = {
  COMPLETA: 'Lista',
  SIN_TITULAR: 'Sin titular',
  VOCALES_INSUFICIENTES: 'Faltan vocales',
  SIN_TITULAR_Y_VOCALES: 'Sin titular ni vocales',
}

function getStatusClass(status) {
  if (status === 'COMPLETA') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'SIN_TITULAR') return 'border-rose-200 bg-rose-50 text-rose-800'
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

function TribunalMatrixDiagnosis({ docenteMateria = [], planesEstudio = [] }) {
  const diagnosis = buildDocenteMateriaTribunalDiagnosis({ docenteMateria, planesEstudio })
  const { summary } = diagnosis
  const observedSubjects = diagnosis.subjects
    .filter((subject) => !subject.completa)
    .slice(0, 6)

  return (
    <section className="rise-in soft-card soft-card--tint-sky p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <span className="soft-title">Tribunales</span>
          <div className="mt-2 flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-sky-700" />
            <h3 className="text-2xl font-extrabold text-slate-950">Matriz docente-materia</h3>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Controla que cada materia tenga un titular y dos vocales afines antes de generar.
          </p>
        </div>

        <span className={`status-chip ${summary.conObservaciones ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          {summary.conObservaciones ? `${summary.conObservaciones} con observaciones` : 'Tribunales listos'}
        </span>
      </div>

      <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="metric-tile">
          <span>Relaciones</span>
          <strong>{summary.relacionesCargadas}</strong>
        </div>
        <div className="metric-tile">
          <span>Materias</span>
          <strong>{summary.totalMaterias}</strong>
        </div>
        <div className="metric-tile">
          <span>Listas</span>
          <strong>{summary.listasParaTribunal}</strong>
        </div>
        <div className="metric-tile">
          <span>Sin titular</span>
          <strong>{summary.sinTitular + summary.sinTitularYVocales}</strong>
        </div>
        <div className="metric-tile">
          <span>Faltan vocales</span>
          <strong>{summary.vocalesInsuficientes + summary.sinTitularYVocales}</strong>
        </div>
      </div>

      {summary.relacionesCargadas === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white/70 p-4 text-sm font-semibold text-slate-600">
          Carga la matriz docente-materia para ver titulares, vocales afines y materias incompletas.
        </div>
      ) : observedSubjects.length > 0 ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            Primeras materias para revisar
          </div>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            {observedSubjects.map((subject) => (
              <article key={subject.key} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-extrabold text-slate-950">
                      {subject.nombreMateria || subject.materia}
                    </h4>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                      {subject.carrera} {subject.materia ? `- ${subject.materia}` : ''}
                    </p>
                  </div>
                  <span className={`status-chip shrink-0 ${getStatusClass(subject.status)}`}>
                    {statusLabels[subject.status]}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600">
                  <span>Titulares: {subject.titulares.length}</span>
                  <span>Vocales afines: {subject.vocales.length}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          Todas las materias evaluadas tienen titular y dos vocales afines.
        </div>
      )}
    </section>
  )
}

export default TribunalMatrixDiagnosis
