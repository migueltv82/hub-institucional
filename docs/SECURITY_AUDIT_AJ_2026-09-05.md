# Auditoria A-J de seguridad Supabase

Fecha: 2026-09-05

Alcance revisado en fuente local, sin ejecutar SQL remoto: `supabase/schema/01_foundation.sql`, `02_academic_relational_schema.sql`, `03_workspace_data.sql` y `04_teacher_exam_date_exclusions.sql`. Se agrego `teacher_exam_date_exclusions` a la lista de tablas auditadas con el mismo criterio de RLS que `workspace_snapshots`.

Referencias actuales revisadas: changelog Supabase, guia RLS Supabase y Database Advisors Supabase. Hallazgo relevante del changelog: desde 2026 hay cambios de exposicion de Data API; RLS no reemplaza los `GRANT` necesarios para que PostgREST acceda tablas/funciones.

## (a) Hallazgos criticos/importantes

### Criticos

1. `public.handle_new_user()` es `SECURITY DEFINER`, queda callable por `PUBLIC` si no se revoca explicitamente, y copia `raw_user_meta_data ->> 'account_role'` a `profiles.account_role`.
   - Impacto: `raw_user_meta_data` es editable por usuario. Aunque `is_global_admin` sale de `raw_app_meta_data` y RLS critica usa `is_global_admin`, `account_role` se consume en frontend/Edge Function y puede producir estados de cuenta falsos o flujos administrativos ambiguos.
   - Trigger revisado: `on_auth_user_created` ejecuta `public.handle_new_user()` `after insert on auth.users`. Revocar `EXECUTE` a clientes no rompe el trigger.

2. `teacher_exam_date_exclusions.teacher_id` referencia `public.teacher_records(id)` sin incluir `institution_id`.
   - Impacto: el UUID global reduce el riesgo practico, pero la relacion no demuestra a nivel FK que el bloqueo docente pertenezca a la misma institucion. El resto del schema nuevo usa FKs compuestas `(institution_id, id)` para evitar cruces multi-tenant.
   - Fix no automatico: antes de convertirla a FK compuesta hay que correr diagnostico de cruces existentes.

3. Las tablas academicas relacionales tienen RLS de lectura para cualquier miembro de la institucion, incluidas tablas con PII y estado academico: `student_records`, `teacher_records`, `student_academic_statuses`, `workspace_snapshots.payload`.
   - Impacto: un alumno/docente miembro podria leer padrones completos, emails, telefonos, DNI y notas de su institucion si tambien tiene `GRANT SELECT`/Data API expuesta. Puede ser aceptable para admins, pero es demasiado amplio para alumno/docente en un producto SaaS.
   - No propuse RLS restrictiva automatica porque depende de la logica de negocio: que debe ver alumno, docente, admin y superadmin.

### Importantes

1. `public.list_active_login_institutions()` no revoca explicitamente `EXECUTE FROM public`.
   - Hoy esta pensada para login publico y se concede a `anon, authenticated`, pero conviene revocar `PUBLIC` y conceder solo esos roles para evitar permisos implicitos.

2. `public.get_public_app_status()` debe seguir publico, pero su seguridad depende de que `app_settings.is_public = true` solo se use para valores inocuos.
   - El preview relacional usa claves publicas `exam_relational_preview:<institution_id>`, sin PII. Cualquier valor sensible en una fila `is_public=true` quedaria visible para `anon`.

3. `app_settings` tiene RLS para que superadmin gestione, pero el archivo fuente solo concede `select` a `anon, authenticated`.
   - Si la base remota no conserva grants por defecto, la UI de superadmin que hace `upsert` del flag de preview puede fallar por falta de `INSERT/UPDATE`.
   - Dar esos grants a `authenticated` no abre escritura por si solo si RLS queda correcta, pero igual es un cambio de permisos y debe revisarse separado.

