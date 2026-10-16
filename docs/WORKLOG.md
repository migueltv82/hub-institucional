# Worklog

## 2026-10-04 — Mitigación focal Storage path traversal

Keys tenant/actor/workspace/dataset/UUID y guard de prefijo en servicio/cleanup; policy restrictiva mínima aplicada solo en staging. 71 focales PASS, suite 2298 PASS, lint/build/diff-check PASS. Exploit original 403 y objetos ajenos/cross-tenant denegados. Auditor independiente identificó bypass por normalización HTTP hacia key canónica; confirmado escapando horarios hacia docentes. P1 sigue abierto, Security 2 no retomada. Cleanup final todos conteos 0; Production mutations NONE. Evidencia y límites en `supabase/baseline/STAGING_SECURITY_2_RESULT.md`. QUALITY GATE: FAIL.

## 2026-10-04 — Security Acceptance 2 retomada en Staging

Validación funcional HTTP de Storage y guards de admin-users, exclusivamente en Staging. Detención ante primer P1: upload con `security2/../traversal.csv` permitido y persistido fuera del subdirectorio. Sin corrección de código/schema/RLS/grants/configuración. Cleanup SQL final confirma 0 objetos, usuarios, identidades, sesiones, refresh tokens, instituciones, perfiles, memberships y auditorías. Production mutations: NONE. Evidencia: `supabase/baseline/STAGING_SECURITY_2_RESULT.md`. Casos restantes pendientes por regla de detención.

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

### 2026-09-26

- Horas reales: pendiente de completar.
- Etapa 02.6: planificación de aislamiento de staging y remediación, sin crear staging, sin modificar Supabase remoto, sin ejecutar SQL remoto, sin aplicar 02.3, sin desplegar Edge Functions y sin cambiar runtime.
- Topología actual: metadata read-only confirmó que `Hub-Institucional` es el único proyecto Supabase visible que corresponde al producto; los otros proyectos visibles (`cs automotores`, `Lulu Torres Ceramica`) no son ambientes de Hub y están inactivos. No hay staging/development remoto identificado para Hub.
- Topología objetivo: production = `Hub-Institucional`; staging = proyecto/branch persistente separado con credenciales, secrets, Storage y datos sintéticos propios; local development = Supabase local cuando sea viable.
- Estrategia de fuente de verdad: recomendar transición híbrida, reconciliando `supabase/schema/*.sql`, security scripts y `repair_*` antes de crear un baseline reproducible; desde ese corte, avanzar con migrations incrementales. No se creó `supabase/migrations/` en esta etapa.
- Datos/fixtures: definido seed sintético multi-tenant A/B, identidades ficticias por rol, prohibición de copiar PII real y plan de pruebas para `handle_new_user`, RLS/RPC, Storage, Edge Functions y frontend staging.
- 12 RPC ausentes: clasificadas sin inventar implementación; `upsert_exam_enrollment_from_portal` y `get_academic_transition_config` quedan como necesarias por runtime/contrato, y las restantes como features internas/incompletas actualmente gated o no aptas para producción sin backend versionado.
- 30 `EXECUTE`: preparado criterio de clasificación por grant (`EXPECTED`, `OVERPERMISSION`, `NEEDS INVESTIGATION`) sin ejecutar `REVOKE`.
- Artefactos 02.6: creados `docs/STAGING_IMPLEMENTATION_PLAN.md` y `docs/STAGING_CREATION_CHECKLIST.md`.
- Seguridad 02.6: sin datos personales extraídos, sin secrets expuestos, sin usuarios creados, sin deploy, sin cambios remotos.
- Etapa 02.7: continuación tras creación manual de `Hub-Institucional-Staging` por el usuario en Supabase Dashboard, con costo informado `NINGUNO`.
- Verificación metadata 02.7: `supabase projects list` confirmó production `Hub-Institucional` `ACTIVE_HEALTHY` (`qwrw…mibx`) y staging `Hub-Institucional-Staging` `ACTIVE_HEALTHY` (`lzjp…aeco`), ambos en `sa-east-1`; las refs son distintas y no hay identidad de entorno ambigua.
- Link local 02.7: se inspeccionó `supabase/.temp/`; el checkout sigue linked a production, `supabase/.gitignore` ignora `.temp`, y no se ejecutó `supabase link`.
- Conectividad staging 02.7: `supabase db query --help` confirmó que la CLI permite `--linked`, `--local` o `--db-url`, pero no `--project-ref`; sin cambiar link ni usar credenciales nuevas, no se ejecutó consulta SQL read-only contra staging.
- Schema staging 02.7: `HUB APPLICATION SCHEMA: NOT DEPLOYED` como estado operativo documentado; no se aplicaron migrations, no se ejecutó 02.3, no se cargaron seeds, no se desplegaron Edge Functions y no se creó/modificó Storage/Auth. No hubo comprobación de catálogo SQL contra staging porque requeriría `db-url` o relink.
- Documentación 02.7: actualizados `docs/STAGING_IMPLEMENTATION_PLAN.md`, `docs/STAGING_CREATION_CHECKLIST.md`, `docs/RUNBOOK.md`, `docs/PRODUCTION_READINESS.md` y `docs/WORKLOG.md` con estrategia de selección segura de ambiente: antes de cualquier mutación remota verificar `TARGET ENVIRONMENT`, `PROJECT NAME` y `PROJECT REF`; production requiere aprobación humana explícita.
- Seguridad 02.7: sin mutaciones remotas, sin SQL mutante, sin service-role, sin secrets expuestos, sin `.env` modificado y sin datos personales extraídos.
- Etapa 02.8A: baseline canónico reproducible investigado localmente, sin tocar staging ni production.
- Inventario SQL 02.8A: 35 archivos `.sql` bajo `supabase/` clasificados en `supabase/baseline/BASELINE_MANIFEST.md` como CANONICAL, SECURITY PATCH, MIGRATION CANDIDATE, REPAIR ONLY, DIAGNOSTIC, TEST, VALIDATION, DEPRECATED o NEEDS INVESTIGATION.
- Baseline 02.8A: identificados 8 archivos canónicos (`supabase/schema/01_foundation.sql` a `07_academic_operations.sql`, incluyendo `05_student_portal_secure_read.sql`) y orden futuro de instalación; no se creó SQL ejecutable ni `supabase/migrations/` porque la fuente canónica sigue incompleta.
- Blockers 02.8A: `get_academic_transition_config` y `upsert_exam_enrollment_from_portal` no tienen implementación SQL autoritativa localizada; el modelo de mesas (`exam_teacher_assignments`, `exam_enrollments`, confirmaciones/reset) sigue en repairs históricos y requiere reconciliación.
- Repairs 02.8A: clasificados en A/B/C/D/E; ningún `repair_*` entra automáticamente al baseline.
- Seguridad 02.8A: `handle_new_user()` canónico queda endurecido localmente, se reforzó cobertura estática para blockers del baseline y `SECURITY DEFINER` con `search_path`; sin service-role, sin secrets, sin SQL remoto y sin datos personales.
- Artefactos 02.8A: creados `docs/BASELINE_READINESS.md` y `supabase/baseline/BASELINE_MANIFEST.md`; actualizados docs operativos para marcar `LOCAL BASELINE EXECUTION PENDING`.
- Etapa 02.8B-1: recuperado el contrato de `get_academic_transition_config` sin implementar SQL ni tocar Supabase remoto.
- Evidencia 02.8B-1: el único caller runtime es el portal alumno (`academicRelationalData.js`), sin argumentos; la fuente sustentada es `app_settings.key = 'academic_relational_transition'`, global y privada; la Edge Function ya usa lectura server-side equivalente.
- Decisión 02.8B-1: `IMPLEMENTAR RPC` en subpaso posterior, como lectura read-only mínima con `EXECUTE` para `authenticated`, sin `anon` ni `public`, manteniendo la fila privada y devolviendo solo el DTO de transición.
- Baseline 02.8B-1: contrato documentado en `docs/contracts/get_academic_transition_config.md`; el blocker P1 persiste hasta crear SQL canónico y tests. Remote mutations: NONE.
- Etapa 02.8B-2: implementada localmente `public.get_academic_transition_config()` en `supabase/schema/01_foundation.sql`, sin ejecutar SQL, sin deploy y sin tocar Supabase remoto.
- Seguridad 02.8B-2: la RPC no recibe parámetros, usa `SECURITY DEFINER`, `set search_path = ''`, referencias calificadas, defensa interna con `auth.uid()`, revoca `EXECUTE` a `public/anon/authenticated` y concede explícitamente a `authenticated`; no agrega grant explícito a `service_role`.
- Fail-safe 02.8B-2: config ausente/inválida cae a `snapshot_only`; los flags relacionales peligrosos solo se activan con booleano JSONB `true`; la función devuelve solo el DTO contractual y no expone la fila completa de `app_settings`.
- Tests 02.8B-2: ampliado `src/services/supabaseFunctionSecurityMatrix.test.js` para cubrir definición SQL, grants, minimum disclosure, contrato SQL/JS y defaults fail-safe.
- Baseline 02.8B-2: `get_academic_transition_config` cambia a `RESUELTO LOCALMENTE — PENDIENTE VALIDACIÓN DB`; persisten como riesgos `upsert_exam_enrollment_from_portal`, modelo de mesas y validación dinámica PostgreSQL. Remote mutations: NONE.
- 02.8C-1 Contract Recovery: contrato de `upsert_exam_enrollment_from_portal` documentado en `docs/contracts/upsert_exam_enrollment_from_portal.md`; se reconstruyeron callers, firma de 14 parámetros, DTO, reglas de regularidad/correlativas/ausencia/deuda, idempotencia y threat model. Decisión: `MODELO DE DATOS BLOQUEA LA IMPLEMENTACIÓN` porque `exam_enrollments`/`exam_teacher_assignments` siguen en repairs históricos y `exam_table_id` no referencia una mesa canónica. Remote mutations: NONE.
- 02.8C-2 Contract/Data Model Design: modelo canónico de mesas definido en `docs/contracts/exam_tables_canonical_model.md`, con `exam_tables`, `exam_table_subjects`, `exam_teacher_assignments`, `exam_enrollments` y eventos append-only; resuelve identidad `uuid`, compatibilidad legacy, FKs tenant-safe, estados, idempotencia y migración conceptual. No se implementó SQL/runtime ni se ejecutó Supabase CLI. Remote mutations: NONE.
- 02.8C-3 Schema Implementation Local Only: implementado localmente `supabase/schema/08_exam_tables.sql` con `exam_tables`, `exam_table_subjects`, `exam_teacher_assignments`, `exam_enrollments`, `exam_enrollment_events` y `exam_table_events`; incluye identidad `uuid`, compatibilidad legacy, FKs tenant-safe, validadores trigger, índices de idempotencia, estados canónicos y RLS default-deny con grants mínimos.
- Alcance 02.8C-3: no se implementó `public.upsert_exam_enrollment_from_portal`, no se migraron datos legacy, no se ejecutó SQL remoto/local, no se usó Supabase CLI, no hubo `db push`, no hubo deploy, no se usó service-role y no se expusieron secrets.
- Tests 02.8C-3: agregado `src/services/examTablesCanonicalSchema.test.js` para validar contrato estático del schema canónico, separación de repairs legacy, FKs críticas, idempotencia, RLS default-deny y ausencia de la RPC aún pendiente.
- 02.8C-4A Contract/Data Model Design: resuelto el blocker P1 de ausencia/castigo a nivel contrato. No existe fuente compat segura: los campos `ausente`/`fecha_ausencia` del snapshot/UI y `student_grades` no alcanzan institución, legajo, mesa fuente/destino, vigencia, estado e idempotencia sin ambigüedad. Creado `docs/contracts/exam_absence_penalties.md` con modelo mínimo `exam_absence_penalties`, tenant boundaries, identidad por `student_record_id`, idempotencia por `source_event_key`, estados `active/pending_review/fulfilled/voided/expired`, semántica fail-closed para la futura RPC y estrategia legacy sin migrar datos. No se implementó SQL, no se ejecutaron migrations, no se tocó staging/production y no hubo mutaciones remotas.
- 02.8C-4B Schema Implementation Local Only: implementado localmente `public.exam_absence_penalties` en `supabase/schema/08_exam_tables.sql`, sin implementar `public.upsert_exam_enrollment_from_portal`, sin ejecutar SQL, sin migrations, sin `db push`, sin Supabase remoto y sin service-role.
- Modelo 02.8C-4B: incluye FKs tenant-safe hacia legajo, plan, mesa/materia fuente, inscripción fuente y mesa/materia bloqueada; estados `active/pending_review/fulfilled/voided/expired`; scopes `next_exam_call_for_subject` y `specific_exam_table_subject`; idempotencia por `source_event_key` y `absence_semantic_key`; RLS default-deny sin grant directo a `authenticated`.
- Tests 02.8C-4B: agregado `src/services/examAbsencePenaltiesSchema.test.js` para validar columnas contractuales, estados, scopes, checks temporales, FKs, idempotencia, RLS/grants, ausencia de `user_metadata`, no implementación de la RPC pendiente y documentación de baseline.

