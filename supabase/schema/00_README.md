# `supabase/schema/` — schema nuevo de hub-institucional

Convencion nueva, distinta a `examenes/supabase/setup_multi_tenant/`: en vez de una cadena de migraciones numeradas que se van parcheando entre si, cada archivo de esta carpeta es **autocontenido e idempotente** — se puede volver a correr entero sin romper nada (`create table/function if not exists`, `create or replace function`, `drop policy if exists` + `create policy`).

No hay migraciones incrementales que dependan de un orden historico de aplicacion: si en algun momento hace falta cambiar algo de un bloque ya aplicado, se edita ese mismo archivo y se vuelve a correr entero, no se crea un archivo nuevo que lo parchea.

## Proyecto Supabase

`TU_PROJECT_REF` (`https://TU_PROJECT_REF.supabase.co`) -- ver variable local o `.env.local`, no commitear el ref real. Proyecto nuevo y vacio, sin relacion con la base de `examenes` en produccion.

## Orden de aplicacion

Ejecutar en el SQL Editor del dashboard, en este orden:

1. **`01_foundation.sql`** — extensiones, identidad (`profiles`), multi-tenancy (`institutions`, `memberships`), auditoria (`admin_audit_logs`), configuracion (`app_settings`), funciones de login publico (`get_public_app_status`, `list_active_login_institutions`), RPCs base de superadmin (`update_membership_role`, `remove_user_membership`, `set_user_access_status`, `delete_institution_user`), RLS de estas 5 tablas, y el seed del primer superadmin. Antes de correr el bloque de seed (al final del archivo), crear el usuario en **Authentication > Users** del dashboard con el email que figura en `target_email` dentro del archivo.

2. **`02_academic_relational_schema.sql`** — carreras, planes, materias, correlatividades, equivalencias, docentes, horarios, alumnos y trayectoria academica, todos aislados por `institution_id`. Incluye compatibilidad de padrones con la UI actual en `teacher_records` y `student_records` (`workspace_key`, `profile_id`, `full_name`, `dni`, `raw_payload`, `updated_at`, claves de upsert, triggers de sincronizacion y policies de escritura para `owner`/`admin`/`editor`).

3. **`03_workspace_data.sql`** — `workspace_snapshots`: el snapshot unico por `institution_id` + `workspace_key` que usa `src/services/workspaceSnapshot.js` para guardar/leer todo el estado operativo del generador de mesas (docentes, alumnos, horarios, cronograma, notas). Lectura para cualquier miembro de la institucion; escritura (insert/update, nunca delete desde el cliente) restringida a roles `owner`/`admin`/`editor`. Este bloque **no** incluye el resto de la capa operativa legacy (`workspace_source_files`, `subject_enrollments`, `exam_enrollments`, `student_grades`, asistencia, tribunal de mesas, `legacy_*`) -- ver el analisis de compatibilidad de shapes antes de portar esas tablas, algunas colisionan de nombre con tablas ya creadas en el bloque 2 (`student_records`, `teacher_records`, `subject_teacher_assignments` vs `teacher_subject_assignments`) con columnas incompatibles.

   **Decision posterior**: para el motor de mesas se descarto portar el resto de la capa legacy detras de `workspace_snapshots` (dual-write, hybrid-read, etc. — ese mecanismo protege produccion viva en `examenes`, acá no aplica todavia). En su lugar, el motor lee directo el schema relacional del bloque 2 -- ver bloque 4.

4. **`04_teacher_exam_date_exclusions.sql`** — `teacher_exam_date_exclusions`: fechas puntuales en que un docente no puede tomar examen aunque sea su dia habitual de clase (licencia, ausencia puntual). Complementa a `course_schedules` (bloque 2), que ya resuelve los dias habituales del docente. Usado por `src/utils/examEngine/relationalSource/`, el lector que arma la entrada del motor de mesas (`docentes`, `horariosDocentes`, `docenteMateria`, `planesEstudio`, `correlatividades`, `alumnos`) directamente desde el schema relacional del bloque 2, sin pasar por `workspace_snapshots`. Mismas politicas de lectura/escritura que el bloque 3.

5. **`05_workspace_operational_compat.sql`** — datos operativos que la UI ya sincroniza al guardar un workspace: `workspace_source_files` + bucket privado `workspace-source-files`, `teacher_availability_records`, `teacher_workload_records`, `legacy_subjects_catalog`, `legacy_subject_prerequisites` y `legacy_exam_sessions`. Mantiene el contrato actual de `src/services/sourceFiles.js`, `src/services/teacherAcademicRecords.js` y los sync `legacy_*` llamados desde `src/services/workspaceSnapshot.js`; `legacy_exam_sessions.exam_date` queda textual porque la UI puede enviar timestamps completos.

Proximos bloques (todavia no escritos, quedan para completar la operacion academica):

- Persistencia del cronograma generado por el motor de mesas (tablas de "mesas"/tribunal, todavia no existen).
- Resto de datos operativos no cubiertos por el bloque 5: `subject_enrollments`, `exam_enrollments`, `student_grades`, asistencia, actas. Requiere antes decidir si se reconcilian con tablas ya existentes del bloque 2 (`student_academic_statuses` vs `student_grades`) o se portan aparte.

## Por que existe esta carpeta

`examenes` acumulo 24 migraciones parcheadas en `supabase/setup_multi_tenant/` que van quedando huerfanas o rotas con el tiempo. `hub-institucional` es una base de datos nueva, a medida, pensada para el mismo comportamiento de la app (mismas tablas/RPCs que espera `src/services/`) pero sin arrastrar esa historia de parches.
