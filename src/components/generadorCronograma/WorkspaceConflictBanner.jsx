import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

function formatTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

// Decisión de Miguel (20/10): si otra sesión guardó el panel (otra persona de secretaría, o un alumno o
// docente desde su portal) después de que este panel lo cargó, no se pisa en silencio: se avisa y se elige.
export default function WorkspaceConflictBanner({ conflict, onResolve }) {
  const [busy, setBusy] = useState('')
  if (!conflict) return null
  const time = formatTime(conflict.remoteUpdatedAt)

  async function resolve(mode) {
    if (mode === 'overwrite' && !window.confirm('Vas a reemplazar los cambios que guardó la otra sesión por los de este panel. ¿Seguir?')) return
    setBusy(mode)
    try {
      await onResolve(mode)
      if (mode === 'overwrite') toast.success('Tus cambios quedaron guardados.')
    } catch (error) {
      toast.error(error.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <section role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="flex items-center gap-2 font-extrabold">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        Hay cambios de otra sesión{time ? ` (guardados a las ${time})` : ''}
      </p>
      <p className="mt-1">
        Otra persona del instituto, o un alumno o docente desde su portal, guardó cambios después de que abriste este
        panel. Para no pisarlos, el guardado automático quedó en pausa. Tus cambios siguen en este equipo.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary" type="button" disabled={Boolean(busy)} onClick={() => resolve('reload')}>
          {busy === 'reload' ? 'Cargando…' : 'Ver los cambios (recargar)'}
        </button>
        <button className="btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => resolve('overwrite')}>
          {busy === 'overwrite' ? 'Guardando…' : 'Subir los míos igual'}
        </button>
      </div>
    </section>
  )
}
