function buildRangeLabel({ page, pageSize, total }) {
  if (total === 0) {
    return 'Sin resultados'
  }

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return `${from}-${to} de ${total}`
}

function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  isFetching = false,
  onPrevious,
  onNext,
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        {buildRangeLabel({ page, pageSize, total })}
        {isFetching ? ' | actualizando...' : ''}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          className="btn-secondary w-full sm:w-auto"
          disabled={page <= 1}
          onClick={onPrevious}
          type="button"
        >
          Anterior
        </button>
        <span className="text-sm font-semibold text-slate-700">
          Pagina {totalPages === 0 ? 0 : page} de {totalPages}
        </span>
        <button
          className="btn-secondary w-full sm:w-auto"
          disabled={page >= totalPages}
          onClick={onNext}
          type="button"
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}

export default PaginationControls
