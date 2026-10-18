# Matriz de funciones SQL y RPC — Etapa 02.4

## Contrato vigente y límites del inventario histórico

El inventario, hallazgos y callers de 02.4/02.5 conservados debajo son **HISTÓRICOS**, no una matriz actual de Staging. Las menciones de baseline parcial, hardening no aplicado y RPC de inscripción/configuración ausentes están **SUPERADAS** para el alcance certificado. Baseline local descartable PASS: 9 SQL canónicos aplicados, 40 tablas public con RLS y Staging aplicado/verificado; [baseline](../supabase/baseline/STAGING_BASELINE_RESULT.md) y [RLS/RPC local](../supabase/baseline/LOCAL_AB_RLS_RPC_RESULT.md). No extrapolar esos resultados a Production ni a RPC incompletas.

Inscripción vigente: RPC existente/validada, JWT del usuario vía `context.userClient`, `auth.uid() = actor_user_id = target_student_id`, profile/membership/legajo del tenant-workspace validados. No existe caller operativo `adminClient`/`service_role` para ese flujo; las referencias privilegiadas históricas no son excepciones vigentes. [Contrato](contracts/upsert_exam_enrollment_from_portal.md).

Los callers legacy de confirmación/objeción/reasignación/reconciliación docente de las tablas siguientes son **HISTÓRICOS / DIFERIDOS post-v1**, no alcanzables desde Mesas Docente v1 read-only certificado en Staging. Conservar servicios no equivale a habilitar escrituras. Storage enforcement certificado, límite 25 MiB; [evidencia](../supabase/baseline/STAGING_STORAGE_ENFORCEMENT_EVIDENCE.json).

Production sigue **NO-GO**: branch protection remota, backup/restore, rollback, observabilidad, E2E/UAT y release closure pendientes. `EX-001` vence 2026-10-17; no presentar aceptación posterior sin nueva validación. Esta nota no inventa un recuento actual de funciones ni autoriza grants/deploy.

Fecha: 2026-09-24. Alcance: análisis estático local sobre `supabase/**/*.sql`, llamadas `.rpc(...)` en `src/` y `supabase/functions/admin-users/index.ts`. No se ejecutó SQL remoto ni se modificó Supabase.

Estado de SQL: **PREPARADO — NO APLICADO** cuando exista cambio SQL futuro. En esta etapa 02.4 no se aplicó SQL.

Actualización 02.5, 2026-09-25: el acceso remoto read-only quedó recuperado y se ejecutó discovery de catálogo dentro de transacciones `READ ONLY` con `ROLLBACK`. El proyecto `Hub-Institucional` está `ACTIVE_HEALTHY`, el ref coincide con el link local (`qwrw…mibx`) y el `403` ya no persiste. La evidencia remota completa está resumida en [SUPABASE_DRIFT_AUDIT.md](SUPABASE_DRIFT_AUDIT.md). No se consultaron datos personales, no se ejecutaron RPC de negocio y no hubo mutaciones remotas.

## Resumen de inventario

| Métrica | Conteo local |
| --- | ---: |
| Definiciones SQL versionadas totales | 57 |
| Funciones únicas versionadas | 41 |
| Definiciones `SECURITY DEFINER` | 47 |
| Definiciones `SECURITY INVOKER` explícitas | 0 |
| Definiciones invoker por defecto / sin `SECURITY DEFINER` | 10 |
| Funciones trigger internas canónicas | 6 |
| RPC invocadas desde frontend/servicios/Edge Function | 36 |
| RPC invocadas sin definición SQL local auditable | 12 |

Las 57 definiciones incluyen fuentes canónicas en `supabase/schema/`, reparaciones históricas en `supabase/docs/`, propuestas/revisiones en `supabase/security/` y funciones temporales `pg_temp` de verificadores.

## Hallazgos

