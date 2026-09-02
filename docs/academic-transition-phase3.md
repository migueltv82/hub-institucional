# FASE 3 - Refactor Edge Function con dual-write controlado

Esta fase agrega escritura relacional real para el portal del alumno sin romper el sistema actual.

## Archivos modificados

### SQL nuevo

`supabase/setup_multi_tenant/03_academic_portal_rpc.sql`

Contiene RPCs atomicas para que la Edge Function escriba en tablas relacionales:

- `public.upsert_subject_enrollment_from_portal(...)`
- `public.upsert_exam_enrollment_from_portal(...)`

Las RPCs:

- validan que el actor sea alumno activo;
- validan que el alumno pertenezca a la institucion;
- bloquean por alumno/materia o alumno/mesa con `pg_advisory_xact_lock`;
- actualizan o insertan de forma idempotente;
- son ejecutables solo por `service_role`, no por `anon` ni `authenticated`;
- no escriben `workspace_snapshots`.

### Edge Function modificada

`supabase/functions/admin-users/index.ts`

Funcion modificada:

- `handleStudentPortalMutation`

Helpers agregados:

- `getAcademicTransitionConfig`
- `shouldDualWriteAcademics`
- `writeSubjectEnrollmentRelational`
- `writeExamEnrollmentRelational`
- `writeStudentPortalRelational`
- `recordStudentPortalDualWriteWarning`

## Comportamiento por etapa

### `snapshot_only`

Estado seguro por defecto.

- Escribe solo `workspace_snapshots.payload`.
- No llama tablas relacionales.
- Compatibilidad total con el sistema actual.

### `dual_write`

Despues de activar el flag:

- primero escribe `workspace_snapshots.payload`;
- luego llama RPC relacional;
- si falla relacional y `strict_drift_block_enabled = false`, no rompe la operacion del alumno;
- registra advertencia en `admin_audit_logs`;
- devuelve `warnings` y `sources.relational_error`.

### `strict_drift_block_enabled`

No activar en pruebas iniciales.

Si se activa y falla la escritura relacional, la Edge Function responde error aunque el snapshot ya haya sido actualizado. Este modo es para etapa avanzada, cuando la lectura relacional ya sea primaria.

## Orden de despliegue

### 1. Ejecutar SQL RPC

En Supabase SQL Editor:

```sql
-- pegar y ejecutar completo:
-- supabase/setup_multi_tenant/03_academic_portal_rpc.sql
```

Validar:

```sql
select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'upsert_subject_enrollment_from_portal',
    'upsert_exam_enrollment_from_portal',
    'assert_portal_student_actor'
  )
order by routine_name;
```

Validar grants:

```sql
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'upsert_subject_enrollment_from_portal',
    'upsert_exam_enrollment_from_portal'
  )
order by routine_name, grantee;
```

Debe aparecer `service_role` con `EXECUTE`. No debe aparecer `anon`.

### 2. Desplegar Edge Function

Desde la raiz del proyecto:

```powershell
npx.cmd supabase functions deploy admin-users --project-ref TU_PROJECT_REF --no-verify-jwt
```

### 3. Confirmar que sigue en `snapshot_only`

```sql
select *
from public.get_academic_transition_config();
```

Debe seguir:

- `stage = snapshot_only`
- `dual_write_enabled = false`

Probar una inscripcion de alumno. Debe comportarse igual que antes.

### 4. Activar dual-write

Solo despues de probar Edge Function desplegada:

```sql
update public.app_settings
set value = value || jsonb_build_object(
  'stage', 'dual_write',
  'write_mode', 'dual_write',
  'read_mode', 'snapshot_only',
  'dual_write_enabled', true,
  'hybrid_read_enabled', false,
  'relational_primary_enabled', false,
  'snapshot_fallback_enabled', true,
  'snapshot_write_compat_enabled', true,
  'strict_drift_block_enabled', false,
  'updated_by', 'manual enable dual_write after phase3 deploy'
),
updated_at = timezone('utc', now())
where key = 'academic_relational_transition';
```

### 5. Validar dual-write

Hacer con un alumno real:

1. Inscribirse a una materia.
2. Cancelar/bajar esa materia.
3. Inscribirse a una mesa.
4. Cancelar esa mesa.

Luego validar:

```sql
select *
from public.academic_transition_health(null, 'main')
order by checked_at desc;
```

Validar filas recientes:

```sql
select
  institution_id,
  student_id,
  subject_id,
  program_id,
  status,
  legacy_snapshot_id,
  lock_version,
  created_at,
  updated_at
from public.subject_enrollments
order by updated_at desc
limit 20;

select
  institution_id,
  student_id,
  exam_table_id,
  subject_id,
  status,
  legacy_snapshot_id,
  lock_version,
  created_at,
  updated_at
from public.exam_enrollments
order by updated_at desc
limit 20;
```

Validar advertencias:

```sql
select
  created_at,
  actor_email,
  action,
  status,
  error_message,
  metadata
from public.admin_audit_logs
where action = 'student_portal_dual_write_warning'
order by created_at desc
limit 20;
```

## Rollback

Rollback inmediato sin redeploy:

```sql
update public.app_settings
set value = value || jsonb_build_object(
  'stage', 'snapshot_only',
  'write_mode', 'snapshot_only',
  'read_mode', 'snapshot_only',
  'dual_write_enabled', false,
  'hybrid_read_enabled', false,
  'relational_primary_enabled', false,
  'snapshot_fallback_enabled', true,
  'snapshot_write_compat_enabled', true,
  'strict_drift_block_enabled', false,
  'updated_by', 'manual rollback after phase3'
),
updated_at = timezone('utc', now())
where key = 'academic_relational_transition';
```

La Edge Function vuelve a escribir solo snapshot.

## Dependencias para FASE 4

Antes de endurecer seguridad global de snapshots/storage:

- confirmar que `dual_write` no genera advertencias;
- confirmar que `academic_transition_health()` no muestra drift no explicado;
- confirmar que alumnos no pueden ver datos de otros alumnos por tablas nuevas;
- confirmar que docentes solo acceden a materias/mesas asignadas.

## FASE 4 aplicada al portal alumno

SQL agregado:

`supabase/setup_multi_tenant/04_student_portal_secure_read.sql`

Frontend agregado/modificado:

- `src/modules/alumnos/services/studentPortalSecureReadModel.js`
- `src/modules/alumnos/services/studentPortalData.js`

La app ahora usa `public.get_student_portal_workspace_snapshot(...)` cuando el usuario remoto es alumno y no es Super Admin.

Esa RPC:

- valida `auth.uid()`;
- exige `profiles.account_role = 'alumno'`;
- exige que el alumno tenga membership en una institucion activa;
- devuelve un payload compatible con el snapshot actual;
- filtra `alumnos`, `students`, `enrollments`, `examEnrollments`, `grades`, `estadoAcademico` y `academicStatusRows` al alumno autenticado;
- oculta `docentes` y `uploadedFiles`;
- filtra catalogos operativos por carrera del alumno cuando existe padron normalizado.

Validacion manual en navegador:

1. Iniciar sesion como alumno real.
2. Abrir DevTools > Network.
3. Entrar al portal alumno.
4. Confirmar que aparece la llamada RPC `get_student_portal_workspace_snapshot`.
5. Confirmar que no aparecen llamadas REST directas a `workspace_snapshots` ni `student_records` desde el portal alumno.
