import { RotateCcw, Trash2 } from 'lucide-react'

function formatDate(value) {
  if (!value) return 'Sin fecha'
  try {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

const PERSON_TYPE_LABELS = {
  student: 'Alumno',
  teacher: 'Docente',
  admin: 'Administrativo',
  staff: 'Personal',
}

function DeletedPersonRecordsSection({
  records = [],
  isLoading = false,
  onRefresh,
  onRestore,
  restoringId = '',
  title = 'Bajas del padron',
  description = 'Personas eliminadas que pueden recuperarse desde el registro auditado.',
}) {
  const hasRecords = records.length > 0

  return (
    <section className="rise-in soft-card soft-card--tint-slate border-l-4 border-l-slate-500">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-600">
            <Trash2 className="h-4 w-4" />
            Bajas auditadas
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-slate-950">{title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? 'Actualizando...' : 'Actualizar bajas'}
        </button>
      </div>

      {!hasRecords ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          {isLoading ? 'Cargando bajas...' : 'No hay bajas pendientes de restaurar.'}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-[860px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">DNI</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Baja</th>
                <th className="px-4 py-3 text-right">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {records.map((record) => {
                const canRestore = ['student', 'teacher'].includes(record.person_type)
                return (
                  <tr key={record.id}>
                    <td className="px-4 py-3 font-bold text-slate-800">{PERSON_TYPE_LABELS[record.person_type] ?? record.person_type}</td>
                    <td className="px-4 py-3 text-slate-700">{record.display_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{record.dni || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{record.email || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="block font-semibold">{formatDate(record.created_at)}</span>
                      <span className="block text-xs">por {record.deleted_by_email || 'usuario no registrado'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-2"
                        disabled={!canRestore || restoringId === record.id}
                        onClick={() => onRestore?.(record)}
                        title={canRestore ? 'Restaurar en el padron activo' : 'La restauracion de administrativos requiere superadmin/Auth'}
                      >
                        <RotateCcw className="h-4 w-4" />
                        {restoringId === record.id ? 'Restaurando...' : 'Restaurar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default DeletedPersonRecordsSection
