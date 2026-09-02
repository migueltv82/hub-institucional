# Auditoria integral del motor de examenes

Fecha de corte: 2026-07-14.

Alcance: generacion docente estructurada, flujo administrativo experimental y preparacion tecnica de oficializacion. Esta auditoria no modifica la generacion oficial, `workspaceSnapshot.cronograma`, `cronogramaInteligente.js`, exportaciones ni Supabase productivo.

## 1. Resumen ejecutivo

Clasificacion: **LISTO CON OBSERVACIONES** para pruebas internas controladas, en modo sombra, sin publicacion ni exportacion oficial.

No esta listo para uso productivo ni para tomar el resultado experimental como cronograma completo. La cadena administrativa tiene validaciones defensivas, trazabilidad e integridad suficientes para probar comportamiento. Sin embargo, el precronograma experimental aun presenta limites funcionales que impiden usarlo como verdad institucional:

1. Construye mesas desde `titularidadesPorMateria`, no desde el universo efectivo de alumnos/materias que deben rendir. Una materia sin titular puede quedar fuera sin una mesa que evidencie la ausencia.
2. La UI usa solo el primer llamado y el helper elige la primera disponibilidad encontrada. No realiza una planificacion global de fechas y franjas.
3. Si la primera fecha disponible del titular esta bloqueada, se registra el conflicto pero no se busca automaticamente la siguiente fecha valida.
4. No existe edicion administrativa completa de fecha/franja de una mesa dentro del flujo experimental.
5. `fechasBloqueadasDocente` se aplica al flujo administrativo, pero no llega a `useCronogramaGeneration`, `cronogramaInteligente.js` ni al contexto construido por `buildRegularExamInputFromWorkspaceSnapshot`.
6. La cadena vive dentro de un snapshot JSON mutable y se calcula en cliente. No hay control transaccional ni autorizacion server-side.
7. La generacion oficial sigue trabajando internamente con `horariosPreparados`, aunque prioriza la fuente docente estructurada mediante un adapter.

Las pruebas serias deben considerarse una validacion de datos, reglas, UX y trazabilidad. No deben medir aun una tasa de aceptacion automatica del cronograma experimental sin contemplar estos limites.

## 2. Estado actual del motor

### Fuente docente

- `teacherStructuredSource.js` valida disponibilidad, carga horaria, titularidades y fallback legacy.
- Una fuente estructurada es valida cuando existen disponibilidad valida, carga valida y al menos una titularidad.
- Si la fuente estructurada es valida, se prioriza. `horariosDocentes` queda como fallback.
- `teacherExamSourceContext.js` normaliza docentes, asignaciones, horas institucionales, horas por carrera, titularidades, disponibilidad, dias de asistencia, limite mitad mas uno y fechas bloqueadas.
- La persistencia relacional real de disponibilidad y carga horaria ya existe. Las fechas bloqueadas siguen en `workspaceSnapshot`.

### Generacion oficial

- `useCronogramaGeneration.js` llama a `generarCronogramaDesdeArchivos`.
- `cronogramaInteligente.js` recibe la fuente estructurada, construye el contexto y genera filas compatibles mediante `resolveTeacherScheduleSourceForGeneration`.
- Titulares, vocales, compactacion, reparacion y validaciones internas siguen usando `horariosPreparados`.
- La fuente estructurada es prioritaria en la entrada, pero las reglas criticas oficiales no consumen todavia los indices normalizados del contexto.
- `fechasBloqueadasDocente` no se envia a este flujo.

### Flujo experimental

- Esta detras de `VITE_ENABLE_EXAM_ADMIN_REVIEW_WORKFLOW=true`.
- Se monta en la seccion administrativa `Revision`.
- No modifica automaticamente `cronograma`, no confirma mesas y no habilita exportaciones oficiales.
- Produce decisiones, borradores, promociones, requests, segundas aprobaciones, readiness y un plan tecnico efimero.

## 3. Mapa de modulos y flujo de datos

