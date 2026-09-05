# Worklog

Registro de trabajo del producto para estimar costo, esfuerzo y velocidad real.

## Criterio de conteo

- El historial anterior a este documento es estimado.
- La estimacion inicial se basa en fechas de commits, sesiones visibles y volumen de cambios.
- Desde este punto conviene seguir agregando entradas por sesion con horas reales.

## Resumen acumulado

- Inicio del producto: `2026-04-20`
- Horas estimadas acumuladas al `2026-04-22`: `24.0 h`
- Rango razonable de error sobre el historico inicial: `+- 2 h`

## Detalle

### 2026-04-20

- Horas estimadas: `7.0 h`
- Trabajo principal:
  - arranque del proyecto
  - primera version funcional
  - login/backend inicial
  - primeros cambios fuertes de arquitectura

### 2026-04-21

- Horas estimadas: `4.5 h`
- Trabajo principal:
  - mejoras de UX/UI
  - simplificacion del flujo
  - limpieza de arquitectura
  - base de persistencia y conexion a datos

### 2026-04-22

- Horas estimadas: `12.5 h`
- Trabajo principal:
  - conexion con Supabase
  - endurecimiento de configuracion
  - limpieza de codigo muerto
  - preparacion de base multi-tenant
  - selector de instituciones demo para pruebas aisladas
  - documentacion de seguridad y roadmap de monetizacion
  - login por magic link y sesion web persistida
  - checklist y seed para testeo remoto
  - modulo Super Admin con rutas protegidas
  - alta de instituciones y credenciales iniciales
  - SQL incremental de permisos y aprovisionamiento multi-tenant

### 2026-05-09

- Horas reales: pendiente de completar
- Trabajo principal:
  - resolucion de conflictos pendientes de Git
  - recuperacion de dependencias faltantes
  - verificacion de build, lint y tests
  - limpieza de carpeta duplicada del generador
  - normalizacion de scripts de inicio
  - documentacion de estructura, runbook y checklist operativo
  - endurecimiento de RLS y Storage para aislamiento multi-tenant
  - CORS configurable en Edge Function administrativa
  - pruebas negativas SQL para seguridad academica

### 2026-08-04

- Horas reales: pendiente de completar
- Trabajo principal:
  - bloqueo de inscripcion a mesa sin condicion regular y migracion 12 con `student_record_id` en `exam_enrollments`
  - alineacion del portal alumno y Edge Function con el criterio exacto del RPC para validar materia/carrera canonicas
  - propagacion de `student_record_id` y `subject_enrollment_id` entre carga docente de notas, modelo alumno y roster
  - validador punta a punta alumno-docente para inscripcion, roster, asistencia, nota y caso legacy slug a canonico
  - higiene de credenciales locales, salida de `.claude/settings.json` del index, rutas relativas en runbook y tests temporales portables

### 2026-08-05

- Horas reales: pendiente de completar
- Trabajo principal:
  - verificacion de la inconsistencia entre la fuente de verdad `upsert_exam_enrollment_from_portal` y sus dos espejos de UX/defensa en profundidad
  - alineacion de `examEligibility.js` con el criterio exacto del RPC para materia/carrera, incluido el caso de carrera vacia en ambos lados
  - alineacion de `admin-users/index.ts` con comparacion exacta post-trim para identidad de materia/carrera, manteniendo normalizacion solo para valores de condicion academica
  - cobertura de test para habilitar mesa sin carrera cuando la condicion tampoco tiene carrera, igual que en SQL
  - verificacion completa con `npm.cmd run check`
  - inicio de migracion hacia motor unico: fachada `examGenerationEngine` con legacy por defecto y `examEngine` adaptable a la UI actual bajo opcion explicita
  - comparador ejecutable `compareLegacyVsExamEngineGeneration.mjs` para auditar motor viejo vs `examEngine` contra un snapshot local real antes de reemplazar el flujo productivo
  - primera comparacion local real: legacy genero 52 mesas, `examEngine` 131, estado `CRITICAL`; no es seguro reemplazar legacy hasta revisar universo, titulares, vocales, fechas y claves sin equivalente
  - resumen de causas `summarizeLegacyVsExamEngineGeneration.mjs`: universo no equivalente, compactacion legacy no portada, 86 materias pendientes en `examEngine` por disponibilidad/superposicion, y diferencias en 11 mesas matcheadas
  - regeneracion de `docente_materia` candidata: 211 filas, 14 en revision, 6 materias unicas, 0 horarios huerfanos; se corrigio el script para no arrastrar archivos huerfanos obsoletos
  - sugerencias de titulares para practicas multidocente: 5 prellenables y 1 conflicto institucional (`QUI10`, legacy sugiere Herrera Lucia y `examEngine` sugiere Ortega Analia)
  - resolucion de conflictos de titulares tomando legacy como fuente vigente: `QUI10` queda con Herrera Lucia; la revision aplicada genera `docente_materia.corrected` con 6 titulares confirmados, 0 pendientes y 0 errores
  - impacto con `docente_materia.corrected`: completionRate sube de 0.3435 a 0.3588, mesas planificadas 45 a 47, pendientes 86 a 84, mesas completas 38 a 41, e inferencias de titulares 136 a 0
  - comparacion legacy vs `examEngine` actualizada para inyectar `docente_materia.corrected` en memoria: sigue `CRITICAL`, no listo para reemplazo; legacy 52 mesas finales, motor nuevo 131 totales, 47 planificadas y 84 pendientes
  - mejora del ranking de vocales del `examEngine`: prioriza vocales que comparten una fecha posible con el titular dentro del periodo antes de planificar, sin relajar afinidad ni mitad mas uno
  - nueva medicion real con `docente_materia.corrected`: motor nuevo pasa a 129 mesas totales, 59 planificadas y 70 pendientes; el motivo pendiente queda correctamente clasificado como `DOCENTE_SUPERPUESTO`
  - auditoria de compactacion legacy: 20 compactaciones explican parte de la brecha, pero 0 son seguras para replicar sin `plan_id` y revision institucional
  - diagnostico accionable de las 70 pendientes por `DOCENTE_SUPERPUESTO`: identifica docentes y mesas bloqueantes, cruza cada caso contra legacy y separa 36 sin equivalente, 18 resueltas por legacy con tribunal incompleto y 16 por compactacion
  - workpack de triage para `DOCENTE_SUPERPUESTO`: genera CSVs editables por carril (`universo sin equivalente`, `tribunal incompleto`, `compactacion`) con decisiones institucionales antes de tocar reglas del motor
  - traza del carril sin equivalente contra exclusiones legacy: los 36 casos tienen rastro legacy; 32 fueron excluidos por correlatividades, 3 requieren revisar matching/compactacion y 1 fue exclusion por docente disponible
  - ajuste del workpack de triage para no tratar el carril sin equivalente como "no requiere mesa" y priorizar revision de correlatividades/matching antes de cambiar reglas del motor
  - alineacion estricta de `planTentativeDates`: una materia posterior ya no puede obtener fecha si su correlativa previa no tiene fecha planificada, igual que la regla dura del legacy
  - nuevo diagnostico `diagnoseCorrelativityBlockingGap.mjs`: sobre los 32 casos legacy excluidos por correlatividad, 31 pasan a `CORRELATIVIDAD_CONFLICTIVA` en el motor nuevo y 1 queda planificada para revision puntual
  - nueva foto real post-regla: `examEngine` queda con 35 mesas planificadas y 94 pendientes; de esas pendientes, 86 son `CORRELATIVIDAD_CONFLICTIVA` y 8 `DOCENTE_SUPERPUESTO`, por lo que el siguiente frente es resolver previas/cascadas de correlatividad antes que superposiciones

