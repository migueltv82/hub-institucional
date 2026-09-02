# Handoff: flujo de mesas de examen (precronograma -> revision docente -> plazo 24hs -> confirmacion -> visible al alumno)

Documento de trabajo puntual, no vive en la tabla de "Documentacion viva" de `CLAUDE.md`. Borrar
este archivo cuando el trabajo este cerrado y volcado a `docs/WORKLOG.md`.

Como usar esto con Codex durante el fin de semana: pasarle **una etapa a la vez**, en orden. Cada
etapa tiene su "hecho cuando" — no avanzar a la siguiente sin que ese criterio este en verde. Si
Codex necesita mas contexto del que hay aca, que lea primero `CLAUDE.md` (raiz del repo) y esta
seccion de contexto completa antes de tocar nada.

## Estado actual (al cerrar la sesion del 2026-08-28)

- **Hecho**: investigacion completa del flujo real (verificado archivo por archivo, no supuesto) y
  decision tomada con Miguel: consolidar todo sobre el motor "V2.1" y eliminar el motor huerfano.
  Ver seccion "Contexto" abajo para el resumen completo.
- **Hecho, sin aplicar todavia**: `supabase/setup_multi_tenant/23_exam_teacher_objection_deadline_and_swap.sql`
  ya esta escrito completo (columnas de reasignacion portadas, RPC de objecion con permuta atomica,
  trigger de metadata, RPC `academic_reconcile_expired_exam_confirmations`, RPC
  `academic_admin_confirm_exam_assignment`). **No fue aplicado en ningun Supabase todavia, no tiene
  tests corridos contra una base real, y no esta commiteado en git.** Es el punto de partida de la
  Etapa 0.
- **No empezado**: todo lo demas (servicios JS, logica del motor, UI, borrado del motor huerfano).

## Contexto (leer antes de tocar codigo)

Repo `examenes`: React 19 + Vite + JS puro sin TypeScript + Supabase. Motor de mesas de examen es
el corazon del producto.

**Hallazgo clave, verificado con grep exhaustivo, no es una suposicion**: el repo tiene dos motores
de armado de mesas coexistiendo.

- El que parecia "de produccion" (`src/utils/examEngine/planning/generateRegular.js`,
  `src/hooks/useCronogramaGeneration.js`) esta **completamente huerfano**: cero componentes `.jsx`
  reales lo importan. Nunca escribe el `cronograma` que ve el alumno. Se va a borrar (Etapa 6).
- El motor **"V2.1"** (pestana "Armar mesas" en la UI, componente
  `src/features/exams/ExamEngineV21FieldTestPage.jsx`) es el **unico que hoy realmente publica**
  mesas al `cronograma` real: `publicarCronogramaFinalDesdeMotor` en
  `src/components/GeneradorCronograma.jsx:454-468` -> `setCronograma` -> autosave (debounce 700ms en
  `useWorkspacePersistence.js`) -> tabla `workspace_snapshots.payload.cronograma` -> lo lee el
  alumno en `src/modules/alumnos/services/studentPortalData.js` (`buildExams` /
  `isStudentVisibleExam`, filtra por `mesa.estado === 'confirmada'`).
- El flujo de "el docente confirma u objeta su mesa" ya existe y funciona (RPCs
  `academic_teacher_confirm_exam_assignment` / `academic_teacher_object_exam_assignment`, tabla
  `exam_teacher_assignments`, UI real en `src/modules/docentes/TeacherPortalModule.jsx`), pero
  **no esta conectado a la decision de que mesa se publica**: hoy esa decision depende de una marca
  manual del admin (`estadoFinal`, cargada por CSV en
  `src/features/exams/examEngineV21FieldTestService.js`,
  `createConfirmedFinalReviewRows`/`reconcileFinalTribunalReview`) que ignora por completo si los
  docentes confirmaron.
- **No existe ningun mecanismo de plazo/vencimiento en el proyecto.** Sin `pg_cron`, sin Edge
  Function programada, sin columna `deadline` en ninguna tabla (verificado, cero resultados en todo
  el repo). El plazo de 24hs se resuelve de forma **perezosa** (bajo demanda, nunca con un cron):
  se guarda `objection_deadline` al publicar, y una RPC de reconciliacion pasa a `confirmed`
  cualquier fila `pending` cuyo plazo ya paso, invocada en cada lectura (fetch del docente, fetch
  del admin).
