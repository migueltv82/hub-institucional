# Especificacion tecnica: buildLegacyWorkspaceSnapshotFromSupabase

## 1. Objetivo

Preparar una funcion aislada para leer un snapshot desde `workspace_snapshots` en
Supabase en modo solo lectura y convertirlo en snapshot compatible con el adaptador del
nuevo `examEngine`, sin asumir una estructura fija de columnas.

Esta funcion no ejecuta motores, no guarda cronogramas y no modifica datos reales.

## 2. Funcion futura

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

Responsabilidades:

- Usar el cliente Supabase recibido por parametro.
- Leer desde la tabla `workspace_snapshots`.
- Usar `select('*')` para evitar depender de columnas fijas.
- Resolver el payload desde `payload` o claves candidatas como `data`, `snapshot`,
  `workspace`, `workspace_payload` o `state`.
- Filtrar por `institutionId` solo si se conoce una columna institucional.
- Ordenar solo si se pasa `orderBy`.
- Limitar a `1` por defecto.
- Devolver el payload resuelto como snapshot viejo controlado.

## 3. Diagnostico seguro

```js
inspectWorkspaceSnapshotsSchema({ supabase, limit = 1 })
```

Responsabilidades:

- Hacer `select('*').limit(1)` sobre `workspace_snapshots`.
- No usar `order`.
- No devolver valores de filas.
- Devolver solo nombres de columnas y claves candidatas:
  - `payloadCandidateKeys`
  - `timestampCandidateKeys`
  - `idCandidateKeys`
  - `institutionCandidateKeys`

## 4. Fuente preferida

`workspace_snapshots.payload` sigue siendo la fuente preferida, pero la funcion debe
tolerar tablas que usen `data`, `snapshot`, `workspace`, `workspace_payload` o `state`.
La columna elegida debe conservar el shape historico del workspace que ya espera
`buildRegularExamInputFromWorkspaceSnapshot`.

## 5. Salida esperada

```js
{
  snapshot,
  metadata: {
    source: 'supabase',
    table: 'workspace_snapshots',
    snapshotId,
    institutionId,
    createdAt,
    readOnly: true,
    orderByUsed,
    fallbackWithoutCreatedAt,
    payloadKeyUsed,
    idKeyUsed,
    institutionKeyUsed,
    timestampKeyUsed,
    schema,
  },
}
```

## 6. Reglas de seguridad

- No importar `supabaseClient` directamente.
- No usar `service_role`.
- No llamar `insert`.
- No llamar `upsert`.
- No llamar `update`.
- No llamar `delete`.
- No llamar `rpc` si no es necesario.
- No guardar resultados.
- No publicar cronogramas.
- No generar cronograma oficial.
- No conectar UI.
- No importar motor viejo.
- No importar `legacyAdapter`.

## 7. Manejo de errores

La funcion debe fallar de forma controlada si:

- No recibe cliente Supabase.
- Supabase devuelve error.
- La consulta no devuelve ningun snapshot.
- No existe ninguna columna candidata de payload.

Los errores deben describir que fallo la lectura, no sugerir escritura ni regeneracion
oficial.

## 8. Tests mockeados requeridos

- Inspecciona columnas con `select('*').limit(1)`.
- Lee `workspace_snapshots` con `select('*')` y `limit`.
- Filtra por `institutionId` si se pasa.
- Devuelve `snapshot` desde `payload`.
- Devuelve `snapshot` desde `data` si no existe `payload`.
- Funciona sin `id`.
- Funciona sin `created_at`.
- Devuelve metadata con `readOnly: true`.
- Falla controlado si no hay datos.
- Falla controlado si Supabase devuelve error.
- Falla controlado si no hay columna candidata de payload.
- No llama `insert`.
- No llama `upsert`.
- No llama `update`.
- No llama `delete`.
- No llama `rpc`.
- No importa `supabaseClient`.
- No toca motor viejo ni UI.

## 9. Restricciones de ejecucion

Los tests deben usar mocks o fake clients. No deben conectar con Supabase real, no deben
usar datos reales y no deben modificar tablas reales.

## 10. Uso futuro

Flujo futuro esperado:

```txt
buildLegacyWorkspaceSnapshotFromSupabase
-> buildRegularExamInputFromWorkspaceSnapshot
-> buildRegularExamPreviewIntegrationContract
-> reporte o resumen de auditoria interna
```

Este flujo sigue siendo una simulacion read-only. No reemplaza el motor viejo y no
habilita guardado, publicacion ni exportaciones oficiales.
