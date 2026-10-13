# admin-users: identidad de alumno cross-tenant — correccion LOCAL

Fecha: 2026-10-06. Scope exclusivo del P1 bulk_create_students. Staging/Production mutations: **NONE**. Sin deploy, SQL remoto, cambios de schema/RLS/grants, secretos ni dependencias.

## Comportamiento final

bulk_create_students nunca actualiza password, email_confirm ni user_metadata de un Auth existente. Resuelve email trim/lowercase server-side con el catalogo Auth completo dentro del limite de veinte paginas de mil usuarios: duplicados o catalogo incompleto fallan 409. No convierte una colision concurrente de createUser en reset/reuse.

La reutilizacion exige perfil persistido de alumno, no global admin ni bloqueado, email coherente, membership del tenant destino y student_records del mismo tenant/email inequívocamente vinculados al Auth ID. Se pide count exacto y se rechazan resultados truncados, registros sin perfil o perfiles contradictorios. No se confia en user_metadata para autorizar. ILIKE escapa comodines del email.

Existente valido retorna IDs y sigue sin ejecutar escrituras de Auth, perfil, memberships, legajo ni planes. Conserva status updated/contador updated por compatibilidad del cliente; este status ahora significa acceso reutilizado, no credenciales modificadas. student_record_id se resuelve por workspace main/career existente; si no hay ese registro exacto retorna null en lugar de crear uno durante reuse. No hay migracion ni relink automatico de identidades ambiguas.

Email sin Auth crea cuenta nueva solo si no hay un student link contradictorio en el tenant. El flujo nuevo mantiene Auth Admin createUser y vinculacion previa. Lotes mixtos conservan resultados parciales: la fila ajena falla y la legitima puede crear; sin resultados exitosos una identidad denegada da HTTP409, otros errores dan status de error. No se promete transaccion atomica de lote.

set_user_password permanece SOLO SuperAdmin: no se concedio reset a admins institucionales. institution_id opcional expresa scope exacto; target sin membership en ese tenant da403 antes de tocar Auth. Un error de reset con scope no elimina/recrea usuarios. El superadmin sin scope conserva su facultad global contractual anterior y el caller frontend existente no cambia.

## Inventario de create/reuse y permisos

- createOrReuseStudentAuthUser tiene una sola llamada: bulk_create_students. Su branch existente es read-only y valida DB.
- createOrReuseAuthUser pertenece a create_tenant_with_admin y create_or_assign_institution_user, ambas SOLO SuperAdmin. Conserva comportamiento global anterior; no es accesible desde bulk de alumnos.
- createOrReuseTeacherAuthUser pertenece a bulk_create_teachers y usa el email tecnico derivado de DNI+institution_id. No se modifico su contrato en esta tarea.
- set_user_password mantiene requireSuperAdmin; su scope explicito no amplia permisos.

## Verificacion focal y limites

**39 focales PASS / 3 archivos**, incluidos 21 casos nuevos ejecutando el index.ts real transpileado por Vite/OXC, con Request/Response y adapters sinteticos Auth/DB. El harness no reimplementa los guards de la Edge.

| Requisito | Resultado |
| --- | --- |
| Admin A, email exclusivo B | 409, cero escrituras Auth/DB de dominio; hash/password y metadata B intactos |
| Case/whitespace del mismo email | 409, misma invariancia |
| Existente mismo tenant | ID reutilizado, credenciales/perfil/membership/legajo intactos |
| Existente sin DNI | IDs reutilizados sin borrar DNI, legajo, phone ni informacion academica |
| Email nuevo | creacion PASS, membership viewer solo en tenant destino |
| Sin student link/membership/profile, link contradictorio/null, bloqueado o rol ajeno | 409, sin mutacion |
| Auth email duplicado / catalogo incompleto / carrera createUser email_exists | fail-closed 409, sin fallback a reset |
| Email nuevo con student link ya ligado a otro Auth | 409 antes de createUser |
| set_user_password SuperAdmin, scope/target mismo tenant | PASS, solo reset dedicado cambia credencial |
| set_user_password scope A, target B / caller institucional | 403, password intacta |
| Error Auth en reset scoped | error sin deleteUser ni createUser |
| Fallo lookup identidad | error, cero escrituras Auth/DB de dominio |
| Cleanup | afterEach elimina todos los usuarios/filas/credenciales sinteticos; asserts finales0 |

No se crearon clusters DB ni usuarios/objetos remotos. Cleanup0 corresponde a fixtures de memoria; no acredita rollback transaccional de GoTrue/PostgreSQL. Tests ejecutan handler real con adapters, **no** login GoTrue/Storage real ni Deno serve HTTP. Deno check real del entrypoint PASS. La reproduccion HTTP/Auth real en Staging requiere otra fase autorizada: el P1 remoto sigue abierto hasta deploy y exploit denegado.

Comandos reproducibles (PowerShell):