### 2026-09-24

- Horas reales: pendiente de completar.
- Trabajo principal: auditoría documental de preparación para producción contra el checkout actual.
- Actualizados `PRODUCTION_READINESS.md` y `PRODUCTION_SCOPE.md` para clasificar los flujos con estados explícitos, separar implementación local de verificación remota y registrar las brechas del esquema canónico de mesas.
- Sin cambios de runtime, SQL, dependencias ni infraestructura remota.
- Etapa 00.2: estabilizada la puerta local `npm.cmd run check` sin tocar runtime, SQL, RLS, dependencias, despliegues ni scripts de calidad.
- Causa raíz: `src/services/adminUsersEdgeFunctionSecurity.test.js` extraía el cuerpo de `persistStudentRecord` con una expresión regular sensible a finales LF exactos; en Windows/CRLF no encontraba el bloque y las aserciones posteriores recibían una cadena vacía.
- Fix: el test conserva el contenido fuente y normaliza solo los saltos de línea antes de extraer `persistStudentRecord`; se agregó cobertura parametrizada LF/CRLF y se mantuvieron las mismas aserciones de seguridad sobre workspace, carrera, `select`, filtros, `onConflict` y rechazo de `institution_id,external_code`.
- Documentación: `RUNBOOK.md` registra el `Quality Gate antes de merge`, alcance/límites de auditorías y procedimiento ante fallos; `PRODUCTION_READINESS.md` actualiza los resultados observados; este worklog registra causa, fix y verificación.
- Verificación focal: `npm.cmd test -- src/services/adminUsersEdgeFunctionSecurity.test.js` en verde, 8 tests aprobados.
- Verificación completa: `npm.cmd run check` en verde, con `audit:repo` OK, lint OK, 277 archivos de Vitest y 2203 tests aprobados, build OK y `audit:prod` OK sobre 119 archivos. Se mantienen advertencias no bloqueantes de chunks grandes.
- Revisión de auditorías: probes aislados en memoria validaron que `audit:repo` y `audit:prod` sigan rechazando rutas `.env`, patrones de secreto sintéticos, sourcemaps y flags demo de producción; no se guardaron archivos ni credenciales reales.
- Etapa 01.1: CI de GitHub Actions consolidada en `.github/workflows/ci.yml` para PR hacia `main` y pushes a `main`.
- Versión Node usada por CI: `22.13.0`, compatible con los `engines` reales de Vite, `@vitejs/plugin-react`, Vitest y jsdom en `package-lock.json`.
- Comando de CI: `npm ci` seguido de `npm run check`; no se duplican manualmente lint/tests/build fuera del script existente.
- Variables especiales: ninguna; no se agregaron secretos, credenciales Supabase, `service_role` ni variables `VITE_*`.
- Protección de ramas: `docs/BRANCH_PROTECTION.md` quedó alineado al check `Quality gate (Node 22.13)` y mantiene `Dependency Audit` como auditoría manual mientras `EX-001` siga vigente.
- `quality:deps`: ejecuta `npm audit --audit-level=high`, no forma parte de `check` y en 01.1 falló por deuda preexistente documentada en `EX-001` (45 vulnerabilidades: 31 high, 13 moderate, 1 low). No se actualizaron dependencias; el workflow de dependencias queda manual hasta un triage específico.
- Etapa 01.2: política de protección de `main` definida en `docs/BRANCH_PROTECTION.md`, alineada al workflow `CI` y al job `Quality gate (Node 22.13)`.
- Required check previsto: `Quality gate (Node 22.13)`, pendiente de confirmación exacta tras primera ejecución remota del workflow.
- Estado remoto: repositorio y default branch `main` verificados por GitHub; rulesets visibles `[]`; branch protection clásica no verificable con el conector disponible por respuesta `403`, por lo que no se afirma protección activa.
- Política: PR obligatorio, rama actualizada, conversaciones resueltas, force push/borrado de `main` deshabilitados, bypass de administradores evitado salvo emergencia documentada, reviews adaptadas a repo de mantenedor único y preferencia por `squash merge` en PRs pequeños.
- `quality:deps` se mantiene fuera de required checks mientras `EX-001` esté vigente; no se modificaron dependencias.
- Etapa 02.1: auditoría documental SQL/Supabase preparada sin ejecutar SQL remoto ni modificar Supabase.
- Inventario SQL 02.1: 34 scripts `.sql` analizados en `supabase/security/`, `supabase/schema/` y `supabase/docs/`.
- Clasificación 02.1: 12 scripts de lectura/validación sin mutación permanente esperada y 22 scripts con mutaciones reales, propuestas o capacidades mutantes.
- Riesgos 02.1: 1 script CRÍTICO (`repair_02_student_records_duplicate_upsert_keys.sql`, por fusión/eliminación de duplicados), múltiples scripts ALTO por RLS/RPC/grants/schema y reparaciones con impacto en datos académicos.
- Obsoletos/duplicados 02.1: mínimo 6 candidatos (`repair_05_student_portal_career_fallback.sql`, `repair_05_student_portal_classmates.sql`, `repair_05_student_portal_grades_rpc.sql`, `repair_05_portal_connection_read_rpcs.sql`, `repair_05_teacher_student_removal_reset_rpcs.sql`, `repair_07_exam_engine_v21_state.sql`) frente a `schema/07`/`schema/03`; además `schema/05_student_portal_secure_read.sql` queda fuera del orden canónico de `schema/00_README.md` y requiere reconciliación.
- Orden seguro 02.1: diagnostics/verificaciones de solo lectura primero; para base nueva seguir `schema/00_README.md`; reconciliar `05_student_portal_secure_read.sql` y `repair_*`; luego aplicar bajo riesgo por bloques; permisos/RLS con aprobación humana; constraints solo tras resolver datos; staging obligatorio antes de producción.
- Documentación 02.1: `SECURITY_LOW_RISK_APPLY_CHECKLIST.md` reemplazado por el checklist integral de aplicación segura, `SECURITY.md` actualizado con filosofía operativa, `PRODUCTION_READINESS.md` actualizado con estados SQL preparado/staging pendiente/producción pendiente, y README/RUNBOOK/checklists/estructura/auditoría de despliegue alineados para no presentar `setup_multi_tenant/` ni `rls_negative_tests.sql` como flujos ejecutables.
- RLS negative tests 02.1: existe `student_portal_exam_visibility_tests.sql` como prueba focal de visibilidad de mesas del alumno con actores preparados; no existe `supabase/security/rls_negative_tests.sql`, por lo que la matriz negativa integral sigue pendiente.
- Etapa 02.2: hardening de configuración pública frontend sin tocar SQL, Supabase remoto, deploy ni dependencias.
- Variables frontend auditadas 02.2: necesarias `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_DISABLE_AUTH`; compatibilidad legacy local `VITE_SUPABASE_ANON_KEY`; privadas/server-only `SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `ADMIN_USERS_ALLOWED_ORIGINS` y variables de scripts no quedan aprobadas para frontend.
- Guards 02.2: `envGuards.js` bloquea en producción `VITE_DISABLE_AUTH=true`, falta de URL/key pública, URL no HTTPS Supabase y valores públicos que parezcan `service_role`, `sb_secret` o JWT `role=service_role`; los errores reportan nombres, no valores.
- Tests 02.2: agregada cobertura en `envGuards.test.js` y `supabaseClient.test.js` para configuración segura, faltantes de Supabase, URL local en producción, service_role por nombre y valor, sanitización del error y compatibilidad local/dev.
- Documentación 02.2: `.env.example`, `SECURITY.md`, `PRODUCTION_READINESS.md` y `RUNBOOK.md` actualizados para listar solo variables públicas, remediación del guard y alcance de CSP/headers sin modificar `vercel.json` ni `.gitignore`.
- Verificación 02.2: test focal `npm.cmd test -- src/lib/envGuards.test.js src/lib/supabaseClient.test.js` en verde, 2 archivos y 22 tests aprobados.
- Verificación completa 02.2: `npm.cmd run check` en verde con `audit:repo` OK, lint OK, 277 archivos de Vitest y 2212 tests aprobados, build OK y `[production-build-audit] OK` sobre 119 archivos; `git diff --check` código `0` con solo advertencias LF/CRLF.
- Revisión independiente 02.2: CHIEF CODE AUDITOR PASS sin P0/P1/P2/P3; queda advertencia de trazabilidad porque el working tree conserva cambios acumulados de etapas anteriores fuera de la lista propia de 02.2.
- Etapa 02.3: auditoría de creación de usuarios, perfiles, roles y metadata de Auth.
- Hallazgo 02.3: vulnerabilidad confirmada en SQL versionado anterior; `public.handle_new_user()` copiaba `raw_user_meta_data.account_role` a `profiles.account_role`. El riesgo queda reducido localmente porque `supabase/config.toml` tiene signup deshabilitado y el frontend no llama `signUp`, pero la fuente SQL debía endurecerse igual.
- Hardening 02.3 preparado localmente: `handle_new_user()` ya no usa `raw_user_meta_data.account_role`, usa `raw_app_meta_data.account_role` solo como metadata administrativa y cae a `alumno` como rol mínimo; mantiene `SECURITY DEFINER`, `set search_path = ''` y `REVOKE EXECUTE` a `public`, `anon` y `authenticated`.
- SQL relacionado 02.3: actualizados `supabase/schema/01_foundation.sql`, `supabase/security/2026-09-05_low_risk_indexes_search_path_auth_uid.sql` y el bloque comentado de revisión en `supabase/security/2026-09-05_rls_function_permissions_review.sql`. Estado operativo: PREPARADO, NO APLICADO en Supabase remoto.
- Tests 02.3: ampliado `adminUsersEdgeFunctionSecurity.test.js` para bloquear regresiones del trigger, del fallback mínimo y de la asignación legitima por `admin-users`.
- Frontend 02.3: `AuthContext` ya no usa `session.user_metadata.account_role` como fallback; durante la carga remota cae a `alumno` hasta recibir `profiles`.
- Documentación 02.3: actualizados `SECURITY.md`, `PRODUCTION_READINESS.md`, `SECURITY_LOW_RISK_APPLY_CHECKLIST.md`, `RUNBOOK.md`, `supabase/README.md` y `supabase/schema/00_README.md` con flujo de identidad, validación futura de staging y prohibición de usar metadata de cliente como autoridad.
- Etapa 02.4: auditoría transversal local de funciones PostgreSQL/RPC/`SECURITY DEFINER`/`search_path`/`EXECUTE`, sin tocar Supabase remoto.
- Inventario 02.4: 57 definiciones SQL versionadas, 41 funciones únicas, 47 definiciones `SECURITY DEFINER`, 10 invoker/default, 6 triggers internos canónicos y 36 RPC invocadas desde frontend/servicios/Edge Function.
- Hallazgos 02.4: P0/P1 nuevos ninguno confirmado localmente; P2 por hardening incompleto de `search_path` en múltiples `SECURITY DEFINER`; P2/Needs Investigation por 12 RPC invocadas sin definición SQL local auditable; P3 por reparaciones históricas que podrían aplicarse fuera de orden.
- Artefactos 02.4: creado `docs/SECURITY_FUNCTION_MATRIX.md` con matriz de funciones, RPC frontend, cross-tenant, superadmin, `SECURITY DEFINER` y validación futura de staging.
- Tests 02.4: agregado `src/services/supabaseFunctionSecurityMatrix.test.js` para impedir reintroducción de `raw_user_meta_data.account_role`, exigir revokes en triggers internos, documentar RPC sin definición SQL local y mantener revokes en RPC locales invocadas.
- SQL 02.4: no se modificó SQL; cualquier aplicación futura sigue siendo PREPARADO — NO APLICADO hasta staging.
- Etapa 02.5: intento de discovery remoto/read-only para comparar la matriz local contra Supabase real o staging.
- Acceso remoto 02.5: el proyecto tiene configuración local de Supabase CLI y pooler generado, pero `supabase db query --linked` devolvió falta de privilegios (`403`) y el pooler configurado no conectó. Se detuvo antes de consultas de catálogo complejas.
- Artefactos 02.5: creado `docs/SUPABASE_DRIFT_AUDIT.md` con clasificación bloqueada, `docs/STAGING_SECURITY_TEST_MATRIX.md` con pruebas futuras por rol y `supabase/security/remote_readonly_discovery.sql` con consultas exclusivamente `SELECT` para discovery futuro.
- Estado 02.5: no se extrajeron datos personales, no hubo mutaciones remotas, no se aplicó el SQL 02.3 y producción continúa NO-GO hasta resolver evidencia remota.
- Remediación 02.5-R: diagnosticado el bloqueo sin abrir `.env` ni usar service-role. `supabase projects list` y `orgs list` pasan, por lo que la sesión CLI está autenticada; el proyecto local vinculado `Hub-Institucional` (`qwrw…mibx`) no aparece entre los proyectos accesibles para esa sesión. El pooler remoto resuelve y acepta TCP 5432, pero la connection string local no incluye password. Creado `docs/SUPABASE_READONLY_ACCESS.md` con pasos mínimos para habilitar auditoría read-only o ejecutar el script manualmente.
- Reanudación 02.5: acceso CLI recuperado tras autenticación con la cuenta correcta; `Hub-Institucional` aparece `ACTIVE_HEALTHY`, el ref accesible coincide con el link local (`qwrw…mibx`) y el acceso vinculado dejó de devolver `403`.
- Discovery remoto 02.5: ejecutado `remote_readonly_discovery.sql` y consultas separadas equivalentes dentro de `begin; set transaction read only; ... rollback;`, sin SQL mutante, sin RPC de negocio, sin service-role, sin deploy y sin extracción de datos personales.
- Hallazgos remotos 02.5: `handle_new_user()` existe como `SECURITY DEFINER`, conserva `search_path=public, pg_temp`, lee `raw_user_meta_data.account_role` y está conectado al trigger `auth.users` `on_auth_user_created`; por lo tanto la vulnerabilidad 02.3 sigue activa remotamente.
- Drift remoto 02.5: las 12 RPC investigadas no existen en remoto y tampoco tienen definición SQL local auditable; quedan como `LOCAL CALLER / REMOTE ABSENT`, no como `REMOTE AHEAD`.
- Matriz remota 02.5: 37 funciones remotas, 30 `SECURITY DEFINER`, 96 policies, 42 tablas inventariadas para RLS, 0 tablas públicas inventariadas con RLS deshabilitado, bucket privado `workspace-source-files`, 0 `PUBLIC EXECUTE`, y 30 funciones con `EXECUTE` para `anon`/`authenticated`.
- Documentación 02.5: actualizados `SUPABASE_DRIFT_AUDIT.md`, `SECURITY_FUNCTION_MATRIX.md`, `STAGING_SECURITY_TEST_MATRIX.md`, `SECURITY.md`, `PRODUCTION_READINESS.md`, `SECURITY_LOW_RISK_APPLY_CHECKLIST.md`, `RUNBOOK.md`, `WORKLOG.md` y `supabase/README.md`. Resultado operativo: **NO-GO — DRIFT DE SEGURIDAD PENDIENTE**; no continuar con 02.3 ni reparaciones sin staging aislado.

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

### 2026-09-05

- Trabajo principal: Fase 3, previsualizacion relacional de mesas en una ruta independiente para varias instituciones, habilitable desde Superadmin.
- Se reutiliza `app_settings` para la opcion por institucion (publica, sin datos personales; escritura protegida por la RLS de superadmin existente), sin cambios SQL.
- Lectura mediante el constructor relacional existente, paginada y cancelable; estado por usuario/institucion. El preview no monta el contenedor con autoguardado ni permite publicar, oficializar o reiniciar datos remotos.
- Fechas explicitas, diagnostico por alcance y detalle de materias faltantes. Corregida perdida de `docentes[].bloqueos` en el adaptador, con pruebas de titular y vocales; se rechaza el fallback a fechas no disponibles en preview.
- Documentacion de uso y limites: `docs/PREVISUALIZACION_MESAS_RELACIONAL.md`. Verificacion con tests y Playwright en escritorio/mobile con datos ficticios; sin acceso al proyecto remoto ni despliegue en esta sesion.
- Verificacion final: `npm.cmd run check` en verde, 268 archivos y 2120 tests; lint, build y auditorias aprobados. Playwright 1440/390 px completo (habilitar, generar, autocompletar, resultado y reinicio), cero escrituras academicas; corregida tabla comprimida en movil y verificada la captura final. `.gitignore` conserva las dos exclusiones de planillas privadas.
- Revision posterior del prompt de Fase 1: el lector relacional ya estaba implementado, pero el script manual conservaba el modo historico `--admin`. Se removio esa via para que `scripts/examEngineAudit/previewRegularExamPlanFromAcademicSchema.mjs` use solo publishable/anon key, respete RLS y bloquee cualquier variable o valor `service_role`, alineado con el contrato original de solo lectura.
- Auditoria A-J de seguridad Supabase armada como artefactos revisables, sin ejecutar SQL: reporte en `docs/SECURITY_AUDIT_AJ_2026-09-05.md`, diagnosticos read-only y SQL separado en `supabase/security/` para bajo riesgo, RLS/permisos y constraints de revision manual. Se incluyo `teacher_exam_date_exclusions` en la lista auditada.

### 2026-09-08

- Horas reales: pendiente de completar
- Trabajo principal:
  - Etapa 0 de adaptacion DB-UI: creado `docs/db-ui-contract.md` como contrato operativo entre la UI actual y Supabase, con tablas, columnas, RPCs, prioridades P0/P1/P2, inventario manual y criterios de listo por etapa
  - Etapa 1 preparada localmente: `supabase/schema/01_foundation.sql` ahora incluye las RPCs P0 que la UI de superadmin usa para cambiar roles, quitar membresias, bloquear/desbloquear usuarios y quitar acceso de usuarios institucionales
  - guardas de seguridad en RPCs P0: solo superadmin activo puede ejecutarlas; no se puede bloquear/eliminar un superadmin global; no se puede dejar una institucion sin owner/admin activo
  - decision de seguridad: `delete_institution_user` quita acceso del hub eliminando membresias y perfil, pero no borra `auth.users` desde SQL directo
  - actualizado `supabase/schema/00_README.md` para reflejar que el bloque foundation incluye las RPCs base de superadmin
  - verificacion local: `npm.cmd test -- src/services/superAdmin.test.js src/services/institutions.test.js src/services/auth.test.js` en verde, 3 archivos y 9 tests pasados
  - Miguel informo que `01_foundation.sql` ya fue ejecutado en Supabase; agregado `supabase/docs/verify_01_foundation_p0.sql` para verificar RPCs, grants, RLS, perfiles, membresias y auditoria sin modificar datos
  - verificacion remota parcial: Miguel compartio salida de `pg_policies`; aparecen las policies esperadas de foundation para `admin_audit_logs`, `app_settings`, `institutions`, `memberships` y `profiles`, sin policies extra permisivas
  - verificacion remota parcial: Miguel compartio salida de `information_schema.routines`; aparecen las 6 RPCs P0 esperadas (`get_public_app_status`, `list_active_login_institutions`, `update_membership_role`, `remove_user_membership`, `set_user_access_status`, `delete_institution_user`)
  - verificacion remota parcial: Miguel compartio salida de `information_schema.routine_privileges`; las 4 RPCs administrativas tienen `EXECUTE` para `authenticated`, `postgres` y `service_role`, sin grants para `anon` ni `public`
  - smoke test negativo real: al intentar bloquear un usuario que era unico `owner/admin` activo de una institucion, la RPC respondio `INSTITUTION_REQUIRES_ACTIVE_ADMIN`; comportamiento esperado por la guarda de seguridad
  - smoke test UI positivo: Miguel confirmo que los flujos P0 funcionan correctamente; `admin_audit_logs` registra acciones reales `set_user_access_status` y `update_membership_role` ejecutadas por el superadmin
  - **Etapa 1 cerrada:** foundation queda aplicado y verificado en remoto; siguiente bloque recomendado: etapa 2, compatibilidad de `student_records` y `teacher_records`
  - Etapa 2 preparada localmente: `supabase/schema/02_academic_relational_schema.sql` extiende `student_records` y `teacher_records` con columnas esperadas por la UI (`workspace_key`, `profile_id`, `full_name`, `dni`, `login_email`, `career`, `academic_year`, `legajo`, `raw_payload`, `updated_at`), defaults, backfill no destructivo, FKs a `profiles`, claves de upsert y triggers de sincronizacion canonico/UI
  - policies de escritura agregadas para padrones: superadmin u `owner`/`admin`/`editor` institucional pueden insertar/actualizar/borrar; viewers, docentes y alumnos quedan fuera de escritura directa
  - mapper del motor relacional actualizado para leer padrones creados desde la UI (`dni`, `login_email`, `full_name`, `status='activo'`) sin perder compatibilidad con el schema canonico (`national_id`, `email`, `status='active'`)
  - agregado `supabase/docs/verify_02_roster_records_ui_compat.sql` para verificar columnas, constraints, triggers, grants, policies y duplicados sin modificar datos
  - agregado `supabase/docs/verify_02_roster_records_ui_compat_summary.sql` para devolver una sola grilla resumen en Supabase SQL Editor y evitar perder resultados entre pestañas
  - agregado `supabase/docs/repair_02_student_records_duplicate_upsert_keys.sql` para el caso real detectado en remoto: filas duplicadas de `student_records` con la misma clave de upsert UI (`institution_id`, `workspace_key`, `email`, `career`) que impiden crear `student_records_workspace_email_career_key`
  - verificacion remota parcial etapa 2: Miguel confirmo `student_records` sin faltantes en campos UI requeridos; duplicados de `student_records` resueltos; constraint `student_records_workspace_email_career_key` creada en remoto como `UNIQUE (institution_id, workspace_key, email, career)`
  - verificacion remota completa etapa 2: resumen `verify_02_roster_records_ui_compat_summary.sql` en 11/11 OK para columnas, campos requeridos, duplicados, constraints, triggers, RLS policies y grants de `student_records`/`teacher_records`
  - verificacion local etapa 2: tests focales en verde (`rosterRecords`, `studentAccess`, `teacherAccess`, `teacherProfileIdentityService`, `mapAcademicRelationalRowsToSnapshot`, `buildExamEngineSnapshotFromAcademicSchema`), 6 archivos y 36 tests pasados
  - verificacion local etapa 2: `npm.cmd run build` en verde, incluido `audit:prod`; Vite mantiene warnings conocidos de chunks grandes
  - Etapa 3 preparada localmente: `supabase/schema/05_workspace_operational_compat.sql` agrega `workspace_source_files`, bucket privado `workspace-source-files`, helper/policies de Storage, `teacher_availability_records`, `teacher_workload_records`, `legacy_subjects_catalog`, `legacy_subject_prerequisites` y `legacy_exam_sessions`
  - decision etapa 3: `legacy_exam_sessions.exam_date` queda como `text` porque la UI puede mandar timestamps completos desde `buildExams()`; se tipara de forma estricta en la futura tabla canonica de mesas
  - agregado `supabase/docs/verify_03_workspace_operational_compat_summary.sql` para verificar Etapa 3 en una sola grilla: columnas, constraints, triggers, RLS, grants, bucket, policies de Storage y duplicados
  - verificacion local etapa 3: tests focales en verde (`sourceFiles`, `teacherAcademicRecords`, `workspaceSnapshotTeacherAcademicRecords`, `legacySubjectPrerequisites`, `studentPortalData`), 5 archivos y 37 tests pasados
  - verificacion local etapa 3: `npm.cmd run build` en verde, incluido `audit:prod`; Vite mantiene warnings conocidos de chunks grandes
  - verificacion remota completa etapa 3: resumen `verify_03_workspace_operational_compat_summary.sql` en 19/19 OK para columnas, constraints, triggers, campos requeridos, duplicados, RLS policies, grants, bucket privado, policies de Storage, helper `storage_object_institution_id(text)` y tipo `legacy_exam_sessions.exam_date = text`
  - pendiente funcional etapa 2: probar autosave/padrones/accesos desde la UI real
  - pendiente funcional etapa 3: probar carga/descarga de fuentes + sync de disponibilidad/carga docente/legacy al guardar workspace desde la UI real

## Como usar este archivo

- Valor del producto:
  - `horas acumuladas x tarifa objetivo`
- Costo de evolucion:
  - sumar horas reales por bloque funcional
- Precio comercial:
  - no usar solo costo/hora; sumar valor del problema que resuelve, ahorro operativo y riesgo evitado

## Plantilla sugerida para siguientes sesiones

## 2026-10-04 — Security Acceptance 1 en Staging

- Tipo: producto / seguridad Supabase.
- Resultado: 73 checkpoints SQL Auth-trigger/identity/RLS/RPC con fixtures sinteticos A/B pasaron en Staging; ROLLBACK y consulta independiente confirmaron cleanup=0. Sin cambios de schema/grants/RLS ni Production; sin Storage/Edge/frontend. Evidencia y limites (sin Auth HTTP/E2E) en `supabase/baseline/STAGING_SECURITY_1_RESULT.md`.
- Horas reales: no registradas; no se estima tiempo comercial.

- Fecha:
- Horas reales:
- Tipo:
  - producto
  - soporte
  - comercial
- Resultado:

## 2026-10-05 — Gateway Storage exclusivamente local

Implementados Edge source-file-storage, helper canónico único, signed upload/commit/delete/recover y SQL preparado restrictivo para escrituras directas. Ningún deploy, SQL remoto, secrets set ni mutación de Staging/Producción. Suite completa 288 archivos / 2345 tests PASS; PostgreSQL local 25 casos PASS; lint/build/diff-check PASS. CHIEF CODE AUDITOR confirma cero P0/P1 locales y aprueba con advertencias. El implementador bloquea readiness por riesgo residual del clear concurrente: lease Storage no protege escrituras posteriores de snapshot/tablas del cliente frente a takeover. Inventario legacy, plan y evidencia en supabase/security/SOURCE_FILE_STORAGE_GATEWAY_LOCAL.md. P1 histórico Staging no cerrado; Security 2 no retomada. QUALITY GATE: FAIL. STORAGE GATEWAY LOCAL — BLOQUEADO — proteger clear completo antes de enforcement.

## 2026-10-05 — Clear concurrente del workspace: corrección LOCAL

Barrera transaccional institution/workspace compartida por snapshot/tablas/RPC Storage, captura de cutoff_revision y keys, clear lógico atómico y cleanup/resume sobre journal inmutable. Cancelación de uploads anteriores impide finalize tardío; se retiraron writes posteriores del cliente y reset remoto del motor. FKs sin scope/cross-workspace provocan rollback fail-closed. PostgreSQL real 17.10 con dos TCP sesiones: 9 escenarios PASS, cleanup=0; PGlite24 PASS; 129 focales PASS; suite 288 archivos / 2348 tests PASS; lint/build/audit:repo/audit:prod/diff-check PASS. No deploy, secrets set, SQL remoto ni mutaciones Staging/Producción. CHIEF CODE AUDITOR final se interrumpió por límite de uso: no se acredita aprobación final; Browser/E2E real pendiente. Evidencia y residual en supabase/security/SOURCE_FILE_STORAGE_GATEWAY_LOCAL.md. QUALITY GATE: FAIL. STORAGE CLEAR CONCURRENCY — BLOQUEADO — falta auditoría independiente final y revisión real del flujo.

## 2026-10-05 - Storage gateway: cierre local detenido en P1

Auditor independiente en contexto limpio confirmo y reprodujo P1: tras commit DB del clear y fallo de cleanup/respuesta, retry UI/HTTP emite nuevo begin_clear/UUID y recaptura datos posteriores a T0, dejando snapshot vacio y manifestCount=0. Handler real + SQL real PGlite, con fallo Storage inyectado. No fix ni cambios de implementacion; no suite global repetida. Deno 2.9.6 check PASS; Deno HTTP y Browser/E2E reales no ejecutados por stop en P1. Docker local disponible; stack no iniciado, 0 containers/fixtures de cierre y configuracion temporal eliminada. No Staging/Produccion, deploy, SQL remoto ni secrets set. Evidencia reproducible y limites en supabase/security/SOURCE_FILE_STORAGE_GATEWAY_LOCAL.md. QUALITY GATE: FAIL. STORAGE GATEWAY LOCAL CLOSURE - BLOQUEADO - retry clear destruye datos post-T0.

## 2026-10-05 - Storage clear HTTP/UI idempotente LOCAL

P1 corregido: operation_id persistido antes de HTTP en sessionStorage por tenant/workspace/actor; retries y remount conservan ID, nuevo clear tras exito usa otro. SQL scoped journal replay exacto, cutoff/targets fijos; terminal sin otro remove/finish. 135 focales PASS; suite global 289 archivos / 2354 tests PASS; Deno check/lint/build/audit:prod/audit:repo/diff-check PASS; 13 escenarios PG real + HTTP PASS incluyendo DB commit/fallo cleanup, B posterior, dos retries simultaneos, partial/terminal/nuevo/A-B; cleanup0. Auditor independiente focal cierra P1 con Code Review/Security local/Adversarial PASS y reproduce 135 focales/24 PG mas6adversariales. P2 import @2 y guard UI hasData tras reload vacio documentados; writer conflicts y Browser/Deno HTTP/Storage real pendientes fuera microtarea. No remoto/deploy/SQL Staging/Prod ni secretos. QUALITY GATE: PASS WITH WARNINGS. STORAGE CLEAR IDEMPOTENCY - PASS - LISTO PARA CIERRE LOCAL. Evidencia completa: supabase/security/SOURCE_FILE_STORAGE_GATEWAY_LOCAL.md.

## 2026-10-05 — Security Acceptance 2 admin-users (Staging)

Matriz HTTP/Auth Admin real detenida en P1: admin A puede resetear Auth de alumno exclusivo B reutilizando su email en bulk_create_students con institution_id A. Creacion/login legitimos, JWT/roles/CORS y ramas superadmin probadas PASS antes del hallazgo; 17 checks PASS, dos registros del mismo P1 FAIL. Cleanup SQL final0 de usuarios/fixtures/objetos. Sin codigo/schema/RLS/grants/deploy/config ni Produccion. Resultado y evidencia en supabase/baseline/STAGING_SECURITY_2_RESULT.md y STAGING_ADMIN_USERS_SECURITY_2_EVIDENCE.json. QUALITY GATE: FAIL.

## 2026-10-06 - admin-users identidad de alumno LOCAL

P1 bulk_create_students corregido localmente: lookup Auth canonico completo, vinculacion inequívoca al tenant y reuse readonly; email ajeno/ambiguo 409 sin mutacion, nuevo crea sin fallback reset. set_user_password mantiene SuperAdmin y valida target membership cuando se proporciona tenant; scope evita fallback destructivo legado. 39 focales PASS, Deno check PASS, lint focal/audit:repo/diff-check PASS. Suite global final 2374 PASS/1 FAIL (appThemeStyles ajeno); lint/build FAIL en Primaria preexistente. CHIEF CODE AUDITOR independiente focal PASS; P1 preexistente reset global destructivo, P2 provisioning parcial y NI password anidado inventariados sin ampliar alcance. Cleanup fixtures memoria0; no Auth/DB reales ni remoto/deploy/SQL/config Staging/Produccion. Evidencia reproducible: supabase/security/ADMIN_USERS_STUDENT_IDENTITY_LOCAL.md. QUALITY GATE: FAIL. ADMIN-USERS CROSS-TENANT IDENTITY - BLOQUEADO - gates globales y P1 preexistente impiden promocion.

## 2026-10-06 - identidad Auth/DB/HTTP REAL LOCAL

Artefacto auditado intacto ejecutado con Deno2.9.6, GoTrue v2.196.0, PostgREST v16.1 y PostgreSQL17.6 reales en DB aislada schema-only. Takeover/case/whitespace409; B password original login200 y propuesta400; reuse readonly200 mismo UUID; nuevo create/login200; sin link/ambiguo409; reset SuperAdmin scope same-tenant200/cross-tenant403; admin institucional reset403 contractual. Cleanup SQL0 usuarios/identities/sessions/refresh_tokens/perfiles/memberships/legajos/tenants/audit/Storage; DB/contenedores/env temporales eliminados. Solo evidencia/documentacion, sin cambios runtime/baseline ni remoto. Reporte, JSON sanitizado y harness reproducible en supabase/security/ADMIN_USERS_STUDENT_IDENTITY_LOCAL.md, ADMIN_USERS_IDENTITY_REAL_EVIDENCE.json y ADMIN_USERS_IDENTITY_REAL_HARNESS.md. Blockers globales anteriores siguen abiertos y QUALITY GATE: FAIL global sin rerun. ADMIN-USERS IDENTITY REAL - PASS - P1 CERRADO localmente, sin acreditar cierre remoto ni release global.

## 2026-10-13 - GoTrue harness LOCAL

Harness reusable scripts/validateGoTrueLocalHarness.mjs y 5 tests focales: rol supabase_auth_admin, credencial estandar del CLI en memoria/stdin/env sin exponer ni resetear. DB descartable schema-only, historial Auth77/77 completo y nueve SQL canonicos reaplicados; GoTruev2.196.0 healthy5 muestrasHTTP200, GET admin/users readonly vacio, 8 entradas pg_stat_statements acreditan rol/base; sin42501/28P01 y owners/ACL intactos. Cleanup comprobado0DB/0contenedores/0temporales sensibles. Suite2381/291, lint, build/audit:prod, audit:repo y sintaxis/diff-check PASS. CHIEF CODE AUDITOR corrige3P2 y cierra CodeReview/Adversarial PASS; sin hallazgos introducidos abiertos. Dependencias24 vulnerabilidades(13high/10moderate/1low): QUALITY GATE: FAIL global. Sin fixtures/DR completo, secretos persistidos, remoto/deploy/commit/push. Staging/Production=NONE. Evidencia: supabase/security/GOTRUE_LOCAL_HARNESS_RESULT.md. Limites: kill abrupto/creacion parcial no ensayados, ACL solo roles estandar. GOTRUE HARNESS FIX - PASS LOCAL, sin acreditar release.

## 2026-10-13 - Triage dependencias

Inventario npm audit24(13high/10moderate/1low) y rutas npm ls revisados sin actualizar paquetes. Matriz y fuentes primarias completas: docs/DEPENDENCY_TRIAGE_2026-10-13.md. Unidades focales por dependencia, minimo patch Vite8.0.16 primero por Windows, luego router/realtime/documentos/tooling; prohibidos saltos/downgrades automaticos y npm audit fix --force. Triage PASS; QUALITY GATE: FAIL global. Sin remoto/deploy/commit/push.

## 2026-10-13 - Parche focal Vite

Vite8.0.9->8.0.16 exacto y25 dependencias requeridas lock auditadas; UNC/alternate-path Windows corregidos segun changelog oficial. Suite2381/291, lint, audit:repo, build/audit:prod y smokeHTTP index/JSX PASS; auditor independiente CodeReview/Adversarial PASS. Audit13high->9high (24->20totales), Vite/PostCSS/nanoid/source-map-js fuera de advisories. DLL antigua bloqueada EPERM reportada sin matar procesos ajenos. Evidencia docs/VITE_SECURITY_PATCH_2026-10-13.md. QUALITY GATE: FAIL global por9high restantes. Sin remoto/deploy/commit/push.

## 2026-10-13 - Parche focal ws

Unico delta ws8.20.0->8.22.0 lock, parent Supabase2.104.0/rango^8.18.2 intactos. Suite2381/291, lint/audit:repo/build/audit:prod PASS; smokeWebSocket real loopback echo fragmentado y limite maxFragments rechaza exceso PASS, cleanup sockets propios; auditor CodeReview/Adversarial PASS. Audit9high->8high(20->19total), ws fuera de advisories. Evidencia docs/WS_SECURITY_PATCH_2026-10-13.md; Realtime remoto no probado. QUALITY GATE: FAIL global. Sin Staging/Production/deploy/commit/push. Cuatro unidades cerradas del sprint (GoTrue,triage,Vite,ws); siguiente router preparado en Trello segun maximo diario del tablero.

## 2026-10-13 - Parche React Router

react-router-dom/react-router7.14.1->7.18.4, unico delta2packages. Focales18/5 y suite2381/291, lint/build/auditsCode PASS; CHIEF CODE AUDITOR CodeReview/Adversarial PASS. BrowserREAL6redirecciones/loginmobiledesktop sinerrores ni requests externos, contexto aislado/backenddesconfigurado; cleanup navegador/servidor propios. Audit8high->6high(19->17total), Router fuera advisories. Evidencia docs/ROUTER_SECURITY_PATCH_2026-10-13.md. QUALITY GATE: FAIL global; sin Auth real/SQL/remoto/deploy/commit/push.

## 2026-10-13 - Parche tmp/ExcelJS

Unico delta tmp0.2.5->0.2.7 compatible conExcelJS4.4.0 intacto. Suite2381/291 incl import/export, lint/build/audits y CodeReview/Adversarial PASS. SmokeREAL temporal/XLSXroundtrip sintetico y cleanup0 PASS. Audit6high->5high(17->16total). Evidencia docs/TMP_SECURITY_PATCH_2026-10-13.md, fuentes ambos fixes traversal/typeconfusion. QUALITY GATE: FAIL global, sin remoto/deploy/DR/commit/push.

## 2026-10-13 - Parche undici/jsdom

Unico delta undici7.25.0->7.30.0, jsdom29.1.0 y rango^7.25.0 intactos. Suite2381/291 DOM, lint/build/audits y CodeReview/Adversarial PASS; smokeHTTPPool REAL3requests chunkedJSON y cleanupconexiones PASS. Audit5high->4high(16->15total), undici fueradeadvisories; no actualiza Undici built-inNode. Evidencia docs/UNDICI_SECURITY_PATCH_2026-10-13.md. QUALITY GATE: FAIL global, sinremoto/deploy/DR/commit/push.

## 2026-10-13 - Parche XML/Mammoth

Unico delta xmldom0.8.13->0.8.15 compatibleMammoth1.12.0/^0.8.6 intacto, sin override/0.9. Suite2381/291, lint/build/audits y CodeReview/Adversarial PASS. SmokeREAL XMLnamespace/entidades/invalidname y DOCXsynthetic texto/HTML PASS enmemoria. Audit4high->3high(15->14total), XML fueraadvisories; restantes brace-expansion/browserslist/js-yaml. Evidencia docs/XML_SECURITY_PATCH_2026-10-13.md; malformedXML ahora rechaza error como seguridad, corpusreal no probado. QUALITY GATE: FAIL global. Sin remoto/deploy/DR/commit/push. Lote continuado Router/tmp/undici/XML cerrado.

## 2026-10-13 - Parche brace-expansion

Dos ramas1.1.14->1.1.21/2.1.0->2.1.7 compatibles y padres intactos. Suite2381/291, lint/build/audits y CodeReview/Adversarial PASS; smoke ambas ramas range/padding/nesting y entrada acotada PASS. Audit3high->2high(14->13total); evidencia docs/BRACE_SECURITY_PATCH_2026-10-13.md. QUALITY GATE: FAIL global. Sin remoto/deploy/DR/commit/push.

## 2026-10-13 - Parche Browserslist

Browserslist4.28.2->4.29.3 y5transitivos requeridos, padres/manifest intactos. Suite2381/291, lint/build/audits y CodeReview/Adversarial PASS; smoke targets/queryinvalida y resolucionBabel PASS. Datasets dinamicos pueden cambiar targets; Node24.12 satisfaceNode>=18 nuevo. Audit2high->1high(13->11total;moderate10->9). Evidencia docs/BROWSERSLIST_SECURITY_PATCH_2026-10-13.md. QUALITY GATE: FAIL global, pendientejs-yaml. Sin remoto/deploy/DR/commit/push.

## 2026-10-13 - Parche js-yaml y cierre dependencias high

Unico delta js-yaml4.1.1->4.3.2 compatible ESLint intacto, sin salto5. Suite2381/291, lint/build/audits y quality:full(exit0) PASS; CodeReview/Adversarial PASS. SmokeYAML load/dump/rechazos/prototipo y budgetmergesvacios PASS. Audit inicial13high->0high/0critical; quedan9moderate/1low inventariados sin aceptacion automatica. Evidencia docs/YAML_SECURITY_PATCH_2026-10-13.md. Calidadtecnica localverde; QUALITY GATE: FAIL global/release por P1DR/rollback/config pendientes. Sin remoto/deploy/DR/fixtures/commit/push.

## 2026-10-13 — Ensayo local DB/Auth real
Run78638876b4d4cadc PASS:2tenants/4AuthAPIusers, backup350ms/restore699ms,recuperacion hasta login23737ms. Filas/UUID/FK/identities/secuencias/catalogo77 migraciones preservados; login4/4 y aislamiento A/B PASS; cleanup0. quality:full2383tests/292files,lint/build/auditsPASS,0high/critical. CHIEF PASS, ambosP2 corregidos. Ver supabase/security/LOCAL_DB_AUTH_RECOVERY_RESULT.md. Staging/Production NONE. Gateglobal FAIL por DRStorage/config/rollback/aceptacion pendientes.

## 2026-10-13 — Storage API real local
Run c44560792d15e420 PASS: rol estándarTCP,Storage1.70.7 healthy5samples,8192bytes APIroundtripSHA256,deleteAPI/metadata0,history63preservado+2migraciones=65estables,ACL/RLSexistingunchanged. Cleanup0DB/container/volume/files. CHIEFCode/AdversarialPASS,0nuevos hallazgos. quality:full2385tests/293files/lint/build/auditsPASS,0high/critical;lint+2focalesfinalesPASS. Ver STORAGE_LOCAL_HARNESS_RESULT.md yEVIDENCE.json. BackuprestoreStorage aún pendiente. ReleaseglobalFAIL. Staging/ProductionNONE.

## 2026-10-13 — Recuperación Storage real
Run6b229d52bd78edbc PASS: DBcustom+tarfilebackend reales;2DB/2volumesvacíos;2descargas8192/16384bytesSHA256 exactas,metadata/catalogo/history65iguales antes/despuesAPI. Backup3415ms,restore13370ms,recuperacion39854ms,RPO0snapshotfreeze. Primerintento fallópuertorestartDocker,corregido,sincierrePASSfalso;cleanup0ambos. MododefaultregresiónPASS. qualityfull2389tests/294files/lint/build114/auditsPASS,0highcritical;6focaleslintfinalPASS. CHIEFCode/AdversarialPASS. Archivos ylimites en STORAGE_RECOVERY_RESULT.md. Staging/ProductionNONE. ReleaseglobalFAIL:config/secrets/rollback/aceptacionpendientes.

## 2026-10-13 — Configuración local reconstruida
Contrato+builderversion/host/db/rolefailclosed;5negativos/positivos y2394tests/295filesqualityfullPASS,lint/build/audits0highcritical. Authreal0b481d62f391d4c1PASS,StoragerecoveryrealPASS,cleanup0. Dockerdesapagadoinicio,recuperadosoloCLIlocal;primerpreflight noPASS. CHIEFCode/AdversarialPASS. Edge/frontendyexternosinventariadosnofuncionalmenteensayados;remotoNONE. Ver LOCAL_CONFIGURATION_CONTRACT.md y LOCAL_CONFIGURATION_RECOVERY_RESULT.md. Siguiente rollbacklocal. ReleaseglobalFAIL.

## 2026-10-14 — Rollback local DB y archivos
Run f4bb51fb6f3abaf6 PASS: mutación API divergente observada, recreación únicamente DBdest propia owner/marker exactos, restore custom+tar volumen nuevo vacío,5health/2downloadSHA256/metadata/catalogo/history65iguales;rollback14646ms. Default/recovery regresiones secuencialesPASS ycleanup0fixtures/archives,bufferssobrescritos. --clean2intentosfallidos no certificados. Docker sockets runtime inaccesibles recuperados preservando5directorios diagnósticos externos;sinreset/config/datachanges. Bases2intentos interrumpidos verified0. qualityfull2398/296lint/build/auditsPASS0highcritical;CHIEFCode/AdversarialPASS. Ver STORAGE_ROLLBACK_RESULT.md yEVIDENCE.json. ReleaseglobalFAIL,remoto/deployNONE. Continúa integración snapshotDB/Auth/Storage to6OoXZC.

## 2026-10-15 — Recuperación integrada local DB/Auth/Storage
Run c3ba4b53c4cb1636 PASS: cuatro usuarios/dos tenants, snapshot congelado con ambos writers detenidos, filas completas Auth/public/Storage restauradas, cuatro logins/dos descargas SHA256 exactas, catálogo/ACL e historiales77/65 conservados; RLS SQL A/B cuatro cuentas sin acceso ajeno. 92864ms recuperación completa. quality:full2401tests/297files lint/build/auditsPASS 0highcritical,9moderate1low; trabajadores2 sin cambiar tests/timeouts. CHIEF Code/AdversarialPASS. Regresiones default/recovery/rollback secuencialesPASS cleanup0. Docker socket runtime recuperado preservando dos directorios adicionales (siete totales), sin reset/datos/config. Ver INTEGRATED_LOCAL_RECOVERY_RESULT.md y EVIDENCE.json. Release globalFAIL: Data API/Edge/frontend/externos pendientes. Staging/Production/deploy/commit/pushNONE.


## 2026-10-15 — Data API real del destino recuperado
Run5916bdf0f6eaadb9 PASS: PostgREST16.1/authenticatorTCP estándar,cuatro tokens reales GoTrue,own1/foreign0/memberships0/PATCHforeign0,invalidJWT401,GETanoninstitutions0,health5,fullrows/catalogoiguales ycleanup0. Detectada omisión DEFAULT_GROUP_NAME/AUD en builderAuth; fijados authenticated y comprobado role/sub, sinSQL/grants. Tres intentosfallidos preservados (401/22023),todoscleanup0. qualityfull exit0,2403tests/298files lint/build114/auditsPASS0highcritical,9moderate1low inventariadas;CHIEFCode/AdversarialPASS. Regresiones GoTrue e integradaPASS/cleanup0. Ver DATA_API_RECOVERY_RESULT.md y EVIDENCE.json. SinStaging/Production/deploy/commit/push. ReleaseglobalFAIL: navegador/Edge/externos pendientes.


## 2026-10-16 — Frontend real contra el backend recuperado
Run 6ddb5a97f8151217 PASS: navegador real (Vite local + proxy loopback auth/rest/storage, solo clave anon, sin VITE_DISABLE_AUTH ni sesiones precargadas) con cuatro cuentas sintéticas/dos instituciones: rechazo de institución ajena, portal propio, logout y ruta protegida tras logout; requests externos 0, errores de página/servidor 0; recuperación integrada y Data API PASS; cleanup 0. Primer intento 1c2044403fb927db BLOQUEADO por 404 de Edge `admin-users` (fallback de diseño al RPC de padrón docente); por decisión del usuario el harness registra solo ese 404 de endpoints Edge conocidos como fuera de alcance (`edgeCertified:false`) y sigue fallando ante cualquier otro error. Sin cambios a la app. Se corrigió además `examTablesCanonicalSchema.test.js` (rutas Windows hardcodeadas rompían Linux/CI). Ensayo en sesión cloud Linux: stack fuente recreado con Supabase CLI 2.121.0 e imágenes fijadas; canal Playwright `chrome` sobre Chromium 141. Ver FRONTEND_RECOVERY_RESULT.md y EVIDENCE.json. Release global FAIL: Edge, aceptación integral y externos pendientes. Staging/Production/SQL remoto/deploy NONE.

## 2026-10-16 — Edge admin-users sobre el backend recuperado
Run 638e7917e69d960c PASS: Edge Runtime v1.77.4 con `admin-users` empaquetada sin red (supabase-js 2.104.0 del lockfile en lugar de esm.sh; cualquier otra importación remota aborta) y gateway nginx mínimo hacia auth/rest/storage restaurados; claves anon/service_role efímeras solo por entorno y origen permitido = Vite loopback. Navegador: 4 cuentas PASS y padrón docente vía Edge 200 sin fallback. Autorización con sesiones reales: padrón propio 200 / ajeno 403, update de perfil ajeno 403, alumno 403, JWT inválido y sin Authorization 401, origen ajeno 403, sesión revocada por logout global 401; mutación propia de teléfono 200 sin tocar el tenant ajeno, tablas alteradas dentro del allowlist; auditoría solo de docentes sintéticos. Primer intento e5eb291c5180c046 BLOQUEADO por usar tokens revocados por el logout (comportamiento correcto), ahora con sesiones nuevas y control explícito del token revocado. Regresión sin Edge PASS. quality:full 2416 tests/300 archivos PASS, 0 high/critical. Cleanup 0. Ver EDGE_RECOVERY_RESULT.md y EVIDENCE.json. Release global FAIL: aceptación integral y configuración externa pendientes. Staging/Production/SQL remoto/deploy NONE.

## 2026-10-16 — 03.1 Identidad: altas reales con metadata manipulada
Run 2e1054471a740485 PASS: GoTrue v2.196.0 real sobre baseline canónico, signup público abierto solo en el ensayo. Signup y Admin API con account_role/is_global_admin manipulados en user_metadata quedan `alumno` sin privilegios ni membresías; edición propia de user_metadata sin efecto en profiles y app_metadata propia rechazada con 403; EXECUTE de handle_new_user revocado para public/anon/authenticated. Hallazgo: en esta versión el trigger no ve el app_metadata de la creación, por lo que el rol legítimo lo escribe `admin-users` (ya era el diseño documentado). Primeros intentos BLOQUEADOS por expectativas propias del ensayo (rol vía trigger, 403 no previsto), sin hallazgos de seguridad. quality:full 2421 tests/301 archivos PASS, 0 high/critical. Cleanup 0. SECURITY.md actualizado. Ver IDENTITY_AUTH_LOCAL_RESULT.md. Staging/Production/SQL remoto/deploy NONE.
