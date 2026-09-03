# Prompt para continuar hub-institucional con Codex

Copiar y pegar todo el bloque de abajo como prompt inicial.

---

Estoy construyendo `hub-institucional`, una base de datos Postgres/Supabase nueva y consolidada para reemplazar las migraciones parcheadas de un proyecto hermano llamado `examenes` (carpeta al mismo nivel: `../examenes`). Es una copia de codigo de `examenes` (React 19 + Vite + JS puro, sin TypeScript — no migrar a TS) a la que le saque todo el SQL viejo para armar un schema limpio desde cero. Trabajo en Windows, PowerShell (usar `npm.cmd`, no `npm`).

## Estado actual (ya hecho, no repetir)

- `hub-institucional/supabase/schema/01_foundation.sql` ya esta escrito, aplicado en el proyecto Supabase real, y validado de punta a punta: extensiones, `institutions`, `profiles`, `memberships`, `admin_audit_logs`, `app_settings`, RLS de esas 5 tablas, trigger `handle_new_user`, funciones `is_super_admin()`/`is_member_of_institution()`, `get_public_app_status()`/`list_active_login_institutions()`, y el seed del primer superadmin.
- Login de superadmin, creacion de institucion, creacion de admin institucional y login de ese admin: los cuatro confirmados funcionando en real.
- `hub-institucional/.env` ya tiene `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` reales cargados. No tocar ni pedir de nuevo.
- La Edge Function `admin-users` (`hub-institucional/supabase/functions/admin-users/index.ts`) ya esta desplegada manualmente via el dashboard de Supabase (Edge Functions → Deploy → Via Editor, con "Enforce JWT verification" desactivado) y su secret `ADMIN_USERS_ALLOWED_ORIGINS` incluye el puerto real del preview.

## Reglas que hay que respetar

- **Alcance: solo limpiar/consolidar, mismo comportamiento.** No inventar ni cambiar reglas de negocio. La fuente de verdad de que necesita la app es el codigo real en `examenes/src/services/` (y `examenes/supabase/functions/admin-users/index.ts`), no lo que "parezca lógico". Si el codigo espera una tabla/columna/RPC con determinado nombre, el schema nuevo tiene que tener exactamente ese nombre.
- **No reescribir el SQL desde cero: adaptarlo del que ya funciona en produccion**, en `examenes/supabase/setup_multi_tenant/` (archivos numerados 01 en adelante, hay algunos numeros duplicados de ramas distintas — leer todos, en orden de timestamp del archivo si el numero se repite) y en `examenes/supabase/security/` (para inferir que politicas RLS espera cada tabla, mirando que validan los tests, especialmente `rls_negative_tests.sql`).
- **Convencion de archivos**: cada archivo nuevo en `hub-institucional/supabase/schema/NN_nombre.sql` tiene que ser autocontenido e idempotente (`create table/function if not exists`, `create or replace function`, `drop policy if exists` + `create policy`). Nunca crear un archivo que sea "parche" de otro archivo ya escrito — si hay que cambiar algo de un bloque anterior, se edita ese mismo archivo.
- **No hay acceso al proyecto Supabase por CLI** (el `supabase login` de esta maquina esta atado a otra cuenta, da 403 contra este proyecto). Todo el SQL se aplica a mano por el usuario en el SQL Editor del dashboard, y los deploys de Edge Functions via "Via Editor" en el dashboard. No intentar `supabase db push` ni `supabase functions deploy` contra este proyecto.
- **No hay Docker instalado** en esta maquina — no proponerlo, se trabaja directo contra el proyecto real (esta vacio, sin datos en riesgo).
- Formato de codigo: todo en español, sin tildes en identificadores. JS puro, sin TypeScript en el frontend (la Edge Function si es TypeScript/Deno, eso no cambia).
- Regla critica de identidad de materia/carrera (mirar `examenes/CLAUDE.md` seccion "Formato canonico de materia y carrera"): `canonical_subject_id`/`canonical_program_id` son la verdad, `portal_subject_id` es solo visual. No comparar nunca por id crudo.

## Etapas (ejecutar en orden, confirmando con el usuario antes de pasar a la siguiente)

1. **`02_academic_catalog.sql`**: `student_records` y `teacher_records` (padron de alumnos/docentes) + sus indices + RLS (miembro de la institucion lee, owner/admin/editor escribe, superadmin todo). Adaptar de `examenes/supabase/setup_multi_tenant/00_base_schema.sql` (ahi estan las dos tablas base) y revisar si migraciones posteriores (01-19) les agregaron columnas.

2. **`03_workspace_data.sql`**: `workspace_snapshots`, `workspace_source_files` + bucket de Storage `workspace-source-files` + politicas RLS de storage (`storage_object_institution_id()` + las 2 policies de objects). Esto es lo que hoy tira "Could not find the table public.workspace_snapshots" en el frontend — sin esto no se puede cargar ninguna planilla.

3. **`04_enrollments_and_grades.sql`**: `subject_enrollments`, `exam_enrollments`, `student_grades`, `subject_class_sessions`, `subject_attendance_records` + RLS + las RPC de escritura controlada: `academic_teacher_create_class_session`, `academic_teacher_upsert_attendance_records`, `academic_teacher_upsert_student_grade` (buscarlas en `examenes/supabase/setup_multi_tenant/20_teacher_gradebook_secure_commands.sql` o el archivo que corresponda). Recordar: `authenticated` no debe tener insert/update directo en estas tablas, solo select — la escritura pasa por las RPC.

4. **`05_teacher_assignments.sql`**: `subject_teacher_assignments`, `exam_teacher_assignments`, `teacher_availability_records`, `teacher_workload_records` + RPCs relacionadas (`academic_resolve_member_profile_by_email`, `academic_create_teacher_subject_leave`, `academic_update_teacher_assignment_condition`, `academic_get_teacher_subject_rosters`, `academic_teacher_object_exam_assignment`/`academic_teacher_confirm_exam_assignment`, `academic_admin_reset_exam_process`).

5. Despues de cada archivo: decirle al usuario exactamente que pegar en el SQL Editor, y darle una consulta corta de verificacion (contar filas de la tabla nueva, o `select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (...)` para confirmar que las funciones quedaron creadas). No asumir que se aplico bien sin que el usuario confirme el resultado de esa consulta.

6. Una vez esten las etapas 1-4 aplicadas: probar el circuito funcional completo (ver `examenes/CLAUDE.md`, seccion "Prueba funcional de punta a punta") — cargar una planilla de ejemplo, ver que el docente vea a sus alumnos, cargar nota, confirmar que el alumno la vea.

## Cosas que ya nos pasaron y conviene tener presente

- El panel a veces muestra "No se pudo completar la operacion en admin-users... corte de red transitorio" aunque la operacion **si se ejecuto bien** del lado del servidor. Antes de asumir que algo esta roto, revisar `select * from public.admin_audit_logs order by created_at desc limit 10;` — si la fila dice `status: success`, no hay que reintentar ni tocar nada.
- Si hay que crear un usuario para una institucion que **ya existe**, usar la accion `create_or_assign_institution_user`, no volver a correr `create_tenant_with_admin` (esa crea una institucion nueva de vuelta).
