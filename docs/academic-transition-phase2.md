# FASE 2 - Transicion controlada a tablas academicas relacionales

Este documento define el despliegue seguro desde `workspace_snapshots.payload` hacia tablas relacionales academicas sin romper compatibilidad.

## Estado actual verificado en codigo

Escritura actual:

- Archivo: `supabase/functions/admin-users/index.ts`
- Funcion: `handleStudentPortalMutation`
- Comportamiento actual: lee `workspace_snapshots`, modifica arrays `payload.enrollments` y `payload.examEnrollments`, y vuelve a guardar el snapshot completo.
- Riesgo actual: dos alumnos pueden escribir sobre el mismo snapshot casi al mismo tiempo y pisar cambios si las escrituras se cruzan.

Lectura actual:

- Archivo: `src/modules/alumnos/services/studentPortalData.js`
- Funcion: `fetchStudentPortalData`
- Comportamiento actual: lee `workspace_snapshots` y `student_records`, luego `mapWorkspaceSnapshotToStudentStore` arma `enrollments`, `examEnrollments` y `grades` desde JSON.

Mutacion frontend actual:

- Archivo: `src/modules/alumnos/services/studentPortalMutations.js`
- Funcion: `mutateStudentPortal`
- Comportamiento actual: invoca la Edge Function `admin-users` con `action: 'student_portal_mutation'`.

## Principio de transicion

La transicion se hace en cuatro estados:

1. `snapshot_only`
2. `dual_write`
3. `hybrid_read`
4. `relational_primary_with_snapshot_fallback`

Nunca se elimina `workspace_snapshots.payload` durante estas fases.

## Script obligatorio de FASE 2

Ejecutar en Supabase SQL Editor:

`supabase/setup_multi_tenant/02_academic_transition_controls.sql`

Este script:

- crea la configuracion privada `app_settings.key = 'academic_relational_transition'`;
- deja el sistema en `snapshot_only`;
- agrega `get_academic_transition_config()`;
- agrega `academic_transition_health()`;
- agrega `academic_transition_preflight()`;
- incluye snippets comentados para cambiar de etapa;
- no borra datos;
- no cambia el comportamiento actual hasta que se despliegue FASE 3.

## Validacion posterior al script

Ejecutar en Supabase SQL Editor:

```sql
select *
from public.get_academic_transition_config();
```

Debe devolver:

- `stage = snapshot_only`
- `write_mode = snapshot_only`
- `read_mode = snapshot_only`
- `dual_write_enabled = false`
- `snapshot_fallback_enabled = true`

Ejecutar:

```sql
select *
from public.academic_transition_preflight();
```

Todas las filas deben devolver `passed = true`.

Para `academic_transition_health()` hay dos opciones.

Opcion A: ejecutarlo desde una sesion real de Super Admin en la app, usando una pantalla o consola que invoque la RPC.

Opcion B: simular JWT de Super Admin en SQL Editor. Primero obtener el `user_id`:

```sql
select user_id, email
from public.profiles
where is_global_admin = true
  and is_blocked = false
order by email
limit 1;
```

Luego reemplazar `PEGAR_USER_ID_SUPERADMIN`:

```sql
begin;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'PEGAR_USER_ID_SUPERADMIN', true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'aud', 'authenticated',
    'role', 'authenticated',
    'sub', 'PEGAR_USER_ID_SUPERADMIN'
  )::text,
  true
);

select *
from public.academic_transition_health(null, 'main');

reset role;
commit;
```

Esta consulta mide drift entre JSON y tablas relacionales. Si FASE 1 hizo backfill correctamente, los conteos deberian estar alineados o la diferencia debe explicarse por datos no migrables.

## Orden correcto de despliegue

### Paso 1 - DB lista, app sin cambios

Ejecutar:

```sql
select *
from public.get_academic_transition_config();
```

Resultado esperado: `snapshot_only`.

La aplicacion sigue funcionando igual que antes.

### Paso 2 - Preparar Edge Function con dual-write apagado

Archivo a modificar en FASE 3:

`supabase/functions/admin-users/index.ts`

Cambios previstos:

- agregar helper `getAcademicTransitionConfig(adminClient)`;
- agregar helper `writeSubjectEnrollmentRelational(adminClient, context, payload, now)`;
- agregar helper `withdrawSubjectEnrollmentRelational(adminClient, context, payload, now)`;
- agregar helper `writeExamEnrollmentRelational(adminClient, context, payload, now)`;
- agregar helper `cancelExamEnrollmentRelational(adminClient, context, payload, now)`;
- mantener el bloque actual de snapshot write intacto;
- si `dual_write_enabled = false`, solo escribir snapshot;
- si `dual_write_enabled = true`, escribir relacional y snapshot;
- devolver en la respuesta `sources: { snapshot: true, relational: true|false }`.

Riesgo:

- Si se escribe relacional primero y falla snapshot, la UI actual no vera el cambio.
- Si se escribe snapshot primero y falla relacional, queda drift.

Decision de FASE 3:

- Mientras `read_mode = snapshot_only`, el snapshot sigue siendo fuente visible.
- En `dual_write`, escribir snapshot primero y luego relacional.
- Si falla relacional, devolver error solo cuando `strict_drift_block_enabled = true`.
- En etapa inicial, registrar error en `academic_audit_logs`/respuesta y mantener compatibilidad.

### Paso 3 - Activar dual-write

Despues de desplegar Edge Function FASE 3 y probar una mutacion en una institucion de prueba, activar:

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
  'updated_by', 'manual enable dual_write'
),
updated_at = timezone('utc', now())
where key = 'academic_relational_transition';
```

Validar:

```sql
select *
from public.academic_transition_health(null, 'main')
order by checked_at desc;
```

### Paso 4 - Lectura hibrida apagada en backend, luego frontend

Archivos a modificar en FASE 3:

- `src/modules/alumnos/services/studentPortalData.js`
- nuevo archivo recomendado: `src/modules/alumnos/services/academicRelationalData.js`

Cambios previstos:

- leer snapshot como hoy;
- leer tablas relacionales solo si `hybrid_read_enabled = true`;
- mapear filas relacionales al formato actual del store;
- si no hay filas relacionales o falla la lectura, usar snapshot si `snapshot_fallback_enabled = true`;
- no cambiar componentes React en esta etapa.

### Paso 5 - Activar lectura hibrida

Despues de desplegar frontend hibrido y validar drift:

```sql
update public.app_settings
set value = value || jsonb_build_object(
  'stage', 'hybrid_read',
  'write_mode', 'dual_write',
  'read_mode', 'hybrid_read',
  'dual_write_enabled', true,
  'hybrid_read_enabled', true,
  'relational_primary_enabled', false,
  'snapshot_fallback_enabled', true,
  'snapshot_write_compat_enabled', true,
  'strict_drift_block_enabled', false,
  'updated_by', 'manual enable hybrid_read'
),
updated_at = timezone('utc', now())
where key = 'academic_relational_transition';
```

Validar con usuarios reales:

- alumno A ve solo sus inscripciones;
- alumno B no ve datos de alumno A;
- docente ve solo materias asignadas;
- admin ve datos de la institucion;
- Super Admin puede auditar todo.

### Paso 6 - Relacional primario con fallback

Activar solo despues de al menos un ciclo real sin drift relevante:

```sql
update public.app_settings
set value = value || jsonb_build_object(
  'stage', 'relational_primary_with_snapshot_fallback',
  'write_mode', 'dual_write',
  'read_mode', 'relational_primary',
  'dual_write_enabled', true,
  'hybrid_read_enabled', true,
  'relational_primary_enabled', true,
  'snapshot_fallback_enabled', true,
  'snapshot_write_compat_enabled', true,
  'strict_drift_block_enabled', true,
  'updated_by', 'manual enable relational primary with fallback'
),
updated_at = timezone('utc', now())
where key = 'academic_relational_transition';
```

## Rollback operativo

Rollback inmediato sin tocar datos:

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
  'updated_by', 'manual rollback to snapshot_only'
),
updated_at = timezone('utc', now())
where key = 'academic_relational_transition';
```

La app vuelve a operar con `workspace_snapshots.payload`.

## Criterios para pasar a FASE 3

- `02_academic_transition_controls.sql` ejecutado sin errores.
- `academic_transition_preflight()` devuelve todo `passed = true`.
- `academic_transition_health()` conocido y revisado.
- Se acepta implementar dual-write en `admin-users/index.ts`.
- Se acepta mantener snapshot como fuente visible hasta validar tablas relacionales.
