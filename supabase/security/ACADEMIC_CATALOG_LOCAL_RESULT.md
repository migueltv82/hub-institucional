# CAT.1 — Carga del catálogo académico (ensayo local)

Run `bfaf07cea9eee403` (después de la auditoría): **PASS**. Evidencia completa en `ACADEMIC_CATALOG_LOCAL_EVIDENCE.json`. Staging y Producción: NONE.

## Problema

Lo encontró el UAT en Producción el 18/10. `get_student_portal_workspace_snapshot` arma `planesEstudio` solo con `careers`, `study_plans`, `study_plan_subjects` y `subjects`, filtrando por la carrera del alumno. Subir las planillas en la app no llena esas tablas. Resultado: el alumno no ve materias. Antes, el único camino para llenarlas era `scripts/importNormalizedData.mjs`, un script de un solo uso con nombres de archivo hardcodeados, que además hacía upsert de legajos por `external_code` y creaba alumnos duplicados.

## Solución

`scripts/buildAcademicCatalogSql.mjs` lee la planilla académica con el mismo lector que la app (`parseTemplateV2MasterWorkbook`), la valida y genera un SQL para el SQL Editor:

- **Sin service role**: el SQL corre como el dueño de la base, desde el Dashboard.
- **Todo o nada**: una transacción; si la institución no existe exactamente una vez y activa, aborta.
- **Upsert** de carreras, planes, materias, materias por plan y correlativas.
- **Vincula alumnos existentes** a su carrera y plan (`student_career_plans`): carrera por nombre o código normalizado, igual que "Crear accesos"; plan activo más reciente. No toca a quien ya tiene un plan activo.
- No borra filas ni crea o modifica legajos de alumnos y docentes.

## Ensayo

Se usó una base descartable con el baseline de release/v1, una institución con apóstrofo en el nombre y un alumno real del portal. La carrera "Profesorado de Inglés" tiene tilde y el legajo la tiene en mayúsculas. Hay dos planes (uno cerrado) y una correlativa.

| Caso | Resultado |
| --- | --- |
| Portal antes del catálogo | 0 materias |
| SQL con institución inexistente | Aborta con `CAT.1: no hay exactamente una institucion activa`; 0 filas escritas |
| Primera corrida | 1 carrera, 2 planes, 3 materias, 1 correlativa, 1 alumno con plan; 0 legajos nuevos |
| Segunda corrida | Mismos conteos (idempotente) |
| Portal después | ING01, ING02 y OLD01; carrera = "Profesorado de Inglés" (mismo texto que el snapshot); correlatividades = 1 |
| Plan del alumno | ING-2024 (el vigente), año 1 |

Tests unitarios en `scripts/buildAcademicCatalogSql.test.js`: validaciones de planilla (carrera con dos nombres, nombres ambiguos, materia duplicada, plan inexistente, correlativa circular o inexistente), escape de comillas, transacción, sin delete/truncate/drop y sin insertar legajos.

## Observaciones

- El portal lista las materias de **todos** los planes de la carrera, incluidos los cerrados. Es comportamiento previo de `05_student_portal_secure_read.sql`, no de CAT.1. Queda para v1.1.
- No se cargan `course_schedules` ni `teacher_subject_assignments` relacionales: el portal alumno todavía no muestra horarios. El portal docente no los necesita; usa `subject_teacher_assignments`, que se asignan desde la app.
- v1.1: botón "Publicar catálogo" en la app, vía la Edge.

## Auditoría independiente y ajustes (CAT.1b)

Veredicto de la auditoría sobre `30f6f31`: PASS con observaciones, sin P1. Ajustes:

| Hallazgo | Ajuste |
| --- | --- |
| P2: re-correr con una carrera renombrada o un plan movido de carrera dejaba inscripciones y planes de alumnos con la referencia vieja, sin error | El SQL aborta sin escribir en los dos casos. Tampoco deja cargar una carrera con el mismo nombre normalizado que otra ya cargada. |
| P2: el plan del alumno era "el activo más nuevo", y con planes convivientes elegía mal | `--alumnos`: el plan sale de la planilla de alumnos, por DNI. Sin ese dato, solo vincula si la carrera tiene un único plan activo. |
| P2: un legajo podía quedar vinculado a dos carreras | El vínculo por carrera exige exactamente una carrera coincidente. |
| P2: cargar correlativas bloquea de golpe a los alumnos sin historia académica, y CURSADA/FINAL se pisaban | Las correlativas van solo con `--con-correlativas` (decisión pendiente de Miguel). `tipo_correlativa` se traduce a `enrollment`/`exam` y es parte de la clave. |
| P3: `\r` o `$$` en el nombre de la institución | Se rechazan al generar; el bloque DO usa `$cat1$` y no interpola el nombre. |
| P3: `standard_conforming_strings` | `set local standard_conforming_strings = on` al empezar. |
| P3: fechas como `Date` o número de serie de Excel se perdían; una re-corrida pisaba con null | Se reconocen Date, ISO, DD/MM/AAAA y serie de Excel; lo demás se avisa. Las re-corridas no borran fechas existentes (`coalesce`). |
| P3: `materia_nombre` vacío fallaba recién en el SQL Editor | Error al generar. |
| P3: estados, requisitos y tipos desconocidos se cargaban sin aviso; una correlativa sin plan iba al primer plan | Se avisan. Una correlativa sin `plan_id` con la materia en varios planes es error. |
| P3: la normalización SQL difería de la JS (ç, â, ã, ö) | `translate` ampliado. El harness compara SQL y JS con 6 muestras: iguales. |
| P3: se vinculaban legajos inactivos; el SQL Editor no mostraba los conteos (la última instrucción era `commit`) | Solo legajos activos. El resumen corre después del `commit`. |

El harness ahora cubre: plan conviviente con y sin planilla de alumnos, renombre de carrera (aborta sin escribir), fechas `Date`, correlativa FINAL→`exam:approved`, paridad de normalización y resumen después del commit. Tests unitarios: 11.