| Severidad | Función / grupo | Problema | Impacto | Estado |
| --- | --- | --- | --- | --- |
| P1 | `public.handle_new_user()` remoto | 02.5 confirmó que la función remota sigue leyendo `raw_user_meta_data.account_role`, con `SECURITY DEFINER`, `search_path=public, pg_temp` y trigger `auth.users` activo. | La vulnerabilidad 02.3 sigue activa en remoto hasta aplicar el hardening preparado y validarlo primero en staging aislado. | Remoto confirmado; `SQL 02.3` sigue **PREPARADO — NO APLICADO**. |
| P2 | 12 RPC invocadas por frontend/Edge | 02.5 confirmó que las 12 RPC sin definición SQL local tampoco existen en remoto. | Flujos de inscripción, previews y gestión carrera/docente dependen de contratos ausentes; producción queda NO-GO aunque no haya evidencia de explotación. | `LOCAL CALLER / REMOTE ABSENT`; no reparar automáticamente. |
| P2 | `anon`/`authenticated EXECUTE` remoto | 30 funciones remotas tienen `EXECUTE` para `anon` y `authenticated`; no hay `PUBLIC EXECUTE`. | Superficie amplia sobre funciones `SECURITY DEFINER`; varias defensas internas existen, pero debe revisarse función por función y probar negativo por rol/tenant. | Requiere staging y matriz negativa. |
| P2 | Varias `SECURITY DEFINER` canónicas | Usan `search_path = public` o `public, pg_temp` en lugar de `search_path = ''` con referencias totalmente calificadas. | Hardening incompleto: si en el futuro aparece un objeto sombreable o cambia la exposición de schemas, aumenta el riesgo de resolución insegura. No se confirmó bypass directo porque las referencias críticas están mayormente calificadas y hay validaciones de caller. | Documentado; no se hizo refactor masivo en 02.4. |
| P2 | RPC invocadas sin definición SQL local (`upsert_exam_enrollment_from_portal`, `academic_*career*`, previews y perfil docente) | El frontend/Edge Function llama contratos cuya implementación no está en `supabase/schema/` ni en reparaciones SQL locales auditables. 02.5 confirmó ausencia remota. | No existe backend remoto para esos contratos; antes de producción hay que definir/aplicar una fuente canónica y probarla en staging. | Confirmado remoto: AUSENTES. |
| P3 | Reparaciones históricas en `supabase/docs/repair_*` | Varias recrean funciones `SECURITY DEFINER` con `search_path = public` o `public, pg_temp`, y algunas duplican funciones canónicas. | Riesgo de aplicar un parche histórico obsoleto o menos endurecido. | Usar solo con checklist; reconciliar contra `supabase/schema/` antes de aplicar. |
| P3 | `supabase/security/2026-09-05_low_risk_indexes_search_path_auth_uid.sql` | Recrea helpers `SECURITY DEFINER` sin repetir grants/revokes junto a cada bloque salvo `handle_new_user`. `CREATE OR REPLACE` conserva privilegios si la función ya existe, pero aplicado fuera de orden podría heredar `PUBLIC` por defecto. | Riesgo operativo si se ejecuta como instalación parcial o fuera del orden canónico. | Aplicar solo después de capturar estado y por bloque, con post-check de privilegios. |

P0/P1 nuevos: ninguno confirmado localmente.

## Matriz de funciones versionadas

