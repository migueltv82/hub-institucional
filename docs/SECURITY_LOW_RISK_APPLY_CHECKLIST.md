# Checklist seguro para aplicar SQL de Supabase

## Estado vigente y alcance de la evidencia

Baseline local descartable PASS, 9 SQL canónicos aplicados y 40 tablas public con RLS; Staging aplicado/verificado según [resultado](../supabase/baseline/STAGING_BASELINE_RESULT.md). El orden vigente está en [BASELINE_MANIFEST.md](../supabase/baseline/BASELINE_MANIFEST.md). El inventario de septiembre, el repair como «único origen», la lectura segura fuera del orden y los pasos de diseño de baseline/RPC son **HISTÓRICOS / SUPERADOS**: no usarlos como instrucciones de instalación actual ni reaplicar SQL por esta nota.

La RPC de inscripción existe/está validada y usa JWT del usuario vía `context.userClient`, con `auth.uid() = actor_user_id = target_student_id` y profile/membership/legajo tenant-workspace validados; no `adminClient`/`service_role` operativo para ese flujo. [Contrato vigente](contracts/upsert_exam_enrollment_from_portal.md). Storage enforcement certificado, límite 25 MiB; [evidencia](../supabase/baseline/STAGING_STORAGE_ENFORCEMENT_EVIDENCE.json).

Mesas Docente v1 read-only certificado; decisiones/reasignación/reconciliación DIFERIDAS post-v1. Production sigue **NO-GO**: branch protection remota, backup/restore, rollback, observabilidad, E2E/UAT y release closure pendientes. Mantener revisión y autorización por bloque; ningún gate se cierra automáticamente. `EX-001` vence 2026-10-17 y exige nueva validación para cobertura posterior.

Fecha de auditoría documental: 2026-09-24. Alcance: todos los `.sql` presentes en `supabase/security/`, `supabase/schema/` y `supabase/docs/`, más las referencias históricas de documentación. Esta guía no ejecuta SQL ni acredita ningún ambiente remoto.

**NINGÚN SCRIPT MUTANTE DEBE EJECUTARSE DIRECTAMENTE EN PRODUCCIÓN SIN HABER SIDO VALIDADO PRIMERO EN STAGING.**

## Inventario histórico — no sustituye el manifest vigente

