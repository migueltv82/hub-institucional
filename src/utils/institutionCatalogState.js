// D1b: el catalogo de instituciones arranca vacio mientras carga. "No hay instituciones" solo vale cuando la
// consulta termino bien y vino vacia; mientras carga o si fallo, se dice eso y no se bloquea por error.

export function institutionCatalogState({ isPending = false, isError = false, institutions = [] } = {}) {
  if (isError) return 'error'
  if (isPending) return 'loading'
  return Array.isArray(institutions) && institutions.length > 0 ? 'ready' : 'empty'
}

export function canCreateUserForCatalog(state) {
  return state === 'ready'
}
