# Circuito alumno ↔ docente contra un stack local

Fecha: 2026-10-16. Épica 04–06 (portales). Ensayo vigente 8bb88c73462370d4: **PASS 5/5** (el ensayo inicial ed7a4780909bacfc quedó PARCIAL 5/6 hasta quitar el paso legacy). Evidencia: [ROUND_TRIP_LOCAL_EVIDENCE.json](./ROUND_TRIP_LOCAL_EVIDENCE.json).

## Qué es

`CLAUDE.md` define la prueba de punta a punta de la conexión docente↔alumno y su validador automático, `scripts/validateStudentTeacherRoundTrip.mjs`, que hasta ahora solo corría contra un Supabase real con service role. `node scripts/validateRoundTripLocal.mjs` lo ejecuta **sin cambios de alcance** contra un stack descartable: base con el baseline canónico, GoTrue v2.196.0, PostgREST v16.1 y un gateway nginx en loopback, con claves efímeras y una institución sintética. El entorno del validador no hereda ninguna variable `VITE_*` ni `SUPABASE_*` del proceso.

## Resultado

| Paso | Resultado |
| --- | --- |
| Variables de entorno (service role solo fuera de `VITE_`) | PASS |
| Institución de prueba, usuarios Auth y legajos | PASS |
| Alumno se inscribe con IDs canónicos por la RPC del portal | PASS (ING08 / PROFESORADO DE INGLES, con `student_record_id`) |
| Docente lee el padrón por el camino de `subjectRoster.js` | PASS (1 alumno, con nombre y DNI) |
| Docente carga asistencia y nota; el alumno las relee | PASS (asistencia `present`, nota 8, condición regular) |
| Fila legacy en slug normalizada y visible | Quitado por decisión del usuario (ver abajo) |

Limpieza del validador: OK, sin filas residuales en legajos, inscripciones, notas, clases, asistencia ni membresías. Cleanup del stack: 0 bases, 0 contenedores, 0 archivos temporales.

## El validador estaba desactualizado

Antes de esta unidad no podía pasar contra ninguna base con el baseline actual. Correcciones mínimas, solo en el validador:

1. Inscribía con el cliente de service role. Desde el fix P1 de identidad, `upsert_subject_enrollment_from_portal` exige `auth.uid()` igual al alumno y respondía `ACADEMIC_COMMAND_FORBIDDEN` (comportamiento correcto). Ahora inscribe con la sesión del propio alumno.
2. Escribía `subject_class_sessions`, `subject_attendance_records` y `student_grades` directo en las tablas; RLS lo deniega desde que la app usa RPC. Ahora usa las mismas RPC y parámetros que `src/services/subjectAttendance.js` y `src/services/studentGrades.js`.
3. Su limpieza fallaba al borrar `academic_audit_logs`, tabla del schema de `examenes` que no existe en `supabase/schema`. Solo se tolera la ausencia de esa tabla; cualquier otro error de limpieza sigue fallando.

## Paso legacy: quitado

El paso final inserta una inscripción con IDs en slug dentro de `workspace_snapshots.payload` y espera que `get_student_portal_workspace_snapshot` la devuelva para normalizarla. En este schema esa RPC arma `enrollments` **solo desde `subject_enrollments`** y nunca expone filas crudas del snapshot, así que el paso no puede cumplirse. Es un supuesto heredado del repo `examenes`. Por decisión del usuario (2026-10-16) el paso se quitó junto con sus helpers (442 líneas); si algún día se migran filas legacy a `subject_enrollments`, esa migración tendrá su propia validación.

## Límites

Stack local sintético; no valida Staging ni Production. No incluye Storage ni Edge (cubiertos en las unidades de recuperación). Sin auditor independiente.