- Tres migraciones de reasignacion/permuta docente existian solo en `supabase/migrations/`
  (formato Supabase CLI: `20260828144600`, `20260828152423`, `20260828153013`) y nunca se portaron
  a `supabase/setup_multi_tenant/`, que es la unica fuente de verdad del SQL segun `CLAUDE.md`. La
  fase 23 ya escrita las consolida ahi.

**Alcance de esta entrega**: etapas 1 a 4 del flujo pedido por Miguel (precronograma, tribunal,
revision docente con plazo de 24hs y confirmacion manual/automatica, visibilidad al alumno).
Quedan afuera para una entrega posterior: simulacion del dia de la mesa, acta de examen, y separar
la nota de mesa de la nota de cursada (hoy comparten `grade_type='final'` sin trazabilidad a
`exam_enrollment_id`).

---

## Etapa 0 — Aplicar y verificar el SQL ya escrito

**Que hacer:**
1. Leer completo `supabase/setup_multi_tenant/23_exam_teacher_objection_deadline_and_swap.sql`
   (ya existe en el repo, sin commitear).
2. Aplicarlo en el SQL Editor de una institucion/proyecto de **prueba** de Supabase (nunca
   produccion todavia).
3. Correr la verificacion de firma del RPC de objecion (mismo patron que usa `CLAUDE.md` para el
   RPC de mesas):
   ```sql
   select p.oid::regprocedure as firma_actual
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'academic_teacher_object_exam_assignment',
       'academic_reconcile_expired_exam_confirmations',
       'academic_admin_confirm_exam_assignment'
     );
   ```
   Tiene que devolver las tres funciones.
4. Correr `supabase/security/rls_negative_tests.sql` contra esa misma base. Si hace falta, agregar
   dos casos negativos nuevos ahi: un docente sin rol admin no puede llamar
   `academic_admin_confirm_exam_assignment` (debe fallar `ACADEMIC_ADMIN_CONFIRM_FORBIDDEN`), y un
   usuario sin membership no puede reconciliar otra institucion.
5. Crear `supabase/migrations/<timestamp>_exam_teacher_objection_deadline.sql` con **solo el
   delta nuevo** (columna `objection_deadline` + las dos RPCs nuevas de reconciliacion/confirmacion
   admin) — las columnas de reasignacion y el trigger de swap ya estan aplicados ahi desde las tres
   migraciones sueltas existentes, no hay que repetirlos en ese archivo.
6. Actualizar `supabase/setup_multi_tenant/00_README.md`: agregar `23_exam_teacher_objection_deadline_and_swap.sql`
   a la lista de migraciones (01-22 -> 01-23), y una seccion corta explicando el modelo de
   reconciliacion perezosa (por que no hay cron) y que el plazo es 24hs desde publicacion. Seguir
   el estilo de la seccion existente "## Confirmacion docente de mesas de examen (fase 13)".

**Hecho cuando:** las tres funciones existen en la base de prueba, `rls_negative_tests.sql` da
`SECURITY_TESTS_OK` con `failed_count = 0`, y el README + el archivo de `supabase/migrations/`
estan escritos.

## Etapa 1 — Servicios JS

**Archivos:**
- `src/services/examTeacherAssignments.js`:
  - En `publishExamTeacherAssignmentsForReview` (linea ~164), agregar
    `objection_deadline: new Date(Date.now() + 24*60*60*1000).toISOString()` junto a
    `confirmation_status: 'pending'`.
  - Nueva funcion `reconcileExpiredExamConfirmations({ institutionId, workspaceKey, examTableId })`
    que llama al RPC `academic_reconcile_expired_exam_confirmations`. Mismo patron de manejo de
    "funcion no desplegada todavia" que ya usa `resetExamProcessForWorkspace`
    (`isMissingExamProcessResetFunction`) — no romper si el RPC no esta.
  - Nueva funcion `confirmExamAssignmentAsAdmin({ institutionId, workspaceKey, examTableId, teacherId })`
    que llama a `academic_admin_confirm_exam_assignment`.
  - Modificar `fetchExamTeacherAssignmentsForReview` para invocar la reconciliacion antes del
    `select`.
