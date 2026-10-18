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

## Aplicación en Producción (`lzjp…aeco`, 2026-10-18, con OK de Miguel)

Aplicado vía MCP `apply_migration` desde el repo en `af29229`:

1. `ex1_publish_exam_tables`: `publish_exam_tables_from_schedule` completa (de `08_exam_tables.sql`, incluye EX.1c), revoke public/anon, grant authenticated.
2. `ex1_student_portal_exam_visibility`: `get_student_portal_workspace_snapshot` completa (de `05_student_portal_secure_read.sql`), revoke/grant y `notify pgrst, 'reload schema'`.

Verificación de solo lectura:

| Función | SECURITY DEFINER | anon EXECUTE | public EXECUTE | authenticated EXECUTE | Otro |
| --- | --- | --- | --- | --- | --- |
| `publish_exam_tables_from_schedule(uuid,text,jsonb,timestamptz,integer)` | sí | no | no | sí | — |
| `get_student_portal_workspace_snapshot(uuid,text)` | sí | no | no | sí | contiene `exam_eligible_subjects` |

Advisors de seguridad: sin hallazgos nuevos, salvo el aviso esperado "authenticated puede ejecutar SECURITY DEFINER" para la RPC nueva, que valida owner/admin/editor o superadmin por dentro. Siguen los avisos de línea base: tablas con RLS sin policies, a las que se accede solo por RPC; dos RPC anon públicas de login/estado; y la protección de contraseñas filtradas apagada.

Pendiente: la demo de punta a punta en la app (armar mesas → confirmar el tribunal → publicar → el alumno se inscribe).

## EX.7: inscriptos de la mesa en el portal docente (local, run `f63eaf9a97c7beec`: PASS)

Al publicar, cada mesa guarda en `exam_tables.metadata.tribunal_dnis` los DNI de titular y vocales; el front los resuelve desde los docentes del motor. La RPC nueva `get_exam_table_roster(uuid, text, text)` (SECURITY DEFINER, `anon` sin EXECUTE) devuelve nombre, DNI, legajo y carrera de los inscriptos `registered`.

| Quién | Resultado |
| --- | --- |
| Admin de la institución | Ve la lista (solo el inscripto; el libre no aparece) |
| Vocal del tribunal (DNI con puntos en el legajo) | Ve la lista |
| Docente con asignación activa de la materia | Ve la lista |
| Docente ajeno al tribunal | `Acceso denegado` |
| Alumno | `Acceso denegado` |
| Vocal en una mesa donde no es tribunal | `Acceso denegado` |
| Docente ajeno, mesa inexistente | `Acceso denegado` (no revela qué mesas existen) |
| Admin, mesa inexistente | `EXAM_TABLE_NOT_FOUND` |
| `anon` | Sin EXECUTE |

Portal docente: botón "Ver inscriptos" en cada mesa, con la tabla de alumnos o el motivo si no puede verlos. Las mesas publicadas antes de EX.7 no tienen `tribunal_dnis`: su titular las ve por la asignación de la materia, y los vocales las ven después de republicar.

## EX.8: actas, titular-only, 24 h e inscripción especial (local, run `5e01b6e37c5a8d7a`: PASS)

| Caso | Resultado |
| --- | --- |
| Titular publicado (`metadata.titular_dni`, legajo con DNI con puntos) | Ve los inscriptos |
| Titular asignado (`subject_teacher_assignments.role = titular`) | Ve los inscriptos |
| Vocal del tribunal (incluso con asignación `suplente`) | `Acceso denegado` |
| Docente ajeno, alumno, mesa ajena o inexistente | `Acceso denegado` |
| `get_exam_tables_admin_overview` como admin | Mesas con carrera, plan, año, tribunal y cantidad de inscriptos |
| `get_exam_tables_admin_overview` como docente | `Acceso denegado` |
| Portal fuera de plazo | `EXAM_ENROLLMENT_WINDOW_CLOSED` |
| Inscripción especial: docente / sin motivo / alumno libre | Rechazada / `REASON_REQUIRED` / `EXAM_REGULARITY_REQUIRED` |
| Inscripción especial: admin con alumno regular | `registered`, `created_by` = admin, motivo en metadata, evento `admin_special_enrollment` |
| Inscripción especial repetida / después del día de la mesa | `ALREADY_REGISTERED` / `AFTER_EXAM_DAY` |
| Publicar sin indicar horas: mesa a 30 h / a 20 h | Se publica / se omite ("Faltan menos de 24 horas") |