### 2026-08-06

- Horas reales: pendiente de completar
- Trabajo principal:
  - ampliacion de `diagnoseCorrelativityBlockingGap.mjs` al universo completo de 86/87 materias pendientes por `CORRELATIVIDAD_CONFLICTIVA`, no solo los 32 casos del trace legacy
  - separacion de previas bloqueantes en 3 grupos: no encontrada en motor, pendiente por otra correlatividad y pendiente por superposicion docente
  - unificacion del alias de carrera `SUP`/`SUPERIOR` en `getSubjectKey` y `normalizeCareerText`, compartida por correlatividades, compactacion y llamados
  - nuevo `buildCorrelativityCascadeMap.mjs` para ordenar previas base por cantidad de materias posteriores que desbloquean
  - correccion de causa raiz en `plannedBySubject`: el motor perdia el codigo porque `buildCandidates.js` guardaba el nombre visible donde `getSubjectCode` buscaba codigo
  - propagacion de `materiaCodigo` y `codigo` explicitos por `buildCandidates.js`, `assignTitular.js`, `compactMesas.js` y `planTentativeDates.js`
  - resultado medible: `examEnginePlanned` sube de 35 a 38, `CORRELATIVIDAD_CONFLICTIVA` baja de 86/87 a 83 y `DOCENTE_SUPERPUESTO` pasa de 8 a 13 por superposiciones reales antes ocultas por el bug
  - verificacion completa en verde: 168 test files, 1618 tests pasados, 2 skipped y build OK
  - limitacion pendiente: `buildDocenteSuperpuestoTriageWorkpack.mjs` sobreescribe CSVs de triage sin preservar decisiones manuales previas
  - segundo bug de correlatividad encontrado y corregido: `getSubjectAliases()` matcheaba materias por nombre visible sin scope de carrera; dos materias homonimas de carreras distintas (`GRAMATICA INGLESA II` en Profesorado de Ingles e Ingles en Traductorado) se cruzaban entre si, bloqueando `ING20` con previas que no le correspondian
  - resultado final del dia: `examEnginePlanned` sube de 35 a 41, casos analizados en `correlativity_blocking_gap` bajan de 86/87 a 78 (61 `ALINEAR_EXAM_ENGINE_A_PREVIA_REQUERIDA`, 17 `REVISAR_ORDEN_FECHAS_CORRELATIVAS` pendientes de revisar uno por uno)
  - siguiente frente: de los 17 `REVISAR_ORDEN_FECHAS_CORRELATIVAS` restantes, al menos uno confirmado (`TRA11`) no es bug sino disponibilidad docente real mal etiquetada por prioridad de `getUnassignedReason()`; falta clasificar el resto antes de tocar mas codigo

### 2026-08-07

- Horas reales: pendiente de completar
- Trabajo principal:
  - clasificados los 17 casos `REVISAR_ORDEN_FECHAS_CORRELATIVAS` restantes: 14 eran disponibilidad docente real mal etiquetada, 3 eran un bug de orden de evaluacion distinto (ningun bug de matching nuevo)
  - tercer bug de correlatividad corregido: `getUnassignedReason()` marcaba `CORRELATIVIDAD_CONFLICTIVA` si aparecia en CUALQUIER intento de slot, aunque hubiera intentos posteriores donde la previa ya tenia fecha valida y el bloqueo real era disponibilidad docente; ahora ese motivo solo gana si TODOS los intentos fallidos tuvieron error de correlatividad
  - reclasificacion medible: `CORRELATIVIDAD_CONFLICTIVA` baja de 78 a 64, `DOCENTE_SUPERPUESTO` sube de 13 a 27, `TITULAR_NO_DISPONIBLE` aparece con 2 (mesas relabeled, no se perdio ninguna: total pendientes se mantiene en 93)
  - cuarto bug corregido: `sortMesasForPlanning()` ordenaba materias por heuristica (riskScore, fanout, etc.) sin garantizar que una previa se planifique antes que su posterior; se agrego un orden topologico (Kahn) sobre las aristas directas previa->posterior por encima de la heuristica existente, con fallback estable si hay ciclos
  - resultado final: `REVISAR_ORDEN_FECHAS_CORRELATIVAS` baja de 17 a 0; `analyzedCases` de `correlativity_blocking_gap` baja de 78 a 61, todos con decision `ALINEAR_EXAM_ENGINE_A_PREVIA_REQUERIDA` (bloqueo real por previa pendiente, no bug de motor)
  - verificacion completa en verde despues de cada uno de los dos fixes (168 test files, build OK)
  - cierra la cola de bugs de motor conocidos sobre correlatividades; el siguiente frente son las 27 `DOCENTE_SUPERPUESTO` reales (11 sin equivalente legacy, 8 tribunal incompleto, 8 compactacion), que requieren decision institucional (titulares/vocales/compactaciones), no mas codigo
  - triage del carril `LEGACY_SIN_EQUIVALENTE` (11 casos): separados en 3 grupos (5 con correlatividad ya resuelta y bloqueo real por disponibilidad docente, 5 sin rastro en legacy con el mismo patron, 1 caso de compactacion legacy con vocal pendiente)
  - descartada hipotesis de bug de orden de nombre (`NATALIA RAYA` vs `RAYA NATALIA` en `horariosDocentes`): el join de docentes ya normaliza por tokens ordenados (`normalizeNameAlias`), no es un bug; la escasez de disponibilidad de los docentes cuello de botella es real
  - redescubierto prototipo experimental `jointDateVocalPlanner.js` (documentado en `dateVocalAssignmentStrategyV2.md`), que evalua fecha y vocal como una sola decision en vez de asignar vocal antes que fecha; recorrido con datos frescos de hoy: completitud 33% (motor actual, 44/136 planificadas) vs 61% (prototipo, 83/136), con el resto bloqueado unicamente por `TITULAR_NO_DISPONIBLE`
  - decision: migrar esta estrategia al pipeline real (`generateRegular.js`), en 9 pasos incrementales tipo strangler-fig, empezando por una bandera opt-in
  - paso 1 hecho: `options.vocalPlanningMode` (`'current'` default / `'dateAware'`) agregado a `generateRegular.js`, sin cambiar ningun comportamiento todavia; solo queda trazado en `metadata.vocalPlanningMode`. Verificado: mismos 61 `analyzedCases` y 0 `REVISAR_ORDEN_FECHAS_CORRELATIVAS`, verificacion completa en verde
  - paso 2 hecho: `dateAwareVocalSelection.js` (`resolveAssignmentStrategy`, `buildTeacherSlotKey`, `selectDateAwareVocales`) promovido de `experimental/` a `planning/`, junto a los demas modulos de esa etapa; solo se actualizaron imports en los consumidores existentes, `generateRegular.js` todavia no lo importa. Verificacion completa en verde (168 test files, build OK; 2 fallas puntuales del primer intento fueron timeout por carga de maquina, no regresion, confirmado reproduciendolas aisladas)