| Función | Fuente canónica / histórica | Clasificación | SECURITY | search_path | EXECUTE local esperado | Caller esperado | Tablas principales | Riesgo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `public.handle_new_user()` | `schema/01_foundation.sql`; duplicada endurecida en `security/*` | TRIGGER INTERNO | DEFINER | `''` | Revocado a `public, anon, authenticated` | Trigger `auth.users` | `profiles` | Bajo tras 02.3; SQL remoto pendiente. |
| `public.is_super_admin()` | `schema/01_foundation.sql`; reparación en `security/low_risk` | FUNCIÓN AUXILIAR | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | RLS/RPC | `profiles` | P2 hardening `search_path`. Autoridad sale de `profiles.is_global_admin`. |
| `public.is_member_of_institution(uuid,text[])` | `schema/01_foundation.sql`; reparación en `security/low_risk` | FUNCIÓN AUXILIAR | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | RLS/RPC | `memberships`, `profiles` | P2 hardening; valida `auth.uid()`, membresía y bloqueo. |
| `public.get_public_app_status()` | `schema/01_foundation.sql`; reparación en `security/low_risk` | RPC USUARIO pública | DEFINER | `public, pg_temp` | `anon`, `authenticated`; revocado a `public` | Login/frontend | `app_settings` | Bajo: lectura pública intencional de setting público. |
| `public.list_active_login_institutions()` | `schema/01_foundation.sql`; reparación en `security/low_risk` | RPC USUARIO pública | DEFINER | `public, pg_temp` | `anon`, `authenticated`; revocado a `public` | Login/frontend | `institutions` | Bajo: expone solo instituciones activas para login. |
| `public.foundation_require_super_admin()` | `schema/01_foundation.sql` | FUNCIÓN AUXILIAR | DEFINER | `public` | Revocado a `public, anon, authenticated` | RPC superadmin internas | `profiles` | P2 hardening; valida `auth.uid()` contra perfil global activo. |
| `public.foundation_active_institution_admin_count(uuid,uuid)` | `schema/01_foundation.sql` | FUNCIÓN AUXILIAR | DEFINER | `public` | Revocado a `public, anon, authenticated` | RPC superadmin internas | `memberships`, `profiles` | P2 hardening; protege último admin institucional. |
| `public.update_membership_role(uuid,uuid,text)` | `schema/01_foundation.sql` | RPC SUPERADMIN | DEFINER | `public` | `authenticated`; revocado a `public, anon` | Super Admin UI | `memberships`, `admin_audit_logs` | P2 hardening; autorización global interna. |
| `public.remove_user_membership(uuid,uuid)` | `schema/01_foundation.sql` | RPC SUPERADMIN | DEFINER | `public` | `authenticated`; revocado a `public, anon` | Super Admin UI | `memberships`, `admin_audit_logs` | P2 hardening; protege último admin. |
| `public.set_user_access_status(uuid,boolean)` | `schema/01_foundation.sql` | RPC SUPERADMIN | DEFINER | `public` | `authenticated`; revocado a `public, anon` | Super Admin UI | `profiles`, `memberships`, `admin_audit_logs` | P2 hardening; bloquea bloquear superadmin. |
| `public.delete_institution_user(uuid)` | `schema/01_foundation.sql`; reparación histórica `docs/repair_01` | RPC SUPERADMIN | DEFINER | `public` | `authenticated`; revocado a `public, anon` | Super Admin UI | `profiles`, `memberships`, `deleted_person_records`, `admin_audit_logs` | P2 hardening; reparación histórica debe reconciliarse. |
| `public.sync_teacher_record_ui_compat_fields()` | `schema/02_academic_relational_schema.sql` | TRIGGER INTERNO | INVOKER por defecto | `public` | Revocado a `public, anon, authenticated` | Trigger `teacher_records` | `teacher_records` | Bajo; no RPC. |
| `public.sync_student_record_ui_compat_fields()` | `schema/02_academic_relational_schema.sql` | TRIGGER INTERNO | INVOKER por defecto | `public` | Revocado a `public, anon, authenticated` | Trigger `student_records` | `student_records` | Bajo; no RPC. |
| `public.get_student_portal_workspace_snapshot(uuid,text)` | `schema/05_student_portal_secure_read.sql`; reparaciones históricas `docs/repair_05_*` | RPC USUARIO | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Portal alumno | `profiles`, `memberships`, `student_records`, tablas académicas | P2 hardening; cross-tenant protegido por perfil alumno, membresía activa y legajo propio. |
| `public.storage_object_institution_id(text)` | `schema/05_workspace_operational_compat.sql` | FUNCIÓN AUXILIAR | INVOKER por defecto | implícito | `authenticated`; revocado a `public, anon` | Storage policies | `storage.objects` path parsing | Bajo; no muta datos. |
| `public.touch_workspace_operational_updated_at()` | `schema/05_workspace_operational_compat.sql`; duplicada en `docs/repair_06` | TRIGGER INTERNO | INVOKER por defecto | `public` | Revocado a `public, anon, authenticated` | Triggers operativos | Tablas workspace/legacy | Bajo; reparación duplicada. |
| `public.touch_subject_teacher_assignments_updated_at()` | `schema/06_subject_teacher_assignments.sql` | TRIGGER INTERNO | DEFINER | `public` | Revocado a `public, anon, authenticated` | Trigger `subject_teacher_assignments` | `subject_teacher_assignments` | P3: no requiere `SECURITY DEFINER` aparente. |
| `public.academic_resolve_member_profile_by_email(uuid,text,text,text)` | `schema/06_subject_teacher_assignments.sql` | RPC ADMIN INSTITUCIONAL | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Admin institucional/Superadmin | `profiles`, `memberships`, `teacher_records`, `student_records` | P2 hardening; valida superadmin o membresía en institución. |
| `public.academic_create_teacher_subject_leave(...)` | `schema/06_subject_teacher_assignments.sql` | RPC ADMIN INSTITUCIONAL | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Admin institucional/Superadmin | `subject_teacher_assignments`, `profiles`, `memberships` | P2 hardening; valida owner/admin/editor o superadmin. |
| `public.academic_update_teacher_assignment_condition(uuid,text)` | `schema/06_subject_teacher_assignments.sql` | RPC ADMIN INSTITUCIONAL | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Admin institucional/Superadmin | `subject_teacher_assignments` | P2 hardening; institución deriva de asignación bloqueada. |
| `public.touch_academic_operations_updated_at()` | `schema/07_academic_operations.sql` | TRIGGER INTERNO | DEFINER | `public` | Revocado a `public, anon, authenticated` | Triggers académicos | Tablas académicas | P3: no requiere `SECURITY DEFINER` aparente. |
| `public.academic_can_manage_subject(uuid,text,text,text)` | `schema/07_academic_operations.sql` | FUNCIÓN AUXILIAR / RPC USUARIO | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | RPC docentes | `subject_teacher_assignments`, `memberships` | P2 hardening; valida superadmin, admin/editor o docente asignado. |
| `public.academic_resolve_subject_enrollment(uuid,text,uuid,text,text)` | `schema/07_academic_operations.sql` | FUNCIÓN AUXILIAR | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | RPC notas | `subject_enrollments` | P2 hardening; invocable directa por authenticated pero solo lee id de enrollment por parámetros. |
| `public.upsert_subject_enrollment_from_portal(...)` | `schema/07_academic_operations.sql` | RPC USUARIO | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Portal alumno / Edge Function | `subject_enrollments`, `profiles`, `memberships` | Bajo/P2 hardening: exige `actor_user_id = target_student_id` y perfil alumno miembro. |
| `public.academic_teacher_create_class_session(...)` | `schema/07_academic_operations.sql` | RPC USUARIO docente/admin | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Portal docente | `subject_class_sessions` | P2 hardening; usa `academic_can_manage_subject`. |
| `public.academic_teacher_upsert_student_grade(...)` | `schema/07_academic_operations.sql` | RPC USUARIO docente/admin | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Portal docente | `student_grades`, `subject_enrollments` | P2 hardening; valida materia administrable. |
| `public.academic_teacher_upsert_attendance_records(uuid,jsonb)` | `schema/07_academic_operations.sql` | RPC USUARIO docente/admin | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Portal docente | `subject_attendance_records`, `subject_class_sessions` | P2 hardening; valida sesión y materia administrable. |
| `public.academic_get_teacher_subject_rosters(uuid,text)` | `schema/07_academic_operations.sql`; reparación histórica `docs/repair_05` | RPC USUARIO docente | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Portal docente | `subject_teacher_assignments`, `subject_enrollments`, `student_records`, `profiles` | Bajo/P2 hardening; filtra por `teacher_id = auth.uid()`. |
| `public.academic_get_student_subject_teacher_notices(uuid,text)` | `schema/07_academic_operations.sql`; reparación histórica `docs/repair_05` | RPC USUARIO alumno | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Portal alumno | `subject_enrollments`, `subject_teacher_assignments` | Bajo/P2 hardening; filtra por `student_id = auth.uid()`. |
| `public.academic_get_student_portal_grades(uuid,text)` | `schema/07_academic_operations.sql`; reparaciones históricas `docs/repair_05*` | RPC USUARIO alumno | DEFINER | `public, pg_temp` | `authenticated`; revocado a `public, anon` | Portal alumno | `student_grades`, `subject_enrollments`, `student_records` | Bajo/P2 hardening; filtra por identidad propia. |
| `public.teacher_reset_student_subject_academic_records(...)` | `schema/07_academic_operations.sql`; reparación histórica `docs/repair_05` | RPC ADMIN/TEACHER SERVER-SIDE | DEFINER | `public, pg_temp` | `service_role`; revocado a `public, anon, authenticated` | Edge Function `admin-users` | `student_grades`, `subject_attendance_records` | Bajo: caller directo bloqueado; Edge revalida docente y contraseña. |
| `public.teacher_remove_student_subject_records(...)` | `schema/07_academic_operations.sql`; reparación histórica `docs/repair_05` | RPC ADMIN/TEACHER SERVER-SIDE | DEFINER | `public, pg_temp` | `service_role`; revocado a `public, anon, authenticated` | Edge Function `admin-users` | `subject_enrollments`, `student_grades`, `subject_attendance_records` | Bajo: caller directo bloqueado; Edge revalida docente y contraseña. |
| `public.academic_admin_reset_exam_process(uuid,text)` | `docs/repair_06_exam_process_reset_rpc.sql` | LEGACY / REPARACIÓN | INVOKER por defecto | `public` | `authenticated`; revocado a `public, anon` | Admin institucional/Superadmin | `exam_teacher_assignments`, `legacy_exam_sessions` | Needs investigation: no está en schema canónico; validar remoto. |
| `public.academic_teacher_confirm_exam_assignment(...)` | `docs/repair_06_exam_teacher_assignments.sql` | LEGACY / RPC DOCENTE | DEFINER | `public` | `authenticated`; revocado a `public, anon` | Portal docente | `exam_teacher_assignments` | P2 si se aplica: `search_path = public`; valida `teacher_id = auth.uid()`. |
| `public.academic_teacher_object_exam_assignment(...)` | `docs/repair_06_exam_teacher_assignments.sql` | LEGACY / RPC DOCENTE | DEFINER | `public` | `authenticated`; revocado a `public, anon` | Portal docente | `exam_teacher_assignments` | P2 si se aplica: `search_path = public`; valida `teacher_id = auth.uid()`. |
| `public.academic_reconcile_expired_exam_confirmations(uuid,text,text)` | `docs/repair_06_exam_teacher_assignments.sql` | LEGACY / RPC DOCENTE-ADMIN | DEFINER | `public` | `authenticated`; revocado a `public, anon` | Portal docente/admin | `exam_teacher_assignments` | P2 si se aplica: valida admin institucional o docente asignado. |
| `public.academic_admin_confirm_exam_assignment(uuid,text,text,uuid)` | `docs/repair_06_exam_teacher_assignments.sql` | LEGACY / RPC ADMIN INSTITUCIONAL | DEFINER | `public` | `authenticated`; revocado a `public, anon` | Admin institucional/Superadmin | `exam_teacher_assignments` | P2 si se aplica: valida owner/admin/editor o superadmin. |
| `pg_temp.verify_*` | `supabase/docs/verify_02_roster_records_ui_compat.sql` | TEST/VALIDACIÓN | INVOKER por defecto | implícito | Temporal de sesión | SQL Editor/verificación | `teacher_records`, `student_records` | Bajo; no persistente. |

