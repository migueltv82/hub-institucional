# STAGING SECURITY 2 — BLOQUEADO — 2026-10-04

## Estado posterior acreditado

El fix de identidad fue posteriormente promovido: Staging `admin-users` está ACTIVE v3, con matriz funcional PASS y Auth HTTP smoke PASS. El estado vulnerable v2 y la corrección solo local conservados en este informe son HISTÓRICOS PRE-v3, no el estado vigente de ese flujo.

Se preservan los fallos originales, los casos detenidos/no ejecutados y sus límites. La promoción y validación de v3 no convierten automáticamente toda Security Acceptance 2 histórica en PASS ni cierran los riesgos ajenos a ese alcance. Esta actualización documental no representa una nueva ejecución remota ni valida Production.

## Target

Target confirmado por API: `Hub-Institucional-Staging`, ref `lzjpycejdjpzkdyzaeco`, estado `ACTIVE_HEALTHY`. Producción no fue consultada ni modificada.

## Primer bloqueo P1

La consulta de catálogo `supabase_list_edge_functions(project_id='lzjpycejdjpzkdyzaeco')` devolvió `functions: []`. Por lo tanto, `admin-users` no está desplegada en Staging y no puede validarse ningún caso permitido/denegado del endpoint. La regla de la tarea exige detenerse ante el primer P0/P1; no se intentó deploy, no se cambió configuración y no se crearon fixtures Auth.

P1: `admin-users` ausente en el target Staging. Requiere una microtarea explícita de despliegue/configuración antes de repetir Security Acceptance 2.

## Storage — metadata READ-ONLY

Consulta ejecutada dentro de `BEGIN READ ONLY`/`COMMIT`:

```sql
SELECT bucket, policies, objects
FROM metadata de storage para workspace-source-files;
```

Resultado: bucket `workspace-source-files` presente y `public=false`; cuatro policies `authenticated` (SELECT/INSERT/UPDATE/DELETE) con `storage_object_institution_id(name)` y membresía por tenant; `storage.objects` = 0.

No se ejecutaron upload/read/delete/list contra Storage porque el P1 de Edge obliga a detener la fase antes de crear fixtures. La metadata no sustituye los casos funcionales solicitados.

## Fixtures y mutaciones

- Fixtures sintéticos creados: 0.
- Cleanup: 0 objetos/usuarios creados por esta fase.
- Schema/grants/RLS modificados: NO.
- Storage mutado: NO.
- Edge Functions desplegadas: NO.
- Producción: `NONE`.
- Remote mutations de esta tarea: `NONE`.

## Gates

P0: 0 confirmado. P1: 1 abierto (Edge `admin-users` ausente). Storage funcional: NO EJECUTADO por stop-on-first-P1. Auth HTTP/GoTrue/frontend: no aplica todavía.

STAGING SECURITY 2 — BLOQUEADO — `admin-users` no está desplegada en Hub-Institucional-Staging (`lzjpycejdjpzkdyzaeco`).

## Reintento 2026-10-04

Se reconfirmó el target por API (`ACTIVE_HEALTHY`) y se volvió a consultar el catálogo de Edge Functions. El resultado continúa `functions: []`; el P1 sigue abierto. No se ejecutaron fixtures, Storage funcional ni mutaciones adicionales.

## Despliegue autorizado — 2026-10-04

Target reconfirmado: `Hub-Institucional-Staging`, ref `lzjpycejdjpzkdyzaeco`, distinto de Production. Se leyó `supabase/functions/admin-users/index.ts`, `supabase/config/config.toml` y `supabase/docs/deploy_admin_users.md`. La versión canónica exige `Authorization: Bearer`, valida sesión/tenant en código y usa `verify_jwt=false` para permitir preflight CORS; no se refactorizó.

Se desplegó únicamente `admin-users` desde el archivo local aprobado. Resultado del deploy: `ACTIVE`, versión 2, `verify_jwt=false`, hash `53cbf123167a40e15264294d5c96c5a9e0caeb3687c97a574e8911d7cbcc82be`. El catálogo posterior lista exactamente esa función y ninguna otra.

Secretos: no se leyeron ni mostraron valores. No se configuró ningún secreto inventado o productivo. La función requiere `SUPABASE_SERVICE_ROLE_KEY`/alias de service role además de variables Supabase provistas por plataforma; la verificación funcional de requests autorizados queda pendiente de configurar un secreto de Staging por una microtarea explícita y segura. No se crearon usuarios/fixtures.

Schema/RLS/grants: sin cambios. Storage: sin mutaciones. Production mutations: `NONE`. Staging mutation: solo el deploy de `admin-users`.

## Verificación de env estándar — bloqueada

