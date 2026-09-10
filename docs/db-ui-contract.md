# DB UI Contract - Etapa 0

Fecha: 2026-09-08
Estado: borrador operativo para adaptar Supabase a la UI actual.

## Objetivo

Adaptar la base de datos a lo que la UI ya hace hoy, sin romper flujos existentes y sin reescribir pantallas como primera medida. El contrato prioriza que el sitio funcione de punta a punta para administracion, docentes y alumnos, y que despues pueda avanzar hacia un modelo relacional mas fuerte para monetizacion.

Esta etapa no borra datos, no ejecuta SQL en Supabase y no cambia codigo de produccion. Solo define el mapa de trabajo y los criterios de verificacion.

## Principios

- La UI manda en la primera fase: si un servicio espera una tabla, columna o RPC, la base debe responder ese contrato.
- `workspace_snapshots` sigue siendo el puente operativo inicial. Muchos modulos todavia leen de ese JSON aunque ya existan tablas relacionales.
- La transicion debe ser incremental: primero compatibilidad, despues normalizacion relacional.
- Cada bloque SQL debe ser autocontenido e idempotente, siguiendo `supabase/schema/00_README.md`.
- No usar Supabase CLI en este proyecto. Los SQL se preparan en el repo y el usuario los aplica manualmente desde el SQL Editor.
- Nunca exponer ni pedir service role en chat. Las Edge Functions pueden usar secretos configurados en Supabase, no en frontend.
- Cada etapa termina con una prueba chica de UI, no solo con "SQL aplicado".

## Fuentes revisadas

- `supabase/schema/00_README.md`
- `supabase/schema/01_foundation.sql`
- `supabase/schema/02_academic_relational_schema.sql`
- `supabase/schema/03_workspace_data.sql`
- `supabase/schema/04_teacher_exam_date_exclusions.sql`
- `supabase/functions/admin-users/index.ts`
- `src/services/workspaceSnapshot.js`
- `src/services/sourceFiles.js`
- `src/services/rosterRecords.js`
- `src/services/teacherAcademicRecords.js`
- `src/services/subjectTeacherAssignments.js`
- `src/services/subjectEnrollments.js`
- `src/services/studentGrades.js`
- `src/services/subjectAttendance.js`
- `src/services/studentFinancialStatus.js`
- `src/services/examTeacherAssignments.js`
- `src/modules/alumnos/services/*`
- `src/modules/docentes/services/*`
- `src/features/studentCourseEnrollment/*`
- `src/features/teacherCourseRoster/*`
- `src/features/exams/*`

## Estado actual del schema

Ya existen bloques base para:

- Fundacion, login, instituciones, perfiles, membresias, auditoria y settings.
- Catalogo academico relacional: carreras, planes, materias, docentes, horarios, alumnos y trayectorias.
- `workspace_snapshots`.
- Exclusiones puntuales de fechas de examen por docente.

Brechas principales:

- `student_records` y `teacher_records` existen, pero su shape actual no cubre todos los campos que la UI usa.
- La UI espera `subject_teacher_assignments`; el schema relacional actual usa `teacher_subject_assignments`.
- La UI/Edge Function espera `student_career_enrollments`; el schema actual tiene `student_career_plans`.
- Faltan tablas operativas: archivos fuente, inscripciones, notas, asistencia, deuda, examenes y confirmaciones docentes.
- Faltan RPCs de administracion, portal alumno, libro docente y proceso de mesas.
- La persistencia relacional del cronograma generado todavia no existe.

## Superficies de UI que deben seguir funcionando

1. Login y seleccion de institucion.
2. Superadmin: crear instituciones, admins, usuarios, bloqueo y membresias.
3. Admin institucional: carga de planillas, autosave, descarga de fuentes, limpieza de workspace.
4. Admin institucional: padron de alumnos y docentes.
5. Admin institucional: asignacion de docentes a materias.
6. Admin institucional: inscripciones a materias, deuda, notas y resets academicos.
7. Generador de cronograma y flujo de precronograma/final.
8. Portal docente: materias, alumnos, asistencia, notas, confirmacion/objecion de mesas.
9. Portal alumno: materias, estado academico, inscripcion a cursada, notas, mesas e inscripcion a examen.
10. Previews internos de inscripcion a cursada y roster docente.

