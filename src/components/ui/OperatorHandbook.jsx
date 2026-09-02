import { useState } from 'react'
import { BookOpen, ChevronDown, Lightbulb } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

const DEFAULT_STEPS = [
  {
    title: 'Cargar las tres plantillas',
    detail: 'Subi primero la plantilla academica y luego las plantillas de docentes y alumnos. Las tres quedan guardadas en el espacio institucional.',
  },
  {
    title: 'Definir fechas del llamado',
    detail: 'Indica inicio y fin de mesas. Si hay excepciones por carrera o anio, cargalas en el formulario de configuracion.',
  },
  {
    title: 'Generar precronograma',
    detail: 'El sistema propone fechas y horarios respetando disponibilidad docente y correlatividades. Exporta el archivo para revision.',
  },
  {
    title: 'Revisar con docentes',
    detail: 'Importa el archivo corregido o usa confirmacion rapida si no hubo cambios. Solo las mesas confirmadas siguen al paso de tribunales.',
  },
  {
    title: 'Armar tribunales y publicar',
    detail: 'Genera titular y vocales, revisa alertas finales y exporta el cronograma oficial listo para publicar.',
  },
]

function OperatorHandbook({ steps = DEFAULT_STEPS, title = 'Guia rapida para operar' }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="operator-handbook min-w-0 overflow-hidden rounded-md border shadow-sm">
      <button
        className="operator-handbook__trigger flex w-full min-w-0 items-center justify-between gap-3 px-4 py-4 text-left md:px-5"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="operator-handbook__icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md shadow-md">
            <BookOpen className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="operator-handbook__eyebrow block text-xs font-extrabold uppercase tracking-[0.14em]">
              Para quien continua el trabajo
            </span>
            <span className="operator-handbook__title mt-0.5 block text-lg font-extrabold">{title}</span>
          </span>
        </span>
        <ChevronDown className={`operator-handbook__chevron h-5 w-5 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="operator-handbook__content space-y-3 border-t px-4 pb-5 pt-4 md:px-5">
              {steps.map((step, index) => (
                <div key={step.title} className="operator-handbook__step flex min-w-0 gap-3 rounded-md border p-3">
                  <span className="operator-handbook__step-number flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="operator-handbook__step-title text-sm font-extrabold">{step.title}</p>
                    <p className="operator-handbook__step-detail mt-1 text-sm leading-6">{step.detail}</p>
                  </div>
                </div>
              ))}
              <p className="operator-handbook__tip flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 text-sm font-semibold">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                Si algo falla, revisa las validaciones de la plantilla maestra y que sus identificadores coincidan entre hojas.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export default OperatorHandbook
