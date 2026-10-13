# Validacion local A/B de RLS y RPC

Entorno: instancia descartable `codex-baseline-local-7725bdda`. Fecha: 2026-10-03.
Ejecucion: `psql -X -v ON_ERROR_STOP=1 -f local_ab_rls_rpc_validation.sql` dentro del contenedor PostgreSQL local aislado.

## Fixtures

El script crea en una transaccion dos instituciones, admin/teacher/student A y B, un usuario bloqueado, uno autenticado sin membership, carreras, planes, materias, legajos, mesas y notas sinteticas. PostgreSQL revirtio la transaccion al cerrar la sesion por el error esperado del harness; una consulta posterior devolvio `0` instituciones fixture persistidas.

## Resultados ejecutados

| Caso | Resultado | Evidencia |
| --- | --- | --- |
| Student A inscribe su propia materia en A | PASS | `PASS positive_subject_enrollment_A` |
| Admin B intenta inscribir a Student A en A pasando `actor_user_id = student A` | FAIL / P1 | `ERROR: P1_RPC_IDENTITY_BYPASS: admin B pudo escribir inscripcion de student A` en linea 127 del script copiado al contenedor. |

La sesion SQL tenia `SET LOCAL ROLE authenticated` y `auth.uid()` se verifico explicitamente como Student A en el positivo y Admin B en el negativo. `public.upsert_subject_enrollment_from_portal` valida `actor_user_id = target_student_id`, pero no vincula `actor_user_id` con `auth.uid()`; su `SECURITY DEFINER` permite el cambio si el estudiante objetivo tiene membership. El llamado negativo se acepto y la asercion del harness genero el error P1.

Los restantes casos solicitados (SELECT/INSERT/UPDATE/DELETE cross-tenant, teacher/student vs membership, blocked, sin membership y RPC de examen) no se ejecutaron: la matriz se detuvo en el primer P1 conforme a la tarea.

No se modifico schema ni se uso DB remota. Remote mutations: NONE.

## Re-test focal tras correccion local

`public.upsert_subject_enrollment_from_portal` ahora exige `auth.uid()` no nulo e igual a `actor_user_id`, que debe ser igual a `target_student_id`. El caller directo `admin-users` usa el cliente del usuario autenticado para esta RPC. Se reemplazo solamente esta funcion en `codex-baseline-local-7725bdda`, sin reejecutar el baseline.

| Caso | Resultado |
| --- | --- |
| Student A autenticado inscribe su propia materia en A | PASS |
| Admin B autenticado intenta escribir la inscripcion de Student A en A | PASS: denegado con `ACADEMIC_COMMAND_FORBIDDEN` |
| Rol `authenticated` sin `auth.uid()` intenta actuar como Student A | PASS: denegado con `ACADEMIC_COMMAND_FORBIDDEN` |

La matriz A/B completa sigue pendiente. La prueba focal usa una transaccion con `ROLLBACK`; no deja fixtures persistidos. Remote mutations: NONE.

## Reanudacion de matriz A/B — primer P1 nuevo

Se amplio `local_ab_rls_rpc_validation.sql` y se ejecuto de nuevo con `psql -X -v ON_ERROR_STOP=1` en `codex-baseline-local-7725bdda`. Pasaron los tres casos focales previos, SELECT/INSERT/UPDATE/DELETE cross-tenant sobre `student_records`, usuario bloqueado, autenticado sin membership y checks de identidad/membership de teacher y student sin asignacion de materia. El primer fallo nuevo fue:

```text
ERROR: P1_RPC_CROSS_TENANT_READ: admin B obtuvo enrollment ID de student A
```

`public.academic_resolve_subject_enrollment` en `supabase/schema/07_academic_operations.sql` es `SECURITY DEFINER` y devuelve el UUID de una inscripcion filtrando por argumentos de institucion/alumno/materia, sin comprobar `auth.uid()` ni membership del caller. Bajo `SET LOCAL ROLE authenticated` con JWT de Admin B, la RPC devolvio el ID de la inscripcion de Student A creada en el positivo. Es fuga cross-tenant de existencia/identificador (P1). No se modifico la funcion ni el schema. La sesion fallo dentro de la transaccion; una consulta posterior confirmo `0` instituciones fixture persistidas.