| Etapa | Modulo principal | Entrada | Salida | Validaciones principales |
| --- | --- | --- | --- | --- |
| Fuente docente | `teacherStructuredSource.js` | disponibilidad, carga, horarios legacy | resumen y fuente elegida | campos obligatorios, activos, horas positivas, titularidades |
| Contexto docente | `teacherExamSourceContext.js` | fuente docente y bloqueos | indices normalizados | identidad, carga, disponibilidad, activos, warnings |
| Precronograma | `adminReviewWorkflow.js` | contexto, planes y rango | mesas titular-only | titular, disponibilidad inicial, bloqueo de fecha |
| Agrupamientos | `adminReviewWorkflow.js` | mesas y correlatividades | sugerencias | titular, slot, conflictos y correlatividades |
| Recomendacion vocales | `adminReviewWorkflow.js` | mesa, contexto y selecciones | candidatos ordenados | disponibilidad, bloqueo, afinidad, cupo y conflicto |
| Decisiones | `adminReviewDecisions.js` | accion administrativa | decision persistible | elegibilidad y hard rules del candidato/agrupamiento |
| Cronograma revisado | `adminReviewApplyWorkflow.js` | precronograma y decisiones | preview no oficial | decisiones vigentes, duplicados, cupos, bloqueos, tribunal completo |
| Borrador | `adminReviewApplyWorkflow.js` | review listo | draft no oficial | estado preparable, trazabilidad y no oficialidad |
| Promocion | `adminReviewPromotionWorkflow.js` | draft, decisiones y contexto | evento promovido | revalidacion completa, SHA-256, revision append-only |
| Verificacion | `adminReviewPromotionWorkflow.js` | promociones y fuentes actuales | VERIFIED/MISMATCH/LEGACY/ERROR | hashes y schedule esperado |
| Elegibilidad | `adminReviewApprovalEligibility.js` | promociones verificadas | elegibles, bloqueadas, superadas | ultima revision, integridad, actor, decisiones, bloqueos |
| Request | `adminReviewApprovalRequest.js` | promocion elegible y actor | request append-only | revision actual, hash, actor y request activo unico |
| Segunda aprobacion | `adminReviewSecondApprovalEligibility.js` y `adminReviewSecondApproval.js` | request, promocion y segundo actor | evento SECOND_APPROVED | actor distinto, rol, hash, revision y duplicados |
| Readiness final | `adminReviewFinalReadiness.js` | cadena completa y contexto | finalCandidate | cadena, roles, hashes, schedule y reglas duras |
| Plan tecnico | `adminReviewOfficializationPlan.js` | finalCandidate y cronograma actual | plan efimero | fingerprints, actor, no overwrite y checks servidor |
| Contrato servidor | `adminReviewOfficializationServerContract.js` | plan y revalidaciones declaradas | contratos preparatorios | idempotencia conceptual, fingerprints y versionado |

Datos que no participan aun correctamente del universo experimental:

- `alumnos` se muestra en diagnostics de UI, pero no decide que materias ingresan al precronograma.
- Inscripciones, materias adeudadas y cantidad de llamados no determinan el precronograma titular-only.
- El segundo llamado no se construye en la vista experimental; se toma `regularCallRanges.first`.

Archivos principales revisados:

- `src/utils/examEngine/teacherStructuredSource.js`
- `src/utils/examEngine/teacherExamSourceContext.js`
- `src/utils/examEngine/teacherBlockedDates.js`
- `src/utils/examEngine/adminReviewWorkflow.js`
- `src/utils/examEngine/adminReviewDecisions.js`
- `src/utils/examEngine/adminReviewApplyWorkflow.js`
- `src/utils/examEngine/adminReviewPromotionWorkflow.js`
- `src/utils/examEngine/adminReviewApprovalEligibility.js`
- `src/utils/examEngine/adminReviewApprovalRequest.js`
- `src/utils/examEngine/adminReviewSecondApprovalEligibility.js`
- `src/utils/examEngine/adminReviewSecondApproval.js`
- `src/utils/examEngine/adminReviewFinalReadiness.js`
- `src/utils/examEngine/adminReviewOfficializationPlan.js`
- `src/utils/examEngine/adminReviewOfficializationServerContract.js`
- `src/utils/examEngine/comparison/buildRegularExamInputFromWorkspaceSnapshot.js`
- `src/utils/cronogramaInteligente.js`
- `src/hooks/useCronogramaGeneration.js`
- `src/services/workspaceSnapshot.js`
- `src/components/GeneradorCronograma.jsx`
- `src/components/generadorCronograma/TeacherRosterSection.jsx`
- `src/components/generadorCronograma/ExamAdminReviewWorkflowPanel.jsx`
- tests asociados a cada contrato y componente.

