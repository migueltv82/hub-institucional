# I2b — Titularidades y cursadas desde las planillas (local)

Fecha: 2026-10-19. Ejecutó: Claude. Entorno: base descartable sobre `supabase_db_codex-baseline-local-7725bdda`, con los 9 archivos del baseline y el fixture A/B. Staging y Producción: **NONE**.

## Qué se agregó (`07_academic_operations.sql`)

- **Helpers internos compartidos.** Los dos son `security definer` con `search_path=''` y no tienen EXECUTE para ningún rol de la API.
  - `academic_resolve_catalog_subject`: carrera por nombre o código dentro de la institución, y materia solo si está en un plan de esa carrera.
  - `academic_resolve_student_record_by_dni`: legajo por DNI dentro del workspace. Toma el de esa carrera; si no hay, uno sin carrera cargada. Rechaza un legajo de otra carrera y exige que el alumno tenga cuenta.
  - I2a pasó a usarlos sin cambiar su comportamiento: el harness de I2a sigue en PASS, con los mismos casos y las carreras concurrentes.
- **`academic_admin_bulk_assign_teachers`:** crea titularidades desde `docente_materia`.
  - Busca al docente por DNI y exige que tenga cuenta.
  - Rol: un rol vacío o `titular` queda como titular; `suplente` o `reemplazo`, como suplente; `licencia`, como licencia. Cualquier otro se rechaza con `ROL_INVALIDO`.
  - Crea la titularidad o le actualiza el rol; nunca borra.
- **`academic_admin_bulk_enroll_students`:** crea cursadas activas desde `alumnos_inscripciones`.
  - Si la cursada ya estaba activa, no cambia nada.
  - Si estaba dada de baja o borrada, no la reactiva: devuelve `CURSADA_DADA_DE_BAJA`.
- **Contrato común de las dos RPC:** solo owner/admin/editor o superadmin, hasta 1000 filas por llamada y reporte por fila.

## Resultado

`node scripts/validateBulkRosterLocal.mjs` → **PASS**, run `9f80c166f32609ba` y re-run `029309e0de5e3fff`, cleanup 0.

| Caso | Resultado |
|---|---|
| Contrato: RPC con EXECUTE solo para `authenticated`; helpers sin EXECUTE | OK |
| Alumno, docente y gestión de otra institución | 42501, sin cambios |
| Payload que no es lista | 22023 |
| Titularidades: 6 rechazos | Cada uno con su motivo: faltan datos, rol inválido, DNI inexistente, docente sin cuenta, materia fuera del plan, carrera inexistente |
| Titularidad creada (rol vacío = titular) | OK |
| Repetir | No duplica |
| Rol a suplente y de nuevo a titular | Actualiza el rol |
| Cursadas: 4 rechazos | Cada uno con su motivo: faltan datos, alumno sin cuenta, DNI inexistente, materia fuera del plan |
| Cursada creada | OK |
| Repetir | No duplica |
| Cursada dada de baja | No se reactiva (`CURSADA_DADA_DE_BAJA`) |
| **De punta a punta** | El docente asignado por planilla carga la nota del alumno inscripto por planilla con su RPC (`academic_teacher_upsert_student_grade`): `saved` |

## Regresiones (todas PASS)

| Harness | Run |
|---|---|
| I2a | `fa24f0f5aebcfbb2` |
| F1 | `2bde9068e4fb2f07` |
| 03.5b | `a4d20fe4b2ffd09e` |
| Publicación | `e27b2a471a5c3828` |
| QA.1 | `086011fd9a7d4595` |
| Paridad 03.3 | `56df71bb33a6aead` |
| 03.5c | `03a7a67fff2ba9d3` |
| 06.3 | `9e160085a2b628e9` |

## App

**Alumnos → Cursadas y titulares**: dos botones, "Aplicar titularidades (N)" e "Inscribir cursadas (N)". Al terminar muestra un resumen y la tabla de problemas, cada fila con su motivo.

## Producción

No aplicado. Hay que correr `07_academic_operations.sql` (idempotente) con el OK de Miguel.