Los casos restantes, en particular RPC de examen positiva y cross-tenant/fail-closed, no se ejecutaron por la regla de detenerse en el primer P0/P1. Remote mutations: NONE.

## Re-test focal de `academic_resolve_subject_enrollment`

La funcion canónica local exige `auth.uid()` no nulo y membership activa en la institución solicitada. Permite resolver la propia inscripción del alumno o, para un caller no-alumno, solo una materia que `academic_can_manage_subject` autoriza. No se cambiaron grants ni RLS. Se reemplazó solo esta función en la instancia descartable para ejecutar el test; no se aplicó el baseline de nuevo.

| Caso | Resultado |
| --- | --- |
| Student A resuelve su propia inscripción A | PASS |
| Admin A resuelve inscripción A de su tenant | PASS |
| Teacher A con asignación activa resuelve inscripción A | PASS |
| Admin B intenta resolver inscripción de Student A | PASS: devuelve `NULL` |
| `auth.uid()` nulo intenta resolver inscripción de Student A | PASS: devuelve `NULL` |

La ejecución completa del script focal terminó en `ROLLBACK`. La matriz A/B restante continúa pendiente; no se probó aquí la RPC de examen. Remote mutations: NONE.

## Reanudación de matriz A/B — primer fallo nuevo

En `codex-baseline-local-7725bdda`, el script sintético pasó los casos de `upsert_exam_enrollment_from_portal` (Student A registrado; Admin B y `auth.uid()` nulo denegados), lectura de rosters/notas A/B, creación de clases A/B, CRUD cross-tenant de `subject_enrollments`, default-deny de escritura directa de `exam_enrollments`/eventos, escritura docente de notas/asistencia A y rechazo de B, y resolución de perfil A/B. Se detuvo en el siguiente caso positivo:

```text
psql:/tmp/local_ab_rls_rpc_validation.sql:598: ERROR: column assignment.deleted_at does not exist at character 9069
```

La RPC `public.get_student_portal_workspace_snapshot` en `supabase/schema/05_student_portal_secure_read.sql` consulta `public.exam_teacher_assignments assignment` y filtra `assignment.deleted_at is null`. La tabla canónica `public.exam_teacher_assignments` de `supabase/schema/08_exam_tables.sql` no define esa columna. Por eso falla la lectura de Student A dentro de su propio tenant: P1 funcional del baseline local. No se modificó la RPC ni el schema. La transacción se revirtió y la comprobación posterior devolvió `0` instituciones fixture persistidas.

El negativo Student B→snapshot A y cualquier caso posterior no se ejecutaron, conforme a la regla de detenerse en el primer P0/P1. No se ejecutó `npm.cmd run check` por no quedar verde la matriz. Remote mutations: NONE.

## Re-test focal del contrato snapshot/asignaciones

Decisión A: la tabla canónica `exam_teacher_assignments` usa `status = 'active'/'inactive'`, no soft-delete. Se quitó únicamente el filtro inexistente `assignment.deleted_at is null` del snapshot. La misma comparación trataba `exam_table_id uuid` como texto con `coalesce(..., '')`; se ajustó a `assignment.exam_table_id::text` para evitar un segundo error de tipo sin cambiar su semántica de comparación. No se alteró `08_exam_tables.sql`.

Tras reemplazar solo la función snapshot en la instancia local descartable, el script focal pasó `student_portal_snapshot_A` y `student_portal_snapshot_cross_tenant_denied`, y terminó en `ROLLBACK`. No se ejecutó la matriz completa como gate ni SQL remoto. Remote mutations: NONE.

La auditoría independiente detectó un riesgo P1 potencial no cubierto por esos fixtures: el `NOT EXISTS` de asignaciones docentes pendientes compara `assignment.exam_table_id::text` (UUID canónico) con el ID legacy normalizado de la mesa en el cronograma JSON. `exam_tables.legacy_exam_table_id` existe como vínculo, pero el filtro no lo usa. Una mesa legacy con confirmación pendiente podría mostrarse al alumno. No se declara PASS hasta probar una mesa/asignación pendiente vinculada y resolver el mapping sin inventar semántica.

## Re-test focal del mapping legacy↔UUID