## 4. Reglas duras implementadas

| Regla | Estado | Aplicacion | Observacion |
| --- | --- | --- | --- |
| Titular obligatorio | Implementada | precronograma, draft, promocion, readiness | Una materia sin titular puede no entrar al precronograma; falta control de universo |
| Titular no consume afectacion | Implementada | ledger, seleccion, promocion, readiness | El ledger omite rol `TITULAR` |
| Vocal consume afectacion | Implementada | ledger y validaciones posteriores | La UI selecciona rol `VOCAL`; aliases no estandar deben revisarse |
| Mitad mas uno | Implementada | contexto y ledger | `floor(horasCatedra / 2) + 1`, sobre suma institucional estructurada |
| Disponibilidad semanal | Implementada | precronograma, recomendacion, promocion, readiness | La comparacion de rango presupone horas normalizadas `HH:mm` |
| Bloqueo full day | Implementada | helper y cadena experimental | No llega a generacion oficial |
| Bloqueo por franja | Implementada | helper y cadena experimental | Franja incompleta se normaliza conservadoramente como full day |
| Solapamiento parcial | Implementada tarde | promocion y readiness | Recomendacion temprana de conflicto usa slot exactamente igual |
| Franjas contiguas | Implementada | `doTimeRangesOverlap` | No se consideran solapadas |
| Docente duplicado en tribunal | Implementada | apply, promocion, readiness | Se bloquea titular repetido como vocal y vocal repetido |
| Conflicto fecha/franja | Implementada | promocion y readiness | Deteccion temprana solo exacta; deteccion final si es parcial |
| Tribunal titular + dos vocales | Implementada | apply, promocion, elegibilidad, readiness | `validatePreScheduleHardRules` solo exige al menos un vocal porque caracteriza el precronograma |
| Afinidad minima | Implementada como booleano | recomendacion de vocales | Se usa `afinidadValida`; no existe umbral numerico configurable |
| Decisiones administrativas vigentes | Implementada | apply y promocion | Las decisiones se actualizan in-place, no son eventos historicos |
| Promocion verificada | Implementada | verificacion, elegibilidad, request y readiness | Alteraciones quedan `MISMATCH` y pierden candidatura |
| Request valido | Implementada | request, segunda elegibilidad y readiness | No tiene sello propio al crearse; se hashea al aprobar por segunda vez |
| Segunda aprobacion valida | Implementada | eligibility, create y readiness | Evento separado y no oficial |
| Actores distintos | Implementada | request vs segunda aprobacion | El preparador del plan puede coincidir salvo opcion estricta |
| Roles autorizados | Parcial por etapa | segunda aprobacion, readiness y plan | Promocion/request validan presencia; la autoridad real sigue siendo informacion de cliente |

## 5. Flujo administrativo experimental

### Estado y persistencia

| Coleccion | Semantica del helper | Riesgo real en snapshot |
| --- | --- | --- |
| `adminReviewDecisions` | upsert por `type + targetId` | mutable; pierde historia de cambios de decision |
| `adminReviewDrafts` | upsert por `draftId` | mutable; mismo ID reemplaza borrador previo |
| `adminReviewPromotions` | append-only por `promotionId` | el array completo puede sobrescribirse por concurrencia de snapshot |
| `adminReviewApprovalRequests` | append-only por `requestId` | sin transaccion; dos clientes pueden crear requests concurrentes |
| `adminReviewSecondApprovals` | append-only por `secondApprovalId` | sin constraint servidor por request |
| `finalCandidate` | derivado, no persistido | debe reconstruirse con estado actual |
| `officializationPlan` | derivado y efimero | no es autorizacion ni escritura oficial |

### Fortalezas

