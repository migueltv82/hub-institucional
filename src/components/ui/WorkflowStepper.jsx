import { Check } from 'lucide-react'
import { motion } from 'framer-motion'

// When onSelectStep is provided, steps up to and including currentIndex are
// clickable (already-visited or current) so the admin can look back at a
// completed step without losing progress: clicking never resets state, it
// only changes which section is on screen (see viewStepId in the caller).
function WorkflowStepper({ activeIndex, currentIndex = 0, onSelectStep, steps }) {
  const highlightedIndex = activeIndex ?? currentIndex

  return (
    <ol className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-4">
      {steps.map((step, index) => {
        const isDone = index < currentIndex
        const isCurrent = index === highlightedIndex
        const isReachable = index <= currentIndex
        const isClickable = Boolean(onSelectStep) && isReachable
        const cardClassName = `relative min-w-0 rounded-md border p-4 text-left transition ${
          isCurrent
            ? 'border-teal-400 bg-gradient-to-br from-teal-50 to-cyan-50 shadow-md shadow-teal-100/80'
            : isDone
              ? 'border-emerald-200 bg-emerald-50/80'
              : 'border-slate-200 bg-white'
        } ${isClickable ? 'cursor-pointer hover:border-teal-300' : ''}`
        const cardContent = (
          <div className="flex items-start gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${
                isCurrent
                  ? 'bg-teal-700 text-white'
                  : isDone
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {isDone ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <div className="min-w-0 overflow-hidden">
              <p className="text-sm font-extrabold text-slate-950">{step.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{step.description}</p>
            </div>
          </div>
        )

        return (
          <motion.li
            key={step.id}
            animate={{ opacity: 1, y: 0 }}
            aria-current={isCurrent ? 'step' : undefined}
            initial={{ opacity: 0, y: 8 }}
            transition={{ delay: index * 0.05, duration: 0.25 }}
          >
            {isClickable ? (
              <button className={`w-full ${cardClassName}`} type="button" onClick={() => onSelectStep(step.id)}>
                {cardContent}
              </button>
            ) : (
              <div className={cardClassName}>{cardContent}</div>
            )}
          </motion.li>
        )
      })}
    </ol>
  )
}

export default WorkflowStepper
