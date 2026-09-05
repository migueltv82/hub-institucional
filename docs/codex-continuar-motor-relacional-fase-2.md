# Prompt para continuar hub-institucional con Codex — Motor relacional, Fase 2

Copiar y pegar todo el bloque de abajo en Codex. No es continuación de `docs/codex-continuar-fase-2.md`/`fase-3.md` (esos son de una iniciativa distinta y abandonada, ver "Qué NO es esto" más abajo) — es la Fase 2 de lo que arrancó hoy 2026-09-04 como "Fase 1" en `src/utils/examEngine/relationalSource/`.

---

## Contexto

`hub-institucional` es el motor de mesas de examen + portal docente/alumno de Academia Genia, sobre un proyecto Supabase nuevo (`qwrwwansdblcixkjmibx`, ver `supabase/schema/00_README.md`) separado del proyecto viejo de `examenes`. Hoy se cargaron los primeros datos reales (Instituto San Miguel: 6 carreras, 226 materias, 65 docentes, 307 alumnos) y se construyó un lector nuevo que arma la entrada del motor de mesas directo desde ese schema relacional, sin depender de `workspace_snapshots` (el modelo legacy tipo JSON blob).

**Decisión de arquitectura ya tomada, no volver a discutir**: el motor lee directo las tablas relacionales (`careers`, `study_plans`, `subjects`, `study_plan_subjects`, `subject_prerequisites`, `teacher_records`, `teacher_subject_assignments`, `course_schedules`, `student_records`, `student_career_plans`), sin puente de compatibilidad tipo dual-write. Ese mecanismo de 4 etapas (`snapshot_only → dual_write → hybrid_read → relational_primary`) existe en `examenes` para proteger producción viva — acá no aplica, este proyecto no tiene producción real todavía.

## Qué NO es esto

`docs/codex-continuar-fase-2.md` y `fase-3.md` (más viejos) hablan de portar tablas legacy (`subject_enrollments`, `exam_enrollments`, `student_grades`, `legacy_subjects_catalog`, etc.) desde `examenes/supabase/setup_multi_tenant/`. Esa carpeta **ya no existe** en este repo y esos docs describen un plan que se abandonó a favor del enfoque green-field de hoy. No los uses como referencia de arquitectura — si necesitás contexto histórico de por qué existen, está en `docs/codex-continuar-fase-2.md` línea 7 ("le saqué todo el SQL viejo").

## Estado verificado ahora mismo (no asumir, repo cambia rápido)

- `git log --oneline -5` en `origin/main` debería mostrar como último commit `af5a3fa` ("fix: script de preview del motor -- modo --admin y campos correctos del reporte"). Si no, algo se pusheó después de escribir este doc — leer los commits nuevos antes de seguir.
- `npm run check` está en verde: 262 test files, 2087 tests, lint limpio, build OK.
- Instituto San Miguel (`institution_id = '3f9dd1a0-19b8-462f-bdd8-7e849d90ae04'`) tiene datos reales cargados y verificados: 6 carreras, 7 planes, 226 materias, 243 correlatividades, 65 docentes (ya sin duplicados por DNI), 189 asignaciones docente-materia, 273 horarios, 307 alumnos.
- El proyecto Supabase (`qwrwwansdblcixkjmibx`) tiene aplicados `01_foundation.sql`, `02_academic_relational_schema.sql`, `03_workspace_data.sql`, `04_teacher_exam_date_exclusions.sql` (confirmado por conteo de tablas + RLS, ver `supabase/schema/00_README.md`).

## Trabajo completado hoy (no repetir)

1. **Import real de datos** (`scripts/normalizeImportedTemplates.mjs` + `validateNormalizedImport.mjs` + `importNormalizedData.mjs --apply --confirm`) para Instituto San Miguel. Las planillas fuente viven en `public/plantillas/importacion/` e `public/plantillas/base-datos/`, gitignoreadas — si no están en la máquina de casa, hay que copiarlas de nuevo o volver a exportarlas.
2. **Bug real corregido**: la unique constraint de `teacher_subject_assignments` no atrapaba duplicados con `valid_from` nulo (`NULL <> NULL` en Postgres). Ya está en `unique nulls not distinct` tanto en `supabase/schema/02_academic_relational_schema.sql` como en la base viva. No reintroducir `unique (a, b, c, valid_from)` sin el `nulls not distinct`.
3. **Incidente de seguridad corregido**: 17 archivos con datos reales de alumnos/docentes habían quedado commiteados pese al `.gitignore` (gitignore no destrackea algo agregado en el mismo commit que lo ignora). Sacados del tracking (`git rm --cached`, commit `163c1ad`). **Pendiente, decisión de Miguel, no urgente** (repo privado): reescribir el historial de git (`git filter-repo`) para purgarlos del commit `d77e968` y forzar el push. No hacerlo sin que Miguel lo pida explícitamente — es destructivo (fuerza push, todo clon queda desincronizado).
4. **`src/utils/examEngine/relationalSource/`** (fetch + map + orquestador, 22 tests) — arma `docentes`/`horariosDocentes`/`docenteMateria`/`planesEstudio`/`correlatividades`/`alumnos` leyendo el schema relacional, y se lo pasa sin cambios a la lógica ya existente (`src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js`, `src/utils/examEngine/rules/calculateTeacherAssignmentLimit.js`). El motor de generación en sí (`src/utils/examEngine/planning/generateRegular.js`) no se tocó.
5. **`supabase/schema/04_teacher_exam_date_exclusions.sql`** — tabla nueva para bloqueos puntuales de docente (licencias), separada de `course_schedules` (que resuelve los días habituales de clase).
6. **Limpieza de deuda técnica**: eliminados 12 archivos `*SupabaseSql.test.js` en `src/services/` que leían SQL de `supabase/setup_multi_tenant/` (carpeta ya removida) — no tenían implementación JS ni SQL fuente en ningún lado, puro peso muerto.
7. **Validado contra datos reales** con `scripts/examEngineAudit/previewRegularExamPlanFromAcademicSchema.mjs --admin` (requiere `SUPABASE_SECRET_KEY`, nunca pasarla por el chat — correr en terminal propia). Confirmó que el lector funciona de punta a punta.
8. **2 pares de `teacher_records` duplicados por DNI** (`31256302`, `32110882`) fusionados en Supabase, sin perder datos (campos combinados con `COALESCE`, referencias repunteadas). Verificado en 0 duplicados restantes.