| Script | Tipo | Riesgo | Idempotente | Requiere staging | Rollback | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| `supabase/security/2026-09-05_security_diagnostics.sql` | READ ONLY | BAJO | Sí | Recomendado | No aplica | Diagnóstico inicial obligatorio; puede exponer metadatos sensibles en evidencia. |
| `supabase/security/2026-09-05_low_risk_indexes_search_path_auth_uid.sql` | MUTACIÓN DE SCHEMA | MEDIO | Parcial | Sí | Parcial por bloque | Índices, funciones y policies; ejecutar un bloque por vez, no como lote. Incluye hardening preparado de `handle_new_user()` para no confiar roles a `raw_user_meta_data`. |
| `supabase/security/2026-09-05_rls_function_permissions_review.sql` | MIXTO | ALTO | Parcial | Sí | Parcial y manual | Cambia grants/revokes; puede abrir o romper acceso si RLS no está validada. |
| `supabase/security/2026-09-05_manual_review_constraints.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Parcial por constraint/índice | Las propuestas están comentadas; no extraer bloques sin validar datos primero. |
| `supabase/security/student_portal_exam_visibility_tests.sql` | TEST/VALIDACIÓN | MEDIO | Sí | Sí | `rollback` incluido | Prueba negativa focalizada para portal alumno/mesas; exige actores preparados. |
| `supabase/schema/01_foundation.sql` | MIXTO | ALTO | Parcial | Sí | Manual | Fuente canónica foundation; incluye seed superadmin condicionado, RLS/RPC base y hardening preparado de `handle_new_user()` con rol mínimo por defecto. |
| `supabase/schema/02_academic_relational_schema.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Fuente canónica académica; impacta PII, padrones, grants, triggers y policies. |
| `supabase/schema/03_workspace_data.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Fuente canónica de snapshots y estado v2.1; contiene datos JSON operativos. |
| `supabase/schema/04_teacher_exam_date_exclusions.sql` | MUTACIÓN DE SCHEMA | MEDIO | Parcial | Sí | Manual | Fuente canónica de bloqueos docentes; depende de `teacher_records`. |
| `supabase/schema/05_workspace_operational_compat.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Fuente canónica de datos operativos, Storage y legacy compat. |
| `supabase/schema/05_student_portal_secure_read.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | RPC de lectura segura del alumno; no figura en el orden de `00_README.md` y debe ordenarse antes de aplicar. |
| `supabase/schema/06_subject_teacher_assignments.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Fuente canónica de asignaciones docente-materia y RPCs asociadas. |
| `supabase/schema/07_academic_operations.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Fuente canónica de inscripciones, libro docente, notas, asistencia y RPCs. |
| `supabase/docs/verify_01_foundation_p0.sql` | TEST/VALIDACIÓN | BAJO | Sí | Recomendado | No aplica | Verifica RPCs, grants, RLS, perfiles, membresías y auditoría base. |
| `supabase/docs/verify_02_roster_records_ui_compat.sql` | TEST/VALIDACIÓN | BAJO | Sí | Recomendado | No aplica | Verifica columnas, constraints, triggers, grants, policies y duplicados. |
| `supabase/docs/verify_02_roster_records_ui_compat_summary.sql` | TEST/VALIDACIÓN | BAJO | Sí | Recomendado | No aplica | Usa tabla temporal `pg_temp`; no persiste cambios. |
| `supabase/docs/verify_03_workspace_functional_counts.sql` | TEST/VALIDACIÓN | BAJO | Sí | Sí | No aplica | Conteos funcionales con UUID de institución hardcodeado; ajustar antes de usar. |
| `supabase/docs/verify_03_workspace_operational_compat_summary.sql` | TEST/VALIDACIÓN | BAJO | Sí | Recomendado | No aplica | Usa `pg_temp`; valida etapa 3 y Storage. |
| `supabase/docs/verify_04_subject_teacher_assignments_summary.sql` | TEST/VALIDACIÓN | BAJO | Sí | Recomendado | No aplica | Usa `pg_temp`; valida asignaciones docente-materia. |
| `supabase/docs/verify_05_academic_operations_summary.sql` | TEST/VALIDACIÓN | BAJO | Sí | Recomendado | No aplica | Usa `pg_temp`; valida etapa 5 académica. |
| `supabase/docs/verify_05_student_portal_enrollment_diagnostics.sql` | TEST/VALIDACIÓN | BAJO | Sí | Sí | No aplica | Diagnóstico post-smoke con UUID y ventana temporal hardcodeados. |
| `supabase/docs/verify_05_student_portal_manual_student_career_fallback.sql` | TEST/VALIDACIÓN | BAJO | Sí | Sí | No aplica | Diagnóstico con búsqueda nominal hardcodeada; anonimizar evidencia. |
| `supabase/docs/verify_05_teacher_portal_functional_counts.sql` | TEST/VALIDACIÓN | BAJO | Sí | Sí | No aplica | Conteos post-smoke docente con UUID y ventana temporal hardcodeados. |
| `supabase/docs/repair_01_deleted_person_records.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Agrega tabla/RLS y reemplaza RPC de baja; la RPC puede borrar accesos al invocarse. |
| `supabase/docs/repair_02_student_records_duplicate_upsert_keys.sql` | MIXTO | CRÍTICO | No | Sí | Backup/restauración | Fusiona y elimina duplicados de `student_records`; no ejecutar sin respaldo ensayado. |
| `supabase/docs/repair_05_enable_academic_transition_dual_write.sql` | MUTACIÓN DE DATOS | MEDIO | Sí | Sí | Script comentado/manual | Cambia `app_settings`; útil solo para smoke controlado de transición. |
| `supabase/docs/repair_05_portal_connection_read_rpcs.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Reemplaza RPCs hoy también presentes en `schema/07`; tratar como parche histórico. |
| `supabase/docs/repair_05_student_portal_career_fallback.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Reemplaza `get_student_portal_workspace_snapshot`; superado por variantes posteriores. |
| `supabase/docs/repair_05_student_portal_classmates.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Reemplaza la misma RPC que el fallback; candidato duplicado/obsoleto. |
| `supabase/docs/repair_05_student_portal_grades_rpc.sql` | MUTACIÓN DE SCHEMA | MEDIO | Parcial | Sí | Manual | Subconjunto de RPC también incluido en `repair_05_portal_connection_read_rpcs.sql` y `schema/07`. |
| `supabase/docs/repair_05_teacher_student_removal_reset_rpcs.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Define RPCs destructivas de reinicio/baja académica; duplicadas por `schema/07`. |
| `supabase/docs/repair_06_exam_process_reset_rpc.sql` | MUTACIÓN DE SCHEMA | ALTO | Parcial | Sí | Manual | Define RPC de reset que al invocarse actualiza/borra datos operativos de mesas. |
| `supabase/docs/repair_06_exam_teacher_assignments.sql` | MIXTO | ALTO | Parcial | Sí | Manual | Crea tablas/RLS/RPCs y backfills; único origen actual para `exam_teacher_assignments`. |
| `supabase/docs/repair_07_exam_engine_v21_state.sql` | MIXTO | MEDIO | Sí | Sí | Manual | Duplica tabla/policies de `schema/03` y migra datos desde `workspace_snapshots`. |

