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
supabase functions deploy admin-users --project-ref $env:STG_REF --no-verify-jwt
supabase functions deploy source-file-storage --project-ref $env:STG_REF --no-verify-jwt
```

Después: Claude verifica las versiones nuevas y corre `scripts/smokeCheck.mjs` contra Staging.

## Hallazgos corregidos en el runbook de Producción

- `source-file-storage` también va con `--no-verify-jwt`: valida el Bearer en `handler.js` y atiende el preflight CORS. Así está en Staging. Sin el flag, el preflight se rompería. No se agregó a `supabase/config.toml`: el audit de seguridad del repo exige ver la validación en `index.ts` y acá vive en `handler.js` (tarjeta SEC.1).
- La verificación del §4.1 usaba `get_academic_transition_config()`, que exige sesión de usuario (`AUTH_REQUIRED`) y fallaría en el SQL Editor. Ahora se lee `app_settings` directamente.

## STG1b — 06.3 + HARD.1 + `rls_auto_enable` (2026-10-17)

Aprobación: Miguel (chat 17/10, "ok STG1b, aplicalo"). Ejecutado por Claude con el conector Supabase sobre `Hub-Institucional-Staging` (`lzjp…aeco`).

| Paso | Cómo | Resultado |
| --- | --- | --- |
| Migration `stg1b_063_hard1_part1` | `create or replace` literal de release/v1 (con su revoke/grant) de `is_member_of_institution` (01), `storage_object_institution_id` (05) y `upsert_subject_enrollment_from_portal` (07), más `revoke execute on function public.rls_auto_enable() from public, anon, authenticated` | OK |
| Migration `stg1b_063_part2_exam_enrollment` | `create or replace` literal de `upsert_exam_enrollment_from_portal` (08), con su revoke/grant | OK |
| Hash de cuerpo de las 4 funciones, Staging vs. base local con el baseline de release/v1 | `md5(pg_get_functiondef)` sin CR, `search_path`, EXECUTE de anon y authenticated | **Iguales**: `2f76618c`, `f81e5258`, `6d005d56` y `c02e5398`. anon = false, authenticated = true |
| `rls_auto_enable()` | `has_function_privilege` | anon = false, authenticated = false |
| Advisors de seguridad | `get_advisors` | Sin 0011 y sin `rls_auto_enable`. Lo que queda está triado como "por diseño" en `STAGING_ADVISORS_RESULT.md` |
| Verificación §4 del runbook | read-only | `handle_new_user_ok = t`, `firmas = 1`, `tablas_sin_rls = 0` de 44, `write_mode = dual_write` |

Staging no tiene datos: no hubo que migrar nada. La base de Staging vuelve a estar **sin diferencias** contra release/v1 en `434509b`; las únicas diferencias esperadas son el gateway y el `rls_auto_enable` de la plataforma.

**Edge: sigue PENDIENTE (Miguel, CLI).** Staging tiene `admin-users` v3 (10/10) y `source-file-storage` v1 (05/10). Sin el redeploy, la parte de 06.3 que vive en la Edge todavía no corre en Staging.
