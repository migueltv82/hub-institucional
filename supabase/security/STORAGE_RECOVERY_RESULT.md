# Recuperación real de metadata y archivos Storage

Fecha local: 2026-10-13. Resultado de la microtarea: PASS.
Trello: https://trello.com/c/DCKberJX
Ensayo final: 6b229d52bd78edbc. Evidencia sanitizada: STORAGE_RECOVERY_EVIDENCE.json.

Se amplió validateStorageLocalHarness.mjs con un modo recovery explícito y se añadió validateStorageRecovery.mjs como entrada. El modo predeterminado conserva su alcance anterior. La fuente y el destino usan bases creadas con template0 y volúmenes Docker independientes, generados y etiquetados por ejecución. La fuente recibió solo schema-only y bookkeeping Storage del CLI; ningún dato u objeto real. PostgreSQL17.6.1.165 y StorageAPI1.70.7 cacheados, credencial estándar supabase_storage_admin verificada por TCP, sin modificar roles/grants compartidos. Solo HTTP loopback; helpers de archivos sin red.

Fixture real API: un bucket privado y dos archivos sintéticos en prefijos distintos,8192 y16384bytes. Se detuvo Storage antes de ambos backups para congelar escrituras. Backup DB real pg_dump custom738666bytes; archivo tar real del file backend completo32768bytes, incluyendo directorios/versions/permisos. Ambos archives estuvieron solo en memoria y se sobrescribieron al finalizar.

Destino comprobado sin tablas de aplicación y volumen vacío. pg_restore real transaccional, exit-on-error, conservando owners y grants. Tras restaurar la DB, el volumen seguía vacío: la metadata por sí sola no recupera los archivos. Después se extrajo el tar en el volumen destino. Storage destino arrancó y respondió cinco health200,0restarts y proceso running. Las dos descargas API respondieron200 y coincidieron en longitud ySHA256:
- synthetic/file.bin:19a94c5043044a11516f3f8e950be80c0b6722275a5db5afee6dd495039da873
- other-prefix/second.bin:3adcc3029bd21e4314378a7ee195be9f7763adb5718df3510844665b279f0205

Todas las filas de tablas Storage iguales antes/después del restore y nuevamente después del arranque/descargas: UUID, nombres, versiones, tamaños, metadata y65migraciones preservados, sin objetos extra en metadata. Igualdad de schema owners/ACL y catálogo de relaciones/RLS, funciones/EXECUTE, policies, índices, constraints/FKs y triggers. Las63migraciones originales se conservan; la preparación1.70.7 añade las dos conocidas. El restore del destino no agregó migraciones. No se afirma comparación exhaustiva de secuencias, archivos huérfanos fuera de metadata ni S3remoto.

Tiempos observados: backup DB+bytes3415ms; restore DB+bytes13370ms; recuperación hasta segunda descarga39854ms (incluye checks y arranque). RPO del snapshot congelado:0objetos sintéticos perdidos. No son SLA/estimaciones para producción ni un ensayo de actividad concurrente.

El primer intento d67ded0e8af2d3e9 falló durante limpieza API de la fuente porque Docker reasignó el puerto publicado al reiniciarla. No se contabiliza como PASS. Se corrigió reread del puerto y comprobación health acotada; su finally eliminó todos los recursos. El ensayo final exit0, así como el modo predeterminado de regresión exit0, terminaron con cleanup0DB/containers/volumes/files. El contenedor CLI original se preservó. Sin Staging, Production, deploy, SQL remoto, commit ni push.

CHIEF CODE AUDITOR independiente: Code ReviewPASS, AdversarialPASS, sin hallazgosP0/P1/P2/P3 nuevos abiertos. Revisó static finales/cleanup/secretos/aislamiento; no ejecutó personalmente los ensayos. Typecheck:NO DISPONIBLE(JS). Lint:PASS. Tests:PASS2389/294archivos;6focales finalesPASS, incluyendo truncado/corrupción mismo tamaño/mode inválido. Build:PASS y auditprod114archivosPASS. auditrepo:PASS. Dependencias:0high/critical;9moderate1low inventariados. El comando quality:full exit0; después del ajuste focal del puerto yhealth se repitieron lint/tests focales e integraciones finales. Browser/E2E:NO APLICA,StorageAPIrealPASS. Database:PASS. RLS:NO APLICA a autorización de usuarios(service_role);preservación catálogoRLSsíPASS. Security:PASS en alcance local. Performance:WARNING(medición pequeña sin comparación/productivo). Code Review:PASS. AdversarialReview:PASS.

Archivos modificados/creados: scripts/validateStorageLocalHarness.mjs, scripts/validateStorageRecovery.mjs, scripts/validateStorageRecovery.test.js, este informe, STORAGE_RECOVERY_EVIDENCE.json y docs/WORKLOG.md. Cambios preexistentes preservados.

Riesgo residual: terminación abrupta puede impedir finally; fallos parciales no inyectados, no prueba borrado físico seguro previo al rm de volúmenes. Ensayos DB/Auth y Storage separados, no acreditan recuperación integrada Edge/frontend/config/secrets. Pendientes: configuración/secretos,rollback y aceptación integral antes de release. No se atribuye al P1 remoto histórico un cierre con pruebas locales.

Fuentes primarias: https://www.postgresql.org/docs/17/app-pgrestore.html ; https://docs.docker.com/engine/storage/volumes/#back-up-restore-or-migrate-data-volumes ; https://supabase.com/docs/guides/platform/backups .

QUALITY GATE: FAIL (release global pendiente). Recuperación Storage local y quality:full:PASS.
