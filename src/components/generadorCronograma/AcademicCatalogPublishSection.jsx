import { useRef, useState } from 'react'
import { BookOpenCheck, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { publishAcademicCatalog, readAcademicCatalogFile, summarizeCatalog } from '../../services/academicCatalogPublish.js'

// I2c: publica el catalogo academico (carreras, planes, materias, correlativas y plan de cada alumno) que
// usan las inscripciones, el libro docente y las mesas. Primero vista previa con errores; despues publicar.
function AcademicCatalogPublishSection({ canPublish, inscripcionesAlumnos = [], institutionId, useRemoteWorkspace }) {
  const inputRef = useRef(null)
  const [withPrerequisites, setWithPrerequisites] = useState(false)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState('')
  const enabled = canPublish && useRemoteWorkspace && Boolean(institutionId) && !busy

  async function onFileSelected(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPreview(null)
    setResult(null)
    setBusy('reading')
    try {
      const catalog = await readAcademicCatalogFile(file, { inscripcionesAlumnos, withPrerequisites })
      setPreview({ catalog, fileName: file.name, withPrerequisites })
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }

  async function publish() {
    if (!preview) return
    setBusy('publishing')
    try {
      const published = await publishAcademicCatalog({ institutionId, catalog: preview.catalog })
      setResult(published)
      setPreview(null)
      toast.success(`Catalogo publicado: ${published.carreras} carreras, ${published.materiasEnPlanes} materias en planes.`)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }

  const summary = preview ? summarizeCatalog(preview.catalog, { withPrerequisites: preview.withPrerequisites }) : null
  const errors = preview?.catalog.errors ?? []
  const warnings = preview?.catalog.warnings ?? []

  return (
    <section className="rise-in soft-card border-l-4 border-l-emerald-500">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">
            <BookOpenCheck className="h-4 w-4" />
            Catalogo académico
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-slate-950">Publicar carreras, planes y materias</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Usa la planilla académica (plantilla maestra). Publicar de nuevo actualiza sin duplicar. Si ya importaste
            alumnos, cada uno queda en el plan de su planilla; si no, se asigna solo cuando la carrera tiene un único plan activo.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              checked={withPrerequisites}
              disabled={Boolean(busy)}
              onChange={(event) => { setWithPrerequisites(event.target.checked); setPreview(null) }}
              type="checkbox"
            />
            Con correlativas (solo si la hoja correlatividades esta revisada)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary min-w-48" disabled={!enabled} onClick={() => inputRef.current?.click()} type="button">
            <Upload className="h-4 w-4" />
            {busy === 'reading' ? 'Leyendo planilla...' : 'Elegir planilla académica'}
          </button>
          <button className="btn-primary min-w-40" disabled={!enabled || !preview || errors.length > 0} onClick={publish} type="button">
            {busy === 'publishing' ? 'Publicando...' : 'Publicar catalogo'}
          </button>
          <input accept=".xlsx" aria-label="Planilla académica" className="hidden" onChange={onFileSelected} ref={inputRef} type="file" />
        </div>
      </div>

      {!canPublish && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Solo el owner o admin de la institución publica el catalogo.
        </div>
      )}
      {canPublish && !useRemoteWorkspace && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Para publicar el catalogo necesitas iniciar sesión remota en Supabase y tener una institución activa.
        </div>
      )}

      {summary && (
        <div className="mt-4 space-y-3" role="status">
          <p className="text-sm font-semibold text-slate-700">Vista previa de {preview.fileName}</p>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="status-chip border-slate-200 bg-white text-slate-700">{summary.carreras} carreras</span>
            <span className="status-chip border-slate-200 bg-white text-slate-700">{summary.planes} planes</span>
            <span className="status-chip border-slate-200 bg-white text-slate-700">{summary.materiasEnPlanes} materias en planes</span>
            <span className="status-chip border-slate-200 bg-white text-slate-700">
              {summary.correlativas === null ? 'sin correlativas' : `${summary.correlativas} correlativas`}
            </span>
            <span className="status-chip border-slate-200 bg-white text-slate-700">{summary.alumnosConPlan} alumnos con plan en planilla</span>
          </div>
          {errors.length > 0 && (
            <ul className="max-h-60 list-disc space-y-1 overflow-auto rounded-md border border-rose-200 bg-rose-50 py-2 pl-8 pr-3 text-sm text-rose-800">
              {errors.map((message, index) => <li key={`error-${index}`}>{message}</li>)}
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="max-h-60 list-disc space-y-1 overflow-auto rounded-md border border-amber-200 bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">
              {warnings.map((message, index) => <li key={`warning-${index}`}>{message}</li>)}
            </ul>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold" role="status">
          <span className="status-chip border-emerald-200 bg-emerald-50 text-emerald-800">{result.carreras} carreras</span>
          <span className="status-chip border-emerald-200 bg-emerald-50 text-emerald-800">{result.planes} planes</span>
          <span className="status-chip border-emerald-200 bg-emerald-50 text-emerald-800">{result.materiasEnPlanes} materias en planes</span>
          <span className="status-chip border-emerald-200 bg-emerald-50 text-emerald-800">{result.correlativas} correlativas</span>
          <span className="status-chip border-sky-200 bg-sky-50 text-sky-800">{result.alumnosConPlan} de {result.alumnosActivos} alumnos con plan</span>
        </div>
      )}
    </section>
  )
}

export default AcademicCatalogPublishSection
