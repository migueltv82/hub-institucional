import { useRef, useState } from 'react'
import { Download, History, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  buildStudentHistoryTemplateBuffer,
  describeHistoryReason,
  importStudentHistory,
  parseStudentHistoryWorkbook,
} from '../../services/studentHistoryImport.js'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// I2a: carga de la historia academica previa (aprobadas, regulares, libres). Habilita mesas y correlativas
// de los alumnos que ya venian cursando antes de usar el sistema.
function StudentHistoryImportSection({ canEditWorkspace, institutionId, useRemoteWorkspace, workspaceKey = 'main' }) {
  const inputRef = useRef(null)
  const [progress, setProgress] = useState(null)
  const [report, setReport] = useState(null)
  const isImporting = Boolean(progress)
  const canImport = canEditWorkspace && useRemoteWorkspace && Boolean(institutionId) && !isImporting

  async function downloadTemplate() {
    try {
      const buffer = await buildStudentHistoryTemplateBuffer()
      const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'plantilla-historia-academica.xlsx'
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo generar la plantilla.')
    }
  }

  async function onFileSelected(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setReport(null)
    try {
      const rows = await parseStudentHistoryWorkbook(file)
      setProgress({ done: 0, total: rows.length })
      const result = await importStudentHistory({ institutionId, workspaceKey, rows, onProgress: setProgress })
      setReport(result)
      toast.success(`Historia importada: ${result.importadas} nuevas, ${result.actualizadas} actualizadas.`)
    } catch (error) {
      if (error.partialReport) setReport(error.partialReport)
      toast.error(error.message)
    } finally {
      setProgress(null)
    }
  }

  const problems = Array.isArray(report?.problemas) ? report.problemas : []

  return (
    <section className="rise-in soft-card border-l-4 border-l-violet-500">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-violet-700">
            <History className="h-4 w-4" />
            Historia académica
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-slate-950">Importar materias aprobadas y regulares previas</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Para los alumnos que ya venian cursando: con su historia cargada pueden inscribirse a mesas y a materias
            con correlativas. Primero crea los accesos de alumnos. Nunca se pisan notas cargadas por un docente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={downloadTemplate} type="button">
            <Download className="h-4 w-4" />
            Descargar plantilla
          </button>
          <button className="btn-primary min-w-56" disabled={!canImport} onClick={() => inputRef.current?.click()} type="button">
            <Upload className="h-4 w-4" />
            {isImporting ? `Importando ${progress.done} de ${progress.total}...` : 'Importar historia'}
          </button>
          <input accept=".xlsx" aria-label="Archivo de historia académica" className="hidden" onChange={onFileSelected} ref={inputRef} type="file" />
        </div>
      </div>

      {!useRemoteWorkspace && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Para importar historia necesitas iniciar sesión remota en Supabase y tener una institución activa.
        </div>
      )}

      {report && (
        <div className="mt-4 space-y-3" role="status">
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="status-chip border-emerald-200 bg-emerald-50 text-emerald-800">{report.importadas} nuevas</span>
            <span className="status-chip border-sky-200 bg-sky-50 text-sky-800">{report.actualizadas} actualizadas</span>
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
                      <td className={problem.estado === 'omitida' ? 'px-3 py-2 text-slate-600' : 'px-3 py-2 text-rose-700'}>
                        {describeHistoryReason(problem.motivo)}
                      </td>
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

export default StudentHistoryImportSection
