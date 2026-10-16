# Recuperación integrada local de DB, Auth y Storage

Fecha de revisión: 2026-10-15. Tarjeta: https://trello.com/c/to6OoXZC . Ensayo c3ba4b53c4cb1636: PASS. Regresiones default/recovery/rollback: PASS secuenciales, cleanup cero en las tres.

Un único snapshot sintético reunió cuatro usuarios docente/alumno de dos instituciones, sus perfiles, membresías y legajos, y dos objetos privados de 8192/16384 bytes. Se aplicó el baseline de nueve SQL únicamente a una base descartable. Los usuarios se crearon mediante GoTrue Admin API; no se copiaron datos reales del CLI.

Antes del backup se detuvieron ambos escritores, Auth y Storage. Se restauraron un archive PostgreSQL custom y un archive de bytes en base y volumen inicialmente vacíos. Todas las filas Auth/public/Storage se compararon antes de los nuevos logins. UUID, relaciones, contenido, catálogo, owners/ACL de schemas y objetos, RLS, policies, funciones, índices, constraints y triggers se preservaron. Después, cuatro cuentas iniciaron sesión conservando identidad y rol, y las dos descargas coincidieron en tamaño y SHA256. Historial Auth completo de 77 entradas y Storage de 65, sin cambios inesperados.

Aislamiento SQL bajo authenticated con claims de cada una de las cuatro cuentas: institución propia visible, cero filas ajenas, cero membresías ajenas y cero actualizaciones ajenas. No se certifica todavía el acceso mediante PostgREST ni navegador. GoTrue y Storage reales sanos con cinco muestras; roles y credenciales estándar locales, JWT efímero en memoria, sin ampliar grants.

Backup: 1393 ms. Restore: 24686 ms. Descargas verificadas: 44716 ms. Recuperación integrada completa: 92864 ms. Son mediciones de fixtures locales pequeños, no SLA productivo. RPO observado: cero pérdida en el snapshot congelado. Archives sobrescritos en memoria y cleanup verificado del ensayo: cero bases, contenedores, volúmenes o archivos temporales propios.

quality:full completo: 2401 tests / 297 archivos, lint, build y auditorías PASS. Cero vulnerabilidades high/critical; nueve moderate y una low inventariadas. La ejecución final limitó trabajadores Vitest a dos mediante entorno del proceso; no se cambiaron tests, assertions, timeouts ni configuración. Un intento anterior falló por espera de un test existente y no se cuenta como PASS. CHIEF independiente confirmó Code Review PASS / Adversarial Review PASS y cero hallazgos P0–P3 nuevos abiertos; revisó guards, export BASELINE y ambos P2 corregidos (schemas ACL e historial Auth completo), sin ejecutar personalmente los ensayos.

El 15 de octubre, Docker estaba apagado y el arranque volvió a fallar por dockerInference inaccesible. Se preservaron dos directorios runtime adicionales, con nombres hub-recovery, y se reinició únicamente Docker. No hubo factory reset, cambios de datos/config persistentes ni reinicio Windows/WSL. Siete directorios diagnósticos externos permanecen preservados en AppData; no se declaran eliminados. El preflight fallido no se cuenta como PASS.

Typecheck: NO DISPONIBLE (JS). Lint: PASS. Tests: PASS. Build: PASS. Browser/E2E: NO APLICA; APIs Auth/Storage reales PASS. Database: PASS local. RLS: PASS SQL local. Security: PASS local. Performance: WARNING (muestra pequeña). Code Review: PASS. Adversarial Review: PASS.

Archivos de implementación: scripts/validateStorageLocalHarness.mjs, scripts/validateGoTrueLocalHarness.mjs (export BASELINE), scripts/validateIntegratedLocalRecovery.mjs y .test.js. Evidencia JSON y este informe; docs/WORKLOG.md al cerrar. Cambios previos preservados. Terminación abrupta puede impedir finally; el ensayo exige snapshot congelado y no certifica escritores concurrentes, S3, Edge, frontend, SMTP/OAuth ni secretos remotos.

Staging/Production/SQL remoto/deploy/commit/push: NONE. QUALITY GATE: FAIL para release global pendiente; prueba funcional integrada y quality:full: PASS.

