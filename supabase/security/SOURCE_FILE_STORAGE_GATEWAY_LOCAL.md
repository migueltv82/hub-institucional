# Storage gateway - cierre de evidencia local

Fecha: 2026-10-05. Estado actual: P1 de retry HTTP/UI CORREGIDO y aprobado independientemente en alcance LOCAL. QUALITY GATE actual: PASS WITH WARNINGS. El cierre real Browser/Deno HTTP sigue siendo una fase distinta. Las secciones historicas siguientes conservan el dictamen anterior al fix.
No deploy, SQL remoto, secrets set ni mutaciones de Staging/Produccion.

## Baseline preservado

Evidencia de la tarea anterior: 2348 tests globales, 129 focales, lint/build/diff PASS; DB/RLS/Security local PASS; 9 escenarios de PostgreSQL real con dos sesiones PASS y cleanup=0. El auditor reprodujo independientemente 129 focales y 24 casos PGlite PASS; no repitio la suite global ni los nueve escenarios TCP. Esos resultados no acreditan el contrato HTTP/UI del retry de clear.

## Auditoria historica antes de la microtarea de idempotencia

CHIEF CODE AUDITOR nuevo, sin historial del implementador, reviso gateway/SQL/helper/callers y tests. P1 CONFIRMADO: si clear hace commit de su transaccion DB y luego falla Storage.remove o se pierde la respuesta, reintentar desde la UI inicia otro clear, captura el estado vivo actual y puede borrar recursos creados despues de T0.

Evidencia de codigo:

- supabase/functions/source-file-storage/handler.js:19: begin_clear no acepta un clear_id estable.
- handler.js:110-111: cada solicitud genera crypto.randomUUID() y envia p_resume=false para begin_clear.
- handler.js:121: un fallo de cleanup sucede despues del clear logico DB y termina en HTTP 503 sin ID recuperable.
- src/services/workspaceSnapshot.js:1079/1085: resumeStorageClear=false por defecto; el flujo habitual envia begin_clear.
- src/hooks/useWorkspacePersistence.js:179: el caller no activa resume ni conserva identificador pendiente.
- src/components/GeneradorCronograma.jsx:458-469: tras el error, el boton vuelve a habilitarse para otro intento.
- supabase/security/source_file_storage_clear.concurrent.mjs:94: el test de respuesta perdida reusa job.id directamente en SQL. HTTP/UI no expone esa misma garantia; por eso el test verde no cubre el defecto.

### Reproduccion independiente

El auditor ejecuto el handler real y el SQL preparado real en PostgreSQL PGlite aislado. Inyecto solamente el error de Storage.remove; esto es fault injection local, NO Browser/E2E real ni Storage real.

1. Usuario autorizado llama HTTP begin_clear. La transaccion SQL hace commit del primer journal/cutoff.
2. Storage.remove falla y el handler responde 503; el flujo de usuario no conserva clear_id.
3. Otra escritura guarda snapshot {createdAfterT0:true} y finaliza un archivo nuevo con operation UUID/key nueva.
4. El usuario reintenta el mismo clear fallido: la UI vuelve a llamar begin_clear.
5. El handler genera otro UUID, SQL crea otro journal y captura la nueva key. El snapshot queda {}, manifestCount=0.

Comando del auditor: node --input-type=module -. Resultado:

~~~json
{"result":"CONFIRMED_HTTP_RETRY_RECAPTURES_LIVE_DATA","firstStatus":503,"retryStatus":503,"newClearIdOnRetry":true,"postT0Snapshot":{},"postT0ManifestCount":0,"postT0KeyCapturedInRetry":true}
~~~

Esta perdida de datos es funcional, no un problema del harness/infra. Code Review, Security y Adversarial Review: FAIL. P0 confirmado: 0; P1 confirmado: 1. El cierre se detuvo al recibir confirmacion, conforme a la regla de la tarea. No se aplico un fix.

Otros hallazgos del dictamen:

- P2: clear.concurrent.mjs:94 prueba retry SQL con job.id; no cubre el contrato HTTP del usuario.
- P2: index.ts:1 importa supabase-js@2 sin version exacta; el runtime puede resolver versiones diferentes. No se cambio el import en esta tarea.
- Needs Investigation: SQL:17 usa pg_try_advisory_xact_lock y rechazo inmediato 55P03. Los sincronizadores habituales usan Promise.all para el mismo workspace sin reintento especifico; posible sincronizacion parcial incluso sin clear. Evidencia estatica, no defecto confirmado por reproduccion; no se abrio otra investigacion tras stop.

## Deno y Browser/E2E

Deno 2.9.6 real se instalo solamente en temp del sistema. Comando ejecutado desde la raiz:

~~~powershell
$closureDeno = Join-Path $env:TEMP 'hub-storage-gateway-closure-tools/node_modules/deno/deno.exe'
$env:DENO_DIR = Join-Path $env:TEMP 'hub-storage-gateway-deno-cache'
& $closureDeno check supabase/functions/source-file-storage/index.ts
~~~

Resultado: PASS de deno check. Resolvio el import existente @supabase/supabase-js@2 a 2.117.2 via esm.sh. La implementacion y ese import no cambiaron. El deno.lock generado por esta comprobacion se retiro; package.json/package-lock no cambiaron.

Typecheck principal JS/JSX: NO DISPONIBLE, warning documentada. Deno check PASS NO equivale a haber ejecutado la Edge HTTP: las rutas criticas de Deno serve no se ejecutaron porque se detuvo en P1.

Docker Desktop local arranco y respondio version 29.6.1. Se creo solo una configuracion Supabase temporal mediante init, sin start del stack ni aplicacion SQL. Browser/E2E REAL de upload/read/replace/delete/clear y negativos traversal/cross-tenant: NO EJECUTADO por stop en P1. No se declara PASS con mocks ni se atribuye el bloqueo a infraestructura.

## Cleanup y limites

No se crearon objetos, usuarios ni fixtures Auth/Storage reales en esta tarea; el stack no se inicio. La configuracion temporal se elimino tras verificar su ruta dentro de TEMP. Inventario Docker del proyecto de cierre: 0 containers; directorios de clusters PostgreSQL de pruebas: 0. No quedan fixtures propios de la preparacion local. El auditor confirmo que su DB aislada en memoria se cerro en finally: cero fixtures persistentes.

Docker Desktop quedo iniciado. La revision automatica rechazo detener el servicio compartido porque una consulta fallida podia interpretarse como inventario vacio. Se uso una alternativa segura que verifico inventario exitoso y elimino solamente la configuracion temporal; no se detuvo el servicio compartido. Los runtimes/cache temporales son herramientas, no objetos/fixtures.

## Compatibilidad legacy y contrato restante

Gateway conserva key canonica tenant/actor/workspace/dataset/operation_uuid, filename saneado, autorizacion contra DB, signed upload y finalize, operaciones delete/replace server-side y bloqueo de writes directos authenticated preparado en SQL. No se normalizan rutas libres en RLS ni se lista un prefijo actual para borrar todo.

Lectura legacy tenant/workspace/dataset/timestamp-basename sigue temporal y vinculada a manifest/tenant. Metadata base64/path null, bucket ajeno, estructura o dataset desconocidos no se convierten automaticamente: escrituras fallan cerrado. Un inventario/migracion remotos no fue ejecutado. Tokens no revocables requieren journal y barrido despues de su expiracion real mas margen; binding/expiracion de Storage real siguen pendientes. FKs/dependencias sin scope o cross-workspace hacen rollback fail-closed. Estas limitaciones no se dan por verificadas remotamente.

## Quality gate del cierre

Archivos modificados en este cierre: este documento y docs/WORKLOG.md (evidencia solamente).
Typecheck principal: NO DISPONIBLE. Deno check: PASS. Lint/Tests/Build/Database/RLS: baseline PASS local preservado, sin rerun. Diff-check: PASS. Browser/E2E real y Deno HTTP: NO EJECUTADOS por stop. Security: FAIL por P1 confirmado. Performance: NO APLICA a este cierre, sin mediciones nuevas. Code Review: FAIL. Adversarial Review: FAIL. Riesgo residual: perdida de datos post-T0 al reintentar clear desde HTTP/UI; restantes evidencias reales pendientes.

