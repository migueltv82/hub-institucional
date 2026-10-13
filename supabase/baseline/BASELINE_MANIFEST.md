# ETAPA 02.8A — Baseline canónico reproducible

Fecha: 2026-09-26. Alcance: fuente de verdad SQL local para reconstruir staging en una etapa posterior. Este manifest no despliega, no ejecuta SQL, no crea migrations, no toca staging y no toca production.

## Estado vigente acreditado

Los 9 SQL canónicos ya fueron aplicados; el baseline local descartable es PASS y las 40 tablas public tienen RLS. [LOCAL_AB_RLS_RPC_RESULT.md](./LOCAL_AB_RLS_RPC_RESULT.md) registra la validación local y sus límites; [STAGING_BASELINE_RESULT.md](./STAGING_BASELINE_RESULT.md) acredita el baseline aplicado y verificado en Staging. La concurrencia focal y sus límites se documentan en [LOCAL_CONCURRENCY_RESULT.md](./LOCAL_CONCURRENCY_RESULT.md).

Los estados `PARCIAL`, pendiente de validación DB y `LOCAL BASELINE EXECUTION PENDING` conservados debajo son HISTÓRICOS / SUPERADOS por esas ejecuciones. El inventario y la secuencia original se preservan como trazabilidad; no constituyen autorización para reaplicar SQL ni para habilitar las features incompletas. Esta nota no declara un release global ni valida Production.

## Decisión 02.8A — HISTÓRICA / SUPERADA

El baseline ejecutable queda **PARCIAL**. Hay suficiente evidencia para definir el orden canónico, clasificar SQL histórico y fijar los bloqueos, pero no para producir una cadena SQL completa que reconstruya staging sin intervención:

- `get_academic_transition_config` quedó implementada localmente en 02.8B-2 y requiere validación DB antes de ejecutarse en staging.
- `upsert_exam_enrollment_from_portal` ya está implementada localmente en `supabase/schema/08_exam_tables.sql`, pero requiere validación dinámica en PostgreSQL.
- El schema canónico local de mesas de examen y penalidades por ausencia quedó implementado en `supabase/schema/08_exam_tables.sql`, pero falta validarlo dinámicamente en PostgreSQL.
- Las 10 RPC de feature incompleta no deben inventarse para completar artificialmente la base.

Por eso este directorio contiene el manifest y la decisión de baseline, pero **no contiene todavía archivos SQL ejecutables del baseline**.

## Inventario SQL completo