Resumen del inventario: 34 scripts SQL analizados; 12 son lectura/validación sin mutación permanente esperada; 22 contienen mutaciones reales, propuestas o capacidades mutantes. Hay 1 script de riesgo CRÍTICO y al menos 6 scripts candidatos a obsoletos/duplicados.

## Orden propuesto histórico — SUPERADO por el manifest vigente

Este orden es un procedimiento de evaluación, no una autorización de ejecución:

1. Congelar versión candidata: commit, ambiente, operador, revisor y alcance.
2. Preparar respaldo recuperable de base, Storage y configuración; ensayar restauración en ambiente aislado.
3. Preparar staging con el mismo esquema esperado y datos sintéticos o anonimizados suficientes.
4. Ejecutar solo diagnósticos y verificaciones sin mutación:
   - `supabase/security/2026-09-05_security_diagnostics.sql`
   - verificadores `supabase/docs/verify_*`
   - `supabase/security/student_portal_exam_visibility_tests.sql` si existen actores preparados.
5. Para instalación nueva o staging vacío, usar como fuente canónica el orden documentado por `supabase/schema/00_README.md`: `01_foundation` → `02_academic_relational_schema` → `03_workspace_data` → `04_teacher_exam_date_exclusions` → `05_workspace_operational_compat` → `06_subject_teacher_assignments` → `07_academic_operations`.
6. Resolver explícitamente la posición de `supabase/schema/05_student_portal_secure_read.sql` antes de aplicarlo: el archivo existe, pero no está en el orden canónico y contiene dependencias funcionales que deben validarse.
7. Usar `supabase/docs/repair_*` solo como reparación condicionada por una falla o brecha confirmada. No mezclarlos con el flujo canónico sin reconciliar duplicados.
8. Evaluar `2026-09-05_low_risk_indexes_search_path_auth_uid.sql` un bloque por vez después de capturar definiciones originales.
9. Evaluar `2026-09-05_rls_function_permissions_review.sql` con aprobación humana por bloque; no ejecutar entero.
10. Evaluar constraints solo después de resolver datos inválidos y duplicados.
11. Repetir diagnósticos, pruebas negativas y smoke tests por rol antes de cualquier promoción.