QUALITY GATE: FAIL

STORAGE GATEWAY LOCAL CLOSURE - BLOQUEADO (dictamen historico anterior al fix de abajo).

## Microtarea posterior: idempotencia HTTP/UI del clear

Solo el P1 de retry fue modificado. La UI genera un UUID una vez y lo persiste en sessionStorage antes de HTTP, separado por institution/workspace/actor. Un error conserva el UUID incluso tras remount/reload de la misma pestana. No se toman IDs de respuestas ni timestamps del cliente. Tras exito completo se retira solamente esa intencion: un clear posterior explicito obtiene otro UUID. El modo local no usa el gateway.

El cliente pasa operationId al servicio; begin_clear y resume_clear exigen operation_id canonico. El SQL registra el journal con PK (institution_id,workspace_key,id). Replay exige mismo actor, scope e ID; nunca selecciona el journal mas reciente. El primer intento fija cutoff_revision/targets en la transaccion existente. El retry reutiliza ese journal sin barrera mutable, recaptura ni nuevo borrado DB. Una operacion terminal devuelve respuesta repetible y no repite Storage.remove/finish.

Cleanup parcial mantiene el journal pendiente y reintenta solo sus keys originales. Reintentos concurrentes pueden repetir una eliminacion idempotente de esas keys; no afectan manifiestos/keys nuevas. El ID pendiente no se regenera despues de fallo de HTTP, cleanup o relectura del estado. Retirar una intencion vieja nunca retira una mas nueva.

### Evidencia focal reproducible

- 135 tests focales / 9 archivos PASS: UUID persistido y retry manual tras remount, nuevo clear posterior, aislamiento tenant/workspace/actor, fallo cerrado de sessionStorage, contrato operation_id obligatorio, replay terminal, traversal/authz/upload/delete y servicio sin writes tardios.
- 24 casos PostgreSQL PGlite PASS con el SQL preparado actual.
- PostgreSQL real 17.10, dos sesiones TCP y HTTP real de handler: 13 escenarios PASS (9 anteriores y 4 de retry HTTP). Se inyecto fallo despues de commit DB y antes de cleanup; luego se crearon snapshot/archivo B; dos retries concurrentes con mismo operation_id conservaron B y cutoff/targets originales. Tambien PASS: cleanup parcial, terminal repetido sin nuevas eliminaciones, clear nuevo posterior y mismo ID en workspace A/B aislados.
- Cleanup final: 0 objetos, usuarios/fixtures y directorios de clusters. Servidor HTTP loopback cerrado en finally; PostgreSQL detenido y directorio temporal eliminado con validacion de ruta.
- Deno 2.9.6 check --no-lock PASS del entrypoint actual. Import @2 conservado; no se agrego deno.lock ni dependencias del repo.
- Lint, build/audit:prod, audit:repo y diff-check PASS. Suite global y dictamen final se registran en el cierre de esta seccion.

~~~powershell
npm.cmd exec vitest run src/services/sourceFileStoragePath.test.js src/services/sourceFilesStorageSecurity.test.js src/services/sourceFiles.test.js src/services/sourceFileStorageGatewayHandler.test.js src/services/sourceFileStorageGatewayContract.test.js src/services/sourceFileStorageWorkspaceClear.test.js src/services/workspaceClearIntent.test.js src/services/workspaceSnapshot.test.js src/hooks/useWorkspacePersistence.test.js
$storageTestDir = Join-Path $env:TEMP 'hub-storage-gateway-postgres'
node supabase/security/source_file_storage_gateway.local.mjs $storageTestDir
$storageHttpDir = Join-Path $env:TEMP 'hub-storage-clear-postgres'
node supabase/security/source_file_storage_clear.concurrent.mjs $storageHttpDir
$closureDeno = Join-Path $env:TEMP 'hub-storage-gateway-closure-tools/node_modules/deno/deno.exe'
$env:DENO_DIR = Join-Path $env:TEMP 'hub-storage-gateway-deno-cache'
& $closureDeno check --no-lock supabase/functions/source-file-storage/index.ts
~~~

