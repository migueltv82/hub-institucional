# I2b — Titularidades y cursadas desde las planillas (local)

Fecha: 2026-10-19. Ejecutó: Claude. Entorno: base descartable sobre `supabase_db_codex-baseline-local-7725bdda`, con los 9 archivos del baseline y el fixture A/B. Staging y Producción: **NONE**.

## Qué se agregó (`07_academic_operations.sql`)

- **Helpers internos compartidos.** Los dos son `security definer` con `search_path=''` y no tienen EXECUTE para ningún rol de la API.
  - `academic_resolve_catalog_subject`: carrera por nombre o código dentro de la institución, y materia solo si está en un plan de esa carrera.
  - `academic_resolve_student_record_by_dni`: legajo por DNI dentro del workspace. Toma el de esa carrera; si no hay, uno sin carrera cargada. Rechaza un legajo de otra carrera y exige que el alumno tenga cuenta.
  - I2a pasó a usarlos sin cambiar su comportamiento: el harness de I2a sigue en PASS, con los mismos casos y las carreras concurrentes.
- **`academic_admin_bulk_assign_teachers`:** crea titularidades desde `docente_materia`.
  - Busca al docente por DNI y exige que tenga cuenta.
  - Rol: un rol vacío o `titular` queda como titular; `suplente` o `reemplazo`, como suplente; `licencia`, como licencia. Cualquier otro se rechaza con `ROL_INVALIDO`.
  - Crea la titularidad o le actualiza el rol; nunca borra.
- **`academic_admin_bulk_enroll_students`:** crea cursadas activas desde `alumnos_inscripciones`.
  - Si la cursada ya estaba activa, no cambia nada.
  - Si estaba dada de baja o borrada, no la reactiva: devuelve `CURSADA_DADA_DE_BAJA`.
- **Contrato común de las dos RPC:** solo owner/admin/editor o superadmin, hasta 1000 filas por llamada y reporte por fila.

## Resultado

`node scripts/validateBulkRosterLocal.mjs` → **PASS**, run `9f80c166f32609ba` y re-run `029309e0de5e3fff`, cleanup 0.

| Caso | Resultado |
|---|---|
| Contrato: RPC con EXECUTE solo para `authenticated`; helpers sin EXECUTE | OK |
| Alumno, docente y gestión de otra institución | 42501, sin cambios |
| Payload que no es lista | 22023 |
| Titularidades: 6 rechazos | Cada uno con su motivo: faltan datos, rol inválido, DNI inexistente, docente sin cuenta, materia fuera del plan, carrera inexistente |
| Titularidad creada (rol vacío = titular) | OK |
| Repetir | No duplica |
| Rol a suplente y de nuevo a titular | Actualiza el rol |
| Cursadas: 4 rechazos | Cada uno con su motivo: faltan datos, alumno sin cuenta, DNI inexistente, materia fuera del plan |
| Cursada creada | OK |
| Repetir | No duplica |
| Cursada dada de baja | No se reactiva (`CURSADA_DADA_DE_BAJA`) |
| **De punta a punta** | El docente asignado por planilla carga la nota del alumno inscripto por planilla con su RPC (`academic_teacher_upsert_student_grade`): `saved` |

## Regresiones (todas PASS)

| Harness | Run |
|---|---|
| I2a | `fa24f0f5aebcfbb2` |
| F1 | `2bde9068e4fb2f07` |
| 03.5b | `a4d20fe4b2ffd09e` |
| Publicación | `e27b2a471a5c3828` |
| QA.1 | `086011fd9a7d4595` |
| Paridad 03.3 | `56df71bb33a6aead` |
| 03.5c | `03a7a67fff2ba9d3` |
| 06.3 | `9e160085a2b628e9` |

## App

**Alumnos → Cursadas y titulares**: dos botones, "Aplicar titularidades (N)" e "Inscribir cursadas (N)". Al terminar muestra un resumen y la tabla de problemas, cada fila con su motivo.

## Producción

No aplicado. Hay que correr `07_academic_operations.sql` (idempotente) con el OK de Miguel.

## Correctivos de AUD.I2b (Claude, 2026-10-21)

Responde a `BULK_ROSTER_INDEPENDENT_AUDIT.md` (Codex). Staging y Producción: **NONE**.

### P1 — Vigencias con fecha nativa de Excel (commit `37961e4`)

`parseSheetDate` acepta `Date` (en UTC), número de serie de Excel, ISO con hora y DD/MM/AAAA, y valida la fecha de calendario. Un valor no vacío que no es fecha se rechaza con `VIGENCIA_INVALIDA`. Tests en `src/services/bulkRosterSheetDates.test.js`, con la reproducción de Codex (ExcelJS + importador real) y control negativo.

### P2 — Dos cargas concurrentes abortaban el lote entero (`07_academic_operations.sql`)

- **Causa:** el `FOR UPDATE` no serializa nada cuando la clave todavía no existe, y el INSERT sin manejo de conflicto daba 23505, que revertía también las filas ajenas al conflicto.
- **Corrección** en `academic_admin_bulk_assign_teachers` y `academic_admin_bulk_enroll_students`:
  - el INSERT usa `ON CONFLICT … DO NOTHING RETURNING id`, que espera a la otra transacción;
  - si la fila la creó otro, se **relee con `FOR UPDATE` y se clasifica por su estado real**: mismo rol = sin cambios; otro rol = se actualiza; cursada activa = sin cambios; cursada de baja o borrada = no se reactiva;
  - no se supone que el conflicto sea una fila equivalente;
  - si la fila desaparece entre el conflicto y la relectura, se informa `CONFLICTO_CONCURRENTE` en esa fila, sin abortar el lote.