### 2026-08-18

- Horas reales: pendiente de completar
- Trabajo principal:
  - revision de correctitud del motor de mesas (`src/utils/examEngine/`) contra las 13 reglas duras de `README.md`/`constants.js`, con dos pasadas independientes
  - alineados `README.md`, `HARD_RULES` y el codigo de error `validateMesa.js` al limite real de `MAX_SUBJECTS_PER_MESA = 3`: el valor lo habia cambiado Miguel a proposito en `cb980ee`, pero la documentacion y el nombre del codigo de error (`MAX_TWO_GROUPED_SUBJECTS`) habian quedado desactualizados diciendo "dos materias"
  - corregido bug real: un titular-cruzado (`lockedCrossTitular`) quedaba guardado con rol `VOCAL_1`/`VOCAL_2` en `assignVocalesForReviewedMesa.js` y `validateFinalTribunals.js`, consumiendo cupo de mitad-mas-uno indebidamente en vez de registrarse aparte como `TRIBUNAL_CRUZADO`
  - unificada la logica de disponibilidad por fecha en `rules/availability.js`: no leia `fechasDisponibles` ni matcheaba fechas ISO (solo nombre de dia de semana), a diferencia de la implementacion paralela en `assignVocales.js`/`planTentativeDates.js`
  - corregido `rules/correlativities.js`: la clave de la materia previa no sobrescribia `codigo` al construirse, asi que una fila de correlatividades con `codigo` explicito (el de la posterior) podia esconder una inversion real de correlatividad
  - corregido `compactMesas.js`: al fusionar una mesa sin vocales con una que si los tenia, se descartaban los vocales de la segunda y la mesa quedaba `COMPLETA` sin tribunal real
  - eliminada rama muerta `MISSING_ATTENDANCE_DAYS` en `calculateTeacherAssignmentLimit.js` (comprobado inalcanzable: la base por dias nunca devuelve `null`) y agregados tests con horas catedra impares/negativas
  - eliminado codigo muerto con bugs latentes sin ningun llamador real en el repo: `hasTitularVocalConflictSameDay`/`getMesaTeacherAssignments` en `roleConflicts.js` (no reconocia el formato real de rol `VOCAL_1`/`VOCAL_2`) y `assignVocalesToMesa` (singular) en `assignVocales.js` (usaba `candidate.date` en vez de `candidate.fecha`, bypaseando disponibilidad por fecha)
  - decision pendiente de Miguel, documentada en el test: `calculateTeacherAssignmentLimit.js` sigue cayendo a `DAYS_BASED_HALF_PLUS_ONE` (el modo "solo comparativo" segun `docs/teacherAssignmentRulesV2.md`) cuando nadie pide `ruleMode` explicito, aunque la regla vigente es `TEACHING_HOURS_HALF_PLUS_ONE`; cambiar el default rompe 63 tests en 13 archivos porque buena parte del pipeline de produccion (`buildVocalCandidates.js`, `assignVocales.js`, `dateAwareVocalSelection.js`, `repairIncompleteTribunalVocals.js`, `repairTribunals.js`, `validateTribunals.js`, `validateTeacherLoad.js`) depende hoy de ese fallback implicito; requiere decision institucional y migracion coordinada de fixtures, no un fix aislado
  - verificacion completa en verde: `npm run check` (lint limpio, 224 test files, 1857 tests, build OK)
  - segundo bloque el mismo dia: cerrado el fix scoped del `ruleMode` en vez de dejarlo solo documentado. Antes de tocar codigo se verifico que `comparison/buildRegularExamInputFromWorkspaceSnapshot.js:784` ya le inyecta `halfPlusOneRuleMode: TEACHING_HOURS_HALF_PLUS_ONE` a todo docente real que entra al pipeline de produccion sin condicion, asi que el fallback silencioso no afecta cronogramas generados por la app hoy; es una brecha defensiva, no una falla activa
  - se agrego `ruleMode: TEACHING_HOURS_HALF_PLUS_ONE` explicito en los ~7 call-sites de produccion que llamaban `calcularLimiteVocaliasPorLlamado`/`calculateTeacherAssignmentLimit` sin especificarlo: `validateTribunals.js`, `validateTeacherLoad.js`, `buildVocalCandidates.js`, `assignVocales.js` (4 sitios), `dateAwareVocalSelection.js`, `repairIncompleteTribunalVocals.js` (3 sitios) y `repairTribunals.js`; se dejaron intactos audit/experimental (ya piden el modo explicitamente cuando lo necesitan)
  - eso disparo exactamente los 63 tests previstos en 12 archivos: fixtures de docentes con `diasAsistencia` pero sin `horasCatedra` quedaban con limite 0 al forzarse el modo vigente. Se migraron todos agregando `horasCatedra` igual a la cantidad de `diasAsistencia` (la formula `floor(x/2)+1` es identica en ambos modos, asi que el mismo numero preserva el limite esperado por cada test)
  - verificacion completa en verde otra vez: `npm run check` (lint limpio, 224 test files, 1857 tests, build OK)

### 2026-08-19

