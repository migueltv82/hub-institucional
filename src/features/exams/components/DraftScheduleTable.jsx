import { Download, LayoutGrid, List } from 'lucide-react'
import { useMemo, useState } from 'react'

function clean(value) {
  return String(value ?? '').trim()
}

function compareText(left, right) {
  return clean(left).localeCompare(clean(right), 'es', { numeric: true, sensitivity: 'base' })
}

const DRAFT_STATUS_LABELS = {
  TEACHER_REVIEW: 'Revision docente',
  READY: 'Lista',
  REVIEWED: 'Revisada',
  READY_FOR_TRIBUNAL: 'Lista para tribunal',
  EXCLUDED_BY_REVIEW: 'Excluida',
  NEEDS_INSTITUTIONAL_REVIEW: 'Revision institucional',
}

const UNASSIGNED_TEACHER_VALUES = new Set([
  '',
  'a designar',
  'sin titular',
  'titular a designar',
  'docente a designar',
])

function formatDraftStatus(value) {
  const status = clean(value)
  return DRAFT_STATUS_LABELS[status] ?? (status ? status.replaceAll('_', ' ').toLowerCase() : 'Sin estado')
}

function hasDetectedTeacher(row = {}) {
  return !UNASSIGNED_TEACHER_VALUES.has(clean(row.titular).toLowerCase())
}

function teacherReviewLabel(row = {}) {
  return hasDetectedTeacher(row) ? 'Titular detectado' : 'Sin titular'
}

