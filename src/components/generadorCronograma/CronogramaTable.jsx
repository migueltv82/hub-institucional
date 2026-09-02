import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, PencilLine } from 'lucide-react'

function getExamTypeLabel(item) {
  return item.exam_type === 'special' ? 'Especial' : 'Regular'
}

function getExamTypeClass(item) {
  return item.exam_type === 'special'
    ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800'
    : 'border-teal-200 bg-teal-50 text-teal-800'
}

function getStatusLabel(item) {
  return item.estado === 'confirmada' ? 'Confirmada' : 'Pendiente'
}

function getStatusClass(item) {
  return item.estado === 'confirmada'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-amber-200 bg-amber-50 text-amber-800'
}

function getSubjectName(item) {
  return item.nombreMateria || item.subject_name || item.nombre || item.materia || 'Materia sin nombre'
}

function getVocalesLabel(item) {
  return [item.vocal1, item.vocal2]
    .filter((vocal) => vocal && vocal !== 'A designar')
    .join(' / ') || 'A designar'
}

function getCallLabel(item) {
  return item.llamado || (item.exam_call === 'second' ? 'Segundo llamado' : '')
}

function clean(value) {
  return String(value ?? '').trim()
}

function normalizeCareer(value) {
  return clean(value)
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
}

function agruparMesasPorCarrera(cronograma, careerOptions = []) {
  const grupos = new Map()

  careerOptions.forEach((career) => {
    const carrera = clean(career)
    const key = normalizeCareer(carrera)
    if (!carrera || grupos.has(key)) return

    grupos.set(key, {
      carrera,
      mesas: [],
    })
  })

  cronograma.forEach((mesa) => {
    const carrera = mesa.carrera || 'Carrera sin nombre'
    const key = normalizeCareer(carrera)

    if (!grupos.has(key)) {
      grupos.set(key, {
        carrera,
        mesas: [],
      })
    }

    grupos.get(key).mesas.push(mesa)
  })

  return [...grupos.values()]
    .map((grupo) => ({
      ...grupo,
      confirmadas: grupo.mesas.filter((mesa) => mesa.estado === 'confirmada').length,
    }))
    .sort((a, b) => a.carrera.localeCompare(b.carrera, 'es', { sensitivity: 'base' }))
}

function EmptyCareerNotice() {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-600">
      Esta carrera esta cargada, pero no tiene mesas generadas. Revisa que sus materias figuren en Horarios docentes y que los codigos coincidan con el plan de estudios.
    </div>
  )
}

function MesaChips({ item }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`cronograma-chip ${getStatusClass(item)}`}>
        {getStatusLabel(item)}
      </span>
      <span className={`cronograma-chip ${getExamTypeClass(item)}`}>
        {getExamTypeLabel(item)}
      </span>
    </div>
  )
}

function MesaActions({
  canEditWorkspace,
  item,
  onEditMesa,
  onToggleConfirmacion,
}) {
  return (
    <div className="cronograma-actions">
      <button
        className="btn-secondary cronograma-action-button"
        disabled={!canEditWorkspace}
        onClick={() => onToggleConfirmacion(item.id)}
        title={item.estado === 'confirmada' ? 'Volver a pendiente' : 'Confirmar mesa'}
        type="button"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>{item.estado === 'confirmada' ? 'Reabrir' : 'Confirmar'}</span>
      </button>
      <button
        className="btn-secondary cronograma-action-button"
        disabled={!canEditWorkspace}
        onClick={() => onEditMesa(item)}
        title="Editar mesa manualmente"
        type="button"
      >
        <PencilLine className="h-4 w-4 shrink-0" />
        <span>Editar</span>
      </button>
    </div>
  )
}

function EmptyCronograma() {
  return (
    <div className="table-wrap rise-in p-8 text-center text-sm text-slate-500">
      Carga los archivos, define las fechas y genera el cronograma para verlo aqui.
    </div>
  )
}

/* ── Desktop table row ─────────────────────────────────────────────── */

