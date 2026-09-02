import { Download, FileText, Send } from 'lucide-react'
import { useMemo, useState } from 'react'

function clean(value) {
  return String(value ?? '').trim()
}

function compareText(left, right) {
  return clean(left).localeCompare(clean(right), 'es', { numeric: true, sensitivity: 'base' })
}

function getCareer(row = {}) {
  return clean(row.carrera) || 'Sin carrera'
}

function TribunalReviewTable({
  onExport,
  onExportPdf,
  onPublishForReview,
  rows = [],
}) {
  const careers = useMemo(
    () => [...new Set(rows.map(getCareer))].sort(compareText),
    [rows],
  )
  const [selectedCareer, setSelectedCareer] = useState('')
  const activeCareer = careers.includes(selectedCareer) ? selectedCareer : careers[0] ?? ''
  const careerRows = rows.filter((row) => getCareer(row) === activeCareer)

  return (
    <section className="soft-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="soft-title">Envio a docentes</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-950">
            Precronograma completo
          </h3>
          <p className="mt-2 text-sm font-bold text-slate-600">
            Incluye fechas, agrupaciones, titular y vocales. Si un docente solicita un cambio,
            vuelve a la mesa correspondiente, editala y guarda nuevamente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!rows.length} onClick={onPublishForReview} type="button">
            <Send className="h-4 w-4" />
            Publicar para revision docente
          </button>
          <button className="btn-secondary" disabled={!rows.length} onClick={onExportPdf} type="button">
            <FileText className="h-4 w-4" />
            PDF para docentes
          </button>
          <button className="btn-secondary" disabled={!rows.length} onClick={onExport} type="button">
            <Download className="h-4 w-4" />
            Planilla editable
          </button>
        </div>
      </div>
      <p className="mt-3 rounded-md bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900">
        &quot;Publicar para revision docente&quot; solo llega a los docentes que ya tienen cuenta de
        portal creada con el mismo email cargado en la planilla de docentes. Al resto seguí
        enviándoles el PDF por fuera.
      </p>

      {rows.length ? (
        <div className="my-4 flex gap-2 overflow-x-auto pb-1" aria-label="Carreras del precronograma completo">
          {careers.map((career) => (
            <button
              key={career}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-extrabold ${career === activeCareer ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
              onClick={() => setSelectedCareer(career)}
              type="button"
            >
              {career} · {rows.filter((row) => getCareer(row) === career).length}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        <div className="max-h-[420px] overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 bg-white">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                {['Fecha', 'Carrera', 'Anio', 'Materia/Mesa', 'Titular', 'Vocal 1', 'Vocal 2', 'Estado', 'Alertas'].map((label) => (
                  <th key={label} className="px-3 py-3 text-left text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {careerRows.length ? careerRows.map((row) => (
                <tr key={row.draftMesaId}>
                  <td className="px-3 py-3 align-top text-sm font-extrabold text-slate-950">{row.fecha}</td>
                  <td className="px-3 py-3 align-top text-sm text-slate-700">{row.carrera}</td>
                  <td className="px-3 py-3 align-top text-sm text-slate-700">{row.anio}</td>
                  <td className="px-3 py-3 align-top text-sm font-extrabold text-slate-950">{row.materiaMesa}</td>
                  <td className="px-3 py-3 align-top text-sm text-slate-700">{row.titular}</td>
                  <td className="px-3 py-3 align-top text-sm text-slate-700">{row.vocal1 || '-'}</td>
                  <td className="px-3 py-3 align-top text-sm text-slate-700">{row.vocal2 || '-'}</td>
                  <td className="px-3 py-3 align-top text-sm text-slate-700">{row.estado}</td>
                  <td className="px-3 py-3 align-top text-sm text-slate-700">{row.alertas || '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-8 text-center text-sm font-bold text-slate-500" colSpan={9}>
                    Sin tribunales generados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default TribunalReviewTable