## Contrato de tablas

### Base institucional

Tablas requeridas:

- `institutions`
- `profiles`
- `memberships`
- `admin_audit_logs`
- `app_settings`

RPCs requeridas por UI:

- `get_public_app_status`
- `list_active_login_institutions`
- `update_membership_role`
- `remove_user_membership`
- `set_user_access_status`
- `delete_institution_user`

Definicion de listo:

- Login funciona para superadmin, admin, docente y alumno.
- Superadmin puede crear/ver institucion y usuarios.
- Bloquear/desbloquear usuario afecta el acceso real.
- RLS impide ver instituciones ajenas.

### Workspace operativo

Tablas requeridas:

- `workspace_snapshots`
- `workspace_source_files`

`workspace_snapshots` debe conservar:

- `institution_id`
- `workspace_key`
- `owner_user_id`
- `owner_email`
- `payload`
- `updated_at`

`workspace_source_files` debe soportar:

- `institution_id`
- `workspace_key`
- `dataset_key`
- `file_name`
- `mime_type`
- `file_extension`
- `file_size`
- `storage_bucket`
- `storage_path`
- `file_base64`
- `updated_at`

Storage requerido:

- Bucket `workspace-source-files`
- Policies de lectura/escritura por membresia institucional.

Definicion de listo:

- Admin carga planillas.
- Autosave guarda snapshot remoto.
- Archivos fuente se suben y descargan.
- Borrar workspace limpia datos operativos esperados sin borrar institucion ni usuarios.

### Padrones compatibles con UI

Tablas requeridas:

- `student_records`
- `teacher_records`

`student_records` debe soportar al menos:

- `id`
- `institution_id`
- `workspace_key`
- `profile_id`
- `email`
- `full_name`
- `first_name`
- `last_name`
- `career`
- `academic_year`
- `dni`
- `legajo`
- `phone`
- `status`
- `raw_payload`
- `created_at`
- `updated_at`

Clave esperada por upsert:

- `institution_id, workspace_key, email, career`

`teacher_records` debe soportar al menos:

- `id`
- `institution_id`
- `workspace_key`
- `profile_id`
- `login_email`
- `full_name`
- `first_name`
- `last_name`
- `dni`
- `phone`
- `status`
- `raw_payload`
- `created_at`
- `updated_at`

Clave esperada por upsert:

- `institution_id, workspace_key, dni`

Decision de compatibilidad:

- Extender las tablas actuales es mas seguro que crear views escribibles, porque la UI hace `upsert`, `delete`, filtros y ordenamientos directos.
- No eliminar los campos relacionales actuales (`external_code`, `national_id`, etc.). Agregar columnas compatibles y mapear luego.

Definicion de listo:

- Guardar snapshot sincroniza alumnos y docentes.
- Accesos de alumnos/docentes pueden linkear `profile_id`.
- Portal docente y portal alumno resuelven su identidad sin depender solo del snapshot.

### Datos academicos docentes

Tablas requeridas:

- `teacher_availability_records`
- `teacher_workload_records`

`teacher_availability_records` debe soportar:

- `institution_id`
- `workspace_key`
- `teacher_record_id`
- `teacher_identity`
- `teacher_display_name`
- `teacher_name`
- `teacher_dni`
- `day_of_week`
- `shift`
- `start_time`
- `end_time`
- `is_available`
- `reason`
- `status`
- `valid_from`
- `valid_until`
- `source`
- `raw_payload`

Clave esperada por upsert:

- `institution_id, workspace_key, teacher_identity, day_of_week, shift, start_time, end_time, valid_from, valid_until`

`teacher_workload_records` debe soportar:

- `institution_id`
- `workspace_key`
- `teacher_record_id`
- `teacher_identity`
- `teacher_display_name`
- `teacher_name`
- `teacher_dni`
- `program_id`
- `career_name`
- `plan_id`
- `subject_id`
- `subject_name`
- `academic_year`
- `role`
- `titularity`
- `teaching_hours`
- `status`
- `valid_from`
- `valid_until`
- `source`
- `raw_payload`

Clave esperada por upsert:

- `institution_id, workspace_key, teacher_identity, program_id, plan_id, subject_id, valid_from, valid_until`

Definicion de listo:

- La carga de disponibilidad y carga horaria deja registros remotos.
- El motor puede seguir leyendo desde snapshot mientras se valida la capa relacional.

### Asignaciones docente-materia

Tabla requerida por UI:

- `subject_teacher_assignments`

Columnas requeridas:

- `id`
- `institution_id`
- `workspace_key`
- `subject_id`
- `program_id`
- `teacher_id`
- `teacher_record_id`
- `source`
- `status`
- `deleted_at`
- `role`
- `metadata`
- `created_at`
- `updated_at`

Roles esperados:

- `titular`
- `suplente`
- `licencia`

RPCs requeridas:

- `academic_resolve_member_profile_by_email`
- `academic_create_teacher_subject_leave`
- `academic_update_teacher_assignment_condition`

Decision pendiente:

- Mantener `subject_teacher_assignments` como tabla de compatibilidad para la UI.
- Definir si se sincroniza con `teacher_subject_assignments` o si esta ultima queda para el motor relacional puro.

Definicion de listo:

- Admin asigna docente titular/suplente/licencia.
- Portal docente ve sus materias.
- No se duplican asignaciones activas.

### Inscripciones a materias

Tabla requerida:

- `subject_enrollments`

Columnas requeridas:

- `id`
- `institution_id`
- `workspace_key`
- `subject_id`
- `program_id`
- `student_id`
- `student_record_id`
- `status`
- `enrolled_at`
- `dropped_at`
- `deleted_at`
- `legacy_snapshot_id`
- `lock_version`
- `created_at`
- `updated_at`

RPC requerida por portal alumno:

- `upsert_subject_enrollment_from_portal`

Parametros usados por Edge Function:

- `target_institution_id`
- `target_workspace_key`
- `actor_user_id`
- `target_student_id`
- `target_subject_id`
- `target_program_id`
- `target_student_record_id`
- `target_status`
- `target_enrolled_at`
- `target_dropped_at`
- `target_legacy_snapshot_id`
- `target_client_mutation_id`
- `target_metadata`

Definicion de listo:

- Admin inscribe y da de baja alumnos.
- Alumno inscribe/retira materia desde portal.
- La lectura hibrida no revive inscripciones viejas del snapshot cuando la tabla ya cargo vacia.

### Notas y asistencia

Tablas requeridas:

- `student_grades`
- `subject_class_sessions`
- `subject_attendance_records`

`student_grades` debe soportar:

- `id`
- `institution_id`
- `workspace_key`
- `student_id`
- `student_record_id`
- `subject_enrollment_id`
- `exam_enrollment_id`
- `subject_id`
- `program_id`
- `teacher_id`
- `teacher_record_id`
- `grade_type`
- `grade_value`
- `grade_label`
- `grade_scale`
- `academic_status`
- `observations`
- `grading_period`
- `attempt_number`
- `legacy_snapshot_id`
- `lock_version`
- `deleted_at`
- `created_at`
- `updated_at`

RPC requerida:

- `academic_teacher_upsert_student_grade`

Errores funcionales esperados:

- `ACADEMIC_LOCK_VERSION_CONFLICT`
- `STUDENT_SUBJECT_ENROLLMENT_NOT_FOUND`
- `ACADEMIC_COMMAND_FORBIDDEN`
- `GRADE_VALUE_OUT_OF_RANGE`

`subject_class_sessions` debe soportar:

- `id`
- `institution_id`
- `workspace_key`
- `subject_id`
- `program_id`
- `teacher_id`
- `session_date`
- `topic`
- `notes`
- `created_at`
- `updated_at`

`subject_attendance_records` debe soportar:

- `id`
- `institution_id`
- `workspace_key`
- `session_id`
- `student_id`
- `subject_enrollment_id`
- `status`
- `observations`
- `created_at`
- `updated_at`

RPCs requeridas:

- `academic_teacher_create_class_session`
- `academic_teacher_upsert_attendance_records`

Definicion de listo:

- Docente crea clase.
- Docente toma asistencia.
- Docente carga nota.
- Alumno ve nota y estado academico.

### Estado financiero alumno

Tabla requerida:

- `student_financial_status`

Columnas requeridas:

- `id`
- `institution_id`
- `workspace_key`
- `student_record_id`
- `adeuda_cuota`
- `note`
- `updated_at`

Clave esperada por upsert:

- `institution_id, workspace_key, student_record_id`

Definicion de listo:

- Admin marca deuda por alumno.
- Estado persiste por workspace.
- La deuda no se mezcla entre instituciones.

### Mesas, precronograma e inscripcion a examen

Tablas requeridas por UI actual:

- `exam_teacher_assignments`
- `exam_enrollments`
- `legacy_exam_sessions`

`exam_teacher_assignments` debe soportar:

- `id`
- `institution_id`
- `workspace_key`
- `exam_table_id`
- `teacher_id`
- `source`
- `status`
- `role`
- `confirmation_status`
- `teacher_notes`
- `confirmed_at`
- `requested_exam_table_id`
- `requested_role`
- `requested_date`
- `reassignment_status`
- `deleted_at`
- `deleted_by`
- `metadata`
- `created_at`
- `updated_at`

Clave esperada por upsert:

- `institution_id, workspace_key, exam_table_id, teacher_id`

RPCs requeridas:

- `academic_teacher_confirm_exam_assignment`
- `academic_teacher_object_exam_assignment`
- `academic_admin_reset_exam_process`

`exam_enrollments` debe soportar:

- `id`
- `institution_id`
- `workspace_key`
- `student_id`
- `student_record_id`
- `exam_table_id`
- `subject_id`
- `program_id`
- `status`
- `enrolled_at`
- `cancelled_at`
- `deleted_at`
- `legacy_snapshot_id`
- `lock_version`
- `created_at`
- `updated_at`

RPC requerida por portal alumno:

- `upsert_exam_enrollment_from_portal`

Parametros usados por Edge Function:

- `target_institution_id`
- `target_workspace_key`
- `actor_user_id`
- `target_student_id`
- `target_student_record_id`
- `target_exam_table_id`
- `target_subject_id`
- `target_program_id`
- `target_status`
- `target_enrolled_at`
- `target_cancelled_at`
- `target_legacy_snapshot_id`
- `target_client_mutation_id`
- `target_metadata`

Definicion de listo:

- Admin publica precronograma.
- Docente confirma u objeta desde portal.
- Admin lee confirmaciones reales.
- Admin resetea el proceso de mesas.
- Alumno se inscribe a una mesa si cumple reglas.

### Lectura segura de portales

RPCs requeridas:

- `get_student_portal_workspace_snapshot`
- `academic_get_student_subject_teacher_notices`
- `academic_get_teacher_subject_rosters`
- `get_academic_transition_config`

Definicion de listo:

- Alumno no puede leer snapshots de otra institucion.
- Docente no ve rosters de materias ajenas.
- Configuracion puede permanecer en `snapshot_only` hasta que las tablas relacionales esten completas.

### Capa relacional avanzada de cursada

Tablas/RPCs necesarias para previews internos y futuro modelo monetizable:

- `academic_years`
- `academic_terms`
- `student_career_enrollments`
- `course_offerings`
- `teaching_assignments`
- `course_enrollments`
- `academic_command_requests`
- `academic_audit_events`

RPCs requeridas:

- `academic_admin_create_student_career_enrollment`
- `academic_admin_correct_student_career_enrollment`
- `academic_admin_invalidate_student_career_enrollment`
- `academic_admin_get_student_career_enrollment_history`
- `academic_enroll_first_year_student`
- `academic_enroll_student_in_course_offering`
- `academic_get_student_course_enrollment_preview`
- `academic_get_teacher_course_roster_preview`
- `academic_admin_get_teacher_profile_link_candidates`
- `academic_admin_link_teacher_record_profile`

Decision pendiente:

- Reconciliar `student_career_plans` con `student_career_enrollments`.
- Definir si se migra nombre/tabla o si se crea una capa compat inicial.

Definicion de listo:

- Preview de inscripcion a cursada devuelve reglas, ofertas, correlativas y rechazos esperados.
- Preview de roster docente devuelve asignaciones, horarios y alumnos.
- Los comandos son idempotentes por `request_id`.

## RPC checklist

Estado:

- `prepared_local`: existe en `supabase/schema/` y esta listo para aplicar.
- `reported_applied`: el usuario informo que lo ejecuto en Supabase.
- `verified_remote`: fue aplicado en Supabase y probado con la UI.

Prioridad P0, necesarios para login/admin base:

- [x] `get_public_app_status` - verified_remote
- [x] `list_active_login_institutions` - verified_remote
- [x] `update_membership_role` - verified_remote
- [x] `remove_user_membership` - verified_remote
- [x] `set_user_access_status` - verified_remote
- [x] `delete_institution_user` - verified_remote

Prioridad P1, necesarios para mantener UI academica actual:

- [ ] `academic_resolve_member_profile_by_email`
- [ ] `upsert_subject_enrollment_from_portal`
- [ ] `upsert_exam_enrollment_from_portal`
- [ ] `get_student_portal_workspace_snapshot`
- [ ] `get_academic_transition_config`

Prioridad P1, docente/libro academico:

- [ ] `academic_teacher_create_class_session`
- [ ] `academic_teacher_upsert_attendance_records`
- [ ] `academic_teacher_upsert_student_grade`
- [ ] `academic_get_teacher_subject_rosters`
- [ ] `teacher_remove_student_subject_records`
- [ ] `teacher_reset_student_subject_academic_records`

Prioridad P1, mesas:

- [ ] `academic_teacher_confirm_exam_assignment`
- [ ] `academic_teacher_object_exam_assignment`
- [ ] `academic_admin_reset_exam_process`
- [ ] `academic_get_student_subject_teacher_notices`

Prioridad P2, capa relacional avanzada:

- [ ] `academic_admin_create_student_career_enrollment`
- [ ] `academic_admin_correct_student_career_enrollment`
- [ ] `academic_admin_invalidate_student_career_enrollment`
- [ ] `academic_admin_get_student_career_enrollment_history`
- [ ] `academic_enroll_first_year_student`
- [ ] `academic_enroll_student_in_course_offering`
- [ ] `academic_get_student_course_enrollment_preview`
- [ ] `academic_get_teacher_course_roster_preview`
- [ ] `academic_admin_get_teacher_profile_link_candidates`
- [ ] `academic_admin_link_teacher_record_profile`

## RLS minimo por etapa

Roles relevantes:

- Superadmin global.
- Owner/admin/editor de institucion.
- Viewer de institucion.
- Docente.
- Alumno.

Reglas base:

- Toda tabla con `institution_id` debe aislar por membresia.
- Escrituras administrativas solo para owner/admin/editor o Edge Function segura.
- Alumno solo puede leer/escribir sus propias inscripciones y datos academicos mediante RPC o Edge Function.
- Docente solo puede escribir asistencia/notas/confirmaciones de asignaciones propias.
- `workspace_snapshots` debe permitir lectura segura al alumno mediante RPC, no lectura abierta de toda la fila.
- Soft delete con `deleted_at` donde la UI lo filtra.

## Orden de implementacion derivado

1. Etapa 1: completar foundation y RPCs admin base.
2. Etapa 2: extender `student_records` y `teacher_records` para compatibilidad UI.
3. Etapa 3: agregar archivos fuente, disponibilidad/carga docente y tablas legacy de compatibilidad.
4. Etapa 4: agregar `subject_teacher_assignments` y RPCs de asignacion.
5. Etapa 5: agregar inscripciones, notas, asistencia y deuda.
6. Etapa 6: agregar mesas, confirmaciones e inscripciones a examen.
7. Etapa 7: agregar capa relacional avanzada de cursada y previews.
8. Etapa 8: persistencia relacional real del cronograma generado.
9. Etapa 9: endurecimiento para monetizacion.

## Verificacion de cada etapa

Cada etapa debe entregar:

- SQL idempotente en `supabase/schema/`.
- Actualizacion de `supabase/schema/00_README.md` si hay nuevo bloque.
- Checklist manual para ejecutar en SQL Editor.
- Smoke test UI con usuario admin.
- Smoke test UI con usuario docente/alumno cuando aplique.
- `npm.cmd test` o test focal equivalente cuando haya cambios de codigo.
- `npm.cmd run build` antes de considerar listo para despliegue.

## Inventario manual previo a Etapa 1

Antes de aplicar cualquier SQL nuevo, ejecutar estas consultas en el SQL Editor del proyecto Supabase y comparar el resultado contra este contrato.

Tablas publicas:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Columnas publicas:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