Se agregó al mismo script transaccional una mesa A con `exam_tables.id` UUID, `legacy_exam_table_id = 'mesa-legacy-a'`, una asignación docente A activa con `confirmation_status = 'pending'`, un cronograma publicado con ID `exam-engine-v21-mesa-legacy-a-2026-10-03` y regularidad sintética de Student A.

Antes del mapping, el test falló con `P1_PENDING_EXAM_VISIBLE: mesa legacy A pendiente visible (1 mesas)`. La función snapshot se corrigió para unir `exam_teacher_assignments` con `exam_tables` mediante institución, workspace y UUID, y comparar el ID normalizado del cronograma con `exam_tables.legacy_exam_table_id` o el UUID canónico. No se modificó RLS, grants ni `08_exam_tables.sql`.

Después del cambio, la ejecución local pasó `pending_exam_hidden_from_student_A`, `confirmed_exam_visible_to_student_A` y `student_portal_snapshot_cross_tenant_denied`; terminó en `ROLLBACK`. Esta prueba focal no sustituye la matriz A/B global. Remote mutations: NONE.

## Reanudación siguiente — mesa legacy sin mapping

Se agregó un caso al mismo fixture sintético: después de validar la mesa confirmada, se restauró `confirmation_status = 'pending'` y se puso `exam_tables.legacy_exam_table_id = NULL`, conservando el UUID de la asignación y el ID legacy del cronograma. La ejecución local falló en el primer caso nuevo:

```text
psql:/tmp/local_ab_rls_rpc_validation.sql:686: ERROR: P1_UNMAPPED_PENDING_EXAM_VISIBLE: mesa legacy A sin mapping visible (1 mesas)
```

El riesgo P2 anterior queda confirmado como P1 de visibilidad: si falta el vínculo legacy↔UUID, el `NOT EXISTS` no reconoce la asignación pendiente y muestra la mesa. La prueba se detuvo ahí; no se ejecutaron RPC restantes ni `npm.cmd run check`. El script vive en una transacción sin `COMMIT` y el error cierra la sesión con rollback. No se cambió schema/RPC ni se tocó remoto. Remote mutations: NONE.

## Re-test focal del cierre fail-closed sin mapping

Antes del cambio, el caso `legacy_exam_table_id = NULL` y asignación activa pendiente falló con `P1_UNMAPPED_PENDING_EXAM_VISIBLE` (1 mesa visible). El snapshot ahora exige resolver una mesa canónica del mismo tenant/workspace mediante UUID o `legacy_exam_table_id` antes de evaluar su visibilidad; si no hay mapping, excluye la mesa. El filtro de asignaciones pendientes con mapping permanece.

Después del cambio, la ejecución local pasó: `unmapped_pending_exam_fail_closed`, `pending_exam_hidden_from_student_A`, `confirmed_exam_visible_to_student_A` y `student_portal_snapshot_cross_tenant_denied`. Terminó en `ROLLBACK`. No hay evidencia contractual de una mesa confirmada sin mapping que deba mostrarse, por lo que no se agregó una excepción de visibilidad. No se ejecutó matriz ni suite completa. Remote mutations: NONE.

La revisión independiente detectó un borde adicional: `legacy_exam_table_id = ''` podía parecer un match para un ID vacío del cronograma. Se exigió ID normalizado no vacío en el gate de mapping y se agregó `empty_exam_mapping_fail_closed`: mesa sin ID verificable, aun confirmada, oculta. El test pasó en PostgreSQL local con `ROLLBACK`.

## Reanudación y bloqueo por P1 nuevo

En la base descartable `supabase_db_codex-baseline-local-7725bdda` se ejecutó de nuevo el script transaccional con `psql -X -v ON_ERROR_STOP=1`. Pasaron los casos ya cerrados y los nuevos: RPC de condición/licencia docente (Admin A permitido, Admin B sobre A denegado), cuatro RPC administrativas base (Admin B denegado con `SUPER_ADMIN_REQUIRED`), configuración académica con identidad/nula, grants de helpers internos y RPC service-role-only, y CRUD cross-tenant de `subject_teacher_assignments`. Ninguno de esos fixtures persiste.

La auditoría independiente detectó que las RPC `SECURITY DEFINER` de lectura de notas/rosters/avisos y el helper de autorización docente no comprueban membership vigente ni `profiles.is_blocked` antes de usar inscripciones/asignaciones residuales. Se añadió un único caso adversarial al final del script: bloquear Student A, que conserva su inscripción y nota, e invocar `academic_get_student_portal_grades` como ese mismo usuario. Primer fallo real:

```text
psql:/tmp/local_ab_rls_rpc_validation.sql:873: ERROR: P1_BLOCKED_STUDENT_GRADES_RPC_READ: blocked student obtuvo notas
```

La transacción falló y fue revertida. Es un P1 confirmado de lectura tras revocación de acceso. Por la regla de detenerse en el primer P0/P1, no se ejecutaron gates globales ni se modificó el schema. Quedan por corregir/verificar los caminos equivalentes con asignación docente residual y las otras RPC de lectura. No hubo SQL remoto, `db push`, ni modificaciones de Staging/Production. Remote mutations: NONE.

## Corrección focal del P1 de usuario bloqueado

### Estado posterior: matriz bloqueada por un P1 distinto de relación cross-tenant

El siguiente caso pendiente agregó una asignación sintética para Teacher B y ejecutó como Admin B (`authenticated`) un INSERT en `subject_enrollments` con institución B, Student B y `student_record_id` del legajo A. El INSERT fue aceptado. Como Teacher B, `academic_get_teacher_subject_rosters(B, 'main')` devolvió `fullName = 'Student A'` para esa inscripción B.

```text
psql:/tmp/local_ab_rls_rpc_validation.sql:970: ERROR: P1_ROSTER_CROSS_TENANT_LEGAJO: teacher B obtuvo nombre de legajo A mediante FK en enrollment B
```

P1 confirmado: el FK simple de `subject_enrollments.student_record_id` permite una relación con otro tenant, y el JOIN del roster acepta `student_record.id = enrollment.student_record_id` sin exigir institución/workspace en esa rama. El guard blocked-user funciona, pero no protege esta relación. No se modificó el schema ni se reabrió el fix anterior. Se detuvo en este primer P0/P1 nuevo; no se ejecutaron tests globales ni build. La sesión fallida revierte los fixtures. Remote mutations: NONE.

Se agregó `public.is_member_of_institution(p_institution_id)` como guard a `academic_get_student_portal_grades`, `academic_get_student_subject_teacher_notices`, `academic_get_teacher_subject_rosters` y a la rama de asignación docente de `academic_can_manage_subject`. El helper canónico exige membership del tenant y `profiles.is_blocked = false`; `auth.uid()` nulo no satisface el guard. No se cambiaron grants ni RLS.

Se reemplazaron únicamente esas cuatro funciones en `supabase_db_codex-baseline-local-7725bdda` y se ejecutó el script sintético transaccional. Pasaron: nota de Student A activo; Student B sin notas A; aviso docente visible para Student A activo; Student A bloqueado sin notas ni avisos; Student A sin membership pero con inscripción residual sin notas ni avisos; Teacher A asignado con roster; Teacher A bloqueado sin roster ni permiso de materia; Teacher A sin membership pero con asignación residual sin roster ni permiso; identidad nula sin acceso a las cuatro RPC. La ejecución concluyó con `ROLLBACK`. No se ejecutó matriz completa como gate ni SQL remoto. Remote mutations: NONE.

## Corrección focal: integridad tenant/workspace del roster

El JOIN del roster ahora exige institución y workspace para el legajo, y su CTE excluye inscripciones cuyo legajo no nulo no resuelve en ese scope. También exige membership del alumno en la institución (relación ya validada por la RPC de inscripción): evita revelar el perfil de respaldo mediante un `student_id` ajeno con legajo nulo.

En `07_academic_operations.sql` se agregó índice único de `student_records(institution_id, workspace_key, id)` y FK `subject_enrollments_student_record_scope_fkey` por `(institution_id, workspace_key, student_record_id)`. Conserva legajo nullable y `ON DELETE SET NULL (student_record_id)`. La FK protege INSERT/UPDATE directos y las RPC existentes sin cambiar sus firmas/grants/RLS. Es coherente con las relaciones tenant-scoped de `02_academic_relational_schema.sql`. No se rediseñó la identidad global de `student_id` ni el ciclo de vida de memberships.

Reproducción focal, sin ejecutar la matriz completa:

```text
docker exec supabase_db_codex-baseline-local-7725bdda psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v roster_tenant_focal=1 -f /tmp/local_ab_rls_rpc_validation.sql
```

PASS: alumno/docente A legítimos; INSERT B→legajo A rechazado por FK; alumno/docente B legítimos; Teacher B→tenant A sin filas; RPC B→legajo A rechazada; auth nulo sin filas; referencia histórica corrupta excluida (FK suspendida solo dentro de savepoint revertido); perfil ajeno sin legajo excluido; workspace distinto rechazado; borrar legajo B conserva inscripción B y anula solo student_record_id. Exit 0, ROLLBACK final. Se aplicó únicamente el índice/FK y la función roster en la instancia descartable, sin rehacer baseline.

Tests directos Vitest: 3 archivos / 36 tests PASS. Auditor independiente: PASS, sin hallazgos nuevos P0/P1/P2/P3. Diff focal: sin errores de whitespace, avisos LF/CRLF. Suite global/matriz completa pendientes por alcance. Riesgo de aplicación futura: la FK validada rechazará datos previos fuera de scope; deben diagnosticarse antes de una aplicación autorizada, sin corrección automática. Remote mutations: NONE.

## Reanudación: primer P1 nuevo en avisos docentes

La matriz completa existente pasó sus casos cerrados, incluidos blocked-user y roster tenant-safe. El siguiente caso pendiente ejecutó como Admin B una actualización de una asignación propia B: `role='licencia'`, `teacher_record_id` del legajo Teacher A y fechas sintéticas vigentes. La actualización fue aceptada. Student B invocó `academic_get_student_subject_teacher_notices(B, 'main')` y recibió `teacherOnLeave='Teacher A'`.

```text
psql:/tmp/local_ab_rls_rpc_validation.sql:1126: ERROR: P1_NOTICES_CROSS_TENANT_TEACHER_RECORD: student B obtuvo nombre de docente A mediante asignacion B
```

P1 confirmado de información cross-tenant: el JOIN por UUID de `leave_teacher` en `07_academic_operations.sql` no exige institución/workspace en esa rama. El JOIN análogo de `replacement_teacher` tiene el mismo patrón; no se continuó probándolo ni se cambió el schema por la regla de detenerse ante el primer P0/P1 real.

Chequeo histórico exclusivamente local: `historical_enrollment_record_scope_mismatches=0`, FK compuesta validada (`convalidated=true`). La consulta está incorporada antes de los fixtures para repetirla en futuras ejecuciones. Esto no representa una comprobación de datos remotos. El fallo revirtió la transacción; lectura posterior confirmó `persisted_fixture_institutions=0` y que la FK sigue validada. No se ejecutaron tests focales Vitest ni `npm.cmd run check` en esta reanudación porque la matriz no quedó verde. Remote mutations: NONE.

## Corrección focal: integridad tenant/workspace de avisos docentes

En `06_subject_teacher_assignments.sql` se agregó el índice único `teacher_records_tenant_workspace_id_key` y la FK `subject_teacher_assignments_teacher_record_scope_fkey` por `(institution_id, workspace_key, teacher_record_id)`, coherente con las claves tenant-scoped del modelo canónico de teacher_records. Conserva NULL y `ON DELETE SET NULL (teacher_record_id)`; protege INSERT/UPDATE directos y la RPC de licencia sin modificar su firma. No se relajaron grants ni RLS.

`academic_get_student_subject_teacher_notices` califica ambos JOIN de legajos por tenant/workspace, excluye legajos históricos fuera de scope y exige pertenencia al tenant de los perfiles del titular y reemplazo. Una licencia inválida no devuelve aviso; un reemplazo inválido no devuelve sus datos y conserva el texto genérico existente `docente suplente`.

Ejecución reproducible focal, sin matriz completa:

```text
docker exec supabase_db_codex-baseline-local-7725bdda psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v notices_tenant_focal=1 -f /tmp/local_ab_rls_rpc_validation.sql
```

PASS: INSERT/UPDATE/RPC B→Teacher A rechazados por FK; RPC fallida sin mutación parcial; A→Teacher A y B→Teacher B/reemplazante B legítimos; caller cross-tenant/blocked/auth nulo sin datos; corrupción histórica en legajo titular/reemplazo fail-closed; perfiles ajenos con legajo nulo ocultos; cambio de workspace rechazado; borrado del legajo conserva la asignación y anula solo teacher_record_id. Savepoints de corrupción y fixtures revertidos, exit 0 y ROLLBACK final. Se aplicaron solo índice/FK y RPC de avisos en la DB descartable existente.