- `src/modules/docentes/services/teacherExamAssignments.js`: en `fetchTeacherExamAssignments`,
  llamar la misma reconciliacion antes del `select`, mismo fallback silencioso si el RPC no esta
  desplegado todavia.

**Tests:** agregar casos en `src/services/examTeacherAssignments.test.js` (ya existe) para: el
publish setea `objection_deadline` ~24h en el futuro; `reconcileExpiredExamConfirmations` llama al
RPC con los parametros correctos y maneja el caso de funcion faltante; `confirmExamAssignmentAsAdmin`
idem.

**Hecho cuando:** `npm.cmd run test -- examTeacherAssignments` (y el test de
`teacherExamAssignments.js`) pasan en verde.

## Etapa 2 — Logica de negocio del motor

**Archivo:** `src/features/exams/examEngineV21FieldTestService.js`.

- Nueva funcion `createConfirmedFinalReviewRowsFromTeacherStatus(tribunalRows, teacherReviewSummary)`
  — reemplaza, solo para el camino automatico, a `createConfirmedFinalReviewRows`. Incluye una mesa
  unicamente si **todas** sus filas en `exam_teacher_assignments` (las que existan de
  titular/vocal1/vocal2) estan en `confirmation_status === 'confirmed'`.
- Ampliar `summarizeTeacherReviewStatus` (linea ~687) para exponer `teacherId` en cada `entry` (hoy
  solo expone `nombre`/`status`) — hace falta para el boton de confirmacion puntual de la Etapa 3.
- No tocar `reconcileFinalTribunalReview.js` (`src/utils/examEngine/planning/finalReview/`): una
  mesa que no entra en `reviewedRows` ya cae en `FINAL_NEEDS_REVIEW` por el camino existente, que es
  exactamente el estado que `buildPublishedCronogramaFromFinalTribunals` ya excluye del cronograma
  publicado.
- `createConfirmedFinalReviewRows` (el bypass total existente, disparado hoy por
  `autoConfirmFinalReview`) **no se toca** — sigue siendo el boton de "confirmar todo el cronograma
  de un saque" para pruebas masivas, complementario al bypass puntual.

**Tests:** en `src/features/exams/examEngineV21FieldTestService.test.js` (ya existe), casos para
`createConfirmedFinalReviewRowsFromTeacherStatus`: mesa con las 3 filas `confirmed` -> incluida;
mesa con una `pending` -> excluida; mesa con una `objected` -> excluida; mesa sin ninguna fila en
`teacherReviewSummary` -> excluida; mesa con solo titular+vocal1 (vocal2 vacio en la mesa original)
-> incluida si las que existen estan confirmadas.

**Hecho cuando:** `npm.cmd run test -- examEngineV21FieldTestService` pasa en verde.

## Etapa 3 — UI

**Archivos:**
- `src/features/exams/ExamEngineV21FieldTestPage.jsx`:
  - `refreshTeacherReviewStatus` pasa a llamar primero `reconcileExpiredExamConfirmations`, despues
    `fetchExamTeacherAssignmentsForReview`.
  - Nueva funcion `confirmReadyMesasFromTeacherReview()`: arma las filas confirmadas con la funcion
    de la Etapa 2 y las pasa a `importFinalReviewRows` (ya existente).
  - Nuevas `confirmAssignmentAsAdmin(examTableId, teacherId)` y `confirmMesaAsAdmin(examTableId)`
    que llaman al servicio de la Etapa 1 y despues refrescan el estado.
  - `publishOfficialSchedule` no cambia.
- `src/features/exams/components/TeacherConfirmationStatusPanel.jsx`:
  - Boton "Confirmar mesas listas" junto al "Actualizar" existente (linea ~69).
  - Dentro de cada mesa (linea ~93) y de cada `RoleStatus` (linea ~15), boton "Confirmar (admin)"
    para bypass puntual, visible cuando `entry.status !== 'confirmed'`.