RPCs publicas:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
order by routine_name;
```

Policies RLS:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Storage buckets:

```sql
select id, name, public
from storage.buckets
order by name;
```

Resultado esperado de esta etapa:

- Saber que tablas ya existen de verdad en Supabase.
- Saber que columnas faltan o chocan con la UI.
- Saber que RPCs ya estan aplicadas y cuales faltan.
- Saber si RLS existe antes de habilitar escrituras nuevas.
- Saber si el bucket `workspace-source-files` existe.

## Riesgos a controlar

- Agregar tablas con nombres parecidos y dejar servicios escribiendo en una tabla distinta a la que leen.
- Cambiar demasiado pronto `get_academic_transition_config` a `hybrid_read` o `relational_primary`.
- Romper snapshots al limpiar datos operativos.
- Duplicar docentes/alumnos por diferencias de DNI, email o carrera.
- Crear RLS permisiva para resolver rapido y abrir datos entre instituciones.
- Persistir cronograma relacional sin adapter que conserve la forma actual que espera la UI.

## Proximo bloque concreto

Etapa 1 cerrada:

- `01_foundation.sql` ahora incluye las RPCs P0 que faltaban para la UI de superadmin.
- Las RPCs solo se conceden a `authenticated` y validan superadmin activo antes de modificar datos.
- Se evita bloquear/eliminar superadmins globales.
- Se evita dejar una institucion sin ningun owner/admin activo.
- `delete_institution_user` quita acceso en el hub eliminando membresias y perfil, pero no borra la cuenta `auth.users` desde SQL.
- Miguel informo que `01_foundation.sql` ya fue ejecutado en Supabase. Estado: `reported_applied`.
- Miguel probo los flujos P0 en la UI y confirmo que funcionan correctamente. Estado: `verified_remote`.

Verificaciones de cierre de etapa 1:

1. RLS foundation verificado por Miguel el 2026-09-08.
2. RPCs P0 presentes en `information_schema.routines`.
3. Grants de ejecucion presentes para `authenticated` en las RPCs admin.
4. UI de superadmin probada con cambio de rol y bloqueo/desbloqueo.
5. Auditoria remota escrita en `admin_audit_logs`.

Verificacion remota recibida:

- `pg_policies` muestra las policies esperadas para `admin_audit_logs`, `app_settings`, `institutions`, `memberships` y `profiles`.
- No se detectan policies extra permisivas en foundation.
- `information_schema.routines` muestra las 6 RPCs P0 esperadas: `get_public_app_status`, `list_active_login_institutions`, `update_membership_role`, `remove_user_membership`, `set_user_access_status`, `delete_institution_user`.
- `information_schema.routine_privileges` muestra `EXECUTE` para `authenticated`, `postgres` y `service_role` en las 4 RPCs administrativas. No aparecen grants para `anon` ni `public`.
- Smoke test negativo: al intentar bloquear un usuario que es el unico `owner/admin` activo de una institucion, Supabase responde `INSTITUTION_REQUIRES_ACTIVE_ADMIN`. Este comportamiento es esperado y protege a la institucion de quedar sin administrador activo.
- Smoke test UI positivo: Miguel confirmo que los flujos funcionan correctamente.
- `admin_audit_logs` muestra acciones reales `set_user_access_status` y `update_membership_role` ejecutadas por el superadmin.

Checklist SQL especifica de etapa 1:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_public_app_status',
    'list_active_login_institutions',
    'update_membership_role',
    'remove_user_membership',
    'set_user_access_status',
    'delete_institution_user'
  )
order by routine_name;
```

```sql
select grantee, routine_name, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'update_membership_role',
    'remove_user_membership',
    'set_user_access_status',
    'delete_institution_user'
  )
order by routine_name, grantee;
```

```sql
select user_id, email, account_role, is_global_admin, is_blocked
from public.profiles
order by created_at desc
limit 20;
```

```sql
select institution_id, user_id, role
from public.memberships
order by created_at desc
limit 20;
```

```sql
select action, target_type, target_id, actor_email, created_at
from public.admin_audit_logs
where action in (
  'update_membership_role',
  'remove_user_membership',
  'set_user_access_status',
  'delete_institution_user'
)
order by created_at desc
limit 20;
```

Etapa 2 preparada localmente:

- `02_academic_relational_schema.sql` extiende `teacher_records` y `student_records` con las columnas que la UI ya usa.
- Se conservan las columnas canonicas existentes (`external_code`, `national_id`, `email`) y se agregan las operativas (`workspace_key`, `profile_id`, `full_name`, `dni`, `raw_payload`, `updated_at`, etc.).
- Se agregan defaults y triggers para sincronizar campos canonicos/UI en inserts y updates.
- Se agregan claves de upsert esperadas por la UI: `teacher_records_workspace_dni_key` y `student_records_workspace_email_career_key`.
- Se agregan policies de escritura solo para superadmin u `owner`/`admin`/`editor` de la institucion.
- Se agrega `supabase/docs/verify_02_roster_records_ui_compat.sql` para verificar columnas, constraints, triggers, grants, policies y duplicados.
- Se agrega `supabase/docs/verify_02_roster_records_ui_compat_summary.sql` para obtener una sola grilla resumen de la verificacion remota.
- Se agrega `supabase/docs/repair_02_student_records_duplicate_upsert_keys.sql` para fusionar duplicados reales de alumnos que bloqueen `student_records_workspace_email_career_key`.
- El mapper del motor relacional acepta tanto `national_id/email/status='active'` como `dni/login_email/status='activo'`.
- Verificacion local: tests focales en verde, 6 archivos y 36 tests pasados.
- Verificacion local: `npm.cmd run build` en verde, incluido `audit:prod`.

Pendiente funcional para cerrar etapa 2:

1. Probar guardar un workspace con alumnos y docentes.
2. Confirmar que `student_records` y `teacher_records` quedan pobladas con `workspace_key = 'main'`.
3. Probar crear/linkear accesos de alumno y docente.
4. Recargar la UI y confirmar que los padrones siguen visibles.

Avance remoto etapa 2:

- `student_records` ya tiene campos requeridos por la UI sin faltantes (`workspace_key`, `full_name`, `career`, `academic_year`, `raw_payload`, `updated_at` OK).
- El duplicado que bloqueaba `student_records_workspace_email_career_key` fue resuelto.
- `student_records_workspace_email_career_key` ya existe en Supabase remoto con `UNIQUE (institution_id, workspace_key, email, career)`.
- Verificacion resumen completa en Supabase: 11/11 checks OK para columnas, campos requeridos, duplicados, constraints, triggers, RLS policies y grants de `student_records`/`teacher_records`.

Etapa 3 preparada localmente:

- Se agrega `supabase/schema/05_workspace_operational_compat.sql`.
- Cubre `workspace_source_files` y el bucket privado `workspace-source-files` con policies de Storage por `institution_id` en el primer segmento del path.
- Cubre `teacher_availability_records` y `teacher_workload_records` con las claves de upsert esperadas por `src/services/teacherAcademicRecords.js`.
- Cubre `legacy_subjects_catalog`, `legacy_subject_prerequisites` y `legacy_exam_sessions`, que `src/services/workspaceSnapshot.js` sincroniza al guardar.
- `legacy_exam_sessions.exam_date` queda como `text` en esta etapa porque `buildExams()` puede producir timestamps completos (`YYYY-MM-DDTHH:mm:ss`); la normalizacion estricta de fechas corresponde a la etapa de mesas canonicas.
- Se agrega `supabase/docs/verify_03_workspace_operational_compat_summary.sql` para verificar columnas, constraints, triggers, RLS, grants, bucket, policies de Storage y duplicados.
- Verificacion local: tests focales en verde, 5 archivos y 37 tests pasados.
- Verificacion local: `npm.cmd run build` en verde, incluido `audit:prod`; Vite mantiene warnings conocidos de chunks grandes.

Avance remoto etapa 3:

- `05_workspace_operational_compat.sql` aplicado en Supabase.
- Verificacion resumen completa en Supabase: 19/19 checks OK para columnas, constraints, triggers, campos requeridos, duplicados, RLS policies, grants, bucket privado, policies de Storage, helper `storage_object_institution_id(text)` y `legacy_exam_sessions.exam_date` como `text`.

Pendiente funcional para cerrar etapa 3:

1. Probar carga/descarga de una planilla fuente desde la UI.
2. Guardar un workspace con disponibilidad/carga docente y confirmar que las tablas docentes se pueblan.
3. Confirmar que las tablas `legacy_*` se pueblan al guardar planes/correlatividades/cronograma.