- Horas reales: pendiente de completar
- Trabajo principal:
  - sesion multi-slot: pestanas independientes en el mismo navegador (`?sesion=X`), cada una con su propia clave de `localStorage` (`authStorage.js`, `sessionSlots.js`, `SessionSlotsModal.jsx`), sin cambiar el comportamiento de sesion unica de siempre; visible solo para admin de institucion/superadmin desde `DashboardPage.jsx`
  - auditoria completa de portal docente (materias, horarios, roster, asistencia, notas, estado final: todo ya funcionaba) y portal alumno (correlativas, docente/horarios, notas, condicion final: ya funcionaba; faltaban historial de mesas, correlativas para rendir, ausencia server-side y adeuda cuota)
  - detectado y corregido bug real en `buildPrerequisites()` (`studentPortalData.js`): forzaba `requirement_type: 'approved'` para toda correlativa incluso al cursar, cuando la regla real del instituto exige solo `regular` para la correlativa inmediata (indirectas si aprobadas) — nuevo `prerequisiteGraph.js` clasifica inmediata/indirecta por alcanzabilidad transitiva dentro de la misma lista
  - nuevo catalogo relacional de correlatividades/mesas/anios (`legacy_subject_prerequisites`, `legacy_exam_sessions`, `legacy_subjects_catalog`, `legacy_career_year_gate_overrides`) porque las correlatividades solo vivian en el JSON de `workspace_snapshots`, inaccesibles para cualquier RPC; sync desde JS (mismo patron que `rosterRecords.js`, no trigger SQL) enganchado en `saveWorkspaceSnapshot`
  - `upsert_exam_enrollment_from_portal` (migracion 15) ahora tambien exige todas las correlativas aprobadas para rendir, porta al servidor la penalidad de ausencia/mesa castigo que antes solo estaba en el cliente (bypaseable pegandole directo a la RPC), y bloquea por "adeuda cuota"
  - `upsert_subject_enrollment_from_portal` (migracion 16) gana su primer chequeo server-side de correlativas para cursar (antes era upsert ciego) y el gate nuevo de "anio completo" (para cursar el anio N>=3 hace falta tener aprobados los anios 1..N-2; confirmado con Miguel con los casos reales de profesorado anio 4 y tecnicatura anio 3, ambos son la misma formula)
  - "adeuda cuota" es un toggle manual nuevo (`student_financial_status`, escritura solo owner/admin, decision explicita de Miguel de no integrar pasarela de pagos por ahora) expuesto en el portal alumno via `get_student_portal_workspace_snapshot` (migracion 17) y editable desde `StudentFinancialStatusSection.jsx` en el panel admin
  - decision explicita de Miguel: no forzar cambio de contrasena a docentes/alumnos en el primer login (DNI se mantiene fijo) para evitar contrasenas olvidadas
  - se re-numeraron las migraciones nuevas de 13-16 a 14-17 al encontrar que ya existia `13_exam_teacher_assignment_confirmation.sql` sin documentar en CLAUDE.md (confirmacion docente de mesas, sesion anterior) — CLAUDE.md quedo desactualizado, la fuente de verdad real es el listado de archivos
  - verificacion completa en verde: `npm run check` (lint limpio, tests OK, build OK)

### 2026-08-24

- Horas reales: pendiente de completar
- Trabajo principal:
  - auditoria completa del schema `public` de Supabase: inventario real via `information_schema.tables` (35 tablas; el listado del Table Editor estaba virtualizado y ocultaba 6 filas en la UI, hay que confiar en SQL, no en el sidebar)
  - cruce de cada tabla contra el codigo real (`.from()`, RPCs, migraciones SQL) para separar activas de huerfanas del motor viejo pre-migraciones-numeradas
  - eliminadas 11 tablas huerfanas sin ninguna referencia en codigo ni fila de datos, todas creadas fuera del flujo de `supabase/setup_multi_tenant/` en una etapa anterior del proyecto: `careers`, `docentes`, `exam_assignments`, `exam_tables`, `grades`, `prerequisites`, `students`, `subject_teachers`, `subjects`, `teachers`, `teacher_schedules`
  - antes de borrar, mapeado el grafo de FKs entre las 11 (cluster cerrado, sin dependientes activos) y verificado que la unica politica RLS externa que las mencionaba (`enrollments_read_own` en `subject_enrollments`, referenciando la vieja `students`) ya estaba muerta en la practica porque `students` tenia 0 filas; la cobertura real de esa tabla la da la politica moderna `academic users read scoped subject enrollments`
  - verificado post-drop: las 11 tablas ya no existen y `subject_enrollments` conserva sus 3 politicas vigentes intactas
  - tablas equivalentes activas confirmadas para referencia futura: `student_records` (alumnos), `teacher_records` (docentes), `legacy_subjects_catalog` (materias, pese al nombre es el espejo activo de fase 14), `legacy_subject_prerequisites` (correlatividades), `student_grades` (notas), `subject_class_sessions`/`subject_attendance_records` (asistencia), `exam_teacher_assignments`/`exam_enrollments` (mesas)
  - hallazgo de seguridad separado: `.claude/settings.local.json` (gitignoreado, nunca comiteado) tenia 8 contraseñas reales en texto plano dentro de reglas de permisos `Bash(SMOKE_ADMIN_PASSWORD=...)`/`Bash(SMOKE_TENANT_PASSWORD=...)` de cuentas propias de Miguel (`migueltvism@gmail.com`, `migueltorresv82@gmail.com`); confirmado que `Desktop` no esta sincronizado con OneDrive (no es symlink ni vive bajo `%OneDrive%`), asi que el archivo nunca salio de la maquina y borrar las lineas alcanzaba sin necesidad de rotar clave; Miguel borro las lineas el mismo dia, decidio no rotar por ahora porque el proyecto sigue en fase de pruebas sin frontend desplegado (aunque el backend de Supabase ya es un proyecto `Production` real y expuesto por API independientemente del deploy del frontend)
  - wizard `/auto-mode-setup` corrido por Miguel (posture=mixed, scope=project): propuesta revisada pero no aplicada por decision de Miguel — no aporta urgencia, solo reduce bloqueos inconsistentes del clasificador de auto mode; contenido completo de la propuesta (contexto de entorno + reglas `allow`/`ask`) queda documentado en la conversacion para aplicar mas adelante si hace falta
  - arranque del rediseno del wizard de mesas (motor de examenes), pedido por Miguel para simplificar el proceso: plan de 5 fases guardado en `C:\Users\tinla\.claude\plans\spicy-noodling-beaver.md`, con dos decisiones ya tomadas — conectar un motor de fechas que respete asistencia docente para el precronograma en vez del pipeline completo, y construir una lectura simple de `exam_teacher_assignments` en vez de rescatar el panel `ExamAdminReviewWorkflowPanel` desconectado
  - Fase 0 completa: retirados los 3 estados fantasma del stepper (`DRAFT_GENERATED`, `WAITING_TEACHER_REVIEW_IMPORT`, `TRIBUNALS_GENERATED`) que `ExamEngineV21FieldTestPage.jsx` nunca alcanzaba en la practica (confirmado con grep en todo `src/`, cero referencias fuera de su propia definicion) — el stepper visible ya no miente sobre un paso de revision de fechas que nunca ocurria; `buildExamEngineV21DataFromWorkspace` ahora expone `correlatividades` (ya las calculaba `buildRegularExamInputFromWorkspaceSnapshot` pero se descartaban) y se las pasa a `useInteractiveTribunalSession`, que las necesita para validar combinaciones de mesas por regla de carrera/correlatividad y antes quedaba silenciosamente en `[]`
  - verificacion: `npm run check` en verde salvo 1 falla preexistente y no relacionada en `RegularExamPreviewInternalPanel.test.jsx` (panel interno DEV-only, ya estaba modificado antes de esta sesion) — no se toco como parte de esta fase, queda para revisar aparte
  - nota operativa: durante esta sesion se detecto que el entorno esta autocommiteando cambios solos despues de cada edicion (commit `fcb7746` "Fix exam field test workflow states" aparecio sin que se ejecutara `git commit`) — no es una accion tomada deliberadamente, parece un hook activo en la configuracion local; queda para que Miguel lo revise si no es el comportamiento que espera

### 2026-08-26

