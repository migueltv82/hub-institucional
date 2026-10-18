# EX.1 — Publicar el cronograma en exam_tables (ensayo local)

Run `9e79eca5e00a3c8a` (después de la auditoría): **PASS**. Evidencia completa en `EXAM_PUBLICATION_LOCAL_EVIDENCE.json`. Staging y Producción: NONE.

## Problema

Se encontró al preparar la demo de mesas el 18/10 y se verificó con grep. "Publicar cronograma" solo guardaba `workspace_snapshots.cronograma`; nada creaba filas en `exam_tables`. Pero el portal alumno (`05`, `visible_schedule`) y la inscripción (`upsert_exam_enrollment_from_portal`) las exigen. QA.1 pasaba porque su fixture insertaba `exam_tables` por SQL.

Había además una inconsistencia: el portal elegía qué mesas mostrar según `student_academic_statuses`, que nada llena, mientras la inscripción decide con `student_grades`. Con la mesa publicada, la pantalla podía mostrar una mesa que el servidor después rechazaba, o al revés.

## Solución

- **`publish_exam_tables_from_schedule`** (`08_exam_tables.sql`). Es SECURITY DEFINER y solo la puede usar el owner/admin/editor de una institución activa, o el superadmin; `anon` no tiene EXECUTE. Crea o actualiza una fila en `exam_tables` por mesa publicada (estado `open`, ventana de inscripción desde ahora hasta 48 h antes de la mesa; si faltan menos de 48 h, la mesa se omite) y su `exam_table_subjects`, con la materia y la carrera resueltas en el catálogo de CAT.1.
  - La clave es el id publicado completo (`exam-engine-v21-<mesa>-<fecha>`). `legacy_snapshot_id` lo guarda tal cual (es el que manda el alumno) y `legacy_exam_table_id` en minúsculas. La fecha es parte de la clave porque el id del motor se repite entre turnos.
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

- QA.1 integral con navegador (run `c807b1e6b25d353f`, después de la auditoría): **PASS** en los modos dual_write, default y dual_write. El caso "no regular, UI" ahora acepta la mesa oculta (antes esperaba el botón deshabilitado, que dependía de la inconsistencia corregida). Los negativos Edge (403) y RPC (`EXAM_REGULARITY_REQUIRED`) siguen exigidos.
- PASS: paridad de elegibilidad 03.3, alcance de lectura SEC.3, SEC.2, round-trip, suspensión 06.3 y catálogo CAT.1.

## Pendiente

- EX.2: "Publicar para revisión docente" (`exam_teacher_assignments`) sigue sin funcionar. Mientras tanto, el admin confirma las mesas.
- Si una materia está en dos planes de la misma carrera, la RPC de inscripción usa el plan primario: el alumno del otro plan recibe `STUDENT_CAREER_PLAN_NOT_FOUND`. Pasa a v1.1.

## Auditoría independiente: FAIL → corregido (EX.1b)

| Hallazgo | Corrección | Prueba en el harness |
| --- | --- | --- |
| P1: el id del motor (`draft:<carrera>::<código>:<llamado>`) se repite entre turnos. Sin la fecha en la clave, publicar febrero se apropiaba de la mesa de diciembre y de sus inscriptos. Además, se reabrían mesas cerradas o completadas | La clave es el id completo, con fecha. `closed`/`completed` no se reabren: se omiten con su motivo | Diciembre `completed` con 1 inscripto sigue igual; el turno nuevo es otra fila `open` con 0 inscriptos |
| P2: dos mesas con la misma clave en el payload terminaban en una sola fila; el portal mostraba ambas y una rechazaba la inscripción | La repetida se omite: "La mesa esta repetida en el cronograma" | Omitida |
| P2: el portal aceptaba `program_id` = nombre **o** código de carrera; la RPC solo el nombre | `exam_eligible_subjects` compara solo contra `careers.name` | Con la nota guardada con el código: el portal no muestra la mesa y la RPC da `EXAM_REGULARITY_REQUIRED` |
| P3: 25:00 o 30/02 abortaban toda la publicación | Se omite solo esa mesa: "Fecha u hora invalida" | Las dos omitidas; lo válido se publica |
| P3: con menos de 48 h la ventana quedaba abierta hasta el inicio, distinto de lo documentado | Se omite: "Faltan menos de 48 horas" | Omitida |
| P3: `timezone('utc', now())` dependía de la zona de la sesión | `now()` (timestamptz) | — |
| P3: el portal listaba mesas canceladas que seguían en el snapshot | Solo se listan mesas `confirmed`/`open`; además cruza por el id publicado exacto | — |
| P3: si la RPC fallaba, la pantalla decía "Cronograma publicado en portales" | La publicación devuelve falso y avisa que el cronograma quedó guardado; volver a publicar reintenta solo la apertura | — |
| P3: QA.1 contaba botones sin esperar a que cargue la página | Espera el título "Mesas de examen" y `networkidle` antes de contar | QA.1 PASS |
| P3: si cambia la materia de una mesa ya publicada, queda la fila vieja de `exam_table_subjects` | Sin cambio: la materia es parte del id de la mesa, así que no ocurre con el motor | — |

## Re-auditoría de EX.1b: PASS con observaciones

Verificados la clave por turno, los duplicados, la paridad de carrera, las fechas inválidas, el filtro de estado en 05, el front, la espera de QA.1 y EX.2. Observaciones P3:

- **Republicar una mesa a menos de 48 h la cancelaba** si no tenía inscriptos. Corregido: la mesa queda en el cronograma y no se cancela.
- **El cruce por clave recortada en 05 sigue por compatibilidad.** Ningún flujo genera hoy esas filas: la base de Producción no tiene filas en `exam_tables`. Hay que quitarlo antes de la implementación real.
- **No hay tope de tamaño del payload.** Queda para v1.1.
