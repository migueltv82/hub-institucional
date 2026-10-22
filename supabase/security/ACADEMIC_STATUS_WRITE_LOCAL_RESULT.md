# 03.5b — academic_status canónico en la escritura del docente (opción A)

Fecha: 2026-10-16. Decisión humana: opción A ahora, B (CHECK) condicionada a diagnóstico remoto = 0 (tarjeta 03.5). Implementado por Claude mientras Codex no estaba disponible; la auditoría queda para Codex.

## Cambio

- `supabase/schema/07_academic_operations.sql`, función `academic_teacher_upsert_student_grade`: calcula `clean_academic_status` antes de bloquear filas.
  - Vacío o null → `pending`.
  - `lower(btrim(...))` dentro del conjunto `{pending, regular, libre, promocionado, approved, failed, absent}` → se guarda tal cual.
  - Sinónimos explícitos: pendiente, aprobado/a, desaprobado/a, reprobado/a, promocionada, promocion/promoción, ausente.
  - Cualquier otro valor → `raise exception 'ACADEMIC_STATUS_INVALID' using errcode = '22023'`, sin escribir.
  - Firma, `SECURITY DEFINER`, `search_path`, grants, `lock_version` y validaciones de identidad sin cambios.
- `src/services/studentGrades.js`: el error se traduce a un mensaje en español. Test agregado en `studentGrades.test.js`.
- Sin cambios en: el espejo del portal (`src/modules/alumnos/lib/academicStatus.js`), el RPC de mesas, datos existentes, ni CHECK.

## Verificación

| Prueba | Resultado |
| --- | --- |
| `node scripts/validateAcademicStatusWriteLocal.mjs`, run `2028ab2b4872756d` | **PASS 14/14**, cleanup 0 |
| Mismo harness contra la función anterior (control), run `d2d166d6b6bffd93` | FAIL 10/14 como se esperaba: 'Regular' se guardaba crudo y el alumno quedaba bloqueado para la mesa; 'cursando' y 'xyz' se aceptaban |
| Contrato de la función | `SECURITY DEFINER`, `search_path=public, pg_temp`, EXECUTE anon = false, authenticated = true |
| Paridad 03.3 (`validateExamEligibilityParityLocal.mjs`), run `9322f3c9c5dfc875` | PASS 17/17, `mirrorMorePermissive=[]` |
| Tests focales | `scripts/validateAcademicStatusWriteLocal.test.js` 4/4 · `src/services/studentGrades.test.js` 7/7 |

El harness usa la base descartable con el baseline de 9 SQL y el fixture A/B de 03.3, más la cursada y la titularidad de FIX-A-01. Las llamadas corren como `authenticated` con el `sub` del docente (y del alumno para la mesa), igual que en 03.3. Cada escenario corre en una transacción con `ROLLBACK`.

Escenarios cubiertos:
- 'Regular', ' regular ', 'APROBADO', 'ausente', 'Pendiente', 'desaprobada', 'Promoción', null y vacío se guardan en canónico;
- 'cursando' y 'xyz' → 22023 sin fila;
- un rechazo posterior no pisa una nota válida (lock_version sigue en 1);
- 'Regular' habilita la mesa y 'Libre' la bloquea.

## Límites

- No se probó por HTTP con un JWT de GoTrue: se probó por SQL con claims, igual que 03.3. La autorización HTTP del RPC ya está cubierta por el round-trip 05.1.
- Filas no canónicas ya existentes no se tocan: eso es 03.5c, sujeta al diagnóstico remoto.
- Aplicarlo en Staging queda para la promoción STG1. Staging, Production, SQL remoto y deploy: NONE.