Se intentó POST con Bearer sintético largo y acción soportada. La respuesta fue `403 Origen no permitido para admin-users` desde el contexto de navegador; el guard CORS se ejecuta antes de `getAuthenticatedContext`, por lo que no permite concluir `401` por JWT inválido ni distinguir ausencia de env. No se forzaron headers Origin, no se leyeron valores, no se usó service-role y no se modificó configuración. Requiere repetir desde un origen Staging permitido o un cliente HTTP autorizado en una microtarea posterior.

## Repetición server-to-server de env — 2026-10-04

POST directo desde Node, sin header `Origin`, con Bearer sintético largo y acción soportada respondió HTTP `401` (`Sesion invalida. Inicia sesion nuevamente.`). No apareció el bloqueo `500` por `Faltan SUPABASE_URL, SUPABASE_ANON_KEY o SERVICE_ROLE_KEY.`; no se crearon usuarios ni fixtures.

Se intentó consulta READ-ONLY de logs filtrada por el mensaje exacto de env faltantes. El backend de observabilidad respondió `Backend error!`; el conteo queda no determinable, sin exponer valores ni reintentar en bucle. La evidencia funcional es el `401` server-to-server.

Resultado: env estándar disponibles para atravesar la inicialización y llegar al guard JWT. Security 2 funcional (Storage y casos autorizados de Edge) continúa pendiente.

## Reanudación funcional — 2026-10-04 — BLOQUEADO

Target confirmado por API: Hub-Institucional-Staging, ref `lzjpycejdjpzkdyzaeco`, ACTIVE_HEALTHY. `admin-users`: ACTIVE, versión 2. Conteos iniciales: 0 usuarios, instituciones y objetos. Production mutations: NONE; no se consultó producción.

Pruebas HTTP server-to-server sin Origin mediante Node/Supabase JS. Credenciales y JWT sintéticos en memoria, sin registrarlos. Se creó una cuenta Auth sintética por SQL con identidad email/hash bcrypt y se obtuvo sesión HTTP solo para esta matriz. Se crearon dos instituciones sintéticas y una membership admin en A. Sin cambios de schema, RLS, grants, código o configuración.

| Caso | Resultado |
| --- | --- |
| Bucket privado | PASS: public=false |
| Edge sin JWT / JWT inválido | PASS: 401 / 401 |
| Edge usuario sin permiso | PASS: 403 antes de asignar membership |
| Storage upload/read legítimos | PASS |
| Storage anon read/list/upload | PASS: 404 sin contenido / sin objetos visibles / 403 RLS |
| Storage cross-tenant upload | PASS: 403 RLS |
| Storage path traversal upload | FAIL — P1: aceptado |

Primer P1: `upload('a1200000-0000-4000-8000-000000000001/security2/../traversal.csv')` devolvió éxito. SQL confirmó persistencia como `a1200000-0000-4000-8000-000000000001/traversal.csv`. Se permitió salir del subdirectorio mediante `..`, incumpliendo la denegación explícita requerida. `storage_object_institution_id` solo valida el primer segmento UUID. No se demostró acceso a otro tenant mediante traversal.

Matriz detenida inmediatamente. Pendientes: restantes lecturas/deletes cross-tenant y objeto ajeno, paths adicionales, acción legítima del admin en Edge y administrar usuario de otro tenant. No se declara PASS para estos casos.

Cleanup: DELETE legítimo PASS. Primer remove eliminó el objeto legítimo; SQL detectó traversal normalizado restante y se eliminó por su nombre canónico mediante Storage API. Se borraron únicamente fixtures identificados por UUID y email/slug. Verificación SQL final independiente: **0 storage.objects, auth.users, auth.identities, auth.sessions, auth.refresh_tokens, institutions, profiles, memberships y admin_audit_logs**. Sesión Node cerrada.

P0: 0 confirmado. P1: 1 abierto. Sin correcciones. Sin cambios de código; lint/build/frontend no aplican a esta ejecución. Security Acceptance 2: FAIL.

STAGING SECURITY 2 — BLOQUEADO — P1: Storage acepta path traversal con `..`; requiere nueva decisión antes de corregir y repetir la matriz.

## Corrección focal de Storage — 2026-10-04 — BLOQUEADO

Security 2 no se retomó. Solo se trabajó en el P1 de paths. Production mutations: **NONE**; producción no fue consultada. Target reconfirmado por API como Hub-Institucional-Staging, `lzjpycejdjpzkdyzaeco`, ACTIVE_HEALTHY.

### Implementación local

