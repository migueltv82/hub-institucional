# 03.5a — Diagnóstico de condiciones académicas con datos no canónicos

Fecha: 2026-10-16. Resultado funcional local: PASS. QUALITY GATE: PASS WITH WARNINGS. Resultado funcional PASS; DoD administrativo BLOQUEADO por autorización de commit/push. Pendiente de auditoría final de Claude.

Base de trabajo: d6d175247989cdcd90edf336246c1adf0883fb8f, contiene b5b85d1. Worktree aislado `worktrees/academic-status-035a`; no se modificó el checkout principal.

## Reproducción

```powershell
node scripts/validateAcademicStatusDiagnostic.mjs --target supabase_db_codex-baseline-local-7725bdda
npx.cmd vitest run --config vitest.config.js scripts/validateAcademicStatusDiagnostic.test.js
npm.cmd run quality:full
```

El target es obligatorio y exacto. El script verifica imagen PostgreSQL 17.6.1.165 y salud, clona solamente el esquema en una base aleatoria local y aplica los nueve SQL del baseline existente. No crea servicios Auth, gateway, Edge ni fixtures en la base fuente. Inserta cuatro usuarios sintéticos, dos instituciones y 33 calificaciones (15 inválidas vivas, 14 canónicas vivas y cuatro borradas). Cada fila usa un intento distinto para respetar el índice vigente.

Ejecuta el archivo diagnóstico original, sin reescribir su consulta, dentro de `BEGIN READ ONLY`, con límite de diez segundos y `ROLLBACK`. Comprueba `transaction_read_only=on` y compara el hash de todas las filas de calificaciones antes/después. PostgreSQL documenta la protección en [SET TRANSACTION](https://www.postgresql.org/docs/17/sql-set-transaction.html).

## Conteos exactos verificados

`regular␠` representa el valor crudo con un espacio final; no se normaliza.

| Institución | Valor crudo | Longitud | Filas vivas | Alumnos distintos |
|---|---|---:|---:|---:|
| A | Regular | 7 | 3 | 2 |
| A | regular␠ | 8 | 2 | 1 |
| A | Pendiente | 9 | 1 | 1 |
| A | cursando | 8 | 2 | 1 |
| B | Regular | 7 | 1 | 1 |
| B | regular␠ | 8 | 3 | 2 |
| B | Pendiente | 9 | 2 | 2 |
| B | cursando | 8 | 1 | 1 |

Los siete valores canónicos están presentes en ambas instituciones y excluidos del resultado. También quedan excluidas cuatro filas no canónicas con `deleted_at`. Se valida nombre institucional, fecha de última modificación válida, ausencia de grupos extra y alumnos distintos.

Evidencia: `ACADEMIC_STATUS_DIAGNOSTIC_LOCAL_EVIDENCE.json`, run `1aced670ebc397ce`. SHA256 del SQL sin cambios: `2c37c4cbcd1d8182e1ad74cd32390cd74856513ccdb21e7916f9cb318b7483c2`.

## Seguridad, limpieza y revisión

Sin cambios a schema, RPC, grants, ownership ni consulta diagnóstica del repositorio. Solo setup y fixtures en la base descartable generada. No se extraen datos fuente ni secretos. SQL remoto, Staging, Production y deploy: NONE. Mutaciones remotas realizadas: comentarios/estado de esta tarjeta Trello. Commit/push NO ejecutados: rechazados por revisión automática antes de crear el proceso. Sin cambios remotos a servicios o datos.

Cleanup: cero bases, contenedores y archivos temporales del ensayo. Los documentos y el worktree son entregables conservados. Los primeros ensayos fallaron por timeout al restaurar muchos DDL separados y por intentos duplicados en el fixture; todos verificaron eliminación de su base. Se corrigió el setup sin alterar restricciones ni debilitar pruebas.

CHIEF CODE AUDITOR independiente: Code Review PASS y Adversarial Review PASS; P2 de creación parcial corregido y cerrado, sin P0/P1/P2/P3 abiertos. La intención se registra antes de CREATE; cleanup consulta existencia incluso si la respuesta falla y solo elimina el nombre aleatorio previamente ausente con owner comprobado y marcador propio o nulo. Si no puede verificar, informa FAIL/unverified.

Limitación: prueba administrativa de exactitud del diagnóstico; no acredita RLS ni rendimiento con volumen productivo. El diagnóstico puede escanear la tabla y el fixture pequeño no permite concluir desempeño real. Auditoría final de tarjeta reservada a Claude.

## Controles

Pruebas focales: PASS, cuatro casos; rechazan target remoto/implícito, conteos incorrectos, valores normalizados, mezcla de instituciones, grupos faltantes/duplicados/canónicos y modo writable. Lint focal: PASS. Ensayo PostgreSQL real: PASS. quality:full PASS (exit 0): 309 archivos / 2452 tests, lint, auditoría de repositorio, build (7,82 s), auditoría de producción (114 archivos) y auditoría de dependencias al umbral high. Advertencias: 1 vulnerabilidad low y 9 moderate preexistentes, sin high/critical; chunks mayores de 500 kB. Typecheck: NO DISPONIBLE (JS). Browser/E2E y RLS: NO APLICA. Database, Security, Code Review y Adversarial Review: PASS. Performance: WARNING, sin medición de volumen productivo.

Durante la ejecución el maestro congeló la rama compartida antigua y exigió `release/v1`, cuyo target remoto se verificó en d6d1752; la tarjeta fue devuelta por el tablero a la cola y QA.1 pasó a activa. Se avisó a Claude antes de commit/push y se verificó el nuevo target. Se conservó el trabajo al pasar a release/v1 sobre el mismo SHA. Se intentó solicitar la entrega Git prevista, pero la revisión automática rechazó el comando antes de ejecutarlo: la autorización genérica de continuar no cubre inequívocamente commit/push frente a la regla explícita de aprobación en chat. No se reintentó ni se eludió. Se requiere aprobación explícita del usuario para commit de 03.5a y push únicamente a release/v1.
