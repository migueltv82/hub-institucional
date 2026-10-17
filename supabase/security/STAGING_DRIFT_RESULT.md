# STG0 — Drift read-only de Staging contra release/v1

Fecha: 2026-10-17. Ejecutado por Claude (Codex sin tokens), con aprobación de Miguel por categoría "relevamientos read-only en Staging" (chat 17/10). Proyecto `Hub-Institucional-Staging` (`lzjp…aeco`), distinto de Producción (`qwrw…mibx`), verificado con `list_projects`. Solo SELECT: `supabase/security/remote_drift_snapshot*.sql` y dos consultas puntuales de catálogo. Escrituras: NONE.

## Resultado

| Área | Estado |
| --- | --- |
| Tablas del baseline (40): columnas, constraints, RLS y grants de SELECT | **Iguales** |
| Policies del baseline | **Iguales**, salvo una reemplazada a propósito por el gateway (abajo) |
| Triggers del baseline, incluido `on_auth_user_created` | **Iguales** |
| Funciones del baseline (37): cuerpo, `SECURITY DEFINER`, `search_path`, EXECUTE anon/authenticated | **36 iguales y 1 distinta**: `academic_teacher_upsert_student_grade`, el cambio 03.5b todavía no aplicado |
| Gateway de Storage (`supabase/security/source_file_storage_gateway.sql`) | **Aplicado** el 05/10 (STAGING_SECURITY_2): 14 funciones, 4 tablas, 18 triggers y 8 policies extra; reemplaza la policy `workspace source files canonical actor paths` por `source files manifest reads`. Esperado |
| `public.rls_auto_enable()` + event trigger `ensure_rls` | De la plataforma Supabase (opción "RLS automático en tablas nuevas"). No es del repo; inofensivo |
| Modo de transición (`app_settings.academic_relational_transition`) | Sin fila → default `snapshot_only` |
| Datos | **Vacío**: 0 en `auth.users` y en todas las tablas académicas; 0 objetos de Storage |
| Edge `admin-users` | v3, desplegada el 2026-10-10. **Anterior** a `1e47d92` (12/10), que le cambió 293 líneas → redesplegar |
| Edge `source-file-storage` | v1, desplegada el 2026-10-05. **Anterior** a `1e47d92` (`handler.js` +185) → redesplegar |

Nota técnica: en Staging los cuerpos de las funciones se guardaron con CRLF, por haberse pegado desde Windows. El kit ahora compara normalizando `\r`. Sin esa normalización aparecían 30 falsos positivos.

## Qué hace falta para que Staging corra release/v1 (STG1, escribe en Staging: OK puntual de Miguel)

1. Aplicar `supabase/schema/07_academic_operations.sql` (03.5b). Cuando 06.3 esté cerrada, también `01_foundation.sql`.
2. Redesplegar `admin-users` (`--no-verify-jwt`) y `source-file-storage` desde release/v1.
3. Activar `dual_write` (decisión 5): runbook §4.1.
4. Re-correr este relevamiento: drift esperado 0, salvo el gateway y `rls_auto_enable`.

## Hallazgo para Producción

El gateway de Storage **no está entre los 9 archivos** que el runbook manda aplicar. Staging lo tiene; si Producción recibe solo el baseline, queda sin el enforcement de Storage. Hay que agregar `source_file_storage_gateway.sql` al §4 del runbook, después del baseline, como se hizo en Staging.

Evidencia: `STAGING_DRIFT_COMPACT_2026-10-17.txt` (una línea `tipo|objeto|hash8` por objeto; sin datos).
