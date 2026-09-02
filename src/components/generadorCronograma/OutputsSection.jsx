import { Clipboard, FileSpreadsheet, FileText, Megaphone, RotateCcw, Send, Sheet, Sparkles, Trash2 } from 'lucide-react'

function OutputsSection({
  canEditWorkspace = true,
  cronogramaBorrable = false,
  exportacionesHabilitadas,
  mensajeGeneracion,
  onCopiarTexto,
  onExportarConfirmadasPorCarrera,
  onExportarCronograma,
  onExportarPdfDestinatarios,
  onExportarPdfPorCarrera,
  onExportarPlaca,
  onBorrarCronograma,
  onGenerar,
  onLimpiarTodo,
  periodoInvalido,
  puedeGenerar,
  reporteConfirmadasHabilitado,
  requiereRegeneracion,
}) {
  return (
    <section className="rise-in flex flex-col gap-4 border-y border-slate-200 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-slate-500">Outputs</p>
        <p className="mt-2 text-xl font-bold text-slate-950">
          Genera una salida que se vea lista para revisar, confirmar y enviar.
        </p>
        <p className={`mt-2 text-sm ${periodoInvalido || requiereRegeneracion ? 'text-amber-700' : 'text-slate-600'}`}>
          {mensajeGeneracion}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!puedeGenerar || !canEditWorkspace} onClick={onGenerar} type="button">
          <Sparkles className="h-4 w-4" />
          Generar cronograma
        </button>
        <button className="btn-secondary" disabled={!canEditWorkspace} onClick={onLimpiarTodo} type="button">
          <RotateCcw className="h-4 w-4" />
          Reiniciar carga
        </button>
        <button className="btn-secondary" disabled={!canEditWorkspace || !cronogramaBorrable} onClick={onBorrarCronograma} type="button">
          <Trash2 className="h-4 w-4" />
          Borrar cronograma
        </button>
        <button
          className="btn-secondary"
          disabled={!exportacionesHabilitadas}
          onClick={onExportarCronograma}
          type="button"
        >
          <Sheet className="h-4 w-4" />
          XLSX completo
        </button>
        <button
          className="btn-secondary"
          disabled={!reporteConfirmadasHabilitado}
          onClick={onExportarConfirmadasPorCarrera}
          type="button"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Confirmadas por carrera
        </button>
        <button
          className="btn-secondary"
          disabled={!exportacionesHabilitadas}
          onClick={onExportarPdfPorCarrera}
          type="button"
        >
          <FileText className="h-4 w-4" />
          PDF por carrera
        </button>
        <button
          className="btn-secondary"
          disabled={!exportacionesHabilitadas}
          onClick={onExportarPdfDestinatarios}
          type="button"
        >
          <Send className="h-4 w-4" />
          PDFs destinatarios
        </button>
        <button
          className="btn-secondary"
          disabled={!exportacionesHabilitadas}
          onClick={onExportarPlaca}
          type="button"
        >
          <Megaphone className="h-4 w-4" />
          Placa PNG
        </button>
        <button className="btn-secondary" disabled={!exportacionesHabilitadas} onClick={onCopiarTexto} type="button">
          <Clipboard className="h-4 w-4" />
          Texto
        </button>
      </div>
    </section>
  )
}

export default OutputsSection
