# Paridad del espejo de elegibilidad a mesa con la RPC

Fecha: 2026-10-16. Tarjetas: 03.3 https://trello.com/c/yPhTzp3R (prueba, FAIL) y 03.4 https://trello.com/c/0YAhibpL (corrección). Ensayo final: PASS 17/17. Evidencia: [EXAM_ELIGIBILITY_PARITY_EVIDENCE.json](./EXAM_ELIGIBILITY_PARITY_EVIDENCE.json); antes de la corrección: [EXAM_ELIGIBILITY_PARITY_BEFORE_FIX_EVIDENCE.json](./EXAM_ELIGIBILITY_PARITY_BEFORE_FIX_EVIDENCE.json).

## Regla

`upsert_exam_enrollment_from_portal` es la autoridad. `src/modules/alumnos/lib/examEligibility.js` la espeja solo para explicar en la UI por qué el botón está deshabilitado, y nunca puede ser más permisivo (ver CLAUDE.md).

## Prueba diferencial

`node scripts/validateExamEligibilityParityLocal.mjs`: base descartable con el baseline canónico y el bloque de fixtures compartido de `supabase/baseline/local_ab_rls_rpc_validation.sql` (alumno A, mesa FIX-A-01). Para cada uno de 17 historiales de `student_grades` se ejecuta la RPC real como el alumno y el espejo JS con las mismas filas vivas, tal como las recibe el portal. Una divergencia donde el espejo habilita y la RPC rechaza hace fallar el ensayo.

El trigger `touch_academic_operations_updated_at` reescribe `updated_at` con `now()`. Para fijar historiales con fechas distintas, el harness desactiva triggers (`session_replication_role = replica`) solo durante el INSERT del escenario; la RPC corre con triggers normales.

## Hallazgo (03.3)

Antes de la corrección: 13/17 coincidían.

| Historial | RPC | Espejo |
| --- | --- | --- |
| `Regular` (mayúscula) | rechaza | **habilitaba** |
| `regular ` (espacio final) | rechaza | **habilitaba** |
| regular → `Pendiente` | rechaza | **habilitaba** |
| regular → `cursando` | rechaza | **habilitaba** |
| regular → `pending` con nota final 8 | habilita | bloqueaba |
| empate de `updated_at`, regular creado después | habilita | bloqueaba |

El espejo normalizaba mayúsculas, espacios y sinónimos; la RPC compara exacto. Los estados no canónicos pueden existir porque `academic_teacher_upsert_grade` guarda `academic_status` con solo `btrim` y la columna no tiene CHECK. Por lectura, el chequeo de correlativas al rendir tenía el mismo patrón (`Aprobada` contaba como aprobada).

## Corrección (03.4)

- `getServerAcademicStatusForSubject` en `academicStatus.js`: réplica literal del filtro SQL (filas vivas, `subject_id`/`program_id` exactos contra los ids con btrim, carrera vacía solo coincide con vacía, `academic_status` crudo distinto de `'pending'`, orden `updated_at` y `created_at` desc con nulos al final).
- `getExamEnrollmentEligibility` habilita solo si ese estado crudo es exactamente `'regular'`; expone `serverAcademicStatus` y, cuando el estado visible es regular pero no canónico, explica que hay que volver a cargarlo.
- `getFinalExamPrerequisiteCheck` cumple una correlativa solo con `'approved'` o `'promocionado'` exactos.
- `getLatestAcademicStatusForSubject` (visualización en dashboard y otras pantallas) no cambia.
- Sin cambios en SQL ni en el servidor.

Resultado: 17/17 coincidencias, 0 más permisivos, 0 más estrictos. Tests nuevos en `examEligibilityServerParity.test.js`; los 75 tests previos del portal alumno siguen pasando. quality:full 2435 tests en 304 archivos PASS, 0 high/critical.

## Pendiente (requiere decisión)

La causa raíz es de datos: valores no canónicos en `student_grades.academic_status`. Normalizar en la escritura o agregar un CHECK cambia el comportamiento del servidor y necesita revisar datos existentes en Staging/Production antes de aplicar; queda propuesto en una tarjeta aparte, sin ejecutar.

## Límites

La prueba diferencial cubre la condición de regularidad. Correlativas, deuda y castigo por ausencia no tienen escenarios de base (el fixture no trae correlativas); la corrección de correlativas está cubierta por tests unitarios. Sin auditor independiente.
