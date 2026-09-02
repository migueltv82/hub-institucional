import { Download } from 'lucide-react'

function DownloadCard({ accentClass, eyebrow, title, description, iconClass = 'text-slate-700', onClick }) {
  return (
    <button
      className={`soft-card flex min-h-[150px] min-w-0 items-center justify-between gap-4 text-left transition hover:-translate-y-1 hover:shadow-lg ${accentClass}`}
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0">
        <span className="block text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">
          {eyebrow}
        </span>
        <span className="mt-1 block text-lg font-bold text-slate-950">
          {title}
        </span>
        <span className="mt-2 block text-sm leading-6 text-slate-600">
          {description}
        </span>
      </span>
      <Download className={`h-5 w-5 shrink-0 ${iconClass}`} />
    </button>
  )
}

export default DownloadCard
