# AUD.16 · Punto 3 — Auditoría independiente del modelo de asignación docente

- Fecha: 2026-10-21
- Auditor: agente Claude, primera pasada; no reemplaza el gate de Codex
- Commit auditado: `143efb7` (rama `release/v1`)
- Alcance: solo local (contenedor `supabase_db_codex-baseline-local-7725bdda`, bases descartables `gotrue_harness_<16hex>`, todas borradas). Sin Supabase remoto, Staging ni Prod.

## Veredicto: PASS WITH WARNINGS

No encontré P0 ni P1. Permisos, constraints, FK de reemplazo, cierre de licencia, "no revive" y re-ejecución del 06 funcionan como se afirma. Hay un hallazgo P2 que contradice una afirmación textual del resultado local (el backfill sí se corta con metadata mal formada), uno P2 de producto (la vigencia no se aplica en ningún acceso) y uno P2 funcional (no se puede dar de baja una suplencia que todavía no empezó). Ninguno bloquea correr el 06 en Prod si se confirma que la tabla sigue como en la evidencia del implementador (3 filas `titular`/`active`/`manual`, sin metadata). Ver "Habilita Prod".

## Hallazgos

### P2-1 — El backfill se corta con metadata mal formada; la afirmación "una fecha mal escrita no corta el script" es falsa
- `supabase/schema/06_subject_teacher_assignments.sql:282-300` (regex en 286, 289, 293).
- Los guardas son solo de formato (`~ '^\d{4}-\d{2}-\d{2}$'`, `~ '^[0-9a-fA-F-]{36}$'`), pero el `::date` / `::uuid` se evalúa igual y revienta con valores que pasan el regex.
- Reproducción (base creada con el 06 VIEJO `git show 143efb7^:...`, una suplencia con metadata, y luego el 06 nuevo dentro de `begin; ... rollback`):

  | `metadata` de la suplencia | Resultado |
  |---|---|
  | `starts_on: "2026-13-45"` | `ERROR: date/time field value out of range` |
  | `ends_on: "2026-02-31"` | `ERROR: date/time field value out of range` |
  | `starts_on: "0000-00-00"` | `ERROR: date/time field value out of range` |
  | `leave_parent_assignment_id: "------------------------------------"` (36 guiones) | `ERROR: invalid input syntax for type uuid` |
  | fin antes de inicio, uuid en mayúsculas, año 9999, metadata array o número | OK (fin antes de inicio queda con `ends_on` NULL) |

- Impacto: el script entero aborta (si el SQL Editor lo corre en una transacción no queda nada a medias, pero el 06 no se aplica). Es un fallo ruidoso, no corrupción. En Prod, según la evidencia, la metadata está vacía, así que no se dispara; pero el 06 se re-ejecuta en cada deploy y el mismo bug vive para siempre en la tabla.
- Corrección propuesta: mover la conversión a una función auxiliar con `exception when others then null` (por ejemplo `pg_temp.safe_date(text)` y `pg_temp.safe_uuid(text)`), o validar con `to_char((x)::date,'YYYY-MM-DD') = x` dentro de un bloque `do $$ ... begin ... exception`. Corregir también la frase del resultado local.

### P2-2 — No se puede dar de baja una suplencia que todavía no empezó
- `06:681` (fecha no futura) + `06:702` (`effective_end < starts_on`).
- Si `starts_on > current_date`, ninguna fecha permitida (<= hoy) es >= `starts_on`, así que `academic_end_teacher_assignment` siempre falla.
- Reproducción: `academic_create_teacher_subject_leave(..., current_date+5, current_date+9)`; luego `academic_end_teacher_assignment(<suplente>, 'error_de_carga', null)` → `La fecha de fin es anterior al inicio de la asignacion [22023]`. Con cualquier motivo y cualquier fecha.
- La única salida es volver al titular con `academic_update_teacher_assignment_condition` (que sí maneja el caso con `ends_on = starts_on`, línea 622). Una licencia futura cargada por error al docente equivocado no se puede anular desde "Dar de baja".
- Corrección propuesta: si `starts_on > current_date`, usar `effective_end := starts_on` (misma regla que ya usa la RPC de condición) o permitir fin == inicio futuro para `error_de_carga`/`reemplazado`. El harness no cubre este caso.

