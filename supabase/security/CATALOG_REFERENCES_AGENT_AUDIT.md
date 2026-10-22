# AUD.17 · Punto 1 — Referencia validada a `study_plan_subjects` (auditoría independiente)

- Fecha: 2026-10-21
- Auditor: agente Claude, primera pasada; no reemplaza el gate de Codex.
- Commit auditado: `972613c` (rama `release/v1`; HEAD al auditar: `5bafedd`, que otro agente audita aparte).
- Alcance: bloque "Punto 1 (21/10)" al final de `supabase/schema/07_academic_operations.sql` (líneas ~2494-2665) y los `where` nuevos de los cinco `update` de normalización (líneas ~174-265). Harness `scripts/validateCatalogReferencesLocal.mjs`.
- Entorno: solo local. Contenedor `supabase_db_codex-baseline-local-7725bdda` (Postgres 17), bases descartables `gotrue_harness_*` (borradas al terminar, igual que los roles de prueba). Nada de Staging, Prod ni red externa.

## Veredicto: PASS WITH WARNINGS

No encontré P0 ni P1. La FK, el trigger, el resolver, el backfill y los `where` hacen lo que dicen en los caminos reales que probé, también como rol **no superusuario** dueño de las tablas. Hay un P2 (el `where` de normalización quedó más angosto que el `update` anterior) y varios P3 (la referencia se desactualiza en caminos que no tocan las columnas vigiladas, y se reordena al re-correr el 07). Ninguno corrompe datos ni bloquea escrituras; el P2 se corrige con tres líneas.

## Hallazgos

### P2-1 — Los `where` de normalización no cubren valores con espacios en los extremos que el `update` anterior sí recortaba
- Archivo: `supabase/schema/07_academic_operations.sql:188-195`, `:211-224`, `:232-238`, `:246-251`, `:259-263`.
- Qué pasa: el `set` sigue haciendo `coalesce(nullif(btrim(col), ''), 'default')`, que además de rellenar vacíos **recorta** `' final '` a `'final'`. El `where` nuevo solo detecta `null` o `btrim(col) = ''`, así que una fila con el valor con espacios ya no se toca. Afecta a las columnas texto con default: `workspace_key`, `status` (cursadas), `grade_type`, `grade_scale`, `academic_status` (notas), `status` (asistencia).
- Alcance real, por qué no es P1: `status` y `academic_status` tienen `check` con lista cerrada, así que un valor con espacios ya no puede existir. `workspace_key` con espacios: el gateway de Storage rechaza el cambio (`SOURCE_FILE_WORKSPACE_MOVE_DENIED`), de modo que el `update` anterior ya fallaba ahí. Queda realmente sin cubrir `grade_type` y `grade_scale` (sin `check`).
- Reproducción (base con el 07 anterior, fila `student_grades` con `grade_type = ' final '` y `workspace_key = 'main'`): ejecutar solo el `update public.student_grades` del 07 nuevo deja `[ final ]`; ejecutar el del 07 anterior (`git show 972613c^:...`) lo deja `[final]`.
- Corrección propuesta: agregar al `where` las comparaciones `or grade_type <> btrim(grade_type)`, `or grade_scale <> btrim(grade_scale)` (y, por simetría, `workspace_key`, `status`, `academic_status` en las tablas donde aplica). Sigue siendo idempotente: después de normalizar la condición es falsa y no se reescribe `updated_at`.
- Verificado a favor: comparé columna por columna las cinco sentencias. Para `null`, vacío, `program_id`, `lock_version < 1`, `attempt_number < 1`, `metadata`, `created_at`, `updated_at` y `enrolled_at`, el `where` nuevo cubre exactamente lo que el anterior cambiaba. La única diferencia es el recorte.

### P3-1 — "Recalcula siempre desde el texto" no se cumple en `INSERT ... ON CONFLICT DO UPDATE` de clases
- Archivo: `07_academic_operations.sql:2686` (lista `update of`) vs. `academic_teacher_create_class_session` (`:871-873`, `do update set topic = excluded.topic`).
- Qué pasa: el trigger de UPDATE solo se dispara si la columna está en el `SET`. En el camino de conflicto de las clases el `SET` es solo `topic`, así que el trigger no corre y la referencia queda como estaba (el `BEFORE INSERT` sí corrió, pero su resultado se descarta). En cursadas y notas el `SET` incluye `student_record_id`, y ahí sí se dispara (probado).
- Reproducción: clase con referencia `NULL` (materia aún no publicada), publicar la materia, volver a llamar `academic_teacher_create_class_session` el mismo día → `study_plan_subject_id` sigue `NULL` aunque ya se podía resolver.
- Impacto: bajo en Fase 1 (la referencia es informativa y se arregla re-corriendo el 07). Importa si en Fase 2 se la pone `NOT NULL`.
- Corrección propuesta: en esas RPC agregar `study_plan_subject_id = excluded.study_plan_subject_id` al `SET` (el insert propuesto ya trae el valor recalculado), o que el trigger sea `before insert or update` sin lista de columnas (cuesta ~2 ms por fila, ver P3-5).