```powershell
npm.cmd exec vitest run src/services/adminUsersStudentIdentity.test.js src/services/adminUsersEdgeFunctionSecurity.test.js src/services/studentAccess.test.js
$identityDeno = Join-Path $env:TEMP 'hub-storage-gateway-closure-tools/node_modules/deno/deno.exe'
$env:DENO_DIR = Join-Path $env:TEMP 'hub-storage-gateway-deno-cache'
& $identityDeno check --no-lock supabase/functions/admin-users/index.ts
npm.cmd exec eslint src/services/adminUsersStudentIdentity.test.js
npm.cmd run lint
npm.cmd test -- --maxWorkers=2
npm.cmd run build
npm.cmd run audit:repo
git diff --check
```

Se reutilizo Deno2.9.6 local de la fase anterior. El primer check de admin-users detecto101 errores por ReturnType de createClient generico y tipos previos. Se derivo el tipo del cliente concreto getClients (45 annotations), se anotaron snapshot/resultado de query/tupla Map y se completo el tipo de contexto SuperAdmin con los campos ya leidos; el guard de autorizacion no cambio. Sin casts, ts-ignore, suppressions ni cambios a permisos. Import SDK @2 sin pin se mantuvo como P2 conocido.

## Auditor independiente — CHIEF CODE AUDITOR

Auditor fresh-context read-only, skill code-review-and-quality: **Code Review focal PASS / Adversarial Review focal PASS**, GO para el fix local, NO-GO para release global. SHA256 auditado del index.ts: D5B6E53D9008BB1018AD92C3038EA92342B2876AF337A6C1DCE0DEB6387D533D.

Reprodujo39focales. Adversariales independientes: duplicado Auth en pagina2 tras1000fillers=>409 sin writes; count truncado=>409 sin writes; lote mixto sin cambiar Auth ajeno; reuse email-only conserva legajo. Una regresion transitoria de borrado de campos del legajo fue corregida y reauditada antes del cierre.

Hallazgos inventariados, sin ampliar alcance:

1. **P1 preexistente fuera del parche:** fallback global set_user_password elimina Auth por cualquier updateError (index.ts:3578). profiles referencia Auth ON DELETE CASCADE; enrollments/grades/attendance referencian profiles con CASCADE (schema01:53, schema07:17/34/76). Puede perder datos antes de fallar recreacion. Evidencia estatica, no ejecutada contra DB real en esta tarea. El scope nuevo evita ese branch; global legado permanece. No se presenta como P2 ni como cerrado.
2. **P2 residual:** createUser exitoso y fallo posterior de perfil/membership/student_records deja Auth creado. Auditor reprodujo primera solicitud500, retry409 por vinculos incompletos. Fail-closed impide reparacion implicita; requiere recuperacion explicita. No se implemento una transaccion distribuida/compensacion fuera del P1.
3. **Needs Investigation preexistente:** password anidado en student puede persistir en raw_payload y metadata de auditoria; redaccion actual es superficial (index.ts:176/1009). Sin cambio fuera del alcance.
4. **Needs Investigation:** concurrencia real y drift del schema/normalizacion de emails, a validar en Staging autorizado. No se uso user_metadata para sustituir vinculos faltantes.
5. **Performance WARNING:** lookup Auth ahora exige catalogo completo hasta20k y deniega superar limite; no se midio latencia real ni se afirma una mejora. Queries de pertenencia acotadas al tenant/ID/email, count exacto evita truncamiento silencioso.

No hay P0/P1 introducidos abiertos en la correccion focal. Esto no equivale a aprobacion global ni cierre remoto de Security2.

## Quality gate

Archivos de implementacion: supabase/functions/admin-users/index.ts y src/services/adminUsersStudentIdentity.test.js. Documentacion: este archivo, resultado historico Staging y docs/WORKLOG.md. Cambios dirty preexistentes ajenos se conservaron.

Typecheck JS/JSX: NO DISPONIBLE; Deno check: PASS. Lint focal: PASS; lint global: FAIL en src/modules/primaria (26 errores y1warning). Build: FAIL por imports ../stores/primStore y ../data/gradeData inexistentes desde PrimariaPortalModule.jsx. Audit:repo y diff-check: PASS. Browser/E2E: NO APLICA (sin cambio UI, fixtures del handler locales). Database/RLS: NO APLICA a mutaciones; revision estatica de queries/constraints efectuada, sin SQL nuevo. Security focal: PASS; Security global: FAIL por P1 preexistente inventariado. Performance: WARNING. Code Review/Adversarial focal: PASS.

Primera suite global: 3 failed /2371 passed (290 archivos,2374 tests); fallos appThemeStyles y dos timeouts UI bajo carga compartida de build. Se repite suite final completa con maxWorkers2 sin cambiar assertions, timeouts ni exclusiones; resultado final se agrega abajo.

Suite global final (maxWorkers=2): **2374 PASS / 1 FAIL, 2375 tests**. Unico fallo: src/theme/appThemeStyles.test.js, dark theme coverage/cubre fondos claros y textos semanticos usados por los modulos; fuera del runtime Auth modificado. Los dos timeouts UI anteriores pasan en esta ejecucion. Reporte reproducible: %TEMP%/hub-admin-identity-local-checks/global-final.json y global-final.log. Hash final del entrypoint coincide con el auditado. No se modificaron tests, assertions ni tiempos para ocultar fallos. Cleanup de fixtures en memoria=0; no se crearon fixtures Auth/DB/Storage remotos ni locales reales. Validacion HTTP/GoTrue real del fix pendiente de autorizacion posterior para Staging; no se acredita rollback transaccional real.

