# Baseline readiness — Etapa 02.8A

## Estado vigente acreditado

Baseline local descartable PASS: 9 SQL canónicos aplicados y 40 tablas public con RLS. Staging existe, fue inicializado y verificado; ver [validación local](../supabase/baseline/LOCAL_AB_RLS_RPC_RESULT.md) y [baseline Staging](../supabase/baseline/STAGING_BASELINE_RESULT.md). Security acceptance está acreditada solo en su alcance: [Security 1](../supabase/baseline/STAGING_SECURITY_1_RESULT.md) y [Security 2, historia y estado posterior](../supabase/baseline/STAGING_SECURITY_2_RESULT.md). Portal Docente v1 read-only certificado en Staging; esto no acredita escrituras de decisiones docentes.

Las menciones siguientes de baseline parcial, DB pendiente, schema/RPC ausentes y ejecución local pendiente son **HISTÓRICAS / SUPERADAS** dentro del alcance certificado. No convierten features incompletas en implementadas ni acreditan cobertura integral nueva. Se conserva la secuencia original; no reaplicar SQL por esta nota.

Production sigue **NO-GO**. Frontend sin deploy; Vercel READY técnico. Faltan candidato Git reproducible, proyecto/origin web Staging, CORS del dominio real, backup/restore, rollback, observabilidad, E2E/UAT y release closure; branch protection remota no verificada/configurada. No se autoriza ninguna mutación.

Fecha: 2026-09-26. Alcance: investigación local y documental. No hubo despliegue, SQL remoto, `supabase link`, `db push`, migrations, Auth remoto, Storage remoto, usuarios ni service-role.

## Resultado ejecutivo histórico — SUPERADO en el alcance anterior

Todavía **no** podemos reconstruir staging desde Git de punta a punta.

Sí podemos definir una fuente canónica parcial, un orden de instalación futuro y los bloqueos que impiden crear un baseline ejecutable. El baseline no debe tomar production como origen; usa el SQL local versionado más la evidencia remota auditada de 02.5/02.7.

Estado de 02.8A:

```text
BASELINE PARCIAL CON BLOQUEOS
LOCAL BASELINE EXECUTION PENDING
REMOTE MUTATIONS: NONE
```

## ¿Qué SQL es canónico?

Canónicos para el baseline parcial:

1. `supabase/schema/01_foundation.sql`
2. `supabase/schema/02_academic_relational_schema.sql`
3. `supabase/schema/03_workspace_data.sql`
4. `supabase/schema/04_teacher_exam_date_exclusions.sql`
5. `supabase/schema/05_workspace_operational_compat.sql`
6. `supabase/schema/06_subject_teacher_assignments.sql`
7. `supabase/schema/07_academic_operations.sql`
8. `supabase/schema/08_exam_tables.sql`
9. `supabase/schema/05_student_portal_secure_read.sql`

Estos archivos representan el estado inicial deseado para foundation, identidad, core académico, workspace, Storage metadata/policies, portal alumno, asignaciones, operación académica y schema canónico local de mesas de examen con penalidades por ausencia.

## ¿Qué SQL queda legacy?

No entra automáticamente al baseline:

- `repair_*`: todos quedan fuera del baseline ejecutable hasta reconciliación explícita.
- `verify_*`: son validaciones posteriores.
- `supabase/security/remote_readonly_discovery.sql` y diagnósticos: son lectura/auditoría.
- `supabase/security/student_portal_exam_visibility_tests.sql`: prueba focal, no instalación.

Detalle completo en [BASELINE_MANIFEST.md](../supabase/baseline/BASELINE_MANIFEST.md).

## Inventario SQL

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

Total local inventariado: 36 archivos SQL bajo `supabase/`. De ellos, 34 están trackeados por Git; `supabase/security/remote_readonly_discovery.sql` existe localmente como diagnóstico no trackeado todavía y `supabase/schema/08_exam_tables.sql` queda agregado localmente en 02.8C-3 y ampliado localmente en 02.8C-4B.

## Objetos canónicos por tipo

| Tipo | Resumen |
| --- | --- |
| Schemas | `public`, más schemas gestionados por Supabase: `auth`, `storage`. |
| Extensions | `pgcrypto` desde foundation. |
| Tables app | 40 tablas canónicas en `public` si se cuentan los bloques `schema/01` a `schema/08`. |
| Storage | Bucket privado `workspace-source-files` y policies de `storage.objects`; objetos/productivos excluidos. |
| Functions/RPC | Foundation, login público, superadmin, portal alumno, asignación docente, operación académica, helpers y triggers. |
| Triggers | `handle_new_user`, sync UI compat, touch `updated_at`, triggers de Auth/tabla. |
| RLS/policies | Requerido en todas las tablas de app; policies por tenant/rol según bloque. |
| Grants/revokes | Derivados desde consumidores locales; no copiados de production. |