## RPC invocadas desde frontend/servicios/Edge Function

| service | RPC | autorización esperada | tablas / efecto |
| --- | --- | --- | --- |
| `src/services/appConfig.js` | `get_public_app_status` | pública `anon/authenticated` | Lee `app_settings` pública. |
| `src/services/institutions.js` | `list_active_login_institutions` | pública `anon/authenticated` | Lee instituciones activas. |
| `src/services/superAdmin.js` | `update_membership_role`, `remove_user_membership`, `set_user_access_status`, `delete_institution_user` | Superadmin en `profiles.is_global_admin` | Mutan `memberships`/`profiles`, auditan en `admin_audit_logs`. |
| `src/modules/alumnos/services/studentPortalSecureReadModel.js` | `get_student_portal_workspace_snapshot` | Alumno autenticado, perfil activo, membresía y legajo propio | Lee snapshot académico filtrado. |
| `src/modules/alumnos/services/studentPortalData.js` | `academic_get_student_subject_teacher_notices` | Alumno autenticado por `auth.uid()` | Lee avisos docentes solo de materias inscriptas. |
| `src/modules/alumnos/services/academicRelationalData.js` | `academic_get_student_portal_grades`, `get_academic_transition_config` | Propias por `auth.uid()`; `get_academic_transition_config` no auditable localmente | Lee notas propias / config transición. |
| `src/modules/docentes/services/subjectRoster.js` | `academic_get_teacher_subject_rosters` | Docente autenticado asignado por `teacher_id = auth.uid()` | Lee alumnos de materias asignadas. |
| `src/services/subjectAttendance.js` | `academic_teacher_create_class_session`, `academic_teacher_upsert_attendance_records` | Docente asignado o admin institucional | Crea clases y asistencia. |
| `src/services/studentGrades.js` | `academic_teacher_upsert_student_grade` | Docente asignado o admin institucional | Carga notas/condición. |
| `src/services/subjectEnrollments.js`, `src/services/subjectTeacherAssignments.js` | `academic_resolve_member_profile_by_email` | Superadmin o miembro de institución | Resuelve perfiles por email dentro del tenant. |
| `src/services/subjectTeacherAssignments.js` | `academic_create_teacher_subject_leave`, `academic_update_teacher_assignment_condition` | Admin institucional o superadmin | Gestiona licencias/asignaciones docentes. |
| `src/services/examTeacherAssignments.js` | `academic_admin_confirm_exam_assignment`, `academic_reconcile_expired_exam_confirmations`, `academic_admin_reset_exam_process` | Admin institucional/superadmin o docente asignado según RPC | Mesas/confirmaciones; algunas solo en repair docs. |
| `src/services/examTablePublication.js` | `publish_exam_tables_from_schedule` | Owner/admin/editor de institución activa o superadmin; `anon` sin EXECUTE (EX.1) | Crea/actualiza `exam_tables` y `exam_table_subjects` desde el cronograma publicado; cancela mesas retiradas sin inscriptos. |
| `src/modules/docentes/services/teacherExamRoster.js`, `src/services/examActas.js` | `get_exam_table_roster` | Titular de la mesa (DNI del legajo = `metadata.titular_dni`) o docente con asignación `titular` activa de la materia; owner/admin/editor o superadmin. Los vocales no. `anon` sin EXECUTE (EX.7/EX.8) | Solo lectura: nombre, apellido, DNI, legajo y carrera de los inscriptos `registered`. Mismo error para mesa ajena o inexistente. |
| `src/services/examActas.js` | `get_exam_tables_admin_overview` | Owner/admin/editor o superadmin; `anon` sin EXECUTE (EX.8) | Solo lectura: mesas publicadas (no canceladas) con carrera, plan, año, tribunal y cantidad de inscriptos, para el panel de actas. |
| `src/services/examActas.js` | `admin_enroll_student_in_exam_table` | Owner/admin/editor o superadmin; `anon` sin EXECUTE (EX.8) | Inscripción especial fuera de plazo (hasta el día de la mesa) con motivo obligatorio. Aplica las mismas reglas de elegibilidad que el portal (`exam_enrollment_assert_eligible`, interna, sin EXECUTE para roles de la API). Deja evento `admin_special_enrollment`. |
| `src/modules/docentes/services/teacherExamAssignments.js` | `academic_teacher_confirm_exam_assignment`, `academic_teacher_object_exam_assignment` | Docente asignado por `auth.uid()` | Confirmar/objetar mesa propia. |
| `supabase/functions/admin-users/index.ts` | `upsert_subject_enrollment_from_portal` | Edge valida alumno miembro; RPC exige `actor_user_id = target_student_id` | Inscripción/cancelación de cursada. |
| `supabase/functions/admin-users/index.ts` | `upsert_exam_enrollment_from_portal` | Edge valida alumno miembro; implementación SQL local ausente | Inscripción/cancelación de mesa. |
| `supabase/functions/admin-users/index.ts` | `teacher_remove_student_subject_records`, `teacher_reset_student_subject_academic_records` | Edge valida docente miembro y contraseña; RPC solo `service_role` | Baja/reset académico docente. |
| `src/services/academicEnrollmentCommands.js` | `academic_enroll_first_year_student`, `academic_enroll_student_in_course_offering` | No auditable localmente | Inscripción transaccional nueva. |
| `src/services/studentCareerEnrollmentAdminCommands.js` | `academic_admin_create/correct/invalidate/get_student_career_enrollment_*` | No auditable localmente | Gestión vínculo carrera-alumno. |
| `src/features/studentCourseEnrollment/studentCourseEnrollmentPreviewService.js` | `academic_get_student_course_enrollment_preview` | No auditable localmente | Preview inscripción cursada. |
| `src/services/teacherCourseRosterPreviewService.js` | `academic_get_teacher_course_roster_preview` | No auditable localmente | Preview padrón docente. |
| `src/services/teacherProfileIdentityService.js` | `academic_admin_get_teacher_profile_link_candidates`, `academic_admin_link_teacher_record_profile` | No auditable localmente | Vinculación perfil docente-legajo. |

