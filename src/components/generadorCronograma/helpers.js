function formatLastSyncedAt(value) {
  if (!value) return 'Sin sincronizar todavia'
  return new Date(value).toLocaleString('es-AR')
}

export function ordenarCronogramaLocal(a, b) {
  if (a.fechaIso !== b.fechaIso) return a.fechaIso.localeCompare(b.fechaIso)
  if (a.inicio !== b.inicio) return a.inicio.localeCompare(b.inicio)
  if ((a.llamadoNumero ?? 0) !== (b.llamadoNumero ?? 0)) return (a.llamadoNumero ?? 0) - (b.llamadoNumero ?? 0)
  if ((Number(a.mesa) || 0) !== (Number(b.mesa) || 0)) return (Number(a.mesa) || 0) - (Number(b.mesa) || 0)
  return a.carrera.localeCompare(b.carrera)
}

export function formatearHoras(valor) {
  return `${valor.toFixed(1)} h`
}

export function getAllowedExtensions(acceptedFormats) {
  return acceptedFormats.split(',').map((value) => value.replace('.', '').toLowerCase())
}

export function getPersistenceHeading({
  isSupabaseConfigured,
  isLoadingInstitutions,
  isRemoteSession,
  useRemoteWorkspace,
}) {
  if (isLoadingInstitutions) return 'Inicializando'
  if (!isSupabaseConfigured) return 'Config pendiente'
  if (useRemoteWorkspace) return 'Supabase seguro'
  if (!isRemoteSession) return 'Demo local'
  return 'Config pendiente'
}

export function getPersistenceMessage({
  activeInstitution,
  isRemoteSession,
  isSupabaseConfigured,
  isLoadingInstitutions,
  lastSyncedAt,
  syncStatus,
  useRemoteWorkspace,
}) {
  if (isLoadingInstitutions) {
    return 'Estamos cargando el contexto institucional antes de recuperar el workspace.'
  }

  if (!activeInstitution) {
    return 'No hay una institucion activa todavia.'
  }

  if (syncStatus === 'syncing') {
    return useRemoteWorkspace
      ? 'Sincronizando cambios en el workspace aislado de esta institucion.'
      : 'Guardando el workspace local de la institucion demo seleccionada.'
  }

  if (syncStatus === 'saved') {
    return `Ultima sincronizacion: ${formatLastSyncedAt(lastSyncedAt)}.`
  }

  if (syncStatus === 'error') {
    return useRemoteWorkspace
      ? 'La sincronizacion remota fallo. El trabajo actual sigue visible, pero conviene revisar la sesion.'
      : 'El guardado local fallo. La sesion sigue abierta, pero ese cambio puede no persistirse.'
  }

  if (syncStatus === 'read-only') {
    return 'Tu rol institucional es de solo lectura. Pide rol editor, admin u owner para guardar cambios.'
  }

  if (!isSupabaseConfigured) {
    return 'Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY para activar la capa remota.'
  }

  if (!isRemoteSession) {
    return 'Estas en modo piloto local. Cada institucion queda aislada en este navegador para pruebas controladas.'
  }

  return 'Sesion remota disponible, pero falta completar el contexto institucional.'
}
