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

## PROD1b — SEC.2 + SEC.3 + SEC.3b en la base de Producción (2026-10-18)

La base `lzjp…aeco` es la de Producción (renombrada `Hub-Institucional-Prod`; decisión de Miguel, 17/10). Aprobación: Miguel (chat 17/10, "ok" a aplicar SEC.2 + SEC.3). Ejecutado por Claude con el conector Supabase. Fuente: release/v1 en `709c7bc`. La base todavía no tiene datos reales.

| Migration | Contenido | Resultado |
| --- | --- | --- |
| `prod1b_a0_staff_helper` | `is_staff_of_institution` + revoke/grant | OK |
| `prod1b_a1_owns_helper` | `current_user_owns_student_record` + revoke/grant | OK |
| `prod1b_a2_deleted_person_policy` | lectura de `deleted_person_records` → personal | OK |
| `prod1b_a3_records_policies` | `teacher_records`, `student_records`, `student_career_plans`, `student_academic_statuses` → personal o fila propia | OK |
| `prod1b_a4_workspace_staff_policies` | `workspace_snapshots`, `exam_engine_v21_states`, `teacher_exam_date_exclusions`, `workspace_source_files`, `teacher_availability_records`, `teacher_workload_records` → personal | OK |
| `prod1b_a5_academic_operations_policies` | las 5 tablas de 07 → personal o fila propia | OK |
| `prod1b_a6_sec2_member_lookup` | `academic_resolve_member_profile_by_email` con filtro de rol (SEC.2) | OK |
| `prod1b_a7_storage_policy` | `storage.objects` "workspace source files members read objects" → personal | OK |

**Cómo se aplicó.** Las políticas se cambiaron con `alter policy ... using (...)` y no con `drop policy` + `create policy`. El conector se colgaba hasta su timeout de 60 s en cada `DROP`; en cada corte se verificó que no se había aplicado nada. `ALTER POLICY` conserva nombre, comando, rol y tipo (permissive), así que el resultado en el catálogo es el mismo. El catálogo de 02 y los catálogos legacy de 05 ya estaban en `is_member_of_institution`, y las policies de escritura no cambian: no hizo falta tocarlos.

**Verificación (read-only).**

- Catálogo de funciones y policies (`public` + `storage`): `54260205c6992c14843d3ac3ac158c56`, 152 ítems. Antes: `559c0e88…`, 150.
- Contra la base local con el baseline de `709c7bc`, con el mismo `search_path` de Producción: **131 de 132 ítems idénticos**. El único faltante, `workspace source files canonical actor paths`, es la política que en Producción reemplazan las del gateway de `source-file-storage`. Es la diferencia esperada y es anterior a PROD1b. Los 21 ítems de más en Producción son el gateway.
- Nota sobre el hash: el hash depende del `search_path` de la sesión que lo calcula, porque Postgres escribe `auth.uid()` o `uid()` según lo que tenga visible. Por eso el valor `bb50da6b…` que se había calculado antes no sirve como referencia. La comparación válida es ítem por ítem con el mismo `search_path`.
- §4 del runbook: `handle_new_user` = 1 trigger; `upsert_exam_enrollment_from_portal` = 1 firma de 14 parámetros; 0 de 44 tablas sin RLS; `write_mode = dual_write`.
- Advisors de seguridad: mismas categorías que en `STAGING_ADVISORS_RESULT.md`. 0029 suma los dos helpers nuevos, que son por diseño: devuelven solo un booleano sobre el propio usuario.

**Sigue pendiente (Miguel, CLI):** redeploy de `admin-users` y `source-file-storage` desde release/v1. Sin ese redeploy, PB.1, PB.3 y la parte de 06.3 que vive en la Edge no corren en Producción.

### PROD1b — Edge Functions y smoke (2026-10-18)

Miguel las publicó con la CLI desde su PC.

- **admin-users v5** (01:42 UTC), desde la última versión de `release/v1`, con `--no-verify-jwt`.
- **source-file-storage v2** (01:30 UTC). Su código es igual en `main` y en `release/v1`.
- Hubo una **v4** de `admin-users` publicada por error desde `main`, sin PB.1, PB.3 ni 06.3. La v5 la reemplaza. Causa: `release/v1` estaba ocupada por un worktree de Codex. La solución fue `git checkout --detach origin/release/v1`. La base no tiene datos reales, así que no hubo impacto.

`scripts/smokeCheck.mjs` contra Producción, con la publishable key: **PASS**.

| Check | Resultado |
| --- | --- |
| auth | 200 |
| rest | 200 |
| storage | 200 |
| edge: GET `admin-users` | 405 |
| anon en tablas sensibles | 9 tablas sin filas |
| JWT inválido | 401 |
| frontend | SKIPPED: no hay dominio todavía |

Una corrida previa con la clave de ejemplo dio 401 en auth, rest y edge, como se esperaba.

**BLOQUEANTE del GO:** `ADMIN_USERS_ALLOWED_ORIGINS` y `SOURCE_FILE_STORAGE_ALLOWED_ORIGINS` no están cargados. Todavía no hay dominio productivo: hoy se trabaja en local y aplican los orígenes por defecto (localhost y 127.0.0.1, puertos 4173 y 5173). Hay que cargarlos con el dominio exacto antes de publicar el frontend.