## Cross-tenant

Casos auditados localmente:

- Superadmin RPC: aceptan `target_institution_id`, pero primero ejecutan `foundation_require_super_admin()`. No dependen de estado frontend/localStorage.
- Admin institucional RPC (`academic_create_teacher_subject_leave`, `academic_update_teacher_assignment_condition`, confirmaciones admin): verifican `is_member_of_institution(..., owner/admin/editor)` o superadmin.
- Portal alumno: `get_student_portal_workspace_snapshot`, `academic_get_student_subject_teacher_notices`, `academic_get_student_portal_grades` filtran por `auth.uid()`, membresía y/o legajo propio.
- Portal docente: rosters/notas/asistencia/confirmaciones filtran por docente asignado (`teacher_id = auth.uid()`) o por rol institucional.
- Edge Function con `service_role`: `requireStudentPortalMember`, `requireTeacherPortalMember`, `requireInstitutionAdmin` o `requireSuperAdmin` validan caller antes de usar el cliente privilegiado.

Gaps:

- No se puede demostrar cross-tenant localmente para las 12 RPC sin definición SQL local auditable.
- No se validó base remota; si tiene definiciones distintas, esta matriz solo sirve como checklist de comparación.

## Superadmin

Fuente de autoridad:

- `profiles.is_global_admin = true`
- `profiles.is_blocked = false`
- validación con `auth.uid()`/JWT verificado por Supabase, no por `user_metadata`, parámetros RPC, localStorage ni estado del frontend.

