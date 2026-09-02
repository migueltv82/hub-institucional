# supabaseAudit

## 1. Objetivo

`supabaseAudit` prepara una lectura segura de `workspace_snapshots` para simular el
nuevo `examEngine` con datos provenientes de Supabase.

La capa existe para auditoria interna read-only. No reemplaza el generador actual, no
guarda cronogramas, no publica resultados y no conecta UI.

## 2. Estado actual

Estado implementado:

- `buildLegacyWorkspaceSnapshotFromSupabase`.
- Tests mockeados de lectura read-only.
- Test integrado mockeado:

```txt
fake Supabase
-> snapshot
-> buildRegularExamInputFromWorkspaceSnapshot
-> buildRegularExamPreviewIntegrationContract
```

Todavia no hay conexion real a Supabase desde esta capa.

## 3. Fuente esperada

Tabla:

```txt
workspace_snapshots
```

Campos:

- `payload`, `data`, `snapshot`, `workspace`, `workspace_payload` o `state`
- `id`, `snapshot_id`, `snapshotId`, `uuid` o `key`, si existe
- `institution_id`, `institutionId`, `school_id` o `schoolId`, si existe
- `created_at`, `createdAt`, `updated_at`, `updatedAt`, `saved_at`, `savedAt` o
  `timestamp`, si existe

Alguna columna candidata de payload debe contener el snapshot historico del workspace
compatible con el adaptador del nuevo `examEngine`.

Como la estructura real de `workspace_snapshots` puede variar, la lectura usa
`select('*').limit(1)` y no asume que existan `id` o `created_at`.

## 4. Diagnostico seguro de columnas

```js
inspectWorkspaceSnapshotsSchema({ supabase, limit = 1 })
```

La funcion:

- Recibe cliente Supabase por parametro.
- Hace `select('*').limit(1)` sobre `workspace_snapshots`.
- No usa `order`.
- No imprime ni devuelve valores.
- Devuelve solo nombres de columnas y claves candidatas.

Salida esperada:

```js
{
  ok: true,
  columns,
  hasPayload,
  payloadCandidateKeys,
  timestampCandidateKeys,
  idCandidateKeys,
  institutionCandidateKeys,
}
```

## 5. Funcion principal

```js
buildLegacyWorkspaceSnapshotFromSupabase({
  supabase,
  institutionId,
  limit = 1,
  payloadKey = 'payload',
  idKey,
  institutionKey,
  timestampKey,
  orderBy = null,
})
```

La funcion:

- Recibe cliente Supabase por parametro.
- No importa `supabaseClient` real.
- Lee `workspace_snapshots`.
- Usa `select('*')` para evitar depender de columnas fijas.
- Intenta usar `payload` como clave preferida.
- Si `payload` no existe, usa la primera candidata disponible entre `data`,
  `snapshot`, `workspace`, `workspace_payload` y `state`.
- Si no hay candidata de payload, falla con un error claro y lista solo nombres de
  columnas disponibles.
- Si `orderBy` es `null` o `false`, no aplica orden.
- Si el orden por `orderBy` falla por columna inexistente, reintenta sin orden.
- Devuelve `snapshot` y `metadata`.
- Devuelve `metadata.readOnly = true`.

Salida esperada:

```js
{
  snapshot,
  metadata: {
    source: 'supabase',
    table: 'workspace_snapshots',
    snapshotId,
    institutionId,
    createdAt, // null si no esta disponible
    readOnly: true,
    orderByUsed,
    fallbackWithoutCreatedAt,
    payloadKeyUsed,
    idKeyUsed,
    institutionKeyUsed,
    timestampKeyUsed,
    schema, // solo nombres de columnas y candidatos
  },
}
```

## 6. Seguridad

Esta capa debe mantenerse estrictamente read-only.

No debe:

- Hacer `insert`.
- Hacer `upsert`.
- Hacer `update`.
- Hacer `delete`.
- Llamar `rpc`.
- Usar `service_role`.
- Realizar escrituras.
- Guardar cronogramas.
- Publicar cronogramas.
- Conectar UI.
- Ejecutar motor viejo.
- Usar `legacyAdapter`.
- Descargar archivos.
- Guardar resultados.

La simulacion solo puede usar datos leidos y mantener resultados en memoria durante la
auditoria.

## 7. Tests existentes

```txt
buildLegacyWorkspaceSnapshotFromSupabase.test.js
```

Valida inspeccion segura de columnas, lectura mockeada de `workspace_snapshots`,
metadata read-only, payload flexible (`payload`/`data`), ausencia de `id` y
`created_at`, errores controlados y ausencia de llamadas a `insert`, `upsert`,
`update`, `delete` y `rpc`.

```txt
supabaseSnapshotPreview.integration.test.js
```

Valida el flujo integrado mockeado:

```txt
fake Supabase
-> buildLegacyWorkspaceSnapshotFromSupabase
-> buildRegularExamInputFromWorkspaceSnapshot
-> buildRegularExamPreviewIntegrationContract
```

Tambien valida no mutacion, ausencia de `raw`, metadata read-only y aislamiento de
cliente real, motor viejo, UI y `legacyAdapter`.

## 8. Que NO esta habilitado todavia

- Conexion real a Supabase.
- Ejecucion desde UI.
- Descarga de reportes.
- Guardado de resultados.
- Generacion oficial.
- Publicacion de cronogramas.
- Integracion con rutas.
- Uso productivo.

## 9. Proximo paso recomendado

Crear una prueba read-only real controlada solo si:

- Las variables de entorno estan configuradas.
- Se confirma que se usara anon/public key.
- No hay `service_role`.
- No se escribira nada.
- El resultado no se commiteara si contiene datos reales.

Antes de esa prueba debe quedar claro que la ejecucion sigue siendo auditoria interna,
sin UI productiva, sin rutas publicas y sin efectos sobre datos reales.