QUALITY GATE: FAIL

ADMIN-USERS CROSS-TENANT IDENTITY — BLOQUEADO — fix focal implementado y auditado; gates globales y P1 preexistente de reset global impiden declarar listo para Staging patch.

## 2026-10-06: validacion Auth + DB + HTTP reales LOCALES

**ADMIN-USERS IDENTITY REAL — PASS — P1 CERRADO localmente.** Este dictamen cierra solo el takeover de bulk_create_students en el artefacto local; no aprueba release global ni declara corregida la Edge desplegada.

Entrypoint auditado sin cambios, SHA256 D5B6E53D9008BB1018AD92C3038EA92342B2876AF337A6C1DCE0DEB6387D533D. Deno2.9.6 real ejecuta ese index.ts; HTTP loopback pasa por proxy de transporte hacia GoTrue v2.196.0 y PostgREST v16.1 reales, PostgreSQL17.6 real. No adapters, mocks, transpilation ni interceptacion de Auth/DB. Deno limita red de runtime a loopback; imports SDK publicos conservan dependencia @2 no fijada (P2 anterior). Config GoTrue verificada contra documentacion oficial: https://github.com/supabase/auth/blob/master/README.md#database.

Se clono solo schema y bookkeeping Auth migrations del contenedor baseline local a DB aislada identity_real_9ffd6dd97a, sin copiar filas de usuarios ni datos de negocio. Fixtures: dos instituciones, seis identidades iniciales creadas por Auth Admin HTTP, una identidad nueva creada por bulk. Caller admin institucional A y SuperAdmin son autenticados por GoTrue, nunca JWT de usuario falsificado. Clave de firma/keys administrativas locales temporales, sin secretos remotos. Setup tuvo fallos de infra (ownership, search_path Auth y cache Deno incompleta), corregidos solo en harness temporal; no son fallos funcionales. Todas esas DB/contenedores temporales se eliminaron.

| Caso real | Resultado |
| --- | --- |
| Crear tenants A/B y alumnos/Auth | PASS, Auth Admin HTTP y filas DB reales |
| Admin A usa email exclusivo B | 409, password hash/metadata/perfil/memberships/legajo de B exactamente intactos |
| Login B tras intento | Original200; propuesta de A400 |
| Email mayusculas y whitespace | Ambos409, original200 y propuesta400, sin mutacion de identidad |
| Alumno existente mismo tenant | 200, mismo user_id, created0; original200/propuesta400 y snapshot Auth/DB identico |
| Email nuevo | 200, created1; login200 y membership/student_record exactos A |
| Sin student link / vinculos ambiguos | Ambos409, Auth/DB intactos y passwords originales funcionan |
| set_user_password autorizado con scope A | SuperAdmin200; password nueva200/original400 |
| set_user_password target B con scope A | SuperAdmin403, B original200/propuesta400 y Auth/DB intactos |
| Admin institucional intenta reset dedicado | 403 segun contrato SuperAdmin actual; sin ampliar facultades |
| Cleanup | PASS, todos los contadores Auth/DB/Storage0 |

Snapshot de no-mutacion compara encrypted_password, raw_user_meta_data, perfil, memberships y student_records antes/despues; hashes/metadata no se imprimen ni guardan en evidencia. SignOut real precede borrado por Auth Admin, y SQL retira solo filas de la DB temporal aislada. Contadores finales0: Auth users/identities/sessions/refresh_tokens; profiles/memberships/student_records/institutions/admin_audit_logs; storage.objects. DB aislada eliminada, dos contenedores temporales eliminados, Deno/proxy finalizados y env files borrados. Verificacion posterior independiente:0 bases identity_real_% y0 contenedores identity_real_. Contenedor baseline original permanece intacto. Staging/Produccion:0 mutaciones.

Evidencia sanitizada persistida: ADMIN_USERS_IDENTITY_REAL_EVIDENCE.json. Reproductor completo: ADMIN_USERS_IDENTITY_REAL_HARNESS.md (extraer bloque JavaScript a %TEMP%/hub-admin-identity-real/validate.mjs, ejecutar desde raiz con node.exe). Requiere Docker local baseline nombrado en script e imagenes locales indicadas. Harness valida hash antes/despues y usa finally para cleanup aun tras error; si falla cleanup su resultado es BLOCKED.

Sin modificaciones de implementacion, grants/schema del baseline, ni correccion de blockers ajenos. No se repitieron suite global/lint/build: estados anteriores permanecen FAIL. Deno runtime/HTTP y Database/Auth focal: PASS; Browser producto NO APLICA; performance NO APLICA (sin medicion ni trabajo nuevo); revision independiente del artefacto anterior conservada. Global QUALITY GATE: FAIL sin cambios por otros blockers; **validacion focal real: PASS**. No se acredita rollback transaccional de provisioning parcial ni closure de fallback reset global; ambos quedan fuera de esta microtarea.