function formatDate(value) {
  const date = new Date(`${clean(value)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return clean(value) || 'Sin fecha'
  const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(date)
  return `${weekday} ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

function yearLabel(value) {
  const year = Number(value)
  return Number.isFinite(year) && year > 0 ? `${year}º año` : clean(value) || 'Sin año'
}

function getCellKey(row) {
  return `${clean(row.fecha)}::${clean(row.anio)}`
}

function MesaCard({ row }) {
  const hasObservation = Boolean(clean(row.observaciones))
  return (
    <article className={`rounded-md border-l-4 bg-white px-3 py-2 shadow-sm ${hasObservation ? 'border-l-amber-500' : 'border-l-sky-600'}`}>
      <p className="text-sm font-extrabold leading-5 text-rose-700">{row.materiaMesa || 'Materia sin nombre'}</p>
      <p className="mt-1 text-sm font-extrabold text-slate-950">{row.titular || 'Titular a designar'}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
          {formatDraftStatus(row.estado)}
        </span>
        <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${hasDetectedTeacher(row) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
          {teacherReviewLabel(row)}
        </span>
        {hasObservation ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-900">
            Revisar
          </span>
        ) : null}
      </div>
      {hasObservation ? <p className="mt-2 text-xs font-bold leading-4 text-amber-900">{row.observaciones}</p> : null}
    </article>
  )
}

function CareerScheduleGrid({ rows }) {
  const years = [...new Set(rows.map((row) => clean(row.anio) || 'SIN_ANIO'))].sort(compareText)
  const dates = [...new Set(rows.map((row) => clean(row.fecha) || 'SIN_FECHA'))].sort(compareText)
  const rowsByCell = rows.reduce((map, row) => {
    const key = getCellKey({ fecha: clean(row.fecha) || 'SIN_FECHA', anio: clean(row.anio) || 'SIN_ANIO' })
    const current = map.get(key) ?? []
    current.push(row)
    map.set(key, current)
    return map
  }, new Map())

  return (
    <div className="overflow-auto rounded-lg border border-slate-300" aria-label="Precronograma por carrera">
      <table className="min-w-[820px] border-collapse bg-slate-100">
        <thead className="sticky top-0 z-10">
          <tr className="bg-sky-800 text-white">
            <th className="w-36 border-r border-sky-950 px-3 py-3 text-left text-xs font-extrabold uppercase tracking-wider">Día</th>
            {years.map((year) => (
              <th key={year} className="min-w-64 border-r border-sky-950 px-3 py-3 text-center text-xs font-extrabold uppercase tracking-wider">
                {yearLabel(year === 'SIN_ANIO' ? '' : year)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dates.map((date, dateIndex) => (
            <tr key={date} className={dateIndex % 2 ? 'bg-sky-50' : 'bg-sky-100/70'}>
              <th className="border-r border-t border-sky-900 bg-sky-700 px-3 py-4 text-left text-sm font-extrabold capitalize text-white">
                {formatDate(date === 'SIN_FECHA' ? '' : date)}
              </th>
              {years.map((year) => {
                const cellRows = rowsByCell.get(`${date}::${year}`) ?? []
                return (
                  <td key={year} className="border-r border-t border-slate-300 p-2 align-top">
                    <div className="grid gap-2">
                      {cellRows.map((row) => <MesaCard key={row.draftMesaId} row={row} />)}
                      {!cellRows.length ? <span className="block min-h-16" aria-label="Sin mesa" /> : null}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CompactList({ rows }) {
  return (
    <div className="overflow-auto rounded-md border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 bg-white">
        <thead className="bg-slate-50">
          <tr>
            {['Fecha', 'Año', 'Materia/Mesa', 'Titular', 'Estado', 'Observaciones'].map((label) => (
              <th key={label} className="px-3 py-3 text-left text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.draftMesaId}>
              <td className="px-3 py-3 text-sm font-extrabold capitalize text-slate-950">{formatDate(row.fecha)}</td>
              <td className="px-3 py-3 text-sm text-slate-700">{yearLabel(row.anio)}</td>
              <td className="px-3 py-3 text-sm font-extrabold text-rose-700">{row.materiaMesa}</td>
              <td className="px-3 py-3 text-sm text-slate-700">{row.titular}</td>
              <td className="px-3 py-3 text-sm text-slate-700">
                <span className="font-bold text-slate-800">{formatDraftStatus(row.estado)}</span>
                <span className={`mt-1 block text-xs font-extrabold uppercase tracking-wide ${hasDetectedTeacher(row) ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {teacherReviewLabel(row)}
                </span>
              </td>
              <td className="px-3 py-3 text-sm text-slate-700">{row.observaciones || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DraftScheduleTable({ onExport, rows = [] }) {
  const careers = useMemo(
    () => [...new Set(rows.map((row) => clean(row.carrera) || 'Sin carrera'))].sort(compareText),
    [rows],
  )
  const [selectedCareer, setSelectedCareer] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const activeCareer = careers.includes(selectedCareer) ? selectedCareer : careers[0] ?? ''
  const careerRows = rows
    .filter((row) => (clean(row.carrera) || 'Sin carrera') === activeCareer)
    .sort((left, right) => compareText(left.fecha, right.fecha) || compareText(left.anio, right.anio))

  return (
    <section className="soft-card" aria-label="Vista del precronograma">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="soft-title">Borrador de fechas</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-950">Mesas por carrera, fecha y año</h3>
          <p className="mt-2 text-sm font-bold text-slate-600">Formato inspirado en tu grilla habitual, con alertas visibles y desplazamiento horizontal controlado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'} onClick={() => setViewMode('grid')} type="button">
            <LayoutGrid className="h-4 w-4" /> Grilla
          </button>
          <button className={viewMode === 'list' ? 'btn-primary' : 'btn-secondary'} onClick={() => setViewMode('list')} type="button">
            <List className="h-4 w-4" /> Lista
          </button>
          <button className="btn-secondary" disabled={!rows.length} onClick={onExport} type="button">
            <Download className="h-4 w-4" /> Exportar borrador
          </button>
        </div>
      </div>

      {rows.length ? (
        <>
          <div className="my-4 flex gap-2 overflow-x-auto pb-1" aria-label="Carreras del precronograma">
            {careers.map((career) => (
              <button
                key={career}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-extrabold ${career === activeCareer ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                onClick={() => setSelectedCareer(career)}
                type="button"
              >
                {career} · {rows.filter((row) => (clean(row.carrera) || 'Sin carrera') === career).length}
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-sky-50 px-3 py-2">
            <p className="font-extrabold text-sky-950">{activeCareer}</p>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-800">{careerRows.length} mesas en revisión</p>
          </div>
          {viewMode === 'grid' ? <CareerScheduleGrid rows={careerRows} /> : <CompactList rows={careerRows} />}
        </>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm font-bold text-slate-500">Sin precronograma generado.</p>
      )}
    </section>
  )
}

export default DraftScheduleTable