### P2-3 — `starts_on` / `ends_on` son informativos: ningún acceso los aplica
- El commit presenta las columnas como "vigencia", pero ningún acceso las lee: `academic_get_teacher_subject_rosters` y `academic_can_manage_subject` (07:672-680, 1139+) filtran por `role`/`status`; los avisos al alumno (07:1285+) leen `metadata.leave_starts_on/leave_ends_on`, no las columnas; la Edge `admin-users` (`index.ts:2128-2140`) lee `metadata.leave_*` y espera `source = 'teacher_leave_replacement'` mientras la RPC escribe `source = 'leave'` (la rama de suplente nunca se activa).
- Reproducción: licencia con `ends_on = current_date-10` → suplente sigue con padrón 1 y `academic_can_manage_subject = true`; el titular sigue en `role='licencia'` con padrón 0. El aviso al alumno sí desaparece. Una suplencia con `starts_on = current_date+30` ya tiene padrón y puede gestionar la materia hoy.
- No es una regresión de este commit (el comportamiento previo era igual), pero conviene dejarlo explícito: hoy una licencia vencida exige que gestión vuelva a poner al titular a mano, y el portal (RPC) y la Edge discrepan para el titular. Está en el alcance de la "fase B" que el propio resultado menciona.
- Corrección propuesta: documentarlo como límite; o en fase B hacer que las lecturas usen `starts_on <= current_date and (ends_on is null or ends_on >= current_date)` para `suplente`, y unificar la Edge.

### P3-1 — Baja de una suplencia deja al titular trabado en `licencia`
- Dar de baja al único suplente activo (por `academic_end_teacher_assignment`) deja al titular `role='licencia'`, `status='active'`, sin padrón y sin nadie a cargo; el aviso del alumno cae al texto genérico "docente suplente". La RPC devuelve `remainingReplacements` pero no avisa del caso inverso.
- Corrección: al terminar una fila con `replaces_assignment_id`, devolver `parentStillOnLeave: true` y que la UI ofrezca "volver a titular".

### P3-2 — El FK de reemplazo admite ciclos y no ata el rol
- `06:273-279`. Reproducción (superusuario): `01.replaces = 02` y `02.replaces = 01` se aceptan. Tampoco hay CHECK de que `replaces_assignment_id` solo exista con `role='suplente'`. La ruta `ON CONFLICT` de la licencia puede generar el ciclo (R en licencia con reemplazo A, donde A ya es titular activo).
- Corrección: CHECK `replaces_assignment_id is null or role = 'suplente'` (ojo con el cambio de condición, que hoy no limpia el vínculo al promover a titular) y validación anti-ciclo en la RPC de licencia.

### P3-3 — La RPC de baja acepta fechas arbitrariamente viejas
- `06:681`. `p_ends_on = '1900-01-01'` con `starts_on` NULL se acepta (verificado: `endsOn: 1900-01-01`). No hay cota inferior ni contra `created_at`.
- Corrección: `effective_end >= coalesce(starts_on, created_at::date)`.

### P3-4 — Reemplazante que ya era titular activo se pisa; el vínculo de otra licencia se sobrescribe
- `06:546-558` (`on conflict ... do update`). Es comportamiento previo, ahora además sobrescribe `replaces_assignment_id`, `starts_on` y `ends_on`: si el mismo reemplazante cubre a dos titulares de la misma materia, queda un único vínculo (el último) y el primer titular, al volver, no cierra esa suplencia por el vínculo real. Verificado con un reemplazante titular de la misma materia: la fila pasó a `suplente` con `replaces` del último titular.
- Corrección: rechazar si ya existe una fila activa del reemplazante en esa materia con `role = 'titular'` o con otro `replaces_assignment_id`.

