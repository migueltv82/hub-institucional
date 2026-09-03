# Prompt para continuar hub-institucional con Codex — Fase 3

Copiar y pegar todo el bloque de abajo. Requiere que la Fase 2 (`docs/codex-continuar-fase-2.md`, archivos `02_academic_catalog.sql` a `05_teacher_assignments.sql`) ya este aplicada.

---

Sigo construyendo `hub-institucional` (base Postgres/Supabase nueva y consolidada, reemplazo de las migraciones parcheadas de `../examenes`). **Las reglas generales, convenciones de archivo, y restricciones (sin CLI, sin Docker, alcance "solo limpiar/consolidar") ya estan en `hub-institucional/docs/codex-continuar-fase-2.md` — leelo primero, no las repito aca.**

Fase 1 (superadmin/institucion/admin) y Fase 2 (padron, workspace/storage, inscripciones/notas, asignaciones docentes) ya estan aplicadas y validadas.

## Etapas de Fase 3 (cortas, una por vez, confirmar con el usuario antes de seguir a la siguiente)

1. **`06_identity_hardening.sql`**: constraints `not valid` de `student_record_id` en `subject_enrollments`, `exam_enrollments`, `student_grades`, `subject_attendance_records` hacia `student_records(id, institution_id)`, mas los indices `<tabla>_canonical_student_record_idx` y la funcion `academic_identity_diagnostics(institution_id, workspace_key)`. Fuente: `examenes/supabase/migrations/20260828054606_normalize_academic_student_record_identity.sql` — **esta migracion nunca se porto a `setup_multi_tenant/`, hay que leerla directo de `migrations/`.**

2. **`07_teacher_student_removal_reset.sql`**: funciones `teacher_remove_student_subject_records(...)` (usar la version 3, fuzzy/legacy-aware — comparar los 3 archivos `examenes/supabase/migrations/2026082303*_teacher_remove_student_subject_records*.sql` y quedarse con la logica de la ultima) y `teacher_reset_student_subject_academic_records(...)` (esta ya esta consolidada en `examenes/supabase/setup_multi_tenant/22_teacher_student_subject_academic_reset.sql`, copiarla de ahi). Ambas son `security definer`, revocadas de `authenticated`, solo las llama la Edge Function `admin-users` con service role.

3. **`08_student_financial_status.sql`**: tabla `student_financial_status` (institution_id, workspace_key, student_record_id, adeuda_cuota, note, updated_at) + RLS. Chica y aislada. Fuente: buscar `student_financial_status` en `examenes/supabase/setup_multi_tenant/`. La usa `examenes/src/services/studentFinancialStatus.js` y el espejo de elegibilidad `examenes/src/modules/alumnos/lib/examEligibility.js`.

4. **Antes de escribir nada mas — decidir con el usuario, no asumir**: `legacy_subjects_catalog`, `legacy_subject_prerequisites`, `legacy_exam_sessions` son puentes de transicion legacy (correlatividades y calendario de mesas en formato viejo). Preguntarle a Miguel si estas tres tablas se migran tal cual (mismo comportamiento) o si directamente no hacen falta en la base nueva porque el flujo de carga de planillas las va a reemplazar. Si dice que si, van en `09_legacy_catalog.sql` siguiendo el mismo patron.

## Verificacion de cada etapa

Misma mecanica que en Fase 2: darle al usuario el SQL para pegar en el SQL Editor, y una consulta corta de confirmacion (conteo de filas o `pg_proc`/`pg_constraint` segun corresponda). No asumir que se aplico sin que el usuario pegue el resultado.

## Fuera de alcance de esta fase (dejarlo para una Fase 4 aparte, no arrancarlo ahora)

El subsistema transaccional mas nuevo de inscripcion a carrera/cursada (`student_career_enrollments`, `study_plan_subject_prerequisites`, `domain_command_requests`, `domain_audit_events`, `course_offerings`, `teaching_assignments`, `course_enrollments`, `careers`, `study_plans`, `academic_years`, y las RPC `academic_enroll_first_year_student`, `academic_enroll_student_in_course_offering`, `academic_admin_create_student_career_enrollment` y sus variantes) es un bloque grande y separado — mencionarlo pero no implementarlo en esta fase, para mantener las etapas cortas.