La key se construye como `tenant UUID / usuario autenticado UUID / workspace ID / dataset ID / objeto UUID aleatorio`, sin nombre de archivo ni ruta relativa recibida. El helper decodifica primero, rechaza aliases codificados, NFKC no canónico, whitespace, segmentos vacíos, puntos, slash y backslash. Lecturas, reemplazos y borrados validan bucket y prefijo exacto antes de requests Storage. El borrado de workspace valida el lote antes de borrar. Upload no hace upsert.

Se agregó una policy **RESTRICTIVE FOR ALL TO authenticated** que exige estructura canónica completa y segundo segmento igual a `auth.uid()`. Intersecta las policies tenant/rol existentes, incluso el branch superadmin, sin ampliar grants. SQL canónico actualizado y parche focal separado. Solo este parche se aplicó en staging mediante `storage_source_files_canonical_actor_paths`, después de 70 focales verdes, lint y diff-check. No se aplicó el archivo de schema completo.

### Verificación local

- Focales finales: **71 PASS / 6 archivos**, incluyendo trailing newline después de UUID válido.
- Suite completa: **2298 PASS / 285 archivos**; ejecución anterior a agregar únicamente el último test de newline, que luego pasó en la corrida focal final.
- Lint final: PASS. Build y audit:prod: PASS. Diff-check: PASS.
- Typecheck: NO DISPONIBLE (JS/JSX). PostgreSQL local: no disponible; Docker daemon no estaba activo. Localmente se probó gramática del SQL y paridad de rechazo, no ejecución real de RLS.
- Build mantiene warning de chunk mayor a 500 kB. Una llamada auth.getUser por operación/lote; no se declara mejora de rendimiento ni se midió latencia.

### Verificación focal HTTP en staging

Dos cuentas sintéticas con identidades Auth y sesiones HTTP; dos instituciones, admin A y editor B en tenant A, admin B en tenant B. No se invocó admin-users ni otros casos de Security 2.

| Caso | Resultado |
| --- | --- |
| Exploit original `tenant/security2/../traversal.csv` | PASS: 403 |
| `../`, `a/../`, `..%2F`, `%2e%2e`, `%2E%2E`, `..%2f`, backslash, `%5c`, `%5C`, doble encoding, vacío, punto y doble slash en key no canónica | PASS: 400/403 |
| Upload/read legítimos de A y B | PASS |
| Upload cross-tenant por A | PASS: 403 |
| Read objeto de B desde A, mismo tenant | PASS: 404 |
| Delete objeto de B desde A | PASS: 0 objetos eliminados; lectura posterior de B confirma supervivencia |
| Delete legítimo/cleanup por propietario | PASS: A eliminó 2 objetos, B eliminó 1 |
| Escape entre recursos con destino canónico | **FAIL — P1 persistente** |

**Evidencia adversarial decisiva:** upload directo de `a1300000-0000-4000-8000-000000000001/a2300000-0000-4000-8000-000000000001/main/horarios/../docentes/abff9d49-e504-4e5e-86da-175d4f64dbd4` fue aceptado. `storage.objects` confirmó el destino `.../main/docentes/abff9d49-e504-4e5e-86da-175d4f64dbd4`. HTTP normalizó la ruta antes de RLS: el destino cumple estructura/actor pero abandona el prefijo de recurso solicitado. No se demostró escape cross-tenant ni a otro usuario. El helper lo rechaza; un cliente que lo evita todavía puede hacerlo. Matriz detenida inmediatamente en este P1.

Una policy SQL que recibe solo el nombre ya normalizado no puede reconstruir los segmentos originales descartados. Para cumplir la denegación literal de solicitudes traversal y evitar keys arbitrarias de clientes directos, se necesita un límite HTTP controlado que reciba IDs, construya la key y no acepte rutas, junto con restricción de escrituras directas al bucket. Ese cambio de endpoint/permisos supera la microtarea autorizada de servicio/helper y policies mínimas; no se implementó ni desplegó.

### Cleanup y dictamen

Verificación SQL final independiente: **0 objetos, usuarios, identidades, sesiones, refresh_tokens, instituciones, perfiles, memberships, admin_audit_logs y workspace_source_files**. REPL Node cerrado y credenciales sintéticas descartadas. La policy restrictiva permanece aplicada en staging como mitigación parcial; el P1 no se declara cerrado.

CHIEF CODE AUDITOR independiente: P1 persistente por normalización; **Needs Investigation** para futura compatibilidad con paths legacy y metadata null/base64, que ahora falla cerrado. Staging vacío no tiene datos legacy afectados. P0/P2/P3 nuevos: ninguno confirmado. Code Review y Adversarial Review: FAIL para cierre completo.