Los prefixes temporales contienen PGlite, embedded-postgres@17.10.0-beta.17 y deno@2.9.6 respectivamente; no se instalaron paquetes en package.json/package-lock. El test HTTP usa el handler real y SQL real, con adapters locales para identidad Auth y eliminacion de objetos/fallos; NO acredita GoTrue/Storage/Deno serve reales ni Browser/E2E del producto. Esos puntos siguen pendientes del cierre local posterior. No se midio latencia ni se abrio trabajo de performance.

### Riesgos/P2 fuera de esta microtarea

- P2 previo de cobertura SQL sin contrato HTTP: el caso requerido del P1 ahora se prueba via HTTP real + PostgreSQL real; no se declara con ello E2E Supabase real.
- P2 import Edge @2 sin pin exacto: conservado, no se cambio index.ts.
- P2 residual UI: tras fallo post-commit y reload con workspace vacio, guard hasData de GeneradorCronograma.jsx impide accionar clear/cleanup hasta que haya datos. La intencion sigue persistida y HTTP/API admite replay; no se modifico ese guard fuera del P1.
- Needs Investigation anterior: conflictos 55P03 entre writers habituales con Promise.all; no se investigaron ni refactorizaron sincronizadores.
- Typecheck principal JS/JSX no disponible; warning documentada. Deno check si esta disponible y paso. Browser/Deno HTTP/Storage reales y schema/FKs remotos pendientes de su fase autorizada. No se cierra el P1 historico de Staging con estas pruebas locales.

Archivos de esta microtarea: handler.js y SQL del gateway; workspaceSnapshot.js, useWorkspacePersistence.js, nuevo workspaceClearIntent.js; tests respectivos; nuevo source_file_storage_clear.http.mjs e integracion en concurrent.mjs; ajuste de resume exacto en gateway.local.mjs; este documento y docs/WORKLOG.md. Sin cambios a policies/grants ni al helper canonico de paths.

### Dictamen final de idempotencia y quality gate actual

Suite global: 289 archivos / 2354 tests PASS. Focales: 135 / 9 archivos PASS. Deno check, lint, build, audit:prod, audit:repo y diff-check PASS. PostgreSQL real/HTTP: 13 escenarios PASS; cleanup=0. Todos los checks finalizaron; no cambios de runtime despues de esos checks.

CHIEF CODE AUDITOR independiente cerro el P1: Code Review PASS, Security PASS LOCAL y Adversarial Review PASS. Reprodujo 135 focales y 24 PGlite; agrego 6 checks adversariales de SQL real PGlite PASS (terminal replay conserva snapshot posterior; actor/tenant ajenos, bloqueado y resume inexistente denegados; mismo ID en tenants distintos aislados). Todas sus bases cerradas en finally, cero fixtures persistentes. El auditor reviso el harness HTTP/PG pero no ejecuto personalmente los 13 escenarios TCP/HTTP; esa evidencia es del implementador. P0/P1 abiertos de esta correccion: ninguno confirmado. P2 y Needs Investigation residuales documentados arriba, sin ocultarlos ni ampliar scope.

Typecheck principal: NO DISPONIBLE; Deno check PASS. Lint: PASS. Tests: PASS. Build: PASS. Browser/E2E: NO APLICA al cierre de esta microtarea (contratos hook React y HTTP real verificados; navegador y Auth/Storage/Deno HTTP reales pendientes de la fase de cierre local). Database: PASS LOCAL. RLS: PASS LOCAL. Security: PASS LOCAL. Performance: WARNING (sin medicion nueva; chunk preexistente). Code Review: PASS. Adversarial Review: PASS. Riesgo residual: guard UI hasData, import sin pin y writers/infra reales indicados arriba. Staging/Production mutations: NONE.

QUALITY GATE: PASS WITH WARNINGS

STORAGE CLEAR IDEMPOTENCY - PASS - LISTO PARA CIERRE LOCAL
