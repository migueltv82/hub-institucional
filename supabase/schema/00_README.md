# `supabase/schema/` — schema nuevo de hub-institucional

Convencion nueva, distinta a `examenes/supabase/setup_multi_tenant/`: en vez de una cadena de migraciones numeradas que se van parcheando entre si, cada archivo de esta carpeta es **autocontenido e idempotente** — se puede volver a correr entero sin romper nada (`create table/function if not exists`, `create or replace function`, `drop policy if exists` + `create policy`).

No hay migraciones incrementales que dependan de un orden historico de aplicacion: si en algun momento hace falta cambiar algo de un bloque ya aplicado, se edita ese mismo archivo y se vuelve a correr entero, no se crea un archivo nuevo que lo parchea.

## Proyecto Supabase

`qwrwwansdblcixkjmibx` (`https://qwrwwansdblcixkjmibx.supabase.co`). Proyecto nuevo y vacio, sin relacion con la base de `examenes` en produccion.

## Orden de aplicacion

Ejecutar en el SQL Editor del dashboard, en este orden:

1. **`01_foundation.sql`** — extensiones, identidad (`profiles`), multi-tenancy (`institutions`, `memberships`), auditoria (`admin_audit_logs`), configuracion (`app_settings`), funciones de login publico (`get_public_app_status`, `list_active_login_institutions`), RLS de estas 5 tablas, y el seed del primer superadmin. Antes de correr el bloque de seed (al final del archivo), crear el usuario en **Authentication > Users** del dashboard con el email que figura en `target_email` dentro del archivo.

Proximos bloques (todavia no escritos, quedan para cuando se encare la carga de planillas de docentes/alumnos):

- Catalogo academico y datos operativos: `student_records`, `teacher_records`, `workspace_snapshots`, `workspace_source_files`, `subject_enrollments`, `exam_enrollments`, `student_grades`, etc. — lo que hoy vive disperso en `examenes/supabase/setup_multi_tenant/01` en adelante.
- Storage: bucket `workspace-source-files` + `storage_object_institution_id()` + policies de storage, necesario recien cuando exista carga de archivos.

## Por que existe esta carpeta

`examenes` acumulo 24 migraciones parcheadas en `supabase/setup_multi_tenant/` que van quedando huerfanas o rotas con el tiempo. `hub-institucional` es una base de datos nueva, a medida, pensada para el mismo comportamiento de la app (mismas tablas/RPCs que espera `src/services/`) pero sin arrastrar esa historia de parches.