## Orden baseline futuro

Orden definido, todavía no ejecutable en staging:

1. Configuración manual/Auth no versionable mínima.
2. `supabase/schema/01_foundation.sql`
3. `supabase/schema/02_academic_relational_schema.sql`
4. `supabase/schema/03_workspace_data.sql`
5. `supabase/schema/04_teacher_exam_date_exclusions.sql`
6. `supabase/schema/05_workspace_operational_compat.sql`
7. `supabase/schema/06_subject_teacher_assignments.sql`
8. `supabase/schema/07_academic_operations.sql`
9. `supabase/schema/08_exam_tables.sql`, incluida `upsert_exam_enrollment_from_portal`.
10. `supabase/schema/05_student_portal_secure_read.sql`, que lee inscripciones canónicas de 07 y 08.
11. Validaciones `verify_*` y matriz negativa.

## `handle_new_user`

Estado canónico: endurecido localmente en `supabase/schema/01_foundation.sql`.

Requisitos cubiertos:

- No usa `raw_user_meta_data.account_role` como autoridad.
- Usa `raw_app_meta_data.account_role` como metadata administrativa.
- Fallback mínimo: `alumno`.
- `SECURITY DEFINER` con `set search_path = ''`.
- Revokes para `public`, `anon`, `authenticated`.

Cobertura estática existente:

- `src/services/adminUsersEdgeFunctionSecurity.test.js`
- `src/services/supabaseFunctionSecurityMatrix.test.js`

## 10 RPC feature incompleta

| Estado | Cantidad | RPC |
| --- | ---: | --- |
| Seguras/inaccesibles si siguen como preview/interno | 10 | `academic_admin_create_student_career_enrollment`, `academic_admin_correct_student_career_enrollment`, `academic_admin_get_student_career_enrollment_history`, `academic_admin_get_teacher_profile_link_candidates`, `academic_admin_invalidate_student_career_enrollment`, `academic_admin_link_teacher_record_profile`, `academic_enroll_first_year_student`, `academic_enroll_student_in_course_offering`, `academic_get_student_course_enrollment_preview`, `academic_get_teacher_course_roster_preview` |
| Alcanzables por producción/staging si se habilitan flujos internos | 10 potenciales | Todas las anteriores |
| Blockers actuales para baseline inicial | 0 | No se inventan; se mantienen fuera del baseline. |

Condición: si algún flujo deja de ser preview/interno, pasa a blocker funcional antes de staging.

## RPC necesarias

### `get_academic_transition_config`

- Implementación localizada: SÍ.
- Contrato recuperado: SÍ, documentado en `docs/contracts/get_academic_transition_config.md`.
- Implementación local canónica: SÍ, en `supabase/schema/01_foundation.sql`.
- Decisión 02.8B-2: `RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB`; no fue desplegada ni ejecutada.
- Git history/branches locales: revisados; solo hay menciones documentales, caller frontend y lectura server-side de `app_settings`, sin definición `create function` autoritativa.
- Caller: `src/modules/alumnos/services/academicRelationalData.js`.
- Inputs: sin argumentos según caller actual.
- Outputs: configuración mínima de transición académica: `stage`, `write_mode`, `read_mode`, `dual_write_enabled`, `hybrid_read_enabled`, `relational_primary_enabled`, `snapshot_fallback_enabled`, `snapshot_write_compat_enabled`, `strict_drift_block_enabled`.
- Autorización esperada: `EXECUTE` para `authenticated`; no `anon` ni `public`.
- Seguridad implementada: `SECURITY DEFINER`, `set search_path = ''`, `auth.uid()` interno, revokes explícitos a `public/anon/authenticated` y grant posterior a `authenticated`.
- Fuente de datos: `app_settings.key = 'academic_relational_transition'`, global, `is_public = false` según repair/documentación histórica.
- Idempotencia esperada: lectura pura.
- Comportamiento transaccional: no mutante.
- Fail-safe: config ausente/inválida cae a `snapshot_only`; flags relacionales peligrosos solo se activan con booleano JSONB `true`.
- Riesgo residual: no validado todavía contra PostgreSQL real/local; requiere ejecución posterior controlada.
- Estado: `RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB`.

