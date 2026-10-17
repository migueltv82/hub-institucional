# STG1 — Promoción de release/v1 a Staging

Fecha: 2026-10-17. Aprobación: Miguel (chat 17/10, "ok" a STG1). Ejecutado por Claude con el conector Supabase sobre `Hub-Institucional-Staging` (`lzjp…aeco`, verificado). Staging no tenía datos (STG0).

## Base de datos — HECHO

| Paso | Cómo | Resultado |
| --- | --- | --- |
| 03.5b | migration `stg1_0305b_academic_status_canonical_write`: el `create or replace` de `academic_teacher_upsert_student_grade` + su revoke/grant, extraído literal de `07_academic_operations.sql`. Era la única diferencia de STG0 | hash `78b4b3d4`, **igual a release/v1** |
| Modo de transición | runbook §4.1. Antes: sin fila (default `snapshot_only`) | `write_mode = dual_write`, `read_mode = snapshot_only`, `is_public = false` |
| Verificación §4 | consulta read-only del runbook | `handle_new_user_ok = t`, `firmas = 1`, `tablas_sin_rls = 0` de 44 (40 del baseline + 4 del gateway) |

Con esto, la base de Staging queda **sin diferencias** contra release/v1. Las únicas diferencias son las esperadas: el gateway de Storage y el `rls_auto_enable` de la plataforma.

## Edge Functions — PENDIENTE (Miguel, CLI)

No se desplegaron por el conector. `admin-users` tiene 136 KB en un archivo: subirla obligaría a retranscribir el código de seguridad dentro de la llamada. La CLI sube el archivo del repo tal cual. Comandos, desde release/v1 actualizado:

```powershell
supabase functions deploy admin-users --project-ref lzjpycejdjpzkdyzaeco --no-verify-jwt
supabase functions deploy source-file-storage --project-ref lzjpycejdjpzkdyzaeco --no-verify-jwt
```

Después: Claude verifica las versiones nuevas y corre `scripts/smokeCheck.mjs` contra Staging.

## Hallazgos corregidos en el runbook de Producción

- `source-file-storage` también va con `--no-verify-jwt`: valida el Bearer en `handler.js` y atiende el preflight CORS. Así está en Staging. Sin el flag, el preflight se rompería. No se agregó a `supabase/config.toml`: el audit de seguridad del repo exige ver la validación en `index.ts` y acá vive en `handler.js` (tarjeta SEC.1).
- La verificación del §4.1 usaba `get_academic_transition_config()`, que exige sesión de usuario (`AUTH_REQUIRED`) y fallaría en el SQL Editor. Ahora se lee `app_settings` directamente.