### P3-2 — La referencia no se actualiza si cambia el plan del alumno o el catálogo, y al re-correr el 07 puede pasar de válida a NULL
- Archivo: `07_academic_operations.sql:2574-2625` (resolver) y `:2700-2718` (backfill).
- Reproducción: nota con referencia al plan 1; se publica un segundo plan activo con la misma materia y se pasa al alumno al plan 2: la nota **sigue** apuntando al plan 1 (el trigger no corre). Al re-correr el 07 el backfill (que recalcula todas las filas, no solo las NULL) la mueve al plan 2. Una clase sin alumno que tenía referencia válida cuando había un solo plan pasa a `NULL` cuando aparece el segundo plan activo.
- Impacto: la referencia es una función del estado del catálogo y del plan vigente del alumno en el momento de correr, no un dato histórico. Una nota rendida bajo el plan viejo se reasigna al plan nuevo. Para la Fase 1 es aceptable; para la Fase 2 hay que decidir si es lo que se quiere.
- Corrección propuesta: documentar en el 07 y en el resultado que el valor es "mejor resolución actual" y no histórico; si se quiere histórico, el backfill debería completar solo `NULL` y no pisar un valor que sigue siendo válido (`where study_plan_subject_id is null and resolver is not null`, más un chequeo aparte de referencias inválidas).

### P3-3 — Carrera vacía actúa como comodín y el resolver acepta dos carreras
- Archivo: `07_academic_operations.sql:2596-2600`.
- (a) `program_id = ''` (es el default de las tres tablas) coincide con cualquier carrera cuyo `external_code` sea `''` (la columna es `not null` pero admite vacío). Probado: `resolve(inst, '', 'S-D')` y `resolve(inst, NULL, 'S-D')` devuelven la materia de la carrera sin código. Es el mismo criterio que `academic_resolve_catalog_subject`, pero contradice la regla de la casa de no tratar una carrera vacía como comodín.
- (b) `academic_resolve_catalog_subject` devuelve `CARRERA_AMBIGUA` si más de una carrera coincide (nombre de una = código de otra). El resolver nuevo no cuenta carreras: si los planes candidatos de ambas carreras son uno solo activo, elige uno. Probado con dos carreras (`Alfa`/`BETA` y `BETA`/`GAMMA`): con ambos planes activos devuelve `NULL` (por la regla de ambigüedad de planes), pero con uno cerrado resolvería a la carrera "incorrecta" mientras el catálogo diría ambigua.
- Corrección propuesta: cortar con `NULL` si `btrim(coalesce(p_program,'')) = ''`, y agregar a `candidates` el conteo de `career.id` distintos (si >1, `NULL`).

### P3-4 — Backfill: re-habilita triggers que estuvieran apagados a propósito y evalúa el resolver dos veces por fila
- Archivo: `07_academic_operations.sql:2708-2716`.
- `enable trigger user` deja todos los triggers de usuario en estado `O`; si un operador tenía alguno deshabilitado (o en `R`/`A`), el 07 lo reactiva. En Prod no hay nada de eso hoy.
- El `update ... where col is distinct from resolver(...)` llama al resolver en el `where` y en el `set`. Medí ~1,75 ms por fila solo en el `where` (catálogo de ~4.800 materias-plan, 60 planes); para 100.000 filas serían minutos con `SHARE ROW EXCLUSIVE` sobre cada tabla, hasta el fin de la transacción. Con las ~10 filas de Prod hoy es irrelevante; relevante si se escala antes de re-correr.
- Corrección propuesta (opcional): `update ... from (select id, resolver(...) as r from t) x where t.id = x.id and t.col is distinct from x.r` para una sola evaluación.

### P3-5 — Costo del trigger en lotes de 1000
- Medí `insert` de 1000 clases: 2,13 s con el trigger y 0,11 s sin él (catálogo de 4.806 materias-plan, 20 carreras, 60 planes). ~2 ms por fila, sin índices sobre `lower(btrim(careers.name))`. La FK solo toma `KEY SHARE` sobre la fila del catálogo, compatible con ediciones normales del catálogo; no vi riesgo de bloqueos nuevos entre escritores. Aceptable para el piloto; si el catálogo crece, indexar o resolver por lote.
- Caso límite, no probado de forma concurrente: si alguien borra la materia del catálogo justo entre el resolver y el chequeo de FK, la escritura falla con `23503`. Muy improbable y el borrado de materias en uso ya está bloqueado.

## Lo que verifiqué y está bien