**Hecho cuando:** `npm.cmd run lint` y `npm.cmd run test` completos en verde.

## Etapa 4 — Prueba manual end-to-end (obligatoria antes de la Etapa 5)

Con el dev server (`npm.cmd run dev`), en una institucion de prueba:

1. Generar precronograma -> armar tribunal -> publicar para revision docente.
2. Loguearse como el docente asignado, confirmar una mesa y objetar otra.
3. Como admin, refrescar el panel y confirmar que la objetada **no** entra en "mesas listas" y la
   confirmada si.
4. Probar el bypass: confirmar manualmente una mesa pendiente como admin, refrescar, confirmar que
   ahora si entra.
5. Publicar cronograma oficial y verificar en el portal alumno que solo aparecen las mesas
   confirmadas.
6. Verificar el vencimiento: ajustar `objection_deadline` a mano en una fila de prueba via SQL
   Editor (a un valor ya pasado) y confirmar que el siguiente refresh la marca `confirmed` sola.

**Hecho cuando:** los 6 pasos funcionan tal cual se describen, contra la institucion de prueba.

## Etapa 5 — Retirar el motor huerfano (recien despues de la Etapa 4 en verde)

Borrar de hoja a raiz, corriendo `npm.cmd run test` completo despues de cada lote (para agarrar
cualquier importador que se haya escapado):

1. `src/components/examEnginePreview/*`, `ExamAdminReviewWorkflowPanel.jsx` +
   `isExamAdminReviewWorkflowEnabled.js` (+tests).
2. `src/hooks/useRegularExamPreviewEngine.js` (+test, +`.spec.md`).
3. `src/utils/examEngine/preview/*` (8 archivos).
4. `src/utils/examEngine/audit/{auditDateVocalAssignmentOrder,vocalBottleneckDiagnosis,auditJointDateVocalPlanner,auditIncompleteTribunals,auditRescheduleIncompleteTribunals,auditVocalRepairPass}.js`,
   `src/utils/examEngine/experimental/{jointDateVocalPlanner,rescheduleIncompleteTribunals}.js`
   (+tests).
5. `src/utils/examEngine/index.js`.
6. `src/hooks/useCronogramaGeneration.js`, `useManualMesaEditing.js`,
   `src/services/examGenerationEngine.js`, `src/utils/examEngine/manualScheduleUtils.js`,
   `src/components/generadorCronograma/CronogramaTable.jsx` (+tests de cada uno).
7. `src/utils/examEngine/planning/{generateRegular,assignTitular,assignVocales,planTentativeDates,repairTribunals,repairIncompleteTribunalVocals,planDatesAndVocales,buildCandidates,generateSpecial}.js`,
   `src/utils/examEngine/diagnostics/{feasibility,riskRanking}.js` (+tests).

**No tocar** (compartido con V2.1, ya verificado por grep):
`src/utils/examEngine/rules/{halfPlusOne,affinities,availability,roleConflicts,regularCalls}.js`,
`src/utils/examEngine/validation/validateTribunals.js` (lo usa `compactMesas.js`, que a su vez usa
`planBulkMesaCombinations.js` de V2.1), `src/utils/examEngine/planning/compactMesas.js`,
`src/components/generadorCronograma/{config.js,helpers.js}`.

**Hecho cuando:** `npm.cmd run check` completo (lint + test + build) pasa en verde con todo lo de
la lista borrado.

## Etapa 6 — Cierre

1. Aplicar la fase 23 en el proyecto Supabase real (no solo el de prueba), siguiendo el checklist
   manual de `CLAUDE.md` (seccion Supabase).
2. Sumar la entrada correspondiente a `docs/WORKLOG.md`.
3. Borrar este archivo (`docs/EXAM_BOARD_WORKFLOW_HANDOFF_2026-08.md`) una vez que todo lo de
   arriba este commiteado.

## Notas

- No inventar un mecanismo de cron: el plazo se resuelve siempre bajo demanda, nunca por un job
  programado.
- El bypass de admin (RPC + boton) es explicitamente para pruebas — no ocultarlo ni condicionarlo a
  ningun feature flag.
- Windows: usar `npm.cmd`, no `npm`, en PowerShell.