## Hallazgos pendientes, sin resolver (deliberado, decisión de Miguel)

- **12 materias sin ningún docente asignado** (`ING23`, `ING33`, `QUI06`, `QUI08`, `QUI19`, `QUI21`, `QUI25`, `QUI27`, `QUI33`, `GEO32`, `LAB39`, `ING02`) — confirmado con SQL que no tienen fila en `teacher_subject_assignments` ni `course_schedules`. El motor se niega a generar cronograma completo mientras esto no se cargue (regla `DIAGNOSE_BEFORE_GENERATE`, correcto). Miguel dijo que las va a cargar él desde el front — no inventar un titular ni saltear la regla.
- **Bug real en el reporte del motor** (no en `relationalSource/`, es del motor viejo): `buildPipelineReport` (`src/utils/examEngine/validation/reports.js`) deduplica issues por shape completo vía `normalizeIssue()`, pero esa función no sabe leer `entityId`/`entityType` (el shape que usa `src/utils/examEngine/diagnostics/feasibility.js` para identificar la materia en errores como `MATERIA_SIN_TITULAR`). Resultado: 12 errores de materias distintas colapsan en 1 solo en `report.criticalErrors`/`executiveSummary.totalErroresCriticos`. Para ver el detalle real hay que leer `result.diagnosis.errors` (forma cruda), no `result.report`. Esto ya lo sabe el script de preview (usa `diagnosis.errors`), pero cualquier otro consumidor de `report.criticalErrors` va a subestimar la cantidad real de materias con problemas. Si se toca esto, el fix natural es que `normalizeIssue()` en `reports.js` también lea `item.entityId`/`item.entityType` como fallback para `materia`/`carrera`/`mesaId` según `entityType`.

## Alerta operativa: verificar `.gitignore` antes de cualquier `git add`

Durante esta sesión, las líneas `public/plantillas/importacion/` y `public/plantillas/base-datos/` desaparecieron de `.gitignore` sin que quien escribe esto las tocara deliberadamente (causa exacta no determinada — posible edición en paralelo desde otra herramienta/editor). Resultado: un `git add` de un archivo no relacionado volvió a subir los 17 archivos con datos reales de alumnos/docentes que ya se habían sacado del tracking antes (commit `592864a`), y hubo que corregirlo de nuevo (`0786e6d`). **Antes de cualquier commit, correr `grep plantillas .gitignore` (deben aparecer las 2 líneas) y `git status` completo (revisar que no aparezca nada bajo `public/plantillas/base-datos/` ni `importacion/`) — no asumir que el `.gitignore` sigue como se lo dejó la sesión anterior.**

## Próximos pasos (en orden sugerido)

1. **Confirmar el estado del repo** (`git log`, `git status`, `npm run check`) antes de tocar nada — no asumir que sigue como acá.
2. **Persistencia de mesas generadas**: hoy el motor puede generar un cronograma en memoria pero no hay tabla para guardarlo. Diseñar el equivalente relacional de "mesas" (algo como `exam_tables`/`mesas_examen` + participación de tribunal), reemplazando lo que en el modelo viejo vivía en `exam_enrollments`/`exam_teacher_assignments`. Este es el trabajo grande pendiente — no hay diseño previo, hay que arrancar de cero (a diferencia de la Fase 1, acá no hay lógica reusable de `comparison/` para esto).
3. **Wiring de UI**: una vez que exista persistencia, conectar `ExamEngineV21FieldTestPage` (o la página que corresponda) para que use `buildExamEngineSnapshotFromAcademicSchema` en vez de `workspaceSnapshot.js`. No se tocó ninguna página todavía — la Fase 1 fue puramente el lector de datos.
4. **Opcional, si Miguel lo pide**: arreglar el bug de deduplicación en `buildPipelineReport` (ver arriba).
5. **Opcional, si Miguel lo pide**: decidir sobre la reescritura de historial de git para purgar el commit `d77e968` (datos personales).

## Convenciones a respetar (ya establecidas hoy, no reinventar)

- JS puro, sin TypeScript.
- Tests al lado del archivo, obligatorios al tocar motor/persistencia/parseo.
- Nunca usar `SUPABASE_SECRET_KEY`/`service_role` en el chat ni en scripts que corran del lado de un agente — siempre pedirle al usuario que lo corra en su propia terminal.
- Antes de escribir SQL nuevo para `supabase/schema/`, seguir el patrón idempotente ya establecido (`create table if not exists`, `drop policy if exists` + `create policy`, RLS con `is_member_of_institution`) y actualizar `supabase/schema/00_README.md`.
- Sumar la entrada correspondiente a `docs/WORKLOG.md` al terminar un bloque de trabajo (ver la entrada de hoy, `2026-09-04`, como ejemplo de nivel de detalle esperado).
