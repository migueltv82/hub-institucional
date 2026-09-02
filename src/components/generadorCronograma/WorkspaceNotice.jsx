import { AlertTriangle } from 'lucide-react'

const toneClasses = {
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  sky: 'border-sky-200 bg-sky-50 text-sky-900',
}

function WorkspaceNotice({
  children,
  tone = 'amber',
}) {
  return (
    <section
      className={`rise-in flex items-start gap-3 border p-4 text-sm ${toneClasses[tone] ?? toneClasses.amber}`}
      style={{ borderRadius: 8 }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{children}</p>
    </section>
  )
}

export default WorkspaceNotice
