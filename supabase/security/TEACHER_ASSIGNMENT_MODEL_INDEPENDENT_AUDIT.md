# Auditoria independiente — modelo de asignacion docente (item 16)

Fecha: 2026-10-21. Rama auditada: `release/v1`, HEAD `37961e4`; implementacion evaluada: `143efb7` y su integracion vigente. Auditor: Codex, independiente del implementador Claude.

**Veredicto: FAIL. No queda habilitado ejecutar el 06 en Produccion por este gate.** Hay un P1 de vigencia/acceso y un P2 de backfill reproducidos. No se modifico implementacion, tests ni harness original; no hubo SQL remoto, deploy ni datos de Staging/Produccion.

## Entorno y ejecucion

PostgreSQL Docker local `public.ecr.aws/supabase/postgres:17.6.1.165`, contenedor baseline allowlisted `supabase_db_codex-baseline-local-7725bdda`. Cada ejecucion copia solo el schema baseline y crea una base descartable con nombre aleatorio y marcador de propiedad; fixture A/B del repositorio, perfiles, membresias, legajos, inscripcion y asignaciones relacionales reales dentro de esa base.

- `node scripts/validateTeacherAssignmentModelLocal.mjs`: **PASS, 44 checks**, run `38aaeb518701dc44`, cleanup: 0 bases, 0 errores.
- `npx.cmd vitest run src/services/subjectTeacherAssignments.test.js`: **PASS, 23 tests**. Incluye fallback sin columnas nuevas y baja exclusivamente por RPC.
- Runner independiente local (fuera del repo, directorio hermano `../audit16/probes.mjs`), run `0a62cdcdafb35968`, salida cruda en `../audit16/result.json`, ejecutado desde la raiz del repo: replica el harness sin alterar sus 44 assertions y agrega casos adversariales. Resultado de sus probes abajo. El campo `result: PASS` de ese runner conserva exclusivamente las assertions del harness original; **no constituye PASS de esta auditoria**.
- Los primeros intentos sin elevacion fallaron por restricciones locales de Docker/Vite (`EPERM`), no por producto. Las ejecuciones citadas se repitieron con acceso local autorizado.

## P1 — La vigencia de una licencia no gobierna el acceso docente

Ubicaciones: `supabase/schema/06_subject_teacher_assignments.sql:492`, `:533`; `supabase/schema/07_academic_operations.sql:672`, `:1167`; `src/services/subjectTeacherAssignments.js:76`.

La RPC admite una licencia futura y cambia inmediatamente el titular a `role='licencia'`, creando/actualizando una suplencia `active` con fechas futuras. Tanto `academic_get_teacher_subject_rosters` como `academic_can_manage_subject` deciden por `status/deleted_at/role`, sin comprobar `starts_on/ends_on` ni la vigencia de la licencia. La lectura del servicio tampoco filtra vigencia. El aviso al alumno, en cambio, si filtra las fechas de metadata.

Reproduccion propia mediante RPC real, tras insertar un titular activo de la materia inscripta:

```sql
-- Como admin A autenticado; ids son los del fixture/harness.
select public.academic_create_teacher_subject_leave(
  '<institution A>', 'main', array['<titular activo>'::uuid],
  'a2000000-0000-4000-8000-000000000006',
  'a7000000-0000-4000-8000-000000000002',
  current_date + 3, current_date + 10, 'independent audit'
);
-- Como titular / suplente respectivamente:
select count(*) from public.academic_get_teacher_subject_rosters('<institution A>', 'main');
```

Resultados: RPC `affectedSubjects=1`; titular **0** alumnos antes de comenzar la licencia; suplente **1** alumno antes de comenzar; aviso al alumno **NULL**, coherente con que la licencia aun no empezo. En otro probe, con fechas de la suplencia en columnas y metadata ajustadas conjuntamente a `current_date-10 .. current_date-3`, el suplente sigue obteniendo **1** alumno despues del fin.

Impacto: se retira anticipadamente acceso al titular y se concede/conserva al suplente fuera de su periodo. Afecta datos del padron y potencialmente operaciones del libro porque su helper de autorizacion omite la misma vigencia (esta ultima conclusion es lectura de codigo, no escritura adversarial de notas ejecutada).

No se atribuye exclusivamente a una regresion introducida por `143efb7`: es un fallo de integracion vigente confirmado que incumple el checklist de esta auditoria. Propuesta: definir una unica regla temporal de asignacion efectiva y aplicarla en autorizacion, roster, portal y avisos; probar inicio/fin inclusivos y retorno del titular, sin depender del navegador ni de un cierre manual posterior.

## P2 — Fechas imposibles en metadata abortan el backfill del 06

Ubicacion: `supabase/schema/06_subject_teacher_assignments.sql:284-290`.

El backfill verifica solo el formato con regex antes de convertir a `date`. Una fecha como `2026-02-31` pasa la regex y el cast aborta la sentencia. Reproduccion propia: asignacion legacy con padre existente del mismo scope, `replaces_assignment_id=NULL`, `starts_on=NULL`, `ends_on=NULL`, metadata `leave_parent_assignment_id=<padre valido>` y `starts_on='2026-02-31'`; ejecutar **todo** el archivo 06.