Archivos de código/SQL/tests modificados en esta microtarea: `src/services/sourceFiles.js`, `src/services/workspaceSnapshot.js`, `src/services/sourceFileStoragePath.js`, `src/services/sourceFileStoragePath.test.js`, `src/services/sourceFilesStorageSecurity.test.js`, `supabase/schema/05_workspace_operational_compat.sql`, `supabase/security/storage_source_files_canonical_paths.sql`. Documentación: este resultado y `docs/WORKLOG.md`. Cambios preexistentes ajenos no fueron revertidos.

Typecheck: NO DISPONIBLE. Lint: PASS. Tests: PASS locales / FAIL focal adversarial HTTP. Build: PASS. Browser/E2E: NO APLICA (solo servicio/HTTP, sin cambios de UI). Database: PASS para aplicación/cleanup. RLS: FAIL para requisito completo. Security: FAIL. Performance: WARNING (latencia adicional no medida y warning existente del build). Code Review: FAIL. Adversarial Review: FAIL. Riesgo residual: P1 abierto y compatibilidad legacy no probada; PostgreSQL local no ejecutado.

QUALITY GATE: FAIL

STORAGE PATH TRAVERSAL — BLOQUEADO — persiste escape de recurso hacia destino canónico tras normalización HTTP; requiere decisión sobre control HTTP y acceso directo a Storage.

## 2026-10-05 — Gateway Storage exclusivamente local

Implementados Edge source-file-storage, helper canónico único, signed upload/commit/delete/recover y SQL preparado restrictivo para escrituras directas. Ningún deploy, SQL remoto, secrets set ni mutación de Staging/Producción. Suite completa 288 archivos / 2345 tests PASS; PostgreSQL local 25 casos PASS; lint/build/diff-check PASS. CHIEF CODE AUDITOR confirma cero P0/P1 locales y aprueba con advertencias. El implementador bloquea readiness por riesgo residual del clear concurrente: lease Storage no protege escrituras posteriores de snapshot/tablas del cliente frente a takeover. Inventario legacy, plan y evidencia en supabase/security/SOURCE_FILE_STORAGE_GATEWAY_LOCAL.md. P1 histórico Staging no cerrado; Security 2 no retomada. QUALITY GATE: FAIL. STORAGE GATEWAY LOCAL — BLOQUEADO — proteger clear completo antes de enforcement.

## 2026-10-05 — Clear concurrente del workspace: corrección LOCAL

Barrera transaccional institution/workspace compartida por snapshot/tablas/RPC Storage, captura de cutoff_revision y keys, clear lógico atómico y cleanup/resume sobre journal inmutable. Cancelación de uploads anteriores impide finalize tardío; se retiraron writes posteriores del cliente y reset remoto del motor. FKs sin scope/cross-workspace provocan rollback fail-closed. PostgreSQL real 17.10 con dos TCP sesiones: 9 escenarios PASS, cleanup=0; PGlite24 PASS; 129 focales PASS; suite 288 archivos / 2348 tests PASS; lint/build/audit:repo/audit:prod/diff-check PASS. No deploy, secrets set, SQL remoto ni mutaciones Staging/Producción. CHIEF CODE AUDITOR final se interrumpió por límite de uso: no se acredita aprobación final; Browser/E2E real pendiente. Evidencia y residual en supabase/security/SOURCE_FILE_STORAGE_GATEWAY_LOCAL.md. QUALITY GATE: FAIL. STORAGE CLEAR CONCURRENCY — BLOQUEADO — falta auditoría independiente final y revisión real del flujo.

## 2026-10-05 — Promocion autorizada del Storage gateway a Staging — PASS

Este dictamen reemplaza el bloqueo historico de traversal para Storage exclusivamente. Security Acceptance 2 completa sigue pendiente; no se ejecutaron casos autorizados de administracion de usuarios ni frontend.

### Target y artefactos exactos

Target confirmado antes de mutar: Hub-Institucional-Staging, ref `lzjpycejdjpzkdyzaeco`, ACTIVE_HEALTHY. Baseline: cero objetos, usuarios e instituciones. Production mutations: **NONE**. Se desplego SOLO `source-file-storage`, ACTIVE v1, bundle SHA256 `93f70fb1f77dc69e5a324ed7f92717f0900b224347428203a51930e47c91ecf1`. La descarga posterior de los tres archivos remotos coincide byte por byte con los artefactos locales aprobados:

- index.ts: `f0d2fb073dfea2c1a2db928da1b39423302c5bcb5d3a7c26203a9115f39b9119`
- handler.js: `2fda392bb1b58abd9b88e230bc3686ed7f820691cc2322e868494dc0bf9a7e0a`
- _shared/sourceFileStoragePath.js: `10ce58d4b3a73df89cbdf6fd24d008ef32b64eebb1033983be0b25512e05cd1a`
- SQL: `8e4bca539c5f2b83100e38b387f98170cd8bec8f9d134447d4a1f9701bb30528`