- Horas reales: pendiente de completar
- Trabajo principal:
  - Fase 1 del rediseno del wizard de mesas: motor de fechas que respeta asistencia docente
  - nuevo `src/utils/examEngine/planning/draftSchedule/planDraftScheduleDates.js` (`pickDraftDateForSubject`): entre las fechas del llamado, prioriza una en la que el titular efectivamente asiste (reusa `rules/availability.js`, no duplica la regla) y, entre esas, la de menor carga acumulada en la corrida; si el titular no tiene datos de asistencia cargados, cae al round-robin de siempre para no dejar la mesa sin fecha
  - `generateDraftExamSchedule.js` ahora delega el calculo de fecha a ese picker, mediado por el flag `examCallConfig.fechaAssignmentStrategy` (`'availabilityAware'` / `'roundRobin'`) para poder revertir con un cambio de config, sin rollback de codigo
  - nuevo `scripts/compareDraftScheduleDateStrategies.mjs` (mismo patron de seguridad que `runExamEngineShadowAudit.mjs`: solo JSON local, nunca muta el snapshot de entrada, `--anonymize` opcional via el anonimizador ya existente) — corre ambas estrategias sobre el mismo snapshot y arma un reporte Markdown con mesas por fecha, cuantas mesas quedan con el titular en un dia que no asiste, y el detalle de que mesas cambian de fecha
  - corrida real contra `local-audit/workspaceSnapshot.real.local.json` (gitignoreado, nunca sale de la maquina), periodo 2026-07-30 al 2026-08-12, anonimizada: 203 mesas totales en ambos casos, 108 cambian de fecha, las mesas con titular en dia que no asiste bajan de 67 a 0, la carga sigue repartida ~20-21 mesas por fecha en ambas estrategias (no se concentra), 70 materias sin datos de `docenteMateria`/horarios quedan en fallback round-robin igual que antes — reporte entregado a Miguel
  - decision de Miguel tras revisar el reporte: fijar `availabilityAware` como default de `DEFAULT_DYNAMIC_EXAM_CALL_CONFIG` ya, no esperar mas; `roundRobin` queda disponible como palanca de reversion explicita (`examCallConfig.fechaAssignmentStrategy = 'roundRobin'`) si aparece algun problema en uso real
  - verificacion: `npm run check` en verde completo — 248 test files, 2004 tests, lint limpio, build OK (la falla de `RegularExamPreviewInternalPanel.test.jsx` de la sesion anterior no se repitio, parece haber sido flaky/timing, no se toco codigo de ese archivo)
  - **Fase 1 completa.**
  - Fase 2: combinar mesas en bloque con preview de ahorro, antes de entrar a completar tribunales mesa por mesa
  - hallazgo importante durante la implementacion: llamar `compactCompatibleMesas` directo sobre el `reviewedSchedule` (mesas sin vocales todavia) fallaba siempre con `ESTADO_COMPLETA_SIN_TRIBUNAL_COMPLETO`, porque esa funcion asume mesas ya con tribunal armado salvo que se le pase `allowIncompleteTribunal: true`; y aparte, llamarla directo se salteaba una regla institucional que solo vive en `combineReviewedMesas.js` (`canCombineMesasByCareerRule`: combinar carreras distintas solo si ambas materias son TIC o ambas pedagogicas/didacticas) — el combine manual interactivo ya la aplica, pero `compactCompatibleMesas` sola no
  - por eso el nuevo `src/utils/examEngine/planning/tribunals/planBulkMesaCombinations.js` NO llama a `compactCompatibleMesas` directo: reusa `evaluateMesaCombination` (la misma funcion pareja-a-pareja que ya usa el panel interactivo) como unica fuente de verdad de si dos mesas pueden combinarse, y solo agrega el barrido greedy multi-mesa (mismo orden de prioridad que usa el motor internamente) por encima — bulk y manual quedan garantizados consistentes porque comparten la funcion de aprobacion
  - nuevo `src/features/exams/components/BulkCombineMesasPreview.jsx`: preview en modo seguro/completo con desglose por tipo de compactacion, boton "Aplicar combinaciones sugeridas" que reemplaza el `reviewedSchedule` en memoria (no toca Supabase) y resetea las selecciones de vocal ya hechas por mesas que dejaron de existir; la via manual mesa-por-mesa sigue intacta como alternativa
  - se exporto `SAFE_COMPACTION_TYPES` de `compactMesas.js` para que el modo "segura" del preview en bloque use exactamente el mismo criterio que ya usaba `compactCompatibleMesas` internamente, sin duplicarlo
  - verificacion: `npm run check` en verde — 250 test files (+2), 2013 tests (+9), lint limpio, build OK. No se pudo probar visualmente en el navegador porque la app pide login real y no hay credenciales disponibles en esta sesion; queda pendiente que Miguel lo confirme a mano o comparta credenciales de prueba
  - **Fase 2 completa.**
  - Fase 3: cierre real del loop de revision docente, sin depender de exportar/importar un archivo
  - nuevo `fetchExamTeacherAssignmentsForReview` en `src/services/examTeacherAssignments.js`: lee `exam_teacher_assignments` filtrando por institucion/workspace/mesas publicadas; no hizo falta RPC nueva porque la policy `academic admins manage exam teacher assignments` ya permite `select` a cualquier admin de la institucion
  - nuevo `summarizeTeacherReviewStatus` en `examEngineV21FieldTestService.js`: cruza el precronograma publicado con las filas reales de Supabase por `exam_table_id` y rol (titular/vocal1/vocal2), usando los nombres que ya guarda `metadata` en cada fila para no tener que hacer un join aparte
  - nuevo `src/features/exams/components/TeacherConfirmationStatusPanel.jsx`: contador agregado (confirmadas/pendientes/objetadas) + detalle por mesa con las notas del docente cuando objeta, boton "Actualizar"; se dispara solo tambien despues de publicar
  - `ImportAction` (CSV/XLSX/JSON) paso a ser una seccion colapsada aparte, aclarando que sigue siendo necesaria solo para docentes sin cuenta de portal — no se elimino, se complemento como decia el plan
  - verificacion: `npm run check` en verde — 251 test files (+1... en realidad +2 nuevos: examTeacherAssignments ya existia, se sumaron TeacherConfirmationStatusPanel.test.jsx y los casos nuevos en archivos existentes), 2023 tests, lint limpio, build OK. Hubo 4 fallas por timeout de 5s en la corrida completa (`RegularExamComparisonAudit`, `useRegularExamPreviewEngine`, `regularExamPreviewUiDto`, `regularExamPreviewIntegrationContract` — la familia de tests del preview interno del motor nuevo, ya documentada como flaky bajo carga de maquina el 2026-08-07); confirmado que las 89 pasan 100% corridas aisladas, y la corrida completa siguiente dio 251/251 verde sin tocar nada de esos archivos
  - **Fase 3 completa.**
  - Fase 4 (ultima): wizard real de 6 pasos, reemplazando el `WorkflowStepper` decorativo + `StateProgress` redundante por un unico stepper que si controla que seccion se monta — la causa directa del "arriba y abajo" que se queria resolver
  - pasos: Configurar llamado / Precronograma / Combinar mesas / Completar tribunales / Envio a docentes / Cronograma final. `FIELD_TEST_UI_STATES` sigue siendo la fuente de verdad interna (no se renombro, la usan otros archivos); se agrego `resolveCurrentStepId()` que colapsa esos estados a los 6 pasos, mas un `combineStepDone` nuevo para distinguir "Combinar mesas" de "Completar tribunales" dentro del mismo `REVIEWED_IMPORTED` (generar el precronograma sigue yendo derecho a combinar, sin la pausa fantasma que Miguel pidio sacar)
  - `viewStepId` separado del progreso real (`currentStepId`): un click en un paso ya completado del stepper solo cambia que se ve, nunca reinicia nada; en cuanto el proceso avanza de nuevo, vuelve a seguir el paso actual solo (mismo patron de "adjusting state during render" que ya usaba el archivo para el formulario). Banner "Volver al paso actual" cuando se esta mirando algo atras
  - `WorkflowStepper.jsx` gano `onSelectStep`/`activeIndex`: los pasos ya visitados o el actual son clickeables, los futuros no. Sin `onSelectStep` sigue siendo de solo lectura (no se rompio ningun otro uso, aunque termino siendo el unico consumidor)
  - `OperatorHandbook`, `DataReadinessBanner`, "Materias sin titular" y el resto de las ~17 secciones que antes estaban todas apiladas juntas ahora viven en el paso al que corresponden; `WarningList` quedo visible siempre (es corta, no aporta al problema de scroll)
  - verificacion: `npm run check` en verde — 252 test files (+1: `WorkflowStepper.test.jsx`, mas actualizacion del smoke test de la pagina para navegar paso a paso en vez de asumir todo visible junto), 2026 tests, lint limpio, build OK
  - **Fase 4 completa. Plan de `spicy-noodling-beaver.md` cerrado — las 5 fases (0 a 4) estan implementadas y verificadas.**

