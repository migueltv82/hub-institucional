# Auditoría de drift Supabase — Etapa 02.5

## Delimitación histórica y evidencia posterior

El discovery de **2026-09-25**, entorno **Hub-Institucional** (remoto original, no Staging), fue estrictamente read-only. Todos sus inventarios, hallazgos y dictámenes siguientes son **HISTÓRICOS** de esa fecha/entorno. No acreditan el estado actual de Production ni deben extrapolarse a Staging. No se infiere remediación productiva: Production sigue **NO-GO**, sin autorización de mutaciones.

Evidencia posterior separada para **Hub-Institucional-Staging**: [baseline aplicado/verificado](../supabase/baseline/STAGING_BASELINE_RESULT.md), [Security 1](../supabase/baseline/STAGING_SECURITY_1_RESULT.md) y [Security 2 con sus límites y estado posterior](../supabase/baseline/STAGING_SECURITY_2_RESULT.md). Baseline local descartable PASS, 9 SQL canónicos aplicados y 40 tablas public con RLS; Staging inicializado/verificado y Portal Docente v1 read-only certificado. Las menciones de hardening no aplicado, schema/RPC necesarias ausentes o Staging pendiente son **SUPERADAS solo en ese alcance**; las features incompletas y el estado de Production no se dan por resueltos.

Frontend aún no desplegado; Vercel READY técnico. Siguen pendientes candidato Git reproducible, proyecto/origin web Staging, CORS real, backup/restore, rollback, observabilidad, E2E/UAT y release closure; branch protection remota no verificada/configurada. Este documento conserva evidencias, no autoriza ejecutar SQL/deploy ni aporta una consulta remota nueva.

Fecha: 2026-09-25. Alcance: discovery/read-only para comparar el repositorio local `migueltv82/hub-institucional` contra el proyecto Supabase remoto `Hub-Institucional`. No se aplicó SQL, no se ejecutaron migraciones, no se modificó Auth, Storage, RLS, datos ni Edge Functions.

## Resultado histórico — 2026-09-25, Hub-Institucional

**ETAPA 02.5 BLOQUEADA — DRIFT DE SEGURIDAD**

El bloqueo de acceso quedó resuelto: la Supabase CLI autenticada puede listar el proyecto `Hub-Institucional`, el ref accesible coincide con el link local (`qwrw…mibx`) y el acceso al proyecto vinculado dejó de devolver `403`.

La auditoría remota se ejecutó exclusivamente con consultas de catálogo envueltas en:

```sql
begin;
set transaction read only;
-- SELECTs de catálogo / metadata
rollback;
```

No se copiaron definiciones completas de funciones al repo, no se extrajeron datos personales y no se ejecutó ningún RPC de negocio.

## Entorno remoto

| Campo | Estado |
| --- | --- |
| Proyecto Supabase objetivo | `Hub-Institucional` |
| Estado del proyecto | `ACTIVE_HEALTHY` |
| Project ref | Coincide con el link local (`qwrw…mibx`) |
| Tipo de ambiente | No identificado como staging aislado; tratar como ambiente compartido/no apto para mutaciones automáticas. |
| Acceso read-only verificado | Sí. |
| Consulta inocua inicial | `current_database()` / `current_user` ejecutada antes del discovery. |
| Resultado inocuo | `postgres` / `postgres`. |
| Mutaciones remotas | **NINGUNA**. |

## Comparación local vs remoto

