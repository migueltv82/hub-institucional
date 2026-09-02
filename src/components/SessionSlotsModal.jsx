import { useState } from 'react'
import toast from 'react-hot-toast'
import { ExternalLink, Plus, Trash2, Users, X } from 'lucide-react'
import { sanitizeSessionSlot } from '../lib/authStorage.js'
import {
  buildSessionSlotUrl,
  listSessionSlots,
  removeSessionSlot,
  saveSessionSlot,
} from '../lib/sessionSlots.js'

function openSessionWindow(slug) {
  const url = buildSessionSlotUrl(slug)
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function SessionSlotsModal({ isOpen, onClose, currentSlot }) {
  const [slots, setSlots] = useState(() => listSessionSlots())
  const [label, setLabel] = useState('')

  if (!isOpen) return null

  function refresh() {
    setSlots(listSessionSlots())
  }

  function handleAdd(event) {
    event.preventDefault()

    const slug = sanitizeSessionSlot(label)
    if (!slug) {
      toast.error('Pone un nombre para identificar la sesion (ej: docente, alumno).')
      return
    }
    if (slots.some((entry) => entry.slug === slug)) {
      toast.error('Ya existe una sesion guardada con ese nombre.')
      return
    }

    saveSessionSlot({ slug, label })
    refresh()
    setLabel('')
    openSessionWindow(slug)
  }

  function handleRemove(slug) {
    removeSessionSlot(slug)
    refresh()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-md bg-white shadow-2xl rise-in">
        <header className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="flex items-center gap-2 text-xl font-bold text-slate-950">
            <Users className="text-cyan-600" />
            Sesiones abiertas
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" type="button">
            <X size={20} />
          </button>
        </header>

        <p className="mb-4 text-sm leading-6 text-slate-600">
          Cada sesion abre una pestana nueva con su propio inicio de sesion, independiente de esta
          (por ejemplo: admin, docente, alumno, a la vez). Las guardadas quedan para la proxima vez.
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold text-slate-700">
              Sesion principal
              {!currentSlot && <span className="ml-2 text-xs font-normal text-cyan-600">esta pestana</span>}
            </span>
            <button
              type="button"
              className="btn-secondary flex items-center gap-1 px-3 py-1 text-xs"
              onClick={() => openSessionWindow('')}
            >
              <ExternalLink size={14} />
              Abrir
            </button>
          </div>

          {slots.map((entry) => (
            <div
              key={entry.slug}
              className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <span className="text-sm font-semibold text-slate-700">
                {entry.label}
                {currentSlot === entry.slug && (
                  <span className="ml-2 text-xs font-normal text-cyan-600">esta pestana</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary flex items-center gap-1 px-3 py-1 text-xs"
                  onClick={() => openSessionWindow(entry.slug)}
                >
                  <ExternalLink size={14} />
                  Abrir
                </button>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => handleRemove(entry.slug)}
                  aria-label={`Eliminar sesion ${entry.label}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleAdd} className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
          <input
            className="input-base flex-1"
            placeholder="Nombre de la sesion (ej: docente)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button type="submit" className="btn-primary flex items-center gap-1 px-3 py-2 text-sm">
            <Plus size={16} />
            Agregar
          </button>
        </form>
      </div>
    </div>
  )
}

export default SessionSlotsModal