4. Varias FKs no tienen indice hijo equivalente en el orden util para validaciones, cascadas o deletes del padre.
   - Riesgo: bloqueos y scans innecesarios al borrar o actualizar padres, y peor rendimiento en joins comunes. El SQL de bajo riesgo propone indices no redundantes con `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.

5. `SECURITY DEFINER` usa `set search_path = public`. Es mejor fijar `public, pg_temp` para que el path quede explicito y no dependa de resolucion implicita de temporales.
   - No cambia logica; el SQL de bajo riesgo recrea las funciones preservando cuerpos.

6. Dos policies llaman `auth.uid()` directo: `profiles can read themselves` y `members can read memberships`.
   - Supabase recomienda envolver funciones de auth en `(select auth.uid())` en RLS para evitar reevaluacion por fila cuando no cambia el resultado logico.

7. Las tablas academicas tienen solo policies `SELECT`; no hay `INSERT/UPDATE/DELETE` desde cliente. Esto protege alumno/docente frente a modificaciones directas, pero tambien exige que las mutaciones legitimas pasen por Edge Function/RPC o que se agreguen policies especificas.

8. `admin_audit_logs` solo tiene policy de `SELECT` para superadmin; no hay policy de update/delete. Correcto para usuarios normales. Falta definir si Edge Functions insertan siempre con service role y si se requiere `GRANT INSERT` para algun rol tecnico.

## Cobertura A-J

### A. SECURITY DEFINER

- `public.handle_new_user()`: `SECURITY DEFINER`, `search_path=public`, no valida `auth.uid()` porque corre por trigger de Auth. Debe revocar `EXECUTE` a `PUBLIC/anon/authenticated`. Debe dejar de confiar en `raw_user_meta_data.account_role` luego de revisar provisioning.
- `public.is_super_admin()`: `SECURITY DEFINER`, `stable`, `search_path=public`, valida `auth.uid()` contra `profiles.is_global_admin` y `is_blocked=false`. Callable por `authenticated`; revocado de `public, anon`.
- `public.is_member_of_institution(uuid,text[])`: `SECURITY DEFINER`, `stable`, `search_path=public`, valida `auth.uid()` contra `memberships` + `profiles.is_blocked=false`. Callable por `authenticated`; revocado de `public, anon`.
- `public.get_public_app_status()`: `SECURITY DEFINER`, publico por diseno, lee solo `app_settings` publica.
- `public.list_active_login_institutions()`: `SECURITY DEFINER`, publico por diseno de login; falta `REVOKE EXECUTE FROM public` explicito.

### B. RLS

Tablas auditadas: `institutions`, `profiles`, `memberships`, `admin_audit_logs`, `app_settings`, `careers`, `study_plans`, `subjects`, `study_plan_subjects`, `subject_prerequisites`, `plan_equivalences`, `teacher_records`, `teacher_subject_assignments`, `course_schedules`, `student_records`, `student_career_plans`, `student_academic_statuses`, `workspace_snapshots`, `teacher_exam_date_exclusions`.

Resultado: el aislamiento por `institution_id` esta bien orientado para tablas academicas y workspace, pero la granularidad por rol academico es demasiado amplia para PII/notas. Superadmin tiene acceso amplio mediante `is_super_admin()`. Usuarios normales no pueden actualizar `profiles.account_role`, `is_global_admin` ni `is_blocked` por RLS directa.

### C. Optimizacion RLS

Aplicable sin cambio logico a:

- `profiles can read themselves`: `user_id = (select auth.uid())`.
- `members can read memberships`: `user_id = (select auth.uid())`.
- Helpers `is_super_admin()` e `is_member_of_institution()` pueden envolver `auth.uid()` del mismo modo.

No combine policies permisivas de `app_settings`, `institutions`, `memberships`, `profiles`; mantenerlas separadas facilita demostrar seguridad.

### D. Indices FK

El archivo `supabase/security/2026-09-05_low_risk_indexes_search_path_auth_uid.sql` propone indices para FKs no cubiertas o mal cubiertas por orden de columnas. No elimina indices existentes.

### E. Unicidad

Ya existen: `institutions.slug`, `careers(institution_id, external_code)`, `subjects(institution_id, code)`, `study_plan_subjects(institution_id, plan_id, subject_id)`, `teacher_records(institution_id, external_code)`, `student_records(institution_id, external_code)`, `teacher_subject_assignments` con `unique nulls not distinct`.

Antes de agregar unicidad por `national_id` o `email`, correr diagnosticos de duplicados y decidir reglas para DNIs faltantes, emails compartidos, docentes/alumnos que puedan estar en mas de una institucion y registros historicos.

### F. CHECK constraints

Ya existen: horarios `ends_at > starts_at`, vigencias `valid_until >= valid_from`, equivalencias/prerrequisitos sin auto-referencia, `teaching_hours >= 0`, `year_number`/`duration_years` en rangos, `logic_group` aun no tiene `>= 1`, `entry_year`/`plan_year` no tienen rango, `current_year` no tiene rango, notas `grade between 0 and 10`.

Los faltantes se dejan en SQL de revision manual porque pueden fallar con datos existentes.

### G. Consistencia de relaciones

Bien cubierto con FK compuesta: `student_career_plans`, `study_plans`, `study_plan_subjects`, `teacher_subject_assignments`, `course_schedules`, `subject_prerequisites`, `plan_equivalences`, `student_academic_statuses`.

Excepcion: `teacher_exam_date_exclusions.teacher_id` y `workspace_snapshots.owner_user_id` usan FK simple. `owner_user_id` es global por usuario y no necesita pertenecer a institucion para integridad fuerte, pero `teacher_exam_date_exclusions` si deberia migrar a FK compuesta.

### H. Datos personales

Sensibles: `profiles.email`, `teacher_records.national_id/email/phone`, `student_records.national_id/email/phone`, `student_academic_statuses.grade/condition/notes`, `workspace_snapshots.payload`, `admin_audit_logs.metadata/error_message`.

Recomendacion: admins institucionales leen padrones completos; alumno lee solo su perfil/estado; docente lee solo sus materias/alumnos asignados; superadmin lee lo necesario para soporte/auditoria. Esto requiere diseno de policies por rol antes de aplicar.

### I. Auditoria

`admin_audit_logs` contiene actor, accion, target, status, error, metadata y fecha. RLS impide update/delete a usuarios normales porque no existen policies para esas acciones. Falta revisar sanitizacion profunda de `metadata` en Edge Function para contrasenas/DNI/email si se graban objetos anidados.

## (b) SQL propuesto

Archivos creados:

- `supabase/security/2026-09-05_security_diagnostics.sql`: consultas de inspeccion y verificacion previa.
- `supabase/security/2026-09-05_low_risk_indexes_search_path_auth_uid.sql`: bajo riesgo, ejecutar un bloque por vez.
- `supabase/security/2026-09-05_rls_function_permissions_review.sql`: cambios de permisos/RLS para revisar individualmente antes de aplicar.
- `supabase/security/2026-09-05_manual_review_constraints.sql`: constraints de negocio/integridad que requieren diagnostico de datos.

Orden recomendado: diagnostico completo, bajo riesgo mecanico uno por uno, repetir diagnosticos de indices/funciones, luego revisar cada bloque de permisos/RLS con explicacion de acceso, y por ultimo constraints despues de resolver duplicados o datos invalidos.

Rollback: cada bloque de SQL incluye comentario de rollback. Para indices, `DROP INDEX CONCURRENTLY IF EXISTS`. Para funciones/policies, volver al cuerpo/policy anterior desde `supabase/schema/01_foundation.sql`. Para grants, `REVOKE`/`GRANT` inverso segun el bloque aplicado.