### P3-5 — Fecha de la baja: UTC en el servidor, local en el front; deploy
- La RPC usa `current_date` (UTC en Supabase) y el panel manda fecha local. Para Argentina (UTC-3) la fecha local nunca supera la de UTC, así que no falla; pero `academic_update_teacher_assignment_condition` (línea 622) y la baja con `p_ends_on = null` guardan la fecha UTC (puede ser "mañana" local entre las 21:00 y 24:00).
- El `max` del `<input type="date">` es solo un atributo del navegador (`TeacherRosterSection.jsx:2337`); el botón "Confirmar baja" no se deshabilita con fecha futura tipeada, el servidor la rechaza con 22023. El test solo comprueba que el atributo `max` exista, no su valor.
- Orden de deploy: el resultado local manda correr el 06 y recién después publicar el front. Entre ambos pasos, el front viejo (`deactivateSubjectTeacherAssignment`, update directo) falla con 23514 al dar de baja. Es una ventana corta y con mensaje de error; basta decirlo en el runbook (o publicar el front primero: contra la base vieja muestra "Falta actualizar la base").

### P3-6 — Código muerto que esquiva el RPC
- `src/services/subjectTeacherAssignments.js:279` `updateSubjectTeacherAssignmentRole` hace `update({ role })` directo (puede poner `licencia`/`suplente` sin cerrar suplentes). No se usa en `src/` fuera de tests. Borrarla o dejarla marcada como no usar. Las policies de UPDATE/DELETE de gestión siguen permitiendo escribir directo (incluido borrar); "nunca borra" vale solo para la RPC.

### P3-7 — FK compuesta bloquea renombrar materia/carrera/workspace de un par vinculado
- El FK referencia `(institution_id, workspace_key, subject_id, program_id, id)` con `ON UPDATE NO ACTION`: cambiar `subject_id`/`program_id` de un padre con suplentes (o de un suplente vinculado) da 23503. Es lo deseado para mantener la integridad, pero cualquier migración futura de canonización de códigos tiene que desvincular primero.

## Verificado y correcto

