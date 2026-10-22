# AUD.16-18 - Reauditoria de las correcciones (06, 07, carga masiva)

- Fecha: 2026-10-21
- Auditor: agente Claude, reauditoria de correcciones; no reemplaza el gate de Codex
- Commit auditado: `0a120d0` (rama `release/v1`, sin cambios en el repo salvo este informe)
- Alcance: solo local (contenedor `supabase_db_codex-baseline-local-7725bdda`, bases `gotrue_harness_<16hex>` propias, todas borradas; scripts en `/tmp/claude-0/reaud/`). Sin remoto, Staging ni Prod.

## Veredicto: PASS WITH WARNINGS

Los seis hallazgos quedan cerrados. No encontre P0, P1 ni P2 nuevos. Solo P3 menores (abajo).

## Estado de los hallazgos originales

| Hallazgo | Estado | Evidencia |
|---|---|---|
| AUD.16 P2-1 backfill aborta con metadata mal formada | CERRADO | Ruta real de upgrade: base con el 06 de `143efb7^` (sin columnas) y con el de `0a120d0~3`, 12 suplencias legacy (`2026-02-31`, `0000-00-00`, mes 13, fin inexistente, uuid de guiones, uuid en mayuscula, texto basura, fecha con hora, salto de linea, digitos arabes, fin antes de inicio) + metadata array/numero/string/null, y despues el 06 actual: sin error. Fechas invalidas quedan NULL, el vinculo se copia si el uuid es valido (mayuscula incluida), fin antes de inicio deja `ends_on` NULL. Re-corrida: hash de la tabla identico. `academic_try_*`: sin EXECUTE para anon/authenticated/public (`permission denied`). Tambien corre con las tablas y funciones a nombre de `postgres` (no superusuario). |
| AUD.16 P2-2 baja de suplencia futura | CERRADO | Suplencia con `starts_on = hoy+5`: baja con fecha NULL o con hoy queda `ends_on = starts_on`, `cancelledBeforeStart: true`, `metadata.cancelled_before_start`. Fecha enviada `hoy+1`: 22023 y estado intacto. Doble baja: 22023. Suplencia ya empezada: fin `hoy-10` da 22023, fin hoy OK. Permisos sin cambios (anon sin EXECUTE; alumno, docente y admin de otra institucion 42501). |
| AUD.17 P2-1 `where` de normalizacion | CERRADO | Comparacion columna por columna de los 5 `update`: cada condicion del `set` esta cubierta. Verificado de forma dinamica: filas con cada defecto (NULL, vacio, espacios, `<1`) en las 5 tablas; despues del `update` con `where`, un `update` sin `where` no cambia ninguna fila (missed = 0). Con el 07 anterior (`0a120d0~1`) la misma prueba detecta 3-9 filas omitidas por tabla. Re-correr el 07 no toca `updated_at` (harness, huella). |
| AUD.17 P3-1 trigger en todo UPDATE | CERRADO | ON CONFLICT de clases completa referencia NULL (harness + control negativo con `update of`). Valor a mano distinto, o NULL a mano, con texto sin cambios: se pisa. Cambio de `subject_id`, de `student_record_id` (plan del alumno) o de institucion: se recalcula. Si no cambia nada y ya estaba completa se saltea (referencia vieja se conserva, es lo documentado como P3-2). Harness de notas, cursadas, historia, acta y carga masiva: PASS. Costo: 20.000 filas con referencia 1,65 s (0,97 s sin trigger); 20.000 con referencia NULL 4,3 s (0,86 s sin trigger) con catalogo chico. |
| AUD.18 H1 planillas de A sobre B | CERRADO | `hydratedInstitutionId` es null al empezar a cargar, null si falla, y la institucion al terminar (rutas local y relacional). Se compara por id, asi que incluso en el render previo al efecto (activa B, hidratada A) queda deshabilitado. Un A->B->A con respuestas desordenadas no lo rompe: las respuestas viejas estan canceladas (`cancelled`). Recarga por conflicto y `onHydrate` nuevo reinician a null (lado seguro). Borrar workspace deja la misma institucion. Mutaciones sobre una copia: sacar `dataIsCurrent` de `canRun` falla 2 tests; sacar el reset a null del hook falla 1 test. |
| AUD.18 H2 40P01 | CERRADO | `runBulk` reintenta 55P03, `SOURCE_FILE_WORKSPACE_BUSY` y 40P01, mismo lote, tope 6 llamadas; 42501 y otros no se reintentan. Sin 40P01 en la funcion, el test nuevo falla. |

## Hallazgos nuevos (todos P3)

- P3-a. `BulkRosterSection.jsx` `if (!canRun) return` en `run()`: es defensa redundante y ningun test la ejercita (borrarla no falla nada, porque el boton deshabilitado ya no dispara el click). Sin riesgo; solo no esta probada.
- P3-b. `useWorkspacePersistence.test.js` no cubre que el camino relacional (`setHydratedInstitutionId` en la linea 355) deje la institucion. Por lectura es correcto. Corregir: agregar un caso con el flag relacional activo.
- P3-c. El trigger ahora corre el resolver en cada UPDATE de filas con referencia NULL permanente (materia fuera del catalogo): ~170 us por fila con catalogo chico y ~2 ms por fila con catalogo de ~4.800 materias-plan segun la auditoria previa, o sea unos 40 s para un UPDATE masivo de 20.000 filas. Aceptable hoy; anotar para la fase 2.
- P3-d. El harness del 06 sigue simulando "legacy" sobre una base que ya tiene el 06 nuevo; la ruta real de upgrade solo la cubri yo (scripts `/tmp/claude-0/reaud/t1.mjs`). Sugerido: sumarla al harness.

## Tests y harness (punto 7 y 8)

- `npx vitest run src/hooks/useWorkspacePersistence.test.js src/services/bulkRoster.test.js src/components/generadorCronograma`: 21 archivos, 186 tests, PASS.
- Harness, todos PASS con cleanup 0: `validateTeacherAssignmentModelLocal` (48), `validateCatalogReferencesLocal` (32), `validateBulkRosterLocal`, `validateStudentHistoryImportLocal`, `validateExamActaResultsLocal`.
- Controles negativos reproducidos por mi cuenta (copias fuera del repo): 06 anterior aborta con `2026-02-31`; 06 sin la rama de cancelacion falla "una suplencia que no empezo se cancela"; 07 anterior falla recorte de espacios y ON CONFLICT; trigger con `update of` falla ON CONFLICT; trigger sin comparar la referencia falla "valor a mano se pisa".

## Limites

- Todo corre como `supabase_admin` (superusuario) salvo la prueba del 06 con objetos a nombre de `postgres`; el 07 completo como no superusuario dueño no se repitio (la auditoria previa lo hizo y el cambio del trigger no toca esa parte).
- No se probo el SQL Editor real ni concurrencia nueva, ni el front en navegador (solo vitest/jsdom) ni `GeneradorCronograma` completo (el pasaje de la prop se verifico por lectura).
- No lei Prod. Queda una base `gotrue_harness_7d1d7da6dd238226` (creada 12:37, anterior a esta sesion, no mia): no la toque.

## Listo para el gate de Codex / Prod

- 06: listo para el gate de Codex. Para Prod: sin bloqueo desde mi alcance; el upgrade desde la tabla vieja con metadata mal formada ya no aborta. Mantener el orden: 06, verificacion, luego front.
- 07: listo para el gate de Codex y para Prod desde mi alcance, con el procedimiento de foto antes/despues de `max(updated_at)`.
