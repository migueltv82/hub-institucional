# D1 — Recorrido del Día D con navegador real (local)

Fecha: 2026-10-19. Ejecutó: Claude. Staging y Producción: **NONE**.

**Entorno:** stack local descartable, armado como Producción.
- GoTrue, PostgREST y Edge `admin-users`.
- Gateway de Storage: `source_file_storage_gateway.sql` + storage-api + Edge `source-file-storage`.
- App en Vite y Chromium con Playwright.

**Datos:** sintéticos, sin datos reales.
- 1 carrera ("PROFESORADO DE INGLES"), 1 plan y 3 materias de 1.er año.
- 4 docentes que dan clase los lunes y 3 alumnos.
- Historia: regularidad en ING01 e ING02 para dos alumnos.

## Recorrido (todo por la UI, salvo donde se indica)

| # | Rol | Paso | Resultado |
|---|---|---|---|
| 1 | Super Admin | Crea "Instituto Demo D1" con su admin (I2f) | OK, 1 admin |
| 2 | Admin | Sube la planilla académica | **Fallaba** (P1, corregido: hallazgo A) → OK, 3 materias |
| 3 | Admin | Sube docentes y alumnos | OK: 4 docentes, 4 titularidades, 4 horarios; 3 alumnos, 9 inscripciones a materias |
| 4 | Admin | Publica el catálogo (I2c) | **0 alumnos con plan** (P1, corregido: hallazgo B) → "3 de 3 alumnos con plan" |
| 5 | Admin | Crea accesos de alumnos y de docentes | OK: 3 + 4 cuentas, todas con cambio obligatorio de contraseña (I2d) |
| 6 | Admin | Aplica titularidades e inscribe cursadas (I2b) | OK: 4 titularidades y 9 cursadas |
| 8 | Admin | Arma el llamado (26–30/10), genera el precronograma, autocompleta tribunales, confirma y publica | OK, 2 mesas publicadas. ING01 quedó sin titular por los datos de prueba (dos titulares), y el motor lo marca bien como "requiere revisión" |
| 9 | Alumna | Primer ingreso con DNI → cambio obligatorio → se inscribe a Fonética I | OK; tabla y snapshot con la inscripción |
| 10 | Docente titular | Primer ingreso → Mesas → "Ver inscriptos" | OK, ve a la alumna con DNI y carrera; en la mesa donde es vocal no hay lista |
| 11 | Docente titular | Día del examen (*la fecha de la mesa se movió a hoy por SQL local*) → escrito 7, oral 9 → guardar → cerrar acta (F1) | OK: "Aprobado (8)", acta cerrada, mesa `completed`, nota en `student_grades` |
| 12 | Alumna | Calificaciones y estado académico | **No veía el final** (P1, corregido: hallazgo C) → "8 Aprobada", 33 %, con las fechas correctas |
| 13 | Docente vocal | Primer ingreso → Mesas | OK, ve sus mesas sin la lista de inscriptos |
| 14 | Admin | Mesas y actas → Hoy → Ver inscriptos → Descargar PDF | OK: origen "Portal", "Aprobado (8)", "Corregir acta (cerrada)"; el PDF del día trae notas, totales y tribunal |
| 15 | Super Admin → viewer | Crea un usuario viewer (I2g) y entra con él | OK: ningún botón de escritura habilitado en Inicio, Alumnos ni Docentes |

## Hallazgos corregidos

- **A (P1). Primera carga de planillas de una institución nueva:** fallaba con "El recurso de archivo no esta registrado". Los recursos de Storage solo se registraban al insertar el snapshot. Se arregló con `supabase/security/source_file_storage_register_on_institution.sql` y con el rollback de I2f. Commit `308af28`.
- **B (P1). El catálogo no vinculaba a ningún alumno con su plan:** el estado del legajo es `activo` y se filtraba `active`, en la RPC y en el SQL de CAT.1. Commit `308af28`.
- **C (P1). El final del acta no aparecía en el portal del alumno:** el portal no reconocía `final_exam` como nota final.
- **D (P2). Fechas de la historia importada:** la regularidad mostraba la fecha de importación y además una "Fecha final" sin final.

- **E (P2, 20/10). Docentes fantasma en el motor de mesas:** "Docentes adaptados: 8" con 4 docentes. La titularidad relacional ("Aplicar titularidades") llegaba al snapshot sin el DNI y con el id del legajo, así que el motor la tomaba como otro docente, sin nombre ni DNI. El mismo docente podía terminar como titular y como "otro" vocal. `fetchSubjectTeacherAssignments` ahora suma DNI y nombre del legajo, y la mezcla usa la identidad del padrón. Verificado en el navegador real: "Docentes adaptados: 4".

C y D se arreglaron en `mapStudentPortalGrade`: la condición importada no cuenta como final y las fechas salen de `grading_period`. Calificaciones usa la condición cuando no hay final.

## Defectos abiertos (para Fase 2 o decisión)

| # | Pantalla | Severidad | Defecto |
|---|---|---|---|
| 1 | Super Admin > Nueva institución | P3 | Las etiquetas del modal no están asociadas a sus campos (sin htmlFor/id): accesibilidad y lectores de pantalla. |
| 2 | Super Admin (cabecera) | P3 | Los toasts arriba a la derecha tapan el botón "Volver al workspace" y se apilan cortados. |
| 3 | Super Admin > Instituciones | P3 | El placeholder del buscador queda cortado ("Buscar por nombre, slug o p"). |
| 4 | Super Admin > Instituciones | P3 | "Schema relacional en panel admin · Deshabilitada": jerga técnica en una pantalla de la demo. |
| 5 | Admin > Alumnos | P3 | El orden de las secciones no sigue el del runbook: "Crear accesos" aparece antes que "Catálogo académico". |
| 6 | Admin > Alumnos | P3 | "Inscripción de alumnos a materias" dice "No hay inscripciones cargadas" con 9 inscripciones en la planilla (todavía no aplicadas con "Inscribir cursadas"); conviene explicarlo. |
| 7 | Admin > Mesas | P3 (a revisar) | "Docentes adaptados: 8" con 4 docentes en la planilla (¿cuenta docentes de horarios y de padrón por separado?). |
| 8 | Docente > Mesas | P3 | El panel "Precronograma en revisión" muestra una función deshabilitada ("no está habilitada en esta versión"): en la demo conviene ocultarlo. |
| 9 | Docente/Alumno > Mesas | P3 | "Aula/Lugar: A confirmar" en todas las mesas, aunque los horarios traen sede. |
| 12 | Alumno > Calificaciones | DECISIÓN | Cuando una nota final no trae estado, el portal infiere "Aprobada" con 6 o más; la regla de finales decidida es 4 o más. Hoy no impacta (acta, historia y libro docente siempre traen estado), pero conviene unificar. |

## Notas del entorno

- El 404 inicial a `source_file_storage_resources` fue del stack local, que todavía no tenía el gateway. Producción lo tiene.
- Los scripts del recorrido y las capturas quedaron en el entorno de trabajo de la sesión, no en el repo. Si se quiere repetir D1, el siguiente paso es convertirlos en un harness del repo.