| Clasificación | Conteo | Evidencia |
| --- | ---: | --- |
| Funciones remotas inventariadas | 37 | `pg_proc`, `pg_namespace`, `pg_get_functiondef`, `proconfig`, `proacl`. |
| Funciones `SECURITY DEFINER` remotas | 30 | Inventario de funciones remoto. |
| Funciones locales únicas versionadas | 41 | `supabase/**/*.sql`; incluye 37 funciones persistentes `public.*` y 4 helpers temporales `pg_temp.verify_*` de verificadores. |
| MATCH por nombre de función SQL persistente | 37 | Las 37 funciones persistentes `public.*` versionadas localmente aparecen en remoto. |
| SOLO LOCAL por diseño | 4 | Helpers temporales `pg_temp.verify_*`; no deben persistir en remoto. |
| RPC llamadas por la app/Edge sin definición local ni remota | 12 | Contratos usados por código/docs, ausentes en `pg_proc`. |
| Policies remotas inventariadas | 96 | `pg_policies`. |
| Tablas inventariadas para RLS | 42 | `pg_class` / `pg_namespace`. |
| Buckets de Storage inventariados | 1 | `storage.buckets`; sin listar objetos. |

La referencia local sigue siendo [SECURITY_FUNCTION_MATRIX.md](SECURITY_FUNCTION_MATRIX.md). La diferencia crítica de 02.5 no es un “remote ahead”: las 12 RPC investigadas están llamadas por el producto, pero **no existen en remoto** y tampoco tienen definición SQL local auditable.

## 12 RPC faltantes

| RPC | Estado remoto | Clasificación | Riesgo |
| --- | --- | --- | --- |
| `academic_admin_create_student_career_enrollment` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: contrato admin de carrera invocado/documentado sin implementación remota. |
| `academic_admin_correct_student_career_enrollment` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: corrección administrativa sensible sin backend remoto. |
| `academic_admin_get_student_career_enrollment_history` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: historial académico no disponible por RPC remota. |
| `academic_admin_get_teacher_profile_link_candidates` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: preview de identidad docente no disponible. |
| `academic_admin_invalidate_student_career_enrollment` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: invalidación administrativa sin contrato remoto. |
| `academic_admin_link_teacher_record_profile` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: vinculación perfil-legajo docente sin contrato remoto. |
| `academic_enroll_first_year_student` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: inscripción transaccional nueva sin backend remoto. |
| `academic_enroll_student_in_course_offering` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: inscripción a cursada sin backend remoto. |
| `academic_get_student_course_enrollment_preview` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: preview de inscripción de alumno no disponible. |
| `academic_get_teacher_course_roster_preview` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: preview de roster docente no disponible. |
| `get_academic_transition_config` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2: configuración de transición llamada por frontend, ausente remotamente. |
| `upsert_exam_enrollment_from_portal` | AUSENTE | LOCAL CALLER / REMOTE ABSENT | P2/P1 funcional: la fuente autoritativa esperada para inscripción a mesas no existe en remoto. |

## `handle_new_user` remoto

| Campo | Estado 02.5 |
| --- | --- |
| Existe remoto | Sí |
| SECURITY | `SECURITY DEFINER` |
| search_path | `public, pg_temp` |
| Lee `raw_user_meta_data ->> 'account_role'` | **Sí** |
| Lee `raw_app_meta_data ->> 'account_role'` | No |
| Menciona `is_global_admin` | Sí |
| Trigger asociado | `auth.users` / `on_auth_user_created` / `AFTER INSERT` / `EXECUTE FUNCTION handle_new_user()` |
| Vulnerabilidad 02.3 activa remotamente | **Sí** |

El SQL 02.3 local sigue **PREPARADO — NO APLICADO**. La evidencia remota confirma que el proyecto conserva el patrón vulnerable: el rol inicial del perfil puede derivarse de metadata editable por cliente si un flujo de alta llegara a permitirlo.

## EXECUTE

| Rol | Funciones con `EXECUTE` remoto |
| --- | ---: |
| `PUBLIC` | 0 |
| `anon` | 30 |
| `authenticated` | 30 |
| `postgres` | 30 |
| `service_role` | 30 |

No se detectó `PUBLIC EXECUTE`, pero sí `EXECUTE` para `anon` y `authenticated` sobre 30 funciones, incluyendo funciones administrativas o sensibles como `delete_institution_user`, `remove_user_membership`, `set_user_access_status`, `update_membership_role`, `handle_new_user` y varias RPC académicas.