function MesaTableRow({ canEditWorkspace, item, onEditMesa, onToggleConfirmacion }) {
  return (
    <tr className="cronograma-table-row">
      {/* Mesa */}
      <td className="px-3 py-3">
        <p className="text-base font-extrabold text-slate-950">#{item.mesa}</p>
        {getCallLabel(item) && (
          <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            {getCallLabel(item)}
          </p>
        )}
        <div className="mt-2">
          <MesaChips item={item} />
        </div>
        {item.ajusteManual && (
          <p className="mt-2 text-xs font-medium leading-4 text-slate-500">Ajuste manual</p>
        )}
      </td>

      {/* Fecha */}
      <td className="px-3 py-3">
        <p className="font-semibold text-slate-950">{item.fecha}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{item.dia}</p>
      </td>

      {/* Materia */}
      <td className="px-3 py-3">
        <p className="break-words font-semibold leading-5 text-slate-950">{getSubjectName(item)}</p>
        {item.observacionManual && (
          <p className="mt-2 break-words text-xs leading-5 text-slate-500">{item.observacionManual}</p>
        )}
      </td>

      {/* Tribunal */}
      <td className="px-3 py-3">
        <p className="break-words font-semibold leading-5 text-slate-900">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Titular</span>
          <br />
          {item.profesorTitular}
        </p>
        <p className="mt-2 break-words text-xs leading-5 text-slate-600">
          <span className="font-bold uppercase tracking-wide text-slate-500">Vocales</span>
          <br />
          {getVocalesLabel(item)}
        </p>
      </td>

      {/* Acciones */}
      <td className="px-3 py-3">
        <MesaActions
          canEditWorkspace={canEditWorkspace}
          item={item}
          onEditMesa={onEditMesa}
          onToggleConfirmacion={onToggleConfirmacion}
        />
      </td>
    </tr>
  )
}

/* ── Career accordion panel ────────────────────────────────────────── */

function CareerPanel({
  canEditWorkspace,
  grupo,
  defaultOpen,
  onEditMesa,
  onToggleConfirmacion,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="cronograma-career-panel">
      <button
        className="cronograma-career-summary"
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
        aria-expanded={isOpen}
      >
        <span className="cronograma-career-toggle">
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1 break-words text-left text-sm font-extrabold uppercase tracking-[0.14em] text-slate-800">
          {grupo.carrera}
        </span>
        <span className="cronograma-career-badge">
          {grupo.mesas.length} mesa{grupo.mesas.length !== 1 ? 's' : ''} · {grupo.confirmadas} confirmada{grupo.confirmadas !== 1 ? 's' : ''}
        </span>
      </button>

      {isOpen && (
        <>
          {grupo.mesas.length === 0 ? (
            <EmptyCareerNotice />
          ) : (
            <>
              {/* ── Desktop table ── */}
              <div className="cronograma-table-container">
                <div className="table-wrap cronograma-table-wrap mt-3">
                  <table className="cronograma-table text-sm">
                    <colgroup>
                      <col className="cronograma-col-mesa" />
                      <col className="cronograma-col-fecha" />
                      <col className="cronograma-col-materia" />
                      <col className="cronograma-col-tribunal" />
                      <col className="cronograma-col-acciones" />
                    </colgroup>
                    <thead className="text-left">
                      <tr>
                        <th className="px-3 py-3 font-semibold">Mesa</th>
                        <th className="px-3 py-3 font-semibold">Fecha</th>
                        <th className="px-3 py-3 font-semibold">Materia</th>
                        <th className="px-3 py-3 font-semibold">Tribunal</th>
                        <th className="px-3 py-3 font-semibold">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.mesas.map((item) => (
                        <MesaTableRow
                          canEditWorkspace={canEditWorkspace}
                          item={item}
                          key={item.id}
                          onEditMesa={onEditMesa}
                          onToggleConfirmacion={onToggleConfirmacion}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Mobile cards ── */}
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────────── */

function CronogramaTable({
  canEditWorkspace = true,
  careerOptions = [],
  cronograma,
  onEditMesa,
  onToggleConfirmacion,
}) {
  if (cronograma.length === 0) return <EmptyCronograma />
  const gruposPorCarrera = agruparMesasPorCarrera(cronograma, careerOptions)

  return (
    <div className="cronograma-career-list rise-in">
      {gruposPorCarrera.map((grupo) => (
        <CareerPanel
          canEditWorkspace={canEditWorkspace}
          defaultOpen={false}
          grupo={grupo}
          key={grupo.carrera}
          onEditMesa={onEditMesa}
          onToggleConfirmacion={onToggleConfirmacion}
        />
      ))}
    </div>
  )
}

export default CronogramaTable