Validaciones principales:

- SQL: `is_super_admin()` y `foundation_require_super_admin()`.
- Edge Function: `requireSuperAdmin()` lee `profiles` con service role después de validar `Authorization` con cliente anon.
- Frontend: `AuthContext` no usa `session.user_metadata.account_role` como rol autoritativo.

## SECURITY DEFINER y search_path

Funciones auditadas:

- 47 definiciones `SECURITY DEFINER` versionadas.
- Todas las `SECURITY DEFINER` canónicas relevantes tienen `search_path` explícito, pero muchas usan `public` o `public, pg_temp`.
- Patrón más endurecido confirmado: `handle_new_user()` con `set search_path = ''` y referencias calificadas.

Cambio realizado en 02.4:

- No se modificó SQL.
- Se agregó test estático para impedir reintroducción de `raw_user_meta_data.account_role`, para proteger triggers internos con `REVOKE`, para mapear RPC locales y para mantener documentados los contratos remotos no auditables.

## Reconciliación 02.3

No queda ninguna definición SQL versionada activa o repair SQL que copie:

```sql
raw_user_meta_data ->> 'account_role'
```

Las menciones restantes son documentales/históricas o tests que previenen regresión. La definición canónica es `supabase/schema/01_foundation.sql`; las copias preparatorias en `supabase/security/` están alineadas con el fallback `alumno`.

## Validación futura en staging

Para cada RPC P0/P1 que se corrija en el futuro, ejecutar como mínimo:

- happy path con caller autorizado;
- caller autenticado sin rol;
- caller de institución A intentando operar institución B;
- `anon` cuando no corresponda;
- invocación directa de triggers internos;
- comparación de privilegios reales con `information_schema.routine_privileges` o `pg_proc/proacl`;
- verificación de `search_path` real con `pg_get_functiondef`.

No ejecutar estas pruebas contra producción ni con datos reales.
