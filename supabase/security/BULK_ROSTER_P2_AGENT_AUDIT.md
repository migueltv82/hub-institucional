# AUD.18 - Auditoria de los correctivos P2 de I2b (carga masiva de titularidades y cursadas)

- Fecha: 2026-10-21
- Auditor: agente Claude, primera pasada; no reemplaza el gate de Codex.
- Commit auditado: `5bafedd9f56b6027bac91aeb2777f2645f8371da` (rama `release/v1`). Informe base: `BULK_ROSTER_INDEPENDENT_AUDIT.md` (secciones P2).
- Alcance: solo local (Postgres 17 del contenedor Docker, bases descartables). Sin Supabase remoto, Staging ni Produccion. No se modifico codigo ni tests del repo.

## Veredicto: PASS WITH WARNINGS

- **P2-a (concurrencia en SQL): cerrado.** Reproducido el escenario original con dos conexiones psql reales, con y sin gateway, y control negativo con el 07 anterior. Sin hallazgos de severidad P0-P2 en el SQL.
- **P2-b (resultado de la institucion anterior): cerrado solo en lo que se muestra.** Nada de A se ve en B. Pero la segunda mitad del requisito, "que no se pueda lanzar una carga sobre B con datos de A", sigue abierta en la integracion (hallazgo H1, P2).
- El SQL se puede volver a correr en Prod desde mi alcance. H1 es de front y se corrige y despliega por separado.

## Hallazgos

### H1 - P2 - Se puede lanzar una carga sobre la institucion B con las planillas de A
Archivos: `src/components/generadorCronograma/BulkRosterSection.jsx:29` (`canRun` no mira de que institucion son las planillas), `src/components/GeneradorCronograma.jsx:1899-1906` (pasa `institutionId={activeInstitutionId}` junto con `docenteMateria` y `academicSnapshotData.inscripcionesAlumnos`), `src/hooks/useWorkspacePersistence.js:139,322,415`.

Al cambiar de institucion, `activeInstitutionId` pasa a B de inmediato. Las planillas (`docenteMateria`, `inscripcionesAlumnos`) siguen siendo las de A hasta que termina la hidratacion asincrona de B (`setIsHydrating(true)` en la linea 322). Nada limpia ese estado antes. `canWriteRemoteWorkspace` (linea 139) no depende de `isHydrating`, asi que los botones quedan habilitados. Si la hidratacion de B falla (rama de error, linea 415), los datos de A se quedan indefinidamente bajo B, con aviso de error.

Reproduccion (vitest temporal fuera del repo, `/tmp/claude-0/aud18/fe/repro.test.jsx`, componente real): renderizar con `institutionId="inst-A"` y la planilla de A, rerender con `institutionId="inst-B"` y las mismas props, click en "Inscribir cursadas". Resultado: boton habilitado, y `applyStudentEnrollments` se llama con `institutionId: "inst-B"` y `rows: [{dni:"30111222", ...}]` (datos de A).

Impacto: la RPC resuelve docente y alumno por DNI y la materia por catalogo de B, asi que lo normal es que rechace las filas. Pero con DNI o codigos de materia que coincidan entre institutos (un docente que trabaja en dos), se asignan o inscriben en B datos de A. Es una escritura en el tenant equivocado.

Correccion propuesta: que `BulkRosterSection` reciba y exija un ancla de contexto de los datos. Opcion minima: `isHydrating` (o `workspaceSource` cargado) desde `useWorkspacePersistence`, y `canRun` falso mientras hidrata. Mejor: que el padre guarde `hydratedInstitutionId` al terminar `hydrateWorkspaceState` y que `canRun` exija `hydratedInstitutionId === institutionId`. Cubre tambien el caso de hidratacion fallida. Agregar el test de arriba como regresion.

### H2 - P3 - Un deadlock entre dos cargas con las mismas claves en orden opuesto aborta el lote entero (40P01) y el front no lo reintenta
Archivo: `supabase/schema/07_academic_operations.sql:2088-2100` y `2226-2234`; `src/services/bulkRoster.js:isWorkspaceBusy`.

Reproducido sin gateway con un trigger de espera solo en la base de prueba. A: [FIX-A-01, AUDIT-A-02]; B: [AUDIT-A-02, FIX-A-01], ambas por la RPC real. Una de las dos recibe `40P01 deadlock detected` y se revierte entera. Se vio en las dos RPC. Con el 07 anterior habia el mismo tipo de espera cruzada, asi que no es una regresion. Con el gateway de Prod no ocurre (la segunda falla antes con 55P03).
Correccion propuesta: procesar las filas en orden estable de clave (ordenar el lote), o tratar 40P01 como reintentable igual que 55P03 (el lote es atomico e idempotente). Es opcional.