Se aplico exactamente `supabase/security/source_file_storage_gateway.sql` mediante migration `storage_source_file_gateway_enforcement_20261005`, version `20261005165348`. Incluye las tablas/journals/RPC y barreras sobre tablas de workspace del cambio aprobado, ademas de policies; no se aplicaron otros archivos de schema. Bucket privado, limite 25 MiB. Policies restrictivas INSERT/UPDATE/DELETE para Storage y metadata, SELECT por manifest canonico o legacy exacto. Las diez RPC source_file_storage_* no permiten EXECUTE authenticated y si service_role. No se modificaron grants fuera del SQL aprobado.

verify_jwt=false conserva el patron contractual de autenticacion explicita por auth.getUser en el handler; no significa acceso anonimo. Runtime usa env estandar SUPABASE_* suministradas por Supabase. No se hizo secrets set ni se copiaron secretos productivos. CORS contractual local http://127.0.0.1:4173 PASS; origen ajeno 403. Service-role permanece exclusivamente dentro de Edge: no se recupero, registro ni incluyo en respuestas.

### Matriz real HTTP / GoTrue / Storage / Edge / PostgreSQL

**60 comprobaciones PASS**, detalle estructurado sin credenciales en [STAGING_STORAGE_ENFORCEMENT_EVIDENCE.json](./STAGING_STORAGE_ENFORCEMENT_EVIDENCE.json). Dos usuarios, dos tenants y tres workspaces sinteticos; dos sesiones reales del mismo actor para carreras. Login HTTP real; Supabase JS instalado en el repo, uploadToSignedUrl real, commit/delete/clear contra Edge desplegada. No mocks de identidad, objetos ni DB.

| Caso | Evidencia |
| --- | --- |
| Upload/read/replace/delete gateway legitimos | 200; contenido correcto; key anterior eliminada |
| INSERT/UPDATE Storage directos legitimos | RLS denied |
| DELETE Storage directo | 200 [] sin eliminar; objeto sobrevivio |
| Metadata INSERT/UPDATE/DELETE directos y RPC mutante authenticated | RLS denied / cero filas / 42501 |
| Exploit original main/horarios/../docentes/UUID | RLS denied, destino canonico no creado |
| ../, a/../, ..%2F, %2e%2e, %2E%2E, backslash y doble encoding | gateway 400; requests directos normalizados denegados |
| Sin JWT / JWT invalido | 401 / 401 |
| Cross-tenant, resource swap, workspace swap, operation-resource swap | 403; read ajeno 404 |
| Token firmado con key alterada | Invalid signature |
| Objeto ajeno del mismo tenant | lectura 404; delete fail-closed 503; objeto sigue 200 |
| Clear vs upload/replace, dos sesiones reales | finalize del upload concurrente 409; clear 200; dato posterior vive |
| Clear vs delete | ambos 200; replay no elimina dato posterior |
| Dos clears simultaneos con IDs diferentes | ambos 200 |
| Dos retries simultaneos con el mismo ID | ambos 200, mismo cutoff y targets |
| Workspace secondary mientras clear main pendiente | upload/replace/read PASS, sin bloqueo por main |
| Token emitido antes de clear, upload tardio | bytes pueden cargarse por token vigente; commit 409; dato vivo posterior intacto; cancel retira orphan |
| Nuevo clear explicito | ID/revision nuevos; retry terminal antiguo no elimina datos nuevos |
| Retry tras cleanup parcial | 200; limpia solo targets originales; archivo B posterior sigue 200 |

**Caso commit → fallo → dato B → retry A:** para inyectar el corte exacto sin cambiar/deployar codigo de fallo, se ejecuto la RPC aprobada real `source_file_storage_begin_clear` via SQL en Staging y se interrumpio deliberadamente la orquestacion antes de Storage cleanup/respuesta. Journal A `06fb4a65-c41c-48dd-b57a-be4a1f53f23b`: revision 6, un target original, cleanup_finished_at NULL. Luego el cliente autenticado actualizo snapshot a B-after-T0 y completo upload/commit B. Dos requests HTTP begin_clear con ese MISMO operation_id retornaron revision 6, mismo clear_id/updated_at y removed=1. Read original 404, read B 200 y snapshot B preservado. Un retry terminal repitio esos campos. Es una interrupcion controlada entre componentes reales, no un crash inducido del proceso Edge ni un mock.

**Cleanup parcial:** journal `60ba45b7-db81-4c9d-b11c-c3738776b90b`, revision 23, dos keys capturadas. Cancel HTTP elimino una key de upload pendiente ya cancelado por clear. Despues se creo B; retry HTTP del mismo journal termino las keys originales y B siguio 200.

