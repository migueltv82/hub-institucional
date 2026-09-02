import { CircleHelp } from 'lucide-react'

function HelpTip({ children, label = 'Ayuda' }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        aria-label={label}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-teal-300 hover:text-teal-700"
        type="button"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      <span
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-slate-950 px-3 py-2 text-left text-xs font-medium leading-5 text-white shadow-xl group-hover:block group-focus-within:block"
        role="tooltip"
      >
        {children}
      </span>
    </span>
  )
}

export default HelpTip