1. **CHECK de `end_reason`**: inactive con NULL, vacío, inválido o en mayúsculas → 23514; active con motivo → 23514; INSERT inactive sin motivo → 23514. Fechas fin < inicio → 23514.
2. **FK de reemplazo**: otra materia, otro workspace, otra carrera, otra institución, inexistente → 23503; auto-referencia → 23514 (CHECK); borrar el padre deja `replaces_assignment_id = NULL` y no toca institución/materia/carrera del hijo (SET NULL solo de la columna).
3. **Backfill**: vínculo y fechas desde metadata con uuid en mayúsculas, fin antes de inicio (queda `ends_on` NULL), año 9999, metadata no objeto. Padre de otra materia no se copia (reproducido con el harness y comprobado en el código; ver "Límites"). Baja vieja → `otro`. Fila `active` con `deleted_at` queda intacta.
4. **Re-ejecución del 06 sobre una base creada con el 06 viejo y datos legacy** (dos corridas más, como `supabase_admin`): filas, `updated_at`, policies y ACL idénticas entre corridas.
5. **`academic_end_teacher_assignment`**: sin sesión → 28000; `anon` → `permission denied` (sin EXECUTE); alumno, docente (viewer), reemplazante (viewer), admin de otra institución e id inexistente → 42501 con el mismo mensaje (no filtra existencia); superadmin → OK; motivo inválido/NULL y fecha futura → 22023; doble baja → 22023; notas truncadas a 500; guarda `ended_by`; `search_path = public, pg_temp`; `SECURITY DEFINER`; EXECUTE solo `authenticated` (+ roles de servicio por defaults de Supabase). El estado no cambia tras los rechazos.
6. **Licencia**: fin antes de inicio y autorreemplazo → 22023; vínculo, vigencia y nombres escritos; reemplazante repetido tras cerrar la suplencia crea una fila nueva (no revive la cerrada, no choca con el CHECK).
7. **Condición**: cierra suplencias por `replaces_assignment_id` y por metadata con `fin_suplencia` y `ends_on` coherente (suplencia futura queda `ends_on = starts_on`); rechaza una asignación terminada (22023).
8. **Roster / `academic_can_manage_subject` / avisos**: titular en licencia pierde padrón, suplente lo gana, asignación terminada pierde acceso (todos exigen `status='active'` y `deleted_at is null`); las mesas (08) también.
9. **Policies RLS y grants de la tabla**: idénticas antes y después de re-correr el 06 (comparado con `pg_policy` y `relacl`). Alumno/docente/viewer no pueden escribir por RLS.
10. **Front**: `fetchSubjectTeacherAssignments*` cae a las columnas viejas ante `42703` con nombre de columna nueva; `PGRST202` de la RPC muestra "ejecuta el 06"; no queda ningún `update({status:'inactive'})` ni `deactivateSubjectTeacherAssignment` en `src/` (solo se usa la RPC). La fecha del modal es local (`localToday()`). `npx vitest run` de los 3 archivos: 41/41.
11. **Harness del implementador**: `node scripts/validateTeacherAssignmentModelLocal.mjs` → PASS, 44 chequeos, cleanup 0. Lo probé con mutaciones sobre una copia fuera del repo: sacar el chequeo de fecha futura, sacar el chequeo de permisos y sacar la guarda "no revive" → FALLA (por cascada, el error no nombra el chequeo, pero falla); sacar el cálculo de `ends_on` de suplencia futura → FALLA nombrando los chequeos. El harness prueba lo que dice en lo funcional.

## Límites del harness (hallazgo menor)

- Crea la base con el 06 NUEVO ya aplicado y simula "datos legacy" soltando el CHECK; nunca prueba la ruta real de upgrade (tabla vieja → 06 nuevo), que es la que corre en Prod. No cubre metadata mal formada (P2-1), padre de otra materia, baja de suplencia futura (P2-2), superadmin, `anon`/sin sesión, ni concurrencia. La mutación "backfill sin chequeo de misma materia" pasa (no se detecta).
- Corre todo como `supabase_admin`, no como `postgres` sin superusuario.

## Qué NO probé

- No corrí el 06 como `postgres` no superusuario (no pude reasignar la propiedad de los objetos del sistema en el contenedor): la propiedad de `comment on table teacher_subject_assignments` y los `create index`/`alter table` dependen del dueño real en Prod.
- No probé concurrencia (dos bajas a la vez, baja contra licencia), solo leí que hay `for update`.
- No probé el SQL Editor real (si ejecuta en una transacción o por sentencia).
- No probé borrado en cascada de institución/perfil con filas vinculadas por `replaces_assignment_id`.
- No ejecuté el front en navegador (solo vitest) ni la Edge `admin-users`.
- No leí el estado de Prod: lo que dice la evidencia sobre las 3 filas y las policies es afirmación del implementador.

## Habilita correr el 06 en Prod

Sí, con condiciones: (1) confirmar justo antes en Prod que `select count(*) from subject_teacher_assignments where metadata ?| array['leave_parent_assignment_id','starts_on','ends_on']` da 0 (o que esos valores tienen fecha y uuid válidos), lo que neutraliza P2-1; (2) correrlo como `postgres` en el SQL Editor y ejecutar la verificación de 4 valores que trae el resultado local; (3) publicar el front enseguida (P3-5). P2-2 y P2-3 no bloquean el 06 pero conviene corregir P2-1 y P2-2 antes de que haya suplencias reales cargadas.