1. **Resolver (`:2574-2625`)**. `security definer`, `search_path=""`, `stable`; `anon`, `authenticated` y `public` sin EXECUTE (también el trigger). Todas las consultas filtran por `p_institution_id` y las uniones usan `institution_id` en cada paso; el cruce con el catálogo de la institución B devuelve `NULL`. Orden de ambigüedad probado: plan activo del alumno, único plan, único plan activo, `NULL`. Criterio de carrera (nombre o código, `lower(btrim)`) y materia (código) iguales a `academic_resolve_catalog_subject`, salvo P3-3.
2. **Trigger**. Se dispara en INSERT y en UPDATE de `institution_id, subject_id, program_id, student_record_id, study_plan_subject_id`: un valor enviado a mano o apuntando a otra institución se pisa (probado con UPDATE directo como admin). Se dispara en los caminos reales: portal alumno (cursada), nota docente, asignación directa, carga masiva de titularidades y la fila de historia/acta (insert). Orden de triggers correcto: `set_plan_subject_reference` < `source_file_workspace_mutation` < `touch_*`. Excepción: P3-1.
3. **FK `NO ACTION`**. `delete from study_plan_subjects` de una materia con notas falla con `23503` (probado). **Purga de institución**: ejecuté el SQL de `scripts/buildPurgeInstitutionSql.mjs --ejecutar` sobre una base con filas que tenían `study_plan_subject_id` (2 notas) y la institución, sus tablas y el catálogo se borraron sin error, con el gateway de Storage instalado. Ojo: el harness `validatePurgeInstitutionLocal.mjs` (PASS) **no tiene filas en estas cuatro tablas**, así que por sí solo no prueba la afirmación "la purga sigue andando con la FK nueva"; lo probé yo aparte. La purga reintenta por pasadas las tablas con `foreign_key_violation`, que es lo que la hace compatible.
4. **Backfill como no superusuario**. Creé un rol `NOSUPERUSER NOCREATEROLE NOBYPASSRLS`, dueño de todas las tablas y funciones de `public`, y corrí el 07 **completo** sobre una base migrada desde el 07 anterior con datos (notas con `updated_at` distintos, fila con `grade_type` con espacios): `is_superuser = off`, terminó sin error, las 8 notas quedaron con referencia, `updated_at` y las revisiones del gateway idénticos antes y después, ningún trigger quedó fuera de estado `O`. Falla a mitad: reemplacé el resolver por uno que lanza error en la segunda tabla y corrí el bloque de backfill: error, **0 triggers deshabilitados** después (el `DO` es atómico y `ALTER TABLE ... DISABLE TRIGGER` es transaccional). `DISABLE TRIGGER USER` no toca los triggers internos de FK.
5. **Idempotencia**. Re-correr el 07 con datos en 6 tablas (incluidas asistencia, deuda y asignaciones) no cambió ningún `updated_at` ni revisión del gateway (huella md5 por tabla, antes y después). El orden de "la última condición" no cambia.
6. **Harness**. Corrí `node scripts/validateCatalogReferencesLocal.mjs`: PASS, 27/27. **Control negativo reproducido** con un 07 que lleva los `update` sin `where` del commit anterior más el bloque nuevo: FAIL exactamente en "el backfill no toca updated_at ni las revisiones del gateway" y "tercera corrida sin cambios". Además probé un 07 sin las líneas `disable/enable trigger user` del backfill: también FAIL en esos mismos dos chequeos, o sea que el harness detecta si se quita la protección del backfill.

## Límites de la auditoría y debilidades del harness

- El harness corre como `supabase_admin` (superusuario); por sí solo no prueba el punto 4. Lo cubrí a mano (arriba). Conviene que el próximo gate de Codex lo corra con un rol no superusuario dueño.
- El chequeo "control: el borrado corre (sin RLS)" (`scripts/validateCatalogReferencesLocal.mjs:149`) usa `and false`: no borra nada, solo prueba que `asOwner` funciona. Es inocuo pero no es un control positivo del borrado.
- El harness no cubre los caminos `ON CONFLICT DO UPDATE` de clases (P3-1), carga masiva de cursadas, historia académica ni acta de examen; solo los escritores del portal alumno/docente y la asignación masiva. Los caminos de historia y acta los revisé por lectura de código (insert con texto canónico y `student_record_id`), no los ejecuté de punta a punta.
- No ejecuté `npm run check` ni todos los harness de regresión; corrí el propio y el de purga (PASS).
- No pude verificar las cifras de Prod (11 filas, `postgres` dueño de las tablas, `updated_at = 2026-10-20 13:22:32`) porque no tengo acceso a Prod, por regla. Probé con un rol no superusuario dueño, que es lo que implica esa afirmación.
- Carga concurrente real durante el backfill no probada; el lock `SHARE ROW EXCLUSIVE` de `disable trigger` bloquea escritores concurrentes, así que no debería dejar filas sin trigger, pero lo infiero del modelo de locks de Postgres.
- Quedan fuera de este alcance los cambios del commit `5bafedd` que también viajan en el 07.

## ¿Habilita re-correr el 07 en Prod?

Dentro de mi alcance (commit `972613c`): **sí, con la salvedad del P2-1**, que no bloquea porque en Prod no hay datos que lo activen (pocas filas, `status`/`academic_status` con `check`, sin `grade_type` con espacios que se sepa). Recomiendo corregir el P2-1 antes si es barato (tres líneas) y dejar los P3 como deuda anotada para la Fase 2. Seguir usando el procedimiento de foto antes/después de `max(updated_at)` del resultado del implementador. La decisión final queda sujeta al gate de Codex y a la auditoría de `5bafedd`.
