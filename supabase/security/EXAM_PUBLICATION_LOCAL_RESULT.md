# EX.1 — Publicar el cronograma en exam_tables (ensayo local)

Run `0aa8949b932b5bef`: **PASS**. Evidencia completa en `EXAM_PUBLICATION_LOCAL_EVIDENCE.json`. Staging y Producción: NONE.

## Problema

Se encontró al preparar la demo de mesas el 18/10 y se verificó con grep. "Publicar cronograma" solo guardaba `workspace_snapshots.cronograma`; nada creaba filas en `exam_tables`. Pero el portal alumno (`05`, `visible_schedule`) y la inscripción (`upsert_exam_enrollment_from_portal`) las exigen. QA.1 pasaba porque su fixture insertaba `exam_tables` por SQL.

Había además una inconsistencia: el portal elegía qué mesas mostrar según `student_academic_statuses`, que nada llena, mientras la inscripción decide con `student_grades`. Con la mesa publicada, la pantalla podía mostrar una mesa que el servidor después rechazaba, o al revés.

## Solución

- **`publish_exam_tables_from_schedule`** (`08_exam_tables.sql`). Es SECURITY DEFINER y solo la puede usar el owner/admin/editor de una institución activa, o el superadmin; `anon` no tiene EXECUTE. Crea o actualiza una fila en `exam_tables` por mesa publicada (estado `open`, ventana de inscripción desde ahora hasta 48 h antes de la mesa) y su `exam_table_subjects`, con la materia y la carrera resueltas en el catálogo de CAT.1.
  - `legacy_snapshot_id` es el id publicado, el que manda el alumno. `legacy_exam_table_id` es el id sin prefijo ni fecha, el que cruza `05`.
  - Una mesa con materia o carrera que no están en el catálogo, o con fecha pasada, se informa como omitida.
  - Una mesa que ya no está en el cronograma se cancela, salvo que tenga inscriptos: en ese caso se conserva y se informa.
  - Es idempotente y usa un lock por workspace.
- **Portal alumno (`05`)**: la CTE nueva `exam_eligible_subjects` usa la MISMA regla que la RPC de inscripción: la última condición no-pending en `student_grades`, con match exacto de `subject_id`/`program_id`, tiene que ser `regular`. Se usa solo para filtrar mesas. `estadoAcademico` no cambia.
- **App**: al publicar el cronograma final, `GeneradorCronograma` llama a la RPC (`src/services/examTablePublication.js`) y muestra un resumen: abiertas, nuevas, actualizadas, omitidas con su motivo y canceladas.

## Ensayo (`scripts/validateExamPublicationLocal.mjs`)

| Caso | Resultado |
| --- | --- |
| Docente o alumno llaman a la RPC | Rechazados: "Acceso denegado" |
| Antes de publicar | El alumno no ve mesas; la inscripción da `EXAM_TABLE_NOT_AVAILABLE` |
| Publicar 3 mesas (una con materia inexistente) | 2 nuevas, 1 omitida con su motivo; estado `open`, ventana válida |
| Alumno regular (con una nota `pending` posterior, que no cuenta) | Ve las 2 mesas y se inscribe: `registered` |
| Alumno que quedó libre | No ve ninguna mesa; la inscripción da `EXAM_REGULARITY_REQUIRED` |
| Republicar | 0 nuevas, 2 actualizadas, sin duplicados |
| Publicar vacío | La mesa sin inscriptos queda cancelada; la que tiene inscriptos se conserva y se informa |

## Regresiones

- QA.1 integral con navegador (run `293c215bf1e67d95`): **PASS** en los modos dual_write, default y dual_write. El caso "no regular, UI" ahora acepta la mesa oculta (antes esperaba el botón deshabilitado, que dependía de la inconsistencia corregida). Los negativos Edge (403) y RPC (`EXAM_REGULARITY_REQUIRED`) siguen exigidos.
- PASS: paridad de elegibilidad 03.3, alcance de lectura SEC.3, SEC.2, round-trip, suspensión 06.3 y catálogo CAT.1.

## Pendiente

- EX.2: "Publicar para revisión docente" (`exam_teacher_assignments`) sigue sin funcionar. Mientras tanto, el admin confirma las mesas.
- Si una materia está en dos planes de la misma carrera, la RPC de inscripción usa el plan primario: el alumno del otro plan recibe `STUDENT_CAREER_PLAN_NOT_FOUND`. Pasa a v1.1.