Lectura de una key antigua tras replace devolvio temporalmente contenido cacheado. DB ya no tenia ese objeto y GET autenticado con query cacheBust y Cache-Control:no-cache devolvio 404. Las comprobaciones posteriores de borrado usan URL unica para separar cache de persistencia. No se confirmo perdida de datos ni P1.

### Reproduccion y cleanup

Usar exclusivamente el ref indicado. Crear fixtures aislados con UUID/tag aleatorios, dos tenants/usuarios y snapshots main/secondary; nunca registrar passwords/JWT/tokens. Obtener sesiones por signInWithPassword, catalogo de IDs por source_file_storage_resources; POST prepare con IDs y metadata, uploadToSignedUrl(path,token,Blob), POST commit. Lectura autenticada debe agregar cacheBust. Para traversal original invocar upload con tenant/actor/main/horarios/../docentes/UUID; no emitir un token para esa ruta.

Para repetir la interrupcion, ejecutar la RPC real con UUID de intencion estable, verificar journal pendiente y targets, omitir cleanup, completar snapshot/upload B por HTTP y lanzar dos POST begin_clear con el mismo operation_id. Consultar journal para constatar que no cambia cutoff/targets; comprobar B y snapshot, luego retry terminal. Para cleanup parcial preparar un upload pendiente en otro dataset antes de la RPC y cancelar su operation_id via gateway despues del commit del clear.

Retirar objetos con clear nuevo via gateway para cada workspace. SignOut de sesiones; eliminar SOLO los UUID fixture de journals/operations/resources/snapshots/revisions/memberships/institutions/profiles/Auth. El trigger de barrera de DELETE snapshot vuelve a escribir revisions: estas se retiran **despues** de snapshots. Primer intento de limpieza en orden contrario hizo rollback por FK, sin perdida parcial; el orden correcto termino exitosamente. No se borro storage.objects por SQL.

Verificacion SQL final independiente: **0 storage.objects, auth.users, auth.identities, auth.sessions, auth.refresh_tokens, institutions, profiles, memberships, admin_audit_logs, workspace_snapshots, workspace_source_files, source_file_storage_resources, source_file_storage_operations, source_file_workspace_clears y source_file_workspace_revisions**. Credenciales sinteticas descartadas; no fixtures remanentes.

admin-users permanece ACTIVE v2, mismo bundle SHA256 `53cbf123167a40e15264294d5c96c5a9e0caeb3687c97a574e8911d7cbcc82be`. POST sin JWT 401 antes y despues; no deploy/config ni acciones de gestion de usuarios sobre esa Edge.

### Revisiones, limites y gate

CHIEF CODE AUDITOR independiente reviso read-only los artefactos completos exactos: cero P0/P1 nuevos, Code Review PASS y Adversarial Review PASS. Evidencia remota ejecutada por implementador; cierre documental independiente registrado posteriormente si corresponde. P1 historico de traversal queda cerrado por enforcement real: no existe write directo autorizado al bucket.

P2 conservados sin ampliacion: import Edge @2 sin pin exacto; guard UI hasData tras reload vacio; cobertura local anterior sin Supabase HTTP ahora complementada por esta matriz real. P2 de precision HTTP observado: delete de objeto ajeno mismo tenant responde 503 generico aunque deniega y conserva el objeto. Needs Investigation previos: conflictos de writers habituales y cleanup tras revocaciones. Legacy SELECT permanece preparado/verificado en policy; Staging no tenia objetos legacy, por lo que no se acredita lectura de bytes legacy reales. Browser del producto y matriz completa admin-users siguen pendientes de Security 2; no hubo deploy frontend.

Archivos locales modificados en esta tarea: este resultado y nuevo JSON de evidencia. Codigo aprobado sin modificaciones. Typecheck principal NO DISPONIBLE; Deno check PASS heredado del artefacto aprobado, ejecucion Edge real PASS. Lint/build/tests globales locales previos PASS (2354 global, 135 focales), no rerun porque no cambio codigo. Tests HTTP Staging PASS 60/60. Browser/E2E NO APLICA al deploy backend (HTTP E2E real PASS; navegador producto pendiente). Database PASS; RLS PASS; Security PASS para esta matriz; Performance WARNING sin medicion nueva; Code Review PASS; Adversarial Review PASS. P0/P1 abiertos en este alcance: 0. Produccion no consultada ni mutada.

QUALITY GATE: PASS WITH WARNINGS

STAGING STORAGE ENFORCEMENT — PASS — LISTO PARA RETOMAR SECURITY 2