Regresiones después de mover las reglas a `exam_enrollment_assert_eligible`:
- paridad de elegibilidad 03.3: PASS (`6bfbe8160b075341`);
- suspensión 06.3: PASS (`5c50045c919a952a`);
- escritura de `academic_status`: PASS (`cef46adb56eb8291`);
- QA.1 integral con navegador: PASS (`29507ed02f394d82`).

Reemplazo sobre el schema anterior (`af29229`, el que está en Producción): sin errores; `upsert_exam_enrollment_from_portal` mantiene una sola firma de 14 parámetros y el default de horas pasa a 24.

## EX.7/EX.8 aplicados en Producción (`lzjp…aeco`, 2026-10-18, con OK de Miguel)

Tres migraciones vía MCP `apply_migration`, desde `release/v1` `ea4b469`, solo `create or replace` y revoke/grant, sin `DROP` ni datos:
- `ex8_enrollment_eligibility_shared`: `exam_enrollment_assert_eligible` + `upsert_exam_enrollment_from_portal`;
- `ex8_publish_24h_tribunal`: `publish_exam_tables_from_schedule`;
- `ex8_roster_actas_admin_enrollment`: `get_exam_table_roster`, `get_exam_tables_admin_overview`, `admin_enroll_student_in_exam_table` y `notify pgrst`.

Verificación de solo lectura:

| Función | DEFINER | anon | authenticated |
| --- | --- | --- | --- |
| `exam_enrollment_assert_eligible` | sí | no | **no** (interna) |
| `upsert_exam_enrollment_from_portal` (una firma, 14 parámetros) | sí | no | sí |
| `publish_exam_tables_from_schedule` (default 24 h) | sí | no | sí |
| `get_exam_table_roster`, `get_exam_tables_admin_overview`, `admin_enroll_student_in_exam_table` | sí | no | sí |

Advisors de seguridad: sin hallazgos nuevos, salvo el aviso esperado "authenticated puede ejecutar SECURITY DEFINER" para las RPC nuevas, que validan rol por dentro.

Prueba de lectura en transacción con `rollback`, como admin de la institución:
- `get_exam_tables_admin_overview` devuelve la mesa UAT01 (02/11, 1 inscripto);
- `get_exam_table_roster` devuelve al alumno inscripto.

La mesa publicada antes del cambio conserva el cierre a 48 h y el tribunal vacío hasta que se republique el cronograma.

## EX.9: logo del colegio en las actas (local, run `e8b1d227da3cca31`: PASS)

RPC nueva `set_institution_logo(uuid, text)` en `01_foundation.sql` (SECURITY DEFINER, `anon` sin EXECUTE).

| Caso | Resultado |
| --- | --- |
| Admin carga PNG | OK; queda en `institutions.logo_url` y aparece en `list_active_login_institutions` |
| Docente / alumno | `Acceso denegado` |
| SVG / URL externa / más de 400.000 caracteres | `INSTITUTION_LOGO_INVALID` |
| Admin manda vacío | El logo se quita (`null`) |

Front:
- Tarjeta "Logo del colegio" en Mesas y actas, visible para owner, admin o superadmin. El navegador achica la imagen a 900×300 como máximo.
- El acta muestra el logo centrado en el encabezado (hasta 100×26 mm, sin deformar). Si no hay logo o es inválido, usa el nombre del colegio.
- Verificado visualmente con el logo del modelo de Miguel: entra en A4 con los 25 renglones.
