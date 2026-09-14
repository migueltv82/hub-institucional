import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { subscribeImportantNotices } from '../services/importantNotice.js'

const toneConfig = {
  success: {
    icon: CheckCircle2,
    label: 'Cambio aplicado',
    accent: 'text-emerald-700',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    ring: 'from-emerald-500 to-teal-500',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Atencion requerida',
    accent: 'text-amber-700',
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    ring: 'from-amber-500 to-orange-500',
  },
  error: {
    icon: XCircle,
    label: 'No se pudo completar',
    accent: 'text-red-700',
    badge: 'border-red-200 bg-red-50 text-red-800',
    ring: 'from-red-500 to-rose-500',
  },
  info: {
    icon: Info,
    label: 'Aviso importante',
    accent: 'text-sky-700',
    badge: 'border-sky-200 bg-sky-50 text-sky-800',
    ring: 'from-sky-500 to-blue-500',
  },
}

function ImportantNoticeCenter() {
  const [queue, setQueue] = useState([])
  const activeNotice = queue[0] ?? null
  const config = useMemo(
    () => toneConfig[activeNotice?.tone] ?? toneConfig.info,
    [activeNotice?.tone],
  )
  const Icon = config.icon

  useEffect(() => subscribeImportantNotices((notice) => {
    setQueue((current) => [...current, notice])
  }), [])

  useEffect(() => {
    if (!activeNotice) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setQueue((current) => current.slice(1))
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeNotice])

  if (!activeNotice) return null

  const closeNotice = () => setQueue((current) => current.slice(1))

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation">
      <section
        aria-labelledby="important-notice-title"
        aria-modal="true"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/70 bg-white p-0 text-slate-950 shadow-2xl"
        role="dialog"
      >
        <div className={`h-2 bg-gradient-to-r ${config.ring}`} aria-hidden="true" />
        <div className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${config.badge}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${config.accent}`}>
                {activeNotice.label || config.label}
              </p>
              <h2 id="important-notice-title" className="mt-2 text-2xl font-extrabold text-slate-950">
                {activeNotice.title}
              </h2>
              {activeNotice.message ? (
                <p className="mt-3 text-sm leading-6 text-slate-700">{activeNotice.message}</p>
              ) : null}
            </div>
          </div>

          {activeNotice.details.length > 0 ? (
            <ul className="mt-5 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {activeNotice.details.map((detail, index) => (
                <li className="flex gap-2" key={`${activeNotice.id}-detail-${index}`}>
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-slate-500">
              {queue.length > 1 ? `Quedan ${queue.length - 1} aviso${queue.length === 2 ? '' : 's'} pendiente${queue.length === 2 ? '' : 's'}.` : 'Este aviso queda visible hasta que lo cierres.'}
            </p>
            <button className="btn-primary min-w-36" type="button" onClick={closeNotice} autoFocus>
              {activeNotice.actionLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default ImportantNoticeCenter
