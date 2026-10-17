# RB.2 — Reparación puntual de filas de `public` desde el archive del §3.1

Fecha: 2026-10-17. Ejecutado por Claude mientras Codex no estaba disponible; la auditoría (completa) queda para Codex. Todo local: Staging y Production NONE.

## Resultado: **PASS**. El procedimiento es viable como `postgres`.

| Prueba | Run | Resultado |
| --- | --- | --- |
| `node scripts/validatePublicRepairLocal.mjs` | `5e8d020abe2e846f` | **PASS**. Reparación en 101 ms; cleanup 0 (bases, contenedores, archivos) |
| Mismo harness con `--control`: carga el archive pero omite el upsert | `da0770965cecd5c0` | **FAIL**, como se esperaba: las 3 tablas de A quedan sin restaurar |
| Rol del operador | — | `postgres`: `rolsuper = false`, `rolbypassrls = true`, igual que en un proyecto Supabase |

Montaje del ensayo:
- stack local (`localSupabaseStack.mjs`) con 4 usuarios GoTrue reales y 2 instituciones;
- 3 alumnos con legajo, 6 cursadas y 6 notas;
- archive con los flags exactos del §3.1 (`pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=auth --schema=storage`), tomado como `postgres`.

## Daño simulado y reparación

Solo en la institución A:
- se borraron 2 notas (`student_grades`);
- una cursada pasó a `dropped` (`subject_enrollments`);
- se pisó el `display_name` de un perfil (`profiles`).

| Tabla (A) | Antes | Con daño | Después |
| --- | --- | --- | --- |
| `student_grades` | 4 · `011d72e3…` | 2 · `df8ac544…` | 4 · `011d72e3…` |
| `subject_enrollments` | 4 · `2a4d229e…` | 4 · `7cde1766…` | 4 · `2a4d229e…` |
| `profiles` | 3 · `741aceb2…` | 3 · `12ac80ae…` | 3 · `741aceb2…` |

Hash = md5 de las filas en JSON. En las dos tablas académicas se excluye `updated_at`, que lo reescribe el trigger `touch_academic_operations_updated_at`.

Verificaciones posteriores:
- la institución B quedó idéntica, comparada con `updated_at` incluido;
- `auth.users` y `auth.identities` sin cambios;
- 40 tablas de `public` con RLS antes y después.

Procedimiento ensayado, que es el que documenta el runbook (R4b) y queda versionado en `supabase/security/public_repair_template.sql`. Un test exige que el template sea idéntico a lo que corre el harness.

1. `pg_restore --data-only --schema=public --table=<t> --file=repair_<t>.sql <archive>`.
2. Reescribir `COPY public.<t>` a `COPY pg_temp.repair_<t>`.
3. `psql` como `postgres`, una sola transacción:
   - `create temp table repair_<t> (like public.<t>) on commit drop`;
   - `\i repair_<t>.sql`;
   - `insert … select … where <filtro de institución> on conflict (pk) do update set <todas las columnas> where row(t.*) is distinct from row(excluded.*)`.

No desactiva triggers, no toca `auth.*` y no pasa por `handle_new_user`.

## Límites (copiados en el runbook)

- No borra filas creadas después del backup.
- `updated_at` queda con la hora de la reparación en las tablas con trigger de touch.
- Un choque con un unique parcial (la misma clave natural recargada después del backup) aborta la transacción entera, sin cambios. Se resuelve a mano.
- `postgres` tiene `BYPASSRLS`: el filtro de institución va en el SQL.
- No aplica a `auth.*` ni a los bytes de Storage.
- Fixture chico; no se midió con volumen real ni con escritores concurrentes.