- **Con el gateway de Storage (como en Prod)** las dos cargas no llegan a chocar en la tabla: el trigger del gateway toma un lock no bloqueante por workspace y la segunda falla entera con 55P03 sin escribir nada. Por eso `runBulk` (`src/services/bulkRoster.js`) reintenta ese lote hasta 6 veces con espera creciente. Es seguro porque cada lote es atómico e idempotente. Si sigue ocupado, explica que hay otra carga en curso. Cualquier otro error no se reintenta.

Harness `validateBulkRosterLocal.mjs` ampliado con la reproducción de Codex: dos conexiones psql reales; A deja la transacción abierta con `pg_sleep(3)`.

| Caso | Antes (07 anterior, control negativo) | Ahora |
|---|---|---|
| Titularidades: A crea FIX-A-01; B manda [AUDIT-A-02, FIX-A-01] | B: 23505, sin AUDIT-A-02 | B: 1 creada y 1 sin cambios; quedan 2 activas |
| Titularidades: A deja rol suplente; B pide titular | B: 23505 | B: 1 creada y 1 actualizada; queda titular |
| Cursadas: mismo escenario | B: 23505 (`subject_enrollments_current_key`) | B: 1 creada y 1 sin cambios |
| Con gateway: mismo escenario | — | B: 55P03 sin escribir nada (queda 1 activa) |
| Con gateway: reintentar el lote de B | — | 1 creada y 1 sin cambios; quedan 2 activas |

Run final `95af58eba6092162`: PASS (13 casos originales, punta a punta y 5 de concurrencia), cleanup 0.

### P2 — El resultado de la institución anterior seguía visible (`BulkRosterSection.jsx`)

- En curso, progreso y resultado quedan atados a `institución:workspace` del momento en que se lanzó la carga, y solo se muestran en ese contexto.
- Si la carga de A termina estando en B, no se muestra nada de A. Aparece un aviso neutro ("terminó la carga de la institución anterior"); si falló, el error se presenta como de la institución anterior.
- Una carga ya enviada no se cancela: sigue en la base de A.
- Mientras corre una carga de otra institución, los botones quedan deshabilitados y se explica por qué.

Tests en `BulkRosterSection.test.jsx`, con la reproducción de Codex: carga pendiente en A, cambio a B y resolución de A con DNI 30111222 / MATERIA-A, que no aparecen en B y sí al volver a A. También: resultado terminado, cambio de workspace y error de la anterior. Servicio: reintento ante 55P03 con el mismo lote, rendición con mensaje claro y ningún reintento ante otros errores. Control negativo: con el componente y el servicio anteriores fallan los 5 tests nuevos.

### Gate

- `npm run check`: PASS, 360 archivos y 2751 tests.
- Regresión local en PASS: catálogo de referencias `5c4d228cbc2c555a`, historia académica `e653337cee320376`, modelo docente `2bdeb10a342deeaf` y publicación de catálogo `6cbba1453e6426af`.
- Pendiente: reauditoría completa de Codex (cambia SQL del 07).


## Correcciones de la primera pasada de auditoría (AUD.18, 21/10)

Informe del auditor: `BULK_ROSTER_P2_AGENT_AUDIT.md`.

- **H1 (P2) · Cargar sobre B con las planillas de A.**
  - `useWorkspacePersistence` expone `hydratedInstitutionId`: la institución de la que son los datos en pantalla. Pasa a null al empezar a cargar otra y queda en null si esa carga falla.
  - `GeneradorCronograma` lo pasa a `BulkRosterSection` como `dataInstitutionId`. Los botones solo se habilitan si coincide con la institución activa, y `run()` lo vuelve a verificar.
  - Tests: el del hook cubre el cambio con la carga pendiente y fallida; los del componente cubren la reproducción del auditor (con datos de A y la institución B activa no se llama al servicio).
- **H2 (P3) · Deadlock 40P01 con dos cargas en orden opuesto.** `runBulk` lo reintenta igual que 55P03: el lote no escribió nada y es idempotente.
- **H4 (P3).** Test con varios lotes: el reporte y el progreso no se duplican al reintentar.

**Quedan sin corregir:**
- H3 (huecos del harness). Lo cubre el informe del auditor, con reproducciones propias.
- H5 (una licencia se pisa desde la planilla): es comportamiento previo.
- H6 (el portal recibe 55P03 crudo durante una carga): es del gateway.

## Corrección del gate de Codex (393aa51, 21/10) · importación pendiente de A publicada en B

- **Causa:** `useCronogramaFiles` captura la institución al empezar la importación, así que guarda en la correcta. Pero después publicaba las filas en el estado de la pantalla, que ya era de B, y `hydratedInstitutionId=B` habilitaba aplicarlas.
- **Corrección:**
  - Cada importación (maestra, docentes, alumnos) recuerda dónde se lanzó y sigue guardando ahí.
  - Si al terminar ya no se está en esa institución, **no publica nada en pantalla** y avisa que se guardó en la anterior.
  - Los errores también aclaran que son de la institución anterior.
- **Tests** en `useCronogramaFiles.test.js`, con la reproducción de Codex: el parser queda pendiente en A, se cambia a B y después se resuelve.
  - Docentes y alumnos: se guarda en A, ningún setter se llama y aparece el aviso.
  - Misma institución: publica como siempre.
- **Control negativo:** con el hook anterior fallan los 2 casos de A→B.
