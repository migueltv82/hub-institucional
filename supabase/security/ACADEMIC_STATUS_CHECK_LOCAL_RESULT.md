# 03.5c — CHECK canónico en `student_grades.academic_status` (local)

Fecha: 2026-10-18. Ejecutó: Claude. Entorno: base descartable sobre el contenedor local `supabase_db_codex-baseline-local-7725bdda` (Postgres 17.6.1.165), con los 9 archivos del baseline y el fixture A/B. Staging y Producción: **NONE**.

## Cambio

`supabase/schema/07_academic_operations.sql` agrega `student_grades_academic_status_check`:

```
academic_status in ('pending', 'regular', 'libre', 'promocionado', 'approved', 'failed', 'absent')
```

Es el mismo conjunto que guarda `academic_teacher_upsert_student_grade` (03.5b) y que leen el RPC de mesas y el portal.

Cómo se aplica:
1. Se agrega como `NOT VALID`.
2. Se cuentan las filas no canónicas.
3. Si hay alguna, aborta con `ACADEMIC_STATUS_NONCANONICAL_ROWS: N filas …` (SQLSTATE 23514), sin tocar datos ni dejar el CHECK a medias.
4. Si no hay ninguna, `VALIDATE CONSTRAINT`.

El bloque es idempotente: no hace nada si el CHECK ya existe y está validado.

## Resultado

`node scripts/validateAcademicStatusCheckLocal.mjs` → **PASS**, run `7eb7b92844dc480b` (tras la auditoría), cleanup 0. Run inicial: `143611066729349b`.

| Chequeo | Resultado |
|---|---|
| Baseline nuevo: CHECK presente, validado y con el conjunto canónico | OK |
| Escritura directa `regular` | aceptada |
| Escritura directa `Regular` / `aprobado` | rechazada por el CHECK |
| Re-aplicar 07 sobre una base sin CHECK y con 1 fila `Regular` | aborta con `ACADEMIC_STATUS_NONCANONICAL_ROWS: 1 filas …`; sin CHECK; la fila queda intacta |
| CHECK con el mismo nombre y otra definición | aborta con `ACADEMIC_STATUS_CHECK_MISMATCH` |
| Re-aplicar 07 con la tabla limpia, dos veces | CHECK validado e idéntico (idempotente) |
| RPC 03.5b: `Regular` → `regular` y el alumno se inscribe | OK |
| RPC 03.5b: `cursando` → 22023, sin pisar la fila | OK |
| RPC 03.5b: `Libre` bloquea la mesa | OK |

## Regresiones

| Harness | Run | Resultado |
|---|---|---|
| `validateAcademicStatusWriteLocal.mjs` (03.5b) | `39e23007cf0d7123` | PASS |
| `validateExamEligibilityParityLocal.mjs` (03.3) | `e18efb9db3b42118` | PASS |
| `validateExamPublicationLocal.mjs` (EX.1/EX.7–EX.9) | `8d5c446721cb3d17` | PASS |
| `validateIntegratedAcceptanceLocal.mjs` (QA.1) | `d75e5f3c3bb5c816` | PASS |
| `validateInstitutionSuspensionLocal.mjs` (06.3) | `d1b28ffd93ce1870` | PASS |
| `validateAcademicStatusDiagnostic.mjs` (diagnóstico read-only) | `b8bec8b6f6497b7b` | PASS |

El diferencial de paridad 03.3 tiene 4 escenarios con valores no canónicos, que representan datos legacy:
- `Regular`;
- `regular ` (con espacio final);
- `Pendiente`;
- `cursando`.

Desde 03.5c esos valores ya no se pueden escribir. Esos escenarios sacan el CHECK solo dentro de su propia transacción, que siempre termina en `rollback`, así que la paridad del espejo sigue cubierta para bases previas a 03.5c. Un test fija exactamente cuáles lo hacen.

## Auditoría independiente

Agente auditor en contexto separado. Veredicto inicial: **FAIL**, por un P1.
- **P1:** el harness del diagnóstico sembraba valores legacy después del baseline, y el CHECK lo hacía fallar. Corregido: su fixture saca el CHECK dentro de la base descartable antes de sembrar, y un test lo fija.
- **P3 corregido:** un CHECK con el mismo nombre y otra definición ahora aborta con `ACADEMIC_STATUS_CHECK_MISMATCH`.
- **P3 corregido:** el mensaje de error remite al diagnóstico SQL de Producción.
- **P3 aclarado — "sin tocar datos":** vale para el bloque 03.5c. El archivo 07 completo corre antes un `update` que aplica `btrim` a `academic_status`. Por eso:
  - una fila `regular ` (con espacio final) se corrige en silencio y no aborta;
  - con psql en autocommit, ese update queda aplicado aunque después el bloque aborte;
  - en el SQL Editor, que corre todo en una transacción, el abort revierte todo.
- **P3 aclarado — bloqueo de la tabla:** `ADD … NOT VALID` y `VALIDATE` corren en la misma transacción. Con el volumen actual es irrelevante.

## Producción

No aplicado. El diagnóstico read-only del 18/10 dio 0 filas no canónicas en Producción. Para aplicarlo alcanza con ejecutar el bloque `03.5c` de 07 (o 07 completo, que es idempotente). Necesita el OK puntual de Miguel.