Cierre documental: la inspeccion independiente de artefactos termino con Code Review/Adversarial PASS y cero P0/P1 nuevos. La segunda pasada independiente sobre evidencia remota/documentos fue interrumpida por limite de uso; NO se acredita aprobacion independiente de esa evidencia final. El dictamen del implementador es PASS WITH WARNINGS sobre matriz HTTP real y cleanup SQL0; revision documental independiente pendiente.

## 2026-10-05 — Security Acceptance 2: admin-users funcional — BLOQUEADO — HISTÓRICO PRE-v3

La evidencia v2, su cleanup y el dictamen de fallo de esta sección se conservan íntegros. Las referencias siguientes a P1 abierto, versión v2 y exploit desplegado describen aquella ejecución; consultar «Estado posterior acreditado» para el estado posterior del fix de identidad.

Se ejecuto exclusivamente la matriz pendiente de admin-users en Hub-Institucional-Staging, ref `lzjpycejdjpzkdyzaeco`, ACTIVE_HEALTHY. Storage mantiene su aprobacion anterior y no fue repetido. Ningun cambio de codigo/schema/RLS/grants, deploy, secrets set ni configuracion Auth. Production mutations: **NONE**. Detencion en primer P1 confirmado; despues solo cierre de sesiones, cleanup y evidencia.

### Contrato y matriz real

Fuente desplegada recuperada read-only: admin-users ACTIVE v2, bundle SHA256 `53cbf123167a40e15264294d5c96c5a9e0caeb3687c97a574e8911d7cbcc82be`, sin cambios respecto a antes. requireInstitutionAdmin permite owner/admin del institution_id solicitado y superadmin; create_or_assign_institution_user y set_user_password requieren superadmin. Caller bloqueado se rechaza antes de operar.

Bootstrap SQL acotado de cinco cuentas sinteticas (admin A, admin B, viewer, bloqueado y superadmin), dos instituciones y snapshots. Sus sesiones se obtuvieron por HTTP GoTrue real. Usuarios alumno A/B y cuenta asignada por superadmin fueron creados por Auth Admin real dentro de la Edge; creacion y reset se verificaron mediante login HTTP. No se recupero ni copio service-role; credenciales/JWT en memoria sin archivos ni logs del harness.

| Caso | Resultado antes de detener |
| --- | --- |
| Sin Authorization / JWT invalido | PASS: 401 / 401 |
| Usuario autenticado viewer sin permiso / bloqueado | PASS: 403 / 403 |
| CORS OPTIONS origen permitido y cabecera exacta | PASS: 200, http://127.0.0.1:4173 |
| CORS OPTIONS y POST origen ajeno | PASS: 403 / 403 |
| Admin institucional bulk_create_students dentro de A | PASS: 200, created=1, failed=0; login del alumno PASS |
| Admin A solicitando institution_id B | PASS: 403 |
| Admin institucional set_user_password reservado a superadmin | PASS: 403 |
| Superadmin create_or_assign_institution_user en B | PASS: 200; login real PASS |
| Superadmin set_user_password sobre cuenta sintetica | PASS: 200; login con nueva password PASS |
| Admin B creando alumno exclusivamente en B | PASS: 200, created=1 |
| Admin A usando email de alumno B pero institution_id A | **FAIL P1: cambia credencial Auth global ajena** |

Detalle sin secretos en [STAGING_ADMIN_USERS_SECURITY_2_EVIDENCE.json](./STAGING_ADMIN_USERS_SECURITY_2_EVIDENCE.json): 17 comprobaciones PASS y dos registros FAIL que representan un unico P1 (operacion indebida y confirmacion del efecto). No se presenta una matriz completa verde.

### P1 confirmado: takeover de alumno de otro tenant por email

Precondicion verificada por SQL: alumno `e679aae4-8d6d-4ced-b7a8-072044400a7d` tenia account_role alumno, is_global_admin=false, unica membership viewer en B `dd274081-b9b5-4bbc-84f6-1c969a5d8ffa`, y student_record solo en B. Caller admin A solo tenia membership admin en A `66a08034-c476-4357-aa1d-45632b02d211`. Login con password original del alumno B PASS.

El admin A envio:
~~~json
{
  "action": "bulk_create_students",
  "institution_id": "<TENANT_A>",
  "students": [{
    "email": "<EMAIL_ALUMNO_SOLO_B>",
    "dni": "<NUEVA_PASSWORD_SINTETICA>",
    "full_name": "Synthetic Foreign Target"
  }]
}
~~~

Respuesta real: HTTP 200, success=true, updated=1, failed=0, user_id igual al alumno B. Login HTTP con la credencial elegida por A PASS para ese mismo Auth user; login con la anterior password fallo. La identidad global de B fue sobrescrita y asignada tambien a A sin autorizacion previa sobre ella. Rechazar institution_id B no protege esta variante de acceso indirecto.