### H3 - P3 - El harness no deja escrito el control negativo ni cubre los casos de estado real
Archivo: `scripts/validateBulkRosterLocal.mjs` (bloque `concurrency`).

El mensaje del commit y `BULK_ROSTER_LOCAL_RESULT.md` hablan de control negativo. El harness solo corre contra el 07 nuevo y no falla si el SQL vuelve a la version anterior. El control negativo se hizo a mano (y lo reproduje, ver abajo), pero no es repetible. Tampoco cubre: rollback de A, fila dejada en baja o con `deleted_at`, cursada de baja o pendiente creada por el portal, portal del alumno concurrente, alta manual de titularidad concurrente, `CONFLICTO_CONCURRENTE`. El caso con gateway solo prueba titularidades.
Correccion propuesta: parametrizar el harness para aplicar el cuerpo de las dos funciones del commit `5bafedd^` y exigir que esos casos fallen, y sumar los escenarios de la tabla de abajo.

### H4 - P3 - Los tests del front no cubren la no duplicacion del reporte al reintentar con varios lotes
Archivo: `src/services/bulkRoster.test.js` (tests nuevos).

Los tests usan un solo lote. Por lectura del codigo el reporte solo se acumula despues de un lote exitoso, asi que no se duplica. Falta un test con mas de `BULK_ROSTER_CHUNK_SIZE` filas donde el segundo lote reciba 55P03 y luego tenga exito, y otro donde se rinda y `partialReport` contenga solo el primero.

### H5 - P3 - Una titularidad en `licencia` se pisa con el rol de la planilla (comportamiento previo, ahora tambien tras una carrera)
Archivo: `supabase/schema/07_academic_operations.sql:2125-2135`.

Si existe una asignacion activa en `licencia` y la planilla dice `titular` (o la otra carga la dejo en `licencia`), la fila pasa a `titular` y se informa como actualizada. Es razonable (la planilla manda sobre el rol) y es consistente con el camino secuencial; solo lo dejo anotado: la licencia se pierde sin aviso. No hay correccion obligatoria; si se quiere, informar `omitida` con motivo propio.

### H6 - P3 (informativo) - Con el gateway, el alumno que se inscribe desde el portal mientras corre una carga masiva recibe 55P03 crudo
Reproducido (escenario E6/E7 con gateway): `upsert_subject_enrollment_from_portal` falla con `SOURCE_FILE_WORKSPACE_BUSY` mientras una carga masiva tiene abierta la transaccion. Es comportamiento del gateway ya en Prod, no del commit; lo anoto porque el reintento de 6 intentos (aprox. 7,5 s en total) solo existe en `runBulk`, no en el portal ni en el alta manual de titularidad.

## Verificaciones (lo que esta bien)

### 1. SQL (P2-a)
- `ON CONFLICT (institution_id, workspace_key, subject_id, program_id, teacher_id) WHERE deleted_at is null AND status = 'active'` coincide exactamente con el indice parcial `subject_teacher_assignments_active_key` (`06_subject_teacher_assignments.sql:214-216`). El de cursadas coincide con `subject_enrollments_current_key` (`07:564`, no parcial). La inferencia funciono en todas las corridas (sin error 42P10).
- La clasificacion usa el estado real releido con `FOR UPDATE`: mismo rol, sin cambios; otro rol, update; cursada activa o `enrolled`, sin cambios; de baja, `pending` o con `deleted_at`, omitida `CURSADA_DADA_DE_BAJA` (no se reactiva).
- `CONFLICTO_CONCURRENTE` es alcanzable y esta bien manejado: lo forcé en las dos RPC con triggers de espera en la base de prueba (la otra transaccion inserta y confirma durante el INSERT, y la fila se borra o se da de baja antes de la relectura). Resultado: esa fila `rechazada` con `CONFLICTO_CONCURRENTE`, el resto del lote sigue. La RPC es la original.
- Rollback de A: B crea las dos filas (sin mensaje espurio). A deja la fila en `inactive`, o con `deleted_at`: B crea una nueva activa, correcto porque la clave parcial queda libre.
- Una asignacion en `licencia` se maneja de forma razonable (ver H5).

### 2. Reproduccion con dos conexiones psql reales (base `gotrue_harness_<hex>` descartable, A duerme con `pg_sleep(3)` antes del COMMIT)
Escenarios: T1/E1 = B manda [otra materia, misma clave], T5 = otro rol, T6 = alta manual concurrente, E3-E7 = estado/portal.

| Escenario | 07 anterior (control negativo) | 07 nuevo sin gateway | 07 nuevo con gateway |
|---|---|---|---|
| T1 titularidades | B: 23505, queda solo 1 fila (se pierde AUDIT-A-02) | B: 1 creada + 1 sin cambios, quedan 2 | B: 55P03, no escribe nada |
| E1 cursadas | B: 23505 (`subject_enrollments_current_key`) | B: 1 creada + 1 sin cambios, quedan 2 | B: 55P03 |
| T2/E2 A hace rollback | B crea 2 | B crea 2 | B: 55P03 |
| T5 A licencia, B titular | 23505 | actualizada a titular | 55P03 |
| T6 alta manual suplente, B titular | 23505 | actualizada a titular | 55P03 |
| E3/E3b A deja dropped+deleted_at / pending | 23505 | omitida `CURSADA_DADA_DE_BAJA` | 55P03 |
| E4 portal activa, B bulk | 23505 | sin cambios | 55P03 |
| E5 portal dropped, B bulk | 23505 | omitida `CURSADA_DADA_DE_BAJA` | 55P03 |
| E6/E7 A bulk, B portal | portal espera y actualiza | portal espera y actualiza (la cursada queda como la dejo el portal) | portal: 55P03 (H6) |
| E8 A inserta y borra | B crea | B crea | 55P03 |

Tambien corri `node scripts/validateBulkRosterLocal.mjs`: PASS (13 casos, punta a punta, 5 de concurrencia, cleanup 0).

### 3. Contra el portal del alumno y el alta manual
Ver E4-E7 y T6 arriba. El portal hace `ON CONFLICT DO UPDATE` sobre la misma clave, asi que serializa con la carga masiva sin errores sin gateway. La carga masiva clasifica por lo que dejo el portal (no supone equivalencia). El alta manual (INSERT directo) en la misma clave deja a B esperando y luego actualizar rol o contar sin cambios.

### 4. Front, `runBulk` (`src/services/bulkRoster.js`)
Reintenta solo `code === '55P03'` o mensaje con `SOURCE_FILE_WORKSPACE_BUSY`; reenvia el mismo `chunk`; tope 6 llamadas en total con espera creciente (500 ms x intento, 7,5 s). El reporte solo suma despues de un lote correcto y `onProgress` se emite una vez por lote, asi que no se duplica. Otros errores (por ejemplo 42501) no se reintentan (test). Al agotar, el mensaje es claro y trae `partialReport` solo con los lotes anteriores. Observacion: un 55P03 por `lock_timeout` tambien se reintenta; es seguro porque la RPC revierte entera. Ver H4 y H2.

### 5. `BulkRosterSection`
Reglas de hooks respetadas: todos los hooks al inicio y sin condicionales; ESLint limpio sobre los 5 archivos. `running` vuelve a `null` en `finally` (un error o un rechazo no lo dejan colgado). Si la promesa de la RPC nunca resuelve, los botones quedan deshabilitados hasta desmontar (comprobado); es un limite razonable pero sin timeout propio. En curso, progreso, resultado, problemas y toasts quedan atados a `institucion:workspace` (`contextKey`), y los de A se muestran solo en A. El aviso "otra institucion" aparece en B mientras corre A. Ver H1 para lo que falta.

### 6. Tests y control negativo del front
Ejecuté los tests nuevos contra los archivos de `5bafedd^` (copias en `/tmp/claude-0/aud18/fe2`): fallan 5 de 14 (los 2 de servicio y los 3 de componente). Contra el codigo actual: 14/14 en verde. El control negativo es real. Los tests del componente prueban lo que dicen, pero no detectan H1 porque nunca vuelven a renderizar B con datos de A y luego lanzan.

## Limites
- Un solo contenedor Postgres local con el gateway de `source_file_storage_gateway.sql`; no es la base de Prod. No se probo con PostgREST/supabase-js reales, solo con psql como `authenticated`.
- Los escenarios de espera con triggers (`CONFLICTO_CONCURRENTE`, deadlock) usan triggers de prueba solo en la base descartable; las funciones auditadas son las del repo.
- No se probo el flujo completo del padre `GeneradorCronograma` (H1 se probo a nivel de componente y por lectura de `useWorkspacePersistence`).
- Los scripts de reproduccion estan en `/tmp/claude-0/aud18/` (`lib.mjs`, `s1.mjs`, `s2.mjs`, `fe/`, `fe2/`), fuera del repo. Mis bases descartables se borraron al terminar.