Resultado: `ERROR: date/time field value out of range: "2026-02-31"`. La base descartable se limpio igualmente. La reejecucion idempotente sobre datos validos pasa, pero no demuestra tolerancia a datos legacy mal formados. La regex tampoco prueba validez de UUID, aunque este caso adicional no fue ejecutado y no se presenta como hallazgo confirmado separado.

Impacto: un dato legacy defectuoso bloquea la aplicacion del 06; el resultado parcial depende de como lo ejecute/transaccione el operador. Propuesta: conversion segura con validacion de calendario y manejo explicito de filas invalidas, reporte previo y atomicidad de la migracion. No convertir silenciosamente una fecha invalida en vigencia ilimitada.

## Matriz de cobertura y resultados positivos

| Contrato | Evidencia | Resultado |
|---|---|---|
| Cuatro columnas nuevas | catalogo SQL del harness | PASS |
| Inactiva exige motivo, incluido NULL | UPDATE autenticado con `status='inactive',end_reason=NULL`: SQLSTATE `23514`; control UPDATE permitido | PASS |
| FK reemplazo mismo tenant/workspace/materia/carrera | otra materia en harness; probes propios otra institucion/workspace/carrera: todos `23503`; autorreferencia `23514` | PASS |
| Backfill vinculo y fechas validas; baja legacy motivo desconocido | filas reales fixture, 06 completo; `otro` para baja legacy | PASS |
| Reejecucion idempotente | segunda/tercera corrida del harness, estado relacional comparado | PASS sobre fixtures validos |
| Backfill fechas mal formadas | fecha imposible calendario | FAIL, P2 |
| Baja: alumno/docente/otra institucion | RPC autenticada, `42501`, estado antes/despues igual | PASS |
| Baja: viewer/institucion suspendida | probes independientes: ambos `42501` | PASS |
| Baja: motivo invalido/NULL/futura/doble baja | `22023`, sin cambios en rechazos | PASS |
| Baja nunca borra | fila subsiste `inactive`, `deleted_at` marcado, motivo/fecha/auditoria; pierde roster | PASS |
| Licencia invertida/autorreemplazo | `22023`, sin cambio de estado | PASS |
| Suplencia con vinculo/vigencia | columnas y metadata inspeccionadas despues RPC | PASS |
| Cambio condicion cierra suplencia por FK | `closedReplacements=1`, `fin_suplencia`, pierde roster | PASS |
| Cambio condicion cierra legacy por metadata | probe borra vinculo real dejando metadata; RPC devuelve `closedReplacements=1` | PASS |
| No revive una terminada | `22023`, continua `inactive` | PASS |
| Licencia actual y avisos alumno | nombres correctos en RPC; suplente accede, cierre revoca acceso | PASS |
| Vigencia futura/vencida | acceso real y licencia futura mediante RPC | FAIL, P1 |
| Lectura sin columnas nuevas | test servicio con error `42703`, segundo select sin modelo, mantiene filtro deleted_at | PASS unitario |
| Modal fecha local, no fecha futura | lectura: `localToday()` usa getters locales; input `max={localToday()}`; RPC rechaza futuro | PASS estatico + SQL |
| Baja frontend sin update directo | servicio llama `academic_end_teacher_assignment`; tests verifican sin update; busqueda consumidores | PASS |
| 06 completo no afloja policies | snapshot `pg_policies` (roles, cmd, qual, with_check) antes/despues: identico | PASS |

## Limitaciones y gate

No se usaron copias de datos productivos: los casos legacy son fixtures relacionales locales representativos. No se ejecuto navegador ni E2E visual del modal; fecha local/max se revisaron en codigo, compatibilidad mediante tests y rechazo futuro mediante SQL. No se afirma prueba de todos los husos horarios ni de cada formato de error PostgREST en una base vieja real. El gate global `npm.cmd run check` lo integra el coordinador; este informe no lo anticipa.

Security/Database/Adversarial Review: **FAIL** por P1/P2 abiertos. Sin P0 confirmados. Sin cambios de implementacion ni autorizacion de despliegue. **QUALITY GATE: FAIL**.

Actualizacion del coordinador: `npm.cmd run check` PASS en la base auditada, 360 archivos / 2746 tests; auditorias de repositorio/bundle, lint y build PASS. Typecheck no disponible, aviso previo de chunks >500 kB. CHIEF CODE AUDITOR independiente valido fidelidad del informe, reproducciones y severidades. El resultado automatizado no cambia el FAIL ni habilita el 06.

Nota de publicacion: aparecieron cambios posteriores de Claude hasta `0a120d0`. Este informe audita `37961e4`; no se reauditaron los correctivos posteriores ni se afirma que todos los hallazgos persistan en el nuevo HEAD. La publicacion de evidencia no habilita Produccion.
