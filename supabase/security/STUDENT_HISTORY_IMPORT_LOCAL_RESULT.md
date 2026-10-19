# I2a — Importación de historia académica (local)

Fecha: 2026-10-18. Ejecutó: Claude. Entorno: base descartable sobre `supabase_db_codex-baseline-local-7725bdda` (Postgres 17.6.1.165), con los 9 archivos del baseline y el fixture A/B. Staging y Producción: **NONE**.

## Qué se agregó

- **RPC `academic_admin_import_student_history(uuid, text, jsonb)`** en `07_academic_operations.sql`.
  - `security definer` y `search_path = ''`. EXECUTE solo para `authenticated`; `anon` y `public` revocados.
  - Solo owner/admin/editor de la institución o superadmin. Máximo 1000 filas por llamada; la app envía lotes de 500.
- **Por fila:** DNI, carrera (nombre o código), materia (código) y condición (`regular`, `libre`, `aprobada`, `promocionada`, `desaprobada` y sinónimos). Nota, fecha, libro y folio son opcionales.
- **Cómo resuelve:**
  - la carrera, dentro de la institución;
  - la materia, solo si está en un plan de esa carrera;
  - el legajo por DNI dentro del workspace (si hay varios, el de esa carrera); exige que el alumno tenga cuenta.
- **Qué escribe:** `student_grades` en canónico (`subject_id = subjects.code`, `program_id = careers.name`), con `student_record_id`, `grade_type 'historia'` e intento 1. Re-importar actualiza, no duplica.
- **Nunca pisa la operación real:** si la materia ya tiene una nota viva no pending de otro tipo (cargada por un docente), la fila se omite con `YA_TIENE_NOTAS_DEL_SISTEMA`.
- **Errores por fila:** no cortan el lote. Vuelven en el reporte con fila, DNI, materia y motivo.
- **App:** sección "Historia académica" en Alumnos, con plantilla descargable, importación y tabla de problemas.
- **Portal del alumno:** trata la historia como nota final (calificaciones y promedio). La mesa, las correlativas y el control de años ya leían `student_grades`, así que la reconocen sin cambios.

## Resultado

`node scripts/validateStudentHistoryImportLocal.mjs` → **PASS**, run `f9d1b68e6b0b51c1`, cleanup 0.

| Caso | Resultado |
|---|---|
| Contrato: security definer, `search_path=""`, sin EXECUTE para anon | OK |
| Alumno, docente y admin de otra institución | 42501, sin cambios en `student_grades` |
| Payload que no es lista | 22023 |
| 9 rechazos por fila | OK, cada uno con su motivo: faltan datos, condición, nota, fecha inválida, fecha futura, carrera, materia fuera del plan, DNI inexistente, alumno sin cuenta |
| Historia `regular` | 1 importada, con legajo, Libro/Folio y fecha; **el alumno se inscribe a la mesa** por `upsert_exam_enrollment_from_portal` |
| Re-importar la misma materia como `aprobada` con nota 8,50 | 1 actualizada (no duplica); la mesa queda bloqueada (ya está aprobada) |
| Nota del docente (`libre`) ya cargada | La historia se omite y la nota del docente sigue mandando |

## Regresiones (todas PASS)

| Harness | Run |
|---|---|
| CHECK canónico 03.5c | `a64b773c7797ca70` |
| RPC del docente 03.5b | `b9436b18de0a1916` |
| Paridad 03.3 | `e2beee8c3bfe9abb` |
| Publicación de mesas EX | `9b3087d8d3df24a0` |
| Aceptación integrada QA.1 | `dbe69c98884e2a13` |
| Suspensión de institución 06.3 | `da1dbe29080559c2` |

## Producción

No aplicado. Para aplicarlo hay que correr `07_academic_operations.sql` (idempotente) con el OK de Miguel.
