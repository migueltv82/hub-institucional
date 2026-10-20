import { useState } from 'react'
import { BookOpenCheck, UserCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  applyStudentEnrollments,
  applyTeacherAssignments,
  buildStudentEnrollmentRows,
  planTeacherAssignmentRows,
  describeBulkRosterReason,
} from '../../services/bulkRoster.js'

// I2b: titularidades y cursadas desde las planillas cargadas, de una vez. Antes se hacian de a una.
function BulkRosterSection({ canEditWorkspace, docenteMateria, inscripcionesAlumnos, institutionId, useRemoteWorkspace, workspaceKey = 'main' }) {
  const [running, setRunning] = useState('')
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const teacherPlan = planTeacherAssignmentRows(docenteMateria)
  const teacherRows = teacherPlan.rows
  const studentRows = buildStudentEnrollmentRows(inscripcionesAlumnos)
  const canRun = canEditWorkspace && useRemoteWorkspace && Boolean(institutionId) && !running

  async function run(kind) {
    const rows = kind === 'teachers' ? teacherRows : studentRows
    const apply = kind === 'teachers' ? applyTeacherAssignments : applyStudentEnrollments
    setRunning(kind)
    setResult(null)
    setProgress({ done: 0, total: rows.length })
    try {
      const skipped = kind === 'teachers' ? teacherPlan.skipped : []
      const report = await apply({ institutionId, workspaceKey, rows, skipped, onProgress: setProgress })
      setResult({ kind, report })
      toast.success(`${kind === 'teachers' ? 'Titularidades' : 'Cursadas'}: ${report.creadas} nuevas, ${report.actualizadas} actualizadas.`)
    } catch (error) {
      if (error.partialReport) setResult({ kind, report: error.partialReport })
      toast.error(error.message)
    } finally {
      setRunning('')
      setProgress(null)
    }
  }

  const report = result?.report
  const problems = Array.isArray(report?.problemas) ? report.problemas : []

  return (
    <section className="rise-in soft-card border-l-4 border-l-sky-500">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-sky-700">
            <BookOpenCheck className="h-4 w-4" />
            Cursadas y titulares
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-slate-950">Aplicar las planillas de una vez</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Asigna cada docente a sus materias (hoja docente_materia) e inscribe a cada alumno en sus cursadas
            (hoja alumnos_inscripciones). Primero crea los accesos. Repetir no duplica y nada se borra. Las filas
            marcadas como renuncia, baja o reemplazado, o con la vigencia vencida, no se asignan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!canRun || !(teacherRows.length || teacherPlan.skipped.length)} onClick={() => run('teachers')} type="button">
            <UserCheck className="h-4 w-4" />
            {running === 'teachers' && progress ? `Asignando ${progress.done} de ${progress.total}...` : `Aplicar titularidades (${teacherRows.length})`}
          </button>
          <button className="btn-primary" disabled={!canRun || !studentRows.length} onClick={() => run('students')} type="button">
            <BookOpenCheck className="h-4 w-4" />
            {running === 'students' && progress ? `Inscribiendo ${progress.done} de ${progress.total}...` : `Inscribir cursadas (${studentRows.length})`}
          </button>
        </div>
      </div>

      {report && (
        <div className="mt-4 space-y-3" role="status">
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="status-chip border-emerald-200 bg-emerald-50 text-emerald-800">{report.creadas} nuevas</span>
            <span className="status-chip border-sky-200 bg-sky-50 text-sky-800">{report.actualizadas} actualizadas</span>
            <span className="status-chip border-slate-200 bg-white text-slate-700">{report.sin_cambios} ya estaban</span>
            <span className="status-chip border-slate-200 bg-white text-slate-700">{report.omitidas} omitidas</span>
            <span className="status-chip border-rose-200 bg-rose-50 text-rose-800">{report.rechazadas} con error</span>
          </div>
          {problems.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">DNI</th>
                    <th className="px-3 py-2">Materia</th>
                    <th className="px-3 py-2">Que paso</th>
                  </tr>
                </thead>
                <tbody>
                  {problems.map((problem, index) => (
                    <tr className="border-t border-slate-100" key={`${problem.fila}-${index}`}>
                      <td className="px-3 py-2 font-bold text-slate-700">{problem.fila}</td>
                      <td className="px-3 py-2 text-slate-700">{problem.dni}</td>
                      <td className="px-3 py-2 text-slate-700">{problem.materia}</td>
                      <td className={problem.estado === 'omitida' ? 'px-3 py-2 text-slate-600' : 'px-3 py-2 text-rose-700'}>{describeBulkRosterReason(problem.motivo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export default BulkRosterSection