## Precondiciones

- Staging funcional y aislado, con Auth, RLS, Storage y Edge Function compatibles con la versión candidata.
- Datos de prueba para al menos dos instituciones, con usuarios `anon`, alumno, docente, admin institucional y superadmin.
- Evidencia de línea base: tablas, columnas, constraints, grants, policies, funciones, owners, índices, buckets y policies de Storage.
- Revisor independiente para cambios de RLS, permisos, RPCs `SECURITY DEFINER`, deduplicación de datos y cualquier rollback.
- Comparar cada función/RPC afectada contra [SECURITY_FUNCTION_MATRIX.md](SECURITY_FUNCTION_MATRIX.md), incluyendo `SECURITY DEFINER`, `search_path`, grants/revokes y caller esperado.
- Resolver el drift remoto confirmado en [SUPABASE_DRIFT_AUDIT.md](SUPABASE_DRIFT_AUDIT.md) antes de aplicar SQL preparado en un ambiente compartido: `handle_new_user()` remoto conserva la vulnerabilidad 02.3 y 12 RPC llamadas por el producto están ausentes.
- Preparar la ejecución futura de [STAGING_SECURITY_TEST_MATRIX.md](STAGING_SECURITY_TEST_MATRIX.md) con datos sintéticos por rol.
- Decisión explícita sobre scripts duplicados/obsoletos antes de aplicar.

## Backup

- Crear respaldo antes de cualquier mutación de schema, permisos o datos.
- El respaldo debe cubrir Postgres, Storage y configuración necesaria de Auth/Functions.
- Ensayar restauración en ambiente aislado antes de tocar producción.
- No guardar backups, DNIs, emails, tokens ni resultados nominales en el repo.

## Staging

- Ejecutar primero la ruta completa en staging.
- Registrar cada bloque aplicado, salida esperada, salida real, duración y responsable.
- Detenerse ante diferencias no explicadas entre staging y la fuente local.
- No considerar válido un staging que solo prueba modo demo o una cuenta privilegiada.

## GO/NO-GO

GO exige todo esto:

- Diagnósticos sin hallazgos bloqueantes no resueltos.
- Backups probados.
- Orden canónico y reparaciones reconciliadas.
- Pruebas negativas por rol/institución en verde.
- Verificaciones `verify_*` relevantes con estado OK.
- Smoke tests reales en staging para los flujos afectados.
- Revisión humana de cada grant, policy, RPC `SECURITY DEFINER`, constraint y deduplicación.

NO-GO si ocurre cualquiera de estas condiciones:

- Falta staging o respaldo recuperable.
- Se pretende ejecutar SQL mutante directo en producción.
- Hay PII, RLS, grants o `SECURITY DEFINER` sin revisión.
- El discovery remoto confirma P1/P2 abiertos: `handle_new_user()` vulnerable, RPC críticas ausentes, grants/`EXECUTE` amplios o RLS/Storage sin pruebas negativas.
- Falta acceso remoto read-only suficiente para inventariar funciones, grants, triggers, RLS, Storage y Auth no sensible.
- Un script duplicado/obsoleto compite con una fuente canónica más nueva.
- Falta el test negativo integral de RLS/Storage o su equivalente revisado.
- Hay duplicados o datos inválidos antes de constraints únicas/checks.

## Post-check

Post-check mínimo:

1. Repetir `2026-09-05_security_diagnostics.sql`.
2. Ejecutar los `verify_*` correspondientes a cada etapa aplicada.
3. Ejecutar `student_portal_exam_visibility_tests.sql` con fixtures preparados.
4. Ejecutar una matriz negativa integral de RLS/Storage por rol y tenant. El script histórico `supabase/security/rls_negative_tests.sql` no existe en este checkout; su ausencia bloquea declarar cobertura integral.
5. Probar login, lectura y escritura permitida/denegada de alumno, docente, admin institucional y superadmin.
6. Verificar que `admin-users` no expone `service_role`, que CORS usa orígenes concretos y que los logs no contienen secretos.
7. Crear un usuario de prueba con metadata de cliente manipulada (`account_role`, `is_global_admin`) y confirmar que `profiles.account_role` no escala privilegios, que `profiles.is_global_admin` queda falso salvo alta administrativa legitima y que las membresías solo aparecen por flujo autorizado.
8. Para toda RPC aplicada o existente en remoto, capturar `pg_get_functiondef`, privilegios reales y pruebas `anon`/`authenticated`/cross-tenant; reconciliar cualquier diferencia con la matriz 02.4 antes de avanzar.

## Rollback

Los rollbacks comentados son orientación, no un plan universal.

- Para funciones y policies: restaurar la definición exacta capturada en línea base.
- Para grants: revertir solo el privilegio afectado; no restaurar `PUBLIC` por comodidad.
- Para constraints e índices únicos: retirar la constraint no revierte datos eliminados, fusionados o cascadas ya ocurridas.
- Para scripts con mutación de datos (`repair_02`, backfills o resets): el rollback real es restauración o procedimiento manual validado.
- Tras cualquier reversión, repetir diagnósticos y pruebas funcionales.

## Producción

Producción solo puede considerarse después de staging aprobado. La aplicación debe hacerse por ventana controlada, con operador y revisor disponibles, respaldo validado, plan de reversión probado y bitácora externa con evidencia sin secretos ni PII.

No ejecutar en producción:

- `repair_02_student_records_duplicate_upsert_keys.sql` sin respaldo/restauración probada.
- Reparaciones históricas duplicadas sin reconciliación con `supabase/schema/`.
- Grants/RLS completos como lote.
- Constraints únicas/checks sin demostrar que los datos cumplen.
- Pruebas con usuarios o instituciones reales si el script requiere fixtures preparados.

## Scripts obsoletos o duplicados

- `supabase/README.md` fue actualizado en 02.1 para dejar de presentar `setup_multi_tenant/` y `rls_negative_tests.sql` como flujo ejecutable. Si aparecen esas rutas en documentación histórica, tratarlas como no ejecutables en este checkout.
- `repair_05_student_portal_career_fallback.sql`, `repair_05_student_portal_classmates.sql` y `schema/05_student_portal_secure_read.sql` reemplazan la misma RPC `get_student_portal_workspace_snapshot`; deben reconciliarse antes de aplicar.
- `repair_05_student_portal_grades_rpc.sql` es subconjunto de `repair_05_portal_connection_read_rpcs.sql` y de `schema/07_academic_operations.sql`.
- `repair_05_portal_connection_read_rpcs.sql` y `repair_05_teacher_student_removal_reset_rpcs.sql` contienen RPCs que ya aparecen en `schema/07_academic_operations.sql`.
- `repair_07_exam_engine_v21_state.sql` duplica `exam_engine_v21_states`, ya presente en `schema/03_workspace_data.sql`, y además migra datos.
- `schema/05_student_portal_secure_read.sql` existe fuera del orden canónico de `schema/00_README.md`; no es necesariamente obsoleto, pero queda pendiente de integración documental.

## Qué anotar en WORKLOG

Cada intervención futura debe registrar:

- Fecha/hora, zona horaria, operador, revisor y ambiente.
- Commit/hash y scripts/bloques exactos.
- Línea base y evidencia restringida.
- Backup y restauración ensayada.
- Resultado de staging, GO/NO-GO y aprobación.
- Bloques aplicados, omitidos, fallidos o revertidos.
- Resultado de verificaciones y pruebas negativas.
- Incidentes, riesgos residuales y próxima acción.

Para esta auditoría 02.1 registrar: **solo documentación; SQL remoto no ejecutado; Supabase remoto no modificado**.
