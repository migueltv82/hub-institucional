# QA.1 — Aceptación integrada local (navegador real + Edge en un solo run)

Fecha: 2026-10-17. Ejecutado por Claude, que retomó el WIP 2e0931c de Codex por decisión de Miguel. Staging, Production, SQL remoto y deploy: NONE.

## Resultado: **FAIL**, por un solo hallazgo de producto fuera de alcance (PB.2). Todos los flujos de la tarjeta pasan.

Run `cb1c2eb23e53cf1e` (el anterior fue `3fdbb7cea996e9e2`, antes de PB.3) (`INTEGRATED_ACCEPTANCE_LOCAL_EVIDENCE.json`). Corre sobre servicios reales locales: PostgreSQL, GoTrue, PostgREST, nginx, Edge Runtime con `admin-users`, Vite y Chrome aislado. Los digests de las imágenes son los aprobados. Cleanup: 0 bases, 0 contenedores, 0 archivos temporales. Requests externos: 0. Errores de página: 0.

| Flujo (desde la UI) | Resultado |
| --- | --- |
| Login por formulario, rol correcto, rechazo visible de la otra institución, logout y ruta protegida después del logout. Lo hacen 4 cuentas: alumno A, docente A, admin A y alumno B | PASS (5 recorridos) |
| Alumno: materias y mesa en **3 ciclos** de transición (abajo) | PASS |
| Docente: asistencia y notas (parciales y final) | PASS |
| Alumno relee asistencia y notas | PASS |
| Alumno da de baja una cursada ("Desistir"); la fila relacional queda `dropped` | PASS desde PB.3 (antes, 404: `INTEGRATED_ACCEPTANCE_PB3_BEFORE_FIX_EVIDENCE.json`) |
| Admin: alta de alumno vía Edge, con auditoría `bulk_create_students` | PASS |
| Autosave del panel admin durante el alta | **FAIL**: `DELETE /rest/v1/teacher_records` → 409 (PB.2). Ocurre en la fase del alta: el reporte marca `failedAt = alumno/b logout` porque los asserts de HTTP corren al final. Parte del disparo viene del fixture, que crea `teacher_records` que no están en el snapshot del admin |

### Mesa de examen por modo

El flag de transición se fija solo en el fixture, en `app_settings.academic_relational_transition`.

| Ciclo | Inscribir (UI) | Cancelar (UI) | No regular: UI | No regular: Edge (replay) | No regular: RPC directa | Escrituras de los negativos |
| --- | --- | --- | --- | --- | --- | --- |
| `dual_write` (Producción, runbook §4.1) | 200 · relacional 1 · snapshot 1 | 200 · 0 / 0 | botón deshabilitado con motivo | 403 | 400 `EXAM_REGULARITY_REQUIRED` | 0 / 0 |
| default (sin fila = `snapshot_only`) | 200 · relacional 0 · snapshot 1 (**la RPC no participa**) | 200 · 0 / 0 | ídem | 403 | 400 `EXAM_REGULARITY_REQUIRED` | 0 / 0 |
| `dual_write`, reinscripción sobre la misma fila del snapshot | 200 · 1 / 1 | 200 · 0 / 0 | ídem | 403 | 400 `EXAM_REGULARITY_REQUIRED` | 0 / 0 |

Los negativos de Edge y RPC corren dentro de la página, con la sesión real del alumno. El token se usa en el navegador y nunca vuelve al harness. Esos 4xx esperados se cuentan aparte (`expectedAdversarialFailures = 6`); cualquier otro error HTTP falla el run.

## Hallazgos de producto

- **PB.1, corregido** (commit propio). En `dual_write` el alumno no podía cancelar una inscripción a mesa: daba 404, y después de arreglar eso, la relacional quedaba igual en `registered`. Evidencia del "antes": `INTEGRATED_ACCEPTANCE_PB1_BEFORE_FIX_EVIDENCE.json`.
- **PB.3, corregido** (commit propio). El alumno no podía desistir de una materia: la lectura segura lista la cursada relacional (uuid) y la Edge la buscaba en el snapshot (404). Las cursadas cargadas por el admin no tienen fila en el snapshot.
- **PB.2, abierto, pide decisión.** El autosave del admin (`saveWorkspaceSnapshot` → `syncRosterRecords`) sincroniza docentes con `deleteMissing: true`: borra los `teacher_records` que no están en la planilla del admin. Para alumnos ya es `false`.
  - Acá el borrado choca con la FK de las asignaciones (409). El error corta el autosave antes de `syncTeacherAcademicRecords`.
  - Si el docente no tuviera asignaciones, el legajo docente se borraría en silencio.

## Cambios al harness

- Flag de transición por ciclo, solo en el fixture.
- Ciclo completo inscribir → cancelar → no regular, con negativos UI / Edge / RPC.
- El rótulo del logout del panel admin es "Cambiar sesion".
- La evidencia incluye el texto de los asserts propios. No incluye tokens ni datos de cuentas.