Histórico local: `historical_teacher_record_mismatches=0`, `teacher_scope_fk_validated=true`, `persisted_fixture_institutions=0`. Tests focales Vitest: 4 archivos / 34 tests PASS. Auditoría independiente del código/tests: sin P0/P1/P2/P3 nuevos. Matriz/suite global no ejecutadas por alcance. Datos históricos remotos no comprobados; vínculos fuera de scope bloquearían la aplicación de la FK validada y requieren diagnóstico previo, sin saneamiento automático. Remote mutations: NONE.

## Reanudación: P1 en UUID de inscripción proporcionado a la RPC de notas

La ejecución de la matriz existente llegó al nuevo caso después de pasar los controles anteriores, incluidos integridad de roster/asignaciones y avisos docentes. El siguiente caso captura el UUID de una inscripción A como parte del fixture y llama `academic_teacher_upsert_student_grade` como Teacher B reemplazante, autorizado explícitamente para materia B. Usa institución/materia/alumno B, pero pasa `p_subject_enrollment_id` de A. La RPC guardó una nota B con ese vínculo ajeno:

```text
psql:/tmp/local_ab_rls_rpc_validation.sql:1328: ERROR: P1_GRADE_FOREIGN_ENROLLMENT_ACCEPTED: teacher B guardo nota B vinculada a enrollment A
```

P1 confirmado de integridad cross-tenant. En `07_academic_operations.sql`, `resolved_enrollment_id := coalesce(p_subject_enrollment_id, academic_resolve_subject_enrollment(...))` acepta el UUID recibido sin verificar institución/workspace/alumno/materia de la inscripción. La FK de notas a inscripciones valida solo existencia global del UUID. No se modificó la RPC ni el schema; se detuvo en este primer P0/P1 nuevo. El camino análogo de asistencia que acepta UUID proporcionado queda pendiente de validación, sin continuar después del fallo.

La sesión fallida revirtió los fixtures: lectura posterior confirmó `fixtures_persisted=0`, y ambas nuevas FKs de legajos continúan validadas. No se ejecutaron focales Vitest ni `npm.cmd run check` porque la matriz no quedó verde. Diff del script/informe: sin errores de whitespace, solo avisos LF/CRLF. Remote mutations: NONE.

Riesgo previo a Staging: deben auditarse los datos históricos remotos de `subject_enrollments` y `subject_teacher_assignments` contra institución/workspace/legajo antes de aplicar sus nuevas FKs. La ausencia local de inconsistencias no acredita compatibilidad remota; no se consultó ni saneó ningún dato remoto.

## Corrección focal: contexto de inscripción en RPC de notas

`academic_teacher_upsert_student_grade` valida el UUID proporcionado o resuelto contra institución, workspace, alumno, materia, carrera, estado active/enrolled y ausencia de borrado. Un legajo proporcionado debe coincidir con el de esa inscripción. La validación ocurre antes de INSERT/UPDATE de nota, conserva el guard docente y adquiere `FOR SHARE` para estabilizar la inscripción durante la operación. Un UUID inválido no se reemplaza silenciosamente por otra inscripción. Firma/grants/RLS sin cambios.

Se agregó `subject_enrollments_tenant_workspace_id_key` y FK `student_grades_subject_enrollment_scope_fkey` por institución/workspace/UUID de inscripción, coherente con las relaciones canónicas tenant-scoped. Permite enrollment NULL y conserva `ON DELETE SET NULL (subject_enrollment_id)`. Protege también INSERT/UPDATE directos con relación de otro tenant; las correspondencias alumno/materia las valida la RPC, sin rediseñar todas las escrituras directas.

Modo focal, sin ejecutar la matriz completa:

```text
docker exec supabase_db_codex-baseline-local-7725bdda psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v grade_tenant_focal=1 -f /tmp/local_ab_rls_rpc_validation.sql
```