| Archivo | Categoría | Objetos | Dependencias | Baseline | Motivo |
| --- | --- | --- | --- | --- | --- |
| `supabase/schema/01_foundation.sql` | CANONICAL | Extensiones, identidad, instituciones, memberships, auditoría, `app_settings`, helpers/RPC base, `handle_new_user`, RLS/grants | Auth users; roles Supabase; `auth.users` trigger | SÍ | Base del tenant, Auth profile y hardening 02.3 preparado. |
| `supabase/schema/02_academic_relational_schema.sql` | CANONICAL | Carreras, planes, materias, docentes, alumnos, trayectorias, triggers UI compat, RLS | `01_foundation.sql` | SÍ | Núcleo académico relacional. |
| `supabase/schema/03_workspace_data.sql` | CANONICAL | `workspace_snapshots`, `exam_engine_v21_states`, RLS | `01_foundation.sql` | SÍ | Persistencia de workspace y estado del motor. |
| `supabase/schema/04_teacher_exam_date_exclusions.sql` | CANONICAL | Bloqueos puntuales de docentes, RLS | `01_foundation.sql`, `02_academic_relational_schema.sql` | SÍ | Complemento del motor relacional de mesas. |
| `supabase/schema/05_workspace_operational_compat.sql` | CANONICAL | `workspace_source_files`, bucket `workspace-source-files`, disponibilidad/carga docente, legacy operativo, Storage policies | `01_foundation.sql`, `02_academic_relational_schema.sql`, Storage schema | SÍ CON REVISIÓN | Canónico para estructura/policies, nunca objetos productivos. |
| `supabase/schema/05_student_portal_secure_read.sql` | CANONICAL | `get_student_portal_workspace_snapshot` y lectura segura del portal alumno | `01_foundation.sql`, `02_academic_relational_schema.sql`, `03_workspace_data.sql`, `07_academic_operations.sql`, `08_exam_tables.sql` | SÍ | RPC de lectura del portal alumno; debe ejecutarse después de sus tablas fuente. |
| `supabase/schema/06_subject_teacher_assignments.sql` | CANONICAL | Asignaciones docente-materia UI, RPC de licencia/condición, RLS/grants | `01_foundation.sql`, `02_academic_relational_schema.sql` | SÍ | Modelo operativo de asignación docente. |
| `supabase/schema/07_academic_operations.sql` | CANONICAL | Inscripciones, notas, clases, asistencia, deuda, RPC docente/alumno, RLS/grants | `01_foundation.sql`, `02_academic_relational_schema.sql`, `06_subject_teacher_assignments.sql` | SÍ | Operación académica actual. |
| `supabase/schema/08_exam_tables.sql` | CANONICAL | Mesas de examen, materias de mesa, tribunal, inscripciones, `exam_absence_penalties`, eventos append-only, RPC `upsert_exam_enrollment_from_portal`, RLS default-deny | `01_foundation.sql`, `02_academic_relational_schema.sql`, `07_academic_operations.sql` | SÍ | Implementa localmente los modelos aprobados y la RPC de inscripción; no migra datos legacy. |
| `supabase/security/2026-09-05_low_risk_indexes_search_path_auth_uid.sql` | SECURITY PATCH | Índices/hardening/search_path/`handle_new_user` preparado | Schema canónico | NO COMO ARCHIVO | Absorber cambios aprobados en schema canónico; no ejecutar como lote histórico. |
| `supabase/security/2026-09-05_rls_function_permissions_review.sql` | SECURITY PATCH | Revokes/grants y hardening de funciones | Schema canónico | NO COMO ARCHIVO | Fuente de decisiones de seguridad; trasladar a schema, no aplicar ciegamente. |
| `supabase/security/2026-09-05_manual_review_constraints.sql` | MIGRATION CANDIDATE | Constraints e índices con revisión manual | Datos limpios; schema canónico | NO | Requiere validar datos antes de promover al baseline. |
| `supabase/docs/repair_06_exam_teacher_assignments.sql` | MIGRATION CANDIDATE | `exam_teacher_assignments`, `exam_enrollments`, RPC de confirmación/objeción, RLS | Schema académico y operación de mesas | NO | Funcionalidad real ausente del schema canónico; requiere diseño/reconciliación. |
| `supabase/docs/repair_06_exam_process_reset_rpc.sql` | MIGRATION CANDIDATE | `academic_admin_reset_exam_process` | Tablas de mesas/legacy exam sessions | NO | RPC consumida con fallback; requiere reconciliar modelo de mesas. |
| `supabase/docs/repair_01_deleted_person_records.sql` | REPAIR ONLY | `deleted_person_records`, `delete_institution_user` anterior | `01_foundation.sql` | NO | Ya absorbido por foundation. |
| `supabase/docs/repair_02_student_records_duplicate_upsert_keys.sql` | REPAIR ONLY | Limpieza/merge de duplicados y constraint | Datos existentes | NO | Data repair histórico; staging limpio no lo necesita. |
| `supabase/docs/repair_05_portal_connection_read_rpcs.sql` | REPAIR ONLY | RPC de rosters/avisos/notas del portal | `07_academic_operations.sql` | NO | Ya absorbido por schema canónico. |
| `supabase/docs/repair_05_student_portal_grades_rpc.sql` | REPAIR ONLY | `academic_get_student_portal_grades` | `07_academic_operations.sql` | NO | Ya absorbido por schema canónico. |
| `supabase/docs/repair_05_teacher_student_removal_reset_rpcs.sql` | REPAIR ONLY | RPC de baja/reset académico docente | `07_academic_operations.sql` | NO | Ya absorbido por schema canónico. |
| `supabase/docs/repair_07_exam_engine_v21_state.sql` | REPAIR ONLY | Estado del motor v21 | `03_workspace_data.sql` | NO | Ya absorbido por schema canónico. |
| `supabase/security/2026-09-05_security_diagnostics.sql` | DIAGNOSTIC | Consultas de diagnóstico | Base existente | NO | Solo lectura/diagnóstico. |
| `supabase/security/remote_readonly_discovery.sql` | DIAGNOSTIC | Discovery remoto read-only | Base existente | NO | No forma parte del baseline. |
| `supabase/security/student_portal_exam_visibility_tests.sql` | TEST | Prueba focal de visibilidad de mesas | Datos/actores preparados | NO | Test posterior, no instalación. |
| `supabase/docs/verify_01_foundation_p0.sql` | VALIDATION | Verificación foundation | `01_foundation.sql` | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/verify_02_roster_records_ui_compat.sql` | VALIDATION | Verificación padrones UI | `02_academic_relational_schema.sql` | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/verify_02_roster_records_ui_compat_summary.sql` | VALIDATION | Resumen verificación padrones UI | `02_academic_relational_schema.sql` | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/verify_03_workspace_functional_counts.sql` | VALIDATION | Conteos funcionales workspace | Schema workspace | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/verify_03_workspace_operational_compat_summary.sql` | VALIDATION | Verificación compat operativa y Storage | `05_workspace_operational_compat.sql` | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/verify_04_subject_teacher_assignments_summary.sql` | VALIDATION | Verificación asignaciones docente | `06_subject_teacher_assignments.sql` | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/verify_05_academic_operations_summary.sql` | VALIDATION | Verificación operación académica | `07_academic_operations.sql` | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/verify_05_student_portal_enrollment_diagnostics.sql` | VALIDATION | Diagnóstico de inscripción portal alumno | Datos/fixtures | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/verify_05_student_portal_manual_student_career_fallback.sql` | VALIDATION | Verificación manual fallback carrera alumno | Datos/fixtures | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/verify_05_teacher_portal_functional_counts.sql` | VALIDATION | Conteos funcionales portal docente | Datos/fixtures | VALIDACIÓN | Se ejecuta después, no instala. |
| `supabase/docs/repair_05_student_portal_career_fallback.sql` | DEPRECATED | Variante histórica de `get_student_portal_workspace_snapshot` | Workspace legacy | NO | Sustituido por `05_student_portal_secure_read.sql`; no incorporar. |
| `supabase/docs/repair_05_student_portal_classmates.sql` | DEPRECATED | Variante histórica de `get_student_portal_workspace_snapshot` | Workspace legacy | NO | Sustituido por `05_student_portal_secure_read.sql`; no incorporar. |
| `supabase/docs/repair_05_enable_academic_transition_dual_write.sql` | NEEDS INVESTIGATION | Config de transición académica dual-write | `app_settings`; Edge Function | NO | Sigue fuera del baseline: es mutación de configuración/datos para smoke, no definición canónica de la RPC. |

## Cantidad por categoría

| Categoría | Cantidad |
| --- | ---: |
| CANONICAL | 9 |
| SECURITY PATCH | 2 |
| MIGRATION CANDIDATE | 3 |
| REPAIR ONLY | 6 |
| DIAGNOSTIC | 2 |
| TEST | 1 |
| VALIDATION | 10 |
| DEPRECATED | 2 |
| NEEDS INVESTIGATION | 1 |

Total local inventariado: 36 archivos SQL bajo `supabase/`.

Nota: 34 están trackeados por Git según `git ls-files "supabase/**/*.sql"`. `supabase/security/remote_readonly_discovery.sql` existe localmente como diagnóstico de la etapa 02.5, pero todavía figura como archivo no trackeado en este checkout. Se clasifica igual para no perderlo del inventario operativo.

## Orden exacto de instalación futura

Este orden deriva del SQL local actual. No debe ejecutarse contra staging hasta resolver los bloqueos.

| Orden | Archivo | Propósito | Dependencias | Muta schema/datos/config | Idempotencia | Rollback posible | Validación posterior |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 0 | Dashboard/API Auth manual | Crear/configurar usuario bootstrap y settings Auth no versionables | Proyecto vacío | Config/Auth | Manual | Manual dashboard | Checklist Auth de `docs/BASELINE_READINESS.md` |
| 1 | `supabase/schema/01_foundation.sql` | Foundation multi-tenant, profiles, memberships, auditoría, `handle_new_user` seguro | Auth schema existente | Schema + seed bootstrap documentado | Parcial: DDL idempotente; seed requiere cuidado | Manual sobre objetos creados | `verify_01_foundation_p0.sql` |
| 2 | `supabase/schema/02_academic_relational_schema.sql` | Núcleo académico relacional | Orden 1 | Schema | Parcial/idempotente | Manual | `verify_02_roster_records_ui_compat_summary.sql` |
| 3 | `supabase/schema/03_workspace_data.sql` | Workspace snapshots y estado motor | Orden 1 | Schema | Parcial/idempotente | Manual | `verify_03_workspace_functional_counts.sql` |
| 4 | `supabase/schema/04_teacher_exam_date_exclusions.sql` | Bloqueos puntuales docentes | Órdenes 1-2 | Schema | Parcial/idempotente | Manual | Pruebas relacionales del motor |
| 5 | `supabase/schema/05_workspace_operational_compat.sql` | Storage metadata/policies y compat operativa | Órdenes 1-3; Storage schema Supabase | Schema + bucket/config Storage | Parcial: bucket upsert | Manual dashboard/SQL | `verify_03_workspace_operational_compat_summary.sql` |
| 6 | `supabase/schema/06_subject_teacher_assignments.sql` | Asignaciones docente-materia y RPC de gestión | Órdenes 1-2 | Schema/functions/RLS | Parcial/idempotente | Manual | `verify_04_subject_teacher_assignments_summary.sql` |
| 7 | `supabase/schema/07_academic_operations.sql` | Inscripciones, clases, notas, asistencia, deuda y RPC docentes/alumnos | Órdenes 1-2 y 6 | Schema/functions/RLS | Parcial/idempotente | Manual | `verify_05_academic_operations_summary.sql` |
| 8 | `supabase/schema/08_exam_tables.sql` | Mesas canónicas, tribunal, inscripciones, penalidades por ausencia, eventos y RPC `upsert_exam_enrollment_from_portal` | Órdenes 1-7 | Schema/RLS/grants/RPC | Parcial/idempotente para base limpia/canónica; bloquea shapes legacy incompatibles | Manual/migración controlada | Tests estáticos de schema/RPC y futura matriz RLS/RPC A/B |
| 9 | `supabase/schema/05_student_portal_secure_read.sql` | Lectura segura del portal alumno | Órdenes 1-3, 7-8 | Functions/RPC/grants | `CREATE OR REPLACE`; grants revisables | Reemplazar función | Test portal alumno |
| 10 | Validaciones | `supabase/docs/verify_*.sql` y tests SQL | Baseline instalado con fixtures | Lectura/validación | N/A | N/A | PASS requerido |

## Objetos canónicos locales

Resumen por tipo:

- Schemas usados: `public`, `storage`, `auth`.
- Extensions/versionables: `pgcrypto` según `01_foundation.sql`.
- Tables canónicas locales: 40 tablas de app en `public`, sin contar tablas internas de Supabase.
- Storage: bucket privado `workspace-source-files` y policies sobre `storage.objects`.
- Functions/RPC locales: foundation/login/admin, portal alumno, asignaciones, operación académica, triggers internos y helpers.
- RLS: requerida en todas las tablas de app de `public`; actualmente no se define `FORCE RLS` como requisito canónico.
- Grants/revokes: modelo mínimo derivado por consumidores, no por production.

## RPC feature incompleta

No incorporar al baseline ni inventar implementación:

| RPC | Estado 02.8A | Alcanzabilidad | Decisión |
| --- | --- | --- | --- |
| `academic_admin_create_student_career_enrollment` | Sin definición canónica | Preview/admin interno | Bloqueo si se habilita feature; no baseline. |
| `academic_admin_correct_student_career_enrollment` | Sin definición canónica | Preview/admin interno | Bloqueo si se habilita feature; no baseline. |
| `academic_admin_get_student_career_enrollment_history` | Sin definición canónica | Preview/admin interno | Bloqueo si se habilita feature; no baseline. |
| `academic_admin_get_teacher_profile_link_candidates` | Sin definición canónica | Preview perfil docente | Bloqueo si se habilita feature; no baseline. |
| `academic_admin_invalidate_student_career_enrollment` | Sin definición canónica | Preview/admin interno | Bloqueo si se habilita feature; no baseline. |
| `academic_admin_link_teacher_record_profile` | Sin definición canónica | Preview perfil docente | Bloqueo si se habilita feature; no baseline. |
| `academic_enroll_first_year_student` | Sin definición canónica | Preview/servicio interno | Bloqueo si se habilita feature; no baseline. |
| `academic_enroll_student_in_course_offering` | Sin definición canónica | Preview/servicio interno | Bloqueo si se habilita feature; no baseline. |
| `academic_get_student_course_enrollment_preview` | Sin definición canónica | Preview alumno | Bloqueo si se habilita feature; no baseline. |
| `academic_get_teacher_course_roster_preview` | Sin definición canónica | Preview docente | Bloqueo si se habilita feature; no baseline. |

## RPC necesarias

Nota HISTÓRICA / SUPERADA: las menciones de validación DB pendiente en esta sección describen el estado anterior a los resultados referenciados en «Estado vigente acreditado».

### `get_academic_transition_config`

- Implementación localizada: SÍ, en `supabase/schema/01_foundation.sql`.
- Contrato recuperado: SÍ, documentado en `docs/contracts/get_academic_transition_config.md`.
- Decisión 02.8B-2: `RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB`; no se ejecutó SQL ni se desplegó.
- Git history/branches locales: revisados con búsqueda por `get_academic_transition_config`; hay menciones documentales, caller frontend y lectura server-side de `app_settings`, pero no definición `create function` autoritativa.
- Caller principal: portal alumno.
- Fuente: `app_settings.key = 'academic_relational_transition'`, global y privada (`is_public = false`), con retorno mínimo esperado.
- Seguridad implementada: `SECURITY DEFINER`, `set search_path = ''`, defensa interna con `auth.uid()`, `EXECUTE` para `authenticated`, revocado para `public` y `anon`.
- Fail-safe: config ausente/inválida cae a `snapshot_only`; flags relacionales peligrosos no se habilitan por default.
- Riesgo residual: falta validación dinámica en PostgreSQL local/staging.
- Estado: `RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB`.

### `upsert_exam_enrollment_from_portal`

- Implementación local canónica: SÍ, en `supabase/schema/08_exam_tables.sql`.
- Contrato: documentado y cubierto por test focal estático.
- La referencia histórica a “migración 15” no aportó SQL recuperable; la implementación actual es local.
- Caller principal: Edge Function `admin-users` para inscripción/cancelación de mesa.
- Riesgo residual: falta validación dinámica de la RPC en PostgreSQL local descartable.
- Estado: `RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB`.

## EXECUTE mínimo esperado

- `public`: NO para todas las RPC privadas y triggers internos.
- `anon`: solo funciones públicas explícitas: `get_public_app_status`, `list_active_login_institutions` y lectura pública de `app_settings` marcada `is_public`.
- `authenticated`: RPC de usuario/admin que validan internamente rol/tenant.
- `service_role`: solo funciones que la Edge Function necesita después de validar al usuario, especialmente `teacher_remove_student_subject_records` y `teacher_reset_student_subject_academic_records`.
- Trigger-only: `handle_new_user`, `sync_*`, `touch_*`; sin ejecución directa para `public`, `anon` ni `authenticated`.

## RLS canónico

- Todas las tablas de app en `public` requieren RLS.
- Fixture obligatorio futuro: Institución A no puede leer/escribir Institución B.
- Las policies actuales basadas en `is_member_of_institution` son aceptables como baseline parcial para lectura tenant, pero siguen pendientes de mínimo privilegio por rol/recurso antes de production.
- `FORCE RLS`: no requerido por defecto en 02.8A; evaluar si se agregan roles DB no-owner o accesos privilegiados fuera de PostgREST.

## Repairs A/B/C/D/E

| Repair | Clase | Decisión |
| --- | --- | --- |
| `repair_01_deleted_person_records.sql` | A | Absorbido por `01_foundation.sql`. |
| `repair_02_student_records_duplicate_upsert_keys.sql` | B | Data repair histórico; staging limpio no lo necesita. |
| `repair_05_enable_academic_transition_dual_write.sql` | D | Mutación histórica de config para smoke dual-write; no entra al baseline ni sustituye la RPC canónica ya versionada. |
| `repair_05_portal_connection_read_rpcs.sql` | A | Absorbido por `07_academic_operations.sql`. |
| `repair_05_student_portal_career_fallback.sql` | E | Obsoleto frente a `05_student_portal_secure_read.sql`. |
| `repair_05_student_portal_classmates.sql` | E | Obsoleto frente a `05_student_portal_secure_read.sql`. |
| `repair_05_student_portal_grades_rpc.sql` | A | Absorbido por `07_academic_operations.sql`. |
| `repair_05_teacher_student_removal_reset_rpcs.sql` | A/C | Absorbido por `07_academic_operations.sql`; conserva decisión de grants service-role. |
| `repair_06_exam_process_reset_rpc.sql` | D | RPC legacy de reset todavía ausente del schema canónico; requiere rediseño contra `08_exam_tables.sql`. |
| `repair_06_exam_teacher_assignments.sql` | D | Tablas legacy reemplazadas por `08_exam_tables.sql`; RPC históricas siguen fuera hasta una etapa separada. |
| `repair_07_exam_engine_v21_state.sql` | A | Absorbido por `03_workspace_data.sql`. |

Totales repairs: A=5, B=1, C=1, D=3, E=2. `repair_05_teacher_student_removal_reset_rpcs.sql` cuenta en A y C porque ya está absorbido y además preserva una decisión de security hardening.

## Storage

Baseline futuro:

- Crear/asegurar bucket privado `workspace-source-files`.
- Versionar metadata/policies, no objetos.
- Nunca copiar objetos productivos.
- Validar policies con tenant A/B y paths malformados.

## Auth no versionable

Versionable por SQL/config local:

- `handle_new_user()`.
- Trigger `auth.users`.
- `profiles`/`memberships`/RLS.
- `supabase/config.toml` como referencia local.

No versionable completamente en SQL:

- Estado real de signup/anónimo/email providers.
- Redirect URLs y Site URL.
- Users iniciales de Auth.
- Secrets de Edge Functions.
- Password policy/dashboard settings.

## Edge Functions

`admin-users` no forma parte del baseline DB, pero depende de:

- Foundation: `profiles`, `memberships`, helpers de rol y auditoría.
- Académico: padrones, asignaciones, inscripciones, notas, asistencia.
- RPC existentes: `upsert_subject_enrollment_from_portal`, `teacher_remove_student_subject_records`, `teacher_reset_student_subject_academic_records`.
- RPC local pendiente de validación DB: `upsert_exam_enrollment_from_portal`.

No desplegar `admin-users` a staging hasta instalar y validar sus dependencias DB.

## Reproducibilidad — HISTÓRICA / SUPERADA

Estado: `LOCAL BASELINE EXECUTION PENDING`.

No se inició ni reseteó Supabase local. Antes de probar localmente hay que verificar si existe una instancia con trabajo del usuario y acordar un entorno descartable.

## Bloqueos

Registro histórico: las entradas de validación DB pendiente quedaron SUPERADAS en el alcance acreditado por los resultados anteriores. No se declara por ello implementadas las 10 RPC incompletas ni cerrado todo requisito de mínimo privilegio para Production. La mención de RPC pendiente y la precondición de deploy en «Edge Functions» corresponden también al estado previo a esas validaciones.

| Severidad | Bloqueo | Evidencia | Acción necesaria |
| --- | --- | --- | --- |
| P2 | `upsert_exam_enrollment_from_portal` pendiente de validación DB | Implementación local en `supabase/schema/08_exam_tables.sql` | Validar contrato, RLS, idempotencia y concurrencia en PostgreSQL local descartable. |
| P2 | `get_academic_transition_config` pendiente de validación DB | Implementada localmente en `supabase/schema/01_foundation.sql`; contrato en `docs/contracts/get_academic_transition_config.md`; tests estáticos en `src/services/supabaseFunctionSecurityMatrix.test.js` | Ejecutar y validar en Supabase local/staging descartable antes de afirmar compatibilidad DB. |
| P2 | Schema canónico de mesas y ausencias pendiente de validación DB | Implementado localmente en `supabase/schema/08_exam_tables.sql`; contratos en `docs/contracts/exam_tables_canonical_model.md` y `docs/contracts/exam_absence_penalties.md`; tests estáticos en `src/services/examTablesCanonicalSchema.test.js` y `src/services/examAbsencePenaltiesSchema.test.js` | Validar en PostgreSQL local descartable antes de afirmar compatibilidad DB. |
| P2 | 10 RPC feature incompleta sin backend canónico | Consumidores en servicios internos/previews y scripts locales | Mantener inaccesibles o implementar en etapa futura. |
| P2 | RLS mínimo privilegio pendiente | Policies tenant-read por membresía en varios bloques | Ejecutar matriz negativa A/B antes de production. |

## Remote

REMOTE MUTATIONS: NONE.
