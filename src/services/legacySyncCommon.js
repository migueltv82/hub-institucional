import { supabase } from '../lib/supabase.js'

const MISSING_SCHEMA_ERROR_CODES = new Set(['42P01', '42703', 'PGRST204', 'PGRST205'])

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function isMissingLegacySyncSchemaError(error, tableName) {
  const errorCode = String(error?.code ?? '')
  const errorText = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.hint ?? ''}`.toLowerCase()

  if (MISSING_SCHEMA_ERROR_CODES.has(errorCode)) return true

  return (
    errorText.includes(tableName) &&
    (
      errorText.includes('does not exist') ||
      errorText.includes('not found') ||
      errorText.includes('could not find') ||
      errorText.includes('schema cache')
    )
  )
}

function warnMissingSchema(tableName, operation, error) {
  console.warn(
    `No se pudo completar ${operation} porque falta la tabla ${tableName} en Supabase (aplica la migracion 13). Se omite la sincronizacion.`,
    error,
  )
}

// Sync generico: upsert de `rows` contra `tableName`, y borra lo que ya no
// esta presente en `rows` (identificado por `keyForRow`). Mismo patron que
// syncTableRows() en rosterRecords.js, generalizado para reusar entre las
// tablas legacy_* nuevas.
export async function syncLegacyTableRows({
  tableName,
  rows,
  selectFields,
  conflictColumns,
  keyForRow,
  institutionId,
  workspaceKey,
  deleteMissing = true,
}) {
  const { data: existingRows, error: existingError } = await supabase
    .from(tableName)
    .select(selectFields)
    .eq('institution_id', institutionId)
    .eq('workspace_key', workspaceKey)

  if (existingError) {
    if (isMissingLegacySyncSchemaError(existingError, tableName)) {
      warnMissingSchema(tableName, `la lectura de ${tableName}`, existingError)
      return { skipped: true, synced: 0, deleted: 0 }
    }

    throw existingError
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from(tableName)
      .upsert(rows, { onConflict: conflictColumns.join(',') })

    if (upsertError) {
      if (isMissingLegacySyncSchemaError(upsertError, tableName)) {
        warnMissingSchema(tableName, `la sincronizacion de ${tableName}`, upsertError)
        return { skipped: true, synced: 0, deleted: 0 }
      }

      throw upsertError
    }
  }

  const nextKeys = new Set(rows.map(keyForRow))
  const idsToDelete = deleteMissing
    ? asArray(existingRows).filter((row) => !nextKeys.has(keyForRow(row))).map((row) => row.id)
    : []

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .in('id', idsToDelete)

    if (deleteError) {
      if (isMissingLegacySyncSchemaError(deleteError, tableName)) {
        warnMissingSchema(tableName, `la limpieza de ${tableName}`, deleteError)
        return { skipped: true, synced: rows.length, deleted: 0 }
      }

      throw deleteError
    }
  }

  return { skipped: false, synced: rows.length, deleted: idsToDelete.length }
}

// Variante para tablas con clave primaria compuesta natural (sin columna
// `id`): solo upsert, sin borrado. Son tablas de catalogo/referencia (no
// deciden por si solas un bloqueo de seguridad), asi que dejar una fila
// vieja sin borrar es un tradeoff aceptable frente a la complejidad de
// borrar por clave compuesta.
export async function syncLegacyTableRowsByNaturalKey({
  tableName,
  rows,
  conflictColumns,
  institutionId: _institutionId,
  workspaceKey: _workspaceKey,
}) {
  if (rows.length === 0) {
    return { skipped: false, synced: 0 }
  }

  const { error: upsertError } = await supabase
    .from(tableName)
    .upsert(rows, { onConflict: conflictColumns.join(',') })

  if (upsertError) {
    if (isMissingLegacySyncSchemaError(upsertError, tableName)) {
      warnMissingSchema(tableName, `la sincronizacion de ${tableName}`, upsertError)
      return { skipped: true, synced: 0 }
    }

    throw upsertError
  }

  return { skipped: false, synced: rows.length }
}