Algunas funciones verificadas contienen defensas internas de superadmin, membresía o `auth.uid()`. Aun así, por mejores prácticas, la superficie directa `anon/authenticated` debe reconciliarse con la matriz local antes de cualquier promoción, especialmente en funciones `SECURITY DEFINER`.

## RLS

| Métrica | Estado |
| --- | ---: |
| Tablas inventariadas | 42 |
| Tablas públicas inventariadas con RLS deshabilitado | 0 |
| Policies remotas | 96 |
| Policies restrictivas | 0 |

Se inventariaron policies para `profiles`, `memberships`, `institutions`, `student_records`, `teacher_records`, tablas académicas, mesas/exámenes, `workspace_*` y `storage.objects`. No se ejecutaron pruebas negativas de acceso por rol/tenant; por lo tanto, RLS queda **inventariada, no validada funcionalmente**.

## Storage

| Campo | Estado |
| --- | --- |
| Bucket remoto | `workspace-source-files` |
| Público | `false` |
| Límite de tamaño | No configurado |
| MIME permitidos | No configurado |
| Objetos listados/descargados | No |

Storage está presente y el bucket esperado es privado. La auditoría no listó objetos, no descargó archivos y no extrajo datos personales.

## Auth

La verificación se limitó a catálogo del trigger sobre `auth.users`. No se modificó Auth, no se crearon usuarios y no se consultaron secretos/configuración sensible del dashboard.

## Drift clasificado

| Severidad | Objeto | Hallazgo | Estado |
| --- | --- | --- | --- |
| P1 | `public.handle_new_user()` | Vulnerabilidad 02.3 activa remotamente: lee `raw_user_meta_data.account_role`. | Bloqueante para producción; aplicar primero en staging aislado. |
| P2 | 12 RPC llamadas por el producto | Ausentes en remoto y sin definición SQL local auditable. | Bloqueante funcional/contrato; no reparar automáticamente. |
| P2 | `anon`/`authenticated EXECUTE` en 30 funciones | Superficie amplia sobre funciones `SECURITY DEFINER`; algunas defensas internas existen, pero debe revisarse función por función. | Requiere reconciliación y pruebas negativas. |
| P2 | RLS | RLS aparece habilitada en tablas inventariadas y hay 96 policies, pero no hay pruebas negativas por rol/tenant ejecutadas en 02.5. | Requiere staging con fixtures sintéticos. |
| P3 | Storage | Bucket privado presente, sin límite de tamaño/MIME. | Revisar antes de operación pública. |

## Datos personales

**NO SE EXTRAJERON DATOS PERSONALES.** La auditoría consultó catálogo, definiciones y metadata técnica; no leyó tablas de negocio ni objetos de Storage.

## Mutaciones remotas

**NINGUNA.**

No hubo `db push`, migrations, DDL, DML, deploy de Edge Functions, cambios de Auth, RLS, Storage, usuarios, datos ni secrets.

## SQL 02.3

**PREPARADO — NO APLICADO.**

No se ejecutó el hardening. La evidencia remota confirma que debe aplicarse primero en staging aislado, con usuarios sintéticos y pruebas de metadata manipulada, antes de considerar cualquier ambiente productivo.

## Staging

**STAGING AISLADO REQUERIDO ANTES DE MUTACIONES.**

El proyecto remoto accesible no debe tratarse como staging seguro salvo decisión explícita y evidencia de aislamiento. Cualquier corrección futura debe hacerse en un ambiente separado o con una ventana controlada, respaldo recuperable y matriz negativa.

## GO / NO-GO

**NO-GO — DRIFT DE SEGURIDAD PENDIENTE.**

## Veredicto

**ETAPA 02.5 BLOQUEADA — DRIFT DE SEGURIDAD.**