- Cada etapa posterior vuelve a validar fuentes relevantes.
- El draft y la promocion permanecen `isOfficial: false`.
- Las promociones tienen revision, referencia anterior y verificacion automatica.
- Se detectan promociones superadas, ultima revision ambigua y requests duplicados.
- Request y segunda aprobacion exigen actores distintos.
- El readiness vuelve a revisar schedule, draft, decisiones, hashes, roles y bloqueos.

### Limites

- No existe transaccion ni control optimista por `updated_at` al guardar el snapshot completo.
- Los IDs se generan en cliente y algunos dependen del timestamp; no hay constraint persistente.
- El actor se toma del estado cliente. Sirve para trazabilidad interna, no para prueba de identidad.
- No existe historial append-only de cambios de decisiones ni borradores.
- El flujo no permite reubicar una mesa conflictiva y volver a validar el cambio como decision administrativa tipada.

### Auditoria de UI

- La vista identifica repetidamente que es experimental y que no reemplaza el cronograma oficial.
- Muestra mesas incompletas, hard rules, disponibilidad, afinidad, score, cupos antes/despues, promociones verificadas/bloqueadas/superadas, requests, segunda aprobacion, readiness y plan tecnico.
- No existe boton de oficializacion.
- Los codigos de reglas se muestran casi textuales; un administrativo puede necesitar un catalogo traducido a mensajes accionables.
- El boton de seleccionar vocal queda habilitado para candidatos no elegibles si el usuario puede editar. El handler bloquea y persiste `BLOCKED_HARD_RULES`, por lo que no viola reglas, pero la interaccion puede interpretarse como un error tardio.
- Se muestran solo las primeras 6 recomendaciones y los primeros 8 docentes del ledger, sin busqueda ni paginacion. Puede ocultar alternativas o sobrecargas en datasets grandes.
- El plan muestra fingerprints completos. No son secretos, pero agregan ruido para el usuario operativo.

## 6. Fechas bloqueadas docentes

### Contrato actual

`workspaceSnapshot.fechasBloqueadasDocente` conserva registros con:

```js
{
  id,
  docenteId,
  docenteNombre,
  date,
  scope: 'FULL_DAY' | 'TIME_RANGE',
  startTime,
  endTime,
  reason,
  source: 'manual_admin',
  status: 'ACTIVE' | 'INACTIVE',
  createdAt,
  updatedAt
}
```

### Integraciones confirmadas

- UI de alta, edicion y baja en `TeacherRosterSection.jsx`.
- Validacion y normalizacion en `teacherBlockedDates.js`.
- Persistencia y compatibilidad de snapshots antiguos en `workspaceSnapshot.js`.
- Indice `blockedDatesByTeacher` en `teacherExamSourceContext.js`.
- Precronograma: marca titular bloqueado.
- Recomendacion: excluye vocal bloqueado.
- Seleccion manual: vuelve a validar candidato/titular.
- Cronograma revisado: vuelve a validar titular y vocales.
- Promocion: valida full day, franja y solapamientos parciales.
- Elegibilidad: invalida una promocion si aparece un bloqueo posterior.
- Readiness final: vuelve a revisar todos los integrantes.
- Plan servidor: exige `BLOCKED_DATES_NOT_REVERIFIED` como bloqueo en el preflight preparatorio.

### Gaps

1. `useCronogramaGeneration` y `cronogramaInteligente.js` no reciben bloqueos.
2. `buildRegularExamInputFromWorkspaceSnapshot` no pasa `fechasBloqueadasDocente` al contexto.
3. No hay tabla relacional ni historial inmutable para bloqueos.
4. La baja desde UI elimina el registro en vez de archivarlo.
5. No hay control explicito de bloqueos duplicados o franjas superpuestas del mismo docente.
6. No existe vigencia temporal adicional ni zona horaria; se opera con fecha local `YYYY-MM-DD` y horas sin offset.
7. El precronograma no busca otra fecha si la primera opcion esta bloqueada.

## 7. Integridad, hashes y trazabilidad

### Persistidos