PASS: Teacher A/enrollment A y Teacher B/enrollment B; resolución implícita y actualización con lock_version; Teacher B/enrollment A denegado; alumno/materia/workspace/carrera/legajo incorrectos denegados sin modificar la nota; blocked/auth nulo denegados; FK rechaza INSERT/UPDATE directos cross-tenant; DELETE de enrollment preserva nota y anula solo subject_enrollment_id. Test de UUID ajeno falla ante cualquier retorno exitoso de la RPC. Ejecución actualizada exit 0 y ROLLBACK final.

Tests directos Vitest: 3 archivos / 39 tests PASS. Revisión independiente de código/assertions: PASS, P0/P1/P2/P3 nuevos abiertos=0. Diff focal sin errores de whitespace, avisos LF/CRLF. Se reemplazaron solo la RPC y el refuerzo índice/FK en la DB descartable existente. Histórico local: `historical_grade_enrollment_scope_mismatches=0`, `grade_scope_fk_validated=true`, `fixtures_persisted=0`. Matriz/suite global no ejecutadas por alcance; concurrencia entre dos sesiones no medida dinámicamente. Datos históricos remotos de notas/inscripciones requieren auditoría de compatibilidad antes de autorizar aplicación de la FK; no hubo saneamiento ni acceso remoto. Remote mutations: NONE.

## Reanudación: P1 en UUID de inscripción proporcionado a asistencia

Docker estaba detenido. Se inició Docker Desktop y se arrancó solo el contenedor existente `supabase_db_codex-baseline-local-7725bdda`, sin reconstruir baseline ni sustituir la base. La matriz pasó los casos anteriores, incluidos guard/FK de notas, y se detuvo en el siguiente caso pendiente.

Como Teacher B reemplazante autorizado para materia B, el test creó una clase B con `academic_teacher_create_class_session` e invocó `academic_teacher_upsert_attendance_records` usando Student B y el UUID de la inscripción A. La RPC guardó asistencia B vinculada a enrollment A:

```text
psql:/tmp/local_ab_rls_rpc_validation.sql:1500: ERROR: P1_ATTENDANCE_FOREIGN_ENROLLMENT_ACCEPTED: teacher B guardo asistencia B vinculada a enrollment A
```

P1 confirmado de integridad cross-tenant. En `07_academic_operations.sql`, la RPC acepta `record_item.subject_enrollment_id` y usa el resolver únicamente si el UUID recibido es NULL; no verifica tenant/workspace/alumno/materia de la inscripción proporcionada. La FK de asistencia valida solo existencia global del UUID. El test rechaza cualquier retorno exitoso; solo excepciones de denegación esperadas cuentan como PASS.

Se detuvo en este primer P0/P1 real; no se modificó schema/RPC ni se ejecutaron tests focales Vitest o check global. El error revirtió los fixtures: `fixtures_persisted=0`. Las tres FKs nuevas de legajos y notas permanecen validadas. Diff de script/informe sin errores de whitespace, avisos LF/CRLF. Remote mutations: NONE.

Sigue vigente el preflight antes de Staging: auditar los datos históricos remotos contra cada nueva FK compuesta (inscripción/legajo, asignación/legajo y nota/inscripción) antes de autorizar su aplicación; las comprobaciones locales no acreditan compatibilidad remota. No hubo acceso ni saneamiento remoto.

## Corrección focal P1 — attendance enrollment tenant guard

La RPC valida la inscripción antes de INSERT/UPDATE por institución, `workspace_key`, alumno, materia, carrera, estado active/enrolled y ausencia de borrado. El modelo directo no posee un `plan_id` independiente: no se inventó esa relación. Se conserva la autenticación y autorización docente mediante el helper existente con perfil/membership activos. Clase e inscripción se bloquean con `FOR SHARE` durante la operación.

Se agregó `subject_attendance_records_enrollment_scope_fkey` sobre institución/workspace/UUID, reutilizando la clave canónica de inscripciones y preservando `ON DELETE SET NULL` exclusivamente sobre el UUID. No se cambiaron grants, RLS ni firma RPC.

Retest reproducible en `supabase_db_codex-baseline-local-7725bdda`: ejecutar el script existente con `psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -v attendance_tenant_focal=1 -f /tmp/local_ab_rls_rpc_validation.sql`. Resultado: exit 0 y ROLLBACK. PASS: Teacher B + enrollment A denegado; positivos A/A y B/B; resolución implícita y actualización idempotente; alumno/materia/carrera/workspace/clase incorrectos y datos ausentes denegados; blocked/auth nulo denegados; lote inválido revierte todas las escrituras; FK cross-tenant deniega; borrados SET NULL/CASCADE preservados.

Vitest focal: `subjectAttendance.test.js`, `teacherAcademicRecords.test.js`, `supabaseFunctionSecurityMatrix.test.js`: 3 archivos / 38 tests PASS. Revisión independiente CHIEF CODE AUDITOR: PASS estático, P0/P1/P2/P3 nuevos = 0. No se ejecutó matriz completa ni suite global, conforme al alcance solicitado.

Comprobación local posterior: FK validada, referencias de asistencia incompatibles = 0, fixtures persistidos = 0. Concurrencia entre dos sesiones no ejercitada; los locks se revisaron estáticamente. Antes de Staging sigue siendo obligatorio auditar los datos históricos remotos, incluyendo esta nueva FK; no se comprobó ni saneó ningún dato remoto. Remote mutations: NONE.

## Cierre de matriz A/B local — casos pendientes completados

Se conservó la instancia `codex-baseline-local-7725bdda`; no se reconstruyó baseline ni se modificaron RPC/schema. El script completo existente, sin flags focales, terminó con exit 0 y ROLLBACK después de incorporar los últimos casos. Reproducción: copiar `local_ab_rls_rpc_validation.sql` al contenedor local y ejecutar `psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/local_ab_rls_rpc_validation.sql`.

Casos nuevos PASS:

- SELECT/INSERT/UPDATE/DELETE cross-tenant de clases, asistencias y notas. SELECT/UPDATE/DELETE verifican cero filas; INSERT acepta exclusivamente rechazo por permisos, no un error unique/FK como falso positivo.
- Helpers de membership A/B y superadmin positivo; blocked y auth nulo fail-closed. El modelo canónico no tiene status de membership: se evalúan su presencia y `profiles.is_blocked=false`, sin inventar estados.
- API pública de mantenimiento: DTO mínimo y configuración privada no expuesta. Login público: instituciones activas visibles, suspendidas excluidas. Estas APIs son públicas intencionalmente, no una fuga de datos académicos.
- Trigger `handle_new_user` y helpers internos sin EXECUTE público/anon indebido. Los fixtures ejercitan el trigger; las RPC service-only se verifican por grants, sin utilizar service-role.

Inventario independiente CHIEF CODE AUDITOR: todas las RPC académicas SECURITY DEFINER están cubiertas por el script; revisión restante de tenant/workspace, joins UUID y blocked sin P0/P1 nuevos. Veredicto PASS de cierre de cobertura. P3 preexistente: `academic_update_teacher_assignment_condition` distingue UUID inexistente de existente no autorizado mediante errores distintos (oracle limitado de existencia; sin devolver datos ni autorizar escritura). No se corrigió por estar fuera del alcance.

Focales Vitest: 5 archivos / 54 tests PASS (`subjectAttendance`, `teacherAcademicRecords`, `supabaseFunctionSecurityMatrix`, `examEnrollmentRpcContract`, `examTablesCanonicalSchema`). `npm.cmd run check`: PASS (audit:repo, lint, 281 archivos / 2250 tests, build y audit:prod con 119 archivos comprobados). Build con warnings no bloqueantes de chunks mayores de 500 kB y tiempos de plugins. `git diff --check` y comprobación de los archivos de evidencia sin errores de whitespace; solo avisos LF/CRLF. No se ejecutó quality:deps; no se afirma cierre del riesgo de dependencias preexistentes fuera de esta matriz.

Verificación posterior: fixtures persistidos = 0; las cuatro FKs compuestas permanecen validadas; incompatibilidades locales legajo/inscripción, asignación/docente, nota/inscripción y asistencia/inscripción = 0. Esto no acredita compatibilidad de datos remotos.

Riesgos previos a Staging: preflight read-only remoto de datos históricos para las cuatro FKs, únicamente con autorización futura; concurrencia entre sesiones no ejercitada. La matriz valida el alcance SQL local/sintético, no una ejecución E2E por HTTP ni toda la seguridad de Production. Remote mutations: NONE; no db push ni acceso a Staging/Production.
