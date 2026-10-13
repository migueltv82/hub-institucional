# Concurrencia PostgreSQL local — evidencia y revalidación focal de examen

Entorno exclusivo: `supabase_db_codex-baseline-local-7725bdda`, base descartable existente. No se reconstruyó baseline ni se modificó schema/RPC. Fixtures sintéticos compartidos del script A/B; no se ejecutó la matriz completa.

Reproducción desde la raíz del repositorio:

```powershell
node supabase/baseline/local_concurrency_validation.mjs
```

El harness abre dos conexiones psql persistentes. En cada prueba observa mediante `pg_blocking_pids` que B espera un lock retenido por A; no presupone simultaneidad por un sleep. Fixtures confirmados para ser visibles entre sesiones y eliminados exclusivamente por UUIDs sintéticos previamente ausentes. No utiliza URLs ni credenciales/service-role. Timeout de statements/locks y del proceso impide esperas indefinidas.

## Ejecución inicial — histórico previo a la política decidida

```text
SESSIONS A=1941 B=1940
LOCK_WAIT subject_double_upsert: pid 1940 blocked by 1941
PASS subject_double_upsert
LOCK_WAIT exam_same_idempotency_key: pid 1940 blocked by 1941
PASS exam_same_idempotency_key
LOCK_WAIT grade_double_upsert: pid 1940 blocked by 1941
PASS grade_double_upsert
LOCK_WAIT attendance_double_upsert: pid 1940 blocked by 1941
PASS attendance_double_upsert
LOCK_WAIT exam_validation_vs_close: pid 1940 blocked by 1941
OBSERVED exam_validation_vs_close {"registered_rows" : 1, "table_status" : "closed"}
NEEDS_INVESTIGATION exam_new_registration_with_stale_open_context
PASS subject_drop_vs_reactivate
PASS subject_reactivate_vs_drop
PASS exam_cancel_vs_register
PASS grade_optimistic_conflict
PASS grade_enrollment_changed_before_validation
PASS grade_validation_share_lock_blocks_change
PASS attendance_enrollment_changed_before_validation
PASS attendance_validation_share_lock_blocks_change
PASS attendance_class_changed_before_validation
PASS attendance_class_share_lock_blocks_change
NEEDS_INVESTIGATION_EXAM_CLOSE_LINEARIZATION_POLICY
CLEANUP_PASS institutions/auth/fixture_tables=0
```

Doble upsert: una inscripción de materia, una inscripción de examen y un evento por la misma idempotency key, una nota por recurso/attempt, una asistencia por clase/alumno. Las cuatro pruebas verificaron bloqueo real y ausencia de duplicados tras ambos commits. Todos los casos PASS restantes también observaron explícitamente a B bloqueado por A, sin atribuir éxito solo a esperas temporales.

## Carrera detectada

1. El harness cancela la inscripción anterior por la RPC y verifica cero inscripciones registered. A adquiere el advisory transaction lock exacto de alumno/mesa usado por la RPC de examen.
2. B, como Student A authenticated, invoca registro con una nueva idempotency key. Valida la mesa open y queda esperando el lock de A.
3. A observa la espera, cambia la mesa a closed y hace COMMIT.
4. B continúa con el contexto previamente validado; crea una nueva inscripción registered con la nueva key después del cierre. Resultado observado: una nueva inscripción registered y mesa closed.

`08_exam_tables.sql:673–745`: el SELECT de contexto/estado y la ventana preceden al advisory lock (:747); después del lock no se revalida ni se mantiene bloqueada la fila de mesa. No fue un replay: la nueva key no existía. La primera versión de la prueba solo observaba un UPDATE/evento de una inscripción existente y clasificaba erróneamente P1; el auditor lo objetó y se corrigió el harness y la clasificación. La reproducción final verifica un alta nueva, no cuenta inscripciones anteriores al cierre como hallazgo.

P2 / Needs Investigation: hay uso probado de contexto previo al cierre. Como cierre y RPC se solapan, esto no demuestra por sí solo una serialización prohibida: el contrato de atomicidad/idempotencia no especifica que el estado se deba revalidar en el momento de escribir tras el lock. P0/P1 confirmados: ninguno. Decisión humana requerida: ¿la mesa debe seguir disponible después de adquirir el lock y hasta la escritura, o es suficiente que esté disponible cuando la operación comienza a validarla? No se modificó schema para imponer una política inventada. El harness termina no-zero y no declara PASS global mientras esa decisión esté pendiente.

Se completaron los casos independientes (14 PASS): doble upsert de las cuatro RPC; drop/reactivate de materia en ambos órdenes; cancel/register de examen con ledger de ambos comandos; optimistic locking de nota con rechazo de versión obsoleta; enrollment cambia a dropped antes del guard de nota/asistencia, ambas denegadas tras esperar; FOR SHARE de ambas RPC bloquea el cambio de enrollment hasta el commit; clase cambia de materia antes del guard de asistencia, denegada; FOR SHARE de clase bloquea el cambio hasta el commit. Cambios posteriores al commit se permiten por el modelo existente y no se presentan como garantía permanente de inmutabilidad del contexto. Estos casos no implican un barrido exhaustivo de todas las intercalaciones posibles.

Revisión independiente CHIEF CODE AUDITOR final: 14 PASS + 1 observación Needs Investigation; P0/P1 confirmados = 0. Gate FAIL por política de linealización faltante, no por P1 confirmado. Objeción a la aserción original atendida. No se ejecutó suite global ni focal Vitest: el gate no dio PASS; validación SQL real del harness, syntax check, ESLint focal y diff sobre archivos nuevos PASS (diff con avisos LF/CRLF únicamente).

Riesgos previos a Staging: preflight de datos históricos remotos para FKs sigue pendiente; concurrencia real ejercitada en los casos descritos, gate bloqueado por política de cierre, no por P1 confirmado. No se ejercitaron mutaciones concurrentes de memberships/perfiles/asignaciones; no se afirma garantía exhaustiva de concurrencia. La limpieza comprobó instituciones, auth.users y cada tabla usada por fixtures con cero filas en los UUIDs reservados. Sin tests globales ni despliegues. Remote mutations: NONE; Staging/Production intactos.

## Política decidida y corrección focal — EXAM REVALIDATION

El usuario decidió revalidar la disponibilidad de la mesa DESPUÉS del lock. La sección histórica anterior no describe el gate actual de esta corrección. Se conserva la validación previa y el conjunto de estados autoinscribibles canónicos (`confirmed`, `open`), sin ampliar visibilidad ni grants.

Después del advisory lock, la RPC relee la fila de `exam_tables` por UUID/institution/workspace con `FOR SHARE`. Si desapareció, cerró o dejó de ser autoinscribible, aborta con `EXAM_TABLE_NOT_AVAILABLE` antes del replay y de cualquier escritura. Para registered comprueba nuevamente la ventana con `clock_timestamp()` tomado después del lock de fila: `now()` no avanzaría durante la espera de la transacción. Error conservado: `EXAM_ENROLLMENT_WINDOW_CLOSED`. El lock compartido impide cambios de estado/ventana hasta commit. No se alteraron firma, tenant/auth guards, constraints, grants ni ledger.

Aplicación exclusivamente local: se reemplazó solo la definición de esta RPC en el contenedor existente; no baseline, migrations ni remoto. Comando focal reproducible:

```powershell
node supabase/baseline/local_concurrency_validation.mjs --exam-revalidation
```

Resultado real: exit 0, sesiones PostgreSQL A=2336/B=2337, espera comprobada con `pg_blocking_pids` en los seis casos:

- PASS exam_same_idempotency_key: una inscripción y un evento por key.
- PASS exam_validation_vs_close_denied_no_mutation: inscripción previamente cancelada, alta nueva denegada, cero filas/eventos nuevos e igualdad del snapshot anterior de inscripciones.
- PASS exam_still_open_after_advisory_wait: mesa sigue abierta tras esperar, registro permitido.
- PASS exam_row_share_lock_blocks_close: el cierre espera el commit de la RPC.
- PASS exam_window_changed_while_waiting: cierre temporal actualizado por la otra sesión, registro denegado.
- PASS exam_window_elapsed_while_waiting_denied: vencimiento natural durante la espera, registro denegado mediante reloj real.

Salida final: `CONCURRENCY_EXAM_REVALIDATION_PASS`; cleanup de instituciones/auth/todas las tablas sintéticas = 0. No se ejecutó el modo completo de concurrencia ni la matriz A/B. Vitest focal de RPC: 1 archivo / 9 tests PASS. Syntax check y ESLint focal PASS; diff sin whitespace inválido, solo avisos LF/CRLF. CHIEF CODE AUDITOR independiente: PASS; hallazgos P0/P1/P2/P3 en esta corrección = 0. Revisión estática independiente; la ejecución real fue realizada por el implementador, sin fingir una segunda ejecución del auditor.

Este cierre focal queda listo para el gate final de concurrencia; no declara validación exhaustiva de todas las intercalaciones. Se mantienen los riesgos de preflight histórico remoto de FKs, transacciones multi-recurso con orden de locks inverso y mutaciones concurrentes de Auth/memberships/asignaciones/table_subject fuera de estos casos. No suite global, no deploy, no Staging/Production. Remote mutations: NONE.