- Promocion: SHA-256 sobre draft completo, IDs aplicados/saltados y contexto docente normalizado. Incluye disponibilidad, carga, limites y fechas bloqueadas.
- Promocion: hashes individuales de draft, decisiones aplicadas, decisiones saltadas y contexto docente.
- Segunda aprobacion: `requestIntegrity`, calculada sobre el core del request y hash de promocion.
- Final candidate: hash derivado de IDs y hashes de promocion, request y segunda aprobacion.
- Plan: fingerprints SHA-256 del cronograma oficial actual y de la propuesta.

### Derivados

- El hash propio de segunda aprobacion se recalcula en readiness y se incorpora al candidato final.
- El candidato final y el plan no se persisten en el snapshot.
- La metadata de verificacion de promociones se recalcula al cargar y se vuelve a guardar.

### No protegidos criptograficamente

- `adminReviewDecisions` no tiene hash ni historial.
- `preScheduleHash` y parte del `draftId` usan un hash corto no criptografico.
- El request no guarda un sello propio al momento de su creacion.
- El snapshot completo no tiene firma ni version optimista.
- El actor administrativo no esta firmado por servidor.

### Autoridad actual

Todos los hashes y verificaciones son cliente-side. Detectan inconsistencias accidentales y alteraciones del snapshot en el flujo normal, pero un cliente con control del payload puede recalcularlos. La futura RPC debe reconstruir schedule, cadena, actores, roles, bloqueos y hashes desde datos persistidos bajo una transaccion.

## 8. Dependencias legacy

### Criticas para generacion oficial

- `cronogramaInteligente.js`: `horariosInput`, `horariosPreparados`, dias de asistencia, pool de vocales, compactacion, reparacion y validacion final.
- `useCronogramaGeneration.js`: conserva `horariosDocentes` como entrada y fallback.
- Rankings y edicion manual del generador siguen consultando `horariosDocentes` en distintos puntos de `GeneradorCronograma.jsx`.

### Compatibilidad

- `teacherStructuredSource.js` crea filas legacy desde disponibilidad y carga estructuradas.
- `teacherExamSourceContext.js` puede construir contexto desde `horariosDocentes` si no hay fuente estructurada valida.
- Snapshots anteriores siguen cargando.

### Riesgo legacy especifico

En contexto legacy, cada fila horaria se procesa tambien como carga. Si una misma asignacion aparece repetida por varios dias, las horas explicitas pueden sumarse mas de una vez. La regla mitad mas uno es confiable con `cargaHorariaDocente` estructurada; el fallback legacy requiere una prueba de caracterizacion con la plantilla institucional real.

## 9. Riesgos detectados

### Altos

1. Universo de examenes incompleto o sobredimensionado: el precronograma no parte de alumnos/inscripciones y no reconcilia cada materia del plan.
2. Planificacion temporal no global: primera fecha disponible, primer llamado y sin reparacion de fecha dentro del flujo admin.
3. Persistencia snapshot last-write-wins: riesgo de perder eventos si trabajan dos administradores.
4. Seguridad cliente-side: actores, roles y hashes aun no son autoridad.
5. Bloqueos docentes no integrados a la generacion oficial ni al adapter de input regular.

### Medios

1. Conflicto parcial puede aparecer recien en promocion/readiness y no en la recomendacion inicial.
2. Decisiones y borradores son mutables y no conservan revisiones historicas.
3. Afinidad minima es una regla booleana heuristica, no una politica institucional parametrizada.
4. Fallback legacy puede inflar carga horaria por filas repetidas.
5. Codigos tecnicos de bloqueo se muestran casi sin traduccion en UI.
6. Recomendaciones y ledger truncados en UI pueden ocultar casos relevantes en una prueba grande.

### Bajos para prueba interna

1. Diagnostics limitan payload sensible adecuadamente, pero algunos IDs y fingerprints completos son visibles para administradores.
2. El build advierte por chunks grandes; no afecta correccion funcional del flujo.

## 10. Pruebas existentes

La ejecucion enfocada confirma 190 tests relacionados en 14 archivos principales, ademas de tests del generador, adapters, reglas y Supabase docente. El inventario manual de casos `it(...)` identifica alrededor de 152 casos nominales; el total ejecutado incluye casos parametrizados y auxiliares de esos archivos.

Cobertura funcional destacada:

- 13 tests de workflow inicial.
- 13 tests de aplicacion y drafts.
- 19 tests de promocion e integridad.
- 4 tests de elegibilidad de promociones.
- 5 tests de requests.
- 9 tests de elegibilidad de segunda aprobacion.
- 5 tests de segunda aprobacion.
- 9 tests de readiness final.
- 8 tests de plan de oficializacion.
- 8 tests de contrato/preflight servidor.
- 10 tests de contexto docente.
- 4 tests de fechas bloqueadas.
- 28 tests del panel experimental.
- 17 tests generales de snapshot, varios dedicados a colecciones administrativas.

Escenarios bien cubiertos:

- prioridad estructurada y fallback legacy;
- docente multi-carrera y mitad mas uno;
- full day, solapamiento parcial y franja contigua;
- tribunal incompleto, duplicados y conflictos;
- promocion alterada, legacy y verify error;
- revisiones superadas y ambiguas;
- doble aprobacion, actor repetido y rol invalido;
- readiness final y plan no oficial;
- compatibilidad de snapshot y feature flag apagada.

Gaps de pruebas:

1. No hay un escenario institucional end-to-end que parta de un snapshot real y recorra todas las acciones hasta el plan.
2. No hay prueba de completitud: materias requeridas versus mesas creadas.
3. No hay prueba del segundo llamado en el panel experimental.
4. No hay prueba de seleccion automatica de una fecha alternativa ante bloqueo del titular.
5. No hay prueba de edicion/reprogramacion administrativa porque esa capacidad no existe.
6. No hay prueba concurrente con dos administradores/autosaves.
7. No hay prueba remota real de persistencia de colecciones administrativas en `workspace_snapshots`.
8. No hay carga, performance o volumen con cientos de materias/docentes.
9. No hay prueba browser E2E del recorrido completo con recarga entre cada evento.
10. No hay caracterizacion del limite legacy con una asignacion repetida en varios dias.

Validaciones ejecutadas en este corte:

- Suite enfocada: 14 archivos, 190 tests aprobados.
- Suite completa: 168 archivos, 1703 tests aprobados y 2 omitidos.
- `npm.cmd run lint`: correcto.
- `npm.cmd run build`: correcto; persiste una advertencia no bloqueante por chunks mayores a 500 kB.
- `git diff --check`: correcto; solo informa conversion futura LF/CRLF en archivos preexistentes del worktree.

## 11. Gaps antes de prueba seria

### Obligatorios para iniciar modo sombra

- Backup/export local del snapshot real antes de activar la flag.
- Fuente estructurada sin incompletos: docente, carrera, materia, horas y titularidad.
- Disponibilidad suficiente y fechas bloqueadas revisadas.
- Dos usuarios administrativos distintos con roles esperados.
- Definir un universo esperado de materias/mesas fuera del motor para comparar completitud.
- Acordar que ninguna salida se confirma, publica o exporta como oficial.
- Ejecutar un solo administrador escritor por workspace durante la prueba.

### Obligatorios antes de considerar piloto operativo

- Reconciliacion de universo de examenes contra alumnos/inscripciones/planes.
- Planificacion de ambos llamados.
- Edicion/reubicacion segura de fecha y franja con nueva decision trazable.
- Propagacion de fechas bloqueadas a todos los adapters y motores que se comparen.
- Persistencia transaccional o control optimista de eventos administrativos.
- Autorizacion y revalidacion server-side.

## 12. Plan de pruebas serias

### Fase 1: datos minimos controlados

- Objetivo: validar contratos y reglas aisladas con un dataset conocido.
- Datos: 2 carreras, 6 materias, 5 docentes y 2 actores.
- Validar: titularidades, horas, disponibilidad, bloqueos, afinidad, dos vocales y ledger.
- Salida: matriz esperada versus obtenida y snapshot de auditoria.
- Aprobacion: 100% de reglas duras coinciden y no se modifica `cronograma`.
- Bloqueo: materia omitida sin diagnostico, seleccion invalida aceptada o evento oficial accidental.

### Fase 2: un llamado pequeno real

- Objetivo: probar datos institucionales reales acotados.
- Datos: una carrera, un anio/curso, 8 a 12 materias y primer llamado.
- Validar: universo esperado, titulares, fechas, vocales y cupos.
- Salida: cronograma experimental y lista de diferencias contra expectativa manual.
- Aprobacion: 100% de materias esperadas visibles y cero hard rules en promociones candidatas.
- Bloqueo: omisiones, identidades ambiguas, bloqueos docentes ignorados o imposibilidad de corregir fechas.

### Fase 3: llamado completo julio-agosto

- Objetivo: medir escala, cobertura y saturacion de vocales.
- Datos: todas las carreras, planes vigentes, ambos llamados y bloqueos reales.
- Validar: tiempos, completitud, multi-carrera, mitad mas uno y conflictos globales.
- Salida: reporte por carrera, docente, causa de bloqueo y mesas incompletas.
- Aprobacion: ejecucion reproducible y todas las diferencias explicables.
- Bloqueo: resultados no deterministas, perdida de eventos, degradacion severa o conflictos no detectados.

### Fase 4: comparacion contra cronograma manual

- Objetivo: evaluar utilidad, no identidad exacta.
- Datos: cronograma manual validado y mismo snapshot de entrada.
- Validar: cobertura de mesas, conflictos, carga docente, fechas y agrupamientos.
- Salida: diff estructurado con verdaderos positivos, falsos positivos y omisiones.
- Aprobacion: cero omisiones criticas y ninguna propuesta que viole reglas duras.
- Bloqueo: el experimental parece valido pero omite materias o contradice disponibilidad confirmada.

### Fase 5: revision administrativa con usuarios reales

- Objetivo: validar comprension, tiempos y trazabilidad.
- Datos: snapshot congelado, dos actores y guion de decisiones.
- Validar: mensajes, bloqueos, promociones, request, segunda aprobacion y recarga.
- Salida: registro de acciones, errores de interpretacion y tiempos por tarea.
- Aprobacion: ambos usuarios identifican claramente que nada es oficial y completan el flujo sin asistencia tecnica.
- Bloqueo: confunden preview con oficial, no entienden codigos o pisan eventos entre sesiones.

### Fase 6: reporte de hallazgos

- Objetivo: decidir siguiente corte con evidencia.
- Datos: outputs de fases anteriores.
- Validar: severidad, reproducibilidad, owner y criterio de cierre.
- Salida: backlog priorizado P0/P1/P2 y recomendacion go/no-go.
- Aprobacion: todos los hallazgos criticos tienen reproduccion y decision.
- Bloqueo: datos o snapshots no son trazables a una version concreta.

## 13. Dataset minimo requerido

### Base positiva

- 2 carreras y 2 planes vigentes.
- 8 a 12 materias, con codigo, nombre, anio y carrera.
- 6 a 10 docentes activos.
- 1 docente titular en dos carreras.
- 2 docentes con varias materias.
- Carga horaria positiva y no duplicada por asignacion.
- Disponibilidad de 2 o 3 dias por docente, con turno y rango.
- Titularidad explicita para cada materia esperada.
- 2 cadenas de correlatividades.
- Materias homologas/afines y al menos una sin afinidad.
- Fechas de ambos llamados y dias habiles esperados.
- 20 a 40 alumnos con estado suficiente para construir un universo externo de comparacion.
- Cronograma manual o lista esperada de mesas.
- Dos actores distintos: solicitante y aprobador, ambos con rol administrativo permitido.

### Controles negativos

- 1 materia sin titular.
- 1 docente sin disponibilidad.
- 1 disponibilidad sin carga.
- 1 titular bloqueado full day.
- 1 vocal bloqueado parcialmente.
- 1 franja contigua no conflictiva.
- 1 docente al limite y 1 por encima de mitad mas uno.
- 1 intento de mismo actor en ambas aprobaciones.
- 1 promocion alterada despues de creada.

## 14. Escenarios criticos

