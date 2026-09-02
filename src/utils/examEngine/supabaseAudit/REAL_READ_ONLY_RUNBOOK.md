# Runbook de prueba manual read-only con Supabase real

## 1. Objetivo

Ejecutar una prueba local controlada contra Supabase real para validar el flujo:

```txt
Supabase real
-> workspace_snapshots
-> snapshot
-> buildRegularExamInputFromWorkspaceSnapshot
-> buildRegularExamPreviewIntegrationContract
-> resumen seguro
```

La prueba debe confirmar que un snapshot real puede alimentar el nuevo `examEngine` sin
escrituras, sin UI productiva y sin persistir datos reales.

## 2. Condiciones obligatorias

- Solo local.
- No CI.
- No escritura.
- No `insert`, `upsert`, `update`, `delete` ni `rpc`.
- No `service_role`.
- No guardar resultados reales.
- No commitear datos reales.
- No tocar UI ni rutas.
- No ejecutar motor viejo.
- No publicar cronogramas.
- No generar cronograma oficial.

## 3. Variables requeridas

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` o `VITE_SUPABASE_ANON_KEY`

Nunca debe usarse `service_role` para esta prueba. Si alguna variable de entorno contiene
una clave privada o de servicio, la prueba debe bloquearse antes de crear el cliente.

## 4. Script futuro sugerido

Nombre sugerido:

```txt
scripts/examEngineAudit/readOnlySupabasePreview.mjs
```

Este script todavia no se implementa en este paso.

## 5. Comportamiento esperado del script futuro

El script deberia:

- Validar variables de entorno.
- Bloquear si detecta `service_role`.
- Crear cliente Supabase con anon/public key.
- Llamar `buildLegacyWorkspaceSnapshotFromSupabase`.
- Adaptar con `buildRegularExamInputFromWorkspaceSnapshot`.
- Ejecutar `buildRegularExamPreviewIntegrationContract`.
- Mostrar solo resumen seguro.
- No imprimir payload completo.
- No guardar archivos.
- No modificar base.

Resumen seguro permitido:

```js
{
  snapshotId,
  createdAt,
  phase,
  status,
  totalPlanned,
  totalUnassigned,
  totalWarnings,
  totalCriticalErrors,
}
```

## 6. Criterios de bloqueo

El script debe fallar si:

- Falta `VITE_SUPABASE_URL`.
- Falta `VITE_SUPABASE_PUBLISHABLE_KEY` y falta `VITE_SUPABASE_ANON_KEY`.
- Detecta `service_role`.
- No hay snapshot.
- El snapshot no tiene `payload`.
- Se intenta escribir.
- `git status --short` no esta limpio, si se decide validar ese punto.

El bloqueo debe ocurrir antes de imprimir datos sensibles.

## 7. Resultado permitido

Solo se permite mostrar metricas y resumen anonimizado:

- `snapshotId`.
- `createdAt`.
- `phase`.
- `status`.
- Cantidad de mesas planificadas.
- Cantidad de mesas pendientes.
- Cantidad de warnings.
- Cantidad de errores criticos.

## 8. Resultado prohibido

No se debe imprimir, guardar, commitear ni compartir:

- Payload completo.
- Nombres reales.
- Datos de alumnos.
- Emails.
- Telefonos.
- Documentos.
- Credenciales.
- Variables de entorno.
- Reportes con datos personales.

## 9. Proximo paso tecnico

Implementar el script manual opt-in con tests unitarios de helpers de seguridad, sin
ejecutar Supabase real en tests.

Los tests futuros deben mockear entorno, cliente Supabase y salida del preview. Ningun
test debe conectarse a Supabase real ni usar datos productivos.