Evidencia de codigo desplegado/local: requireInstitutionAdmin verifica el tenant solicitado (index.ts:416); handleBulkCreateStudents obtiene usuarios Auth globalmente por email (1127) y llama createOrReuseStudentAuthUser (1150); el helper valida rol alumno/no superadmin pero no ownership/membership del target (744) antes de auth.admin.updateUserById con password (785). La membership A se agrega despues (1174). Esto confirma un bypass de aislamiento/Auth y no un fallo de infraestructura.

Reproduccion: crear alumno solo en B por admin B; comprobar membership unica B y login original; como admin A enviar bulk_create_students con institution_id A, email exacto de ese alumno y otra credencial en dni; comprobar si updated=1, el mismo user_id y login con nueva credencial. Se debe denegar cualquier modificacion de Auth ajeno, salvo autorizacion contractual explicita; no se implemento una correccion en esta ejecucion porque se ordeno detener al primer P0/P1.

### Pendientes por regla de detencion y warnings

No se ejecutaron mas ramas superadmin, comprobacion final de logs ni smoke HTTP de Storage despues del P1. Respuestas admin-users recorridas por el harness no contenian service-role, JWT ni las passwords administrativas generadas; esto NO acredita ausencia de secretos en logs. Ambas Edge siguen ACTIVE, versiones/bundles sin cambios. Storage conserva el PASS previo; la consulta read-only del estado no se declara smoke funcional nuevo.

Warnings anteriores conservados: import Edge @2 sin pin exacto; guard UI hasData tras reload vacio; precision HTTP 503 en delete ajeno de Storage; Needs Investigation de writers y cleanup tras revocaciones. Segunda revision documental independiente de la promocion anterior pendiente por limite de uso. Ninguno reemplaza ni rebaja el P1 confirmado actual.

### Cleanup y dictamen

SignOut de actores/cuentas con sesiones reales antes de eliminar fixtures. Se retiraron exclusivamente ocho UUID Auth sinteticos y sus filas dependientes, dos instituciones, student_records, memberships, perfiles, audit logs, snapshots/catalogo/revisions y journals del fixture. No se crearon objetos Storage ni se elimino storage.objects por SQL.

SQL final independiente confirma **0**: storage.objects; auth.users/identities/sessions/refresh_tokens; institutions/profiles/memberships/admin_audit_logs; student_records/student_career_plans/teacher_records; workspace_snapshots/workspace_source_files; source_file_storage_resources/operations; source_file_workspace_clears/revisions. Credenciales sinteticas descartadas. source-file-storage ACTIVE v1 y admin-users ACTIVE v2.

Archivos modificados: este resultado, JSON de evidencia y docs/WORKLOG.md; solo documentacion. Typecheck/lint/build/suite global: NO APLICA a esta ejecucion sin cambio de runtime. Tests funcionales HTTP: FAIL por P1; Database/cleanup PASS; RLS sin cambios y Storage PASS previo; Security FAIL; Browser/E2E producto NO APLICA (HTTP real ejecutado); Performance NO APLICA; revision de contrato efectuada por implementador, segunda auditoria documental independiente sigue pendiente. P0: 0 confirmado; P1: 1 abierto; P2/Needs Investigation anteriores sin ampliacion; P3 nuevos: ninguno confirmado.

QUALITY GATE: FAIL

STAGING SECURITY 2 — BLOQUEADO — P1: admin institucional A puede sobrescribir la password Auth de un alumno exclusivo de otro tenant mediante reutilizacion global por email en bulk_create_students.

### 2026-10-06: correccion LOCAL, sin promocion — HISTÓRICO PRE-v3

bulk_create_students reutiliza identidad solo con perfil alumno, membership y student_records inequívocos del tenant destino; Auth existente no recibe password ni metadata ni escrituras de legajo. Email ajeno/ambiguo denegado fail-closed, race de create sin reset. 39 focales y Deno check PASS; auditor independiente focal PASS. Suite global final 2374 PASS/1 FAIL (tema ajeno); lint/build fallan en Primaria preexistente. Auditor inventaria P1 preexistente en fallback global set_user_password fuera del parche. QUALITY GATE: FAIL. Evidencia: supabase/security/ADMIN_USERS_STUDENT_IDENTITY_LOCAL.md. No deploy, SQL/config remoto ni mutaciones Staging/Produccion; resultado remoto anterior sigue BLOQUEADO y exploit desplegado no se declara corregido. Cleanup de fixtures locales en memoria=0; sin nuevos fixtures remotos.
