import { CheckCircle2, Clock, RefreshCcw, ShieldAlert } from 'lucide-react'

const STATUS_BADGES = {
  confirmed: { label: 'Confirmada', className: 'bg-emerald-100 text-emerald-800' },
  objected: { label: 'Objetada', className: 'bg-rose-100 text-rose-800' },
  pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-900' },
}

const ROLE_LABELS = {
  titular: 'Titular',
  vocal1: 'Vocal 1',
  vocal2: 'Vocal 2',
}

function mesaPendingEntries(mesa = {}) {
  return [mesa.titular, mesa.vocal1, mesa.vocal2]
    .filter((entry) => entry?.teacherId && entry.status !== 'confirmed')
}

function RoleStatus({ canConfirmAsAdmin = false, disabled = false, entry, onConfirmAsAdmin, role }) {
  if (!entry) {
    return (
      <div className="text-xs font-bold text-slate-400">
        {ROLE_LABELS[role]}: sin publicar
      </div>
    )
  }

  const badge = STATUS_BADGES[entry.status] ?? STATUS_BADGES.pending

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{ROLE_LABELS[role]}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="text-sm font-bold text-slate-800">{entry.nombre || 'Sin nombre'}</p>
      {entry.status === 'objected' && entry.notas ? (
        <p className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-xs font-bold text-rose-900">{entry.notas}</p>
      ) : null}
      {entry.reassignmentStatus === 'accepted' && entry.automaticSwap ? (
        <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-900">
          Reubicacion automatica aplicada: {entry.automaticSwapSourceDate || entry.automaticSwap.source_exam_table_id} → {entry.automaticSwapTargetDate || entry.automaticSwap.target_exam_table_id}.
        </p>
      ) : null}
      {entry.reassignmentStatus === 'requested' ? (
        <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">
          Cambio solicitado para {entry.requestedDate || 'otra fecha'}. Requiere resolucion administrativa.
        </p>
      ) : null}
      {canConfirmAsAdmin && entry.teacherId && entry.status !== 'confirmed' ? (
        <button
          className="btn-secondary mt-2 px-2 py-1 text-xs"
          disabled={disabled}
          onClick={() => onConfirmAsAdmin?.(entry.examTableId, entry.teacherId)}
          type="button"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Confirmar
        </button>
      ) : null}
    </div>
  )
}

function TeacherConfirmationStatusPanel({
  counts = { confirmed: 0, pending: 0, objected: 0, total: 0 },
  canConfirmAsAdmin = false,
  isLoading = false,
  mesas = [],
  onConfirmAssignmentAsAdmin,
  onConfirmMesaAsAdmin,
  onConfirmReadyMesas,
  onRefresh,
}) {
  return (
    <section className="soft-card" aria-label="Confirmaciones docentes">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="soft-title">Revisión docente</p>
          <h3 className="mt-2 text-2xl font-extrabold text-slate-950">Estado real de confirmación por mesa</h3>
          <p className="mt-2 max-w-2xl text-sm font-bold text-slate-600">
            Lo que cada docente confirmó u objetó desde su portal. Los docentes sin cuenta de portal no aparecen acá
            — para ellos seguí usando la importación manual de abajo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onConfirmReadyMesas ? (
            <button
              className="btn-primary"
              disabled={isLoading || !mesas.length}
              type="button"
              onClick={onConfirmReadyMesas}
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirmar mesas listas
            </button>
          ) : null}
          <button className="btn-secondary" disabled={isLoading} type="button" onClick={onRefresh}>
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          <p className="text-sm font-extrabold text-emerald-950">{counts.confirmed} confirmadas</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <Clock className="h-4 w-4 text-amber-700" />
          <p className="text-sm font-extrabold text-amber-950">{counts.pending} pendientes</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
          <ShieldAlert className="h-4 w-4 text-rose-700" />
          <p className="text-sm font-extrabold text-rose-950">{counts.objected} objetadas</p>
        </div>
      </div>

      {mesas.length ? (
        <div className="mt-4 space-y-3">
          {mesas.map((mesa) => (
            <article key={mesa.draftMesaId} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-sm font-extrabold text-slate-950">{mesa.materiaMesa || 'Materia sin nombre'}</p>
                <p className="text-xs font-bold text-slate-500">{mesa.carrera} · {mesa.fecha}</p>
              </div>
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <RoleStatus
                  canConfirmAsAdmin={canConfirmAsAdmin}
                  disabled={isLoading}
                  entry={mesa.titular}
                  role="titular"
                  onConfirmAsAdmin={onConfirmAssignmentAsAdmin}
                />
                <RoleStatus
                  canConfirmAsAdmin={canConfirmAsAdmin}
                  disabled={isLoading}
                  entry={mesa.vocal1}
                  role="vocal1"
                  onConfirmAsAdmin={onConfirmAssignmentAsAdmin}
                />
                <RoleStatus
                  canConfirmAsAdmin={canConfirmAsAdmin}
                  disabled={isLoading}
                  entry={mesa.vocal2}
                  role="vocal2"
                  onConfirmAsAdmin={onConfirmAssignmentAsAdmin}
                />
              </div>
              {canConfirmAsAdmin && mesaPendingEntries(mesa).length > 0 ? (
                <button
                  className="btn-secondary mt-3 px-2 py-1 text-xs"
                  disabled={isLoading}
                  onClick={() => onConfirmMesaAsAdmin?.(mesa.draftMesaId)}
                  type="button"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Confirmar mesa
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm font-bold text-slate-500">
          Todavía no publicaste el precronograma para revisión docente.
        </p>
      )}
    </section>
  )
}

export default TeacherConfirmationStatusPanel