| Escenario | Resultado esperado |
| --- | --- |
| Cronograma sin conflictos | review listo, draft y promocion verificable |
| Titular con fecha bloqueada | mesa bloqueada; nunca promocionable |
| Vocal con fecha bloqueada | candidato no elegible y seleccion bloqueada |
| Bloqueo parcial | bloquea solo si existe solapamiento real |
| Franja contigua | permitida |
| Supera mitad mas uno | vocal bloqueado y readiness invalido |
| Docente multi-carrera | horas institucionales sumadas una sola vez por asignacion |
| Dos mesas con mismo titular | conflicto si las franjas se solapan |
| Materias combinables | sugerencia visible, nunca aceptada automaticamente |
| Materias correlativas | sin inversion y con advertencia/violacion correspondiente |
| Tribunal incompleto | `REVIEW_INCOMPLETE`, sin draft ni promocion |
| Promocion alterada | `MISMATCH`, no elegible |
| Request superado | bloqueado por revision posterior |
| Mismo actor | segunda aprobacion bloqueada |
| Readiness bloqueado | no genera final candidate |
| Plan preparado | permanece efimero, no escribe cronograma |
| Materia esperada sin titular | debe aparecer como gap de universo; hoy puede omitirse |
| Titular con primera fecha bloqueada y segunda libre | hoy queda bloqueado; caso para confirmar gap de replanificacion |

## 15. Criterios de aceptacion

- Feature flag activa solo en entorno interno controlado.
- `workspaceSnapshot.cronograma` es identico antes y despues.
- Cero exportaciones/publicaciones oficiales desde el flujo experimental.
- 100% de materias del universo esperado reconciliadas como mesa o incidencia explicita.
- Cero tribunal con menos de titular y dos vocales en un draft promocionable.
- Cero docente duplicado o solapado.
- Cero fecha bloqueada ignorada.
- Mitad mas uno coincide con la suma institucional de horas estructuradas.
- Toda promocion candidata queda `VERIFIED` tras recargar.
- Request y segunda aprobacion usan actores distintos y roles autorizados.
- Una nueva revision supera correctamente la anterior.
- Diagnostics no exponen motivos sensibles ni filas crudas.
- Resultado determinista con el mismo snapshot congelado.

## 16. Criterios de bloqueo

- Cualquier escritura o cambio en el cronograma oficial.
- Materias esperadas ausentes sin incidencia explicita.
- Hard rule no detectada antes de readiness.
- Promocion `MISMATCH`, `LEGACY_UNVERIFIED` o `VERIFY_ERROR` considerada elegible.
- Docente bloqueado, no disponible, duplicado o excedido aceptado como vocal.
- Misma persona solicita y aprueba.
- Perdida o reemplazo de eventos por autosave/concurrencia.
- Datos estructurados incompletos con fallback legacy inadvertido.
- Horas legacy duplicadas que alteran mitad mas uno.
- Usuario que interpreta draft, promocion o plan como cronograma oficial.

## 17. Recomendacion final

**LISTO CON OBSERVACIONES** para iniciar Fase 1 y, si pasa, una Fase 2 acotada en modo sombra.

Condiciones de esta recomendacion:

- entorno no productivo o snapshot respaldado;
- feature flag explicita;
- un solo escritor por workspace;
- universo esperado calculado externamente;
- ninguna exportacion, confirmacion ni publicacion;
- resultados tratados como evidencia de auditoria, no como cronograma aprobado.

No avanzar directamente a la Fase 3 completa hasta resolver o medir los gaps de universo, primer llamado, replanificacion temporal y concurrencia.

## 18. Proximo paso recomendado

Crear un runner de auditoria read-only para un snapshot institucional real que:

1. Construya el contexto docente incluyendo fechas bloqueadas.
2. Calcule un universo esperado de materias desde planes/alumnos sin modificar el motor.
3. Ejecute precronograma, decisiones fixture, review, promocion, request, segunda aprobacion, readiness y plan.
4. Emita JSON/Markdown con materias esperadas, mesas creadas, omisiones, hard rules, ledger y hashes.
5. Verifique que `workspaceSnapshot.cronograma` conserva el mismo fingerprint.
6. No escriba Supabase ni el snapshot.

Ese runner debe preceder cualquier cambio de logica. Permitira ejecutar Fase 1 con una fixture controlada y luego Fase 2 con una copia anonimizada del snapshot real.