### 2026-08-27

- Horas reales: pendiente de completar
- Trabajo principal:
  - Miguel probo el wizard de 6 pasos en vivo y funciono, pero pidio simplificarlo mas. Conversando el como, describio un flujo propio que revelo un requisito nuevo: los llamados **especiales** (pocas mesas sueltas, sin interrumpir clases) tienen que armarse **100% a mano** — ni generador automatico de fechas ni asignacion automatica de vocales; los **regulares** siguen 100% automaticos, solo con menos pasos visibles
  - nuevo plan (mismo archivo `spicy-noodling-beaver.md`, reemplazando el anterior ya cerrado): wizard de 6 a 4 pasos (Configurar llamado / Armar mesas / Envio a docentes / Cronograma final) + camino manual completo para especiales
  - investigacion previa confirmo que ningun consumidor downstream (`exportGeneratedTribunalsForReview`, `publishExamTeacherAssignmentsForReview`, `validateFinalTribunals`, `reconcileFinalTribunalReview`) depende de que una mesa haya pasado por `useInteractiveTribunalSession` — todos leen campos planos, asi que una mesa armada a mano entra sin cambios a revision docente y cronograma final
  - nuevo `src/utils/examEngine/planning/manual/buildManualMesa.js`: arma una mesa desde inputs de formulario, resolviendo titular/vocales por nombre o id via `findTribunalDocente`/`getTribunalDocenteId`/`getTribunalDocenteLabel` (reusadas tal cual de `buildTribunalCandidatePool.js`, cero funciones nuevas de resolucion); si el texto no matchea un docente real, sigue de largo con el nombre libre y el id vacio (mismo criterio tolerante que ya usa la importacion de filas revisadas)
  - nuevo `src/features/exams/components/ManualMesaBuilderForm.jsx`: formulario con datalist de materias (prellena carrera/anio al matchear, editable igual) y de docentes, boton "Agregar mesa" que acumula en memoria, tabla con "Quitar", "Continuar a envio a docentes" que entrega la lista arriba
  - `ExamCallConfigForm.jsx`: en tipo "Especial" se oculta el alcance por carrera/anio (no aplica sin generador automatico) y el boton pasa a decir "Continuar a armar mesas"
  - `ExamEngineV21FieldTestPage.jsx`: `WIZARD_STEPS` baja a 4; se saca `combineStepDone` (ya no hace falta distinguir combinar de completar tribunales, ahora se muestran juntos sin boton intermedio); nuevo `continueToManualBuild()` que salta `generateDraftExamSchedule` por completo para especiales, dejando `draftResult`/`draftExport` en null; nuevo `confirmManualMesas()` que arma `{ generatedTribunals: mesas }` y reusa `confirmTribunalSelection` sin tocarla
  - verificacion: `npm run check` en verde — 254 test files, 2039 tests, lint limpio, build OK
  - **hallazgo real durante la prueba en vivo contra Instituto jim** (no un bug de esta sesion): el datalist de docentes mostro UUID en vez de nombre para 10 de 73 docentes. Investigado hasta la causa: `buildRegularExamInputFromWorkspaceSnapshot.js` (lineas 618-619, 669-670) ya hace `nombre: nombre || id` como fallback preexistente del motor completo cuando no puede extraer un nombre legible de la planilla/horarios de ese docente — afecta a cualquier pantalla que muestre `docente.nombre`, no es especifico de esta feature. Queda pendiente de investigar aparte cuales de esos 10 docentes tienen datos incompletos en la planilla real
  - probado en vivo contra Instituto jim (datos reales, sesion ya autenticada) de punta a punta en ambos caminos: regular (combinar+tribunales fusionados, mismo resultado de 89 tribunales de ahorro que ya se habia visto) y especial (mesa cargada a mano con "AGÜERO SUSANA" de titular y "ALE JIMENA" de vocal 1, resuelta correctamente contra el padron real, llego intacta a "Envio a docentes" con estado TRIBUNAL_MINIMUM). No se publico de verdad para no notificar a un docente real
  - **Fase 5 completa.**

### 2026-08-26

