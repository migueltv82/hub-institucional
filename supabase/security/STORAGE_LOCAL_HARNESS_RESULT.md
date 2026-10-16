# Storage real local — prerrequisito de recuperación

2026-10-13. Resultado: PASS. Run c44560792d15e420. Trello https://trello.com/c/UgFfJIJa

Script nuevo scripts/validateStorageLocalHarness.mjs y tests validateStorageLocalHarness.test.js. PostgreSQL CLI local17.6.1.165, StorageAPI cacheado1.70.7. Contenedor conectado únicamente al Docker local, puerto publicado en loopback y volumen propio identificado por labelrun. DB creada template0, schema-only de CLI, cero usuarios/objetos/buckets iniciales y únicamente historial storage.migrations copiado. Sin copia de datos reales.

Rol TCP verificado: supabase_storage_admin. Credencial obtenida de asignación CLI estándar, sin reset ni ejecución de definición shell. Valores Docker pasados por environment, nunca argumentos/archivos; JWT service_role sintético en memoria. DB_INSTALL_ROLES=false, sin ALTER ROLE ni grants agregados.

Se preservaron las63 migraciones originales fila por fila. Storage1.70.7 agregó IDs63 fix-search-name-relative-to-prefix y64 fix-search-by-timestamp-sqli, total65. Historial estable después de CRUD. Schemaowner/ACL y owners/ACL/RLS de relaciones preexistentes conservados; la fuente no cambió. No se afirma identidad de definiciones de funciones entre versiones.

Servicio healthy:5respuestas200 /status, proceso activo y0restarts. Bucket privado creado mediante API service_role; archivo aleatorio8192bytes subido por API. Descarga autenticada SHA256 fbbd0b67e2fa41bdbb8334b9ec9679d336129bbc75c0974b354f61729d4d32b5 idéntica. MetadataSQL confirma1objeto/bucketprivado. DELETEAPI deja0objetos, DELETEbucket deja0buckets; ownersACL permanecen iguales. Logsstdout+stderr revisados sin42501/28P01 y sin publicar contenido.

Cleanup verificado:0bases,0contenedores,0volúmenes,0archivos temporales del ensayo. Contenedor CLIoriginal preservado. ÉxitoDELETE/metadata0 no prueba borrado físico previo a destruir el volumen; la eliminación del volumen sí está verificada. Terminación abrupta puede impedir finally; no se inyectaron fallos parciales ni se validó S3remoto.

CHIEF CODE AUDITOR: Code ReviewPASS y AdversarialPASS; dos observacionesP2sobre historial corregidas,0hallazgos nuevos pendientes. Ensayo final auditado exit0. quality:full exit0:2385tests/293files;lint/build/auditrepo/auditprod114PASS;0high/critical,9moderate/1low inventariados. Después de assertionsfinales se repitieron lint y2tests focalesPASS; no cambió runtime compartido.

Typecheck:NO DISPONIBLE(JS). Lint:PASS. Tests:PASS. Build:PASS. Browser/E2E:NO APLICA al harness;StorageHTTPrealPASS. Database:PASS. RLS:NO APLICA(service_role); no acredita autorización de usuarios del producto. Security:PASS local en alcance. Performance:NO APLICA, no mejora medida. Code Review:PASS. AdversarialReview:PASS. Archivos de evidencia: este informe, STORAGE_LOCAL_HARNESS_EVIDENCE.json, docs/WORKLOG.md.

Este cierre habilita el ensayo separado de backup/restore de metadata+bytes. No acredita DRStorage, gatewayEdge/frontend, aceptación remota ni release. DB/Auth local ya cerrado. Persisten pendientesglobalesStoragebytes/config/secrets/rollback/aceptación. Staging/Production/deploy/commit/push=NONE.

Fuentes primarias: configuración exacta de imagen https://raw.githubusercontent.com/supabase/storage/v1.70.7/.env.sample ; https://supabase.com/docs/guides/self-hosting/storage/config ; backups DB excluyen bytes https://supabase.com/docs/guides/platform/backups .

QUALITY GATE: FAIL (release global pendiente); comando quality:full localPASS; microtarea StorageharnessPASS.