### `upsert_exam_enrollment_from_portal`

- Implementación local canónica: SÍ, en `supabase/schema/08_exam_tables.sql`.
- Contrato recuperado: SÍ, documentado en `docs/contracts/upsert_exam_enrollment_from_portal.md`.
- Modelo canónico de mesas: SÍ, definido en `docs/contracts/exam_tables_canonical_model.md` e implementado localmente en `supabase/schema/08_exam_tables.sql`; pendiente de validación DB.
- Modelo canónico de ausencia/castigo: SÍ, definido en `docs/contracts/exam_absence_penalties.md` e implementado localmente como `public.exam_absence_penalties` en `supabase/schema/08_exam_tables.sql`; pendiente de validación DB.
- Git history/branches locales: revisados; la referencia histórica a “migración 15” no contiene SQL versionado recuperable ni definición `create function`.
- Caller directo: `supabase/functions/admin-users/index.ts`, vía `mutateStudentPortal` del portal alumno.
- Firma esperada: 14 parámetros; `target_student_record_id` es el quinto parámetro.
- Inputs: institución/workspace, actor/alumno, legajo, mesa, materia/carrera, estado, timestamps, id legacy, client mutation id y metadata.
- Outputs: fila/DTO compatible con `exam_enrollments`.
- Autorización esperada: autoridad server-side; alumno solo sobre sí mismo; validación de tenant, legajo, condición académica, correlativas, deuda y ausencia.
- Tablas afectadas: `exam_enrollments`, `student_grades`, `student_records`, `student_financial_status` y `supabase/schema/08_exam_tables.sql`.
- Idempotencia esperada: upsert/cancelación repetible sin duplicar inscripción, con constraint/lock por institución/mesa-materia canónica/legajo.
- Comportamiento transaccional: requerido; debe validar y escribir de forma atómica.
- Riesgo residual: la RPC y el modelo de mesas/ausencia requieren validación dinámica en PostgreSQL local antes de habilitar escritura relacional.
- Estado: `RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB`.

## EXECUTE canónico

Modelo mínimo:

- `public`: sin `EXECUTE` para RPC privadas ni triggers internos.
- `anon`: solo `get_public_app_status` y `list_active_login_institutions` cuando se mantengan públicas.
- `authenticated`: RPC con validación interna de rol/tenant.
- `service_role`: solo funciones server-side necesarias tras validación en Edge Function.
- Trigger-only: `handle_new_user`, `sync_*`, `touch_*` sin ejecución directa desde clientes.

Funciones sensibles:

| Función | Modelo 02.8A |
| --- | --- |
| `handle_new_user` | Trigger-only; no `public`, no `anon`, no `authenticated`. |
| `foundation_require_super_admin` | Interna; no clientes. |
| `foundation_active_institution_admin_count` | Interna; no clientes. |
| `teacher_remove_student_subject_records` | `service_role` solamente. |
| `teacher_reset_student_subject_academic_records` | `service_role` solamente. |

## RLS canónico

- RLS requerido en todas las tablas de app.
- `FORCE RLS`: no requerido por defecto en 02.8A; reevaluar antes de production si aparecen roles DB no-owner o accesos privilegiados.
- SELECT tenant: institución A no ve institución B.
- INSERT/UPDATE/DELETE: owner/admin/editor o superadmin, salvo RPC que imponga reglas más estrictas.
- Alumno/docente: acceso por RPC o policies específicas, no por pertenencia amplia cuando haya datos sensibles.

Bloqueo residual: varias policies actuales permiten lectura por membresía de institución. Sirven para staging inicial, pero no acreditan mínimo privilegio productivo.

## Repairs A/B/C/D/E

| Clase | Cantidad | Significado |
| --- | ---: | --- |
| A | 5 | Corrección ya absorbida por schema canónico. |
| B | 1 | Data repair histórico que staging limpio no necesita. |
| C | 1 | Security hardening trasladado al baseline. |
| D | 3 | Objeto funcional todavía ausente del schema. |
| E | 2 | Obsoleto. |

## Storage

Estado: PARCIAL CANÓNICO.

Versionable:

- Bucket `workspace-source-files` como privado.
- Helper `storage_object_institution_id`.
- Policies de `storage.objects`.
- Tabla `workspace_source_files`.

No versionable / excluido:

- Objetos/archivos.
- Copia de Storage productivo.
- Cualquier fixture con PII.

## Auth

Versionable:

- Trigger/function SQL.
- RLS sobre `profiles`/`memberships`.
- Config local como referencia.

No versionable completamente:

- Usuarios Auth.
- Signup/anónimo/email provider real.
- Redirect URLs/Site URL.
- Secrets.
- Password policies configuradas desde Dashboard/API.

Checklist no versionable:

1. Signup público deshabilitado.
2. Anonymous sign-ins deshabilitado.
3. Redirect URLs staging/local explícitos.
4. Usuario bootstrap creado manualmente antes del seed.
5. No copiar usuarios production.
6. No usar service-role en frontend ni docs.

## Edge Functions

`admin-users` requiere antes de deploy staging:

- `profiles`, `memberships`, `institutions`, `admin_audit_logs`.
- `student_records`, `teacher_records`, asignaciones y operación académica.
- RPC `upsert_subject_enrollment_from_portal`.
- RPC `teacher_remove_student_subject_records` y `teacher_reset_student_subject_academic_records`.
- RPC local `upsert_exam_enrollment_from_portal`, pendiente de validación DB antes de habilitar inscripción/cancelación de mesas.

No incluir Edge Functions dentro del baseline DB.

## ¿El baseline puede reconstruir una base vacía?

Respuesta: PARCIAL.

Puede reconstruir foundation/core/workspace/operación académica local según archivos `schema/`, pero no puede afirmar reconstrucción funcional completa del Hub porque faltan:

- Validación dinámica de la RPC `upsert_exam_enrollment_from_portal`.
- Validación dinámica DB del bloque canónico de mesas de examen.
- Matriz negativa RLS/RPC/Storage ejecutada.
- Prueba local descartable del baseline.

Además, `get_academic_transition_config` y `08_exam_tables.sql` quedaron resueltos localmente, pero todavía requieren validación dinámica en PostgreSQL antes de considerarse probados.

## Pruebas requeridas antes del deploy staging

1. `npm.cmd run check`.
2. `git diff --check`.
3. Tests estáticos de seguridad de funciones/RPC.
4. Prueba local descartable del baseline cuando exista entorno seguro.
5. Verificaciones SQL `verify_*`.
6. Matriz negativa RLS/RPC/Storage con institución A/B.
7. Prueba específica de `handle_new_user` contra metadata manipulada.
8. Prueba de Storage sin objetos productivos.
9. Prueba de Edge Function `admin-users` solo después de DB y secrets staging.

## Bloqueos

| Severidad | Bloqueo | Evidencia | Acción necesaria |
| --- | --- | --- | --- |
| P2 | `upsert_exam_enrollment_from_portal` pendiente de validación DB | Implementación local en `supabase/schema/08_exam_tables.sql`; contrato y test focal estático existentes | Validar `08_exam_tables.sql`, contrato, RLS, idempotencia y concurrencia en PostgreSQL local descartable. |
| P2 | `get_academic_transition_config` pendiente de validación DB | Implementada localmente en `supabase/schema/01_foundation.sql`; contrato en `docs/contracts/get_academic_transition_config.md`; tests estáticos en `supabaseFunctionSecurityMatrix.test.js` | Ejecutar y validar en Supabase local/staging descartable antes de afirmar compatibilidad DB. |
| P2 | Schema canónico de mesas y ausencias pendiente de validación DB | Implementado localmente en `supabase/schema/08_exam_tables.sql`; `repair_06_exam_teacher_assignments.sql` y `repair_06_exam_process_reset_rpc.sql` quedan fuera como legacy/no aplicados | Ejecutar y validar en Supabase local/staging descartable antes de afirmar compatibilidad DB. |
| P2 | Feature incompleta con RPC sin backend | 10 RPC listadas en manifest | Mantener gated/inaccesibles o implementar formalmente. |
| P2 | RLS mínimo privilegio no probado | Sin matriz negativa A/B ejecutada | Crear fixtures sintéticos y ejecutar tests. |
| P2 | Baseline local no ejecutado | No se verificó Supabase local descartable | Preparar entorno local seguro antes de staging. |

## Fuentes oficiales consultadas

- Supabase recomienda ambientes separados y flujo con migrations para local/staging/production: https://supabase.com/docs/guides/deployment/managing-environments
- Supabase documenta schemas declarativos como fuente de verdad editada en Git, no cambios directos en DB: https://supabase.com/docs/guides/local-development/declarative-database-schemas
- Supabase RLS debe definirse por tabla/policy y probarse según roles: https://supabase.com/docs/guides/database/postgres/row-level-security

## Estado

ETAPA 02.8A COMPLETA — BASELINE PARCIAL CON BLOQUEOS