- Horas reales: pendiente de completar
- Trabajo principal:
  - soporte: investigacion y correccion del hallazgo pendiente de la sesion anterior (10 docentes que el motor de mesas mostraba con UUID en vez de nombre)
  - diagnostico via SQL directo contra Instituto jim (Miguel corrio las consultas en el SQL Editor, yo las arme): no eran docentes faltantes en el padron -- los 10 ya existen completos en `teacher_records` (nombre, dni, materias), con cuenta de portal activa en `auth.users` (varios con `last_sign_in_at` reciente, gente usando el sistema). El problema era que sus 26 filas en `subject_teacher_assignments` tenian `teacher_id` (el id de Auth, resuelto por email/dni) pero `teacher_record_id` en NULL -- nunca se linkearon a su fila del padron
  - causa raiz mas probable: una carga masiva vieja (26 filas concentradas en un lote de segundos el 2026-05-20 21:55, mas un par sueltas despues) que resolvio el docente solo por email/dni hacia Auth y nunca completo el link a `teacher_records`. El codigo actual de la UI (`TeacherRosterSection.jsx` -> `createSubjectTeacherAssignment`) ya pasa `teacherRecordId` correctamente, asi que no parece un bug activo hoy, es resaca de esa carga vieja
  - fix aplicado: `UPDATE subject_teacher_assignments set teacher_record_id = ... where teacher_id = ... and teacher_record_id is null`, solo para las 26 filas de estos 10 docentes (scripts descartables, no quedaron en el repo). Verificado en 0 antes de cerrar: `select count(*) ... where teacher_record_id is null` para esos 10 `teacher_id` dio 0
  - no hizo falta tocar codigo: `buildRegularExamInputFromWorkspaceSnapshot.js` y `workspaceSnapshot.js` ya resuelven el nombre correctamente en cuanto `teacher_record_id` esta presente, era puramente un problema de datos
  - pendiente opcional (no se investigo): confirmar si existe todavia algun flujo de carga masiva de titularidades que siga sin completar `teacher_record_id`, para evitar que se repita con datos nuevos
  - producto: arranque del rediseño visual de los 3 portales. Miguel pidio "mas agradable y amigable" para los tres; acordamos empezar por el **portal alumno** (el mas consumer-facing) antes de tocar admin/docente
  - le mostre un prototipo interactivo (Artifact HTML, no en el repo) con paleta pastel lavanda/menta/coral/dorado/rosa, tipografia Baloo 2 (titulos) + Nunito (texto), botones pill con press-effect, y barra de navegacion inferior fija para mobile en vez del nav superior que se rompia a grid de 2 columnas. Lo aprobo: "me gusta, dale para adelante con esto"
  - implementado en `src/styles/globals.css`: tokens nuevos `--student-*` (paleta + radios + sombras) scopeados bajo `.student-portal`, con su variante oscura via `@media (prefers-color-scheme: dark)` y `html[data-theme="dark"] .student-portal` -- mismo patron que ya usaba el archivo. Retinteado via CSS unicamente (sin tocar JSX) de `.btn-primary/.btn-secondary/.soft-card/.metric-card/.input-base` *dentro* de `.student-portal` (selector descendiente, admin y docente no se tocan), mas todas las clases ya namespaced (`.student-dashboard-stats`, `.student-subject-card`, `.student-career-progress`, `.student-profile-strip`, etc.)
  - `StudentPortalModule.jsx`: hero paso de degrade oscuro a tarjeta clara pastel; nav se separo en dos variantes responsivas del mismo `baseNavItems` (mismos `NavLink`, misma logica) -- pills arriba en desktop (>=768px), barra inferior fija con iconos en mobile (<768px)
  - barrido acotado de Tailwind crudo: los 17 usos de utilities `-teal-` (color de marca vieja) en las 4 paginas que los tenian pasaron a `text-[var(--student-lavender-ink)]` / equivalentes: los colores semanticos (`slate-*`, `red-*`, `emerald-*`) se dejaron como estaban, a proposito, para no inflar el riesgo de esta primera pasada
  - se instalaron `@fontsource/baloo-2` y `@fontsource/nunito`; `.certificate-document` (analitico imprimible) quedo explicitamente excluido con su propia regla de mayor especificidad, sigue en Arial/Georgia como corresponde a un documento formal
  - **hallazgo durante la verificacion visual en vivo (Instituto jim)**: el archivo tenia varios bloques `html[data-theme="dark"] .student-*` duplicados/obsoletos de una iteracion anterior (mismo selector definido dos y hasta tres veces, algunos con `!important`) que ganaban por especificidad sobre los nuevos tokens y rompian el modo oscuro (hero y fondo general se quedaban con los colores viejos). Se identificaron y eliminaron; tambien parte de un media query mobile compartido con `.teacher-portal-nav` forzaba `display: grid` sobre el nav de escritorio del alumno y lo mostraba encima de la barra inferior nueva -- se saco `.student-portal-nav` de ese bloque, `.teacher-portal-nav` no se toco
  - verificacion: `npm run check` en verde -- 254 test files, 2048 tests, lint limpio, build OK. Probado en vivo contra Instituto jim (sesion real de alumno) en mobile (375px) y desktop, claro y oscuro: hero, stats, tarjetas de materia, botones e input funcionan correctamente en los 4 casos. Confirmado por diff que ningun archivo de admin ni de docente se toco, y que cada selector CSS modificado en `globals.css` contiene "student" (scoping verificado)
  - pendiente: aplicar la misma direccion a panel admin y portal docente, si a Miguel le sigue gustando en uso real. El plan de este trabajo (`spicy-noodling-beaver.md`) documenta el detalle completo

### 2026-09-04

