# Punto 1 — Referencia validada al catálogo (local)

Fecha: 2026-10-21. Ejecutó: Claude. Entorno: base descartable sobre `supabase_db_codex-baseline-local-7725bdda`, con los 9 archivos del baseline, el fixture A/B y, como en Prod, el gateway de Storage (`source_file_storage_gateway.sql`) y su registro por institución. Staging y Producción: **NONE** (en Prod solo se hicieron lecturas, ver abajo).

## Decisión

- El texto sigue siendo la identidad canónica: `subject_id` es el código y `program_id` la carrera. Lo usan el RLS, las RPC, el front y el espejo de elegibilidad de mesas, y no se toca.
- Se agrega `study_plan_subject_id`, con FK a `study_plan_subjects`, en `subject_enrollments`, `student_grades`, `subject_class_sessions` y `subject_teacher_assignments`.
  - Asistencia no lleva la columna: cuelga de la clase y de la cursada.
  - Mesas tampoco: `exam_enrollments` ya llega al plan por `exam_table_subjects`.
- **No se agregó un archivo 09.** El README del schema pide editar el bloque y re-correrlo entero, no parchearlo con otro archivo. El cambio va al final de `07_academic_operations.sql`, que corre después del 06.

## Cómo se completa

- Ningún escritor manda la referencia: un trigger (`set_plan_subject_reference`) la recalcula desde el texto en cada alta y en cada cambio de materia, carrera o legajo. Si alguien la envía a mano, se pisa, así que nunca puede quedar en desacuerdo con el texto ni apuntar al catálogo de otra institución.
- **Resolución** (`academic_resolve_plan_subject_id`). Usa el mismo criterio que la carga masiva: carrera por nombre o código externo, materia por código, sin distinguir mayúsculas ni espacios en los extremos. Si el código está en más de un plan de la carrera (plan conviviente), decide en este orden:
  1. el plan activo del alumno, si la fila tiene legajo;
  2. el único plan que la tiene;
  3. el único plan activo que la tiene;
  4. si no, **NULL**, porque es ambiguo.
- **Fase 1 (esto):** si la materia no está en el catálogo o es ambigua, la referencia queda NULL y la escritura **no se bloquea**.
- **Fase 2 (a decidir):** exigir la referencia (NOT NULL) cuando todas las instituciones tengan su catálogo publicado.
- **FK `NO ACTION`:** no se puede borrar del catálogo una materia que ya tiene cursadas, notas, clases o docentes. El borrado en cascada de una institución entera y la purga de I3 siguen funcionando.
- **Backfill al final del 07.**
  - Apaga los triggers de usuario de esas cuatro tablas solo dentro de un bloque atómico, para no correr el de `updated_at` ni el del gateway. Las FK siguen validando.
  - Solo toca filas cuya referencia cambia.
  - Re-correr el 07 completa las referencias de materias que se publicaron después.

## Hallazgo previo, corregido en el mismo cambio

Los cinco `update` de normalización del principio del 07 no tenían `where`. Por eso:

- Cada re-ejecución reescribía **todas** las filas de cursadas, notas, clases, asistencia y deuda.
- El trigger les ponía `updated_at` igual a la hora de la corrida, **en el orden en que se leían**.
- Como "la última condición cargada" (inscripción a mesas, correlativas) se ordena por `updated_at`, re-correr el 07 podía cambiarla.

**Prod lo confirma:** todas las filas tienen `updated_at = 2026-10-20 13:22:32`, el momento en que se re-corrió el 07. Las 3 notas quedaron en el mismo orden relativo (pending, pending, regular), así que no cambió ninguna condición; además son datos de prueba (UAT).

Ahora cada `update` solo toca filas que necesitan normalización. El harness tiene un **control negativo**: con el 07 anterior falla el chequeo de `updated_at`; con el corregido pasa.

## Resultado

`node scripts/validateCatalogReferencesLocal.mjs` → **PASS**, 27/27 chequeos, run `9fc282516a54b2a7`, cleanup 0.

| Grupo | Chequeos |
|---|---|
| Contrato | Columna, FK y trigger en las 4 tablas. El resolver es `security definer` con `search_path=""` y sin EXECUTE para la API; el alumno que lo llama recibe 42501. El trigger tampoco tiene EXECUTE para la API |
| Escritores reales | Cursada desde el portal alumno, clase y nota desde el portal docente, asignación por insert directo, carga masiva (carrera por código y materia en minúscula): todas con referencia |
| Valor a mano | Se recalcula desde el texto: una materia inexistente queda NULL aunque se mande una referencia, y no se puede apuntar al catálogo de otra institución |
| Fuera del catálogo | No bloquea y queda NULL |
| Ambigüedad | Dos planes activos sin alumno: NULL. Con alumno: su plan. Con un solo plan activo: ese |
| Catálogo | No se borra una materia en uso (23503, como dueño de la base, sin RLS); la materia sigue; control positivo del borrado |
| Backfill | Una materia publicada tarde queda NULL hasta re-correr el 07 y después se completa. Re-correr el 07 **no cambia `updated_at` ni las revisiones del gateway**; los triggers quedan encendidos; una tercera corrida no cambia nada; la clase ambigua sigue NULL |
| Operación normal | Corregir una nota sigue andando y conserva la referencia |

**Control negativo** (07 anterior + este bloque): FAIL en "el backfill no toca updated_at ni las revisiones del gateway" y en "tercera corrida sin cambios", como se esperaba.

**Regresión:** siguen en **PASS** los 14 harness locales que aplican el 07:

- catálogo y publicación del catálogo;
- condición académica (check y escritura);
- cargas masivas;
- acta de examen y paridad de elegibilidad de mesas;
- publicación de mesas;
- suspensión y purga de institución (con la FK nueva);
- búsqueda de perfiles;
- importación de historia;
- modelo de asignación docente;
- alcance de lectura por tenant.

`npm run check`: PASS, 359 archivos y 2743 tests.

## Prod (solo lectura, 21/10)

- 1 institución, 1 carrera, 1 plan, 3 materias en el plan. Ningún código está en más de un plan ni en más de una carrera.
- `subject_reference_orphans_diagnostic.sql`: 11 filas en 5 tablas, 0 huérfanas. Después de aplicar, las 10 filas de las 4 tablas deberían quedar con referencia.
- Dueño de las 4 tablas: `postgres`, el mismo rol que usa el SQL Editor, así que `alter table ... disable trigger user` funciona sin superusuario.

## Para aplicar en Prod (después de la auditoría de Codex)

1. Antes, guardar esta foto (solo lectura):
   ```sql
   select 'subject_enrollments' t, count(*), max(updated_at) from public.subject_enrollments
   union all select 'student_grades', count(*), max(updated_at) from public.student_grades
   union all select 'subject_class_sessions', count(*), max(updated_at) from public.subject_class_sessions
   union all select 'subject_teacher_assignments', count(*), max(updated_at) from public.subject_teacher_assignments;
   ```
2. En el SQL Editor, correr `supabase/schema/07_academic_operations.sql` completo, en un momento sin uso. El backfill toma un lock exclusivo breve de las 4 tablas.
3. Repetir la foto del paso 1: `max(updated_at)` tiene que dar **igual**.
4. Correr la verificación que está al final del 07: `con_referencia` tiene que ser igual a `filas` en las 4 tablas.