- Horas reales: pendiente de completar
- Trabajo principal:
  - primera carga de datos reales al schema relacional nuevo (`supabase/schema/02_academic_relational_schema.sql`, proyecto Supabase separado `qwrwwansdblcixkjmibx`, institucion "Instituto San Miguel"): 6 carreras, 7 planes, 226 materias, 243 correlatividades, 24 equivalencias, 65 docentes, 189 asignaciones docente-materia, 273 horarios, 307 alumnos y 307 trayectorias academicas, via `scripts/normalizeImportedTemplates.mjs` + `scripts/validateNormalizedImport.mjs` + `scripts/importNormalizedData.mjs --apply --confirm`
  - `estado_academico_alumno.csv` quedo vacio a proposito: la planilla de alumnos recibida no trae notas ni materias cursadas, no se inventaron datos
  - corregido a mano un error de carga en `planes_estudio.csv`: un buscar-y-reemplazar habia pisado el encabezado `plan_nombre` y cambiado los codigos de plan de 5 carreras (`GEO-PLAN` etc. a `GEO-2015` etc.), lo que hubiera roto 986 referencias ya cargadas en `materias_plan.csv`, `correlatividades.csv`, `docente_materias.csv`, `horarios_cursada.csv` y `alumno_carrera_plan.csv`; se revirtieron los codigos y se dejo solo el nombre de plan corregido
  - **bug real encontrado en produccion**: `teacher_subject_assignments` tenia 945 filas en vez de las 189 esperadas (multiplo exacto x5). Causa: la unique constraint `(institution_id, plan_subject_id, teacher_id, valid_from)` no atrapaba duplicados cuando `valid_from` viene vacio, porque en Postgres `NULL <> NULL` para efectos de `unique`/`ON CONFLICT` -- cada corrida repetida del importador insertaba de nuevo las mismas 189 asignaciones en vez de actualizarlas. Confirmado con Miguel que las 5 copias por grupo eran identicas (mismo `role`/`status`/`notes`) antes de tocar nada
  - fix aplicado en dos partes: el schema (`unique nulls not distinct` en la definicion de la tabla, para instalaciones nuevas) y la base ya viva (`DELETE` con `row_number()` para quedarse con la fila mas antigua de cada grupo + `ALTER TABLE` para reemplazar la constraint vieja por la corregida). Verificado en 189 filas exactas despues del fix
  - pendiente: `disponibilidad_docentes.csv` y `llamados_examen.csv` no las genera ningun script todavia; conectar la app para que lea progresivamente estas tablas relacionales nuevas (todavia lee del modelo viejo)
  - **hallazgo grave de seguridad, corregido**: al copiar hoy `public/plantillas/base-datos/` e `importacion/` al repo, quedaron commiteados y pusheados a `origin/main` (commit `d77e968`) pese a que el `.gitignore` que los excluye se agrego en el mismo commit -- gitignore no destrackea algo agregado explicitamente en la misma operacion. 17 archivos con datos reales de 307 alumnos y 65 docentes (nombre, DNI, email, horarios) quedaron en el historial de un repo privado. Se saco del tracking (`git rm --cached` + commit `163c1ad`, sin tocar los archivos locales); la limpieza de historial (`git filter-repo` + force-push) queda pendiente, es una decision aparte
  - decidido con Miguel: el motor de mesas de examen va a leer directo el schema relacional nuevo, sin puente de compatibilidad tipo dual-write (ese mecanismo protege produccion viva de `examenes`, este proyecto Supabase no tiene produccion real todavia). Confirmado con Miguel: `diasAsistencia` de un docente = dias que dicta clase segun `course_schedules`; los bloqueos puntuales (licencia, etc.) van en una tabla nueva chica, `teacher_exam_date_exclusions` (`supabase/schema/04_teacher_exam_date_exclusions.sql`)
  - relevamiento completo de las reglas duras del motor leyendo el codigo real de `src/utils/examEngine/rules/` y `validation/` (no la lista generica RD-01..RD-10 de la skill, que no existe en el codigo): titular obligatorio y no puede ser vocal de su propia mesa, vocal1≠vocal2, maximo de materias agrupadas, materias no agrupables (Practicas Discursivas III/IV), mitad-mas-uno (titularidades y tribunales cruzados no consumen cupo), jerarquia de horas catedra explicita→inferida, afinidad academica del vocal (incluye tabla institucional hardcodeada por codigo de materia, compatible con los codigos ya importados), no invertir correlatividades, cantidad de llamados por periodo, exclusion manual por carrera cerrada
  - implementado `src/utils/examEngine/relationalSource/` (fetch + map + orquestador, 22 tests): arma la entrada del motor (`docentes`, `horariosDocentes`, `docenteMateria`, `planesEstudio`, `correlatividades`, `alumnos`) leyendo directo `careers`/`study_plans`/`subjects`/`study_plan_subjects`/`subject_prerequisites`/`teacher_records`/`teacher_subject_assignments`/`course_schedules`/`student_records`/`student_career_plans`/`teacher_exam_date_exclusions`, sin pasar por `workspace_snapshots`. Reusa tal cual la logica de negocio existente (`buildRegularExamInputFromWorkspaceSnapshot.js`, `calculateTeacherAssignmentLimit.js`) -- el trabajo fue mapeo de campos, no reescritura del motor
  - tres trampas reales encontradas leyendo el adaptador consumidor antes de escribir el mapeo (no eran obvias desde el schema): `course_schedules.weekday` (1=lunes) no coincide con la convencion interna del adaptador y hay que traducirlo a string en español; `starts_at`/`ends_at` traen segundos y el parser de horas no los reconoce, hay que recortar a `HH:MM`; `teacher_subject_assignments.status='active'` no lo reconoce el normalizador de estados (solo tokens en español), hay que traducirlo a `'ACTIVO'`/`'BAJA'` explicito -- sin esto, toda asignacion docente-materia hubiera quedado marcada como inactiva
  - agregada tambien `03_workspace_data.sql` (tabla `workspace_snapshots`, quedaba pendiente de commitear desde el fix del error original "no se pudo recuperar el workspace")
  - **limpieza de deuda tecnica encontrada de paso**: 12 archivos `*SupabaseSql.test.js` en `src/services/` (28 tests) fallaban con `ENOENT` leyendo SQL de `supabase/setup_multi_tenant/`, carpeta que ya no existe en este repo. Confirmado que no tienen implementacion JS ni SQL fuente en ningun lado del repo -- son puro peso muerto de la migracion desde `examenes`. Eliminados con aprobacion de Miguel
  - verificacion: `npm run check` en verde -- 262 test files, 2087 tests, lint limpio, build OK (antes de la limpieza: 274 archivos, 2115 tests, 28 fallando por lo del punto anterior)
  - corrido `scripts/examEngineAudit/previewRegularExamPlanFromAcademicSchema.mjs --admin` contra Instituto San Miguel real (65 docentes, 226 materias, 243 correlatividades, 307 alumnos): confirma que el lector nuevo funciona de punta a punta. Encontro y explico dos cosas sin tocar codigo, ambas datos reales, no bugs: (1) 63 de 65 docentes resueltos porque 2 pares comparten DNI real -- eran la misma persona cargada dos veces en la planilla original; (2) 0 mesas generadas porque 12 de 226 materias (`ING23`, `ING33`, `QUI06`, `QUI08`, `QUI19`, `QUI21`, `QUI25`, `QUI27`, `QUI33`, `GEO32`, `LAB39`, `ING02`) no tienen ningun docente asignado todavia (confirmado con SQL: 0 filas en `teacher_subject_assignments` y `course_schedules` para esas 12) -- el motor rechaza generar por la regla `DIAGNOSE_BEFORE_GENERATE`, correctamente
  - de paso, un bug real en el reporte del motor (no en la Fase 1): `buildPipelineReport` (`src/utils/examEngine/validation/reports.js`) deduplica issues por shape completo, pero `normalizeIssue()` no sabe leer `entityId`/`entityType` (el shape que usa `feasibility.js` para identificar la materia) -- las 12 `MATERIA_SIN_TITULAR` distintas colapsaban en 1 sola en `executiveSummary.totalErroresCriticos`. Hay que leer `result.diagnosis.errors` (forma cruda) para ver los 12 casos reales. No se toco, queda para una sesion aparte
  - fusionados los 2 pares de `teacher_records` duplicados por DNI (`31256302`, `32110882`) en Supabase: combinados los campos con `COALESCE` (sin perder dato de ninguna de las dos filas), repunteadas las referencias en `teacher_subject_assignments`/`course_schedules`/`teacher_exam_date_exclusions`, borradas las filas redundantes. Verificado en 0 filas duplicadas restantes
  - pendiente, decision de Miguel no de codigo: asignar docente a las 12 materias sin titular (las va a cargar el desde el front)
  - **segundo hallazgo de seguridad, corregido**: al escribir el doc de handoff (`docs/codex-continuar-motor-relacional-fase-2.md`), un `git add` de ese unico archivo volvio a subir los 17 archivos con datos personales (commit `592864a`) -- las 2 lineas de `.gitignore` que los excluian habian desaparecido sin edicion deliberada de por medio (causa exacta no determinada). Corregido de nuevo en `0786e6d`: lineas restauradas, archivos sacados del tracking otra vez, verificado con `git status` que quedan ocultos. Anotado en el doc de handoff como alerta para no repetirlo: chequear `.gitignore` antes de cualquier commit, no asumir que sigue como se dejo

## Como usar este archivo

- Valor del producto:
  - `horas acumuladas x tarifa objetivo`
- Costo de evolucion:
  - sumar horas reales por bloque funcional
- Precio comercial:
  - no usar solo costo/hora; sumar valor del problema que resuelve, ahorro operativo y riesgo evitado

## Plantilla sugerida para siguientes sesiones

- Fecha:
- Horas reales:
- Tipo:
  - producto
  - soporte
  - comercial
- Resultado:
